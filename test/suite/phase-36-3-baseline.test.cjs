'use strict';
// Phase 36.3 — Conversational UI regression baseline. FINAL sub-phase of the split Phase 36
// — completing it completes the parent Phase 36 (Knowledge Tier 3 — domain packs 36.1 +
// motion 36.2 + conversational 36.3). Freezes the v1.36.3 artifact: the conversational-ui
// reference (registered) + the design-context-builder conversational project type + the
// 6-manifest lockstep. Version-AGNOSTIC. Hermetic: file reads only. Every test `36.3-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-36-3');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

test('36.3-02: conversational-ui reference exists + registered + wired', () => {
  assert.ok(read('reference/conversational-ui.md').length > 1500, 'reference');
  assert.ok(JSON.stringify(readJsonRel('reference/registry.json')).includes('reference/conversational-ui.md'), 'registered');
  assert.match(read('agents/design-context-builder.md'), /`conversational`/, 'context-builder conversational type');
});

test('36.3-02: 6-manifest version lockstep', () => {
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

test('36.3-02: phase-36-3/manifests-version.txt == live + CHANGELOG [1.36.3]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.36\.3\]/, 'CHANGELOG [1.36.3]');
});
