'use strict';
//
// test/suite/tier-resolver-openrouter.test.cjs — Plan 33.6-02.
//
// Hermetic contract test for the OpenRouter tier-resolver adapter
// (scripts/lib/tier-resolver-openrouter.cjs). Every test name is prefixed
// `33.6-02:`.
//
// HERMETIC (D-07 / M-5): the heuristic + override + null-degrade cases drive
// the adapter via an INLINE synthetic catalog injected through opts.catalog
// (with opts.models accepted as an interop alias). No cache, no network, and
// no live .design/config.json — overrides are injected via opts.overrides.
// The adapter has NO hard dependency on sibling plan 33.6-01's fixture file;
// the only from-disk assertion (the shared-fixture parity case) is guarded by
// fs.existsSync and SKIPS when the fixture is absent — never a hard fail.
//
// Scope per decision D-12: OpenRouter lives ONLY in the tier-resolution layer.
// This plan does NOT touch scripts/lib/install/runtimes.cjs, so there is NO
// virtual-runtime assertion here (the original plan's case #7 is voided by
// D-12). The reference-registry round-trip case (D-11) confirms the new
// reference/openrouter-tier-mapping.md is registered.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The module under test. Required lazily inside each test so that the RED
// phase (module not yet authored) fails per-case with a clear import error
// rather than aborting the whole file at load time.
const ADAPTER_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'tier-resolver-openrouter.cjs');
function loadAdapter() {
  return require(ADAPTER_PATH);
}

// ---------------------------------------------------------------------------
// Inline synthetic catalog (M-5: NO dependency on 33.6-01's fixture file).
// Mirrors the cache-shape contract: { id, name?, context_length?, pricing }.
// Deliberately ordered so a naive "first id" pick would be WRONG for opus
// (the top closed id is not first) and for haiku (the cheapest open id is not
// last) — forcing the heuristic to actually rank by namespace + pricing.
// ---------------------------------------------------------------------------
const SYNTHETIC_MODELS = [
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Meta Llama 3.1 70B',
    context_length: 131072,
    pricing: { prompt: '0.00000052', completion: '0.00000075' },
  },
  {
    id: 'anthropic/claude-opus-4-7',
    name: 'Claude Opus 4.7',
    context_length: 200000,
    pricing: { prompt: '0.000015', completion: '0.000075' }, // highest completion → opus
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B',
    context_length: 131072,
    pricing: { prompt: '0.00000038', completion: '0.00000040' },
  },
  {
    id: 'anthropic/claude-sonnet-4-7',
    name: 'Claude Sonnet 4.7',
    context_length: 200000,
    pricing: { prompt: '0.000003', completion: '0.000015' }, // mid closed → sonnet
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    name: 'Meta Llama 3.1 8B',
    context_length: 131072,
    pricing: { prompt: '0.00000002', completion: '0.00000005' }, // cheapest open → haiku
  },
];

const CLOSED_NS = /^(anthropic|openai|google)\//;
const OPEN_NS = /^(meta-llama|qwen|mistralai|deepseek)\//;

// ---------------------------------------------------------------------------
// Heuristic resolve (a): opus / sonnet / haiku map to the right catalog ids.
// ---------------------------------------------------------------------------

test('33.6-02: resolve opus -> a top closed id from the injected catalog', () => {
  const { resolve } = loadAdapter();
  const id = resolve('opus', { catalog: SYNTHETIC_MODELS });
  assert.ok(id, 'opus must resolve to a non-null id');
  assert.match(id, CLOSED_NS, `opus should pick a closed-namespace id, got ${id}`);
  // The deterministic pick for this catalog is the priciest closed model.
  assert.equal(id, 'anthropic/claude-opus-4-7');
});

test('33.6-02: resolve haiku -> a cheap-open id from the injected catalog', () => {
  const { resolve } = loadAdapter();
  const id = resolve('haiku', { catalog: SYNTHETIC_MODELS });
  assert.ok(id, 'haiku must resolve to a non-null id');
  assert.match(id, OPEN_NS, `haiku should pick an open-namespace id, got ${id}`);
  // The cheapest open model by completion price.
  assert.equal(id, 'meta-llama/llama-3.1-8b-instruct');
});

test('33.6-02: resolve sonnet -> a non-null mid id distinct from the opus pick', () => {
  const { resolve } = loadAdapter();
  const opus = resolve('opus', { catalog: SYNTHETIC_MODELS });
  const sonnet = resolve('sonnet', { catalog: SYNTHETIC_MODELS });
  assert.ok(sonnet, 'sonnet must resolve to a non-null id');
  assert.notEqual(sonnet, opus, 'sonnet should not collapse onto the opus pick');
});

test('33.6-02: opts.models is accepted as an interop alias for opts.catalog', () => {
  const { resolve } = loadAdapter();
  const viaCatalog = resolve('opus', { catalog: SYNTHETIC_MODELS });
  const viaModels = resolve('opus', { models: SYNTHETIC_MODELS });
  assert.equal(viaModels, viaCatalog, 'opts.models must behave identically to opts.catalog');
});

// ---------------------------------------------------------------------------
// Override (b): openrouter_tier_overrides wins over the heuristic, verbatim.
// ---------------------------------------------------------------------------

test('33.6-02: override wins over the heuristic (returned verbatim)', () => {
  const { resolve } = loadAdapter();
  const id = resolve('opus', {
    catalog: SYNTHETIC_MODELS,
    overrides: { opus: 'some/custom-model-x' },
  });
  assert.equal(id, 'some/custom-model-x');
});

test('33.6-02: override wins even when the id is absent from the catalog', () => {
  const { resolve } = loadAdapter();
  // No catalog at all + an override → still returns the override (user's
  // explicit choice trumps catalog membership).
  const id = resolve('haiku', {
    catalog: [],
    overrides: { haiku: 'vendor/not-in-catalog' },
  });
  assert.equal(id, 'vendor/not-in-catalog');
});

// ---------------------------------------------------------------------------
// Graceful null (c): no catalog + no override → null, never throws (D-08).
// ---------------------------------------------------------------------------

test('33.6-02: null-degrade with an empty catalog and no override', () => {
  const { resolve } = loadAdapter();
  assert.equal(resolve('opus', { catalog: [] }), null);
});

test('33.6-02: null-degrade with a null catalog and no override', () => {
  const { resolve } = loadAdapter();
  // Pass an explicit null catalog so the adapter does NOT fall through to a
  // live readCatalog/disk read — keeps the case hermetic.
  assert.equal(resolve('opus', { catalog: null }), null);
});

// ---------------------------------------------------------------------------
// Robustness (d): unknown tier / garbage opts → null, never throws.
// ---------------------------------------------------------------------------

test('33.6-02: unknown tier -> null (no throw)', () => {
  const { resolve } = loadAdapter();
  assert.equal(resolve('giant', { catalog: SYNTHETIC_MODELS }), null);
  assert.equal(resolve('OPUS', { catalog: SYNTHETIC_MODELS }), null); // case-sensitive vocab
});

test('33.6-02: garbage opts -> null, never throws', () => {
  const { resolve } = loadAdapter();
  assert.doesNotThrow(() => resolve(undefined));
  assert.equal(resolve(undefined), null);
  assert.doesNotThrow(() => resolve('opus', null));
  assert.equal(resolve('opus', null), null);
  assert.doesNotThrow(() => resolve('opus', { catalog: 'not-an-array' }));
  assert.equal(resolve('opus', { catalog: 'not-an-array' }), null);
  assert.doesNotThrow(() => resolve('opus', { catalog: [{ no_id: true }, 42, null] }));
});

// ---------------------------------------------------------------------------
// Registry round-trip (e) — D-11: the new reference doc must be registered.
// ---------------------------------------------------------------------------

test('33.6-02: reference-registry round-trip clean (openrouter-tier-mapping registered)', () => {
  const { validateRegistry } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'reference-registry.cjs'));
  const v = validateRegistry({ cwd: REPO_ROOT });
  assert.ok(v.ok, `registry round-trip failed: ${JSON.stringify(v)}`);
  assert.ok(
    !v.missingInRegistry.includes('reference/openrouter-tier-mapping.md'),
    'reference/openrouter-tier-mapping.md must be registered (D-11)',
  );
});

test('33.6-02: openrouter-tier-mapping is findable in the registry with a valid type', () => {
  const reg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'reference', 'registry.json'), 'utf8'),
  );
  const entry = reg.entries.find(e => e.name === 'openrouter-tier-mapping');
  assert.ok(entry, 'openrouter-tier-mapping entry must exist');
  assert.equal(entry.path, 'reference/openrouter-tier-mapping.md');
  const schema = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'reference', 'registry.schema.json'), 'utf8'),
  );
  const validTypes = new Set(schema.properties.entries.items.properties.type.enum);
  assert.ok(validTypes.has(entry.type), `type out of enum: ${entry.type}`);
});

// ---------------------------------------------------------------------------
// (f) OPTIONAL shared-fixture parity — existsSync-guarded (M-5: SKIP, never
// hard-fail, when sibling 33.6-01's fixture is absent).
// ---------------------------------------------------------------------------

test('33.6-02: parity against the shared 33.6-01 fixture catalog (skips if absent)', (t) => {
  const fixturePath = path.join(
    REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-33-6', 'openrouter-catalog.json',
  );
  if (!fs.existsSync(fixturePath)) {
    t.skip('shared fixture not present yet (sibling 33.6-01 not landed) — skipping');
    return;
  }
  const { resolve } = loadAdapter();
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const models = fixture.models;
  const opus = resolve('opus', { catalog: models });
  const haiku = resolve('haiku', { catalog: models });
  assert.ok(opus && CLOSED_NS.test(opus), `opus from fixture should be closed, got ${opus}`);
  assert.ok(haiku && OPEN_NS.test(haiku), `haiku from fixture should be open, got ${haiku}`);
});
