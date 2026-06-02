// test/suite/phase-47-bandit.test.cjs — Phase 47 (Live Mode) → Phase 38 design-arms bridge.
// Exercises scripts/lib/live/bandit-feed.cjs: recordAccepted folds an accepted variant into the
// design-arms store as a discounted WON observation (DEV_TIME_WEIGHT=0.5), persists to
// .design/telemetry/design-arms.json under a temp projectRoot, accumulates across accepts, and
// records source='dev_time'. pull() confirms the posterior.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, existsSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { recordAccepted, DEV_TIME_WEIGHT } = require('../../scripts/lib/live/bandit-feed.cjs');
const {
  variantKey,
  pull,
  DESIGN_ARM_PRIOR,
} = require('../../scripts/lib/ds-arms/design-arms-store.cjs');

function mkTmpProject() {
  return mkdtempSync(join(tmpdir(), 'live-bandit-test-'));
}

function rmTmpProject(dir) {
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// (a) The dev-time weight constant is the 0.5 discount.

test('47-bandit: DEV_TIME_WEIGHT is the 0.5 dev-time discount', () => {
  assert.equal(DEV_TIME_WEIGHT, 0.5);
});

// ---------------------------------------------------------------------------
// (b) recordAccepted writes the arms file and bumps alpha by the dev-time weight.

test('47-bandit: recordAccepted persists arms file and bumps alpha by the weight', () => {
  const dir = mkTmpProject();
  try {
    const ret = recordAccepted({
      projectRoot: dir,
      componentType: 'button',
      pattern: 'primary-CTA-bold',
      label: 'Primary CTA (bold)',
    });

    // Arms file written under the temp projectRoot (not the repo).
    const armsPath = join(dir, '.design', 'telemetry', 'design-arms.json');
    assert.equal(existsSync(armsPath), true, 'design-arms.json created under projectRoot');

    // alpha = prior alpha (2) + dev-time weight (0.5) = 2.5; beta unchanged.
    assert.equal(ret.alpha, DESIGN_ARM_PRIOR.alpha + DEV_TIME_WEIGHT, 'alpha bumped by 0.5');
    assert.equal(ret.beta, DESIGN_ARM_PRIOR.beta, 'beta unchanged on a win');
    assert.equal(ret.last_source, 'dev_time', 'source recorded as dev_time');
    assert.equal(ret.count, 1, 'one observation recorded');

    // pull() confirms the same posterior round-tripped from disk.
    const hash = variantKey('button', 'primary-CTA-bold');
    const arm = pull('button', hash, { baseDir: dir });
    assert.equal(arm.seen, true, 'arm is now seen');
    assert.equal(arm.alpha, 2.5);
    assert.equal(arm.last_source, 'dev_time');
    assert.equal(arm.mean, 2.5 / (2.5 + DESIGN_ARM_PRIOR.beta), 'posterior mean reflects the win');

    // The persisted JSON on disk carries the same arm.
    const onDisk = JSON.parse(readFileSync(armsPath, 'utf8'));
    assert.ok(Array.isArray(onDisk.arms) && onDisk.arms.length === 1, 'one arm persisted');
    assert.equal(onDisk.arms[0].alpha, 2.5);
    assert.equal(onDisk.arms[0].last_source, 'dev_time');
  } finally {
    rmTmpProject(dir);
  }
});

// ---------------------------------------------------------------------------
// (c) Two accepts of the same variant accumulate on the same arm.

test('47-bandit: two accepts accumulate on the same arm', () => {
  const dir = mkTmpProject();
  try {
    recordAccepted({ projectRoot: dir, componentType: 'card', pattern: 'elevated-shadow' });
    const second = recordAccepted({
      projectRoot: dir,
      componentType: 'card',
      pattern: 'elevated-shadow',
    });

    // alpha = prior (2) + 0.5 + 0.5 = 3.0 after two accepts.
    assert.equal(second.alpha, DESIGN_ARM_PRIOR.alpha + 2 * DEV_TIME_WEIGHT, 'alpha accumulates to 3.0');
    assert.equal(second.count, 2, 'two observations on the same arm');

    const hash = variantKey('card', 'elevated-shadow');
    const arm = pull('card', hash, { baseDir: dir });
    assert.equal(arm.alpha, 3.0);
    assert.equal(arm.count, 2);

    // Still a single arm in the store (same key, not duplicated).
    const onDisk = JSON.parse(
      readFileSync(join(dir, '.design', 'telemetry', 'design-arms.json'), 'utf8'),
    );
    assert.equal(onDisk.arms.length, 1, 'accumulated on one arm, not duplicated');
  } finally {
    rmTmpProject(dir);
  }
});

// ---------------------------------------------------------------------------
// (d) Distinct (componentType, pattern) pairs create distinct arms.

test('47-bandit: distinct patterns create distinct arms', () => {
  const dir = mkTmpProject();
  try {
    recordAccepted({ projectRoot: dir, componentType: 'button', pattern: 'ghost' });
    recordAccepted({ projectRoot: dir, componentType: 'button', pattern: 'solid' });
    const onDisk = JSON.parse(
      readFileSync(join(dir, '.design', 'telemetry', 'design-arms.json'), 'utf8'),
    );
    assert.equal(onDisk.arms.length, 2, 'two distinct arms');
  } finally {
    rmTmpProject(dir);
  }
});

// ---------------------------------------------------------------------------
// (e) Input validation: componentType + pattern are required.

test('47-bandit: recordAccepted validates required inputs', () => {
  const dir = mkTmpProject();
  try {
    assert.throws(() => recordAccepted({ projectRoot: dir, pattern: 'x' }), /componentType is required/i);
    assert.throws(
      () => recordAccepted({ projectRoot: dir, componentType: 'button' }),
      /pattern is required/i,
    );
  } finally {
    rmTmpProject(dir);
  }
});
