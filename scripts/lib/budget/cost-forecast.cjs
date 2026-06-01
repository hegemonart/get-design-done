'use strict';
// Phase 39.2 — cost-forecast.cjs — PURE, dep-free per-cycle cost forecasting core.
//
// The /gdd:budget skill and agents/cost-forecaster.md read .design/telemetry/costs.jsonl, group the
// est_cost_usd by `cycle`, and hand the resulting per-cycle USD totals here. This module does ONLY
// the projection math — it never touches the filesystem, the clock, or randomness, so it is trivially
// unit-testable (the build-html.cjs / codemod-gen.cjs purity precedent).
//
// Scenario derivation (D-05): from the variance of the historical per-cycle rates,
//   typical = mean
//   worst  = mean + k·stddev
//   best   = max(0, mean − k·stddev)
// with k = 1 by default. Projection over the next N cycles is linear on the chosen rate.
//
// No `require` — pure. Deterministic.

/** Coerce to a finite, non-negative number or throw. */
function num(x, label) {
  const n = Number(x);
  if (!Number.isFinite(n)) throw new Error(`cost-forecast: ${label} must be a finite number (got ${x})`);
  return n;
}

/** Population mean of an array of numbers (0 for empty). */
function mean(xs) {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Population standard deviation (0 for length < 2). */
function stddev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) * (x - m);
  return Math.sqrt(acc / xs.length);
}

/**
 * Normalize the cycle-cost input into a clean array of non-negative per-cycle USD totals.
 * Accepts either an array of numbers, or an array of { costUsd } / { est_cost_usd } objects.
 */
function perCycleRates(cycleCosts) {
  if (!Array.isArray(cycleCosts)) throw new Error('cost-forecast: cycleCosts must be an array');
  return cycleCosts.map((c, i) => {
    const v = typeof c === 'object' && c !== null
      ? (c.costUsd !== undefined ? c.costUsd : c.est_cost_usd)
      : c;
    const n = num(v, `cycleCosts[${i}]`);
    return n < 0 ? 0 : n;
  });
}

/**
 * Project the next `nCycles` of spend.
 * @returns {{scenario, k, observedCycles, perCycle, projectedTotal, low, high}}
 *   perCycle      — the per-cycle rate used for this scenario
 *   projectedTotal — perCycle * nCycles
 *   low/high      — the best/worst per-cycle band (always returned for context)
 */
function forecast(cycleCosts, opts) {
  const o = opts || {};
  const nCycles = o.nCycles === undefined ? 5 : Math.max(0, Math.trunc(num(o.nCycles, 'nCycles')));
  const scenario = o.scenario === undefined ? 'typical' : String(o.scenario);
  const k = o.k === undefined ? 1 : num(o.k, 'k');
  if (!['best', 'typical', 'worst'].includes(scenario)) {
    throw new Error(`cost-forecast: scenario must be best|typical|worst (got ${scenario})`);
  }
  const rates = perCycleRates(cycleCosts);
  const m = mean(rates);
  const sd = stddev(rates);
  const low = Math.max(0, m - k * sd);
  const high = m + k * sd;
  const perCycle = scenario === 'best' ? low : scenario === 'worst' ? high : m;
  return {
    scenario,
    k,
    observedCycles: rates.length,
    perCycle,
    projectedTotal: perCycle * nCycles,
    low,
    high,
  };
}

/**
 * Integer count of full cycles until `currentSpend` reaches `cap` at `perCycleRate`.
 *   - rate <= 0           → Infinity (never reaches cap)
 *   - currentSpend >= cap → 0 (already at/over)
 * Throws on non-finite inputs.
 */
function cyclesToCap(currentSpend, cap, perCycleRate) {
  const s = num(currentSpend, 'currentSpend');
  const c = num(cap, 'cap');
  const r = num(perCycleRate, 'perCycleRate');
  if (s >= c) return 0;
  if (r <= 0) return Infinity;
  return Math.ceil((c - s) / r);
}

module.exports = { perCycleRates, mean, stddev, forecast, cyclesToCap };
