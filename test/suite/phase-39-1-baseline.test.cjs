'use strict';
// Phase 39.1 — DS Migration Workflows regression baseline. First sub-phase of the split Phase 39.
// Freezes the v1.39.1 artifact: the 4 migration rule libraries (registered), the pure codemod
// generator, the ds-migration-planner agent, and the 6-manifest lockstep. Version-AGNOSTIC.
// Hermetic: file reads + the pure generator. Every test tagged `39.1-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-39-1');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

const { emitCodemod } = require(path.resolve(REPO_ROOT, 'scripts/lib/migration/codemod-gen.cjs'));

test('39.1-03: deliverables exist + codemod-gen works + libraries registered', () => {
  const v = read('scripts/lib/migration/codemod-gen.cjs');
  assert.ok(v.includes('module.exports'), 'codemod-gen.cjs');
  assert.doesNotMatch(v, /\brequire\s*\(/, 'codemod-gen.cjs is dep-free');
  assert.match(emitCodemod({ id: 'T', kind: 'rename-prop', from: 'a', to: 'b' }).template, /JSXAttribute/, 'emits a template');
  assert.ok(read('agents/ds-migration-planner.md').length > 800, 'ds-migration-planner.md');
  const reg = JSON.stringify(readJsonRel('reference/registry.json'));
  for (const m of ['shadcn-v2', 'tailwind-v4', 'mui-v6', 'material-3-to-4']) {
    assert.ok(reg.includes(`reference/migrations/${m}.md`), `${m} registered`);
  }
});

test('39.1-03: 6-manifest version lockstep', () => {
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

test('39.1-03: phase-39-1/manifests-version.txt == live + CHANGELOG [1.39.1]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.39\.1\]/, 'CHANGELOG [1.39.1]');
});
