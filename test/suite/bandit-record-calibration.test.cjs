// test/suite/bandit-record-calibration.test.cjs — Phase 59.5 (H2)
//
// Proves the CAL-01 wiring added to the bandit integration shim:
//   scripts/lib/bandit-router/integration.cjs recordOutcome() now ALSO folds
//   the post-spawn {agent, status} outcome into the per-agent risk calibration
//   table (scripts/lib/risk/calibration.cjs), so calibration learns from the
//   same signal the bandit posterior sees.
//
// Contract under test:
//   - adaptive_mode === 'full' + status='completed' → calibration table for the
//     agent gains a window record marked applied-correct (post_apply_correctness
//     stays 1, override_rate 0).
//   - status='error' → applied-not-correct (post_apply_correctness 0).
//   - The calibration write lands at the module's own
//     DEFAULT_CALIBRATION_PATH ('.design/telemetry/calibration.json'), distinct
//     from the bandit posterior file.
//   - A calibration write failure never throws into the bandit path (best-effort
//     D-04): a broken calibration path is swallowed and recordOutcome returns.
//   - adaptive_mode !== 'full' is a no-op for calibration too (no file written).
//
// Hermetic + parallel-safe: every FS write targets a fresh mkdtempSync tmpdir.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { recordOutcome } = require('../../scripts/lib/bandit-router/integration.cjs');
const calibration = require('../../scripts/lib/risk/calibration.cjs');

const CAL_REL = calibration.DEFAULT_CALIBRATION_PATH; // '.design/telemetry/calibration.json'

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `gdd-h2-calib-${prefix}-`));
}

function loadCalibrationAt(baseDir) {
  return JSON.parse(fs.readFileSync(path.join(baseDir, CAL_REL), 'utf8'));
}

test('H2: recordOutcome (full, completed) writes the per-agent calibration table', () => {
  const baseDir = tmp('completed');
  try {
    recordOutcome({
      agent: 'design-fixer',
      bin: 'small',
      tier: 'sonnet',
      status: 'completed',
      costUsd: 0.02,
      adaptiveMode: 'full',
      baseDir,
    });

    const store = loadCalibrationAt(baseDir);
    assert.ok(store.agents, 'calibration store has an agents map');
    const entry = store.agents['design-fixer'];
    assert.ok(entry, 'calibration entry exists for the agent recordOutcome saw');
    assert.equal(entry.window.length, 1, 'one outcome folded into the rolling window');
    // status=completed → accepted, applied, correct.
    assert.equal(entry.window[0].accepted, true);
    assert.equal(entry.window[0].user_undo, false);
    assert.equal(entry.window[0].post_apply_correct, true);
    assert.equal(entry.override_rate, 0, 'an accepted, not-undone outcome is not an override');
    assert.equal(entry.post_apply_correctness, 1, 'completed outcome reads as applied-correct');
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test('H2: recordOutcome (full, error) records applied-not-correct in calibration', () => {
  const baseDir = tmp('error');
  try {
    recordOutcome({
      agent: 'design-fixer',
      bin: 'small',
      tier: 'sonnet',
      status: 'error',
      costUsd: 0,
      adaptiveMode: 'full',
      baseDir,
    });

    const entry = loadCalibrationAt(baseDir).agents['design-fixer'];
    assert.ok(entry, 'calibration entry exists');
    assert.equal(entry.window[0].post_apply_correct, false, 'non-completed status is not correct');
    assert.equal(entry.post_apply_correctness, 0, 'error outcome reads as applied-not-correct');
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test('H2: calibration write lands at DEFAULT_CALIBRATION_PATH, separate from the posterior', () => {
  const baseDir = tmp('paths');
  try {
    recordOutcome({
      agent: 'a',
      bin: 'small',
      tier: 'sonnet',
      status: 'completed',
      costUsd: 0,
      adaptiveMode: 'full',
      baseDir,
    });

    const calFile = path.join(baseDir, CAL_REL);
    const posteriorFile = path.join(baseDir, '.design/telemetry/posterior.json');
    assert.ok(fs.existsSync(calFile), 'calibration.json written under .design/telemetry');
    assert.ok(fs.existsSync(posteriorFile), 'bandit posterior.json also written');
    assert.notEqual(calFile, posteriorFile, 'calibration and posterior are distinct files');
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test('H2: repeated recordOutcome accumulates the rolling calibration window', () => {
  const baseDir = tmp('accumulate');
  try {
    for (let i = 0; i < 3; i += 1) {
      recordOutcome({
        agent: 'acc',
        bin: 'small',
        tier: 'sonnet',
        status: 'completed',
        costUsd: 0,
        adaptiveMode: 'full',
        baseDir,
      });
    }
    const entry = loadCalibrationAt(baseDir).agents['acc'];
    assert.equal(entry.window.length, 3, 'three outcomes accumulated in the window');
    assert.equal(entry.post_apply_correctness, 1);
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test('H2: calibration write failure never throws into the bandit path (best-effort)', () => {
  const baseDir = tmp('broken-cal');
  try {
    // Make the calibration FILE path a directory so the atomic write fails.
    const calFile = path.join(baseDir, CAL_REL);
    fs.mkdirSync(calFile, { recursive: true });

    let thrown = null;
    let ret;
    try {
      ret = recordOutcome({
        agent: 'rec-broken-cal',
        bin: 'small',
        tier: 'sonnet',
        status: 'completed',
        costUsd: 0,
        adaptiveMode: 'full',
        baseDir,
      });
    } catch (err) {
      thrown = err;
    }
    assert.equal(thrown, null, 'recordOutcome must not throw on a calibration write error');
    assert.equal(ret, undefined, 'recordOutcome still returns undefined');
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test('H2: adaptive_mode !== full is a no-op for calibration too', () => {
  for (const mode of ['static', 'hedge']) {
    const baseDir = tmp(`noop-${mode}`);
    try {
      recordOutcome({
        agent: 'a',
        bin: 'small',
        tier: 'sonnet',
        status: 'completed',
        costUsd: 0,
        adaptiveMode: mode,
        baseDir,
      });
      assert.ok(
        !fs.existsSync(path.join(baseDir, CAL_REL)),
        `no calibration file written in ${mode} mode`,
      );
    } finally {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  }
});
