'use strict';
// Phase 40 — Team Collaboration Mode regression baseline. The first MINOR bump since Phase 39.5's
// lint-changelog gate, so the [1.40.0] CHANGELOG entry MUST carry a "### Breaking changes" section.
// Freezes the v1.40.0 artifact: the 7 collab cores, the contract, the 2 agents + 2 skills, and the
// 6-manifest lockstep. Version-AGNOSTIC. Every test `40-05:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-40');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

const { lintChangelog } = require(path.resolve(REPO_ROOT, 'scripts/lint-changelog.cjs'));

test('40-05: all deliverables exist', () => {
  for (const f of [
    'scripts/lib/collab/attribution.cjs',
    'scripts/lib/collab/section-merge.cjs',
    'scripts/lib/collab/lock-policy.cjs',
    'scripts/lib/collab/review-queue.cjs',
    'scripts/lib/collab/cycle-mode.cjs',
    'scripts/lib/collab/permissions.cjs',
    'scripts/lib/collab/sync-backend.cjs',
    'reference/multi-author-model.md',
    'agents/conflict-resolver.md',
    'agents/decision-journal-exporter.md',
    'skills/review-decisions/SKILL.md',
    'skills/unlock-decision/SKILL.md',
  ]) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `${f} exists`);
  }
});

test('40-05: the 7 cores load + multi-author-model registered', () => {
  for (const f of ['attribution', 'section-merge', 'lock-policy', 'review-queue', 'cycle-mode', 'permissions', 'sync-backend']) {
    assert.equal(typeof require(path.resolve(REPO_ROOT, `scripts/lib/collab/${f}.cjs`)), 'object', `${f} loads`);
  }
  assert.ok(JSON.stringify(readJsonRel('reference/registry.json')).includes('reference/multi-author-model.md'), 'registered');
});

test('40-05: 6-manifest version lockstep', () => {
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

test('40-05: phase-40/manifests-version.txt == live + CHANGELOG [1.40.0] WITH a Breaking-changes section', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  const cl = read('CHANGELOG.md');
  assert.match(cl, /## \[1\.40\.0\]/, 'CHANGELOG [1.40.0]');
  // This is the first minor since the lint-changelog floor (1.39.0) — the gate must pass.
  const lint = lintChangelog(cl);
  assert.equal(lint.ok, true, `lint-changelog must pass for the 1.40.0 minor: ${JSON.stringify(lint.violations)}`);
});
