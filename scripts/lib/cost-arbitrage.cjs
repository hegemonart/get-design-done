// scripts/lib/cost-arbitrage.cjs
//
// Plan 26-06 — cross-runtime cost-arbitrage analysis (D-09).
//
// Pure function: given a sequence of cost events (each tagged with
// runtime, agent, tier, cycle, and cost), surfaces structured arbitrage
// proposals when one runtime's spend on a given `(agent, tier)` pair
// significantly exceeds another's over the most recent N cycles.
//
// Contract:
//   analyze(events, options?) → proposals[]
//
// Inputs:
//   * `events` — array of event envelopes shaped like Phase 22's
//     `cost.update` events:
//       {
//         type: 'cost.update',
//         cycle?: 'cycle-3',
//         payload: {
//           agent: 'design-reflector',
//           tier: 'opus',
//           runtime: 'claude' | 'codex' | …,
//           usd: 0.42,
//           ...
//         }
//       }
//     Non-cost events and malformed entries are skipped silently.
//   * `options.windowCycles` — how many of the most recent cycles to
//     consider. Default 5 (D-09). Cycles are ordered by first-appearance
//     in the events array (events.jsonl is append-only, so insertion
//     order ≡ chronological order).
//   * `options.thresholdPct` — relative-delta threshold above which an
//     arbitrage signal is emitted. Default 0.5 (50%, D-09). Computed as
//     `|maxAvg - minAvg| / minAvg`. The 50% number is a starting
//     heuristic; bandit-style learning over arbitrage outcomes is
//     Phase 23.5+ territory.
//
// Output:
//   Array of structured proposals, each shaped like:
//     {
//       type: 'cost_arbitrage',
//       agent: 'design-reflector',
//       tier: 'opus',
//       runtimes: {
//         claude: { avg_cost_per_cycle: 0.42, n_cycles: 5 },
//         codex:  { avg_cost_per_cycle: 1.10, n_cycles: 5 }
//       },
//       delta_pct: 0.617,
//       proposal: 'Switch design-reflector tier=opus invocations from codex to claude for ~62% cost saving',
//       evidence_window: 'last_5_cycles'
//     }
//
// Design notes:
//   - Per-cycle averaging: events are first summed per
//     (agent, tier, runtime, cycle), then averaged across the cycles
//     where that triple was observed. This prevents per-runtime
//     double-counting when a single cycle had multiple agent spawns
//     in the same runtime (sum first, average next).
//   - Mixed-runtime cycle history: a cycle that ran some spawns in CC
//     and others in Codex is correctly attributed — each spawn's
//     `payload.runtime` tag drives the bucket, never the cycle.
//   - Single-runtime-only history: when only one runtime has events
//     for a given (agent, tier), no arbitrage signal can be computed
//     (need at least two runtimes to compare). The rule is silent — no
//     false-positive proposals.
//   - Pure: no I/O, no global state. Tests inject synthetic event
//     arrays; production callers (the reflector agent) read
//     `.design/telemetry/events.jsonl`, parse line-by-line, and pass
//     the parsed array in.

'use strict';

const DEFAULT_WINDOW_CYCLES = 5;
const DEFAULT_THRESHOLD_PCT = 0.5;

const COST_EVENT_TYPE = 'cost.update';

/**
 * Phase 26-05 will tag cost events with a `runtime` field on
 * `payload.runtime`. We accept that as the canonical site. As a fallback
 * (for legacy events written before 26-05 lands, or for harnesses that
 * stamp the runtime on the envelope's `_meta.runtime` instead), we also
 * peek at top-level `runtime` and `_meta.runtime`. Whichever is present
 * wins; payload-first to keep 26-05's contract authoritative.
 */
function extractRuntime(event) {
  if (!event || typeof event !== 'object') return null;
  const p = event.payload;
  if (p && typeof p === 'object' && typeof p.runtime === 'string' && p.runtime.length > 0) {
    return p.runtime;
  }
  if (typeof event.runtime === 'string' && event.runtime.length > 0) {
    return event.runtime;
  }
  const meta = event._meta;
  if (meta && typeof meta === 'object' && typeof meta.runtime === 'string' && meta.runtime.length > 0) {
    return meta.runtime;
  }
  return null;
}

/**
 * Extract the (agent, tier, runtime, cycle, usd) tuple from a single
 * event envelope. Returns null when the event is not a cost.update or
 * is missing any required field. Garbage input never throws.
 */
function extractCostRow(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type !== COST_EVENT_TYPE) return null;
  const p = event.payload;
  if (!p || typeof p !== 'object') return null;
  if (typeof p.agent !== 'string' || p.agent.length === 0) return null;
  if (typeof p.tier !== 'string' || p.tier.length === 0) return null;
  const runtime = extractRuntime(event);
  if (runtime === null) return null;
  const usd = typeof p.usd === 'number' && Number.isFinite(p.usd) ? p.usd : null;
  if (usd === null) return null;
  // Cycle is optional in the BaseEvent envelope but required for
  // per-cycle averaging. Events without a cycle are silently skipped —
  // they would otherwise collapse all of history into a single bucket
  // and produce misleading averages.
  const cycle = typeof event.cycle === 'string' && event.cycle.length > 0
    ? event.cycle
    : null;
  if (cycle === null) return null;
  return { agent: p.agent, tier: p.tier, runtime, cycle, usd };
}

/**
 * Build the per-(agent, tier, runtime, cycle) sum map. This is the
 * primary defense against double-counting: if a cycle has 4 spawns of
 * design-verifier in claude, those 4 usd values become a single
 * cycle-bucket sum; downstream averaging then divides by the number of
 * cycles, not the number of spawns.
 */
function aggregateByCycle(events) {
  // Map<agent, Map<tier, Map<runtime, Map<cycle, sum-usd>>>>
  const buckets = new Map();
  // Cycle ordering: the order each cycle id first appears in the
  // events stream. Events.jsonl is append-only, so first-appearance
  // ≡ chronological order. We don't try to parse cycle ids as
  // sequential — slugs like "cycle-3" or "2026-04-29" are both valid.
  const cycleOrder = [];
  const seenCycles = new Set();

  for (const ev of events) {
    const row = extractCostRow(ev);
    if (row === null) continue;
    if (!seenCycles.has(row.cycle)) {
      seenCycles.add(row.cycle);
      cycleOrder.push(row.cycle);
    }
    let agentBucket = buckets.get(row.agent);
    if (agentBucket === undefined) {
      agentBucket = new Map();
      buckets.set(row.agent, agentBucket);
    }
    let tierBucket = agentBucket.get(row.tier);
    if (tierBucket === undefined) {
      tierBucket = new Map();
      agentBucket.set(row.tier, tierBucket);
    }
    let runtimeBucket = tierBucket.get(row.runtime);
    if (runtimeBucket === undefined) {
      runtimeBucket = new Map();
      tierBucket.set(row.runtime, runtimeBucket);
    }
    const existing = runtimeBucket.get(row.cycle);
    runtimeBucket.set(row.cycle, (existing === undefined ? 0 : existing) + row.usd);
  }
  return { buckets, cycleOrder };
}

/**
 * Compute per-runtime averages for a single (agent, tier) pair,
 * restricted to the window of recent cycles. Returns:
 *   { runtime: { avg_cost_per_cycle, n_cycles } }
 * Only runtimes with at least one cycle in the window appear.
 */
function averageWithinWindow(tierBucket, cycleWindowSet) {
  const out = {};
  for (const [runtime, runtimeBucket] of tierBucket.entries()) {
    let sum = 0;
    let n = 0;
    for (const [cycle, cycleSum] of runtimeBucket.entries()) {
      if (!cycleWindowSet.has(cycle)) continue;
      sum += cycleSum;
      n += 1;
    }
    if (n === 0) continue;
    out[runtime] = { avg_cost_per_cycle: sum / n, n_cycles: n };
  }
  return out;
}

/**
 * Build the proposal sentence. Fixed phrasing keeps test assertions
 * stable across cycle slugs. Direction (cheap-runtime, expensive-runtime)
 * is inferred from the averages.
 */
function buildProposalText(agent, tier, cheapRuntime, expensiveRuntime, deltaPct) {
  const pct = Math.round(deltaPct * 100);
  return `Switch ${agent} tier=${tier} invocations from ${expensiveRuntime} to ${cheapRuntime} for ~${pct}% cost saving`;
}

/**
 * Main entry point. See module-level header for contract.
 */
function analyze(events, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const windowCycles = typeof opts.windowCycles === 'number' && opts.windowCycles > 0
    ? Math.floor(opts.windowCycles)
    : DEFAULT_WINDOW_CYCLES;
  const thresholdPct = typeof opts.thresholdPct === 'number' && opts.thresholdPct > 0
    ? opts.thresholdPct
    : DEFAULT_THRESHOLD_PCT;

  if (!Array.isArray(events) || events.length === 0) return [];

  const { buckets, cycleOrder } = aggregateByCycle(events);
  if (cycleOrder.length === 0) return [];

  // Window = last N cycles by first-appearance order.
  const recentCycles = cycleOrder.slice(-windowCycles);
  const cycleWindowSet = new Set(recentCycles);
  const evidenceWindowLabel = `last_${recentCycles.length}_cycles`;

  const proposals = [];

  // Iterate (agent, tier) pairs deterministically (sorted) so output
  // ordering is stable across runs and platforms — useful for snapshot
  // tests and reproducible reflection files.
  const agentNames = Array.from(buckets.keys()).sort();
  for (const agent of agentNames) {
    const agentBucket = buckets.get(agent);
    if (agentBucket === undefined) continue;
    const tierNames = Array.from(agentBucket.keys()).sort();
    for (const tier of tierNames) {
      const tierBucket = agentBucket.get(tier);
      if (tierBucket === undefined) continue;
      const runtimeAverages = averageWithinWindow(tierBucket, cycleWindowSet);
      const runtimeIds = Object.keys(runtimeAverages);
      // Single-runtime-only history → silent (D-09: no false-positive
      // arbitrage signal when there's nothing to compare against).
      if (runtimeIds.length < 2) continue;

      // Find the runtime pair with the largest spread. We could emit
      // one proposal per runtime pair but that gets noisy fast — the
      // reflector wants the most-actionable signal first. Pair = (min, max).
      let minRuntime = null;
      let maxRuntime = null;
      let minAvg = Infinity;
      let maxAvg = -Infinity;
      for (const r of runtimeIds) {
        const v = runtimeAverages[r];
        if (v === undefined) continue;
        const avg = v.avg_cost_per_cycle;
        if (avg < minAvg) { minAvg = avg; minRuntime = r; }
        if (avg > maxAvg) { maxAvg = avg; maxRuntime = r; }
      }
      if (minRuntime === null || maxRuntime === null) continue;
      if (minRuntime === maxRuntime) continue;
      // Guard against zero-cost denominators — if both runtimes
      // averaged $0 we have nothing to arbitrage; if only one did
      // we report a finite spread but zero-divide on the threshold
      // check, which would emit a misleading "Infinity%" proposal.
      if (minAvg <= 0) continue;

      const deltaPct = (maxAvg - minAvg) / minAvg;
      if (deltaPct <= thresholdPct) continue;

      proposals.push({
        type: 'cost_arbitrage',
        agent,
        tier,
        runtimes: runtimeAverages,
        delta_pct: Number(deltaPct.toFixed(3)),
        proposal: buildProposalText(agent, tier, minRuntime, maxRuntime, deltaPct),
        evidence_window: evidenceWindowLabel,
      });
    }
  }

  return proposals;
}

module.exports = {
  analyze,
  // Exposed for test injection / unit-testing the lower layers.
  extractCostRow,
  aggregateByCycle,
  DEFAULT_WINDOW_CYCLES,
  DEFAULT_THRESHOLD_PCT,
};
