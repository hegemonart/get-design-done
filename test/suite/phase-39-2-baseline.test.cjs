'use strict';
// Phase 39.2 — Long-Horizon Cost Governance regression baseline. Second sub-phase of the split
// Phase 39 (closes the parent). Freezes the v1.39.2 artifact: the 3 pure budget cores, the
// cost-forecaster agent, the /gdd:budget + /gdd:roi skills, the cost-governance contract, the
// project_cap hook branch, and the 6-manifest lockstep. Version-AGNOSTIC. Every test `39.2-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-39-2');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

const { forecast, cyclesToCap } = require(path.resolve(REPO_ROOT, 'scripts/lib/budget/cost-forecast.cjs'));
const { computeRoi } = require(path.resolve(REPO_ROOT, 'scripts/lib/budget/roi.cjs'));
const { classifyProjectBudget, shouldHalt } = require(path.resolve(REPO_ROOT, 'scripts/lib/budget/project-cap.cjs'));

test('39.2-03: all deliverables exist', () => {
  for (const f of [
    'scripts/lib/budget/cost-forecast.cjs',
    'scripts/lib/budget/roi.cjs',
    'scripts/lib/budget/project-cap.cjs',
    'agents/cost-forecaster.md',
    'skills/budget/SKILL.md',
    'skills/roi/SKILL.md',
    'reference/cost-governance.md',
  ]) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `${f} exists`);
  }
});

test('39.2-03: the three pure cores work end-to-end + cost-governance registered', () => {
  // forecast + cyclesToCap (SC#5/#6)
  const f = forecast([10, 12, 8], { scenario: 'typical', nCycles: 5 });
  assert.equal(f.projectedTotal, 50);
  assert.equal(cyclesToCap(40, 100, f.perCycle), 6);
  // roi (SC#8)
  const r = computeRoi([{ cycle: 'c1', costUsd: 20, commitsShipped: 4, commitsReverted: 1 }]);
  assert.equal(r.rows[0].costPerShipped, 5);
  // project-cap hard-halt fire (SC#9)
  assert.equal(shouldHalt(classifyProjectBudget(100, 100), 'enforce'), true);
  assert.equal(classifyProjectBudget(50, 0).enabled, false, 'disabled by default');
  const reg = JSON.stringify(readJsonRel('reference/registry.json'));
  assert.ok(reg.includes('reference/cost-governance.md'), 'cost-governance registered');
});

test('39.2-03: project_cap is opt-in in the hook (non-breaking)', () => {
  const hook = read('hooks/budget-enforcer.ts');
  assert.match(hook, /project_cap_usd:\s*0/, 'default disabled');
  assert.match(hook, /project_cap_usd > 0/, 'guarded branch');
});

test('39.2-03: 6-manifest version lockstep', () => {
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

test('39.2-03: phase-39-2/manifests-version.txt == live + CHANGELOG [1.39.2]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.39\.2\]/, 'CHANGELOG [1.39.2]');
});
