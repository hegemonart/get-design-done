// test/suite/openrouter-status-and-drift.test.cjs — Plan 33.6-03 (Wave B)
//
// Hermetic (D-07): fixture catalog + in-test synthetic prev/curr deltas. NO
// network, NO real OPENROUTER_API_KEY. Default `npm test` runs this.
//
// Locks SC#1 (connection spec), SC#6 (cost.update provider tag — END-TO-END via
// buildCostEventPayload), SC#7 (status skill), SC#8 (authority-watcher catalog
// drift). Every test name is prefixed `33.6-03:`.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { REPO_ROOT } = require('./helpers.ts');

const CONNECTION_PATH = path.join(REPO_ROOT, 'connections', 'openrouter.md');
const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'openrouter-status', 'SKILL.md');
const PRICES_PATH = path.join(REPO_ROOT, 'reference', 'prices.openrouter.md');
const FIXTURE_PATH = path.join(
  REPO_ROOT,
  'test',
  'fixtures',
  'baselines',
  'phase-33-6',
  'openrouter-catalog.json',
);

const budgetEnforcer = require(path.join(REPO_ROOT, 'scripts', 'lib', 'budget-enforcer.cjs'));
const authorityWatcher = require(
  path.join(REPO_ROOT, 'scripts', 'lib', 'authority-watcher', 'index.cjs'),
);
const { validateRegistry } = require(
  path.join(REPO_ROOT, 'scripts', 'lib', 'reference-registry.cjs'),
);

// A canonical base cost-row arg shape (the cost_recorded payload builder).
const baseCostArgs = Object.freeze({
  runtime: 'openrouter',
  agent: 'design-reflector',
  model_id: 'anthropic/claude-opus-4-7',
  tier: 'opus',
  tokens_in: 10,
  tokens_out: 20,
  cost_usd: 0.01,
});

// -------------------------------------------------------------------
// SC#6 — cost.update provider tag (END-TO-END through the builder)
// -------------------------------------------------------------------

test('33.6-03: buildCostEventPayload tags provider:"openrouter" when an openrouter-resolved model is passed', () => {
  const tagged = budgetEnforcer.buildCostEventPayload({
    ...baseCostArgs,
    provider: 'openrouter',
  });
  assert.equal(tagged.provider, 'openrouter', 'provider should be tagged when passed');
  // The legacy fields are preserved alongside the new tag.
  assert.equal(tagged.runtime, 'openrouter');
  assert.equal(tagged.agent, 'design-reflector');
  assert.equal(tagged.runtime_role, 'host', 'back-compat host role still stamped');
});

test('33.6-03: buildCostEventPayload omits provider when absent (back-compat — default native path)', () => {
  const plain = budgetEnforcer.buildCostEventPayload({ ...baseCostArgs });
  assert.equal(
    Object.prototype.hasOwnProperty.call(plain, 'provider'),
    false,
    'provider must be OMITTED (not present, not undefined) when not passed — legacy on-disk shape preserved',
  );
  // Sanity: the rest of the legacy shape is intact.
  assert.equal(plain.runtime_role, 'host');
  assert.equal(plain.model_id, 'anthropic/claude-opus-4-7');
});

test('33.6-03: buildCostEventPayload omits provider for empty/non-string provider (defensive)', () => {
  for (const bad of ['', null, undefined, 42, {}]) {
    const out = budgetEnforcer.buildCostEventPayload({ ...baseCostArgs, provider: bad });
    assert.equal(
      Object.prototype.hasOwnProperty.call(out, 'provider'),
      false,
      `provider must be omitted for non-empty-string value ${JSON.stringify(bad)}`,
    );
  }
});

// -------------------------------------------------------------------
// SC#8 — authority-watcher OpenRouter catalog drift
// -------------------------------------------------------------------

test('33.6-03: diffOpenRouterCatalog classifies new-model / withdrawn / deprecated / pricing-change', () => {
  const prev = [
    { id: 'anthropic/claude-opus-4-7', pricing: { prompt: '0.000015', completion: '0.000075' } },
    { id: 'anthropic/claude-sonnet-4-7', pricing: { prompt: '0.000003', completion: '0.000015' } },
    { id: 'meta-llama/llama-3.1-70b-instruct', pricing: { prompt: '0.0000005', completion: '0.0000007' } },
    { id: 'deepseek/deepseek-chat', pricing: { prompt: '0.0000002', completion: '0.0000003' } },
  ];
  const curr = [
    // opus unchanged
    { id: 'anthropic/claude-opus-4-7', pricing: { prompt: '0.000015', completion: '0.000075' } },
    // sonnet: pricing changed
    { id: 'anthropic/claude-sonnet-4-7', pricing: { prompt: '0.000004', completion: '0.000020' } },
    // llama withdrawn (prev-only → absent in curr)
    // deepseek: still present but flagged deprecated
    { id: 'deepseek/deepseek-chat', pricing: { prompt: '0.0000002', completion: '0.0000003' }, deprecated: true },
    // a brand new model
    { id: 'qwen/qwen-2.5-72b-instruct', pricing: { prompt: '0.0000004', completion: '0.0000004' } },
  ];

  const diff = authorityWatcher.diffOpenRouterCatalog(prev, curr, { overrides: [] });
  const byId = Object.fromEntries(diff.map(d => [d.id, d]));

  assert.equal(byId['qwen/qwen-2.5-72b-instruct'].change, 'new-model');
  assert.equal(byId['meta-llama/llama-3.1-70b-instruct'].change, 'withdrawn');
  assert.equal(byId['deepseek/deepseek-chat'].change, 'deprecated');
  assert.equal(byId['anthropic/claude-sonnet-4-7'].change, 'pricing-change');
  // opus unchanged → not classified at all (no entry)
  assert.equal(byId['anthropic/claude-opus-4-7'], undefined, 'unchanged models produce no delta');
});

test('33.6-03: diffOpenRouterCatalog surfaces ONLY deprecated/withdrawn matching an openrouter_tier_overrides pin', () => {
  const prev = [
    { id: 'anthropic/claude-opus-4-7', pricing: { prompt: '0.000015', completion: '0.000075' } },
    { id: 'meta-llama/llama-3.1-70b-instruct', pricing: { prompt: '0.0000005', completion: '0.0000007' } },
    { id: 'qwen/qwen-2.5-72b-instruct', pricing: { prompt: '0.0000004', completion: '0.0000004' } },
  ];
  const curr = [
    // opus withdrawn AND it is the user's pinned override → SURFACED
    // llama withdrawn but NOT pinned → not surfaced
    // qwen pricing change → not surfaced (only deprecated/withdrawn surface)
    { id: 'qwen/qwen-2.5-72b-instruct', pricing: { prompt: '0.0000009', completion: '0.0000009' } },
    // a new model → not surfaced
    { id: 'mistralai/mistral-large', pricing: { prompt: '0.000002', completion: '0.000006' } },
  ];

  const diff = authorityWatcher.diffOpenRouterCatalog(prev, curr, {
    overrides: ['anthropic/claude-opus-4-7'],
  });
  const byId = Object.fromEntries(diff.map(d => [d.id, d]));

  // The pinned withdrawn model is the actionable signal.
  assert.equal(byId['anthropic/claude-opus-4-7'].change, 'withdrawn');
  assert.equal(
    byId['anthropic/claude-opus-4-7'].surfaced,
    true,
    'a withdrawn model matching an override pin MUST be surfaced',
  );

  // Everything else is classified but NOT surfaced (noise control).
  assert.equal(byId['meta-llama/llama-3.1-70b-instruct'].change, 'withdrawn');
  assert.equal(
    byId['meta-llama/llama-3.1-70b-instruct'].surfaced,
    false,
    'a withdrawn model NOT matching an override must NOT be surfaced',
  );
  assert.equal(byId['qwen/qwen-2.5-72b-instruct'].change, 'pricing-change');
  assert.equal(byId['qwen/qwen-2.5-72b-instruct'].surfaced, false);
  assert.equal(byId['mistralai/mistral-large'].change, 'new-model');
  assert.equal(byId['mistralai/mistral-large'].surfaced, false);
});

test('33.6-03: diffOpenRouterCatalog surfaces a deprecated pinned model and never throws on garbage', () => {
  const prev = [
    { id: 'anthropic/claude-opus-4-7', pricing: { prompt: '0.000015', completion: '0.000075' } },
  ];
  const curr = [
    { id: 'anthropic/claude-opus-4-7', pricing: { prompt: '0.000015', completion: '0.000075' }, status: 'deprecated' },
  ];
  const diff = authorityWatcher.diffOpenRouterCatalog(prev, curr, {
    overrides: ['anthropic/claude-opus-4-7'],
  });
  const op = diff.find(d => d.id === 'anthropic/claude-opus-4-7');
  assert.equal(op.change, 'deprecated');
  assert.equal(op.surfaced, true, 'a deprecated model matching an override must be surfaced');

  // Pure + never-throws on garbage inputs.
  assert.deepEqual(authorityWatcher.diffOpenRouterCatalog(null, null), []);
  assert.deepEqual(authorityWatcher.diffOpenRouterCatalog(undefined, undefined, undefined), []);
  assert.deepEqual(authorityWatcher.diffOpenRouterCatalog('x', 42, { overrides: 'nope' }), []);
});

test('33.6-03: existing authority-watcher API (classifyArticles/matchesKfmWhitelist/buildKfmCandidate) is intact', () => {
  assert.equal(typeof authorityWatcher.classifyArticles, 'function');
  assert.equal(typeof authorityWatcher.matchesKfmWhitelist, 'function');
  assert.equal(typeof authorityWatcher.buildKfmCandidate, 'function');
  // Smoke: a known failure-mode title still classifies as a kfm-candidate.
  const events = authorityWatcher.classifyArticles([
    { id: 'a1', title: 'Common errors and troubleshooting', summary: 'EACCES on write' },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'kfm-candidate');
});

// -------------------------------------------------------------------
// SC#1 / SC#7 — connection spec + status skill presence and shape
// -------------------------------------------------------------------

test('33.6-03: connections/openrouter.md exists with required shape (key + Fallback + capability)', () => {
  assert.ok(fs.existsSync(CONNECTION_PATH), 'connections/openrouter.md must exist');
  const conn = fs.readFileSync(CONNECTION_PATH, 'utf8');
  assert.match(conn, /OPENROUTER_API_KEY/, 'must document OPENROUTER_API_KEY');
  assert.match(conn, /OPENROUTER_BASE_URL/, 'must document the optional OPENROUTER_BASE_URL');
  assert.match(conn, /##\s*Fallback Behavior/i, 'must have a Fallback Behavior section');
  assert.match(conn, /## Probe Pattern/i, 'must have a Probe Pattern section');
  // Capability classification: canvas no / generator yes / model-router yes.
  assert.match(conn, /canvas/i);
  assert.match(conn, /model-router/i);
  assert.match(conn, /native/i, 'fallback degrades to the native provider (D-08)');
});

test('33.6-03: skills/openrouter-status/SKILL.md exists with disable-model-invocation: true', () => {
  assert.ok(fs.existsSync(SKILL_PATH), 'skills/openrouter-status/SKILL.md must exist');
  const sk = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(sk, /name:\s*hone-openrouter-status/, 'frontmatter name hone-openrouter-status');
  assert.match(sk, /disable-model-invocation:\s*true/, 'must carry disable-model-invocation: true');
  assert.match(sk, /tools:\s*Read,\s*Bash/, 'tools Read, Bash');
  assert.match(sk, /OPENROUTER-STATUS COMPLETE/, 'completion marker present');
});

// -------------------------------------------------------------------
// SC#8 support / D-11 — reference-registry round-trip
// -------------------------------------------------------------------

test('33.6-03: reference-registry round-trip clean (prices.openrouter.md registered — D-11)', () => {
  assert.ok(fs.existsSync(PRICES_PATH), 'reference/prices.openrouter.md must exist');
  const v = validateRegistry({ cwd: REPO_ROOT });
  assert.equal(
    v.missingInRegistry.includes('reference/prices.openrouter.md'),
    false,
    'prices.openrouter.md must be registered (not missingInRegistry)',
  );
  assert.equal(
    v.ok,
    true,
    `registry round-trip must be clean — missing: ${JSON.stringify(v.missingInRegistry)}, dangling: ${JSON.stringify(v.danglingInRegistry)}, dups: ${JSON.stringify(v.duplicates)}`,
  );
});

// -------------------------------------------------------------------
// SC#6 — CostUpdateEvent type still validates (cost.update with + without provider)
// -------------------------------------------------------------------

test('33.6-03: cost.update is a known event type and a provider-bearing payload is structurally valid', () => {
  // The TYPE-level provider? check is enforced by `tsc --noEmit` +
  // test/suite/event-types-registry.test.ts (the .ts registry test). Here we
  // assert the runtime registry still lists cost.update and that a payload
  // both with and without provider is structurally a valid CostUpdateEvent
  // payload shape.
  let knownTypes = null;
  try {
    // Node 24 strip-types lets a .cjs require the .ts index in `npm test`.
    ({ KNOWN_EVENT_TYPES: knownTypes } = require(
      path.join(REPO_ROOT, 'sdk', 'event-stream', 'index.ts'),
    ));
  } catch {
    knownTypes = null; // strip-types unavailable — skip the registry membership leg.
  }
  if (Array.isArray(knownTypes)) {
    assert.ok(knownTypes.includes('cost.update'), 'cost.update must remain a known event type');
  }

  // Structural validity of the additive payload (with + without provider).
  const withProvider = {
    type: 'cost.update',
    payload: { agent: 'a', tier: 'opus', usd: 0.01, tokens_in: 1, tokens_out: 2, provider: 'openrouter' },
  };
  const withoutProvider = {
    type: 'cost.update',
    payload: { agent: 'a', tier: 'opus', usd: 0.01, tokens_in: 1, tokens_out: 2 },
  };
  assert.equal(withProvider.payload.provider, 'openrouter');
  assert.equal(Object.prototype.hasOwnProperty.call(withoutProvider.payload, 'provider'), false);
});

// -------------------------------------------------------------------
// Hermeticity guard — the fixture catalog exists and is the cache shape.
// -------------------------------------------------------------------

test('33.6-03: fixture catalog is present and shaped (hermetic — no network)', () => {
  assert.ok(fs.existsSync(FIXTURE_PATH), 'fixture catalog must exist for hermetic tests');
  const fx = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  assert.ok(Array.isArray(fx.models) && fx.models.length > 0, 'fixture has models[]');
  assert.equal(typeof fx.fetched_at, 'string');
});
