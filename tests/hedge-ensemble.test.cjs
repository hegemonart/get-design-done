// tests/hedge-ensemble.test.cjs — Plan 23.5-02 AdaNormalHedge
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  loss,
  vote,
  weights,
  loadWeights,
  saveWeights,
  DEFAULT_VOTE_THRESHOLD,
} = require('../scripts/lib/hedge-ensemble.cjs');

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-hedge-${prefix}-`));
}

test('23.5-02: loss throws on missing poolId or losses', () => {
  assert.throws(() => loss({ losses: { a: 0 } }), /poolId/);
  assert.throws(() => loss({ poolId: 'x' }), /losses/);
});

test('23.5-02: loss creates agents on first call with uniform weights', () => {
  const dir = tmp('init');
  try {
    const r = loss({ poolId: 'verifiers', losses: { a: 0, b: 0, c: 0 }, baseDir: dir });
    // Zero loss for everyone → weights should be roughly uniform after one round.
    const ws = Object.values(r.weights);
    for (const w of ws) {
      assert.ok(Math.abs(w - 1 / 3) < 0.001, `weight not uniform: ${w}`);
    }
    assert.ok(existsSync(r.weightsPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: loss penalises a high-loss agent', () => {
  const dir = tmp('penalty');
  try {
    // Agent 'b' fails repeatedly while others succeed.
    for (let i = 0; i < 10; i++) {
      loss({ poolId: 'p', losses: { a: 0, b: 1, c: 0 }, baseDir: dir });
    }
    const w = weights({ poolId: 'p', baseDir: dir });
    assert.ok(w.b < w.a, `b weight (${w.b}) should be < a weight (${w.a})`);
    assert.ok(w.b < w.c, `b weight (${w.b}) should be < c weight (${w.c})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: weights are normalised and sum to 1', () => {
  const dir = tmp('normal');
  try {
    loss({ poolId: 'p', losses: { a: 0.1, b: 0.5, c: 0.9 }, baseDir: dir });
    const w = weights({ poolId: 'p', baseDir: dir });
    const sum = Object.values(w).reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(sum - 1) < 0.001);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: weights returns empty object for unknown pool', () => {
  const dir = tmp('unknown');
  try {
    const w = weights({ poolId: 'no-such-pool', baseDir: dir });
    assert.deepEqual(w, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: vote — uniform weights → simple majority decides', () => {
  const dir = tmp('vote-uniform');
  try {
    // Initialise three agents at uniform weights.
    loss({ poolId: 'v', losses: { a: 0, b: 0, c: 0 }, baseDir: dir });
    const r = vote({ poolId: 'v', votes: { a: 1, b: 1, c: 0 }, baseDir: dir });
    // 2/3 weighted ≈ 0.667 ≥ threshold 0.5.
    assert.equal(r.passes, true);
    assert.ok(r.weighted > 0.5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: vote — heavily weighted agent overrides simple majority', () => {
  const dir = tmp('vote-weighted');
  try {
    // Drive 'a' way down (always loses), so 'b' and 'c' dominate.
    for (let i = 0; i < 20; i++) {
      loss({ poolId: 'v', losses: { a: 1, b: 0, c: 0 }, baseDir: dir });
    }
    // Now a votes pass, b+c vote fail. Despite a being 1-of-3 voters
    // by count, its tiny weight means the verdict is fail.
    const r = vote({ poolId: 'v', votes: { a: 1, b: 0, c: 0 }, baseDir: dir });
    assert.equal(r.passes, false);
    assert.ok(r.weighted < 0.5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: vote — boolean and 0/1 inputs both accepted', () => {
  const dir = tmp('vote-bool');
  try {
    loss({ poolId: 'v', losses: { a: 0, b: 0 }, baseDir: dir });
    const r1 = vote({ poolId: 'v', votes: { a: true, b: false }, baseDir: dir });
    const r2 = vote({ poolId: 'v', votes: { a: 1, b: 0 }, baseDir: dir });
    assert.equal(r1.passes, r2.passes);
    assert.ok(Math.abs(r1.weighted - r2.weighted) < 0.001);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: vote — custom threshold honoured', () => {
  const dir = tmp('vote-threshold');
  try {
    loss({ poolId: 'v', losses: { a: 0, b: 0, c: 0 }, baseDir: dir });
    // 1/3 weighted ≈ 0.33; threshold 0.4 → fail.
    const r = vote({
      poolId: 'v',
      votes: { a: 1, b: 0, c: 0 },
      threshold: 0.4,
      baseDir: dir,
    });
    assert.equal(r.passes, false);
    assert.equal(r.threshold, 0.4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: vote — empty votes returns weighted=0, passes=false (threshold 0.5)', () => {
  const dir = tmp('vote-empty');
  try {
    const r = vote({ poolId: 'never-seen', votes: {}, baseDir: dir });
    assert.equal(r.weighted, 0);
    assert.equal(r.passes, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: loss clamps loss values into [0, 1]', () => {
  const dir = tmp('clamp');
  try {
    // Loss above 1 — should still produce finite weights.
    loss({ poolId: 'p', losses: { a: 5, b: 0 }, baseDir: dir });
    const w = weights({ poolId: 'p', baseDir: dir });
    assert.ok(w.a > 0 && w.a < 1);
    assert.ok(w.b > 0 && w.b < 1);
    assert.ok(w.b > w.a);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: loss throws on non-numeric loss', () => {
  const dir = tmp('nan');
  try {
    assert.throws(
      () => loss({ poolId: 'p', losses: { a: 'oops' }, baseDir: dir }),
      /must be a number/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: loadWeights + saveWeights round-trip', () => {
  const dir = tmp('roundtrip');
  try {
    const data = {
      schema_version: '1.0.0',
      generated_at: 'whatever',
      pools: {
        p: { agents: { a: { weight: 0.5, cumLoss: 0, cumLoss2: 0, rounds: 0 } } },
      },
    };
    const p = saveWeights(data, { baseDir: dir });
    assert.ok(p.endsWith('hedge-weights.json'));
    const loaded = loadWeights({ baseDir: dir });
    assert.equal(loaded.pools.p.agents.a.weight, 0.5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23.5-02: DEFAULT_VOTE_THRESHOLD = 0.5', () => {
  assert.equal(DEFAULT_VOTE_THRESHOLD, 0.5);
});
