'use strict';
// Phase 38 — Outcome-Driven Adaptation regression baseline. Freezes the v1.38.0 artifact: the
// design_arms posterior store, the design-variants schema (registered), the 6 outcome connections
// + 2 ingest agents, and the 6-manifest lockstep. Version-AGNOSTIC. Hermetic: file reads + the
// pure store only. Every test tagged `38-04:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-38');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

const S = require(path.resolve(REPO_ROOT, 'scripts/lib/ds-arms/design-arms-store.cjs'));

test('38-04: design_arms store works + 6 connections + 2 agents exist + design-variants registered', () => {
  const p = S.pull('x', S.variantKey('x', 'y'), { _store: { arms: [] } });
  assert.equal(p.mean, 0.2, 'Beta(2,8) prior mean 0.2');
  for (const c of ['launchdarkly', 'statsig', 'growthbook', 'usertesting', 'maze', 'hotjar']) {
    assert.ok(read(`connections/${c}.md`).length > 700, `${c}.md`);
  }
  assert.ok(read('agents/experiment-result-ingester.md').length > 800, 'experiment-result-ingester');
  assert.ok(read('agents/user-research-synthesizer.md').length > 800, 'user-research-synthesizer');
  assert.ok(JSON.stringify(readJsonRel('reference/registry.json')).includes('design-variants'), 'design-variants registered');
});

test('38-04: connections index advertises 33 (count-agnostic floor)', () => {
  assert.match(read('connections/connections.md'), /probes all \d+ connections/, 'intro probes all N');
  assert.match(read('connections/connections.md'), /\| LaunchDarkly \| Active \|/, 'an outcome row (Phase-38 marker)');
});

test('38-04: 6-manifest version lockstep', () => {
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

test('38-04: phase-38/manifests-version.txt == live + CHANGELOG [1.38.0]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.38\.0\]/, 'CHANGELOG [1.38.0]');
});
