'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  RUNTIMES,
  getRuntime,
  listRuntimes,
  listRuntimeIds,
  REPO,
  MARKETPLACE_NAME,
  PLUGIN_NAME,
} = require('../scripts/lib/install/runtimes.cjs');

test('runtimes: 14 entries shipped', () => {
  assert.equal(RUNTIMES.length, 14);
});

test('runtimes: each entry has the required keys', () => {
  for (const r of RUNTIMES) {
    assert.equal(typeof r.id, 'string', `${r.id}: id missing`);
    assert.equal(typeof r.displayName, 'string', `${r.id}: displayName missing`);
    assert.equal(typeof r.configDirEnv, 'string', `${r.id}: configDirEnv missing`);
    assert.equal(typeof r.configDirFallback, 'string', `${r.id}: configDirFallback missing`);
    // Phase 28.7 (Plan 28.7-08) — `agents-md` placeholder replaced with
    // `multi-artifact`. The 13 non-claude runtimes no longer carry a
    // `files: [...]` array (destination paths are computed by
    // runtime-artifact-layout.cjs). Only claude still has `files: []`.
    assert.ok(['claude-marketplace', 'multi-artifact'].includes(r.kind), `${r.id}: bad kind`);
    if (r.kind === 'claude-marketplace') {
      assert.ok(Array.isArray(r.files), `${r.id}: claude must keep files array`);
    }
  }
});

test('runtimes: ids unique', () => {
  const seen = new Set();
  for (const r of RUNTIMES) {
    assert.ok(!seen.has(r.id), `duplicate id: ${r.id}`);
    seen.add(r.id);
  }
});

test('runtimes: claude entry uses claude-marketplace kind', () => {
  const claude = getRuntime('claude');
  assert.equal(claude.kind, 'claude-marketplace');
  assert.deepEqual(claude.marketplaceEntry, {
    name: MARKETPLACE_NAME,
    pluginName: PLUGIN_NAME,
    repo: REPO,
  });
});

test('runtimes: gemini uses multi-artifact kind (Phase 28.7-08)', () => {
  // Phase 28.7 (Plan 28.7-08) — gemini was historically the only runtime
  // that dropped `GEMINI.md` (vs the shared `AGENTS.md`). With the new
  // multi-artifact layout, gemini installs into `commands/gdd/` via
  // converters/gemini.cjs — see runtime-artifact-layout.cjs#gemini.
  const gemini = getRuntime('gemini');
  assert.equal(gemini.kind, 'multi-artifact');
  // `files: [...]` is intentionally absent on multi-artifact entries.
});

test('runtimes: 13 non-claude runtimes use multi-artifact kind (Phase 28.7-08)', () => {
  // Phase 28.7 (Plan 28.7-08) — the broken Phase 24 `agents-md` placeholder
  // (which dropped a single AGENTS.md/GEMINI.md per runtime) was replaced
  // with `multi-artifact`. Destination paths now come from
  // runtime-artifact-layout.cjs.
  const ids = ['opencode', 'kilo', 'codex', 'copilot', 'cursor', 'windsurf', 'antigravity', 'augment', 'trae', 'qwen', 'codebuddy', 'cline', 'gemini'];
  for (const id of ids) {
    const r = getRuntime(id);
    assert.equal(r.kind, 'multi-artifact', `${id}: should be multi-artifact`);
  }
});

test('runtimes: getRuntime throws for unknown id', () => {
  assert.throws(() => getRuntime('does-not-exist'), /Unknown runtime/);
});

test('runtimes: listRuntimes returns the same length as listRuntimeIds', () => {
  assert.equal(listRuntimes().length, listRuntimeIds().length);
});

test('runtimes: matches Phase 24 baseline file', () => {
  const fs = require('node:fs');
  const baselinePath = path.join(__dirname, '..', 'test-fixture', 'baselines', 'phase-24', 'runtimes.txt');
  const baselineIds = fs.readFileSync(baselinePath, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const sortedIds = [...listRuntimeIds()].sort();
  assert.deepEqual(sortedIds, baselineIds);
});
