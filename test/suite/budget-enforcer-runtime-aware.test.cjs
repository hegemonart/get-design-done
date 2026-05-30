'use strict';

// tests/budget-enforcer-runtime-aware.test.cjs — Phase 26 (Plan 26-09 closeout).
//
// Pure-function tests of scripts/lib/budget-enforcer.cjs#computeCost().
// We verify the runtime-aware lookup chain (D-08): runtime price table
// → claude fallback → null + diagnostic reason. Tokens are normalized
// USD-per-1M, so we compute exact expected costs and compare.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const budgetEnforcer = require(path.join(REPO_ROOT, 'scripts', 'lib', 'budget-enforcer.cjs'));

// Helper: compute expected USD from raw rate (per 1M) + tokens.
function expected(inputRate, outputRate, tokensIn, tokensOut) {
  return (tokensIn / 1_000_000) * inputRate + (tokensOut / 1_000_000) * outputRate;
}

test('budget-enforcer: codex/gpt-5-mini path uses reference/prices/codex.md', () => {
  budgetEnforcer.reset();
  // codex.md row: gpt-5-mini | sonnet | 0.25 | 2.00 | 0.03
  const r = budgetEnforcer.computeCost(
    {
      model_id: 'gpt-5-mini',
      runtime: 'codex',
      tokens_in: 1_000_000, // round numbers for clarity
      tokens_out: 500_000,
    },
    { cwd: REPO_ROOT },
  );
  assert.equal(r.model, 'gpt-5-mini', 'must resolve to the gpt-5-mini row');
  assert.equal(r.runtime_used, 'codex', 'must use the codex runtime table');
  assert.equal(r.fallback, false, 'must not be a claude fallback');
  assert.equal(r.reason, null);
  // 1.0 * 0.25 + 0.5 * 2.00 = 0.25 + 1.00 = 1.25
  const want = expected(0.25, 2.0, 1_000_000, 500_000);
  assert.ok(
    Math.abs(r.cost_usd - want) < 1e-9,
    `expected cost ≈ ${want} USD, got ${r.cost_usd}`,
  );
});

test('budget-enforcer: claude/opus path uses reference/prices/claude.md', () => {
  budgetEnforcer.reset();
  // claude.md row: claude-opus-4-7 | opus | 15.00 | 75.00 | 1.50
  const r = budgetEnforcer.computeCost(
    {
      model_id: 'claude-opus-4-7',
      runtime: 'claude',
      tokens_in: 100_000,
      tokens_out: 20_000,
    },
    { cwd: REPO_ROOT },
  );
  assert.equal(r.model, 'claude-opus-4-7');
  assert.equal(r.runtime_used, 'claude');
  assert.equal(r.fallback, false);
  // 0.1 * 15.00 + 0.02 * 75.00 = 1.5 + 1.5 = 3.0
  const want = expected(15.0, 75.0, 100_000, 20_000);
  assert.ok(
    Math.abs(r.cost_usd - want) < 1e-9,
    `expected cost ≈ ${want} USD, got ${r.cost_usd}`,
  );
});

test('budget-enforcer: cache_hit path swaps cached_input_per_1m for input_per_1m', () => {
  budgetEnforcer.reset();
  // codex.md row: gpt-5-mini | sonnet | 0.25 | 2.00 | 0.03 cached
  const r = budgetEnforcer.computeCost(
    {
      model_id: 'gpt-5-mini',
      runtime: 'codex',
      tokens_in: 1_000_000,
      tokens_out: 0,
      cache_hit: true,
    },
    { cwd: REPO_ROOT },
  );
  // 1.0 * 0.03 (cached) + 0 = 0.03
  const want = expected(0.03, 2.0, 1_000_000, 0);
  assert.ok(
    Math.abs(r.cost_usd - want) < 1e-9,
    `cache_hit must apply cached_input_per_1m; expected ≈ ${want}, got ${r.cost_usd}`,
  );
});

test('budget-enforcer: missing runtime ID returns null cost + diagnostic reason', () => {
  budgetEnforcer.reset();
  const r = budgetEnforcer.computeCost(
    {
      model_id: 'gpt-5-mini',
      // runtime: undefined — explicit absence
      tokens_in: 1_000_000,
      tokens_out: 500_000,
    },
    { cwd: REPO_ROOT },
  );
  assert.equal(r.cost_usd, null, 'missing runtime → null cost');
  assert.equal(r.reason, 'missing_runtime', 'reason must surface for the caller');
});

test('budget-enforcer: unknown runtime falls back to claude price table', () => {
  budgetEnforcer.reset();
  // Use a tier-only query (legacy path) against an unknown runtime.
  // Unknown runtime → empty table → claude fallback by tier.
  const r = budgetEnforcer.computeCost(
    {
      tier: 'opus',
      runtime: 'nonexistent-runtime-zzz',
      tokens_in: 100_000,
      tokens_out: 20_000,
    },
    { cwd: REPO_ROOT },
  );
  assert.equal(r.runtime_used, 'claude', 'unknown runtime must fall back to claude table');
  assert.equal(r.fallback, true, 'fallback flag must be set');
  assert.ok(typeof r.cost_usd === 'number' && r.cost_usd > 0, 'expected a positive USD cost');
});

test('budget-enforcer: modelFromResolved extracts agent → model from router map', () => {
  // Regression on the consumer-side helper that bridges router output to
  // the cost lookup (D-07 → D-08 contract).
  const resolved = {
    'design-verifier': 'gpt-5-mini',
    'design-fixer': null, // tier-resolver produced a null (unknown runtime/tier)
  };
  assert.equal(budgetEnforcer.modelFromResolved(resolved, 'design-verifier'), 'gpt-5-mini');
  assert.equal(
    budgetEnforcer.modelFromResolved(resolved, 'design-fixer'),
    null,
    'null values surface as null (caller falls back to legacy path)',
  );
  assert.equal(
    budgetEnforcer.modelFromResolved(resolved, 'unknown-agent'),
    null,
    'missing keys surface as null',
  );
  assert.equal(budgetEnforcer.modelFromResolved(null, 'agent'), null, 'null map → null');
  assert.equal(budgetEnforcer.modelFromResolved(undefined, 'agent'), null, 'undefined map → null');
});
