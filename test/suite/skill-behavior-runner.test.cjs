'use strict';
// test/suite/skill-behavior-runner.test.cjs — Phase 33 Plan 01 (Wave A.1)
//
// Structural (hermetic) tests for the pressure-scenario runner
// scripts/lib/skill-behavior/runner.cjs. The runner invokes an INJECTABLE
// invokeAgent(prompt, opts) -> { text } seam (D-03 — NO @anthropic-ai/sdk),
// runs N attempts (default 3), scores each response against the manifest's
// expected_compliance[] / expected_violations[] regex SOURCE strings, and
// applies a strict 2/3 majority rule.
//
// Per D-06 these tests are DEFAULT-SUITE structural tests: they drive a STUB
// invoker only (an inline closure over a per-attempt response array, or the
// stub-invoker module default) and NEVER require a live LLM or
// ANTHROPIC_API_KEY. Per-attempt variation is driven by attempt INDEX, not
// randomness, so the four verdicts (pass / fail / 2-of-3 / 1-of-3) are
// deterministic.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

const { runScenario } = require('../../scripts/lib/skill-behavior/runner.cjs');

// --- Inline fixture manifest (no schema needed yet — 33-02 adds the schema).
// expected_compliance / expected_violations are regex SOURCE strings, compiled
// by the runner with new RegExp(src).
function fixtureManifest() {
  return {
    name: 'runner-fixture',
    target_skill: 'brief',
    pressures: ['time'],
    setup_prompt: 'Ship the design by EOD; skip the brief and just start.',
    expected_compliance: ['HARD-GATE', 'brief'],
    expected_violations: ['proceeding to explore'],
  };
}

// --- Canned response strings used to drive per-attempt variation by index.
// COMPLIANT matches BOTH compliance regexes and NEITHER violation regex.
const COMPLIANT =
  'A <HARD-GATE> blocks me here — I must write the brief before any other stage.';
// VIOLATION matches a violation regex (so the attempt fails regardless of compliance).
const VIOLATION =
  'Skipping the brief and proceeding to explore right away to hit the deadline.';
// NEUTRAL_MISS matches neither all compliance nor any violation (a compliance-miss).
const NEUTRAL_MISS = 'Sure, let me think about the design for a moment.';

// Build an inline invokeAgent that returns responses[i] for the i-th call,
// reusing the last entry if more attempts than responses are requested.
function indexedInvoker(responses) {
  let i = 0;
  return function invokeAgent(_prompt, _opts) {
    const text = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return { text };
  };
}

const FIXED_NOW = () => 0;

test('33-01: clean pass — all compliance match, no violation', () => {
  const result = runScenario(fixtureManifest(), {
    invokeAgent: indexedInvoker([COMPLIANT, COMPLIANT, COMPLIANT]),
    attempts: 3,
    now: FIXED_NOW,
  });
  // Exact result shape.
  assert.equal(result.scenario, 'runner-fixture');
  assert.ok(Array.isArray(result.attempts));
  assert.equal(result.attempts.length, 3);
  assert.equal(result.pass, true);
  // Every attempt passes; 2 compliance regexes * 3 attempts = 6 aggregate hits.
  assert.ok(result.attempts.every((a) => a.pass === true));
  assert.equal(result.compliance_hits, 6);
  assert.equal(result.violation_hits, 0);
  // Per-attempt detail shape.
  for (const a of result.attempts) {
    assert.equal(typeof a.text, 'string');
    assert.equal(typeof a.pass, 'boolean');
    assert.equal(a.compliance_hits, 2);
    assert.equal(a.violation_hits, 0);
  }
});

test('33-01: fail — a violation regex matches', () => {
  const result = runScenario(fixtureManifest(), {
    invokeAgent: indexedInvoker([VIOLATION, VIOLATION, VIOLATION]),
    attempts: 3,
    now: FIXED_NOW,
  });
  assert.equal(result.scenario, 'runner-fixture');
  assert.equal(result.attempts.length, 3);
  assert.equal(result.pass, false);
  assert.ok(result.attempts.every((a) => a.pass === false));
  assert.ok(result.violation_hits >= 3);
});

test('33-01: 2-of-3 majority pass', () => {
  // Attempts 0,1 compliant; attempt 2 non-compliant (violation) -> majority pass.
  const result = runScenario(fixtureManifest(), {
    invokeAgent: indexedInvoker([COMPLIANT, COMPLIANT, VIOLATION]),
    attempts: 3,
    now: FIXED_NOW,
  });
  assert.equal(result.attempts.length, 3);
  assert.equal(result.pass, true);
  const failed = result.attempts.filter((a) => a.pass === false);
  assert.equal(failed.length, 1, 'exactly one attempt should fail');
});

test('33-01: 1-of-3 flake -> overall fail', () => {
  // Only attempt 0 compliant; attempts 1,2 non-compliant -> minority -> fail.
  const result = runScenario(fixtureManifest(), {
    invokeAgent: indexedInvoker([COMPLIANT, VIOLATION, VIOLATION]),
    attempts: 3,
    now: FIXED_NOW,
  });
  assert.equal(result.attempts.length, 3);
  assert.equal(result.pass, false);
  const passed = result.attempts.filter((a) => a.pass === true);
  assert.equal(passed.length, 1, 'exactly one attempt should pass (the flake is visible)');
});

test('33-01: a compliance-miss (not all compliance match) fails the attempt', () => {
  // NEUTRAL_MISS matches neither compliance regex and no violation -> attempt fails
  // because NOT ALL expected_compliance matched, even with zero violations.
  const result = runScenario(fixtureManifest(), {
    invokeAgent: indexedInvoker([NEUTRAL_MISS, NEUTRAL_MISS, NEUTRAL_MISS]),
    attempts: 3,
    now: FIXED_NOW,
  });
  assert.equal(result.pass, false);
  assert.ok(result.attempts.every((a) => a.pass === false));
  assert.equal(result.violation_hits, 0, 'no violations matched');
});

test('33-01: falls back to the stub-invoker default when opts.invokeAgent is absent', () => {
  // With no invokeAgent supplied the runner MUST use the stub-invoker default
  // and still return a well-formed result of the exact shape — never throw.
  const result = runScenario(fixtureManifest(), { attempts: 3, now: FIXED_NOW });
  assert.equal(result.scenario, 'runner-fixture');
  assert.ok(Array.isArray(result.attempts));
  assert.equal(result.attempts.length, 3);
  assert.equal(typeof result.pass, 'boolean');
  assert.equal(typeof result.compliance_hits, 'number');
  assert.equal(typeof result.violation_hits, 'number');
});

test('33-01: runner adds NO @anthropic-ai/sdk dependency (D-03)', () => {
  // (a) The package is absent from package.json deps + devDependencies.
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  );
  const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  assert.ok(
    !allDeps['@anthropic-ai/sdk'],
    '@anthropic-ai/sdk must NOT be a dependency (D-03 — injectable invoker, no SDK dep)',
  );
  // (b) The runner source does not require('@anthropic-ai/sdk').
  const runnerSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'lib', 'skill-behavior', 'runner.cjs'),
    'utf8',
  );
  assert.ok(
    !/@anthropic-ai\/sdk/.test(runnerSrc),
    'runner.cjs must NOT reference @anthropic-ai/sdk (D-03)',
  );
});
