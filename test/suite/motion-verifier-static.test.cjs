'use strict';
// Phase 36.2 — motion-verifier agent static contract. Structural assertions on
// agents/motion-verifier.md (no live run, D-06): it discovers Lottie/Rive exports, runs
// the pure validate-motion.cjs, enforces a perf budget, and WARNs — never blocks (D-02).
// Hermetic: file reads only. Every test tagged `36.2-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const A = fs.readFileSync(path.join(REPO_ROOT, 'agents', 'motion-verifier.md'), 'utf8');
const fm = A.split('---')[1] || '';

test('36.2-03: motion-verifier frontmatter — name, reads-only, tools', () => {
  assert.match(fm, /name:\s*motion-verifier/, 'name');
  assert.match(fm, /reads-only:\s*true/, 'reads-only');
  for (const tool of ['Read', 'Bash', 'Grep', 'Glob']) {
    assert.match(fm, new RegExp(`\\b${tool}\\b`), `tools includes ${tool}`);
  }
});

test('36.2-03: uses the pure validate-motion helper', () => {
  assert.match(A, /scripts\/lib\/motion\/validate-motion\.cjs/, 'references validate-motion.cjs');
  assert.match(A, /validateLottie/, 'calls validateLottie');
  assert.match(A, /MO-(FR|DUR|BUDGET)/, 'maps the MO-* rules');
});

test('36.2-03: discovers both Lottie and Rive exports', () => {
  assert.match(A, /\*\.json/, 'finds Lottie JSON');
  assert.match(A, /\*\.riv/, 'finds Rive .riv');
  assert.match(A, /RIVE/, 'mentions the RIVE magic header');
});

test('36.2-03: WARN — never block (D-02)', () => {
  assert.match(A, /never block/i, 'states never-block');
  assert.match(A, /must_have/, 'the only escalation is an explicit must_have');
});

test('36.2-03: enforces a perf budget from config', () => {
  assert.match(A, /motion_budget_kb/, 'reads motion_budget_kb');
  assert.match(A, /200\s*KB|DEFAULT_BUDGET_BYTES/, 'documents the 200KB fallback');
});

test('36.2-03: cross-links the two connection specs + emits a completion marker', () => {
  assert.match(A, /connections\/lottie\.md/, 'links lottie.md');
  assert.match(A, /connections\/rive\.md/, 'links rive.md');
  assert.match(A, /##\s*MOTION VERIFICATION COMPLETE/, 'completion marker');
});

test('36.2-03: design-verifier delegates motion verification (Phase 4E)', () => {
  const v = fs.readFileSync(path.join(REPO_ROOT, 'agents', 'design-verifier.md'), 'utf8');
  assert.match(v, /Motion Verification/i, 'has a Motion Verification phase');
  assert.match(v, /motion-verifier/, 'delegates to motion-verifier');
});
