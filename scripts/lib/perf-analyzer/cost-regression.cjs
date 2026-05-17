/**
 * scripts/lib/perf-analyzer/cost-regression.cjs — Plan 27.6-01
 *
 * Stateless detection rules over the telemetry row arrays returned by
 * scripts/lib/perf-analyzer/index.cjs. Three pure functions:
 *
 *   detectCostRegressions  — top-3 agents whose p50 USD-cost has
 *                            regressed >= thresholdPct (default 25%
 *                            per Phase 27.6 D-01) vs baseline across
 *                            cyclesRequired distinct cycles (default 3).
 *   computeCacheHitDelta   — per-agent current hit rate vs baseline.
 *   computeP95Spikes       — per-agent p95 wall-time multiplier vs
 *                            baseline. Flag when multiplier >= 1.5.
 *
 * All inputs are plain arrays / objects. No I/O. No external deps.
 */
'use strict';

/**
 * Median (p50) of a numeric array. Returns 0 for empty input.
 * Even-length arrays return the mean of the two middle values.
 *
 * @param {number[]} arr
 * @returns {number}
 */
function p50(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * p95 of a numeric array (nearest-rank, floor index, clamped to last).
 * Returns 0 for empty input.
 *
 * @param {number[]} arr
 * @returns {number}
 */
function p95(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx];
}

/**
 * Group cost rows by agent, then by cycle. Filters out rows missing
 * the required shape (agent, est_cost_usd, cycle).
 *
 * @param {object[]} rows
 * @returns {Map<string, { cycles: Map<string, number[]> }>}
 */
function groupRowsByAgentCycle(rows) {
  const byAgent = new Map();
  for (const row of rows || []) {
    if (
      !row ||
      typeof row.agent !== 'string' ||
      typeof row.est_cost_usd !== 'number' ||
      typeof row.cycle !== 'string'
    ) {
      continue;
    }
    let bucket = byAgent.get(row.agent);
    if (!bucket) {
      bucket = { cycles: new Map() };
      byAgent.set(row.agent, bucket);
    }
    let cycleArr = bucket.cycles.get(row.cycle);
    if (!cycleArr) {
      cycleArr = [];
      bucket.cycles.set(row.cycle, cycleArr);
    }
    cycleArr.push(row.est_cost_usd);
  }
  return byAgent;
}

/**
 * Top-3 token-cost regressions across the most recent `cyclesRequired`
 * distinct cycles per agent. Honours D-01 defaults (25% / 3 cycles).
 *
 * @param {object}   opts
 * @param {object[]} opts.rows             - cost rows (from loadCosts)
 * @param {Record<string, {p50_usd:number, hit_rate?:number, p95_ms?:number}>} opts.baseline
 * @param {number}   [opts.thresholdPct=25] - regression threshold (D-01)
 * @param {number}   [opts.cyclesRequired=3] - minimum distinct cycles (D-01)
 * @returns {{
 *   regressions: Array<{agent:string, baseline_p50_usd:number, current_p50_usd:number, delta_pct:number, cycles_observed:number}>,
 *   summary: {agents_evaluated:number, agents_skipped_insufficient_data:number, regressions_count:number, threshold_pct:number, cycles_required:number}
 * }}
 */
function detectCostRegressions({ rows, baseline, thresholdPct, cyclesRequired } = {}) {
  const _thresholdPct = thresholdPct ?? 25;
  const _cyclesRequired = cyclesRequired ?? 3;
  const _baseline = baseline || {};

  const byAgent = groupRowsByAgentCycle(rows);

  /** @type {Array<{agent:string, baseline_p50_usd:number, current_p50_usd:number, delta_pct:number, cycles_observed:number}>} */
  const candidates = [];
  let agents_evaluated = 0;
  let agents_skipped = 0;

  for (const [agent, bucket] of byAgent.entries()) {
    // Newest cycles first (lexicographic descending) — take up to N.
    const cycleKeys = [...bucket.cycles.keys()].sort().reverse();
    const recentCycles = cycleKeys.slice(0, _cyclesRequired);

    if (recentCycles.length < _cyclesRequired) {
      agents_skipped += 1;
      continue;
    }

    const baselineEntry = _baseline[agent];
    if (!baselineEntry || typeof baselineEntry.p50_usd !== 'number') {
      agents_skipped += 1;
      continue;
    }

    const flatCosts = recentCycles.flatMap((c) => bucket.cycles.get(c));
    const current = p50(flatCosts);
    const base = baselineEntry.p50_usd;

    // Contract (plan 27.6-01 behavior): "an agent's p50 USD-cost across
    // the LAST cyclesRequired cycles is >= baseline_p50 × (1 + thresholdPct/100)".
    // Apply the multiplicative form directly so the threshold-boundary case
    // (e.g. baseline=0.05, current=0.0625, thresholdPct=25) is exact rather
    // than dropping a ULP into the < side after a divide-and-multiply.
    let delta_pct;
    let isRegression;
    if (base === 0) {
      delta_pct = current === 0 ? 0 : Infinity;
      isRegression = current > 0; // base=0+current>0 → always regression (D-01 edge)
    } else {
      const threshold = base * (1 + _thresholdPct / 100);
      delta_pct = ((current - base) / base) * 100;
      isRegression = current >= threshold;
    }

    agents_evaluated += 1;

    if (isRegression) {
      candidates.push({
        agent,
        baseline_p50_usd: base,
        current_p50_usd: current,
        delta_pct,
        cycles_observed: recentCycles.length,
      });
    }
  }

  candidates.sort((a, b) => b.delta_pct - a.delta_pct);
  const regressions = candidates.slice(0, 3);

  return {
    regressions,
    summary: {
      agents_evaluated,
      agents_skipped_insufficient_data: agents_skipped,
      regressions_count: regressions.length,
      threshold_pct: _thresholdPct,
      cycles_required: _cyclesRequired,
    },
  };
}

/**
 * Cache-hit-rate delta per agent: current hit rate over the most recent
 * `cyclesRequired` distinct cycles vs baseline hit rate.
 *
 * @param {object} opts
 * @param {object[]} opts.rows
 * @param {Record<string, {hit_rate?:number}>} opts.baseline
 * @param {number} [opts.cyclesRequired=3]
 * @returns {{ perAgent: Array<{agent:string, baseline_hit_rate:number, current_hit_rate:number, delta_pct:number, cycles_observed:number}> }}
 */
function computeCacheHitDelta({ rows, baseline, cyclesRequired } = {}) {
  const _cyclesRequired = cyclesRequired ?? 3;
  const _baseline = baseline || {};

  // Group by agent: { agent -> Map<cycle, { hits: number, total: number }> }
  const byAgent = new Map();
  for (const row of rows || []) {
    if (!row || typeof row.agent !== 'string' || typeof row.cycle !== 'string') continue;
    let bucket = byAgent.get(row.agent);
    if (!bucket) {
      bucket = { cycles: new Map() };
      byAgent.set(row.agent, bucket);
    }
    let cycleEntry = bucket.cycles.get(row.cycle);
    if (!cycleEntry) {
      cycleEntry = { hits: 0, total: 0 };
      bucket.cycles.set(row.cycle, cycleEntry);
    }
    cycleEntry.total += 1;
    if (row.cache_hit === true) cycleEntry.hits += 1;
  }

  /** @type {Array<{agent:string, baseline_hit_rate:number, current_hit_rate:number, delta_pct:number, cycles_observed:number}>} */
  const perAgent = [];
  for (const [agent, bucket] of byAgent.entries()) {
    const cycleKeys = [...bucket.cycles.keys()].sort().reverse();
    const recentCycles = cycleKeys.slice(0, _cyclesRequired);
    if (recentCycles.length === 0) continue;

    let hits = 0;
    let total = 0;
    for (const c of recentCycles) {
      const entry = bucket.cycles.get(c);
      hits += entry.hits;
      total += entry.total;
    }
    if (total === 0) continue;

    const current_hit_rate = hits / total;
    const baselineEntry = _baseline[agent];
    const baseline_hit_rate =
      baselineEntry && typeof baselineEntry.hit_rate === 'number' ? baselineEntry.hit_rate : 0;

    let delta_pct;
    if (baseline_hit_rate === 0) {
      delta_pct = current_hit_rate === 0 ? 0 : Infinity;
    } else {
      delta_pct = ((current_hit_rate - baseline_hit_rate) / baseline_hit_rate) * 100;
    }

    perAgent.push({
      agent,
      baseline_hit_rate,
      current_hit_rate,
      delta_pct,
      cycles_observed: recentCycles.length,
    });
  }

  return { perAgent };
}

/**
 * Aggregate wall_time_ms per agent across all cycles in `byCycle` and
 * compare current p95 to baseline p95. Flag agents whose
 * `current_p95 / baseline_p95 >= multiplierThreshold` (default 1.5).
 *
 * @param {object} opts
 * @param {Record<string, object[]>} opts.byCycle
 * @param {Record<string, {p95_ms?:number}>} opts.baseline
 * @param {number} [opts.multiplierThreshold=1.5]
 * @returns {{ spikes: Array<{agent:string, baseline_p95_ms:number, current_p95_ms:number, multiplier:number, cycles_observed:number}> }}
 */
function computeP95Spikes({ byCycle, baseline, multiplierThreshold } = {}) {
  const _multiplier = multiplierThreshold ?? 1.5;
  const _baseline = baseline || {};
  const _byCycle = byCycle || {};

  // Aggregate per agent: agent -> { walls: number[], cycles: Set<string> }
  /** @type {Map<string, { walls: number[], cycles: Set<string> }>} */
  const byAgent = new Map();
  for (const [cycle, entries] of Object.entries(_byCycle)) {
    for (const entry of entries || []) {
      if (!entry || typeof entry.agent !== 'string' || typeof entry.wall_time_ms !== 'number') {
        continue;
      }
      let bucket = byAgent.get(entry.agent);
      if (!bucket) {
        bucket = { walls: [], cycles: new Set() };
        byAgent.set(entry.agent, bucket);
      }
      bucket.walls.push(entry.wall_time_ms);
      bucket.cycles.add(cycle);
    }
  }

  /** @type {Array<{agent:string, baseline_p95_ms:number, current_p95_ms:number, multiplier:number, cycles_observed:number}>} */
  const spikes = [];
  for (const [agent, bucket] of byAgent.entries()) {
    const baselineEntry = _baseline[agent];
    if (!baselineEntry || typeof baselineEntry.p95_ms !== 'number') continue;
    const base = baselineEntry.p95_ms;
    if (base === 0) continue; // can't form a multiplier against zero
    const current_p95_ms = p95(bucket.walls);
    const multiplier = current_p95_ms / base;
    if (multiplier >= _multiplier) {
      spikes.push({
        agent,
        baseline_p95_ms: base,
        current_p95_ms,
        multiplier,
        cycles_observed: bucket.cycles.size,
      });
    }
  }

  return { spikes };
}

module.exports = { detectCostRegressions, computeCacheHitDelta, computeP95Spikes };
