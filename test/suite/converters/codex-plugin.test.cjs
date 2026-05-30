'use strict';

// tests/converters/codex-plugin.test.cjs — Phase 28.8 (Plan 28-8-C1).
//
// Tmpdir-simulation tests for the Codex Plugin Tier-2
// distribution-channel converter + manifest schema validation. No live
// `codex plugin` CLI invocation — all fixtures are seeded in os.tmpdir()
// and torn down at end of each test (CONTEXT D-10).
//
// What this test guards:
//   (a) buildManifest produces a spec-compliant Codex manifest shape
//       per .planning/research/codex-plugins-2026-05-19.md § Manifest Format
//   (b) convert() emits the bundle correctly to a tmpdir (manifest + skills)
//   (c) The committed .codex-plugin/plugin.json is itself spec-compliant
//   (d) The new codex-plugin runtime entry is registered in runtimes.cjs
//   (e) D-05 invariant: scripts/lib/install/converters/codex.cjs is
//       byte-identical to HEAD (file-drop converter untouched)
//   (f) D-14 invariant: no .codex-plugin/marketplace.json file shipped
//       (Codex reuses our .claude-plugin/marketplace.json via legacy-compat)
//   (g) Cross-marketplace name consistency — committed manifest `name`
//       matches .claude-plugin/marketplace.json#plugins[0].name
//
// D-10 enforcement: no live network access, no `codex plugin` CLI shell-outs,
// no remote URL retrieval. All references operate on tmpdir paths and
// in-process objects. The only `child_process` usage is `git show HEAD:`
// for the D-05 byte-identical regression guard — local filesystem only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const {
  buildManifest,
  convert,
  MANIFEST_REQUIRED_FIELDS,
  CURATED_KEYWORDS,
} = require('../../../scripts/lib/install/converters/codex-plugin.cjs');
const runtimes = require('../../../scripts/lib/install/runtimes.cjs');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MANIFEST_PATH = path.join(REPO_ROOT, '.codex-plugin', 'plugin.json');
const CLAUDE_MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');

// ── Helpers ────────────────────────────────────────────────────────────

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function mkTmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-codex-plugin-'));
}

function rmTmpdir(d) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch (_e) {
    // Best-effort cleanup; tests should not fail on teardown.
  }
}

function seedFixtureSkills(root) {
  const a = path.join(root, 'skills', 'sample');
  fs.mkdirSync(a, { recursive: true });
  fs.writeFileSync(
    path.join(a, 'SKILL.md'),
    '---\nname: gdd-sample\ndescription: Sample skill.\n---\n\nSkill body.\n',
    'utf8'
  );
  return path.join(root, 'skills');
}

// Shared minimal sources fixture for buildManifest unit tests.
function fixtureSources(overrides = {}) {
  return {
    packageJson: {
      name: '@hegemonart/get-design-done',
      version: '1.28.8',
      description:
        'A design-quality pipeline for AI coding agents: brief, plan, implement, and verify UI work against your design system.',
      author: 'Hegemon',
      homepage: 'https://github.com/hegemonart/get-design-done',
      repository: {
        type: 'git',
        url: 'https://github.com/hegemonart/get-design-done.git',
      },
      license: 'MIT',
      keywords: Array.from({ length: 50 }, (_, i) => `keyword-${i}`).concat([
        'design',
        'ui',
        'ux',
        'frontend',
        'pipeline',
        'design-system',
        'accessibility',
        'figma',
        'wcag',
        'agent-sdk',
      ]),
    },
    claudePlugin: {
      author: { name: 'hegemonart', url: 'https://github.com/hegemonart' },
    },
    marketplaceJson: {
      plugins: [{ name: 'get-design-done', category: 'design' }],
    },
    readmeFirstPara: 'Get Design Done is an agent-orchestrated 5-stage design pipeline.',
    ...overrides,
  };
}

// ── buildManifest unit tests ───────────────────────────────────────────

test('codex-plugin: buildManifest produces required fields', () => {
  const m = buildManifest(fixtureSources());
  for (const f of MANIFEST_REQUIRED_FIELDS) {
    assert.ok(m[f], `manifest missing required field: ${f}`);
  }
  assert.match(m.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'name must be kebab-case');
  assert.match(m.version, /^\d+\.\d+\.\d+/, 'version must be semver');
});

test('codex-plugin: buildManifest strips npm scope from name when no marketplaceJson', () => {
  const src = fixtureSources({ marketplaceJson: undefined, claudePlugin: undefined });
  const m = buildManifest(src);
  assert.equal(m.name, 'get-design-done');
});

test('codex-plugin: buildManifest prefers marketplaceJson.plugins[0].name (priority order)', () => {
  const src = fixtureSources({
    marketplaceJson: { plugins: [{ name: 'preferred-name', category: 'design' }] },
  });
  const m = buildManifest(src);
  assert.equal(m.name, 'preferred-name');
});

test('codex-plugin: buildManifest produces kebab-case name regex match', () => {
  const m = buildManifest(fixtureSources());
  assert.match(m.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('codex-plugin: buildManifest produces semver version regex match', () => {
  const m = buildManifest(fixtureSources());
  assert.match(m.version, /^\d+\.\d+\.\d+/);
});

test('codex-plugin: buildManifest sets skills to literal "./skills/"', () => {
  const m = buildManifest(fixtureSources());
  assert.equal(m.skills, './skills/');
});

test('codex-plugin: buildManifest sets mcpServers["gdd-mcp"] inline', () => {
  const m = buildManifest(fixtureSources());
  assert.ok(m.mcpServers && m.mcpServers['gdd-mcp'], 'mcpServers.gdd-mcp missing');
  assert.equal(m.mcpServers['gdd-mcp'].command, 'npx');
  assert.ok(Array.isArray(m.mcpServers['gdd-mcp'].args), 'args must be array');
  assert.ok(m.mcpServers['gdd-mcp'].args.includes('gdd-mcp'), 'args must include gdd-mcp bin name');
});

test('codex-plugin: buildManifest capitalizes interface.category', () => {
  const m = buildManifest(fixtureSources());
  assert.equal(m.interface.category, 'Design');
});

test('codex-plugin: buildManifest truncates interface.shortDescription to ≤120', () => {
  const m = buildManifest(fixtureSources());
  assert.ok(
    m.interface.shortDescription.length <= 120,
    `shortDescription too long: ${m.interface.shortDescription.length}`
  );
});

test('codex-plugin: buildManifest drops .git suffix from repository URL', () => {
  const m = buildManifest(fixtureSources());
  assert.equal(typeof m.repository, 'string');
  assert.equal(m.repository.endsWith('.git'), false, `repository should not end with .git: ${m.repository}`);
});

test('codex-plugin: buildManifest curates keywords to ≤10 entries', () => {
  const m = buildManifest(fixtureSources());
  assert.ok(Array.isArray(m.keywords), 'keywords must be array');
  assert.ok(m.keywords.length <= 10, `keywords should be ≤10, got ${m.keywords.length}`);
});

test('codex-plugin: buildManifest OMITS top-level apps field (Schema Mapping N/A)', () => {
  const m = buildManifest(fixtureSources());
  assert.ok(!('apps' in m), 'apps must be omitted');
});

test('codex-plugin: buildManifest OMITS top-level hooks field (off-by-default per features.plugin_hooks)', () => {
  const m = buildManifest(fixtureSources());
  assert.ok(!('hooks' in m), 'hooks must be omitted');
});

test('codex-plugin: buildManifest OMITS N/A interface sub-fields', () => {
  const m = buildManifest(fixtureSources());
  for (const f of [
    'privacyPolicyURL',
    'termsOfServiceURL',
    'composerIcon',
    'logo',
    'screenshots',
  ]) {
    assert.ok(!(f in m.interface), `interface.${f} must be omitted (Schema Mapping says N/A)`);
  }
});

test('codex-plugin: buildManifest uses author from claudePlugin (has url)', () => {
  const m = buildManifest(fixtureSources());
  assert.equal(typeof m.author, 'object');
  assert.equal(m.author.name, 'hegemonart');
  assert.equal(m.author.url, 'https://github.com/hegemonart');
});

test('codex-plugin: buildManifest throws if packageJson.version missing or non-semver', () => {
  // Missing entirely.
  assert.throws(
    () =>
      buildManifest({
        packageJson: { name: 'x', description: 'd', author: 'foo' },
      }),
    /version/
  );
  // Non-semver-shaped.
  assert.throws(
    () =>
      buildManifest({
        packageJson: {
          name: 'x',
          description: 'd',
          author: 'foo',
          version: 'not-a-version',
        },
      }),
    /semver/
  );
});

test('codex-plugin: buildManifest throws if packageJson.description missing', () => {
  assert.throws(
    () =>
      buildManifest({
        packageJson: { name: 'x', version: '1.0.0', author: 'foo' },
      }),
    /description/
  );
});

// ── convert() tmpdir tests ─────────────────────────────────────────────

test('codex-plugin: convert writes manifest to outDir/.codex-plugin/plugin.json', () => {
  const tmp = mkTmpdir();
  try {
    const skillsDir = seedFixtureSkills(tmp);
    const outDir = path.join(tmp, 'out');
    const manifest = buildManifest(fixtureSources());
    const result = convert({ skillsDir, outDir, manifest });

    assert.ok(fs.existsSync(result.manifestPath), 'manifest file should exist');
    const written = loadJson(result.manifestPath);
    assert.equal(written.name, manifest.name);
    assert.equal(written.version, manifest.version);
    assert.deepEqual(written, manifest, 'parsed-equal to input manifest');
  } finally {
    rmTmpdir(tmp);
  }
});

test('codex-plugin: convert copies skills tree verbatim', () => {
  const tmp = mkTmpdir();
  try {
    const skillsDir = seedFixtureSkills(tmp);
    const sampleSrc = path.join(skillsDir, 'sample', 'SKILL.md');
    const skillContent = fs.readFileSync(sampleSrc, 'utf8');

    const outDir = path.join(tmp, 'out');
    convert({ skillsDir, outDir, manifest: buildManifest(fixtureSources()) });

    const copiedPath = path.join(outDir, 'skills', 'sample', 'SKILL.md');
    assert.ok(fs.existsSync(copiedPath), 'skill should be copied verbatim');
    assert.equal(
      fs.readFileSync(copiedPath, 'utf8'),
      skillContent,
      'skill content should be byte-identical'
    );
  } finally {
    rmTmpdir(tmp);
  }
});

test('codex-plugin: convert throws on manifest missing required field', () => {
  const tmp = mkTmpdir();
  try {
    const skillsDir = seedFixtureSkills(tmp);
    const badManifest = buildManifest(fixtureSources());
    delete badManifest.version;
    assert.throws(
      () => convert({ skillsDir, outDir: path.join(tmp, 'out'), manifest: badManifest }),
      /missing required field/
    );
  } finally {
    rmTmpdir(tmp);
  }
});

test('codex-plugin: convert creates outDir if it does not exist', () => {
  const tmp = mkTmpdir();
  try {
    const skillsDir = seedFixtureSkills(tmp);
    const outDir = path.join(tmp, 'deeply', 'nested', 'out');
    assert.ok(!fs.existsSync(outDir), 'precondition: outDir should not pre-exist');
    convert({ skillsDir, outDir, manifest: buildManifest(fixtureSources()) });
    assert.ok(fs.existsSync(outDir), 'convert should create outDir');
    assert.ok(
      fs.existsSync(path.join(outDir, '.codex-plugin', 'plugin.json')),
      'manifest should land under created outDir'
    );
  } finally {
    rmTmpdir(tmp);
  }
});

test('codex-plugin: convert is idempotent (re-run produces identical output)', () => {
  const tmp = mkTmpdir();
  try {
    const skillsDir = seedFixtureSkills(tmp);
    const outDir = path.join(tmp, 'out');
    const manifest = buildManifest(fixtureSources());

    convert({ skillsDir, outDir, manifest });
    const manifest1 = fs.readFileSync(
      path.join(outDir, '.codex-plugin', 'plugin.json'),
      'utf8'
    );
    const skill1 = fs.readFileSync(
      path.join(outDir, 'skills', 'sample', 'SKILL.md'),
      'utf8'
    );

    convert({ skillsDir, outDir, manifest });
    const manifest2 = fs.readFileSync(
      path.join(outDir, '.codex-plugin', 'plugin.json'),
      'utf8'
    );
    const skill2 = fs.readFileSync(
      path.join(outDir, 'skills', 'sample', 'SKILL.md'),
      'utf8'
    );

    assert.equal(manifest1, manifest2, 'manifest stable on re-run');
    assert.equal(skill1, skill2, 'skill content stable on re-run');
  } finally {
    rmTmpdir(tmp);
  }
});

// ── Committed-file sanity tests ────────────────────────────────────────

test('codex-plugin: committed manifest validates against spec', () => {
  const m = loadJson(MANIFEST_PATH);
  for (const f of MANIFEST_REQUIRED_FIELDS) {
    assert.ok(m[f], `committed manifest missing required field: ${f}`);
  }
  assert.match(m.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.match(m.version, /^\d+\.\d+\.\d+/);
  assert.equal(m.skills, './skills/');
  assert.ok(m.mcpServers && m.mcpServers['gdd-mcp'], 'mcpServers.gdd-mcp must be present');
  assert.equal(m.interface.category, 'Design');
  assert.equal(m.interface.displayName, 'Get Design Done');
});

test('codex-plugin: committed manifest name matches .claude-plugin/marketplace.json', () => {
  const codex = loadJson(MANIFEST_PATH);
  const claude = loadJson(CLAUDE_MARKETPLACE_PATH);
  assert.equal(
    codex.name,
    claude.plugins[0].name,
    'plugin names must match across marketplaces (D-14 catalog reuse — Codex reads our .claude-plugin/marketplace.json directly)'
  );
});

// ── Runtime registry tests ─────────────────────────────────────────────

test('codex-plugin: runtimes.cjs registers codex-plugin entry', () => {
  const ids = runtimes.listRuntimeIds();
  assert.ok(ids.includes('codex-plugin'), `codex-plugin not registered: ${ids.join(', ')}`);
  const entry = runtimes.getRuntime('codex-plugin');
  assert.equal(entry.kind, 'codex-plugin');
  assert.equal(entry.displayName, 'Codex Plugin');
});

test('codex-plugin: runtimes.cjs listRuntimeIds includes codex-plugin and ≥15 entries', () => {
  const ids = runtimes.listRuntimeIds();
  assert.ok(ids.length >= 15, `expected ≥15 entries, got ${ids.length}`);
  assert.ok(ids.includes('codex-plugin'), 'codex-plugin must be present');
});

// ── D-05 + D-14 invariant tests ────────────────────────────────────────

test('codex-plugin: no separate Codex marketplace catalog file (D-14)', () => {
  const catalogPath = path.join(REPO_ROOT, '.codex-plugin', 'marketplace.json');
  assert.ok(
    !fs.existsSync(catalogPath),
    `D-14 violation: .codex-plugin/marketplace.json must NOT exist; Codex reuses .claude-plugin/marketplace.json`
  );
});

test('codex-plugin: Phase 28.7 codex.cjs is unchanged from HEAD (D-05)', (t) => {
  const currentPath = path.join(REPO_ROOT, 'scripts', 'lib', 'install', 'converters', 'codex.cjs');
  const current = fs.readFileSync(currentPath, 'utf8');
  let head;
  try {
    head = execSync('git show HEAD:scripts/lib/install/converters/codex.cjs', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch (_e) {
    // Regression guard only — if HEAD has no entry (initial-commit scenario),
    // skip rather than fail.
    t.skip('git show HEAD: unavailable (initial-commit scenario)');
    return;
  }
  // Normalize line endings before comparison: on Windows, git checkout
  // converts LF→CRLF on disk via core.autocrlf, but `git show HEAD:` emits
  // raw blob bytes (LF). The D-05 invariant is semantic ("no content
  // change") not byte-level — line-ending normalization is OS-level, not
  // content drift. Strip \r from both sides to compare semantic content.
  const normalize = (s) => s.replace(/\r\n/g, '\n');
  assert.equal(
    normalize(current),
    normalize(head),
    'D-05 violation: scripts/lib/install/converters/codex.cjs must be byte-identical to HEAD (Phase 28.7 file-drop converter untouched per CONTEXT D-05 additive)'
  );
});

test('codex-plugin: existing codex runtime entry remains multi-artifact kind (D-05)', () => {
  const codex = runtimes.getRuntime('codex');
  assert.equal(
    codex.kind,
    'multi-artifact',
    'D-05 violation: Phase 28.7 codex runtime kind must remain multi-artifact (file-drop)'
  );
});

// ── CURATED_KEYWORDS sanity ────────────────────────────────────────────

test('codex-plugin: CURATED_KEYWORDS is frozen and has ≤10 entries', () => {
  assert.ok(Array.isArray(CURATED_KEYWORDS), 'CURATED_KEYWORDS must be array');
  assert.ok(CURATED_KEYWORDS.length <= 10, `expected ≤10, got ${CURATED_KEYWORDS.length}`);
  assert.ok(Object.isFrozen(CURATED_KEYWORDS), 'CURATED_KEYWORDS must be frozen');
});
