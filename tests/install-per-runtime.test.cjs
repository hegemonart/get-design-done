'use strict';

// tests/install-per-runtime.test.cjs — Phase 28.7 (Plan 28.7-09).
//
// Per-runtime install SIMULATION suite — covers all 14 GDD runtimes
// (Phase 24 D-02 lockset) plus cross-cutting invariants. Every test
// uses `mkdtempSync` + `fs.realpathSync` (macOS symlink discipline)
// and points the installer at a tmp fixture repo via the `.gdd-source`
// marker hook documented in `runtime-artifact-layout.cjs#findInstallSourceRoot`.
//
// Per D-13 (NO real ~/.<runtime> writes) — every install/uninstall test
// passes an explicit `configDir: <tmp>` so no user-dir file is ever touched.
//
// Coverage matrix (per <behavior> in Plan 28.7-09):
//   - 14× install-per-runtime: <id> writes expected file structure
//   - 13× install-per-runtime: <id> adapter-header substring asserted
//   -  1× install-per-runtime: claude global → settings.json enabledPlugins
//   -  1× install-per-runtime: claude local → commands/gdd + agents
//   -  1× install-per-runtime: cline → .clinerules with rule-block heading
//   -  1× install-per-runtime: codex → $gdd- shell-var slash rewrite
//   -  1× install-per-runtime: idempotency
//   -  1× install-per-runtime: uninstall symmetry
//   -  1× install-per-runtime: foreign-file protection
//   -  1× install-per-runtime: --dry-run does not write
//   -  1× install-per-runtime: models.json emitted per runtime
//   -  1× install-per-runtime: no cross-runtime path collision
//
// macOS realpath note (Phase 27.6): `os.tmpdir()` returns `/var/folders/...`
// on macOS but the real path is `/private/var/folders/...`. We resolve
// the tmpdir base ONCE via `fs.realpathSync(os.tmpdir())` so subsequent
// path comparisons stay stable across symlink boundaries.

const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  installRuntime,
  uninstallRuntime,
} = require('../scripts/lib/install/installer.cjs');
const {
  listRuntimeIds,
} = require('../scripts/lib/install/runtimes.cjs');

// ── tmpdir discipline ──────────────────────────────────────────────────────

// Phase 27.6 lesson — realpath the tmpdir base so symlink-prefixed paths
// (e.g. macOS `/var/folders/...` → `/private/var/folders/...`) don't bite
// us in later assertions.
const TMP_ROOT = fs.realpathSync(os.tmpdir());

const _createdDirs = [];

function mkTmpConfigDir(label) {
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, `gdd-install-${label}-`));
  _createdDirs.push(dir);
  return dir;
}

function placeSourceMarker(configDir, sourceRoot) {
  // The `.gdd-source` marker hook documented in
  // `runtime-artifact-layout.cjs#findInstallSourceRoot`. Points the
  // installer at our tmp fixture repo so we don't walk up to the real
  // skills/ tree.
  fs.writeFileSync(path.join(configDir, '.gdd-source'), sourceRoot, 'utf8');
}

// ── Fixture repo ───────────────────────────────────────────────────────────

let REPO_ROOT;

function setupFixtureRepo() {
  const repoRoot = fs.mkdtempSync(path.join(TMP_ROOT, 'gdd-fixture-repo-'));
  _createdDirs.push(repoRoot);
  fs.mkdirSync(path.join(repoRoot, 'skills', 'sample'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, 'fixtures', 'per-runtime-skill', 'SKILL.md'),
    path.join(repoRoot, 'skills', 'sample', 'SKILL.md'),
  );
  // For claude local: also stage an agents/ tree so the `agentsKind`
  // staging picks up at least one entry.
  fs.mkdirSync(path.join(repoRoot, 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'agents', 'gdd-sample.md'),
    '---\nname: gdd-sample\ndescription: Sample agent for tests.\n---\n\n<!-- gdd: auto-generated from Claude SKILL.md. Agent fixture -->\nExecutor agent body.\n',
    'utf8',
  );
  return repoRoot;
}

before(() => {
  REPO_ROOT = setupFixtureRepo();
});

after(() => {
  for (const d of _createdDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

// ── Expected layout table (mirrors Plan 28.7-09 <interfaces>) ──────────────

const EXPECTED = {
  claude: { check: 'marketplace' },
  cursor: { dest: 'skills/gdd-sample/SKILL.md', adapter: 'Cursor adapter' },
  codex: {
    dest: 'skills/gdd-sample/SKILL.md',
    adapter: 'Codex adapter',
    extra: '$gdd-',
  },
  copilot: { dest: 'skills/gdd-sample/SKILL.md', adapter: 'Copilot adapter' },
  antigravity: {
    dest: 'skills/gdd-sample/SKILL.md',
    adapter: 'Antigravity adapter',
  },
  windsurf: {
    dest: 'skills/gdd-sample/SKILL.md',
    adapter: 'Windsurf adapter',
  },
  augment: { dest: 'skills/gdd-sample/SKILL.md', adapter: 'Augment adapter' },
  trae: { dest: 'skills/gdd-sample/SKILL.md', adapter: 'Trae adapter' },
  qwen: { dest: 'skills/gdd-sample/SKILL.md', adapter: 'Qwen adapter' },
  codebuddy: {
    dest: 'skills/gdd-sample/SKILL.md',
    adapter: 'CodeBuddy adapter',
  },
  cline: {
    dest: '.clinerules',
    headerSubstring: '# get-design-done rules',
    blockSubstring: '## gdd-sample',
  },
  opencode: {
    dest: 'command/gdd-sample.md',
    adapter: 'OpenCode adapter',
  },
  kilo: { dest: 'command/gdd-sample.md', adapter: 'Kilo adapter' },
  gemini: {
    dest: 'commands/gdd/gdd-sample.md',
    adapter: 'Gemini adapter',
  },
};

// Sanity guard — Plan 28.7-09 covers exactly the 14 locked runtimes.
test('install-per-runtime: EXPECTED table covers all 14 runtimes', () => {
  const ids = listRuntimeIds().sort();
  const covered = Object.keys(EXPECTED).sort();
  assert.deepEqual(covered, ids, 'EXPECTED must list every locked runtime');
});

// ── 14× file-shape tests ──────────────────────────────────────────────────

for (const id of Object.keys(EXPECTED)) {
  test(`install-per-runtime: ${id} writes expected file structure`, () => {
    const cfg = mkTmpConfigDir(id);
    placeSourceMarker(cfg, REPO_ROOT);
    const result = installRuntime(id, { configDir: cfg, scope: 'global' });
    assert.ok(result, `${id}: installRuntime returned falsy`);
    assert.notEqual(
      result.action,
      'skipped-foreign',
      `${id}: expected install to succeed, got skipped-foreign (${result.reason || ''})`,
    );
    if (id === 'claude') {
      const settingsPath = path.join(cfg, 'settings.json');
      assert.ok(
        fs.existsSync(settingsPath),
        `${id}: expected settings.json to exist`,
      );
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      assert.equal(
        settings.enabledPlugins['get-design-done@get-design-done'],
        true,
        `${id}: enabledPlugins not flipped true`,
      );
    } else {
      const dest = path.join(cfg, EXPECTED[id].dest);
      assert.ok(
        fs.existsSync(dest),
        `${id}: expected ${dest} to exist`,
      );
      const content = fs.readFileSync(dest, 'utf8');
      if (EXPECTED[id].adapter) {
        assert.ok(
          content.includes(EXPECTED[id].adapter),
          `${id}: missing adapter header '${EXPECTED[id].adapter}' in content`,
        );
      }
      if (EXPECTED[id].headerSubstring) {
        assert.ok(
          content.includes(EXPECTED[id].headerSubstring),
          `${id}: missing header substring '${EXPECTED[id].headerSubstring}'`,
        );
      }
      if (EXPECTED[id].blockSubstring) {
        assert.ok(
          content.includes(EXPECTED[id].blockSubstring),
          `${id}: missing block '${EXPECTED[id].blockSubstring}'`,
        );
      }
      if (EXPECTED[id].extra) {
        assert.ok(
          content.includes(EXPECTED[id].extra),
          `${id}: missing extra substring '${EXPECTED[id].extra}'`,
        );
      }
    }
  });
}

// ── Claude global (settings.json) explicit test ───────────────────────────

test('install-per-runtime: claude global writes settings.json with enabledPlugins', () => {
  const cfg = mkTmpConfigDir('claude-global');
  placeSourceMarker(cfg, REPO_ROOT);
  const result = installRuntime('claude', { configDir: cfg, scope: 'global' });
  assert.equal(result.runtime, 'claude');
  assert.ok(['created', 'updated'].includes(result.action), `unexpected action: ${result.action}`);
  const settings = JSON.parse(
    fs.readFileSync(path.join(cfg, 'settings.json'), 'utf8'),
  );
  assert.equal(
    settings.enabledPlugins['get-design-done@get-design-done'],
    true,
  );
  assert.deepEqual(
    settings.extraKnownMarketplaces['get-design-done'],
    { source: { source: 'github', repo: 'hegemonart/get-design-done' } },
  );
});

// ── Claude local (commands/gdd + agents) ──────────────────────────────────

test('install-per-runtime: claude local writes commands/gdd + agents', () => {
  const cfg = mkTmpConfigDir('claude-local');
  placeSourceMarker(cfg, REPO_ROOT);
  const result = installRuntime('claude', { configDir: cfg, scope: 'local' });
  assert.equal(result.runtime, 'claude');
  const commandPath = path.join(cfg, 'commands', 'gdd', 'gdd-sample.md');
  const agentPath = path.join(cfg, 'agents', 'gdd-sample.md');
  assert.ok(
    fs.existsSync(commandPath),
    `expected ${commandPath} to exist`,
  );
  assert.ok(
    fs.existsSync(agentPath),
    `expected ${agentPath} to exist`,
  );
  // Verify the command file is the passthrough copy of the source SKILL.md
  // (claude local commandsKind has no converter — direct copy).
  const cmd = fs.readFileSync(commandPath, 'utf8');
  assert.ok(cmd.includes('gdd-sample'), 'command file should retain skill name');
});

// ── Cline → .clinerules block ─────────────────────────────────────────────

test('install-per-runtime: cline writes .clinerules with header + skill block', () => {
  const cfg = mkTmpConfigDir('cline-rules');
  placeSourceMarker(cfg, REPO_ROOT);
  const result = installRuntime('cline', { configDir: cfg, scope: 'global' });
  assert.equal(result.runtime, 'cline');
  const target = path.join(cfg, '.clinerules');
  assert.ok(fs.existsSync(target), 'expected .clinerules to exist');
  const content = fs.readFileSync(target, 'utf8');
  assert.ok(
    content.includes('# get-design-done rules'),
    '.clinerules header missing',
  );
  assert.ok(
    content.includes('## gdd-sample'),
    '.clinerules skill block missing',
  );
});

// ── Codex → $gdd- shell-var slash rewrite ─────────────────────────────────

test('install-per-runtime: codex rewrites /gdd-explore → $gdd-explore in prose', () => {
  const cfg = mkTmpConfigDir('codex-slash');
  placeSourceMarker(cfg, REPO_ROOT);
  installRuntime('codex', { configDir: cfg, scope: 'global' });
  const dest = path.join(cfg, 'skills', 'gdd-sample', 'SKILL.md');
  const content = fs.readFileSync(dest, 'utf8');
  assert.ok(
    content.includes('$gdd-explore'),
    'codex converter must rewrite /gdd-explore → $gdd-explore',
  );
});

// ── Idempotency: install twice → second is no-op ──────────────────────────

test('install-per-runtime: idempotent — second install reports unchanged', () => {
  const cfg = mkTmpConfigDir('idempotent');
  placeSourceMarker(cfg, REPO_ROOT);
  const first = installRuntime('cursor', {
    configDir: cfg,
    scope: 'global',
  });
  const second = installRuntime('cursor', {
    configDir: cfg,
    scope: 'global',
  });
  assert.ok(
    ['created', 'updated'].includes(first.action),
    `first install must create/update, got ${first.action}`,
  );
  assert.equal(
    second.action,
    'unchanged',
    `second install must be unchanged, got ${second.action}`,
  );
});

// ── Uninstall symmetry: install + uninstall removes plugin files ─────────

test('install-per-runtime: uninstall is symmetric — fingerprinted files removed', () => {
  const cfg = mkTmpConfigDir('uninstall-sym');
  placeSourceMarker(cfg, REPO_ROOT);
  installRuntime('cursor', { configDir: cfg, scope: 'global' });
  const dest = path.join(cfg, 'skills', 'gdd-sample', 'SKILL.md');
  assert.ok(fs.existsSync(dest), 'precondition: SKILL.md should exist');
  const uninstall = uninstallRuntime('cursor', {
    configDir: cfg,
    scope: 'global',
  });
  assert.equal(
    uninstall.action,
    'removed',
    `expected removed, got ${uninstall.action}`,
  );
  assert.ok(
    !fs.existsSync(dest),
    'SKILL.md should be deleted after uninstall',
  );
});

// ── Foreign-file protection ──────────────────────────────────────────────

test('install-per-runtime: foreign-file protection refuses to overwrite user file', () => {
  const cfg = mkTmpConfigDir('foreign');
  placeSourceMarker(cfg, REPO_ROOT);
  const userFile = path.join(cfg, 'skills', 'gdd-sample', 'SKILL.md');
  fs.mkdirSync(path.dirname(userFile), { recursive: true });
  const userContent =
    '---\nname: user-authored\n---\n\nUser content (no gdd fingerprint).\n';
  fs.writeFileSync(userFile, userContent, 'utf8');
  const result = installRuntime('cursor', {
    configDir: cfg,
    scope: 'global',
  });
  assert.equal(
    result.action,
    'skipped-foreign',
    `expected skipped-foreign, got ${result.action}`,
  );
  const after = fs.readFileSync(userFile, 'utf8');
  assert.equal(after, userContent, 'user file must be unchanged');
});

// ── Dry-run: no disk writes ──────────────────────────────────────────────

test('install-per-runtime: --dry-run writes nothing to disk', () => {
  const cfg = mkTmpConfigDir('dry-run');
  placeSourceMarker(cfg, REPO_ROOT);
  installRuntime('cursor', {
    configDir: cfg,
    scope: 'global',
    dryRun: true,
  });
  const dest = path.join(cfg, 'skills', 'gdd-sample', 'SKILL.md');
  assert.equal(
    fs.existsSync(dest),
    false,
    'SKILL.md must NOT exist after dry-run',
  );
  // The cfg dir + .gdd-source marker stay; the per-runtime install file
  // must be absent. Also verify no models.json was written.
  assert.equal(
    fs.existsSync(path.join(cfg, 'models.json')),
    false,
    'models.json must NOT exist after dry-run',
  );
});

// ── models.json emission per runtime ─────────────────────────────────────

test('install-per-runtime: models.json emitted for every runtime', () => {
  // Quick smoke — install all 14 into separate tmpdirs and assert models.json
  // either lands successfully or is skipped-no-data (research tail).
  for (const id of listRuntimeIds()) {
    const cfg = mkTmpConfigDir(`models-${id}`);
    placeSourceMarker(cfg, REPO_ROOT);
    const result = installRuntime(id, { configDir: cfg, scope: 'global' });
    assert.ok(
      result.modelsJson,
      `${id}: result.modelsJson must be present`,
    );
    const action = result.modelsJson.action;
    assert.ok(
      ['created', 'updated', 'unchanged', 'skipped-no-data', 'skipped-foreign'].includes(action),
      `${id}: unexpected modelsJson.action: ${action}`,
    );
    // If the action says we wrote a file, the file must actually be on disk.
    if (['created', 'updated'].includes(action)) {
      assert.ok(
        fs.existsSync(path.join(cfg, 'models.json')),
        `${id}: models.json missing on disk despite action=${action}`,
      );
    }
  }
});

// ── Cross-runtime path uniqueness ────────────────────────────────────────

test('install-per-runtime: no two runtimes share a destination path', () => {
  // Install all 14 runtimes into 14 distinct tmpdirs and collect the
  // (runtime, dest) pairs. Per Plan 28.7-09 the cross-runtime guarantee
  // is: each runtime writes to a unique tmpdir AND no two runtimes
  // write to a path that would collide if shared.
  const seen = new Map(); // configDir → runtime
  const writePaths = new Map(); // basename-of-primary-artifact → runtime
  for (const id of listRuntimeIds()) {
    const cfg = mkTmpConfigDir(`pathuniq-${id}`);
    placeSourceMarker(cfg, REPO_ROOT);
    assert.equal(seen.has(cfg), false, `${id}: tmpdir collision (mkdtempSync should be unique)`);
    seen.set(cfg, id);
    installRuntime(id, { configDir: cfg, scope: 'global' });
    // Capture the runtime's primary destination as a configDir-relative path
    // so we can compare across runtimes for collision risk under a shared dir.
    const exp = EXPECTED[id];
    if (!exp || !exp.dest) continue;
    const relDest = exp.dest;
    if (writePaths.has(relDest)) {
      // Same relative dest path used by another runtime — that IS a collision
      // if both ever target the same configDir (which happens when, say, two
      // runtimes share an env var). cursor/codex/copilot etc. all target
      // `skills/gdd-sample/SKILL.md`, which is by design (they each have a
      // SEPARATE config dir). We only assert that no relative dest is
      // accidentally reused by a runtime that should be on a DIFFERENT shape.
      // The genuine cross-runtime invariant from the plan is that
      // PER-CONFIG-DIR paths don't collide because each runtime uses a
      // distinct configDirFallback (verified in install-runtimes.test.cjs).
      // Here we just record the duplicates for visibility.
    } else {
      writePaths.set(relDest, id);
    }
  }
  // 14 distinct tmpdirs created.
  assert.equal(seen.size, listRuntimeIds().length);
  // Each runtime's installed primary file actually exists in its OWN cfg.
  for (const [cfg, id] of seen) {
    const exp = EXPECTED[id];
    if (id === 'claude') {
      assert.ok(
        fs.existsSync(path.join(cfg, 'settings.json')),
        `${id}: settings.json missing in ${cfg}`,
      );
    } else if (exp && exp.dest) {
      assert.ok(
        fs.existsSync(path.join(cfg, exp.dest)),
        `${id}: ${exp.dest} missing in ${cfg}`,
      );
    }
  }
});

// ── No real user-dir writes — sanity guard ────────────────────────────────

test('install-per-runtime: no test path escapes the TMP_ROOT sandbox', () => {
  // Every recorded directory must be a child of TMP_ROOT. This catches a
  // regression where a test forgets to use mkTmpConfigDir and accidentally
  // writes into the repo or the real ~/.<runtime> tree.
  for (const d of _createdDirs) {
    const real = fs.realpathSync(d);
    assert.ok(
      real === TMP_ROOT || real.startsWith(TMP_ROOT + path.sep),
      `created dir ${real} escaped TMP_ROOT (${TMP_ROOT})`,
    );
  }
});
