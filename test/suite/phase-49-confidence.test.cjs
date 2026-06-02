'use strict';
// Phase 49 - Reviewer Confidence Gate. Static contract over the confidence-gate unit:
//   - reference/reviewer-confidence-gate.md defines the 4-question Pre-Report Gate, the
//     confidence field, the >= 0.8 HIGH-severity auto-fix rule, and the < 0.5 Tentative rule.
//   - design-auditor / design-verifier / design-debt-crawler each cite the gate and require a
//     confidence field on every finding, routing low-confidence findings to ## Tentative.
//   - design-fixer's gap-intake filter drops ## Tentative gaps and BLOCKER/MAJOR gaps below 0.8.
//   - scripts/lib/confidence-route.cjs encodes the routing matrix (0.4 drop, 0.9 fix, 0.6 MAJOR
//     -> user-review).
// Hermetic: file reads + a pure helper. No live audit/verify. Every test tagged `49-confidence:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));

const GATE_REF = 'reference/reviewer-confidence-gate.md';
const AUDITOR = 'agents/design-auditor.md';
const VERIFIER = 'agents/design-verifier.md';
const CRAWLER = 'agents/design-debt-crawler.md';
const FIXER = 'agents/design-fixer.md';

// ---------------------------------------------------------------------------
// 1. The canonical reference exists and defines the gate, field, and rules.
// ---------------------------------------------------------------------------

test('49-confidence: reviewer-confidence-gate.md exists', () => {
  assert.ok(exists(GATE_REF), `${GATE_REF} was not created`);
});

test('49-confidence: reference defines the 4-question Pre-Report Gate', () => {
  const ref = read(GATE_REF);
  assert.match(ref, /Pre-Report Gate/, 'reference missing the Pre-Report Gate heading');
  // The four questions: file:line citation, one-sentence failure mode, context beyond the
  // modified file, defensible severity.
  assert.match(ref, /file:line/i, 'gate question (a) file:line citation missing');
  assert.match(ref, /one sentence|one-sentence/i, 'gate question (b) one-sentence failure mode missing');
  assert.match(ref, /context beyond/i, 'gate question (c) read-context-beyond missing');
  assert.match(ref, /defensible/i, 'gate question (d) defensible severity missing');
  // Confirm there are four labelled questions a/b/c/d.
  const labels = ref.match(/\*\*[abcd]\./g) || [];
  assert.ok(labels.length >= 4, `expected 4 labelled gate questions a-d, found ${labels.length}`);
});

test('49-confidence: reference defines the confidence 0.0-1.0 field', () => {
  const ref = read(GATE_REF);
  assert.match(ref, /confidence/, 'reference missing the confidence field');
  assert.match(ref, /0\.0-1\.0|0\.0 to 1\.0/, 'reference missing the 0.0-1.0 range for confidence');
});

test('49-confidence: reference states the >= 0.8 HIGH/CRITICAL auto-fix rule', () => {
  const ref = read(GATE_REF);
  assert.match(
    ref,
    /BLOCKER[^\n]*0\.8|0\.8[^\n]*BLOCKER|HIGH[^\n]*0\.8|0\.8[^\n]*(HIGH|severity)/i,
    'reference missing the >= 0.8 HIGH-severity auto-fix rule'
  );
  assert.match(ref, />=\s*0\.8/, 'reference missing the explicit >= 0.8 floor');
});

test('49-confidence: reference states the < 0.5 Tentative rule', () => {
  const ref = read(GATE_REF);
  assert.match(ref, /Tentative/, 'reference missing the ## Tentative section concept');
  assert.match(
    ref,
    /<\s*0\.5[^\n]*[Tt]entative|[Tt]entative[^\n]*<\s*0\.5|0\.5[^\n]*[Tt]entative/,
    'reference missing the < 0.5 -> Tentative rule'
  );
  // The < 0.5 band must never reach the fixer.
  assert.match(ref, /never reach/i, 'reference missing the "never reaches design-fixer" guarantee');
});

test('49-confidence: reference includes paired before/after examples', () => {
  const ref = read(GATE_REF);
  const befores = ref.match(/\*\*Before:\*\*/g) || [];
  const afters = ref.match(/\*\*After:\*\*/g) || [];
  assert.ok(befores.length >= 4, `expected >= 4 "Before:" examples, found ${befores.length}`);
  assert.ok(afters.length >= 4, `expected >= 4 "After:" examples, found ${afters.length}`);
});

test('49-confidence: reference is within the 90-150 line band', () => {
  const lineCount = read(GATE_REF).split('\n').filter((_, i, a) => i < a.length - 1 || a[i] !== '').length;
  assert.ok(lineCount >= 90 && lineCount <= 150, `reference is ${lineCount} lines, expected 90-150`);
});

// ---------------------------------------------------------------------------
// 2. The three reviewing agents cite the gate and require a confidence field.
// ---------------------------------------------------------------------------

for (const [label, rel] of [['design-auditor', AUDITOR], ['design-verifier', VERIFIER], ['design-debt-crawler', CRAWLER]]) {
  test(`49-confidence: ${label} cites reviewer-confidence-gate.md`, () => {
    const txt = read(rel);
    assert.match(txt, /reviewer-confidence-gate\.md/, `${label} does not cite the confidence-gate reference`);
  });

  test(`49-confidence: ${label} runs the Pre-Report Gate and requires a confidence field`, () => {
    const txt = read(rel);
    assert.match(txt, /Pre-Report Gate/, `${label} missing a Pre-Report Gate step`);
    assert.match(txt, /confidence/, `${label} does not require a confidence field`);
    assert.match(txt, /Tentative/, `${label} does not route low-confidence findings to ## Tentative`);
  });
}

// ---------------------------------------------------------------------------
// 3. design-fixer's routing filter drops Tentative + < 0.8 HIGH/CRITICAL gaps.
// ---------------------------------------------------------------------------

test('49-confidence: design-fixer skips ## Tentative gaps', () => {
  const txt = read(FIXER);
  assert.match(txt, /Tentative/, 'design-fixer does not mention the ## Tentative section');
  assert.match(
    txt,
    /(drop|skip)[^\n]*[Tt]entative|[Tt]entative[^\n]*(never reach|drop|skip)/i,
    'design-fixer does not skip/drop ## Tentative gaps'
  );
});

test('49-confidence: design-fixer routes BLOCKER/MAJOR gaps below 0.8 to user review', () => {
  const txt = read(FIXER);
  assert.match(txt, /confidence/, 'design-fixer does not reference the confidence field');
  assert.match(
    txt,
    /(BLOCKER|MAJOR)[^\n]*0\.8|0\.8[^\n]*(user review|user-review)/i,
    'design-fixer does not route sub-0.8 high-severity gaps to user review'
  );
  assert.match(txt, /confidence-route\.cjs/, 'design-fixer does not reference the shared routing helper');
});

// ---------------------------------------------------------------------------
// 4. The pure routing helper encodes the matrix and is unit-tested.
// ---------------------------------------------------------------------------

test('49-confidence: confidence-route.cjs exists and exports route()', () => {
  assert.ok(exists('scripts/lib/confidence-route.cjs'), 'scripts/lib/confidence-route.cjs was not created');
  const mod = require(path.join(REPO_ROOT, 'scripts/lib/confidence-route.cjs'));
  assert.equal(typeof mod.route, 'function', 'confidence-route.cjs must export a route() function');
});

test('49-confidence: routing matrix - 0.4 stays tentative (drop)', () => {
  const { route } = require(path.join(REPO_ROOT, 'scripts/lib/confidence-route.cjs'));
  // A low-confidence finding is dropped (stays tentative), regardless of severity.
  assert.equal(route({ severity: 'MAJOR', confidence: 0.4 }), 'drop');
  assert.equal(route({ severity: 'MINOR', confidence: 0.4 }), 'drop');
  // An explicit tentative flag drops even a high-confidence high-severity finding.
  assert.equal(route({ severity: 'BLOCKER', confidence: 0.9, tentative: true }), 'drop');
});

test('49-confidence: routing matrix - 0.9 BLOCKER routes to fix', () => {
  const { route } = require(path.join(REPO_ROOT, 'scripts/lib/confidence-route.cjs'));
  assert.equal(route({ severity: 'BLOCKER', confidence: 0.9 }), 'fix');
  assert.equal(route({ severity: 'MAJOR', confidence: 0.8 }), 'fix'); // exactly at the floor
  assert.equal(route({ severity: 'MINOR', confidence: 0.95 }), 'fix');
});

test('49-confidence: routing matrix - 0.6 MAJOR routes to user-review', () => {
  const { route } = require(path.join(REPO_ROOT, 'scripts/lib/confidence-route.cjs'));
  // Mid-band high-severity: real signal, partial evidence -> surfaced for the user, not auto-fixed.
  assert.equal(route({ severity: 'MAJOR', confidence: 0.6 }), 'user-review');
  assert.equal(route({ severity: 'BLOCKER', confidence: 0.79 }), 'user-review');
  assert.equal(route({ severity: 'MINOR', confidence: 0.5 }), 'user-review'); // at the surface floor
});

test('49-confidence: routing matrix - missing confidence is treated as below floor', () => {
  const { route } = require(path.join(REPO_ROOT, 'scripts/lib/confidence-route.cjs'));
  // No numeric confidence -> dropped (does not silently auto-fix).
  assert.equal(route({ severity: 'BLOCKER' }), 'drop');
  assert.equal(route({ severity: 'MAJOR', confidence: 'high' }), 'drop');
});
