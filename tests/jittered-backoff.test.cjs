'use strict';
// tests/jittered-backoff.test.cjs — Plan 20-14 Task 1.

const test = require('node:test');
const assert = require('node:assert/strict');

const { delayMs, sleep, DEFAULTS } = require('../scripts/lib/jittered-backoff.cjs');

// Helper: sample `n` calls of `delayMs(attempt, opts)` into an array.
function sample(attempt, opts, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = delayMs(attempt, opts);
  return out;
}

function mean(arr) {
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function stddev(arr) {
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / arr.length);
}

test('delayMs(0) falls within [baseMs*(1-jitter), baseMs*(1+jitter)]', () => {
  const baseMs = 100;
  const jitter = 0.2;
  const lower = baseMs * (1 - jitter);
  const upper = baseMs * (1 + jitter);
  for (let i = 0; i < 200; i++) {
    const v = delayMs(0, { baseMs, jitter });
    assert.ok(v >= lower - 1e-9, `attempt=0 delay ${v} below lower ${lower}`);
    assert.ok(v <= upper + 1e-9, `attempt=0 delay ${v} above upper ${upper}`);
  }
});

test('growth is monotonic on average: mean(attempt=N+1) > mean(attempt=N)', () => {
  // Averaging across 200 samples eliminates jitter noise well below the
  // 2× gap between consecutive unjittered values.
  const opts = { baseMs: 10, maxMs: 1_000_000, factor: 2, jitter: 0.2 };
  const prev = mean(sample(2, opts, 200));
  const next = mean(sample(3, opts, 200));
  assert.ok(next > prev, `mean(3)=${next} should exceed mean(2)=${prev}`);

  const a = mean(sample(4, opts, 200));
  const b = mean(sample(5, opts, 200));
  assert.ok(b > a, `mean(5)=${b} should exceed mean(4)=${a}`);
});

test('cap: no sample at large attempt exceeds maxMs * (1 + jitter)', () => {
  const maxMs = 1000;
  const jitter = 0.2;
  const ceiling = maxMs * (1 + jitter);
  for (let i = 0; i < 200; i++) {
    // attempt=50 with factor=2 would overflow without the cap
    const v = delayMs(50, { baseMs: 100, maxMs, factor: 2, jitter });
    assert.ok(v <= ceiling + 1e-9, `attempt=50 delay ${v} exceeds ceiling ${ceiling}`);
  }
});

test('jitter range never produces a negative value even at baseMs=1, jitter=0.99', () => {
  for (let i = 0; i < 1000; i++) {
    const v = delayMs(0, { baseMs: 1, jitter: 0.99 });
    assert.ok(v >= 0, `delay must be non-negative, got ${v}`);
  }
});

test('100 samples at a fixed attempt have stddev > 0 (jitter is actually applied)', () => {
  const samples = sample(3, { baseMs: 100, jitter: 0.3 }, 100);
  const sd = stddev(samples);
  assert.ok(sd > 0, `stddev must be > 0 when jitter is on, got ${sd}`);
});

test('jitter=0 produces deterministic delays (stddev === 0)', () => {
  const samples = sample(3, { baseMs: 100, factor: 2, jitter: 0 }, 50);
  const sd = stddev(samples);
  assert.equal(sd, 0, 'with jitter=0 stddev must be exactly 0');
  // All samples equal 100 * 2^3 = 800
  for (const v of samples) assert.equal(v, 800);
});

test('defaults are applied when opts is undefined', () => {
  const v = delayMs(0);
  const lower = DEFAULTS.baseMs * (1 - DEFAULTS.jitter);
  const upper = DEFAULTS.baseMs * (1 + DEFAULTS.jitter);
  assert.ok(v >= lower - 1e-9 && v <= upper + 1e-9, `delay ${v} outside default bounds [${lower}, ${upper}]`);
});

test('bogus inputs degrade gracefully (no NaN/Infinity)', () => {
  // Negative attempt clamped to 0
  const v1 = delayMs(-5, { baseMs: 100, jitter: 0 });
  assert.equal(v1, 100);

  // NaN attempt treated as 0
  const v2 = delayMs(Number.NaN, { baseMs: 100, jitter: 0 });
  assert.equal(v2, 100);

  // Zero factor replaced by default factor
  const v3 = delayMs(2, { baseMs: 100, factor: 0, jitter: 0 });
  // default factor is 2 → 100 * 4 = 400
  assert.equal(v3, 400);

  // Jitter >= 1 clamped below 1
  const v4 = delayMs(0, { baseMs: 100, jitter: 5 });
  assert.ok(Number.isFinite(v4), 'finite delay even with jitter out of range');
  assert.ok(v4 >= 0, 'non-negative delay even with jitter out of range');
});

test('sleep(attempt) resolves with actual delay and waits roughly that long', async () => {
  const start = Date.now();
  const applied = await sleep(0, { baseMs: 30, jitter: 0 });
  const elapsed = Date.now() - start;
  assert.equal(applied, 30, 'sleep must resolve with the delayMs value');
  // Allow wide tolerance for CI jitter — we just want to confirm it waited.
  assert.ok(elapsed >= 20, `sleep waited too briefly (${elapsed}ms, expected >=20ms)`);
});

test('DEFAULTS is frozen and exposes the documented shape', () => {
  assert.equal(DEFAULTS.baseMs, 100);
  assert.equal(DEFAULTS.maxMs, 30_000);
  assert.equal(DEFAULTS.factor, 2);
  assert.equal(DEFAULTS.jitter, 0.2);
  assert.ok(Object.isFrozen(DEFAULTS), 'DEFAULTS must be frozen');
});
