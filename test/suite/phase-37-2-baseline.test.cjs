'use strict';
// Phase 37.2 — Greenfield DS Bootstrap regression baseline. FINAL sub-phase of the split
// Phase 37 — completing it completes the parent Phase 37 (Wave-2 tools 37.1 + greenfield 37.2).
// Freezes the v1.37.2 artifact: the pure token-scale helper, the rubric (registered), the
// ds-generator agent, the bootstrap-ds skill, and the 6-manifest lockstep. Version-AGNOSTIC.
// Hermetic: file reads + the pure helper only. Every test tagged `37.2-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-37-2');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

const { oklchScale } = require(path.resolve(REPO_ROOT, 'scripts/lib/ds/token-scale.cjs'));

test('37.2-02: greenfield deliverables exist + token-scale is pure + works', () => {
  const v = read('scripts/lib/ds/token-scale.cjs');
  assert.ok(v.includes('module.exports'), 'token-scale.cjs');
  assert.doesNotMatch(v, /\brequire\s*\(/, 'token-scale.cjs is dep-free');
  assert.equal(oklchScale({ l: 0.62, c: 0.19, h: 255 }).length, 9, 'oklchScale → 9 stops');
  assert.ok(read('reference/ds-bootstrap-rubric.md').length > 800, 'ds-bootstrap-rubric.md');
  assert.ok(read('agents/ds-generator.md').length > 800, 'ds-generator.md');
  assert.ok(read('skills/bootstrap-ds/SKILL.md').length > 400, 'bootstrap-ds/SKILL.md');
  assert.ok(JSON.stringify(readJsonRel('reference/registry.json')).includes('ds-bootstrap-rubric'), 'rubric registered');
});

test('37.2-02: root SKILL.md command table references the bootstrap-ds skill', () => {
  assert.match(read('SKILL.md'), /bootstrap-ds/, 'root SKILL.md lists bootstrap-ds');
});

test('37.2-02: 6-manifest version lockstep', () => {
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

test('37.2-02: phase-37-2/manifests-version.txt == live + CHANGELOG [1.37.2]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.37\.2\]/, 'CHANGELOG [1.37.2]');
});
