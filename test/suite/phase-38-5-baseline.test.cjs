'use strict';
// Phase 38.5 — Deployment Coordination Loop regression baseline. Freezes the v1.38.5 artifact:
// the pure rollout-status classifier, the rollout-coordinator agent + /gdd:rollout-status skill,
// the rollout-coordination reference (registered), the verify_outcome event seeds, and the
// 6-manifest lockstep. Version-AGNOSTIC. Hermetic: file reads + the pure classifier. `38.5-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-38-5');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

const R = require(path.resolve(REPO_ROOT, 'scripts/lib/rollout/rollout-status.cjs'));

test('38.5-02: deliverables exist + classifier works + reference registered', () => {
  const v = read('scripts/lib/rollout/rollout-status.cjs');
  assert.ok(v.includes('module.exports'), 'rollout-status.cjs');
  assert.doesNotMatch(v, /\brequire\s*\(/, 'rollout-status.cjs is dep-free');
  assert.equal(R.classifyRollout({ prodEnabled: true, prodPercent: 100 }), 'prod-100%');
  assert.ok(read('agents/rollout-coordinator.md').length > 800, 'rollout-coordinator.md');
  assert.ok(read('skills/rollout-status/SKILL.md').length > 400, 'rollout-status/SKILL.md');
  assert.ok(JSON.stringify(readJsonRel('reference/registry.json')).includes('rollout-coordination'), 'reference registered');
  assert.match(read('reference/schemas/events.schema.json'), /verify_outcome/, 'verify_outcome seed');
});

test('38.5-02: root SKILL.md command table references rollout-status', () => {
  assert.match(read('SKILL.md'), /rollout-status/, 'root SKILL.md lists rollout-status');
});

test('38.5-02: 6-manifest version lockstep', () => {
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

test('38.5-02: phase-38-5/manifests-version.txt == live + CHANGELOG [1.38.5]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.38\.5\]/, 'CHANGELOG [1.38.5]');
});
