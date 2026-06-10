// test/suite/model-cost-truth.test.cjs
//
// Phase 59-9 — "model cost truth" regression suite.
//
// Guards the invariant that an UNKNOWN / NEW model is priced LOUDLY and
// CONSERVATIVELY (opus-rate ceiling), never silently as $0 or at the sonnet
// rate, and that the bracketed context-window variant suffix (`[1m]`) does not
// break price/tier lookups.
//
// Covers BOTH cost paths that previously diverged:
//   - the async headless path: scripts/lib/budget-enforcer.cjs computeCost()
//   - the sync session-runner path: scripts/lib/session-runner/index.ts rateFor()
//
// The session-runner module is TypeScript and is loaded via dynamic import()
// (the verify command runs node with --experimental-strip-types).

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '../..');
const backend = require(path.join(REPO_ROOT, 'scripts', 'lib', 'budget-enforcer.cjs'));

// Opus ceiling rates (mirror reference/prices/claude.md claude-opus-4-8 row).
const OPUS_IN = 15; // $/1M input
const OPUS_OUT = 75; // $/1M output

// ── budget-enforcer.cjs computeCost ──────────────────────────────────────────

test('computeCost: unknown family (claude-fable-5[1m]) → conservative opus ceiling, not null/$0', () => {
  backend.reset();
  const r = backend.computeCost({
    model_id: 'claude-fable-5[1m]',
    runtime: 'claude',
    tokens_in: 1e6,
    tokens_out: 0,
  });
  assert.equal(typeof r.cost_usd, 'number', 'unknown model must be priced, not null');
  assert.ok(r.cost_usd > 0, `expected positive cost, got ${r.cost_usd}`);
  assert.equal(r.fallback, true, 'unknown-model price is a fallback');
  assert.equal(r.cost_estimated, true, 'unknown-model price is a conservative estimate');
  assert.equal(r.tier, 'opus', 'conservative ceiling uses the opus tier');
  // 1M input @ $15/1M = $15.00 (output is 0).
  assert.ok(Math.abs(r.cost_usd - OPUS_IN) < 1e-6, `cost was ${r.cost_usd}, expected ~${OPUS_IN}`);
});

test('computeCost: claude-opus-4-8[1m] → real opus-4-8 row (variant stripped, not a fallback)', () => {
  backend.reset();
  const r = backend.computeCost({
    model_id: 'claude-opus-4-8[1m]',
    runtime: 'claude',
    tokens_in: 1e6,
    tokens_out: 0,
  });
  assert.equal(r.model, 'claude-opus-4-8', 'variant suffix must be stripped before lookup');
  assert.equal(r.tier, 'opus');
  assert.equal(r.fallback, false, 'a real table row is not a fallback');
  assert.notEqual(r.cost_estimated, true, 'a real table row is not an estimate');
  assert.ok(Math.abs(r.cost_usd - OPUS_IN) < 1e-6, `cost was ${r.cost_usd}, expected ~${OPUS_IN}`);
});

test('computeCost: claude-opus-4-8 (no variant) → exact opus-4-8 row', () => {
  backend.reset();
  const r = backend.computeCost({
    model_id: 'claude-opus-4-8',
    runtime: 'claude',
    tokens_in: 0,
    tokens_out: 1e6,
  });
  assert.equal(r.model, 'claude-opus-4-8');
  assert.equal(r.tier, 'opus');
  assert.equal(r.fallback, false);
  // 1M output @ $75/1M = $75.00.
  assert.ok(Math.abs(r.cost_usd - OPUS_OUT) < 1e-6, `cost was ${r.cost_usd}, expected ~${OPUS_OUT}`);
});

// ── session-runner index.ts rateFor (sync headless path) ─────────────────────

test('session-runner rateFor: unknown id → opus ceiling; known sonnet id → sonnet rate', async () => {
  const mod = await import(
    pathToFileURL(path.join(REPO_ROOT, 'scripts', 'lib', 'session-runner', 'index.ts')).href
  );
  const { rateFor } = mod;

  // Unknown family → conservative opus ceiling (NOT the old sonnet default).
  const unknown = rateFor('claude-mystery-9');
  assert.deepEqual(unknown, { input: OPUS_IN, output: OPUS_OUT }, 'unknown id must price at opus ceiling');

  // [1m] variant on an unknown family still resolves (suffix stripped) to opus.
  const unknownVariant = rateFor('claude-mystery-9[1m]');
  assert.deepEqual(unknownVariant, { input: OPUS_IN, output: OPUS_OUT });

  // Known sonnet family stays at the sonnet rate (tier fallback keeps fixtures green).
  const sonnet = rateFor('claude-sonnet-4-5');
  assert.deepEqual(sonnet, { input: 3, output: 15 }, 'claude-sonnet-4-5 must price at the sonnet rate');

  // Known opus family at opus rate; [1m] variant does not break it.
  assert.deepEqual(rateFor('claude-opus-4-8'), { input: OPUS_IN, output: OPUS_OUT });
  assert.deepEqual(rateFor('claude-opus-4-8[1m]'), { input: OPUS_IN, output: OPUS_OUT });

  // Known haiku family at haiku rate.
  assert.deepEqual(rateFor('claude-haiku-4-5'), { input: 0.8, output: 4 });
});
