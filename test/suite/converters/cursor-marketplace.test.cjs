'use strict';

// tests/converters/cursor-marketplace.test.cjs — Phase 28.8 (Plan B1).
//
// Tmpdir-simulation tests for the Cursor Marketplace Tier-2
// distribution-channel converter. No live marketplace network calls — all
// fixtures are seeded in os.tmpdir() and torn down at end of each test
// (CONTEXT D-10).
//
// Coverage (matches Plan B1 § Task 3 <behavior> list):
//   - buildManifest happy-path against real package.json + .claude-plugin
//   - buildManifest field-by-field invariants (name, version, author,
//     repository .git strip, license, keywords default + override, key
//     order, omitted fields)
//   - buildManifest defensive throws (missing description, missing version)
//   - convert() writes manifest at .cursor-plugin/plugin.json under outDir
//   - convert() copies skills/ tree byte-for-byte
//   - convert() returns sorted filesWritten
//   - convert() is idempotent (re-run produces identical output)
//   - convert() does not touch any path outside outDir
//
// D-10 enforcement: no live network access, no marketplace HTTP endpoints,
// no remote URL retrieval. All references operate on tmpdir paths and
// in-process objects.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const c = require('../../../scripts/lib/install/converters/cursor-marketplace.cjs');

// ── Helpers ────────────────────────────────────────────────────────────

function mkTmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-marketplace-test-'));
}

function rmTmpdir(d) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch (_e) {
    // Best-effort cleanup; tests should not fail on teardown.
  }
}

function seedFixtureSkills(root) {
  const a = path.join(root, 'skills', 'gdd-alpha');
  const b = path.join(root, 'skills', 'gdd-beta');
  fs.mkdirSync(a, { recursive: true });
  fs.mkdirSync(b, { recursive: true });
  fs.writeFileSync(
    path.join(a, 'SKILL.md'),
    '---\nname: gdd-alpha\ndescription: alpha\n---\nAlpha body.\n'
  );
  fs.writeFileSync(
    path.join(b, 'SKILL.md'),
    '---\nname: gdd-beta\ndescription: beta\n---\nBeta body.\n'
  );
  return path.join(root, 'skills');
}

// Real sources used by happy-path tests.
const REAL_PKG = require('../../../package.json');
const REAL_CLAUDE_PLUGIN = require('../../../.claude-plugin/plugin.json');

function realSources() {
  return { packageJson: REAL_PKG, claudePluginJson: REAL_CLAUDE_PLUGIN };
}

// ── buildManifest tests ────────────────────────────────────────────────

test('cursor-marketplace: buildManifest returns name "get-design-done" from real sources', () => {
  const m = c.buildManifest(realSources());
  assert.equal(m.name, 'get-design-done');
});

test('cursor-marketplace: buildManifest version equals packageJson.version verbatim', () => {
  const m = c.buildManifest(realSources());
  assert.equal(m.version, REAL_PKG.version);
  assert.match(m.version, /^\d+\.\d+\.\d+/);
});

test('cursor-marketplace: buildManifest author is object {name: hegemonart} with no email', () => {
  const m = c.buildManifest(realSources());
  assert.equal(typeof m.author, 'object');
  assert.equal(m.author.name, 'hegemonart');
  assert.equal(m.author.email, undefined, 'GDD source has no maintainer email');
});

test('cursor-marketplace: buildManifest strips trailing .git from repository URL', () => {
  // Real package.json: repository.url = "https://github.com/hegemonart/get-design-done.git"
  const m = c.buildManifest(realSources());
  assert.equal(m.repository, 'https://github.com/hegemonart/get-design-done');
  assert.equal(m.repository.endsWith('.git'), false);
});

test('cursor-marketplace: buildManifest license is "MIT" verbatim', () => {
  const m = c.buildManifest(realSources());
  assert.equal(m.license, 'MIT');
});

test('cursor-marketplace: buildManifest keywords default is the 8-tag CURATED_KEYWORDS', () => {
  const m = c.buildManifest(realSources());
  assert.deepEqual(m.keywords, [
    'design',
    'ui',
    'ux',
    'frontend',
    'design-system',
    'accessibility',
    'figma',
    'skill',
  ]);
  assert.equal(m.keywords.length, 8);
});

test('cursor-marketplace: buildManifest accepts opts.keywords override', () => {
  const override = ['design', 'foo', 'bar', 'baz', 'qux'];
  const m = c.buildManifest(realSources(), { keywords: override });
  assert.deepEqual(m.keywords, override);
});

test('cursor-marketplace: buildManifest returned keys in documented order', () => {
  const m = c.buildManifest(realSources());
  const expectedOrder = [
    'name',
    'description',
    'version',
    'author',
    'homepage',
    'repository',
    'license',
    'keywords',
  ];
  assert.deepEqual(Object.keys(m), expectedOrder);
});

test('cursor-marketplace: buildManifest throws if packageJson.description is missing', () => {
  assert.throws(
    () =>
      c.buildManifest({
        packageJson: { name: 'x', version: '1.0.0', author: 'foo' },
        claudePluginJson: { name: 'x', author: { name: 'foo' } },
      }),
    /description is required/
  );
});

test('cursor-marketplace: buildManifest throws if packageJson.version is missing or non-semver', () => {
  const baseSources = {
    packageJson: { name: 'x', description: 'd', author: 'foo' },
    claudePluginJson: { name: 'x', author: { name: 'foo' } },
  };
  // Missing entirely.
  assert.throws(
    () => c.buildManifest(baseSources),
    /version is required/
  );
  // Non-semver-shaped.
  assert.throws(
    () =>
      c.buildManifest({
        ...baseSources,
        packageJson: { ...baseSources.packageJson, version: 'not-a-version' },
      }),
    /semver-shaped/
  );
});

test('cursor-marketplace: buildManifest OMITS logo/rules/agents/skills/commands/hooks/mcpServers', () => {
  const m = c.buildManifest(realSources());
  const omitted = ['logo', 'rules', 'agents', 'skills', 'commands', 'hooks', 'mcpServers'];
  for (const k of omitted) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(m, k),
      false,
      `manifest must NOT have key: ${k}`
    );
  }
});

// ── convert() tests ────────────────────────────────────────────────────

test('cursor-marketplace: convert writes manifest at .cursor-plugin/plugin.json under outDir', () => {
  const tmp = mkTmpdir();
  try {
    const skills = seedFixtureSkills(tmp);
    const out = path.join(tmp, 'out');
    const m = c.buildManifest(realSources());
    const result = c.convert({ skillsDir: skills, outDir: out, manifest: m });
    const manifestPath = path.join(out, '.cursor-plugin', 'plugin.json');
    assert.equal(fs.existsSync(manifestPath), true, 'manifest file exists');
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.deepEqual(parsed, m, 'manifest JSON parsed-equal to input');
    assert.ok(
      result.filesWritten.includes('.cursor-plugin/plugin.json'),
      'filesWritten includes manifest path'
    );
  } finally {
    rmTmpdir(tmp);
  }
});

test('cursor-marketplace: convert copies skills/ tree byte-for-byte', () => {
  const tmp = mkTmpdir();
  try {
    const skills = seedFixtureSkills(tmp);
    const out = path.join(tmp, 'out');
    const m = c.buildManifest(realSources());
    c.convert({ skillsDir: skills, outDir: out, manifest: m });

    // Compare source vs dest byte-for-byte.
    const srcAlpha = fs.readFileSync(path.join(skills, 'gdd-alpha', 'SKILL.md'));
    const dstAlpha = fs.readFileSync(
      path.join(out, 'skills', 'gdd-alpha', 'SKILL.md')
    );
    assert.equal(srcAlpha.equals(dstAlpha), true, 'gdd-alpha SKILL.md byte-identical');

    const srcBeta = fs.readFileSync(path.join(skills, 'gdd-beta', 'SKILL.md'));
    const dstBeta = fs.readFileSync(
      path.join(out, 'skills', 'gdd-beta', 'SKILL.md')
    );
    assert.equal(srcBeta.equals(dstBeta), true, 'gdd-beta SKILL.md byte-identical');
  } finally {
    rmTmpdir(tmp);
  }
});

test('cursor-marketplace: convert strips Claude-only `model:` from copied SKILL.md', () => {
  // Regression: the Tier-2 bundle copied skills/ verbatim, so `model: inherit`
  // leaked into the marketplace bundle and would crash non-Claude consumers
  // (Kilo: `Model not found: inherit/.`). The copy now sanitizes SKILL.md.
  const tmp = mkTmpdir();
  try {
    const skills = path.join(tmp, 'skills');
    const dir = path.join(skills, 'gdd-gate');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      '---\nname: gdd-gate\ndescription: gate\nmodel: inherit\ndefault-tier: haiku\n---\nGate body.\n'
    );
    const out = path.join(tmp, 'out');
    const m = c.buildManifest(realSources());
    c.convert({ skillsDir: skills, outDir: out, manifest: m });

    const copied = fs.readFileSync(
      path.join(out, 'skills', 'gdd-gate', 'SKILL.md'),
      'utf8'
    );
    assert.equal(/^\s*model\s*:/m.test(copied), false, 'model: stripped from bundle SKILL.md');
    assert.equal(copied.includes('inherit'), false, 'inherit gone');
    assert.ok(/^\s*default-tier\s*:\s*haiku\s*$/m.test(copied), 'default-tier preserved');
    assert.ok(copied.includes('name: gdd-gate'), 'name preserved');
    assert.ok(copied.includes('Gate body.'), 'body preserved');

    // Source SKILL.md must remain untouched.
    const srcContent = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
    assert.ok(/^\s*model\s*:\s*inherit\s*$/m.test(srcContent), 'source SKILL.md untouched');
  } finally {
    rmTmpdir(tmp);
  }
});

test('cursor-marketplace: convert returns filesWritten as a sorted array of relative paths', () => {
  const tmp = mkTmpdir();
  try {
    const skills = seedFixtureSkills(tmp);
    const out = path.join(tmp, 'out');
    const m = c.buildManifest(realSources());
    const result = c.convert({ skillsDir: skills, outDir: out, manifest: m });
    assert.ok(Array.isArray(result.filesWritten), 'filesWritten is an array');
    const sorted = [...result.filesWritten].sort();
    assert.deepEqual(
      result.filesWritten,
      sorted,
      'filesWritten is pre-sorted'
    );
    // All entries should be relative paths (not absolute, no ".." escape).
    for (const p of result.filesWritten) {
      assert.equal(path.isAbsolute(p), false, `${p} should be relative`);
      assert.equal(p.startsWith('..'), false, `${p} should not escape outDir`);
    }
  } finally {
    rmTmpdir(tmp);
  }
});

test('cursor-marketplace: convert is idempotent', () => {
  const tmp = mkTmpdir();
  try {
    const skills = seedFixtureSkills(tmp);
    const out = path.join(tmp, 'out');
    const m = c.buildManifest(realSources());
    c.convert({ skillsDir: skills, outDir: out, manifest: m });
    const sig1 = fs.readFileSync(
      path.join(out, '.cursor-plugin', 'plugin.json'),
      'utf8'
    );
    const alpha1 = fs.readFileSync(
      path.join(out, 'skills', 'gdd-alpha', 'SKILL.md'),
      'utf8'
    );
    // Re-run.
    c.convert({ skillsDir: skills, outDir: out, manifest: m });
    const sig2 = fs.readFileSync(
      path.join(out, '.cursor-plugin', 'plugin.json'),
      'utf8'
    );
    const alpha2 = fs.readFileSync(
      path.join(out, 'skills', 'gdd-alpha', 'SKILL.md'),
      'utf8'
    );
    assert.equal(sig1, sig2, 'manifest stable on re-run');
    assert.equal(alpha1, alpha2, 'skill content stable on re-run');
  } finally {
    rmTmpdir(tmp);
  }
});

test('cursor-marketplace: convert does not touch any path outside outDir', () => {
  const tmp = mkTmpdir();
  try {
    const skills = seedFixtureSkills(tmp);
    const out = path.join(tmp, 'out');

    // Snapshot the source tree before convert().
    function listTree(root) {
      const out = [];
      function walk(dir) {
        // Use withFileTypes so dir/file classification comes from the single
        // readdir syscall (the dirent), not a follow-up statSync — and read
        // file content directly, treating ENOENT as the "not a regular file"
        // case. This collapses the statSync→readFileSync TOCTOU race.
        const entries = fs.readdirSync(dir, { withFileTypes: true })
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const e of entries) {
          const p = path.join(dir, e.name);
          const isDir = e.isDirectory();
          let content = null;
          if (e.isFile()) {
            try {
              content = fs.readFileSync(p, 'utf8');
            } catch (err) {
              if (err.code !== 'ENOENT') throw err;
            }
          }
          out.push({
            rel: path.relative(root, p),
            isDir,
            // Include content hash for files so even an edit-in-place would
            // be caught.
            content,
          });
          if (isDir) walk(p);
        }
      }
      walk(root);
      return out;
    }

    const before = listTree(skills);
    const m = c.buildManifest(realSources());
    c.convert({ skillsDir: skills, outDir: out, manifest: m });
    const after = listTree(skills);
    assert.deepEqual(after, before, 'skillsDir untouched by convert()');
  } finally {
    rmTmpdir(tmp);
  }
});
