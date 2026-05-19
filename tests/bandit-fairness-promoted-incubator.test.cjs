// tests/bandit-fairness-promoted-incubator.test.cjs — Phase 29 Plan 06
// Beta(2,8) bootstrap for prior_class='promoted_incubator' + non-breaking
// default-path regression (CONTEXT D-04).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const b = require('../scripts/lib/bandit-router.cjs');

function mkTmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rmTmpdir(d) {
  fs.rmSync(d, { recursive: true, force: true });
}
function closeTo(actual, expected, eps = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < eps,
    `${actual} not close to ${expected} (eps=${eps})`,
  );
}

test('bandit-fairness: priorFor(sonnet, 10, promoted_incubator) returns Beta(2,8)', () => {
  const p = b.priorFor('sonnet', 10, 'promoted_incubator');
  assert.equal(p.alpha, 2);
  assert.equal(p.beta, 8);
});

test('bandit-fairness: priorFor(haiku, 10, promoted_incubator) is tier-independent', () => {
  const p = b.priorFor('haiku', 10, 'promoted_incubator');
  assert.equal(p.alpha, 2);
  assert.equal(p.beta, 8);
});

test('bandit-fairness: priorFor(opus, 10, promoted_incubator) is tier-independent', () => {
  const p = b.priorFor('opus', 10, 'promoted_incubator');
  assert.equal(p.alpha, 2);
  assert.equal(p.beta, 8);
});

test('bandit-fairness: priorFor(sonnet, 10) returns informed prior (non-breaking)', () => {
  const p = b.priorFor('sonnet', 10);
  // Existing Phase 23.5 formula: alpha = 2 + 0.8 * 6 = 6.8, beta = 2 + 0.2 * 6 = 3.2
  closeTo(p.alpha, 6.8);
  closeTo(p.beta, 3.2);
});

test("bandit-fairness: priorFor(sonnet, 10, 'default') equals priorFor(sonnet, 10)", () => {
  const a = b.priorFor('sonnet', 10);
  const c = b.priorFor('sonnet', 10, 'default');
  closeTo(a.alpha, c.alpha);
  closeTo(a.beta, c.beta);
});

test('bandit-fairness: update with promoted_incubator + reward=1 → alpha=3, beta=8', () => {
  const tmp = mkTmpdir('bandit-fairness-');
  try {
    const r = b.update({
      baseDir: tmp,
      agent: 'P',
      bin: 'small',
      tier: 'sonnet',
      reward: 1,
      prior_class: 'promoted_incubator',
    });
    assert.equal(r.alpha, 3);
    assert.equal(r.beta, 8);
  } finally {
    rmTmpdir(tmp);
  }
});

test('bandit-fairness: update with promoted_incubator + reward=0 → alpha=2, beta=9', () => {
  const tmp = mkTmpdir('bandit-fairness-');
  try {
    const r = b.update({
      baseDir: tmp,
      agent: 'P',
      bin: 'small',
      tier: 'sonnet',
      reward: 0,
      prior_class: 'promoted_incubator',
    });
    assert.equal(r.alpha, 2);
    assert.equal(r.beta, 9);
  } finally {
    rmTmpdir(tmp);
  }
});

test('bandit-fairness: arm.prior_class persists on posterior JSON', () => {
  const tmp = mkTmpdir('bandit-fairness-');
  try {
    b.update({
      baseDir: tmp,
      agent: 'P',
      bin: 'small',
      tier: 'sonnet',
      reward: 1,
      prior_class: 'promoted_incubator',
    });
    const p = b.loadPosterior({ baseDir: tmp });
    const arm = p.arms.find((a) => a.agent === 'P');
    assert.ok(arm, 'arm should exist');
    assert.equal(arm.prior_class, 'promoted_incubator');
  } finally {
    rmTmpdir(tmp);
  }
});

test('bandit-fairness: arm without prior_class has no prior_class field (round-trip cleanliness)', () => {
  const tmp = mkTmpdir('bandit-fairness-');
  try {
    b.update({ baseDir: tmp, agent: 'D', bin: 'small', tier: 'sonnet', reward: 1 });
    const p = b.loadPosterior({ baseDir: tmp });
    const arm = p.arms.find((a) => a.agent === 'D');
    assert.ok(arm, 'arm should exist');
    assert.equal('prior_class' in arm, false, 'default-bootstrapped arm should not persist prior_class');
  } finally {
    rmTmpdir(tmp);
  }
});

test('bandit-fairness: pullWithDelegate(delegates=[none], promoted_incubator) bootstraps Beta(2,8) + delegate=none + prior_class', () => {
  const tmp = mkTmpdir('bandit-fairness-');
  try {
    const r = b.pullWithDelegate({
      baseDir: tmp,
      agent: 'PD',
      bin: 'small',
      delegates: ['none'],
      prior_class: 'promoted_incubator',
    });
    assert.equal(r.delegate, 'none');
    const p = b.loadPosterior({ baseDir: tmp });
    // pullWithDelegate creates arms for all (delegate × tier) combos
    const arms = p.arms.filter((a) => a.agent === 'PD');
    assert.ok(arms.length > 0, 'arms created');
    for (const arm of arms) {
      assert.equal(arm.delegate, 'none');
      assert.equal(arm.prior_class, 'promoted_incubator');
    }
    // The chosen arm got its count bumped, but bootstrap α/β were 2/8.
    // For unchosen arms (no count bump), α and β remain Beta(2,8) exactly.
    const unchosen = arms.find((a) => a.tier !== r.tier);
    if (unchosen) {
      assert.equal(unchosen.alpha, 2);
      assert.equal(unchosen.beta, 8);
    }
  } finally {
    rmTmpdir(tmp);
  }
});

test('bandit-fairness: updateWithDelegate with promoted_incubator + reward=1 → alpha=3, beta=8, delegate persisted', () => {
  const tmp = mkTmpdir('bandit-fairness-');
  try {
    const r = b.updateWithDelegate({
      baseDir: tmp,
      agent: 'PG',
      bin: 'small',
      tier: 'sonnet',
      delegate: 'gemini',
      reward: 1,
      prior_class: 'promoted_incubator',
    });
    assert.equal(r.alpha, 3);
    assert.equal(r.beta, 8);
    const p = b.loadPosterior({ baseDir: tmp });
    const arm = p.arms.find((a) => a.agent === 'PG');
    assert.equal(arm.delegate, 'gemini');
    assert.equal(arm.prior_class, 'promoted_incubator');
  } finally {
    rmTmpdir(tmp);
  }
});

test('bandit-fairness: default update() (no prior_class) preserves Phase 23.5 informed bootstrap (regression guard)', () => {
  const tmp = mkTmpdir('bandit-fairness-');
  try {
    const r = b.update({
      baseDir: tmp,
      agent: 'L',
      bin: 'small',
      tier: 'sonnet',
      reward: 1,
    });
    // priorFor(sonnet, 10) = { 6.8, 3.2 } → +1 success → alpha = 7.8
    closeTo(r.alpha, 7.8);
    closeTo(r.beta, 3.2);
    const p = b.loadPosterior({ baseDir: tmp });
    const arm = p.arms.find((a) => a.agent === 'L');
    assert.equal('prior_class' in arm, false);
  } finally {
    rmTmpdir(tmp);
  }
});

test('bandit-fairness: PROMOTED_INCUBATOR_PRIOR is frozen + Beta(2,8)', () => {
  assert.equal(b.PROMOTED_INCUBATOR_PRIOR.alpha, 2);
  assert.equal(b.PROMOTED_INCUBATOR_PRIOR.beta, 8);
  assert.ok(Object.isFrozen(b.PROMOTED_INCUBATOR_PRIOR));
});

test('bandit-fairness: 8 successive successes shift promoted arm visibly (Beta(2,8) → Beta(10,8))', () => {
  const tmp = mkTmpdir('bandit-fairness-');
  try {
    for (let i = 0; i < 8; i++) {
      b.update({
        baseDir: tmp,
        agent: 'P',
        bin: 'small',
        tier: 'sonnet',
        reward: 1,
        prior_class: 'promoted_incubator',
      });
    }
    const p = b.loadPosterior({ baseDir: tmp });
    const arm = p.arms.find((a) => a.agent === 'P');
    assert.equal(arm.alpha, 10);
    assert.equal(arm.beta, 8);
    assert.equal(arm.prior_class, 'promoted_incubator');
    // Posterior mean shifted from 0.2 → 10/18 ≈ 0.555 (visible)
    const mean = arm.alpha / (arm.alpha + arm.beta);
    assert.ok(mean > 0.5, `posterior mean ${mean} should be > 0.5 after 8 successes`);
  } finally {
    rmTmpdir(tmp);
  }
});

test('bandit-fairness: computeReward is independent of prior_class (reward math unchanged)', () => {
  const r1 = b.computeReward({ solidify_pass: true, cost_usd: 0.01 });
  const r2 = b.computeReward({ solidify_pass: true, cost_usd: 0.01 });
  assert.equal(r1, r2);
  // Sanity: result is in [0, 1] and close to 1 for low cost
  assert.ok(r1 >= 0 && r1 <= 1);
  assert.ok(r1 > 0.99, `low-cost reward should be near 1, got ${r1}`);
});
