'use strict';

// tests/quality-gate-detection.test.cjs — Phase 25 Plan 25-09 surface test.
//
// Asserts the quality-gate detection chain (skills/quality-gate/SKILL.md
// Step 1, D-06) — encoded into scripts/lib/quality-gate-detect.cjs by
// Plan 25-09 task 3 ("promote the auto-detect logic from doc-only into
// a module"). Three branches:
//
//   Tier 1 — `.design/config.json#quality_gate.commands` overrides
//            auto-detect when present and non-empty.
//   Tier 2 — Auto-detect from `package.json#scripts` keys against the
//            allowlist (lint, typecheck/tsc, test, chromatic, test:visual)
//            with `test:e2e` excluded by name.
//   Tier 3 — Skip-with-notice when nothing resolves.
//
// The module is pure (no I/O, no clock); we exercise it directly with
// inline-constructed config + scripts objects. No tempdir, no spawn —
// the doc-level contract is the function signature, and that's what we
// verify here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const detect = require(path.join(REPO_ROOT, 'scripts', 'lib', 'quality-gate-detect.cjs'));

test('25-09 quality-gate-detection: module exports the expected surface', () => {
  assert.equal(typeof detect.detect, 'function', 'detect() must be exported');
  assert.equal(typeof detect.autoDetect, 'function', 'autoDetect() must be exported');
  assert.ok(Array.isArray(detect.ALLOWLIST), 'ALLOWLIST must be exported as an array');
  assert.ok(Array.isArray(detect.ALWAYS_EXCLUDED), 'ALWAYS_EXCLUDED must be exported as an array');
});

test('25-09 quality-gate-detection: ALLOWLIST contains the canonical script names', () => {
  // Per skills/quality-gate/SKILL.md Step 1 Tier 2 table:
  //   lint, typecheck (or tsc), test, chromatic, test:visual.
  for (const name of ['lint', 'typecheck', 'test', 'chromatic', 'test:visual']) {
    assert.ok(detect.ALLOWLIST.includes(name), `ALLOWLIST must contain "${name}"`);
  }
});

test('25-09 quality-gate-detection: ALWAYS_EXCLUDED includes test:e2e', () => {
  assert.ok(
    detect.ALWAYS_EXCLUDED.includes('test:e2e'),
    'test:e2e must be hard-excluded per D-06 (too slow for Stage 4.5)',
  );
});

test('25-09 quality-gate-detection: Tier 2 — auto-detects lint/typecheck/test/chromatic from package.json#scripts', () => {
  const scripts = {
    lint: 'eslint .',
    typecheck: 'tsc --noEmit',
    test: 'node --test',
    'test:e2e': 'playwright test',
    chromatic: 'chromatic --exit-zero-on-changes',
  };
  const result = detect.detect({ configCommands: null, scripts });
  assert.equal(result.tier, 2, 'tier must be 2 when config is empty and scripts populate the allowlist');
  assert.deepEqual(
    result.commands,
    [
      'npm run lint',
      'npm run typecheck',
      'npm run test',
      'npm run chromatic',
    ],
    'detected commands must match the allowlist intersection (test:e2e excluded)',
  );
});

test('25-09 quality-gate-detection: Tier 2 — substitutes "tsc" when "typecheck" is absent', () => {
  const scripts = {
    lint: 'eslint .',
    tsc: 'tsc --noEmit',
    test: 'node --test',
  };
  const result = detect.detect({ configCommands: null, scripts });
  assert.equal(result.tier, 2);
  assert.deepEqual(
    result.commands,
    ['npm run lint', 'npm run tsc', 'npm run test'],
    '"tsc" substitutes for "typecheck" when only "tsc" is present',
  );
});

test('25-09 quality-gate-detection: Tier 2 — prefers "typecheck" when both "typecheck" and "tsc" are present', () => {
  const scripts = {
    typecheck: 'tsc --noEmit',
    tsc: 'tsc --noEmit',
  };
  const result = detect.detect({ configCommands: null, scripts });
  assert.deepEqual(
    result.commands,
    ['npm run typecheck'],
    '"typecheck" wins over "tsc" when both exist (no duplicate)',
  );
});

test('25-09 quality-gate-detection: Tier 1 — config.commands overrides auto-detect when present', () => {
  const configCommands = ['npm run custom-lint', 'pnpm run my-typecheck', 'yarn jest'];
  const scripts = { lint: 'eslint .', test: 'jest' };
  const result = detect.detect({ configCommands, scripts });
  assert.equal(result.tier, 1, 'tier must be 1 when config.commands is non-empty');
  assert.deepEqual(
    result.commands,
    configCommands,
    'config.commands must override auto-detect verbatim',
  );
});

test('25-09 quality-gate-detection: Tier 1 — empty config.commands array falls through to Tier 2', () => {
  const result = detect.detect({
    configCommands: [],
    scripts: { lint: 'eslint .' },
  });
  assert.equal(result.tier, 2, 'empty config.commands must NOT short-circuit Tier 1');
  assert.deepEqual(result.commands, ['npm run lint']);
});

test('25-09 quality-gate-detection: Tier 3 — empty package.json#scripts triggers skip-with-notice', () => {
  const result = detect.detect({ configCommands: null, scripts: {} });
  assert.equal(result.tier, 3, 'empty scripts must resolve to Tier 3');
  assert.deepEqual(result.commands, [], 'Tier 3 returns no commands');
  assert.equal(result.reason, 'no commands resolved');
});

test('25-09 quality-gate-detection: Tier 3 — null scripts triggers skip-with-notice', () => {
  const result = detect.detect({ configCommands: null, scripts: null });
  assert.equal(result.tier, 3);
  assert.deepEqual(result.commands, []);
});

test('25-09 quality-gate-detection: Tier 3 — scripts with only excluded names triggers skip', () => {
  const result = detect.detect({
    configCommands: null,
    scripts: {
      'test:e2e': 'playwright test',
      'dev:server': 'next dev',
      build: 'next build',
    },
  });
  assert.equal(result.tier, 3, 'no allowlisted hits + only-excluded names → Tier 3');
});

test('25-09 quality-gate-detection: skill SKILL.md timeout-and-failure semantics are documented', () => {
  // Plan 25-09 acceptance also asks: "Quality-gate timeout warns + proceeds
  // (does not block); failure marks STATE block fail and verify entry
  // refuses." Those are SKILL-level rules (skills/quality-gate/SKILL.md
  // Step 2 timeout branch + Step 4 fix-loop exhaustion); assert at the
  // content level that both rules are documented (the exact behavior is
  // covered by gdd-state-quality-gate.test.ts at the parser/serializer
  // level and by the verify-entry doc check elsewhere).
  const skillPath = path.join(REPO_ROOT, 'skills', 'quality-gate', 'SKILL.md');
  const md = fs.readFileSync(skillPath, 'utf8');
  assert.match(
    md,
    /timeout[^.\n]*(warn|proceed|exit successfully|non-blocking)/i,
    'quality-gate SKILL must document warn-and-proceed on timeout (D-07)',
  );
  assert.match(
    md,
    /status="?fail"?[^.\n]*verify[^.\n]*refuse|verify[^.\n]*refuse[^.\n]*fail|verify entry refuses[^.\n]*fail/i,
    'quality-gate SKILL must document verify-entry refusal on status=fail (D-08)',
  );
});
