// tests/bandit-router.test.cjs — Plan 23.5-01 contextual Thompson bandit
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, existsSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  pull,
  update,
  reset,
  loadPosterior,
  savePosterior,
  computeReward,
  binForGlobCount,
  decayArm,
  priorFor,
  sampleBeta,
  DEFAULT_TIERS,
  PRIOR_STRENGTH,
  TIER_PRIOR,
} = require('../scripts/lib/bandit-router.cjs');

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-bandit-${prefix}-`));
}

test('23.5-01: binForGlobCount partitions correctly', () => {
  assert.equal(binForGlobCount(0), 'tiny');
  assert.equal(binForGlobCount(4), 'tiny');
  assert.equal(binForGlobCount(5), 'small');
  assert.equal(binForGlobCount(15), 'small');
  assert.equal(binForGlobCount(16), 'medium');
  assert.equal(binForGlobCount(50), 'medium');
  assert.equal(binForGlobCount(51), 'large');
  assert.equal(binForGlobCount(1000), 'large');
});

test('23.5-01: priorFor returns elevated alpha for higher tiers', () => {
  const haiku = priorFor('haiku', PRIOR_STRENGTH);
  const opus = priorFor('opus', PRIOR_STRENGTH);
  assert.ok(opus.alpha > haiku.alpha);
  assert.ok(haiku.beta > opus.beta);
  // Sum invariant: alpha + beta = strength (within rounding).
  assert.ok(Math.abs(haiku.alpha + haiku.beta - PRIOR_STRENGTH) < 0.001);
  assert.ok(Math.abs(opus.alpha + opus.beta - PRIOR_STRENGTH) < 0.001);
});

test('23.5-01: sampleBeta returns values in [0, 1]', () => {
  for (let i = 0; i < 100; i++) {
    const v = sampleBeta(2, 5);
    assert.ok(v >= 0 && v <= 1, `out of range: ${v}`);
  }
});

test('23.5-01: pull picks a tier and persists last_used + count', () => {
  const dir = tmp('pull');
  try {
    const r = pull({ agent: 'design-planner', bin: 'small', baseDir: dir });
    assert.ok(DEFAULT_TIERS.includes(r.tier));
    assert.ok(existsSync(r.posteriorPath));
    const posterior = JSON.parse(readFileSync(r.posteriorPath, 'utf8'));
    const arm = posterior.arms.find(
      (a) => a.agent === 'design-planner' && a.bin === 'small' && a.tier === r.tier,
    );
    assert.ok(arm, 'chosen arm should be persisted');
    assert.equal(arm.count, 1);
    assert.ok(arm.last_used);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-01: pull throws on missing agent or bin', () => {
  assert.throws(() => pull({ bin: 'small' }), /agent/);
  assert.throws(() => pull({ agent: 'a' }), /bin/);
});

test('23.5-01: update applies reward as Bernoulli observation', () => {
  const dir = tmp('update');
  try {
    // Pull first to seed the arm.
    const r = pull({ agent: 'design-executor', bin: 'medium', baseDir: dir });
    // Successful outcome: reward = 1 → α += 1.
    const u1 = update({
      agent: 'design-executor',
      bin: 'medium',
      tier: r.tier,
      reward: 1,
      baseDir: dir,
    });
    // Failed outcome: reward = 0 → β += 1.
    const u2 = update({
      agent: 'design-executor',
      bin: 'medium',
      tier: r.tier,
      reward: 0,
      baseDir: dir,
    });
    assert.ok(u1.alpha > u2.alpha - 1.001);
    assert.ok(u2.beta > u1.beta);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-01: update clamps reward into [0, 1]', () => {
  const dir = tmp('clamp');
  try {
    const arm0 = priorFor('sonnet', PRIOR_STRENGTH);
    const u1 = update({
      agent: 'a', bin: 'small', tier: 'sonnet', reward: 5, baseDir: dir,
    });
    // Reward clamped to 1 → α += 1, β += 0.
    assert.ok(Math.abs(u1.alpha - (arm0.alpha + 1)) < 0.001);
    assert.ok(Math.abs(u1.beta - arm0.beta) < 0.001);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-01: reset deletes the posterior file', () => {
  const dir = tmp('reset');
  try {
    pull({ agent: 'a', bin: 'small', baseDir: dir });
    const r = reset({ baseDir: dir, reason: 'testing' });
    assert.equal(r.deleted, true);
    assert.equal(r.reason, 'testing');
    assert.ok(!existsSync(r.path));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-01: reset on missing file is a noop with deleted=false', () => {
  const dir = tmp('reset-empty');
  try {
    const r = reset({ baseDir: dir });
    assert.equal(r.deleted, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-01: decayArm shrinks toward prior over time', () => {
  const arm = {
    agent: 'a',
    bin: 'small',
    tier: 'sonnet',
    alpha: 50, // way above prior
    beta: 5,
    last_used: new Date('2024-01-01').toISOString(),
    count: 100,
  };
  const decayed = decayArm(arm, { now: new Date('2025-01-01') });
  // After ~365 days at ρ=0.988, factor ≈ 0.988^365 ≈ 0.012.
  // Prior for sonnet (strength 10): alpha = 2 + 0.8 * 6 = 6.8, beta = 2 + 0.2 * 6 = 3.2.
  // alpha after decay ≈ 6.8 + 0.012 * (50 - 6.8) ≈ 7.32.
  assert.ok(decayed.alpha < 10, `decayed alpha should be near prior, got ${decayed.alpha}`);
  assert.ok(decayed.alpha > 6, `decayed alpha shouldn't fall below prior, got ${decayed.alpha}`);
});

test('23.5-01: computeReward — solidify_pass=false → 0', () => {
  assert.equal(computeReward({ solidify_pass: false, cost_usd: 0 }), 0);
});

test('23.5-01: computeReward — user_undo → 0 even with success', () => {
  assert.equal(
    computeReward({ solidify_pass: true, user_undo_in_session: true, cost_usd: 0 }),
    0,
  );
});

test('23.5-01: computeReward — pass with no cost = 1.0', () => {
  assert.equal(
    computeReward({ solidify_pass: true, cost_usd: 0, wall_time_ms: 0 }),
    1,
  );
});

test('23.5-01: computeReward — cost reduces reward via lambda', () => {
  const r = computeReward({
    solidify_pass: true,
    cost_usd: 5,
    wall_time_ms: 0,
    lambda: 0.3,
  });
  // norm(5) = 1; reward = 1 - 0.3 * 1 = 0.7.
  assert.ok(Math.abs(r - 0.7) < 0.001);
});

test('23.5-01: loadPosterior returns fresh envelope when missing', () => {
  const dir = tmp('load-empty');
  try {
    const p = loadPosterior({ baseDir: dir });
    assert.ok(Array.isArray(p.arms));
    assert.equal(p.arms.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-01: savePosterior + loadPosterior round-trip', () => {
  const dir = tmp('roundtrip');
  try {
    const data = {
      schema_version: '1.0.0',
      generated_at: 'whatever',
      arms: [{ agent: 'a', bin: 'small', tier: 'haiku', alpha: 5, beta: 5, last_used: null, count: 0 }],
    };
    const p = savePosterior(data, { baseDir: dir });
    const loaded = loadPosterior({ baseDir: dir });
    assert.equal(loaded.arms.length, 1);
    assert.equal(loaded.arms[0].agent, 'a');
    assert.ok(p.endsWith('posterior.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-01: TIER_PRIOR has expected keys', () => {
  assert.ok(TIER_PRIOR.haiku !== undefined);
  assert.ok(TIER_PRIOR.sonnet !== undefined);
  assert.ok(TIER_PRIOR.opus !== undefined);
});

test('23.5-01: 50 sequential pulls converge on the right arm with strong reward signal', () => {
  const dir = tmp('converge');
  try {
    // Simulate: opus always succeeds, haiku always fails, sonnet 50/50.
    let opusCount = 0;
    for (let i = 0; i < 60; i++) {
      const r = pull({ agent: 'demo', bin: 'tiny', baseDir: dir });
      if (r.tier === 'opus') opusCount += 1;
      const reward = r.tier === 'opus' ? 1 : r.tier === 'haiku' ? 0 : 0.5;
      update({ agent: 'demo', bin: 'tiny', tier: r.tier, reward, baseDir: dir });
    }
    // After 60 rounds with strong signal, opus should win >50% of pulls.
    // (The exact count is non-deterministic — assert a generous bound.)
    assert.ok(opusCount >= 25, `opus pulled only ${opusCount} of 60 — convergence too slow`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
