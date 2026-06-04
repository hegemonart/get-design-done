'use strict';

// tests/runtime-models-schema.test.cjs — Phase 26 (Plan 26-09 closeout).
//
// Calls the dependency-free pure-JS parser at
// scripts/lib/install/parse-runtime-models.cjs to validate
// reference/runtime-models.md. The parser does strict schema validation
// natively — no `ajv` dependency at this layer (D-03 + Plan 26-09 brief).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');

const {
  parseRuntimeModels,
  KNOWN_RUNTIME_IDS,
  TIER_KEYS,
  REASONING_CLASS_KEYS,
} = require(path.join(REPO_ROOT, 'scripts', 'lib', 'install', 'parse-runtime-models.cjs'));

const { RUNTIMES } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'install', 'runtimes.cjs'));

test('runtime-models: parser succeeds against the canonical reference file', () => {
  const parsed = parseRuntimeModels({ cwd: REPO_ROOT });
  assert.equal(parsed.schema_version, 1, '$schema_version must be 1');
  assert.ok(Array.isArray(parsed.runtimes), 'runtimes must be an array');
  assert.ok(parsed.runtimes.length >= 1, 'at least one runtime entry expected');
});

// Phase 28.8 (Plans B1, C1) added two Tier-2 distribution-channel entries
// (`cursor-marketplace` + `codex-plugin`). runtime-models.md covers Tier-1
// install-target runtimes only — the Tier-2 channels have no per-user
// model row. Filter Tier-2 kinds out of the iteration before asserting.
const TIER2_KINDS = new Set(['cursor-marketplace', 'codex-plugin']);
test('runtime-models: every Tier-1 runtime ID from runtimes.cjs is represented (Phase 28.8 B1/C1 — Tier-2 filtered)', () => {
  const parsed = parseRuntimeModels({ cwd: REPO_ROOT });
  const have = new Set(parsed.runtimes.map((r) => r.id));
  const want = RUNTIMES.filter((r) => !TIER2_KINDS.has(r.kind)).map((r) => r.id);
  assert.equal(want.length, 14, 'expected 14 Tier-1 install targets');
  for (const id of want) {
    assert.ok(have.has(id), `runtime-models.md is missing entry for runtime '${id}'`);
  }
  // Cross-check: parser's KNOWN_RUNTIME_IDS list should also match
  // the canonical runtimes.cjs Tier-1 set (one source of truth, mirrored).
  for (const id of want) {
    assert.ok(
      KNOWN_RUNTIME_IDS.includes(id),
      `parser KNOWN_RUNTIME_IDS missing '${id}' (drift from runtimes.cjs)`,
    );
  }
});

test('runtime-models: canonical seed picks for the four canonical runtimes (D-02)', () => {
  const parsed = parseRuntimeModels({ cwd: REPO_ROOT });
  const byId = Object.fromEntries(parsed.runtimes.map((r) => [r.id, r]));

  // D-02 seed picks. Sonnet name for claude is the per-row choice in the
  // source file (claude-sonnet-4-6 or claude-sonnet-4-7 are both valid
  // anthropic sonnet IDs); we assert opus + haiku here and let the
  // budget-enforcer test cover the price-table side of sonnet.
  assert.equal(byId.claude.tier_to_model.opus.model, 'claude-opus-4-7', 'claude → opus seed');
  assert.equal(byId.claude.tier_to_model.haiku.model, 'claude-haiku-4-5', 'claude → haiku seed');

  assert.equal(byId.codex.tier_to_model.opus.model, 'gpt-5', 'codex → opus seed');
  assert.equal(byId.codex.tier_to_model.sonnet.model, 'gpt-5-mini', 'codex → sonnet seed');
  assert.equal(byId.codex.tier_to_model.haiku.model, 'gpt-5-nano', 'codex → haiku seed');

  assert.equal(byId.gemini.tier_to_model.opus.model, 'gemini-2.5-pro', 'gemini → opus seed');

  assert.equal(byId.qwen.tier_to_model.opus.model, 'qwen3-max', 'qwen → opus seed');
});

test('runtime-models: reasoning_class equivalence holds row-by-row (D-10)', () => {
  // Convention: high ↔ opus, medium ↔ sonnet, low ↔ haiku. The frontmatter
  // validator enforces this on consumers; the source-of-truth must keep
  // it aligned for the equivalence to be meaningful.
  const parsed = parseRuntimeModels({ cwd: REPO_ROOT });
  const pairs = [
    ['high', 'opus'],
    ['medium', 'sonnet'],
    ['low', 'haiku'],
  ];
  for (const r of parsed.runtimes) {
    for (const [klass, tier] of pairs) {
      const klassModel = r.reasoning_class_to_model[klass].model;
      const tierModel = r.tier_to_model[tier].model;
      assert.equal(
        klassModel,
        tierModel,
        `runtime '${r.id}': reasoning_class.${klass} (${klassModel}) must equal tier.${tier} (${tierModel})`,
      );
    }
  }
});

test('runtime-models: provenance present + valid on every row', () => {
  const parsed = parseRuntimeModels({ cwd: REPO_ROOT });
  for (const r of parsed.runtimes) {
    assert.ok(Array.isArray(r.provenance), `runtime '${r.id}': provenance must be array`);
    assert.ok(r.provenance.length >= 1, `runtime '${r.id}': provenance must be non-empty`);
    for (const p of r.provenance) {
      assert.equal(typeof p.source_url, 'string', `runtime '${r.id}': source_url string`);
      assert.ok(p.source_url.length > 0, `runtime '${r.id}': source_url non-empty`);
      assert.equal(typeof p.retrieved_at, 'string', `runtime '${r.id}': retrieved_at string`);
      assert.ok(
        !Number.isNaN(Date.parse(p.retrieved_at)),
        `runtime '${r.id}': retrieved_at must be a valid ISO 8601 timestamp`,
      );
      assert.equal(
        typeof p.last_validated_cycle,
        'string',
        `runtime '${r.id}': last_validated_cycle string`,
      );
      assert.ok(
        p.last_validated_cycle.length > 0,
        `runtime '${r.id}': last_validated_cycle non-empty`,
      );
    }
  }
});

test('runtime-models: tier and reasoning-class enums match parser exports', () => {
  // Sanity-check parser-level constants vs. the in-spec keys we expect.
  // Catches drift if someone reorders/renames the canonical lists.
  assert.deepEqual([...TIER_KEYS], ['opus', 'sonnet', 'haiku']);
  assert.deepEqual([...REASONING_CLASS_KEYS], ['high', 'medium', 'low']);
});
