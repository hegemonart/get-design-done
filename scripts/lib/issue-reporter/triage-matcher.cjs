/**
 * scripts/lib/issue-reporter/triage-matcher.cjs — Plan 30-03
 *
 * Phase 30 triage gate. Pure module consulted by the report-issue skill
 * (Plan 30-04) BEFORE the consent prompt. If a catalogued failure mode
 * matches the user's error, the gate surfaces "this looks like X — try
 * Y" and exits the report flow without prompting (D-07). --force-report
 * bypasses the gate but still requires consent (D-11).
 *
 *   matchKnownFailure(errorContext) → { matched: false }
 *                                   | { matched: true, modeId, diagnosis, remedy, severity, propose_report }
 *
 * Inputs (errorContext shape; subset; only these fields are consulted):
 *   - message: string  (error.message)
 *   - stack:   string  (error.stack; may be undefined)
 *   - command: string  (optional; reserved for future enrichment, not matched today)
 *
 * Pattern application:
 *   - Compile entry.pattern as `new RegExp(pattern)` (no flags assumed).
 *   - Test against `[errorContext.message, errorContext.stack].filter(Boolean).join("\n")`.
 *   - First entry whose regex tests true wins. File order is authoritative.
 *
 * Resilience guarantees (proven by tests/triage-matcher.test.cjs):
 *   - Invalid regex inside the catalogue → skip + warn once, NEVER throw.
 *   - Missing / unparseable catalogue file → return { matched: false }, warn once, NEVER throw.
 *   - Malformed errorContext (null, missing fields, wrong types) → return { matched: false }.
 *   - No process.exit, no network I/O, no writes to .design/ or reference/.
 *
 * Test-injection helpers (NOT for production use; underscore-prefixed):
 *   - __setCataloguePath(absPath): override the catalogue path (also via
 *     GDD_KNOWN_FAILURE_MODES_PATH env var; explicit setter wins).
 *   - __resetCache(): clear the parsed-catalogue cache (forces a re-read on next call).
 *
 * Conforms to D-07 (gate runs before issue prompt), D-11 (propose_report
 * flag round-trips so 30-04 can gate --report on the whitelist), D-13
 * (tests use synthetic fixtures only), D-14 (no payload assembly).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SEVERITIES = new Set(['low', 'medium', 'high']);

/** Resolve the repo root by walking up from this file until a package.json is found. */
function findRepoRoot() {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to three-up (scripts/lib/issue-reporter -> repo root).
  return path.resolve(__dirname, '..', '..', '..');
}

const DEFAULT_CATALOGUE_PATH = path.join(
  findRepoRoot(),
  'reference',
  'known-failure-modes.md'
);

let _cataloguePathOverride = null;
let _entriesCache = null;
let _missingCatalogueWarned = false;

/** Resolve the catalogue path: explicit setter > env var > default. */
function resolveCataloguePath() {
  if (typeof _cataloguePathOverride === 'string' && _cataloguePathOverride.length > 0) {
    return _cataloguePathOverride;
  }
  const envOverride = process.env.GDD_KNOWN_FAILURE_MODES_PATH;
  if (typeof envOverride === 'string' && envOverride.length > 0) {
    return envOverride;
  }
  return DEFAULT_CATALOGUE_PATH;
}

/**
 * Extract every fenced ```yaml block from a markdown string and parse
 * each as a flat key:value mapping (single-level, no nesting). Invalid
 * entries (missing required fields, bad severity, bad regex) are dropped
 * with a one-line console.warn referencing the entry id.
 *
 * Matches the codebase YAML-from-markdown convention used by
 * scripts/lib/domain-primitives/nng.cjs.
 *
 * @param {string} markdown
 * @returns {Array<{id:string, pattern:string, diagnosis:string, remedy:string, severity:string, propose_report?:boolean, regex:RegExp}>}
 */
function parseEntries(markdown) {
  const out = [];
  const re = /```yaml\s*\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const body = m[1];
    /** @type {Record<string,string>} */
    const fields = {};
    for (const line of body.split(/\r?\n/)) {
      const kv = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/);
      if (!kv) continue;
      let v = kv[2];
      // Strip surrounding single or double quotes — matches nng.cjs handling.
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        v = v.slice(1, -1);
        // Unescape doubled-single-quotes (YAML single-quoted-scalar convention).
        v = v.replace(/''/g, "'");
      }
      fields[kv[1]] = v;
    }
    // Required-field guard — skip silently if not a real entry (e.g. unrelated yaml block).
    if (!fields.id || !fields.pattern || !fields.diagnosis || !fields.remedy || !fields.severity) {
      continue;
    }
    if (!SEVERITIES.has(fields.severity)) {
      console.warn(
        `[triage-matcher] skip ${fields.id}: invalid severity '${fields.severity}' (expected low|medium|high)`
      );
      continue;
    }
    let regex;
    try {
      regex = new RegExp(fields.pattern);
    } catch (e) {
      console.warn(
        `[triage-matcher] skip ${fields.id}: invalid regex (${e && e.message ? e.message : 'compile error'})`
      );
      continue;
    }
    const proposeReport = fields.propose_report === 'true';
    out.push({
      id: fields.id,
      pattern: fields.pattern,
      diagnosis: fields.diagnosis,
      remedy: fields.remedy,
      severity: fields.severity,
      propose_report: proposeReport,
      regex,
    });
  }
  return out;
}

/** Load + cache the entry list. On any load failure, returns []. */
function loadEntries() {
  if (_entriesCache !== null) return _entriesCache;
  const file = resolveCataloguePath();
  let md;
  try {
    md = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (!_missingCatalogueWarned) {
      _missingCatalogueWarned = true;
      console.warn(
        `[triage-matcher] catalogue unreadable at ${file}: ${e && e.message ? e.message : 'read error'}`
      );
    }
    _entriesCache = [];
    return _entriesCache;
  }
  try {
    _entriesCache = parseEntries(md);
  } catch (e) {
    // parseEntries() itself does not throw under any tested path, but guard anyway
    // — never let an upstream surprise propagate out of matchKnownFailure.
    console.warn(
      `[triage-matcher] catalogue parse failed at ${file}: ${e && e.message ? e.message : 'parse error'}`
    );
    _entriesCache = [];
  }
  return _entriesCache;
}

/**
 * @param {{message?: string, stack?: string, command?: string} | null | undefined} errorContext
 * @returns {{matched: false} | {matched: true, modeId: string, diagnosis: string, remedy: string, severity: string, propose_report: boolean}}
 */
function matchKnownFailure(errorContext) {
  // Tolerate any input shape — return {matched:false} rather than throw.
  if (!errorContext || typeof errorContext !== 'object') return { matched: false };

  const msg = typeof errorContext.message === 'string' ? errorContext.message : '';
  const stk = typeof errorContext.stack === 'string' ? errorContext.stack : '';
  const haystack = [msg, stk].filter(Boolean).join('\n');
  if (haystack.length === 0) return { matched: false };

  let entries;
  try {
    entries = loadEntries();
  } catch {
    // Defensive — loadEntries already guards every IO path.
    return { matched: false };
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return { matched: false };
  }

  for (const e of entries) {
    let hit;
    try {
      hit = e.regex.test(haystack);
    } catch {
      // RegExp.test should not throw on string input, but guard anyway.
      continue;
    }
    if (hit) {
      return {
        matched: true,
        modeId: e.id,
        diagnosis: e.diagnosis,
        remedy: e.remedy,
        severity: e.severity,
        propose_report: e.propose_report === true,
      };
    }
  }
  return { matched: false };
}

/** Test helper — override the catalogue path. */
function __setCataloguePath(absPath) {
  _cataloguePathOverride = absPath;
}

/** Test helper — clear the parsed-catalogue cache. */
function __resetCache() {
  _entriesCache = null;
  _missingCatalogueWarned = false;
}

module.exports = {
  matchKnownFailure,
  // Underscore-prefixed test injection helpers; not part of the public API.
  __setCataloguePath,
  __resetCache,
  // Exported for higher-level consumers that may want to introspect the
  // catalogue without invoking match logic. Internal use only.
  _parseEntries: parseEntries,
};
