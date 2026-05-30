'use strict';
/**
 * Plan 30-03 — triage-matcher unit tests.
 *
 * Covers:
 *   - Matched-per-seed-mode (KFM-001..KFM-005) → returns {matched:true, modeId, ...}.
 *   - Unmatched input → {matched:false}, no diagnosis/remedy fields.
 *   - Invalid regex inside one catalogue entry → skipped + warn, downstream entries
 *     still evaluated; matcher never throws.
 *   - First-match-wins — two patterns that both hit return the first by file order.
 *   - Missing catalogue file → {matched:false}, warn-once, no throw.
 *   - Cache reset behaviour — switching catalogue paths between calls is observable.
 *   - propose_report flag round-trips through the match result (D-11 whitelist seed).
 *
 * Synthetic fixtures only — NO writes to reference/, NO writes to .design/,
 * NO live gh calls. Per Phase 30 D-13.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  matchKnownFailure,
  __setCataloguePath,
  __resetCache,
} = require('../../scripts/lib/issue-reporter/triage-matcher.cjs');

const FIXT = (name) => path.join(__dirname, 'fixtures', 'triage-matcher', name);
const REPO_KFM = path.join(__dirname, '../..', 'reference', 'known-failure-modes.md');

/** Silence console.warn for a single function call; return the captured warnings. */
function captureWarn(fn) {
  const original = console.warn;
  const captured = [];
  console.warn = (...args) => { captured.push(args.map(String).join(' ')); };
  try {
    return { result: fn(), warnings: captured };
  } finally {
    console.warn = original;
  }
}

/** Reset module cache + point matcher at a chosen fixture before each test. */
function useCatalogue(filename) {
  __resetCache();
  __setCataloguePath(FIXT(filename));
}

test('30-03 T01: KFM-001 matches EACCES on .design/ writes (real catalogue)', () => {
  __resetCache();
  __setCataloguePath(REPO_KFM);
  const r = matchKnownFailure({
    message: "EACCES: permission denied, open '.design/STATE.md'",
    stack: 'Error: EACCES: permission denied\n    at writeFile',
  });
  assert.equal(r.matched, true);
  assert.equal(r.modeId, 'KFM-001');
  assert.equal(typeof r.diagnosis, 'string');
  assert.equal(typeof r.remedy, 'string');
  assert.equal(r.severity, 'medium');
});

test('30-03 T02: KFM-002 matches missing gh CLI (real catalogue)', () => {
  __resetCache();
  __setCataloguePath(REPO_KFM);
  const r = matchKnownFailure({
    message: "Error: spawn gh ENOENT",
    stack: 'Error: spawn gh ENOENT\n    at ChildProcess._handle.onexit',
  });
  assert.equal(r.matched, true);
  assert.equal(r.modeId, 'KFM-002');
  assert.equal(r.severity, 'low');
});

test('30-03 T03: KFM-003 matches Node engine mismatch (real catalogue)', () => {
  __resetCache();
  __setCataloguePath(REPO_KFM);
  const r = matchKnownFailure({
    message: 'SyntaxError: Unexpected token (Unsupported engine "node")',
    stack: '',
  });
  assert.equal(r.matched, true);
  assert.equal(r.modeId, 'KFM-003');
  assert.equal(r.severity, 'high');
});

test('30-03 T04: KFM-004 matches missing FIGMA_TOKEN (real catalogue)', () => {
  __resetCache();
  __setCataloguePath(REPO_KFM);
  const r = matchKnownFailure({
    message: 'FIGMA_TOKEN not set; aborting.',
    stack: '',
  });
  assert.equal(r.matched, true);
  assert.equal(r.modeId, 'KFM-004');
  assert.equal(r.severity, 'medium');
});

test('30-03 T05: KFM-005 matches dirty git working tree (real catalogue)', () => {
  __resetCache();
  __setCataloguePath(REPO_KFM);
  const r = matchKnownFailure({
    message: 'fatal: working tree is not clean — refusing to advance phase.',
    stack: '',
  });
  assert.equal(r.matched, true);
  assert.equal(r.modeId, 'KFM-005');
  assert.equal(r.severity, 'low');
});

test('30-03 T06: unmatched error returns {matched:false} with no diagnosis/remedy', () => {
  __resetCache();
  __setCataloguePath(REPO_KFM);
  const r = matchKnownFailure({
    message: '__never_match_this_unique_token_zzz__',
    stack: '__also_no_match__',
  });
  assert.equal(r.matched, false);
  assert.equal(r.modeId, undefined);
  assert.equal(r.diagnosis, undefined);
  assert.equal(r.remedy, undefined);
  assert.equal(r.severity, undefined);
});

test('30-03 T07: invalid regex inside catalogue is skipped + warn, valid entry still matches', () => {
  useCatalogue('invalid-pattern.md');
  const { result, warnings } = captureWarn(() =>
    matchKnownFailure({
      message: 'this line contains a recoverable token clearly',
      stack: '',
    })
  );
  assert.equal(result.matched, true);
  assert.equal(result.modeId, 'FX-GOOD');
  // At least one warn about the bad entry — referencing the bad id or pattern reason.
  assert.ok(
    warnings.some((w) => w.includes('FX-BAD')),
    `expected a warn for FX-BAD entry; got warnings: ${JSON.stringify(warnings)}`
  );
});

test('30-03 T08: invalid regex never crashes the matcher (resilience guarantee)', () => {
  useCatalogue('invalid-pattern.md');
  // Input that does NOT match the good entry — matcher must still return false, never throw.
  const { result } = captureWarn(() =>
    matchKnownFailure({ message: 'completely unrelated', stack: '' })
  );
  assert.equal(result.matched, false);
});

test('30-03 T09: first-match-wins — earlier entry returned even when later also matches', () => {
  useCatalogue('ordering.md');
  // Input contains "overlap-too" which matches BOTH patterns ("overlap" and "overlap-too").
  // Matcher must return FX-FIRST (file order), not FX-SECOND.
  const r = matchKnownFailure({
    message: 'log line: overlap-too marker',
    stack: '',
  });
  assert.equal(r.matched, true);
  assert.equal(r.modeId, 'FX-FIRST');
  assert.equal(r.severity, 'medium');
});

test('30-03 T10: missing catalogue file → {matched:false} + warn, no throw', () => {
  __resetCache();
  __setCataloguePath(path.join(__dirname, 'fixtures', 'triage-matcher', '__does_not_exist__.md'));
  const { result, warnings } = captureWarn(() =>
    matchKnownFailure({ message: 'any error', stack: 'any stack' })
  );
  assert.equal(result.matched, false);
  assert.ok(warnings.length >= 1, 'expected at least one warning when catalogue is missing');
});

test('30-03 T11: empty catalogue file → {matched:false} for any input', () => {
  useCatalogue('empty.md');
  const r = matchKnownFailure({ message: 'whatever', stack: 'wherever' });
  assert.equal(r.matched, false);
});

test('30-03 T12: matcher consults both message and stack as a joined haystack', () => {
  useCatalogue('ok.md');
  // Pattern only present in stack — match must still fire.
  const r = matchKnownFailure({
    message: 'opaque outer error',
    stack: 'Error: opaque outer error\n    at writer (fs.js: EACCES: permission denied opening .design/x)',
  });
  assert.equal(r.matched, true);
  assert.equal(r.modeId, 'FX-001');
});

test('30-03 T13: undefined stack is tolerated (errorContext.stack may be omitted)', () => {
  useCatalogue('ok.md');
  const r = matchKnownFailure({ message: 'spawn gh ENOENT', stack: undefined });
  assert.equal(r.matched, true);
  assert.equal(r.modeId, 'FX-002');
});

test('30-03 T14: matchKnownFailure does NOT throw on malformed errorContext', () => {
  useCatalogue('ok.md');
  // Pass garbage — must NOT throw. Result is {matched:false}.
  for (const bad of [null, undefined, {}, { message: 123 }, 'not an object', 42]) {
    const r = matchKnownFailure(bad);
    assert.equal(r.matched, false, `expected {matched:false} for ${JSON.stringify(bad)}`);
  }
});

test('30-03 T15: propose_report flag round-trips on the real catalogue (D-11 whitelist seed)', () => {
  __resetCache();
  __setCataloguePath(REPO_KFM);
  // KFM-008 (MCP server unreachable) is one of the propose_report:true seed entries.
  const r = matchKnownFailure({
    message: 'MCP server unreachable: ECONNREFUSED 127.0.0.1:7777',
    stack: '',
  });
  assert.equal(r.matched, true);
  assert.equal(r.modeId, 'KFM-008');
  // propose_report exposure on the match result is advisory; matcher MUST surface it
  // so Plan 30-04 can gate the --report whitelist on it.
  assert.equal(r.propose_report, true, 'expected propose_report:true to round-trip for KFM-008');
});

test('30-03 T16: __resetCache forces a fresh catalogue read (cache invalidation observable)', () => {
  useCatalogue('ok.md');
  const r1 = matchKnownFailure({ message: 'spawn gh ENOENT', stack: '' });
  assert.equal(r1.modeId, 'FX-002');
  // Switch to empty catalogue WITHOUT resetting first — caller is responsible for the order,
  // so we test the explicit reset path:
  __resetCache();
  __setCataloguePath(FIXT('empty.md'));
  const r2 = matchKnownFailure({ message: 'spawn gh ENOENT', stack: '' });
  assert.equal(r2.matched, false);
});
