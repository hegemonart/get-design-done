'use strict';
// Phase 36.1 — Domain Packs (Knowledge Tier-3) regression baseline. First sub-phase of
// the split Phase 36. Freezes the v1.36.1 artifact: the four reference/domains packs +
// their registration + the design-context-builder Step 0F detection wiring + the design-
// auditor addendum + the 6-manifest lockstep. Version-AGNOSTIC. Hermetic: file reads only.
// Every test tagged `36.1-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-36-1');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

test('36.1-03: four domain packs exist + registered', () => {
  const reg = JSON.stringify(readJsonRel('reference/registry.json'));
  for (const d of ['finance', 'healthcare', 'gaming', 'civic']) {
    assert.ok(read(`reference/domains/${d}-patterns.md`).length > 1500, `${d}-patterns.md`);
    assert.ok(reg.includes(`reference/domains/${d}-patterns.md`), `${d} registered`);
  }
});

test('36.1-03: domain detection + auditor addendum are wired', () => {
  assert.match(read('agents/design-context-builder.md'), /Step 0F.*Domain Detection/i, 'context-builder Step 0F');
  assert.match(read('agents/design-auditor.md'), /Domain checklist addendum/i, 'auditor addendum');
});

test('36.1-03: 6-manifest version lockstep', () => {
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

test('36.1-03: phase-36-1/manifests-version.txt == live + CHANGELOG [1.36.1]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.36\.1\]/, 'CHANGELOG [1.36.1]');
});
