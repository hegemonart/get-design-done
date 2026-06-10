'use strict';

// test/suite/install-skill-siblings.test.cjs - Phase 59.5 (Batch H, item H6).
//
// Regression coverage for the cursor flat-layout install dropping a skill's
// co-located sibling reference files. Before H6, `installMultiArtifact` staged
// ONLY `<skill>/SKILL.md`; sibling `*.md` reference docs that sit next to
// SKILL.md (e.g. `<name>-procedure.md`, `<name>-rules.md`) were never written,
// so links from SKILL.md resolved to nothing on Cursor installs.
//
// These tests build a throwaway fixture repo in an isolated temp dir and point
// the installer at it via the `.gdd-source` marker hook documented in
// `runtime-artifact-layout.cjs#findInstallSourceRoot`. No real ~/.<runtime>
// path is ever touched (every install passes an explicit tmp `configDir`).
//
// macOS realpath note: `os.tmpdir()` is symlinked on macOS
// (`/var/folders` -> `/private/var/folders`); resolve the base once so later
// path comparisons stay stable.

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  installRuntime,
  uninstallRuntime,
} = require('../../scripts/lib/install/installer.cjs');

const TMP_ROOT = fs.realpathSync(os.tmpdir());
const _createdDirs = [];

function mkTmpDir(label) {
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, `gdd-sibling-${label}-`));
  _createdDirs.push(dir);
  return dir;
}

// Build a fixture repo whose `skills/sample/` dir contains a SKILL.md PLUS a
// sibling reference file. The sibling carries no plugin fingerprint in source
// (mirrors how real skill reference docs ship: plain markdown).
function setupFixtureRepo() {
  const repoRoot = mkTmpDir('repo');
  const skillDir = path.join(repoRoot, 'skills', 'sample');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      'name: gdd-sample',
      'description: "Sample skill with a sibling reference file."',
      '---',
      '',
      '# Sample Skill',
      '',
      'Detailed steps live in `./sample-procedure.md`.',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(skillDir, 'sample-procedure.md'),
    '# Sample Procedure\n\nStep 1. Do the thing.\nStep 2. Verify the thing.\n',
    'utf8',
  );
  // A nested subdirectory must NOT be carried by the minimal sibling-carry
  // (scope is top-level sibling `.md` files only).
  fs.mkdirSync(path.join(skillDir, 'procedures'), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'procedures', 'deep.md'),
    '# Deep (nested): should NOT be installed by sibling-carry.\n',
    'utf8',
  );
  return repoRoot;
}

function placeSourceMarker(configDir, sourceRoot) {
  fs.writeFileSync(path.join(configDir, '.gdd-source'), sourceRoot, 'utf8');
}

after(() => {
  for (const d of _createdDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

test('cursor install carries the SKILL.md sibling reference file', () => {
  const repo = setupFixtureRepo();
  const cfg = mkTmpDir('cursor');
  placeSourceMarker(cfg, repo);

  const result = installRuntime('cursor', { configDir: cfg, scope: 'global' });
  assert.notEqual(
    result.action,
    'skipped-foreign',
    `install should succeed, got skipped-foreign (${result.reason || ''})`,
  );

  const skillMd = path.join(cfg, 'skills', 'gdd-sample', 'SKILL.md');
  const siblingMd = path.join(cfg, 'skills', 'gdd-sample', 'sample-procedure.md');

  assert.ok(fs.existsSync(skillMd), 'SKILL.md must land');
  assert.ok(
    fs.existsSync(siblingMd),
    'sibling sample-procedure.md must land alongside SKILL.md',
  );

  // The carried sibling preserves its source content and gains a plugin
  // fingerprint header (so uninstall + foreign-file protection recognize it).
  const siblingContent = fs.readFileSync(siblingMd, 'utf8');
  assert.ok(
    siblingContent.includes('Step 1. Do the thing.'),
    'sibling content must be preserved',
  );
  assert.ok(
    siblingContent.includes('gdd: auto-generated from Claude SKILL.md'),
    'sibling must carry the plugin fingerprint',
  );

  // Nested-subdir files are out of scope for the minimal sibling-carry.
  const nested = path.join(cfg, 'skills', 'gdd-sample', 'procedures', 'deep.md');
  assert.equal(
    fs.existsSync(nested),
    false,
    'nested subdirectory files must NOT be carried by sibling-carry',
  );
});

test('cursor sibling-carry is idempotent: second install is unchanged', () => {
  const repo = setupFixtureRepo();
  const cfg = mkTmpDir('cursor-idem');
  placeSourceMarker(cfg, repo);

  const first = installRuntime('cursor', { configDir: cfg, scope: 'global' });
  const second = installRuntime('cursor', { configDir: cfg, scope: 'global' });

  assert.ok(
    ['created', 'updated'].includes(first.action),
    `first install must create/update, got ${first.action}`,
  );
  assert.equal(
    second.action,
    'unchanged',
    `second install must be unchanged (sibling included), got ${second.action}`,
  );
});

test('cursor uninstall removes the carried sibling and trims the skill dir', () => {
  const repo = setupFixtureRepo();
  const cfg = mkTmpDir('cursor-uninstall');
  placeSourceMarker(cfg, repo);

  installRuntime('cursor', { configDir: cfg, scope: 'global' });
  const skillDir = path.join(cfg, 'skills', 'gdd-sample');
  const siblingMd = path.join(skillDir, 'sample-procedure.md');
  assert.ok(fs.existsSync(siblingMd), 'precondition: sibling should exist');

  const result = uninstallRuntime('cursor', { configDir: cfg, scope: 'global' });
  assert.equal(result.action, 'removed', `expected removed, got ${result.action}`);

  assert.ok(!fs.existsSync(siblingMd), 'sibling must be removed on uninstall');
  assert.ok(
    !fs.existsSync(path.join(skillDir, 'SKILL.md')),
    'SKILL.md must be removed on uninstall',
  );
  // With both SKILL.md and the sibling gone, the per-skill dir is now empty
  // and should have been trimmed.
  assert.equal(
    fs.existsSync(skillDir),
    false,
    'empty skill dir should be trimmed after sibling removal',
  );
});

test('cursor uninstall leaves a foreign (user-authored) sibling in place', () => {
  const repo = setupFixtureRepo();
  const cfg = mkTmpDir('cursor-foreign-sibling');
  placeSourceMarker(cfg, repo);

  installRuntime('cursor', { configDir: cfg, scope: 'global' });
  const skillDir = path.join(cfg, 'skills', 'gdd-sample');
  // Simulate a user dropping their own reference file (no plugin fingerprint).
  const userSibling = path.join(skillDir, 'user-notes.md');
  fs.writeFileSync(userSibling, '# My notes (no fingerprint)\n', 'utf8');

  uninstallRuntime('cursor', { configDir: cfg, scope: 'global' });

  assert.ok(
    fs.existsSync(userSibling),
    'user-authored sibling must survive uninstall',
  );
  // The carried (plugin-owned) sibling is gone; the dir is NOT trimmed because
  // the foreign file still occupies it.
  assert.ok(
    !fs.existsSync(path.join(skillDir, 'sample-procedure.md')),
    'plugin-owned sibling should still be removed',
  );
  assert.ok(fs.existsSync(skillDir), 'dir with surviving foreign file is kept');
});

test('non-cursor skills runtime (codex) ALSO carries the sibling (AR6 generalization)', () => {
  // AR6 fix (Phase 59.8): sibling-carry was generalized from cursor-only to
  // EVERY skillsKind runtime. A non-cursor skills runtime (codex) must now
  // carry the SKILL.md sibling reference file too — otherwise its installed
  // skills ship dead `./X-procedure.md` relative links.
  const repo = setupFixtureRepo();
  const cfg = mkTmpDir('codex-sibling');
  placeSourceMarker(cfg, repo);

  installRuntime('codex', { configDir: cfg, scope: 'global' });

  const skillMd = path.join(cfg, 'skills', 'gdd-sample', 'SKILL.md');
  const siblingMd = path.join(cfg, 'skills', 'gdd-sample', 'sample-procedure.md');
  assert.ok(fs.existsSync(skillMd), 'codex SKILL.md must still land');
  assert.ok(
    fs.existsSync(siblingMd),
    'codex must now carry the sibling (AR6: generalized to all skillsKind runtimes)',
  );
  const siblingContent = fs.readFileSync(siblingMd, 'utf8');
  assert.ok(
    siblingContent.includes('Step 1. Do the thing.'),
    'codex sibling content must be preserved',
  );
  assert.ok(
    siblingContent.includes('gdd: auto-generated from Claude SKILL.md'),
    'codex sibling must carry the plugin fingerprint',
  );

  // Nested-subdir files remain out of scope for sibling-carry.
  const nested = path.join(cfg, 'skills', 'gdd-sample', 'procedures', 'deep.md');
  assert.equal(
    fs.existsSync(nested),
    false,
    'nested subdirectory files must NOT be carried by sibling-carry',
  );
});

test('cursor dry-run writes neither SKILL.md nor the sibling', () => {
  const repo = setupFixtureRepo();
  const cfg = mkTmpDir('cursor-dry');
  placeSourceMarker(cfg, repo);

  installRuntime('cursor', { configDir: cfg, scope: 'global', dryRun: true });

  const skillMd = path.join(cfg, 'skills', 'gdd-sample', 'SKILL.md');
  const siblingMd = path.join(cfg, 'skills', 'gdd-sample', 'sample-procedure.md');
  assert.equal(fs.existsSync(skillMd), false, 'SKILL.md must NOT be written in dry-run');
  assert.equal(fs.existsSync(siblingMd), false, 'sibling must NOT be written in dry-run');
});

test('no sibling test path escapes the TMP_ROOT sandbox', () => {
  for (const d of _createdDirs) {
    const real = fs.realpathSync(d);
    assert.ok(
      real === TMP_ROOT || real.startsWith(TMP_ROOT + path.sep),
      `created dir ${real} escaped TMP_ROOT (${TMP_ROOT})`,
    );
  }
});
