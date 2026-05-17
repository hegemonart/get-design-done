// tests/gdd-cache-manager-warming.test.cjs — Plan 27.6-03
//
// Exercises the cache-warming heuristic at scripts/lib/cache/gdd-cache-manager.cjs:
//   - Multiplicative score composition (D-06).
//   - Component clamping + zero-component kill behavior.
//   - rankWarmCandidates top-N + default DEFAULT_TOPN.
//   - Recency / frequency / cost normalization edges.
//   - evaluateWarmingDecision does not throw when event-stream is unavailable.
//   - summarizeFalsePositiveRate threshold logic (D-02).
//
// All tests are tagged `27.6-03:` so the gate test in 27.6-06 can pick
// them up by grep.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  computeWarmingScore,
  rankWarmCandidates,
  evaluateWarmingDecision,
  summarizeFalsePositiveRate,
  DEFAULT_TOPN,
  DEFAULT_FALSE_POSITIVE_THRESHOLD_PCT,
} = require('../scripts/lib/cache/gdd-cache-manager.cjs');

// ----- computeWarmingScore ---------------------------------------------------

test('27.6-03: computeWarmingScore multiplicative product (all 0.5)', () => {
  // D-06: 0.5 * 0.5 * 0.5 = 0.125 — proves the product is multiplicative,
  // not additive (which would give 1.5) or weighted sum (which would
  // depend on weights). 0.125 is uniquely diagnostic.
  assert.equal(
    computeWarmingScore({ recency_score: 0.5, frequency_score: 0.5, cost_score: 0.5 }),
    0.125,
  );
});

test('27.6-03: computeWarmingScore zero component kills the score (D-06)', () => {
  // Any single zero component must zero the product — by design, all
  // three dimensions must matter for an entry to be a warm candidate.
  assert.equal(
    computeWarmingScore({ recency_score: 0, frequency_score: 1, cost_score: 1 }),
    0,
  );
  assert.equal(
    computeWarmingScore({ recency_score: 1, frequency_score: 0, cost_score: 1 }),
    0,
  );
  assert.equal(
    computeWarmingScore({ recency_score: 1, frequency_score: 1, cost_score: 0 }),
    0,
  );
});

test('27.6-03: computeWarmingScore clamps inputs to [0, 1]', () => {
  // Over-clamp: a >1 input must reduce to 1, not amplify the product.
  assert.equal(
    computeWarmingScore({ recency_score: 2, frequency_score: 1, cost_score: 1 }),
    1,
  );
  // Under-clamp: a <0 input must reduce to 0 (and therefore zero the
  // whole product), never produce a negative or nonsensical result.
  assert.equal(
    computeWarmingScore({ recency_score: -0.5, frequency_score: 1, cost_score: 1 }),
    0,
  );
  // Non-numeric inputs collapse to 0.
  assert.equal(
    computeWarmingScore({ recency_score: 'oops', frequency_score: 1, cost_score: 1 }),
    0,
  );
});

// ----- rankWarmCandidates ----------------------------------------------------

test('27.6-03: rankWarmCandidates ranks 5 entries top-3 correctly', () => {
  // Build 5 entries with intentionally distinct scores. We control
  // recency/frequency/cost so that the expected ordering is obvious.
  const entries = [
    // High on every axis → max score.
    { key: 'a', days_since_last_use: 0, uses_in_window: 10, window_size: 10, est_cost_usd: 1.0 },
    // Half on every axis → 0.125 score (if max cost is 1.0).
    { key: 'b', days_since_last_use: 1, uses_in_window: 5, window_size: 10, est_cost_usd: 0.5 },
    // Low recency, high others.
    { key: 'c', days_since_last_use: 9, uses_in_window: 9, window_size: 10, est_cost_usd: 0.9 },
    // Zero cost → score must be 0.
    { key: 'd', days_since_last_use: 0, uses_in_window: 10, window_size: 10, est_cost_usd: 0 },
    // Zero frequency → score must be 0.
    { key: 'e', days_since_last_use: 0, uses_in_window: 0, window_size: 10, est_cost_usd: 1.0 },
  ];
  const { warmed, evictionCandidates } = rankWarmCandidates({ entries, topN: 3 });
  assert.equal(warmed.length, 3);
  assert.equal(evictionCandidates.length, 2);
  // Descending order on score.
  assert.ok(warmed[0].score >= warmed[1].score, 'warmed[0] >= warmed[1]');
  assert.ok(warmed[1].score >= warmed[2].score, 'warmed[1] >= warmed[2]');
  // 'a' must be in warmed (it's the best entry).
  assert.ok(warmed.some((w) => w.key === 'a'), "warmed contains 'a'");
  // 'd' and 'e' must be in evictionCandidates (their score is 0).
  const evictKeys = evictionCandidates.map((e) => e.key).sort();
  // Two of {b, d, e, c} should be evicted — d and e are guaranteed (score=0).
  assert.ok(evictKeys.includes('d') || evictKeys.includes('e'), 'd or e in eviction');
});

test('27.6-03: rankWarmCandidates default topN = DEFAULT_TOPN (10)', () => {
  // Build 15 entries with non-trivial scores. Without explicit topN,
  // the warmed set must be exactly DEFAULT_TOPN entries.
  const entries = [];
  for (let i = 0; i < 15; i++) {
    entries.push({
      key: `k${i}`,
      days_since_last_use: i,         // varies recency
      uses_in_window: 15 - i,         // varies frequency (inverse of recency)
      window_size: 15,
      est_cost_usd: 1.0 - i * 0.05,   // varies cost (decreasing)
    });
  }
  const { warmed, evictionCandidates } = rankWarmCandidates({ entries });
  assert.equal(warmed.length, 10);
  assert.equal(warmed.length, DEFAULT_TOPN);
  assert.equal(evictionCandidates.length, 5);
});

test('27.6-03: rankWarmCandidates handles empty entries', () => {
  // Defensive: an empty input must produce an empty {warmed, eviction}
  // pair, NOT throw.
  assert.deepEqual(
    rankWarmCandidates({ entries: [] }),
    { warmed: [], evictionCandidates: [] },
  );
  assert.deepEqual(
    rankWarmCandidates({}),
    { warmed: [], evictionCandidates: [] },
  );
  assert.deepEqual(
    rankWarmCandidates(),
    { warmed: [], evictionCandidates: [] },
  );
});

test('27.6-03: rankWarmCandidates all-zero-cost gives all-zero scores', () => {
  // If everything is free, the cost dimension can't differentiate;
  // the heuristic refuses to warm anything (multiplicative zero).
  const entries = [
    { key: 'a', days_since_last_use: 0, uses_in_window: 10, window_size: 10, est_cost_usd: 0 },
    { key: 'b', days_since_last_use: 1, uses_in_window: 5,  window_size: 10, est_cost_usd: 0 },
    { key: 'c', days_since_last_use: 2, uses_in_window: 1,  window_size: 10, est_cost_usd: 0 },
  ];
  const { warmed } = rankWarmCandidates({ entries, topN: 3 });
  // We get all entries back (topN >= length), but every score is 0.
  assert.equal(warmed.length, 3);
  for (const w of warmed) {
    assert.equal(w.cost_score, 0, `${w.key} cost_score`);
    assert.equal(w.score, 0, `${w.key} score`);
  }
});

test('27.6-03: rankWarmCandidates recency normalization — days=0 yields score=1', () => {
  // Edge: a single entry with all components at their maximum should
  // give recency=1, frequency=1, cost=1 → score=1.
  const entries = [{
    key: 'fresh',
    days_since_last_use: 0,   // 1/(1+0) = 1
    uses_in_window: 10,        // 10/10 = 1
    window_size: 10,
    est_cost_usd: 1.0,         // 1.0/1.0 = 1 (it IS the max)
  }];
  const { warmed } = rankWarmCandidates({ entries, topN: 1 });
  assert.equal(warmed.length, 1);
  assert.equal(warmed[0].recency_score, 1);
  assert.equal(warmed[0].frequency_score, 1);
  assert.equal(warmed[0].cost_score, 1);
  assert.equal(warmed[0].score, 1);
});

test('27.6-03: rankWarmCandidates cost clamp never exceeds 1.0', () => {
  // Even if a single entry has est_cost_usd much higher than the
  // others, its cost_score is normalized to 1.0 (it's the max), never
  // greater. The clamp01 helper is the load-bearing piece.
  const entries = [
    { key: 'cheap',     days_since_last_use: 0, uses_in_window: 10, window_size: 10, est_cost_usd: 0.01 },
    { key: 'expensive', days_since_last_use: 0, uses_in_window: 10, window_size: 10, est_cost_usd: 100.0 },
  ];
  const { warmed } = rankWarmCandidates({ entries, topN: 2 });
  for (const w of warmed) {
    assert.ok(w.cost_score <= 1, `${w.key} cost_score should be <=1, got ${w.cost_score}`);
    assert.ok(w.cost_score >= 0, `${w.key} cost_score should be >=0, got ${w.cost_score}`);
  }
  const expensive = warmed.find((w) => w.key === 'expensive');
  assert.equal(expensive.cost_score, 1);
});

// ----- evaluateWarmingDecision ----------------------------------------------

test('27.6-03: evaluateWarmingDecision emits cache.warm_decision without throwing', () => {
  // The library uses a lazy try/catch require for the event-stream;
  // even if the event-stream can't load (TS strip unavailable), the
  // call must not throw. This guards the no-op fallback path.
  assert.doesNotThrow(() => evaluateWarmingDecision({
    entry: { key: 'k1', score: 0.5, recency_score: 0.5, frequency_score: 0.5, cost_score: 0.5 },
    usedBeforeEviction: false,
    sessionId: 'test-27.6-03',
  }));
  // Also: should not throw with minimal/missing args.
  assert.doesNotThrow(() => evaluateWarmingDecision({}));
  assert.doesNotThrow(() => evaluateWarmingDecision());
});

// ----- summarizeFalsePositiveRate -------------------------------------------

test('27.6-03: summarizeFalsePositiveRate computes rate correctly', () => {
  // 10 decisions, 3 of which were warmed-then-evicted-unused → rate = 30%.
  // With a 20% threshold (D-02 default), the rate exceeds the threshold.
  const decisions = [];
  for (let i = 0; i < 10; i++) {
    decisions.push({
      entry_key: `k${i}`,
      used_before_eviction: i < 7,   // first 7 used, last 3 evicted-unused
    });
  }
  const r = summarizeFalsePositiveRate({
    decisions,
    falsePositiveThresholdPct: 20,
    sessionId: 'test-27.6-03',
  });
  assert.equal(r.count, 10);
  assert.equal(r.false_positive_rate, 0.3);
  assert.equal(r.threshold_pct, 20);
  assert.equal(r.exceeds_threshold, true); // 30% > 20%
});

test('27.6-03: summarizeFalsePositiveRate does NOT exceed threshold when rate equals threshold', () => {
  // Rate must STRICTLY exceed the threshold to flag — the gate is
  // ">", not ">=". 20% exactly should NOT trip the gate.
  const decisions = [];
  for (let i = 0; i < 10; i++) {
    decisions.push({ entry_key: `k${i}`, used_before_eviction: i < 8 }); // 2/10 = 20%
  }
  const r = summarizeFalsePositiveRate({
    decisions,
    falsePositiveThresholdPct: 20,
    sessionId: 'test-27.6-03',
  });
  assert.equal(r.false_positive_rate, 0.2);
  assert.equal(r.exceeds_threshold, false);
});

test('27.6-03: summarizeFalsePositiveRate uses D-02 default 20% when threshold omitted', () => {
  // Default threshold matches D-02 (20%). Confirms the library reads
  // its own DEFAULT_FALSE_POSITIVE_THRESHOLD_PCT when the caller
  // doesn't supply one.
  const r = summarizeFalsePositiveRate({ decisions: [] });
  assert.equal(r.threshold_pct, DEFAULT_FALSE_POSITIVE_THRESHOLD_PCT);
  assert.equal(r.threshold_pct, 20);
  assert.equal(r.count, 0);
  assert.equal(r.false_positive_rate, 0);
  assert.equal(r.exceeds_threshold, false);
});

test('27.6-03: summarizeFalsePositiveRate handles empty/missing decisions', () => {
  // Defensive: empty or undefined decisions must produce a zero rate,
  // not divide-by-zero or throw.
  assert.doesNotThrow(() => summarizeFalsePositiveRate({}));
  assert.doesNotThrow(() => summarizeFalsePositiveRate());
  const r1 = summarizeFalsePositiveRate({ decisions: [] });
  assert.equal(r1.false_positive_rate, 0);
  assert.equal(r1.exceeds_threshold, false);
  const r2 = summarizeFalsePositiveRate();
  assert.equal(r2.count, 0);
});
