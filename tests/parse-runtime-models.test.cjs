'use strict';

// Phase 26-01 — parser tests for reference/runtime-models.md.
//
// Asserts:
//   1. The on-disk reference/runtime-models.md parses without error.
//   2. All 14 canonical runtime IDs appear (matches scripts/lib/install/runtimes.cjs).
//   3. The 4 seed runtimes (CONTEXT.md D-02) carry the locked seed picks.
//   4. Schema version is 1.
//   5. Strict validation rejects: missing tier, unknown runtime id, bad timestamp.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const {
  parseRuntimeModels,
  parseRuntimeModelsFromString,
  KNOWN_RUNTIME_IDS,
  TIER_KEYS,
  REASONING_CLASS_KEYS,
} = require(path.join(REPO_ROOT, 'scripts', 'lib', 'install', 'parse-runtime-models.cjs'));
const { listRuntimeIds } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'install', 'runtimes.cjs'));

test('parse-runtime-models: KNOWN_RUNTIME_IDS matches install/runtimes.cjs RUNTIMES list', () => {
  const installerIds = listRuntimeIds();
  // Order-independent equality.
  assert.deepEqual([...KNOWN_RUNTIME_IDS].sort(), [...installerIds].sort());
  assert.equal(KNOWN_RUNTIME_IDS.length, 14);
});

test('parse-runtime-models: tier and reasoning-class enums are the locked sets (D-03)', () => {
  assert.deepEqual([...TIER_KEYS], ['opus', 'sonnet', 'haiku']);
  assert.deepEqual([...REASONING_CLASS_KEYS], ['high', 'medium', 'low']);
});

test('parse-runtime-models: reference/runtime-models.md parses cleanly', () => {
  const result = parseRuntimeModels({ cwd: REPO_ROOT });
  assert.equal(result.schema_version, 1);
  assert.ok(Array.isArray(result.runtimes));
  assert.equal(result.runtimes.length, 14, 'all 14 runtimes present');
});

test('parse-runtime-models: every runtime ID from runtimes.cjs is present in the markdown', () => {
  const result = parseRuntimeModels({ cwd: REPO_ROOT });
  const ids = result.runtimes.map((r) => r.id).sort();
  assert.deepEqual(ids, [...listRuntimeIds()].sort());
});

test('parse-runtime-models: claude seed picks (D-02) are locked', () => {
  const { runtimes } = parseRuntimeModels({ cwd: REPO_ROOT });
  const claude = runtimes.find((r) => r.id === 'claude');
  assert.ok(claude, 'claude entry exists');
  assert.equal(claude.tier_to_model.opus.model, 'claude-opus-4-7');
  assert.equal(claude.tier_to_model.sonnet.model, 'claude-sonnet-4-6');
  assert.equal(claude.tier_to_model.haiku.model, 'claude-haiku-4-5');
  assert.equal(claude.reasoning_class_to_model.high.model, 'claude-opus-4-7');
  assert.equal(claude.reasoning_class_to_model.medium.model, 'claude-sonnet-4-6');
  assert.equal(claude.reasoning_class_to_model.low.model, 'claude-haiku-4-5');
});

test('parse-runtime-models: codex seed picks (D-02) are locked', () => {
  const { runtimes } = parseRuntimeModels({ cwd: REPO_ROOT });
  const codex = runtimes.find((r) => r.id === 'codex');
  assert.ok(codex);
  assert.equal(codex.tier_to_model.opus.model, 'gpt-5');
  assert.equal(codex.tier_to_model.sonnet.model, 'gpt-5-mini');
  assert.equal(codex.tier_to_model.haiku.model, 'gpt-5-nano');
});

test('parse-runtime-models: gemini seed picks (D-02) are locked', () => {
  const { runtimes } = parseRuntimeModels({ cwd: REPO_ROOT });
  const gemini = runtimes.find((r) => r.id === 'gemini');
  assert.ok(gemini);
  assert.equal(gemini.tier_to_model.opus.model, 'gemini-2.5-pro');
  assert.equal(gemini.tier_to_model.sonnet.model, 'gemini-2.5-flash');
  assert.equal(gemini.tier_to_model.haiku.model, 'gemini-2.5-flash-lite');
});

test('parse-runtime-models: qwen seed picks (D-02) are locked', () => {
  const { runtimes } = parseRuntimeModels({ cwd: REPO_ROOT });
  const qwen = runtimes.find((r) => r.id === 'qwen');
  assert.ok(qwen);
  assert.equal(qwen.tier_to_model.opus.model, 'qwen3-max');
  assert.equal(qwen.tier_to_model.sonnet.model, 'qwen3-plus');
  assert.equal(qwen.tier_to_model.haiku.model, 'qwen3-flash');
});

test('parse-runtime-models: trae is annotated single_tier (D-02 example)', () => {
  const { runtimes } = parseRuntimeModels({ cwd: REPO_ROOT });
  const trae = runtimes.find((r) => r.id === 'trae');
  assert.ok(trae);
  assert.equal(trae.single_tier, true);
  // Single-tier runtime maps the same model to all three tiers.
  assert.equal(trae.tier_to_model.opus.model, trae.tier_to_model.sonnet.model);
  assert.equal(trae.tier_to_model.sonnet.model, trae.tier_to_model.haiku.model);
});

test('parse-runtime-models: every runtime has provenance with required fields', () => {
  const { runtimes } = parseRuntimeModels({ cwd: REPO_ROOT });
  for (const r of runtimes) {
    assert.ok(Array.isArray(r.provenance) && r.provenance.length >= 1, `${r.id}: provenance non-empty`);
    for (const p of r.provenance) {
      assert.ok(typeof p.source_url === 'string' && p.source_url.length > 0, `${r.id}: source_url`);
      assert.ok(!Number.isNaN(Date.parse(p.retrieved_at)), `${r.id}: retrieved_at parses as date`);
      assert.ok(typeof p.last_validated_cycle === 'string' && p.last_validated_cycle.length > 0, `${r.id}: last_validated_cycle`);
    }
  }
});

test('parse-runtime-models: rejects unknown runtime id', () => {
  const md = [
    '# header',
    '```json',
    '{ "$schema_version": 1 }',
    '```',
    '## bogus',
    '```json',
    JSON.stringify({
      id: 'not-a-real-runtime',
      tier_to_model: {
        opus: { model: 'x' },
        sonnet: { model: 'x' },
        haiku: { model: 'x' },
      },
      reasoning_class_to_model: {
        high: { model: 'x' },
        medium: { model: 'x' },
        low: { model: 'x' },
      },
      provenance: [
        { source_url: 'x', retrieved_at: '2026-04-29T00:00:00.000Z', last_validated_cycle: 'c' },
      ],
    }),
    '```',
  ].join('\n');
  assert.throws(() => parseRuntimeModelsFromString(md), /must be one of/);
});

test('parse-runtime-models: rejects missing required tier', () => {
  const md = [
    '```json',
    '{ "$schema_version": 1 }',
    '```',
    '```json',
    JSON.stringify({
      id: 'claude',
      tier_to_model: {
        opus: { model: 'x' },
        sonnet: { model: 'x' },
        // haiku missing
      },
      reasoning_class_to_model: {
        high: { model: 'x' },
        medium: { model: 'x' },
        low: { model: 'x' },
      },
      provenance: [
        { source_url: 'x', retrieved_at: '2026-04-29T00:00:00.000Z', last_validated_cycle: 'c' },
      ],
    }),
    '```',
  ].join('\n');
  assert.throws(() => parseRuntimeModelsFromString(md), /missing required tier 'haiku'/);
});

test('parse-runtime-models: rejects bad ISO timestamp', () => {
  const md = [
    '```json',
    '{ "$schema_version": 1 }',
    '```',
    '```json',
    JSON.stringify({
      id: 'claude',
      tier_to_model: {
        opus: { model: 'x' },
        sonnet: { model: 'x' },
        haiku: { model: 'x' },
      },
      reasoning_class_to_model: {
        high: { model: 'x' },
        medium: { model: 'x' },
        low: { model: 'x' },
      },
      provenance: [
        { source_url: 'x', retrieved_at: 'definitely-not-a-date', last_validated_cycle: 'c' },
      ],
    }),
    '```',
  ].join('\n');
  assert.throws(() => parseRuntimeModelsFromString(md), /retrieved_at.*ISO/);
});

test('parse-runtime-models: rejects schema-version mismatch', () => {
  const md = [
    '```json',
    '{ "$schema_version": 2 }',
    '```',
    '```json',
    JSON.stringify({
      id: 'claude',
      tier_to_model: {
        opus: { model: 'x' },
        sonnet: { model: 'x' },
        haiku: { model: 'x' },
      },
      reasoning_class_to_model: {
        high: { model: 'x' },
        medium: { model: 'x' },
        low: { model: 'x' },
      },
      provenance: [
        { source_url: 'x', retrieved_at: '2026-04-29T00:00:00.000Z', last_validated_cycle: 'c' },
      ],
    }),
    '```',
  ].join('\n');
  assert.throws(() => parseRuntimeModelsFromString(md), /\$schema_version must be 1/);
});

test('parse-runtime-models: rejects duplicate runtime id', () => {
  const buildEntry = () => JSON.stringify({
    id: 'claude',
    tier_to_model: {
      opus: { model: 'x' },
      sonnet: { model: 'x' },
      haiku: { model: 'x' },
    },
    reasoning_class_to_model: {
      high: { model: 'x' },
      medium: { model: 'x' },
      low: { model: 'x' },
    },
    provenance: [
      { source_url: 'x', retrieved_at: '2026-04-29T00:00:00.000Z', last_validated_cycle: 'c' },
    ],
  });
  const md = [
    '```json',
    '{ "$schema_version": 1 }',
    '```',
    '```json',
    buildEntry(),
    '```',
    '```json',
    buildEntry(),
    '```',
  ].join('\n');
  assert.throws(() => parseRuntimeModelsFromString(md), /duplicate runtime id 'claude'/);
});

test('parse-runtime-models: schema file exists and is valid JSON', () => {
  const schemaPath = path.join(REPO_ROOT, 'reference', 'schemas', 'runtime-models.schema.json');
  assert.ok(fs.existsSync(schemaPath));
  const s = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(s.$schema, 'http://json-schema.org/draft-07/schema#');
  assert.deepEqual(
    s.definitions.runtimeEntry.properties.id.enum.sort(),
    [...listRuntimeIds()].sort(),
  );
});
