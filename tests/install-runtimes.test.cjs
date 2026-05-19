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

test('runtimes: 15 entries shipped (Phase 28.8 B1 adds cursor-marketplace)', () => {
  // Phase 24 D-02 locked the original 14 runtime install-targets. Phase 28.8
  // Plan B1 (CONTEXT D-05 additive) adds a 15th entry of kind
  // 'cursor-marketplace' — a Tier-2 distribution channel, not a runtime
  // install target. The existing 14 entries are unchanged.
  assert.equal(RUNTIMES.length, 15);
});

test('runtimes: each entry has the required keys', () => {
  for (const r of RUNTIMES) {
    assert.equal(typeof r.id, 'string', `${r.id}: id missing`);
    assert.equal(typeof r.displayName, 'string', `${r.id}: displayName missing`);
    // Phase 28.8 (Plan B1) — Tier-2 distribution-channel entries
    // (kind: 'cursor-marketplace') have configDir/configDirFallback === null
    // because they are out-of-band bundles, not per-user runtime install
    // targets. The 14 runtime install targets still carry string
    // configDirEnv/configDirFallback.
    if (r.kind === 'cursor-marketplace') {
      assert.equal(r.configDir, null, `${r.id}: Tier-2 channel must have configDir null`);
      assert.equal(r.configDirFallback, null, `${r.id}: Tier-2 channel must have configDirFallback null`);
    } else {
      assert.equal(typeof r.configDirEnv, 'string', `${r.id}: configDirEnv missing`);
      assert.equal(typeof r.configDirFallback, 'string', `${r.id}: configDirFallback missing`);
    }
    // Phase 28.7 (Plan 28.7-08) — `agents-md` placeholder replaced with
    // `multi-artifact`. The 13 non-claude runtime install-targets no longer
    // carry a `files: [...]` array (destination paths are computed by
    // runtime-artifact-layout.cjs). Only claude still has `files: []`.
    // Phase 28.8 (Plan B1) extends the allowlist with `cursor-marketplace`
    // for the Tier-2 distribution-channel entry.
    assert.ok(
      ['claude-marketplace', 'multi-artifact', 'cursor-marketplace'].includes(r.kind),
      `${r.id}: bad kind`
    );
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

// TODO(Phase 28.8 Wave D, Plan 28-8-Z1): baseline regen.
// Phase 28.8 Plan B1 adds the 15th entry `cursor-marketplace`, which causes
// the strict deep-equal against the alphabetised phase-24 baseline file to
// drift (baseline has 14 ids; module now has 15). The baseline file at
// test-fixture/baselines/phase-24/runtimes.txt is intentionally NOT modified
// in this plan — Wave D handles version + baseline rotation atomically per
// CONTEXT D-08. Re-enable this assertion after Wave D's baseline bump.
test('runtimes: matches Phase 24 baseline file', { skip: 'Phase 28.8 Wave D baseline regen pending (CONTEXT D-08)' }, () => {
  const fs = require('node:fs');
  const baselinePath = path.join(__dirname, '..', 'test-fixture', 'baselines', 'phase-24', 'runtimes.txt');
  const baselineIds = fs.readFileSync(baselinePath, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const sortedIds = [...listRuntimeIds()].sort();
  assert.deepEqual(sortedIds, baselineIds);
});

test('runtimes: cursor-marketplace entry registered with kind cursor-marketplace (Phase 28.8 B1)', () => {
  // Phase 28.8 Plan B1 — 15th entry, Tier-2 distribution channel.
  // Mirrors the claude-marketplace precedent (kind: 'claude-marketplace'),
  // but for the Cursor marketplace publish flow. Separate from the existing
  // id: 'cursor' entry (kind: 'multi-artifact') which remains the Tier-1
  // file-drop install target.
  const cm = listRuntimes().find((r) => r.id === 'cursor-marketplace');
  assert.ok(cm, 'cursor-marketplace entry exists');
  assert.equal(cm.kind, 'cursor-marketplace');
  assert.equal(cm.displayName, 'Cursor Marketplace');
  assert.equal(cm.configDir, null, 'Tier-2 channel has no per-user configDir');
  assert.equal(cm.configDirFallback, null, 'Tier-2 channel has no per-user configDirFallback');
});

test('runtimes: existing cursor entry remains multi-artifact (Phase 28.8 D-05 additive)', () => {
  // D-05 additive regression guard: Phase 28.7's Tier-1 file-drop install
  // target (id: 'cursor', kind: 'multi-artifact') is UNCHANGED by the
  // Tier-2 cursor-marketplace addition. File-drop users on the existing
  // install path are unaffected.
  const cursor = getRuntime('cursor');
  assert.equal(cursor.kind, 'multi-artifact', 'Phase 28.7 file-drop install must be unchanged');
  assert.equal(cursor.configDirEnv, 'CURSOR_CONFIG_DIR');
  assert.equal(cursor.configDirFallback, '.cursor');
});
