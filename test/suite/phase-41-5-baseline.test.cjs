'use strict';
// Phase 41.5 — SoT Manifest Consolidation regression baseline. Freezes v1.41.5: the manifest root +
// loader + validator + the 6-manifest lockstep. Version-AGNOSTIC. Every test tagged `41.5-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-41-5');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

test('41.5-02: all deliverables exist', () => {
  for (const f of [
    'scripts/lib/manifest/loader.cjs',
    'scripts/lib/manifest/index.cjs',
    'scripts/lib/manifest/harnesses.json',
    'scripts/lib/manifest/harnesses.cjs',
    'scripts/lib/manifest/skills.json',
    'scripts/lib/manifest/prose-denylist.json',
    'scripts/lib/manifest/schemas/harnesses.schema.json',
    'scripts/lib/manifest/schemas/skills.schema.json',
    'scripts/lib/manifest/schemas/prose-denylist.schema.json',
    'scripts/lib/manifest/README.md',
    'scripts/validate-manifest.cjs',
  ]) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `${f} exists`);
  }
  assert.ok(readJsonRel('package.json').scripts['validate:manifest'], 'validate:manifest script');
});

test('41.5-02: validate-manifest passes the seed', () => {
  const { validateAll } = require(path.join(REPO_ROOT, 'scripts/validate-manifest.cjs'));
  assert.deepEqual(validateAll().problems, []);
});

test('41.5-02: 6-manifest version lockstep', () => {
  const pkg = readJsonRel('package.json').version;
  assert.match(pkg, /^\d+\.\d+\.\d+$/, 'semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkg, `${f}`);
  }
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkg, 'marketplace metadata.version');
  assert.equal(mp.plugins[0].version, pkg, 'marketplace plugins[0].version');
  const lock = readJsonRel('package-lock.json');
  assert.equal(lock.version, pkg, 'package-lock root');
  if (lock.packages && lock.packages['']) assert.equal(lock.packages[''].version, pkg, 'package-lock packages.""');
});

test('41.5-02: phase-41-5/manifests-version.txt == live + CHANGELOG [1.41.5]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.41\.5\]/, 'CHANGELOG [1.41.5]');
});
