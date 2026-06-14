// tests/phase-23.5-baseline.test.cjs — Phase 23.5 regression baseline
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const REPO_ROOT = join(__dirname, '../..');

test('phase-23.5 baseline: bandit-router shipped + exports the contract', () => {
  const fp = join(REPO_ROOT, 'scripts/lib/bandit-router.cjs');
  assert.ok(existsSync(fp), 'bandit-router.cjs missing');
  const m = require(fp);
  for (const fn of [
    'pull',
    'update',
    'reset',
    'loadPosterior',
    'savePosterior',
    'computeReward',
    'binForGlobCount',
    'decayArm',
    'sampleBeta',
    'priorFor',
  ]) {
    assert.equal(typeof m[fn], 'function', `bandit-router missing ${fn}`);
  }
  assert.equal(m.SCHEMA_VERSION, '1.0.0');
  assert.equal(m.DEFAULT_POSTERIOR_PATH, '.design/telemetry/posterior.json');
});

// hedge-ensemble.cjs was deleted (Batch D D9): the AdaNormalHedge module
// shipped but was never wired into adaptive_mode='hedge' or any production
// path. With zero callers and zero realistic plan to wire it, keeping the
// module + the bandit-router/integration bridge was speculative debt.
//
// adaptive_mode.cjs's isHedgeEnabled() now always returns false; the
// adaptive_mode enum no longer accepts 'hedge'.

test('phase-23.5 baseline: mmr-rerank shipped + exports the contract', () => {
  const fp = join(REPO_ROOT, 'scripts/lib/mmr-rerank.cjs');
  assert.ok(existsSync(fp));
  const m = require(fp);
  for (const fn of ['rerank', 'similarity', 'tokenize', 'ngrams', 'jaccard']) {
    assert.equal(typeof m[fn], 'function', `mmr-rerank missing ${fn}`);
  }
  assert.equal(m.DEFAULT_LAMBDA, 0.7);
  assert.equal(m.DEFAULT_NGRAM, 2);
});

test('phase-23.5 baseline: adaptive-mode shipped + valid mode set', () => {
  const fp = join(REPO_ROOT, 'scripts/lib/adaptive-mode.cjs');
  assert.ok(existsSync(fp));
  const m = require(fp);
  for (const fn of [
    'getMode',
    'setMode',
    'caps',
    'isBanditEnabled',
    'isHedgeEnabled',
    'isMmrEnabled',
    'isReflectorProposalsEnabled',
  ]) {
    assert.equal(typeof m[fn], 'function', `adaptive-mode missing ${fn}`);
  }
  assert.deepEqual(m.VALID_MODES, ['static', 'hedge', 'full']);
  assert.equal(m.DEFAULT_MODE, 'static');
});

test('phase-23.5 baseline: package.json version is ≥1.23.5', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  // Decimal patches: 1.23.5 ships as a 3-segment off-cadence version.
  // Assert minor ≥23 + patch ≥5 when minor === 23.
  // Phase 61 (v2.0.0): major bumped past the 1.x arc. Accept any version ≥1.23.5.
  const m = pkg.version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  assert.ok(m, `unexpected version shape: ${pkg.version}`);
  const [maj, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  assert.ok(
    maj > 1 || minor > 23 || (minor === 23 && patch >= 5),
    `expected ≥1.23.5, got ${pkg.version}`,
  );
});

test('phase-23.5 baseline: CHANGELOG has [1.23.5] section', () => {
  const cl = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(cl, /^## \[1\.23\.5\]/m);
});

test('phase-23.5 baseline: phase-20 resilience baseline lists all four new .cjs', () => {
  const baseline = readFileSync(
    join(REPO_ROOT, 'test/fixtures/baselines/phase-20/resilience-primitives.txt'),
    'utf8',
  );
  for (const f of [
    'bandit-router.cjs',
    'mmr-rerank.cjs',
    'adaptive-mode.cjs',
  ]) {
    assert.match(baseline, new RegExp(`^${f.replace('.', '\\.')}$`, 'm'), `${f} missing from baseline`);
  }
});

test('phase-23.5 baseline: semver-compare OFF_CADENCE_VERSIONS includes 1.23.5', () => {
  const src = readFileSync(join(REPO_ROOT, 'test/suite/semver-compare.test.cjs'), 'utf8');
  assert.match(src, /'1\.23\.5'/);
});
