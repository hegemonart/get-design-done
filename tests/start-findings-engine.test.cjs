'use strict';

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const test = require('node:test');

const { scan, qualifiesAsSafeFix, pickBestFirstProof } = require('../scripts/lib/start-findings-engine.cjs');

const VITE_FIXTURE = path.resolve(
  __dirname,
  '..',
  'test-fixture',
  'src',
  'ui-detection',
  'vite-src',
  'src',
  'components'
);

test('scan returns ≤3 findings on vite fixture', () => {
  const r = scan({ root: VITE_FIXTURE, budget: 'fast', rootCwd: process.cwd() });
  assert.ok(Array.isArray(r.findings));
  assert.ok(r.findings.length >= 2, 'at least two seeded findings should fire');
  assert.ok(r.findings.length <= 3, 'top-3 cap must hold');
});

test('scan picks exactly one best_first_proof when safe candidates exist', () => {
  const r = scan({ root: VITE_FIXTURE, budget: 'fast', rootCwd: process.cwd() });
  assert.ok(typeof r.bestFirstProofId === 'string');
  assert.match(r.bestFirstProofId, /^F\d+$/);
  const match = r.findings.find((f) => f.id === r.bestFirstProofId);
  assert.ok(match, 'best_first_proof must reference one of the emitted findings');
});

test('scan is deterministic across repeated runs on the same fixture', () => {
  const a = scan({ root: VITE_FIXTURE, budget: 'fast', rootCwd: process.cwd() });
  const b = scan({ root: VITE_FIXTURE, budget: 'fast', rootCwd: process.cwd() });
  assert.strictEqual(a.bestFirstProofId, b.bestFirstProofId);
  assert.deepStrictEqual(
    a.findings.map((f) => `${f.category}:${f.file}:${f.line}`),
    b.findings.map((f) => `${f.category}:${f.file}:${f.line}`)
  );
});

test('painHint reorders ranking when it matches', () => {
  const plain = scan({ root: VITE_FIXTURE, budget: 'fast', rootCwd: process.cwd() });
  const hinted = scan({
    root: VITE_FIXTURE,
    budget: 'fast',
    painHint: 'color tinted outline',
    rootCwd: process.cwd(),
  });
  // color/tinted hint maps to tinted-image-outline → that finding should become best_first_proof
  const hintedTop = hinted.findings.find((f) => f.id === hinted.bestFirstProofId);
  assert.ok(hintedTop);
  assert.strictEqual(hintedTop.category, 'tinted-image-outline');
  // And it should differ from the plain baseline
  assert.notStrictEqual(plain.bestFirstProofId, hinted.bestFirstProofId);
});

test('qualifiesAsSafeFix excludes cross-file findings', () => {
  const f = { crossFile: true, category: 'missing-reduced-motion-guard', ambiguous: false, visibleDelta: false };
  assert.strictEqual(qualifiesAsSafeFix(f), false);
});

test('qualifiesAsSafeFix includes single-file, visible, unambiguous, allowlisted category', () => {
  const f = { crossFile: false, category: 'transition-all', ambiguous: false, visibleDelta: true };
  assert.strictEqual(qualifiesAsSafeFix(f), true);
});

test('pickBestFirstProof returns null when no candidate qualifies', () => {
  const none = [
    { id: 'F1', crossFile: true, category: 'missing-reduced-motion-guard', ambiguous: false, visibleDelta: false, severity: 'minor', file: 'a.tsx' },
  ];
  assert.strictEqual(pickBestFirstProof(none), null);
});

test('engine does not spawn child_process or execSync', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'lib', 'start-findings-engine.cjs'), 'utf8');
  // Only flag actual subprocess APIs — RegExp.prototype.exec() is unrelated.
  assert.strictEqual(/require\(['"]child_process['"]\)/.test(src), false);
  assert.strictEqual(/\bexecSync\(|\bspawnSync\(|child_process\.spawn\(|child_process\.exec\(/.test(src), false);
});

test('scan handles empty/non-existent root without throwing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-empty-'));
  try {
    const r = scan({ root: tmp, budget: 'fast', rootCwd: process.cwd() });
    assert.strictEqual(r.findings.length, 0);
    assert.strictEqual(r.bestFirstProofId, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
