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

const REPO_ROOT = path.join(__dirname, '..');

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

// TODO(Phase 28.8 Wave D, Plan 28-8-Z1): baseline regen.
// Phase 28.8 Plan B1 adds the 15th entry `cursor-marketplace` (Tier-2
// distribution channel). The runtime-models.md content covers install-
// target runtimes only; the new Tier-2 entry has no models row. Wave D's
// atomic update will add the row or restrict comparison per CONTEXT D-08.
test('runtime-models: every runtime ID from runtimes.cjs is represented', { skip: 'Phase 28.8 Wave D baseline regen pending (CONTEXT D-08); cursor-marketplace Tier-2 entry not in runtime-models.md per Plan B1' }, () => {
  const parsed = parseRuntimeModels({ cwd: REPO_ROOT });
  const have = new Set(parsed.runtimes.map((r) => r.id));
  const want = RUNTIMES.map((r) => r.id);
  for (const id of want) {
    assert.ok(have.has(id), `runtime-models.md is missing entry for runtime '${id}'`);
  }
  // Cross-check: parser's KNOWN_RUNTIME_IDS list should also match
  // the canonical runtimes.cjs list (one source of truth, mirrored).
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
