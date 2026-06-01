'use strict';
// Phase 38.5 — rollout-status classifier unit test. Verifies the pure classifier
// (scripts/lib/rollout/rollout-status.cjs): state classification over fixture flag states,
// deployed percentage, stuck detection (14d default), and the linear deployed-weight feeding
// the design_arms posterior. Deterministic, hermetic (D-07). Every test tagged `38.5-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MOD = path.resolve(__dirname, '../../scripts/lib/rollout/rollout-status.cjs');
const R = require(MOD);

test('38.5-02: classifyRollout — golden transitions over fixture flag states', () => {
  assert.equal(R.classifyRollout({ stagingEnabled: false, prodEnabled: false }), 'unrolled');
  assert.equal(R.classifyRollout({ stagingEnabled: true, prodEnabled: false }), 'staging-only');
  assert.equal(R.classifyRollout({ prodEnabled: true, prodPercent: 0 }), 'staging-only', 'prod-enabled at 0% has no traffic');
  assert.equal(R.classifyRollout({ prodEnabled: true, prodPercent: 10 }), 'canary-10%');
  assert.equal(R.classifyRollout({ prodEnabled: true, prodPercent: 50 }), 'canary-50%');
  assert.equal(R.classifyRollout({ prodEnabled: true, prodPercent: 100 }), 'prod-100%');
  assert.equal(R.classifyRollout({ prodEnabled: true, prodPercent: 150 }), 'prod-100%', 'clamps >100');
});

test('38.5-02: deployedPct — live prod percentage, 0 when not in prod', () => {
  assert.equal(R.deployedPct({ prodEnabled: true, prodPercent: 25 }), 25);
  assert.equal(R.deployedPct({ stagingEnabled: true, prodEnabled: false }), 0);
  assert.equal(R.deployedPct({}), 0);
});

test('38.5-02: isStuck — a partial rollout past the threshold; finished/unstarted never stuck', () => {
  assert.equal(R.isStuck('canary-10%', 14), true, 'canary at the 14d default');
  assert.equal(R.isStuck('canary-10%', 13), false, 'under threshold');
  assert.equal(R.isStuck('staging-only', 20), true, 'staging-only can be stuck');
  assert.equal(R.isStuck('prod-100%', 30), false, 'finished is never stuck');
  assert.equal(R.isStuck('unrolled', 30), false, 'unstarted is never stuck');
  assert.equal(R.isStuck('canary-10%', 5, 3), true, 'honors a custom threshold');
});

test('38.5-02: deployedWeight — linear 0..1 (D-03)', () => {
  assert.equal(R.deployedWeight(0), 0);
  assert.equal(R.deployedWeight(10), 0.1);
  assert.equal(R.deployedWeight(100), 1);
  assert.equal(R.deployedWeight(150), 1, 'clamps >100');
  assert.equal(R.deployedWeight(NaN), 0, 'NaN → 0 (no crash)');
});

test('38.5-02: deterministic + pure (zero require)', () => {
  const f = { prodEnabled: true, prodPercent: 30 };
  assert.equal(R.classifyRollout(f), R.classifyRollout(f));
  assert.doesNotMatch(fs.readFileSync(MOD, 'utf8'), /\brequire\s*\(/, 'rollout-status.cjs must not require anything');
});
