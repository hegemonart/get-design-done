// tests/gdd-state-gates.test.ts — pure transition-gate tests.
//
// Plan 20-02 (SDK-03). Eight fixture STATE.md files at
// tests/fixtures/state/gates/ are loaded, parsed, and evaluated by the
// matching gate from scripts/lib/gdd-state/gates.ts. Pass fixtures MUST
// produce `{ pass: true, blockers: [] }`; fail fixtures MUST produce
// `{ pass: false, blockers: ["…", …] }` where each blocker is a
// non-empty human-readable string.
//
// Also covers:
//   - gateFor(from, to) returning null for invalid transitions
//   - transition() atomicity: a failing gate throws, and STATE.md is
//     byte-identical before/after the attempt
//   - Gate purity: two calls with the same input return structurally
//     equal results (no hidden clock/RNG dependence)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parse } from '../scripts/lib/gdd-state/parser.ts';
import {
  briefToExplore,
  exploreToPlan,
  planToDesign,
  designToVerify,
  gateFor,
  GATES,
  type GateFn,
} from '../scripts/lib/gdd-state/gates.ts';
import {
  transition,
  TransitionGateFailed,
} from '../scripts/lib/gdd-state/index.ts';
import type { Stage } from '../scripts/lib/gdd-state/types.ts';
import { REPO_ROOT } from './helpers.ts';

const FIXTURES: string = join(REPO_ROOT, 'tests', 'fixtures', 'state', 'gates');

interface GateCase {
  fixture: string;
  gate: GateFn;
  expectPass: boolean;
}

const CASES: readonly GateCase[] = [
  { fixture: 'brief-to-explore-pass.md', gate: briefToExplore, expectPass: true },
  { fixture: 'brief-to-explore-fail.md', gate: briefToExplore, expectPass: false },
  { fixture: 'explore-to-plan-pass.md', gate: exploreToPlan, expectPass: true },
  { fixture: 'explore-to-plan-fail.md', gate: exploreToPlan, expectPass: false },
  { fixture: 'plan-to-design-pass.md', gate: planToDesign, expectPass: true },
  { fixture: 'plan-to-design-fail.md', gate: planToDesign, expectPass: false },
  { fixture: 'design-to-verify-pass.md', gate: designToVerify, expectPass: true },
  { fixture: 'design-to-verify-fail.md', gate: designToVerify, expectPass: false },
];

function loadFixture(name: string) {
  const raw = readFileSync(join(FIXTURES, name), 'utf8');
  return parse(raw).state;
}

// --- Per-fixture pass/fail assertions -----------------------------------

for (const c of CASES) {
  test(`gate: ${c.fixture} -> expectPass=${c.expectPass}`, () => {
    const state = loadFixture(c.fixture);
    const result = c.gate(state);
    assert.equal(
      result.pass,
      c.expectPass,
      `expected pass=${c.expectPass}, got pass=${result.pass} with blockers ${JSON.stringify(result.blockers)}`,
    );
    if (c.expectPass) {
      assert.deepEqual(result.blockers, [], 'pass fixtures must have empty blockers');
    } else {
      assert.ok(
        result.blockers.length >= 1,
        'fail fixtures must have at least one blocker',
      );
      for (const b of result.blockers) {
        assert.equal(typeof b, 'string', 'blockers must be strings');
        assert.ok(b.length > 0, `blocker must be non-empty: "${b}"`);
      }
    }
  });
}

// --- Targeted blocker-content assertions --------------------------------

test('exploreToPlan: empty connections surfaces probe-run blocker', () => {
  const state = loadFixture('explore-to-plan-fail.md');
  const result = exploreToPlan(state);
  assert.equal(result.pass, false);
  assert.ok(
    result.blockers.some((b) => b.includes('connections map is empty')),
    `expected empty-connections blocker, got ${JSON.stringify(result.blockers)}`,
  );
});

test('planToDesign: empty must_haves + no locked decision reports both', () => {
  const state = loadFixture('plan-to-design-fail.md');
  const result = planToDesign(state);
  assert.equal(result.pass, false);
  assert.ok(
    result.blockers.some((b) => b.includes('must_haves is empty')),
    'must_haves blocker present',
  );
  assert.ok(
    result.blockers.some((b) => b.includes('no locked decision')),
    'locked-decision blocker present',
  );
});

test('designToVerify: pending design-keyword mentions the specific keyword', () => {
  const state = loadFixture('design-to-verify-fail.md');
  const result = designToVerify(state);
  assert.equal(result.pass, false);
  const hit = result.blockers.find((b) =>
    b.includes('M-04') && b.includes('"component"'),
  );
  assert.ok(
    hit,
    `expected M-04 'component' blocker, got ${JSON.stringify(result.blockers)}`,
  );
});

test('briefToExplore: wrong-parity fixture reports stage mismatch', () => {
  const state = loadFixture('brief-to-explore-fail.md');
  const result = briefToExplore(state);
  assert.equal(result.pass, false);
  assert.ok(
    result.blockers.some(
      (b) => b.includes('stage') && b.includes('explore') && b.includes('brief'),
    ),
    `expected parity blocker mentioning explore and brief, got ${JSON.stringify(result.blockers)}`,
  );
});

// --- Additional semantic coverage (programmatic state construction) -----

test('planToDesign: fail must_have without reconciling decision blocks advance', () => {
  // Start from the pass fixture and mutate: flip M-01 to fail and remove
  // any decision mentioning M-01. The gate should then surface the
  // "marked fail without a decision to reconcile" blocker.
  const state = loadFixture('plan-to-design-pass.md');
  const firstMustHave = state.must_haves[0];
  assert.ok(firstMustHave, 'plan-to-design-pass must have at least one must_have');
  firstMustHave.status = 'fail';
  state.decisions = state.decisions.filter((d) => !d.text.includes(firstMustHave.id));

  const result = planToDesign(state);
  assert.equal(result.pass, false);
  assert.ok(
    result.blockers.some(
      (b) => b.includes(firstMustHave.id) && b.includes('reconcile'),
    ),
    `expected reconciliation blocker for ${firstMustHave.id}, got ${JSON.stringify(result.blockers)}`,
  );
});

test('planToDesign: fail must_have reconciled by matching decision passes', () => {
  // Same setup, but keep a decision that references the failing M-ID.
  const state = loadFixture('plan-to-design-pass.md');
  const firstMustHave = state.must_haves[0];
  assert.ok(firstMustHave, 'plan-to-design-pass must have at least one must_have');
  firstMustHave.status = 'fail';
  // Ensure at least one decision references the failing must_have id.
  state.decisions.push({
    id: 'D-99',
    text: `Retry approach for ${firstMustHave.id} via alt strategy`,
    status: 'locked',
  });

  const result = planToDesign(state);
  assert.equal(result.pass, true, `unexpected blockers: ${JSON.stringify(result.blockers)}`);
  assert.deepEqual(result.blockers, []);
});

test('designToVerify: pending non-keyword items are allowed through', () => {
  // Pass fixture already has M-03 pending ("screen readers" — no design
  // keyword). The gate should pass.
  const state = loadFixture('design-to-verify-pass.md');
  const result = designToVerify(state);
  assert.equal(result.pass, true);
  assert.deepEqual(result.blockers, []);
});

// --- gateFor invalid-transition coverage --------------------------------

test('gateFor: returns null for skip-stage transition (brief -> verify)', () => {
  assert.equal(gateFor('brief', 'verify'), null);
});

test('gateFor: returns null for same-stage transition (verify -> verify)', () => {
  assert.equal(gateFor('verify', 'verify'), null);
});

test('gateFor: returns null for backward transition (explore -> brief)', () => {
  assert.equal(gateFor('explore', 'brief'), null);
});

test('gateFor: returns null for out-of-union from stage', () => {
  // 'scan' is a pre-brief stage string accepted by the parser but NOT in
  // the Stage union; cast through `unknown` to simulate a caller passing
  // a non-canonical value.
  assert.equal(gateFor('scan' as unknown as Stage, 'brief'), null);
});

test('gateFor: resolves every valid forward transition to a registered gate', () => {
  assert.equal(gateFor('brief', 'explore'), briefToExplore);
  assert.equal(gateFor('explore', 'plan'), exploreToPlan);
  assert.equal(gateFor('plan', 'design'), planToDesign);
  assert.equal(gateFor('design', 'verify'), designToVerify);
});

// --- GATES registry -----------------------------------------------------

test('GATES: registry is frozen and exposes all 4 gates', () => {
  assert.equal(Object.isFrozen(GATES), true);
  assert.equal(GATES.briefToExplore, briefToExplore);
  assert.equal(GATES.exploreToPlan, exploreToPlan);
  assert.equal(GATES.planToDesign, planToDesign);
  assert.equal(GATES.designToVerify, designToVerify);
});

// --- Purity ------------------------------------------------------------

test('gates are pure: two calls produce structurally equal results', () => {
  for (const c of CASES) {
    const state = loadFixture(c.fixture);
    const r1 = c.gate(state);
    const r2 = c.gate(state);
    assert.deepEqual(r1, r2, `${c.fixture} gate result differed between calls`);
  }
});

test('gates do not mutate their input state', () => {
  for (const c of CASES) {
    const state = loadFixture(c.fixture);
    const snapshot = JSON.parse(JSON.stringify(state));
    c.gate(state);
    assert.deepEqual(state, snapshot, `${c.fixture} gate mutated input state`);
  }
});

// --- transition() integration + atomicity ------------------------------

function scaffoldFromFixture(fixtureName: string): {
  path: string;
  before: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-state-gates-'));
  const path = join(dir, 'STATE.md');
  const before = readFileSync(join(FIXTURES, fixtureName), 'utf8');
  writeFileSync(path, before);
  return {
    path,
    before,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('transition: failing gate throws TransitionGateFailed with blockers', async () => {
  const { path, before, cleanup } = scaffoldFromFixture('plan-to-design-fail.md');
  try {
    let caught: unknown = null;
    try {
      await transition(path, 'design');
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof TransitionGateFailed, 'expected TransitionGateFailed');
    assert.ok(
      (caught as TransitionGateFailed).blockers.length >= 1,
      'blockers must be populated',
    );
    // STATE.md byte-identical before/after the failed attempt.
    const after = readFileSync(path, 'utf8');
    assert.equal(after, before, 'STATE.md must be byte-identical after a failed transition');
    // No lock or tmp left behind — transition() never got into mutate().
    assert.equal(existsSync(`${path}.lock`), false, 'no lock left behind');
    assert.equal(existsSync(`${path}.tmp`), false, 'no tmp left behind');
  } finally {
    cleanup();
  }
});

test('transition: invalid transition (skip-stage) throws TransitionGateFailed', async () => {
  // brief-to-explore-pass has stage=brief; ask for verify (skip-stage).
  const { path, before, cleanup } = scaffoldFromFixture('brief-to-explore-pass.md');
  try {
    let caught: unknown = null;
    try {
      await transition(path, 'verify');
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof TransitionGateFailed);
    const err = caught as TransitionGateFailed;
    assert.ok(
      err.blockers.some((b) => b.includes('Invalid transition')),
      `expected 'Invalid transition' blocker, got ${JSON.stringify(err.blockers)}`,
    );
    // File untouched.
    assert.equal(readFileSync(path, 'utf8'), before);
  } finally {
    cleanup();
  }
});

test('transition: passing gate advances stage and writes timestamp', async () => {
  const { path, cleanup } = scaffoldFromFixture('brief-to-explore-pass.md');
  try {
    const result = await transition(path, 'explore');
    assert.equal(result.pass, true);
    assert.equal(result.state.position.stage, 'explore');
    assert.equal(result.state.frontmatter.stage, 'explore');
    assert.match(
      result.state.timestamps['explore_started_at'] ?? '',
      /^\d{4}-\d{2}-\d{2}T/,
      'explore_started_at should be an ISO timestamp',
    );
  } finally {
    cleanup();
  }
});
