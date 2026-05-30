/**
 * runner.cjs — manifest-driven pressure-scenario runner (Plan 33-01).
 *
 * The ROOT engine of Phase 33: every later plan (33-03 scenarios, 33-04 A/B,
 * 33-05 telemetry) builds on this. It loads a parsed pressure-scenario
 * manifest, invokes an agent via an INJECTABLE `invokeAgent(prompt, opts) ->
 * { text }` seam, runs N attempts (default 3), scores each response against
 * the manifest's expected_compliance[] (must-match regexes) and
 * expected_violations[] (failure regexes), applies a STRICT 2/3 majority
 * rule, and emits a structured result.
 *
 * D-03 — invoker-agnostic, NO direct Anthropic SDK dependency:
 *   This file deps on node:fs + node:path ONLY. It NEVER requires the
 *   Anthropic SDK package. The default invoker is the deterministic stub at
 *   ./stub-invoker.cjs so CI/tests run with no API key and no network. A
 *   maintainer later wires a real invoker (peer-CLI ACP spawn or a thin keyed
 *   SDK adapter) by passing opts.invokeAgent. (The guard test asserts the
 *   exact package name never appears in this source.)
 *
 * Purity / injectability:
 *   invokeAgent, the clock (now), and fs are all injectable via opts so every
 *   test drives the stub with a fixed clock.
 *
 * Result (EXACT shape):
 *   {
 *     scenario: string,            // = manifest.name
 *     attempts: Array<{            // one entry per attempt (length === attempts)
 *       text: string,
 *       pass: boolean,             // ALL compliance matched AND zero violations
 *       compliance_hits: number,   // # expected_compliance regexes matching this text
 *       violation_hits: number,    // # expected_violations regexes matching this text
 *     }>,
 *     pass: boolean,               // MAJORITY: (#passing attempts) * 2 > attempts.length
 *     compliance_hits: number,     // aggregate sum across attempts
 *     violation_hits: number,      // aggregate sum across attempts
 *   }
 *
 * Pattern reference (NOT a dependency): scripts/lib/event-chain.cjs shows the
 * house CommonJS idiom (defensive fs, pure functions). Style mirrored, not imported.
 */

'use strict';

const nodeFs = require('node:fs');
const path = require('node:path');

const DEFAULT_ATTEMPTS = 3;

/**
 * Load a pressure-scenario manifest. Accepts either an already-parsed object
 * (returned as-is) or a path to a JSON file (read + parsed via the injectable
 * fs). Keeping this injectable lets later plans (33-03) load real manifest
 * files while tests pass inline objects.
 *
 * @param {object | string} input  parsed manifest OR a path to a JSON manifest
 * @param {{ fs?: typeof import('node:fs') }} [deps]
 * @returns {object} the parsed manifest
 */
function loadManifest(input, deps) {
  if (input && typeof input === 'object') {
    return input;
  }
  if (typeof input === 'string') {
    const fs = (deps && deps.fs) || nodeFs;
    const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
    const raw = fs.readFileSync(abs, 'utf8');
    return JSON.parse(raw);
  }
  throw new TypeError('loadManifest: input must be a parsed manifest object or a path string');
}

/**
 * Compile an array of regex SOURCE strings into RegExp objects. Manifests
 * author patterns as plain strings (NOT pre-compiled) so they stay JSON-safe;
 * the runner owns compilation.
 *
 * @param {unknown} sources
 * @returns {RegExp[]}
 */
function compilePatterns(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.map((src) => new RegExp(String(src)));
}

/**
 * Coerce an invoker's `.text` to a string. A non-string (or absent) value
 * becomes '' so scoring never throws and is treated as a compliance-miss.
 *
 * @param {unknown} response
 * @returns {string}
 */
function textOf(response) {
  if (response && typeof response.text === 'string') return response.text;
  return '';
}

/**
 * Score a single response text against pre-compiled compliance/violation
 * regexes.
 *
 * @param {string} text
 * @param {RegExp[]} complianceRes
 * @param {RegExp[]} violationRes
 * @returns {{ text: string, pass: boolean, compliance_hits: number, violation_hits: number }}
 */
function scoreAttempt(text, complianceRes, violationRes) {
  const compliance_hits = complianceRes.filter((re) => re.test(text)).length;
  const violation_hits = violationRes.filter((re) => re.test(text)).length;
  // An attempt PASSES iff ALL compliance regexes matched AND zero violations did.
  const pass = compliance_hits === complianceRes.length && violation_hits === 0;
  return { text, pass, compliance_hits, violation_hits };
}

/**
 * Run a pressure scenario: invoke the seam N times, score each response, and
 * apply a strict majority rule.
 *
 * @param {object} manifest  parsed pressure-scenario manifest
 *   { name, target_skill, pressures[], setup_prompt, expected_compliance[], expected_violations[] }
 * @param {{
 *   invokeAgent?: (prompt: string, opts: object) => { text: string },
 *   attempts?: number,
 *   now?: () => number,
 *   fs?: typeof import('node:fs'),
 * }} [opts]
 * @returns {{
 *   scenario: string,
 *   attempts: Array<{ text: string, pass: boolean, compliance_hits: number, violation_hits: number }>,
 *   pass: boolean,
 *   compliance_hits: number,
 *   violation_hits: number,
 * }}
 */
function runScenario(manifest, opts) {
  const o = opts || {};
  // D-03: default to the deterministic stub invoker — never the real SDK.
  const invokeAgent = o.invokeAgent || require('./stub-invoker.cjs').invokeAgent;
  const attempts =
    Number.isInteger(o.attempts) && o.attempts > 0 ? o.attempts : DEFAULT_ATTEMPTS;
  // Injectable clock (reserved for future telemetry timestamps; called so the
  // seam is exercised and a fixed now() is honored).
  const now = typeof o.now === 'function' ? o.now : Date.now;

  const complianceRes = compilePatterns(manifest && manifest.expected_compliance);
  const violationRes = compilePatterns(manifest && manifest.expected_violations);
  const scenario = manifest && manifest.name;
  const prompt = (manifest && manifest.setup_prompt) || '';

  const attemptResults = [];
  for (let i = 0; i < attempts; i++) {
    now(); // exercise the injectable clock (deterministic under a fixed now)
    let text = '';
    try {
      // Pass the scenario key through so the stub (or a real invoker) can key on it.
      const response = invokeAgent(prompt, { scenario, attempt: i });
      text = textOf(response);
    } catch (_err) {
      // A thrown invoker must NOT crash the run — record a failed empty attempt.
      text = '';
    }
    attemptResults.push(scoreAttempt(text, complianceRes, violationRes));
  }

  const passed = attemptResults.filter((a) => a.pass).length;
  // STRICT majority: 2/3 and 3/3 pass; 0/3 and 1/3 fail.
  const pass = passed * 2 > attemptResults.length;

  const compliance_hits = attemptResults.reduce((sum, a) => sum + a.compliance_hits, 0);
  const violation_hits = attemptResults.reduce((sum, a) => sum + a.violation_hits, 0);

  return {
    scenario,
    attempts: attemptResults,
    pass,
    compliance_hits,
    violation_hits,
  };
}

module.exports = {
  runScenario,
  loadManifest,
  // Exposed for unit-level reuse / later plans; not part of the core contract.
  scoreAttempt,
  compilePatterns,
  DEFAULT_ATTEMPTS,
};
