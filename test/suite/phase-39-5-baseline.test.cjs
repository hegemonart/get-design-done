'use strict';
// Phase 39.5 — GDD Self-Migration Tooling regression baseline. Freezes the v1.39.5 artifact: the
// machine-readable DEPRECATIONS registry, the pure deprecation-registry + changelog-linter cores,
// the /hone:migrate skill, and the 6-manifest lockstep. Version-AGNOSTIC. Every test `39.5-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-39-5');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

const { parseDeprecations, classify } = require(path.resolve(REPO_ROOT, 'scripts/lib/deprecation-registry.cjs'));
const { lintChangelog } = require(path.resolve(REPO_ROOT, 'scripts/lint-changelog.cjs'));

test('39.5-03: all deliverables exist', () => {
  for (const f of [
    'reference/DEPRECATIONS.md',
    'scripts/lib/deprecation-registry.cjs',
    'scripts/lint-changelog.cjs',
    'skills/migrate/SKILL.md',
  ]) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `${f} exists`);
  }
});

test('39.5-03: registry parses + classifies + the changelog linter passes the real CHANGELOG', () => {
  const entries = parseDeprecations(read('reference/DEPRECATIONS.md'));
  assert.ok(entries.length >= 10, 'path migrations backfilled');
  assert.equal(classify(entries[0], '1.39.5'), 'removed', '31.5→sdk rows are removed by 1.39.5');
  const lint = lintChangelog(read('CHANGELOG.md'));
  assert.equal(lint.ok, true, `changelog gate must pass: ${JSON.stringify(lint.violations)}`);
  assert.match(read('skills/migrate/SKILL.md'), /^name:\s*hone-migrate/m, 'migrate skill name');
});

test('39.5-03: 6-manifest version lockstep', () => {
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

test('39.5-03: phase-39-5/manifests-version.txt == live + CHANGELOG [1.39.5]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.39\.5\]/, 'CHANGELOG [1.39.5]');
});
