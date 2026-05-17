/**
 * scripts/lib/cache/gdd-cache-manager.cjs — Plan 27.6-03
 *
 * Cache-warming heuristic (Phase 10.1 cost-governance refinement,
 * Phase 27.6 D-06): score each candidate entry as the multiplicative
 * product of three [0,1]-normalized components — recency, frequency,
 * cost — and warm the top-N entries per cycle.
 *
 * Eviction policy: LRU within the warmed set. When a new top-rank
 * candidate arrives, it displaces the oldest-touched entry from the
 * warmed slot (D-06 wording).
 *
 * Telemetry: each per-cycle decision emits a `cache.warm_decision`
 * event via Phase 22 event-stream so the Phase 27.6-01 perf-analyzer
 * can surface "false-positive rate exceeds threshold" proposals
 * (D-02: 20% default; configurable via
 * `.design/budget.json#cache_warming_falsepositive_threshold`).
 *
 * Pure functions + side-effects-via-appendEvent. No external deps
 * beyond `node:` builtins and the lazy event-stream require.
 *
 * @module scripts/lib/cache/gdd-cache-manager
 */
'use strict';

// `node:fs` and `node:path` are required by the contract (lazy
// future-extension surface for budget.json reads); event-stream is
// loaded lazily via try/catch so this library is consumable from pure
// CommonJS runtimes that cannot strip TypeScript on the fly.
const path = require('node:path'); // eslint-disable-line no-unused-vars
const fs = require('node:fs');     // eslint-disable-line no-unused-vars

/**
 * Default top-N candidates warmed per cycle. Override per-call via
 * `rankWarmCandidates({ entries, topN })` or via
 * `.design/budget.json#cache_warm_topn` at the caller level.
 *
 * @type {number}
 */
const DEFAULT_TOPN = 10;

/**
 * Default false-positive tolerance threshold percentage (D-02).
 * When more than this percent of warmed entries are evicted before
 * being read in a single cycle, the heuristic emits a per-cycle
 * `cache.warm_decision` summary event so the perf-analyzer can flag
 * the heuristic as mis-tuned.
 *
 * Configurable per-call via the `falsePositiveThresholdPct` argument
 * to `summarizeFalsePositiveRate`, or at the project level via
 * `.design/budget.json#cache_warming_falsepositive_threshold`.
 *
 * @type {number}
 */
const DEFAULT_FALSE_POSITIVE_THRESHOLD_PCT = 20;

/**
 * Clamp a number to the [0, 1] range. Non-finite / non-numeric inputs
 * collapse to 0 — by design, since a non-numeric component cannot
 * meaningfully participate in the multiplicative score.
 *
 * @param {unknown} n
 * @returns {number}
 */
function clamp01(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Lazily resolve the Phase 22 event-stream `appendEvent` function.
 * The event-stream is shipped as `index.ts` (TypeScript); under a
 * pure-CommonJS runtime that cannot strip TS on the fly, the require
 * will throw. We swallow that and return a no-op so this library
 * stays usable in any caller — tests, CJS scripts, or the
 * cache-manager slash skill — without forcing them to install a
 * TS loader.
 *
 * @returns {(ev: object) => void}
 */
function getAppendEvent() {
  try {
    // Resolved relative to this file: `scripts/lib/cache/` → `../event-stream`.
    const m = require('../event-stream');
    if (m && typeof m.appendEvent === 'function') return m.appendEvent;
  } catch {
    // Swallow — fall through to the no-op below. The event is
    // best-effort telemetry; losing one decision is acceptable.
  }
  return function noopAppend(_ev) { /* event-stream unavailable */ };
}

/**
 * Compute the multiplicative warming score for a single candidate
 * (D-06). Each component is clamped to [0, 1] before multiplication;
 * any zero component zeroes the entire score by design — all three
 * dimensions (recency, frequency, cost) must be non-zero for an
 * entry to be a warm candidate at all.
 *
 * @param {{recency_score:number, frequency_score:number, cost_score:number}} components
 * @returns {number} score in [0, 1]
 */
function computeWarmingScore({ recency_score, frequency_score, cost_score } = {}) {
  const r = clamp01(recency_score);
  const f = clamp01(frequency_score);
  const c = clamp01(cost_score);
  return r * f * c;
}

/**
 * Rank a list of cache candidates by multiplicative warming score and
 * return the top-N as the warmed set, with the remainder as eviction
 * candidates. Pure: no I/O, no event emission.
 *
 * Component normalization:
 *   recency_score   = 1 / (1 + days_since_last_use)
 *   frequency_score = uses_in_window / window_size              (clamped)
 *   cost_score      = est_cost_usd / max(est_cost_usd)          (clamped)
 *
 * If all entries have `est_cost_usd === 0`, all cost_scores collapse
 * to 0 (and therefore all final scores collapse to 0) — the heuristic
 * never warms cost-free entries, by design.
 *
 * Eviction policy: entries beyond the top-N rank are returned in
 * `evictionCandidates`. The caller (cache-manager skill) treats the
 * warmed set as LRU internally — when a new entry beats an existing
 * warmed entry, the LRU entry in the warmed set is the one displaced.
 *
 * @param {{
 *   entries?: Array<{
 *     key: string,
 *     days_since_last_use?: number,
 *     uses_in_window?: number,
 *     window_size?: number,
 *     est_cost_usd?: number,
 *     last_touched_at?: string,
 *   }>,
 *   topN?: number,
 * }} args
 * @returns {{warmed: Array<object>, evictionCandidates: Array<object>}}
 */
function rankWarmCandidates({ entries, topN } = {}) {
  const N = typeof topN === 'number' && topN > 0 ? Math.floor(topN) : DEFAULT_TOPN;
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) return { warmed: [], evictionCandidates: [] };

  // Determine the per-cycle max cost for normalization. If everything
  // is free, the cost dimension contributes 0 to every score (which
  // zeroes the multiplicative product — that's intentional).
  let maxCost = 0;
  for (const e of list) {
    const c = typeof e.est_cost_usd === 'number' && e.est_cost_usd > 0 ? e.est_cost_usd : 0;
    if (c > maxCost) maxCost = c;
  }

  const scored = list.map((e) => {
    const days = typeof e.days_since_last_use === 'number' && e.days_since_last_use >= 0
      ? e.days_since_last_use
      : Infinity;
    const recency_score = days === Infinity ? 0 : 1 / (1 + days);

    const usesIn = typeof e.uses_in_window === 'number' && e.uses_in_window >= 0
      ? e.uses_in_window
      : 0;
    const win = typeof e.window_size === 'number' && e.window_size > 0
      ? e.window_size
      : 1;
    const frequency_score = clamp01(usesIn / win);

    const cost = typeof e.est_cost_usd === 'number' && e.est_cost_usd >= 0
      ? e.est_cost_usd
      : 0;
    const cost_score = maxCost > 0 ? clamp01(cost / maxCost) : 0;

    const score = computeWarmingScore({ recency_score, frequency_score, cost_score });
    return { ...e, recency_score, frequency_score, cost_score, score };
  });

  // Sort by score descending. Stable order on ties is fine for v1.
  scored.sort((a, b) => b.score - a.score);

  const warmed = scored.slice(0, N);
  const evictionCandidates = scored.slice(N);
  return { warmed, evictionCandidates };
}

/**
 * Emit one `cache.warm_decision` event recording the outcome of a
 * single warmed entry: was it used before being evicted, or did the
 * heuristic mis-warm (false-positive)?
 *
 * Called per warmed entry at eviction time by the cache layer. The
 * 27.6-01 perf-analyzer aggregates these to compute per-cycle
 * false-positive rates.
 *
 * Side effect only — returns void. The function is best-effort:
 * if the event-stream is unavailable, the emission silently no-ops.
 *
 * @param {{
 *   entry: {key:string, score:number, recency_score:number, frequency_score:number, cost_score:number},
 *   usedBeforeEviction: boolean,
 *   evictionEvent?: {at?: string, reason?: string},
 *   sessionId?: string,
 * }} args
 * @returns {void}
 */
function evaluateWarmingDecision({ entry, usedBeforeEviction, evictionEvent, sessionId } = {}) {
  const append = getAppendEvent();
  const e = entry && typeof entry === 'object' ? entry : {};
  append({
    type: 'cache.warm_decision',
    timestamp: new Date().toISOString(),
    sessionId: typeof sessionId === 'string' && sessionId.length > 0
      ? sessionId
      : 'cache-manager',
    payload: {
      entry_key: typeof e.key === 'string' ? e.key : 'unknown',
      score: typeof e.score === 'number' ? e.score : 0,
      recency_score: typeof e.recency_score === 'number' ? e.recency_score : 0,
      frequency_score: typeof e.frequency_score === 'number' ? e.frequency_score : 0,
      cost_score: typeof e.cost_score === 'number' ? e.cost_score : 0,
      used_before_eviction: !!usedBeforeEviction,
      evicted_at: evictionEvent && typeof evictionEvent.at === 'string'
        ? evictionEvent.at
        : undefined,
    },
  });
}

/**
 * Aggregate a cycle's worth of per-entry decisions into a single
 * false-positive rate. If the rate exceeds the configured threshold
 * (D-02 default 20%), emit a per-cycle summary `cache.warm_decision`
 * event so the perf-analyzer can flag the heuristic as mis-tuned.
 *
 * Returns the computed rate + threshold context regardless of whether
 * an event was emitted, so the caller can route the result into its
 * own reporting surface (e.g. the cache-manager slash skill's status
 * output).
 *
 * @param {{
 *   decisions?: Array<{entry_key?:string, used_before_eviction?:boolean, score?:number}>,
 *   falsePositiveThresholdPct?: number,
 *   sessionId?: string,
 * }} args
 * @returns {{false_positive_rate:number, count:number, threshold_pct:number, exceeds_threshold:boolean}}
 */
function summarizeFalsePositiveRate({ decisions, falsePositiveThresholdPct, sessionId } = {}) {
  const list = Array.isArray(decisions) ? decisions : [];
  const total = list.length;
  let evictedUnused = 0;
  for (const d of list) {
    if (d && d.used_before_eviction === false) evictedUnused++;
  }
  const false_positive_rate = total === 0 ? 0 : evictedUnused / total;
  const threshold_pct = typeof falsePositiveThresholdPct === 'number' && Number.isFinite(falsePositiveThresholdPct)
    ? falsePositiveThresholdPct
    : DEFAULT_FALSE_POSITIVE_THRESHOLD_PCT;
  const exceeds_threshold = false_positive_rate * 100 > threshold_pct;

  if (exceeds_threshold) {
    const append = getAppendEvent();
    append({
      type: 'cache.warm_decision',
      timestamp: new Date().toISOString(),
      sessionId: typeof sessionId === 'string' && sessionId.length > 0
        ? sessionId
        : 'cache-manager',
      payload: {
        entry_key: '<cycle-summary>',
        score: 0,
        recency_score: 0,
        frequency_score: 0,
        cost_score: 0,
        false_positive_rate,
      },
    });
  }

  return { false_positive_rate, count: total, threshold_pct, exceeds_threshold };
}

module.exports = {
  computeWarmingScore,
  rankWarmCandidates,
  evaluateWarmingDecision,
  summarizeFalsePositiveRate,
  DEFAULT_TOPN,
  DEFAULT_FALSE_POSITIVE_THRESHOLD_PCT,
};
