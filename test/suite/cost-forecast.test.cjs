'use strict';
// Phase 39.2 — cost-forecast.cjs unit test. Verifies the pure per-cycle forecast core:
// best <= typical <= worst, cyclesToCap math, the historical-telemetry fixture, determinism,
// guards, and purity (zero require). Every test tagged `39.2-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MOD = path.resolve(__dirname, '../../scripts/lib/budget/cost-forecast.cjs');
const { perCycleRates, mean, stddev, forecast, cyclesToCap } = require(MOD);
const FIXTURE = path.resolve(__dirname, '../fixtures/baselines/phase-39-2/costs-sample.jsonl');

/** Group the fixture costs.jsonl by cycle → per-cycle USD totals (chronological). */
function fixtureCycleCosts() {
  const byCycle = new Map();
  for (const line of fs.readFileSync(FIXTURE, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const r = JSON.parse(line);
    byCycle.set(r.cycle, (byCycle.get(r.cycle) || 0) + Number(r.est_cost_usd));
  }
  return [...byCycle.values()];
}

test('39.2-03: perCycleRates normalizes numbers and {costUsd}/{est_cost_usd} objects', () => {
  assert.deepEqual(perCycleRates([10, 12, 8]), [10, 12, 8]);
  assert.deepEqual(perCycleRates([{ costUsd: 10 }, { est_cost_usd: 12 }]), [10, 12]);
  assert.deepEqual(perCycleRates([-5, 3]), [0, 3], 'negatives clamp to 0');
});

test('39.2-03: best <= typical <= worst, and typical == mean', () => {
  const costs = [10, 12, 8];
  const b = forecast(costs, { scenario: 'best', nCycles: 5 });
  const t = forecast(costs, { scenario: 'typical', nCycles: 5 });
  const w = forecast(costs, { scenario: 'worst', nCycles: 5 });
  assert.equal(t.perCycle, 10, 'typical rate is the mean');
  assert.ok(b.perCycle <= t.perCycle && t.perCycle <= w.perCycle, 'best <= typical <= worst');
  assert.equal(t.projectedTotal, 50, 'typical * 5 cycles');
  assert.ok(b.low === b.perCycle, 'best uses the low band');
  assert.ok(w.high === w.perCycle, 'worst uses the high band');
});

test('39.2-03: forecaster runs against the historical-telemetry fixture (SC#9)', () => {
  const costs = fixtureCycleCosts();
  assert.deepEqual(costs, [10, 12, 8], 'fixture groups to [10,12,8]');
  const t = forecast(costs, { scenario: 'typical', nCycles: 4 });
  assert.equal(t.observedCycles, 3);
  assert.equal(t.perCycle, 10);
  assert.equal(t.projectedTotal, 40);
  assert.ok(Math.abs(stddev(costs) - 1.6329931) < 1e-4, 'population stddev');
  assert.ok(mean(costs) === 10);
});

test('39.2-03: cyclesToCap — normal, rate<=0 (Infinity), already-past (0)', () => {
  assert.equal(cyclesToCap(40, 100, 10), 6, 'ceil((100-40)/10)');
  assert.equal(cyclesToCap(40, 100, 0), Infinity, 'flat spend never reaches cap');
  assert.equal(cyclesToCap(120, 100, 10), 0, 'already past');
  assert.equal(cyclesToCap(0, 100, 7), Math.ceil(100 / 7));
});

test('39.2-03: deterministic + guards bad input', () => {
  const a = forecast([1, 2, 3], { scenario: 'worst', nCycles: 3 });
  const b = forecast([1, 2, 3], { scenario: 'worst', nCycles: 3 });
  assert.deepEqual(a, b);
  assert.throws(() => forecast([1], { scenario: 'bogus' }), /scenario must be/);
  assert.throws(() => forecast('nope'), /must be an array/);
  assert.throws(() => cyclesToCap('x', 1, 1), /finite/);
});

test('39.2-03: pure + dep-free (zero require)', () => {
  assert.doesNotMatch(fs.readFileSync(MOD, 'utf8'), /\brequire\s*\(/, 'cost-forecast.cjs must not require anything');
});
