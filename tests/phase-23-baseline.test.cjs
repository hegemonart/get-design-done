// tests/phase-23-baseline.test.cjs — Phase 23 regression baseline
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const REPO_ROOT = join(__dirname, '..');

test('phase-23 baseline: planner + verifier output contracts shipped', () => {
  for (const f of [
    'reference/output-contracts/planner-decision.schema.json',
    'reference/output-contracts/verifier-decision.schema.json',
  ]) {
    assert.ok(existsSync(join(REPO_ROOT, f)), `${f} missing`);
  }
  const pc = require(join(REPO_ROOT, 'scripts/lib/parse-contract.cjs'));
  assert.equal(typeof pc.parsePlannerDecision, 'function');
  assert.equal(typeof pc.parseVerifierDecision, 'function');
  assert.equal(typeof pc.validatePlannerDecision, 'function');
  assert.equal(typeof pc.validateVerifierDecision, 'function');
});

test('phase-23 baseline: design-solidify gate shipped (.mjs)', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/design-solidify.mjs')));
});

test('phase-23 baseline: touches-analyzer module shipped', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/touches-analyzer/index.cjs')));
  const m = require(join(REPO_ROOT, 'scripts/lib/touches-analyzer/index.cjs'));
  for (const fn of ['parseTouches', 'parseTouchesFile', 'pairwiseVerdict', 'verdictMatrix']) {
    assert.equal(typeof m[fn], 'function', `${fn} missing`);
  }
});

test('phase-23 baseline: audit-aggregator module shipped', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/audit-aggregator/index.cjs')));
  const m = require(join(REPO_ROOT, 'scripts/lib/audit-aggregator/index.cjs'));
  for (const fn of ['aggregate', 'score', 'normalizePath', 'dedupKey', 'defaultMerge']) {
    assert.equal(typeof m[fn], 'function');
  }
});

test('phase-23 baseline: reference-resolver shipped', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/reference-resolver.cjs')));
  const m = require(join(REPO_ROOT, 'scripts/lib/reference-resolver.cjs'));
  for (const fn of ['resolve', 'resolveAll', 'excerptOf']) {
    assert.equal(typeof m[fn], 'function');
  }
});

test('phase-23 baseline: touches-pattern-miner shipped', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/touches-pattern-miner.cjs')));
  const m = require(join(REPO_ROOT, 'scripts/lib/touches-pattern-miner.cjs'));
  for (const fn of ['mine', 'writeProposals', 'canonicalize', 'stripCycleSlugs']) {
    assert.equal(typeof m[fn], 'function');
  }
});

test('phase-23 baseline: visual-baseline shipped', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/visual-baseline/diff.cjs')));
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/visual-baseline/index.cjs')));
  const idx = require(join(REPO_ROOT, 'scripts/lib/visual-baseline/index.cjs'));
  for (const fn of ['compareToBaseline', 'applyBaseline', 'baselinePathFor', 'validateKey']) {
    assert.equal(typeof idx[fn], 'function');
  }
});

test('phase-23 baseline: design-tokens 4 readers shipped', () => {
  for (const f of [
    'scripts/lib/design-tokens/index.cjs',
    'scripts/lib/design-tokens/css-vars.cjs',
    'scripts/lib/design-tokens/js-const.cjs',
    'scripts/lib/design-tokens/tailwind.cjs',
    'scripts/lib/design-tokens/figma.cjs',
  ]) {
    assert.ok(existsSync(join(REPO_ROOT, f)), `${f} missing`);
  }
});

test('phase-23 baseline: domain-primitives bundle shipped', () => {
  for (const f of [
    'scripts/lib/domain-primitives/nng.cjs',
    'scripts/lib/domain-primitives/anti-patterns.cjs',
    'scripts/lib/domain-primitives/wcag.cjs',
  ]) {
    assert.ok(existsSync(join(REPO_ROOT, f)), `${f} missing`);
  }
});

test('phase-23 baseline: pngjs declared as optionalDependency', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.optionalDependencies && pkg.optionalDependencies.pngjs);
});

test('phase-23 baseline: package.json version is ≥1.23.0', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  const m = pkg.version.match(/^1\.(\d+)\./);
  assert.ok(m, `unexpected version shape: ${pkg.version}`);
  assert.ok(Number(m[1]) >= 23, `expected ≥1.23.0, got ${pkg.version}`);
});

test('phase-23 baseline: CHANGELOG has [1.23.0] section', () => {
  const cl = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(cl, /^## \[1\.23\.0\]/m);
});
