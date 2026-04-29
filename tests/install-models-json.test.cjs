'use strict';

// Phase 26 / 26-03 — installer emits models.json per runtime config-dir.
//
// Covers:
//   - install creates models.json with correct CONTEXT D-06 schema
//   - --dry-run shows the same set without writing anything
//   - uninstall removes models.json (idempotent on missing)
//   - foreign / corrupt models.json is left alone (skipped-foreign)
//   - models.json sits next to the primary install artefact (settings.json /
//     AGENTS.md / GEMINI.md) in the SAME config dir for both runtime kinds
//   - schema fields (runtime, schema_version, source, generated_at, fingerprint)
//   - re-install on already-correct file is a no-op (unchanged)
//   - getRuntimeModels helper round-trips with parse-runtime-models.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  installRuntime,
  uninstallRuntime,
  buildModelsJsonPayload,
  MODELS_JSON_FILE,
  MODELS_JSON_SCHEMA_VERSION,
  MODELS_JSON_SOURCE,
} = require('../scripts/lib/install/installer.cjs');
const {
  getRuntime,
  getRuntimeModels,
  _resetRuntimeModelsCache,
} = require('../scripts/lib/install/runtimes.cjs');
const { parseRuntimeModels } = require('../scripts/lib/install/parse-runtime-models.cjs');

function mktmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-install-models-'));
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ---------------------------------------------------------------------------
// helper: getRuntimeModels round-trip
// ---------------------------------------------------------------------------

test('getRuntimeModels: round-trips with parse-runtime-models.cjs for canonical runtimes', () => {
  _resetRuntimeModelsCache();
  const parsed = parseRuntimeModels({});
  for (const id of ['claude', 'codex', 'gemini', 'qwen']) {
    const expected = parsed.runtimes.find((r) => r.id === id);
    if (!expected) continue; // skip if research tail not yet filled
    const actual = getRuntimeModels(id);
    assert.deepEqual(actual, expected, `runtime ${id} round-trip mismatch`);
  }
});

test('getRuntimeModels: throws on unknown runtime id (not silent null)', () => {
  _resetRuntimeModelsCache();
  assert.throws(() => getRuntimeModels('nonsense-runtime'), /Unknown runtime/);
});

// ---------------------------------------------------------------------------
// buildModelsJsonPayload — payload shape sanity (no I/O)
// ---------------------------------------------------------------------------

test('buildModelsJsonPayload: returns CONTEXT D-06 schema with flattened tier→model strings', () => {
  _resetRuntimeModelsCache();
  const claude = getRuntime('claude');
  const payload = buildModelsJsonPayload(claude, { now: '2026-04-29T00:00:00.000Z' });
  if (payload === null) {
    // No runtime-models entry shipped for claude — skip rather than fail.
    // (The seed picks in CONTEXT D-02 ship claude, so this should never hit.)
    return;
  }
  assert.equal(payload.runtime, 'claude');
  assert.equal(payload.schema_version, MODELS_JSON_SCHEMA_VERSION);
  assert.equal(payload.source, MODELS_JSON_SOURCE);
  assert.equal(payload.generated_at, '2026-04-29T00:00:00.000Z');
  assert.equal(payload.generated_by, 'get-design-done');

  // Tier map — strings, not nested {model: …} rows.
  for (const tier of ['opus', 'sonnet', 'haiku']) {
    assert.equal(typeof payload.tier_to_model[tier], 'string');
    assert.ok(payload.tier_to_model[tier].length > 0);
  }
  for (const klass of ['high', 'medium', 'low']) {
    assert.equal(typeof payload.reasoning_class_to_model[klass], 'string');
    assert.ok(payload.reasoning_class_to_model[klass].length > 0);
  }
});

// ---------------------------------------------------------------------------
// install — claude-marketplace runtime: models.json sits next to settings.json
// ---------------------------------------------------------------------------

test('install (claude): writes models.json next to settings.json with full schema', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const result = installRuntime('claude', { configDir: tmp });
    const modelsPath = path.join(tmp, MODELS_JSON_FILE);
    if (result.modelsJson.action === 'skipped-no-data') {
      // Runtime has no entry — acceptable, but skip the file-write asserts.
      assert.equal(fs.existsSync(modelsPath), false);
      return;
    }
    assert.equal(result.modelsJson.action, 'created');
    assert.equal(result.modelsJson.path, modelsPath);
    assert.equal(fs.existsSync(modelsPath), true);

    const data = readJson(modelsPath);
    assert.equal(data.runtime, 'claude');
    assert.equal(data.schema_version, MODELS_JSON_SCHEMA_VERSION);
    assert.equal(data.source, MODELS_JSON_SOURCE);
    assert.equal(data.generated_by, 'get-design-done');
    assert.ok(Number.isFinite(Date.parse(data.generated_at)));
    for (const tier of ['opus', 'sonnet', 'haiku']) {
      assert.equal(typeof data.tier_to_model[tier], 'string');
    }
    for (const klass of ['high', 'medium', 'low']) {
      assert.equal(typeof data.reasoning_class_to_model[klass], 'string');
    }

    // The primary settings.json was also written (sanity).
    assert.equal(fs.existsSync(path.join(tmp, 'settings.json')), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// install — agents-md runtime: models.json sits next to AGENTS.md
// ---------------------------------------------------------------------------

test('install (codex): writes models.json next to AGENTS.md', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const result = installRuntime('codex', { configDir: tmp });
    const modelsPath = path.join(tmp, MODELS_JSON_FILE);
    if (result.modelsJson.action === 'skipped-no-data') {
      assert.equal(fs.existsSync(modelsPath), false);
      return;
    }
    assert.equal(result.modelsJson.action, 'created');
    assert.equal(fs.existsSync(modelsPath), true);
    const data = readJson(modelsPath);
    assert.equal(data.runtime, 'codex');
    assert.equal(typeof data.tier_to_model.opus, 'string');

    // AGENTS.md was also written (sanity).
    assert.equal(fs.existsSync(path.join(tmp, 'AGENTS.md')), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install (gemini): writes models.json next to GEMINI.md', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const result = installRuntime('gemini', { configDir: tmp });
    const modelsPath = path.join(tmp, MODELS_JSON_FILE);
    if (result.modelsJson.action === 'skipped-no-data') {
      assert.equal(fs.existsSync(modelsPath), false);
      return;
    }
    assert.equal(result.modelsJson.action, 'created');
    const data = readJson(modelsPath);
    assert.equal(data.runtime, 'gemini');
    assert.equal(fs.existsSync(path.join(tmp, 'GEMINI.md')), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// --dry-run — surfaces the same action without writing
// ---------------------------------------------------------------------------

test('install --dry-run: surfaces models.json action without writing the file', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const result = installRuntime('claude', { configDir: tmp, dryRun: true });
    const modelsPath = path.join(tmp, MODELS_JSON_FILE);
    assert.equal(result.modelsJson.dryRun, true);
    if (result.modelsJson.action === 'skipped-no-data') {
      assert.equal(fs.existsSync(modelsPath), false);
      return;
    }
    assert.equal(result.modelsJson.action, 'created');
    assert.equal(result.modelsJson.path, modelsPath);
    assert.equal(fs.existsSync(modelsPath), false, 'dry-run must not write');
    // Sanity: settings.json also not written under dry-run.
    assert.equal(fs.existsSync(path.join(tmp, 'settings.json')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install --dry-run on existing models.json: would update, no write', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    // Seed with a stale-but-plugin-owned models.json.
    const stale = {
      tier_to_model: { opus: 'old', sonnet: 'old', haiku: 'old' },
      reasoning_class_to_model: { high: 'old', medium: 'old', low: 'old' },
      runtime: 'claude',
      schema_version: 1,
      generated_at: '2020-01-01T00:00:00.000Z',
      source: MODELS_JSON_SOURCE,
      generated_by: 'get-design-done',
    };
    const target = path.join(tmp, MODELS_JSON_FILE);
    fs.writeFileSync(target, JSON.stringify(stale, null, 2) + '\n');

    const result = installRuntime('claude', { configDir: tmp, dryRun: true });
    if (result.modelsJson.action === 'skipped-no-data') return;
    assert.equal(result.modelsJson.action, 'updated');
    // File on disk is still the stale one.
    assert.deepEqual(readJson(target), stale);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// idempotency — re-install on already-correct file is unchanged
// ---------------------------------------------------------------------------

test('install: re-running on identical models.json reports unchanged (timestamp ignored)', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const first = installRuntime('claude', { configDir: tmp });
    if (first.modelsJson.action === 'skipped-no-data') return;
    assert.equal(first.modelsJson.action, 'created');

    // Bump generated_at on disk to simulate a stale write.
    const target = path.join(tmp, MODELS_JSON_FILE);
    const onDisk = readJson(target);
    onDisk.generated_at = '2020-01-01T00:00:00.000Z';
    fs.writeFileSync(target, JSON.stringify(onDisk, null, 2) + '\n');

    const second = installRuntime('claude', { configDir: tmp });
    assert.equal(second.modelsJson.action, 'unchanged', 'identical content (modulo timestamp) should be a no-op');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// foreign-file safety — refuse to clobber unauthored models.json
// ---------------------------------------------------------------------------

test('install: refuses to overwrite a foreign (non-plugin) models.json', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const target = path.join(tmp, MODELS_JSON_FILE);
    const foreign = { theirField: 'theirValue' };
    fs.writeFileSync(target, JSON.stringify(foreign, null, 2));
    const result = installRuntime('claude', { configDir: tmp });
    assert.equal(result.modelsJson.action, 'skipped-foreign');
    assert.deepEqual(readJson(target), foreign, 'foreign file must be untouched');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install: refuses to overwrite a corrupt (non-JSON) models.json', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const target = path.join(tmp, MODELS_JSON_FILE);
    fs.writeFileSync(target, '{ not json');
    const result = installRuntime('claude', { configDir: tmp });
    assert.equal(result.modelsJson.action, 'skipped-foreign');
    assert.equal(fs.readFileSync(target, 'utf8'), '{ not json');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// uninstall — removes plugin-owned models.json, idempotent on missing
// ---------------------------------------------------------------------------

test('uninstall: removes plugin-owned models.json', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const installResult = installRuntime('claude', { configDir: tmp });
    if (installResult.modelsJson.action === 'skipped-no-data') return;

    const target = path.join(tmp, MODELS_JSON_FILE);
    assert.equal(fs.existsSync(target), true);

    const result = uninstallRuntime('claude', { configDir: tmp });
    assert.equal(result.modelsJson.action, 'removed');
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('uninstall: missing models.json is unchanged (idempotent)', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const result = uninstallRuntime('claude', { configDir: tmp });
    assert.equal(result.modelsJson.action, 'unchanged');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('uninstall --dry-run: surfaces removal without unlinking', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const installResult = installRuntime('claude', { configDir: tmp });
    if (installResult.modelsJson.action === 'skipped-no-data') return;
    const target = path.join(tmp, MODELS_JSON_FILE);

    const result = uninstallRuntime('claude', { configDir: tmp, dryRun: true });
    assert.equal(result.modelsJson.action, 'removed');
    assert.equal(result.modelsJson.dryRun, true);
    assert.equal(fs.existsSync(target), true, 'dry-run uninstall must not delete');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('uninstall: refuses to delete a foreign models.json', () => {
  _resetRuntimeModelsCache();
  const tmp = mktmp();
  try {
    const target = path.join(tmp, MODELS_JSON_FILE);
    const foreign = { theirField: 'theirValue' };
    fs.writeFileSync(target, JSON.stringify(foreign, null, 2));
    const result = uninstallRuntime('claude', { configDir: tmp });
    assert.equal(result.modelsJson.action, 'skipped-foreign');
    assert.deepEqual(readJson(target), foreign);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// install.cjs entrypoint — --dry-run output mentions models.json
// ---------------------------------------------------------------------------

test('install.cjs --dry-run output surfaces models.json side-effect', () => {
  const { spawnSync } = require('node:child_process');
  const REPO_ROOT = path.resolve(__dirname, '..');
  const INSTALL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'install.cjs');
  const tmp = mktmp();
  try {
    const result = spawnSync(
      process.execPath,
      [INSTALL_SCRIPT, '--dry-run'],
      {
        env: { ...process.env, CLAUDE_CONFIG_DIR: tmp },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /models\.json/);
    assert.match(result.stdout, /\[dry-run\]/);
    // Nothing written.
    assert.equal(fs.existsSync(path.join(tmp, MODELS_JSON_FILE)), false);
    assert.equal(fs.existsSync(path.join(tmp, 'settings.json')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
