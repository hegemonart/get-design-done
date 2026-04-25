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
} = require('../scripts/lib/install/merge.cjs');
const { getRuntime } = require('../scripts/lib/install/runtimes.cjs');
const { installRuntime, uninstallRuntime } = require('../scripts/lib/install/installer.cjs');

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

test('installer: agents-md runtime — created → unchanged → removed', () => {
  const dir = tmpDir();
  try {
    // First install: creates the file.
    const r1 = installRuntime('opencode', { configDir: dir });
    assert.equal(r1.action, 'created');
    assert.ok(fs.existsSync(r1.path));
    const content = fs.readFileSync(r1.path, 'utf8');
    assert.ok(content.includes(PLUGIN_FINGERPRINT));

    // Second install: idempotent.
    const r2 = installRuntime('opencode', { configDir: dir });
    assert.equal(r2.action, 'unchanged');

    // Uninstall removes it.
    const r3 = uninstallRuntime('opencode', { configDir: dir });
    assert.equal(r3.action, 'removed');
    assert.equal(fs.existsSync(r3.path), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer: gemini drops GEMINI.md (not AGENTS.md)', () => {
  const dir = tmpDir();
  try {
    const r = installRuntime('gemini', { configDir: dir });
    assert.equal(r.action, 'created');
    assert.equal(path.basename(r.path), 'GEMINI.md');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer: dry-run does not write', () => {
  const dir = tmpDir();
  try {
    const r = installRuntime('opencode', { configDir: dir, dryRun: true });
    assert.equal(r.dryRun, true);
    assert.equal(r.action, 'created');
    assert.equal(fs.existsSync(r.path), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer: claude-marketplace — created → unchanged → removed', () => {
  const dir = tmpDir();
  try {
    const r1 = installRuntime('claude', { configDir: dir });
    assert.ok(['created', 'updated'].includes(r1.action), `unexpected: ${r1.action}`);
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

test('installer: agents-md refuses to clobber foreign AGENTS.md', () => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# My own AGENTS.md\n');
    const r = installRuntime('opencode', { configDir: dir });
    assert.equal(r.action, 'skipped-foreign');
    assert.ok(r.reason);
    // Original content preserved.
    assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), '# My own AGENTS.md\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer: agents-md uninstall refuses to remove foreign AGENTS.md', () => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# My own AGENTS.md\n');
    const r = uninstallRuntime('opencode', { configDir: dir });
    assert.equal(r.action, 'skipped-foreign');
    assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')));
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
