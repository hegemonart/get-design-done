'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  mergeClaudeSettings,
  removeClaudeSettings,
  buildAgentsFileContent,
  isPluginOwned,
  PLUGIN_FINGERPRINT,
} = require('../../scripts/lib/install/merge.cjs');
const { getRuntime } = require('../../scripts/lib/install/runtimes.cjs');
const { installRuntime, uninstallRuntime } = require('../../scripts/lib/install/installer.cjs');

const CLAUDE_ENTRY = getRuntime('claude').marketplaceEntry;

test('mergeClaudeSettings: empty existing → registers + enables', () => {
  const { next, changed } = mergeClaudeSettings({}, CLAUDE_ENTRY);
  assert.equal(changed, true);
  assert.deepEqual(next.extraKnownMarketplaces['get-design-done'], {
    source: { source: 'github', repo: 'hegemonart/get-design-done' },
  });
  assert.equal(next.enabledPlugins['get-design-done@get-design-done'], true);
});

test('mergeClaudeSettings: idempotent — second pass not changed', () => {
  const first = mergeClaudeSettings({}, CLAUDE_ENTRY).next;
  const { changed } = mergeClaudeSettings(first, CLAUDE_ENTRY);
  assert.equal(changed, false);
});

test('mergeClaudeSettings: preserves unrelated keys', () => {
  const { next } = mergeClaudeSettings({ theme: 'dark', enabledPlugins: { 'other@other': true } }, CLAUDE_ENTRY);
  assert.equal(next.theme, 'dark');
  assert.equal(next.enabledPlugins['other@other'], true);
  assert.equal(next.enabledPlugins['get-design-done@get-design-done'], true);
});

test('removeClaudeSettings: deletes plugin entries, leaves others', () => {
  const seeded = mergeClaudeSettings({ enabledPlugins: { 'other@other': true } }, CLAUDE_ENTRY).next;
  const { next, changed } = removeClaudeSettings(seeded, CLAUDE_ENTRY);
  assert.equal(changed, true);
  assert.equal(next.enabledPlugins['get-design-done@get-design-done'], undefined);
  assert.equal(next.enabledPlugins['other@other'], true);
  assert.equal(next.extraKnownMarketplaces, undefined);
});

test('removeClaudeSettings: idempotent on empty', () => {
  const { changed } = removeClaudeSettings({}, CLAUDE_ENTRY);
  assert.equal(changed, false);
});

test('buildAgentsFileContent: includes fingerprint', () => {
  const content = buildAgentsFileContent(getRuntime('opencode'));
  assert.ok(content.includes(PLUGIN_FINGERPRINT));
  assert.ok(content.includes('OpenCode'));
});

test('isPluginOwned: detects fingerprint', () => {
  assert.equal(isPluginOwned(`<!-- ${PLUGIN_FINGERPRINT} -->`), true);
  assert.equal(isPluginOwned('# Some other AGENTS.md'), false);
  assert.equal(isPluginOwned(null), false);
  assert.equal(isPluginOwned(undefined), false);
});

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-install-test-'));
}

test('installer: multi-artifact runtime — created → unchanged → removed (Phase 28.7-08)', () => {
  const dir = tmpDir();
  try {
    // Phase 28.7 (Plan 28.7-08) — opencode now installs via the
    // multi-artifact pipeline. Each source skill produces one file in
    // <configDir>/command/<gdd-skillName>.md per
    // runtime-artifact-layout.cjs#opencode. Top-level result.path now
    // reports the configDir; per-file detail is in result.results[].
    const r1 = installRuntime('opencode', { configDir: dir });
    assert.equal(r1.action, 'created');
    assert.equal(r1.path, dir);
    assert.ok(Array.isArray(r1.results) && r1.results.length > 0);
    // Spot-check the first staged file carries the converter fingerprint.
    const firstFile = r1.results[0];
    assert.equal(firstFile.action, 'created');
    assert.ok(fs.existsSync(firstFile.path));
    const content = fs.readFileSync(firstFile.path, 'utf8');
    assert.ok(
      content.includes('gdd: auto-generated from Claude SKILL.md'),
      'multi-artifact files must carry the gdd adapter fingerprint',
    );

    // Second install: idempotent.
    const r2 = installRuntime('opencode', { configDir: dir });
    assert.equal(r2.action, 'unchanged');

    // Uninstall removes it.
    const r3 = uninstallRuntime('opencode', { configDir: dir });
    assert.equal(r3.action, 'removed');
    assert.equal(fs.existsSync(firstFile.path), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer: gemini installs into commands/gdd/ (Phase 28.7-08)', () => {
  const dir = tmpDir();
  try {
    // Phase 28.7 (Plan 28.7-08) — gemini is no longer the special-cased
    // `GEMINI.md` runtime. It now installs via the multi-artifact pipeline
    // into <configDir>/commands/gdd/<gdd-skillName>.md per
    // runtime-artifact-layout.cjs#gemini.
    const r = installRuntime('gemini', { configDir: dir });
    assert.equal(r.action, 'created');
    assert.equal(r.path, dir);
    assert.ok(r.results && r.results.length > 0);
    // First staged file should be under commands/gdd/.
    const first = r.results[0];
    assert.ok(
      first.path.includes(path.join('commands', 'gdd')),
      `expected commands/gdd/ path, got ${first.path}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer: dry-run does not write (Phase 28.7-08)', () => {
  const dir = tmpDir();
  try {
    const r = installRuntime('opencode', { configDir: dir, dryRun: true });
    assert.equal(r.dryRun, true);
    assert.equal(r.action, 'created');
    // Multi-artifact: no command/ subdirectory should be created either.
    assert.equal(
      fs.existsSync(path.join(dir, 'command')),
      false,
      'dry-run must not create command/ dir',
    );
    // Per-file results still surface the planned action without writes.
    assert.ok(r.results && r.results.length > 0);
    for (const f of r.results) {
      assert.equal(f.action, 'created');
      assert.equal(fs.existsSync(f.path), false, `dry-run leaked file at ${f.path}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer: claude-marketplace — created → unchanged → removed', () => {
  const dir = tmpDir();
  try {
    const r1 = installRuntime('claude', { configDir: dir });
    // B1 fix (Phase 59.8): a FRESH install (no pre-existing settings.json)
    // must report `created`, not `updated`. The action was previously decided
    // AFTER the write, so it always read `updated`.
    assert.equal(r1.action, 'created', `fresh install must be 'created', got ${r1.action}`);
    const settings = JSON.parse(fs.readFileSync(r1.path, 'utf8'));
    assert.ok(settings.extraKnownMarketplaces['get-design-done']);
    assert.equal(settings.enabledPlugins['get-design-done@get-design-done'], true);

    const r2 = installRuntime('claude', { configDir: dir });
    assert.equal(r2.action, 'unchanged');

    const r3 = uninstallRuntime('claude', { configDir: dir });
    assert.equal(r3.action, 'removed');
    const after = JSON.parse(fs.readFileSync(r3.path, 'utf8'));
    assert.equal(after.enabledPlugins, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer: multi-artifact refuses to clobber a foreign command file (Phase 28.7-08)', () => {
  const dir = tmpDir();
  try {
    // Phase 28.7 (Plan 28.7-08) — opencode now writes per-skill command
    // files into <configDir>/command/<gdd-skillName>.md. Foreign-file
    // protection now applies at the per-file level (writeFingerprinted).
    // Seed one of the expected destinations with a user-authored file.
    fs.mkdirSync(path.join(dir, 'command'), { recursive: true });
    const foreignPath = path.join(dir, 'command', 'gdd-help.md');
    fs.writeFileSync(foreignPath, '# My own gdd-help.md (user-authored)\n');

    const r = installRuntime('opencode', { configDir: dir });
    // Aggregate action is skipped-foreign whenever ANY per-file write
    // refused (priority order in aggregateAction).
    assert.equal(r.action, 'skipped-foreign');
    assert.ok(r.reason);
    // Original content preserved.
    assert.equal(
      fs.readFileSync(foreignPath, 'utf8'),
      '# My own gdd-help.md (user-authored)\n',
    );
    // The skipped entry surfaces in per-file results.
    const skipped = r.results.find((x) => x.action === 'skipped-foreign');
    assert.ok(skipped, 'must have at least one skipped-foreign entry');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer: multi-artifact uninstall refuses to remove foreign command file (Phase 28.7-08)', () => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, 'command'), { recursive: true });
    const foreignPath = path.join(dir, 'command', 'gdd-help.md');
    fs.writeFileSync(foreignPath, '# My own gdd-help.md (user-authored)\n');

    const r = uninstallRuntime('opencode', { configDir: dir });
    assert.equal(r.action, 'skipped-foreign');
    assert.ok(fs.existsSync(foreignPath));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer: uninstall on missing target is unchanged', () => {
  const dir = tmpDir();
  try {
    const r = uninstallRuntime('opencode', { configDir: dir });
    assert.equal(r.action, 'unchanged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
