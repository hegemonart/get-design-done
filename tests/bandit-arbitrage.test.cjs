// tests/bandit-arbitrage.test.cjs — Plan 27.5-04
//
// Unit tests for scripts/lib/bandit-arbitrage.cjs analyze() function.
// Pure-function — no tmpdirs, no I/O, deterministic synthetic posteriors.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  analyze,
  mean,
  stddev,
  findArmsForSlice,
  DEFAULT_PULL_COUNT_THRESHOLD,
  DEFAULT_STDDEV_THRESHOLD,
  DEFAULT_DELTA_PCT,
  DEFAULT_DELEGATE_FILTER,
  TIERS,
} = require('../scripts/lib/bandit-arbitrage.cjs');

// -------------------------------------------------------------------
// Helper sanity tests (small, defensive)
// -------------------------------------------------------------------

test('27.5-04: mean/stddev compute Beta moments correctly', () => {
  // mean(α, β) = α / (α + β)
  assert.equal(mean(10, 10), 0.5);
  assert.equal(mean(0, 0), 0);
  assert.equal(mean(9, 1), 0.9);

  // stddev(α, β) = sqrt(αβ / ((α+β)² · (α+β+1)))
  // For α=10, β=10: variance = 100 / (400 · 21) = 100/8400 ≈ 0.01190
  // stddev ≈ 0.1091
  const s = stddev(10, 10);
  assert.ok(s > 0.108 && s < 0.110, `expected ≈0.109, got ${s}`);
  assert.equal(stddev(0, 0), 0);
});

test('27.5-04: defaults match plan spec (D-10)', () => {
  assert.equal(DEFAULT_PULL_COUNT_THRESHOLD, 3);
  assert.equal(DEFAULT_STDDEV_THRESHOLD, 0.05);
  assert.equal(DEFAULT_DELTA_PCT, 0.5);
  assert.equal(DEFAULT_DELEGATE_FILTER, 'none');
  assert.deepEqual([...TIERS], ['haiku', 'sonnet', 'opus']);
});

// -------------------------------------------------------------------
// analyze() rule-branch coverage
// -------------------------------------------------------------------

test('27.5-04: empty arms → empty proposals', () => {
  const out = analyze({ arms: [] }, { frontmatters: { a: 'sonnet' } });
  assert.deepEqual(out, []);
});

test('27.5-04: arms without frontmatters → empty proposals', () => {
  const posterior = {
    arms: [
      { agent: 'a', bin: 'medium', tier: 'opus', alpha: 50, beta: 1, count: 10 },
      { agent: 'a', bin: 'medium', tier: 'sonnet', alpha: 30, beta: 30, count: 5 },
    ],
  };
  const out = analyze(posterior, {}); // no frontmatters
  assert.deepEqual(out, []);
});

test('27.5-04: malformed posterior (null/undefined/non-object) → empty proposals', () => {
  assert.deepEqual(analyze(null, { frontmatters: { a: 'sonnet' } }), []);
  assert.deepEqual(analyze(undefined, { frontmatters: { a: 'sonnet' } }), []);
  assert.deepEqual(analyze('not an object', { frontmatters: { a: 'sonnet' } }), []);
  // posterior with non-array arms
  assert.deepEqual(analyze({ arms: 'oops' }, { frontmatters: { a: 'sonnet' } }), []);
  // posterior missing arms entirely
  assert.deepEqual(analyze({}, { frontmatters: { a: 'sonnet' } }), []);
});

test('27.5-04: single-tier-only slice → silent', () => {
  const posterior = {
    arms: [
      { agent: 'a', bin: 'medium', tier: 'opus', alpha: 50, beta: 1, count: 10 },
    ],
  };
  const out = analyze(posterior, { frontmatters: { a: 'sonnet' } });
  assert.deepEqual(out, []);
});

test('27.5-04: <3 pulls → silent', () => {
  const posterior = {
    arms: [
      { agent: 'a', bin: 'medium', tier: 'opus', alpha: 50, beta: 1, count: 1 },
      { agent: 'a', bin: 'medium', tier: 'sonnet', alpha: 30, beta: 30, count: 1 },
    ],
  };
  const out = analyze(posterior, { frontmatters: { a: 'sonnet' } });
  assert.deepEqual(out, []);
});

test('27.5-04: stale frontmatter signal fires', () => {
  // opus mean = 50/51 ≈ 0.980  → best
  // sonnet mean = 30/60 = 0.500
  // haiku mean = 20/50 = 0.400
  // opus vs sonnet delta = (0.980-0.500)/0.500 = 0.96 (96%) > 50%
  // opus stddev = sqrt(50/(51²·52)) ≈ 0.0194 < 0.05
  // total pulls = 10+5+3 = 18 ≥ 3
  // frontmatter says 'sonnet'; best is 'opus' → mismatch → emit
  const posterior = {
    arms: [
      { agent: 'design-verifier', bin: 'medium', tier: 'opus', alpha: 50, beta: 1, count: 10 },
      { agent: 'design-verifier', bin: 'medium', tier: 'sonnet', alpha: 30, beta: 30, count: 5 },
      { agent: 'design-verifier', bin: 'medium', tier: 'haiku', alpha: 20, beta: 30, count: 3 },
    ],
  };
  const out = analyze(posterior, { frontmatters: { 'design-verifier': 'sonnet' } });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'bandit_arbitrage');
  assert.equal(out[0].agent, 'design-verifier');
  assert.equal(out[0].bin, 'medium');
  assert.equal(out[0].current_frontmatter_tier, 'sonnet');
  assert.equal(out[0].posterior_best_tier, 'opus');
  assert.equal(out[0].evidence, 'posterior_cred_int_narrow');
  assert.equal(out[0].pull_count, 18);
  assert.match(out[0].proposal, /design-verifier/);
  assert.match(out[0].proposal, /opus/);
  assert.match(out[0].proposal, /tier_override: sonnet/);
  // posterior_mean / posterior_stddev present for all 3 canonical tiers
  for (const t of ['haiku', 'sonnet', 'opus']) {
    assert.ok(typeof out[0].posterior_mean[t] === 'number');
    assert.ok(typeof out[0].posterior_stddev[t] === 'number');
  }
});

test('27.5-04: stddev too wide → silent', () => {
  // Low alpha+beta produces wide credible interval (stddev > 0.05).
  // opus α=4 β=1 → mean=0.8, stddev = sqrt(4/(25·6)) ≈ 0.163 > 0.05
  const posterior = {
    arms: [
      { agent: 'a', bin: 'medium', tier: 'opus', alpha: 4, beta: 1, count: 2 },
      { agent: 'a', bin: 'medium', tier: 'sonnet', alpha: 2, beta: 3, count: 2 },
      { agent: 'a', bin: 'medium', tier: 'haiku', alpha: 1, beta: 4, count: 1 },
    ],
  };
  const out = analyze(posterior, { frontmatters: { a: 'sonnet' } });
  // total pulls = 5 ≥ 3, but stddev too wide
  assert.deepEqual(out, []);
});

test('27.5-04: best mean < 50% above second-best → silent', () => {
  // opus mean = 70/100 = 0.70
  // sonnet mean = 55/100 = 0.55
  // delta = (0.70-0.55)/0.55 = 0.273 (27.3%) < 50%
  const posterior = {
    arms: [
      { agent: 'a', bin: 'medium', tier: 'opus', alpha: 70, beta: 30, count: 10 },
      { agent: 'a', bin: 'medium', tier: 'sonnet', alpha: 55, beta: 45, count: 10 },
      { agent: 'a', bin: 'medium', tier: 'haiku', alpha: 50, beta: 50, count: 5 },
    ],
  };
  const out = analyze(posterior, { frontmatters: { a: 'sonnet' } });
  assert.deepEqual(out, []);
});

test('27.5-04: frontmatter matches best tier → silent', () => {
  const posterior = {
    arms: [
      { agent: 'a', bin: 'medium', tier: 'opus', alpha: 50, beta: 1, count: 10 },
      { agent: 'a', bin: 'medium', tier: 'sonnet', alpha: 30, beta: 30, count: 5 },
      { agent: 'a', bin: 'medium', tier: 'haiku', alpha: 20, beta: 30, count: 3 },
    ],
  };
  // posterior_best_tier='opus' === current_frontmatter_tier='opus' → silent
  const out = analyze(posterior, { frontmatters: { a: 'opus' } });
  assert.deepEqual(out, []);
});

test('27.5-04: multiple slices → deterministic ordering by (agent, bin) ascending', () => {
  const posterior = {
    arms: [
      // z-agent slice first in input — but should sort second in output
      { agent: 'z-agent', bin: 'small', tier: 'opus', alpha: 50, beta: 1, count: 10 },
      { agent: 'z-agent', bin: 'small', tier: 'sonnet', alpha: 30, beta: 30, count: 5 },
      { agent: 'z-agent', bin: 'small', tier: 'haiku', alpha: 20, beta: 30, count: 3 },
      // a-agent slice second in input — but should sort first in output
      { agent: 'a-agent', bin: 'small', tier: 'opus', alpha: 50, beta: 1, count: 10 },
      { agent: 'a-agent', bin: 'small', tier: 'sonnet', alpha: 30, beta: 30, count: 5 },
      { agent: 'a-agent', bin: 'small', tier: 'haiku', alpha: 20, beta: 30, count: 3 },
    ],
  };
  const out = analyze(posterior, {
    frontmatters: { 'z-agent': 'sonnet', 'a-agent': 'sonnet' },
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].agent, 'a-agent', 'agents must be sorted alphabetically');
  assert.equal(out[1].agent, 'z-agent');
});

test('27.5-04: delegateFilter=none matches undefined + none, ignores peer slices', () => {
  const posterior = {
    arms: [
      // legacy slice (delegate undefined): should match
      { agent: 'a', bin: 'medium', tier: 'opus', alpha: 50, beta: 1, count: 10 },
      { agent: 'a', bin: 'medium', tier: 'sonnet', alpha: 30, beta: 30, count: 5 },
      { agent: 'a', bin: 'medium', tier: 'haiku', alpha: 20, beta: 30, count: 3 },
      // peer slice (delegate='gemini'): MUST be ignored by default filter
      { agent: 'a', bin: 'medium', tier: 'opus', delegate: 'gemini', alpha: 99, beta: 1, count: 50 },
    ],
  };
  const out = analyze(posterior, { frontmatters: { a: 'sonnet' } });
  assert.equal(out.length, 1);
  assert.equal(out[0].posterior_best_tier, 'opus');
  // pull_count = 10 + 5 + 3 = 18 — gemini arm with count=50 NOT counted
  assert.equal(out[0].pull_count, 18);
});

test('27.5-04: explicit delegate=none arms are matched (Plan 27-07 slice)', () => {
  // Both undefined and 'none' arms should be treated equivalently by
  // the default delegateFilter='none'.
  const posterior = {
    arms: [
      // explicit 'none' slice — Plan 27-07 wrote these
      { agent: 'a', bin: 'medium', tier: 'opus', delegate: 'none', alpha: 50, beta: 1, count: 10 },
      { agent: 'a', bin: 'medium', tier: 'sonnet', delegate: 'none', alpha: 30, beta: 30, count: 5 },
      { agent: 'a', bin: 'medium', tier: 'haiku', delegate: 'none', alpha: 20, beta: 30, count: 3 },
    ],
  };
  const out = analyze(posterior, { frontmatters: { a: 'sonnet' } });
  assert.equal(out.length, 1);
  assert.equal(out[0].posterior_best_tier, 'opus');
  assert.equal(out[0].pull_count, 18);
});

test('27.5-04: findArmsForSlice respects null delegateFilter (no filtering)', () => {
  const arms = [
    { agent: 'a', bin: 'medium', tier: 'opus', alpha: 50, beta: 1, count: 10 },
    { agent: 'a', bin: 'medium', tier: 'opus', delegate: 'gemini', alpha: 99, beta: 1, count: 50 },
    { agent: 'b', bin: 'medium', tier: 'opus', alpha: 50, beta: 1, count: 10 },
  ];
  // null → no delegate filtering, all (a, medium) arms returned
  const out = findArmsForSlice(arms, 'a', 'medium', null);
  assert.equal(out.length, 2);
  // 'none' → only the legacy (delegate undefined) arm
  const out2 = findArmsForSlice(arms, 'a', 'medium', 'none');
  assert.equal(out2.length, 1);
  assert.equal(out2[0].delegate, undefined);
  // 'gemini' → only the peer arm
  const out3 = findArmsForSlice(arms, 'a', 'medium', 'gemini');
  assert.equal(out3.length, 1);
  assert.equal(out3[0].delegate, 'gemini');
});

test('27.5-04: frontmatter agent missing → silent (no current to compare against)', () => {
  const posterior = {
    arms: [
      { agent: 'b', bin: 'medium', tier: 'opus', alpha: 50, beta: 1, count: 10 },
      { agent: 'b', bin: 'medium', tier: 'sonnet', alpha: 30, beta: 30, count: 5 },
      { agent: 'b', bin: 'medium', tier: 'haiku', alpha: 20, beta: 30, count: 3 },
    ],
  };
  // frontmatters map omits 'b' entirely
  const out = analyze(posterior, { frontmatters: { 'other-agent': 'sonnet' } });
  assert.deepEqual(out, []);
});

test('27.5-04: options.pullCountThreshold override accepted', () => {
  // total pulls = 2 with default threshold (=3) → silent
  // but override to 1 should let the signal fire.
  const posterior = {
    arms: [
      { agent: 'a', bin: 'medium', tier: 'opus', alpha: 50, beta: 1, count: 1 },
      { agent: 'a', bin: 'medium', tier: 'sonnet', alpha: 30, beta: 30, count: 1 },
      { agent: 'a', bin: 'medium', tier: 'haiku', alpha: 20, beta: 30, count: 0 },
    ],
  };
  const silent = analyze(posterior, { frontmatters: { a: 'sonnet' } });
  assert.equal(silent.length, 0);
  const loud = analyze(posterior, {
    frontmatters: { a: 'sonnet' },
    pullCountThreshold: 1,
  });
  assert.equal(loud.length, 1);
  assert.equal(loud[0].posterior_best_tier, 'opus');
});
