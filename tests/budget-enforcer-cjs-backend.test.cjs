// tests/budget-enforcer-cjs-backend.test.cjs
//
// Plan 26-05 inline coverage for the shared cost-computation backend at
// `scripts/lib/budget-enforcer.cjs`. Asserts:
//
//   - Claude resolved_models path: model_id 'claude-sonnet-4-7' in runtime
//     'claude' yields a non-zero cost computed against
//     `reference/prices/claude.md`.
//   - Codex resolved_models path: model_id 'gpt-5-mini' in runtime 'codex'
//     yields a non-zero cost from `reference/prices/codex.md` (no fallback).
//   - Stub-runtime fallback: model_id 'claude-sonnet-4-7' in runtime 'kilo'
//     (a stub price table) falls back to claude.md and reports
//     `fallback: true`.
//   - modelFromResolved: returns the agent's model when set, null otherwise.
//
// Plan 26-09 owns the dedicated `tests/budget-enforcer-runtime-aware.test.cjs`
// that exercises the full hook via spawnSync; this file is the lightweight
// in-process check that the backend module is wired correctly.

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const backend = require(path.join(REPO_ROOT, 'scripts', 'lib', 'budget-enforcer.cjs'));

test('budget-enforcer.cjs: resolved_models path — claude/sonnet computes positive cost from claude.md', () => {
  backend.reset();
  const r = backend.computeCost({
    model_id: 'claude-sonnet-4-7',
    runtime: 'claude',
    tokens_in: 10_000,
    tokens_out: 2_500,
    cache_hit: false,
  });
  assert.equal(r.runtime_used, 'claude', 'must resolve via the claude runtime table');
  assert.equal(r.fallback, false, 'native lookup must not be marked fallback');
  assert.equal(r.model, 'claude-sonnet-4-7');
  // 10k * 3.00/1M + 2.5k * 15.00/1M = 0.03 + 0.0375 = 0.0675
  assert.ok(
    typeof r.cost_usd === 'number' && r.cost_usd > 0,
    `expected positive cost, got ${r.cost_usd}`,
  );
  assert.ok(Math.abs(r.cost_usd - 0.0675) < 1e-6, `cost was ${r.cost_usd}, expected ~0.0675`);
});

test('budget-enforcer.cjs: resolved_models path — codex/gpt-5-mini computes positive cost from codex.md (no fallback)', () => {
  backend.reset();
  const r = backend.computeCost({
    model_id: 'gpt-5-mini',
    runtime: 'codex',
    tokens_in: 10_000,
    tokens_out: 2_500,
    cache_hit: false,
  });
  assert.equal(r.runtime_used, 'codex', 'must resolve in the codex runtime table without fallback');
  assert.equal(r.fallback, false);
  assert.equal(r.model, 'gpt-5-mini');
  assert.equal(r.tier, 'sonnet');
  // 10k * 0.25/1M + 2.5k * 2.00/1M = 0.0025 + 0.005 = 0.0075
  assert.ok(
    typeof r.cost_usd === 'number' && Math.abs(r.cost_usd - 0.0075) < 1e-6,
    `cost was ${r.cost_usd}, expected ~0.0075`,
  );
});

test('budget-enforcer.cjs: stub-runtime fallback — kilo with claude model id falls back to claude.md', () => {
  backend.reset();
  const r = backend.computeCost({
    model_id: 'claude-sonnet-4-7',
    runtime: 'kilo',
    tokens_in: 1_000,
    tokens_out: 250,
    cache_hit: false,
  });
  // kilo.md is a stub with no parseable rows → backend.cjs falls back to claude.md.
  assert.equal(r.fallback, true, 'stub runtime must fall back');
  assert.equal(r.runtime_used, 'claude');
  assert.equal(r.model, 'claude-sonnet-4-7');
  assert.ok(typeof r.cost_usd === 'number' && r.cost_usd > 0);
  assert.equal(r.reason, 'runtime_table_missing');
});

test('budget-enforcer.cjs: tier-only legacy path — sonnet under claude runtime works without model_id', () => {
  backend.reset();
  const r = backend.computeCost({
    tier: 'sonnet',
    runtime: 'claude',
    tokens_in: 10_000,
    tokens_out: 2_500,
    cache_hit: false,
  });
  assert.equal(r.runtime_used, 'claude');
  assert.equal(r.fallback, false);
  assert.equal(r.tier, 'sonnet');
  assert.ok(typeof r.cost_usd === 'number' && r.cost_usd > 0);
});

test('budget-enforcer.cjs: cache-hit applies cached_input_per_1m', () => {
  backend.reset();
  const r = backend.computeCost({
    model_id: 'claude-sonnet-4-7',
    runtime: 'claude',
    tokens_in: 10_000,
    tokens_out: 2_500,
    cache_hit: true,
  });
  // Cached input rate is 0.30 instead of 3.00: 10k * 0.30/1M + 2.5k * 15.00/1M = 0.003 + 0.0375 = 0.0405
  assert.ok(
    typeof r.cost_usd === 'number' && Math.abs(r.cost_usd - 0.0405) < 1e-6,
    `cache-hit cost was ${r.cost_usd}, expected ~0.0405`,
  );
});

test('budget-enforcer.cjs: modelFromResolved returns the agent string when present, null otherwise', () => {
  assert.equal(
    backend.modelFromResolved({ 'design-verifier': 'claude-sonnet-4-7' }, 'design-verifier'),
    'claude-sonnet-4-7',
  );
  assert.equal(
    backend.modelFromResolved({ 'design-verifier': 'claude-sonnet-4-7' }, 'design-aesthete'),
    null,
  );
  assert.equal(backend.modelFromResolved(null, 'design-verifier'), null);
  assert.equal(backend.modelFromResolved(undefined, 'design-verifier'), null);
  assert.equal(backend.modelFromResolved({ 'a': '' }, 'a'), null);
});

test('budget-enforcer.cjs: missing runtime arg returns null cost with reason', () => {
  backend.reset();
  const r = backend.computeCost({
    model_id: 'claude-sonnet-4-7',
    tokens_in: 10,
    tokens_out: 10,
  });
  assert.equal(r.cost_usd, null);
  assert.equal(r.reason, 'missing_runtime');
});

test('budget-enforcer.cjs: parsePriceTable extracts canonical rows', () => {
  const md = [
    '# anything',
    '',
    '| Model | Tier | input_per_1m | output_per_1m | cached_input_per_1m |',
    '|-------|------|--------------|---------------|----------------------|',
    '| foo-1 | opus | 1.0 | 2.0 | 0.1 |',
    '| foo-2 | sonnet | 0.5 | 1.0 | 0.05 |',
    '',
    'trailing prose',
  ].join('\n');
  const rows = backend.parsePriceTable(md);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].model, 'foo-1');
  assert.equal(rows[1].tier, 'sonnet');
  assert.equal(rows[1].cached_input_per_1m, 0.05);
});

test('budget-enforcer.cjs: parsePriceTable skips TODO/placeholder rows', () => {
  const md = [
    '| Model | Tier | input_per_1m | output_per_1m | cached_input_per_1m |',
    '|-------|------|--------------|---------------|----------------------|',
    '| _TBD_ | opus | <TODO> | <TODO> | <TODO> |',
    '| real-model | sonnet | 1.0 | 2.0 | 0.1 |',
  ].join('\n');
  const rows = backend.parsePriceTable(md);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].model, 'real-model');
});
