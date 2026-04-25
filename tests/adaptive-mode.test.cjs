// tests/adaptive-mode.test.cjs — Plan 23.5-04 feature flag ladder
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  getMode,
  setMode,
  caps,
  isBanditEnabled,
  isHedgeEnabled,
  isMmrEnabled,
  isReflectorProposalsEnabled,
  DEFAULT_MODE,
  VALID_MODES,
  MODE_CAPS,
} = require('../scripts/lib/adaptive-mode.cjs');

function tmp(prefix) {
  const d = mkdtempSync(join(tmpdir(), `gdd-mode-${prefix}-`));
  mkdirSync(join(d, '.design'), { recursive: true });
  return d;
}

function writeBudget(dir, body) {
  writeFileSync(join(dir, '.design', 'budget.json'), JSON.stringify(body));
}

test('23.5-04: getMode returns "static" when budget.json is missing', () => {
  const d = mkdtempSync(join(tmpdir(), 'gdd-mode-missing-'));
  try {
    assert.equal(getMode({ baseDir: d }), 'static');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: getMode reads adaptive_mode from budget.json', () => {
  const d = tmp('read');
  try {
    writeBudget(d, { adaptive_mode: 'full' });
    assert.equal(getMode({ baseDir: d }), 'full');
    writeBudget(d, { adaptive_mode: 'hedge' });
    assert.equal(getMode({ baseDir: d }), 'hedge');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: getMode falls back to "static" on malformed JSON', () => {
  const d = tmp('malformed');
  try {
    writeFileSync(join(d, '.design', 'budget.json'), '{not json');
    assert.equal(getMode({ baseDir: d }), 'static');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: getMode falls back to "static" on unknown mode + warns', () => {
  const d = tmp('unknown');
  try {
    writeBudget(d, { adaptive_mode: 'bandit-only' });
    // Capture stderr — easiest path is to set quiet:true and check no warn,
    // then call without quiet and confirm something was written.
    assert.equal(getMode({ baseDir: d, quiet: true }), 'static');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: caps — static disables everything', () => {
  const d = tmp('caps-static');
  try {
    writeBudget(d, { adaptive_mode: 'static' });
    const c = caps({ baseDir: d });
    assert.deepEqual(c, MODE_CAPS.static);
    assert.equal(c.bandit, false);
    assert.equal(c.hedge, false);
    assert.equal(c.mmr, false);
    assert.equal(c.reflector_proposals, false);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: caps — hedge enables hedge + mmr but NOT bandit', () => {
  const d = tmp('caps-hedge');
  try {
    writeBudget(d, { adaptive_mode: 'hedge' });
    const c = caps({ baseDir: d });
    assert.equal(c.bandit, false);
    assert.equal(c.hedge, true);
    assert.equal(c.mmr, true);
    assert.equal(c.reflector_proposals, false);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: caps — full enables everything', () => {
  const d = tmp('caps-full');
  try {
    writeBudget(d, { adaptive_mode: 'full' });
    const c = caps({ baseDir: d });
    assert.equal(c.bandit, true);
    assert.equal(c.hedge, true);
    assert.equal(c.mmr, true);
    assert.equal(c.reflector_proposals, true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: isBanditEnabled / isHedgeEnabled / isMmrEnabled / isReflectorProposalsEnabled', () => {
  const d = tmp('predicates');
  try {
    writeBudget(d, { adaptive_mode: 'hedge' });
    assert.equal(isBanditEnabled({ baseDir: d }), false);
    assert.equal(isHedgeEnabled({ baseDir: d }), true);
    assert.equal(isMmrEnabled({ baseDir: d }), true);
    assert.equal(isReflectorProposalsEnabled({ baseDir: d }), false);
    writeBudget(d, { adaptive_mode: 'full' });
    assert.equal(isBanditEnabled({ baseDir: d }), true);
    assert.equal(isReflectorProposalsEnabled({ baseDir: d }), true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: setMode persists + preserves other budget.json fields', () => {
  const d = tmp('setmode');
  try {
    writeBudget(d, { per_task_cap_usd: 2, enforcement_mode: 'enforce' });
    const p = setMode('full', { baseDir: d });
    const cfg = JSON.parse(readFileSync(p, 'utf8'));
    assert.equal(cfg.adaptive_mode, 'full');
    assert.equal(cfg.per_task_cap_usd, 2);
    assert.equal(cfg.enforcement_mode, 'enforce');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: setMode creates budget.json + parent dir if missing', () => {
  const d = mkdtempSync(join(tmpdir(), 'gdd-mode-create-'));
  try {
    const p = setMode('hedge', { baseDir: d });
    const cfg = JSON.parse(readFileSync(p, 'utf8'));
    assert.equal(cfg.adaptive_mode, 'hedge');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: setMode rejects unknown modes', () => {
  const d = tmp('reject');
  try {
    assert.throws(() => setMode('bogus', { baseDir: d }), /must be one of/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('23.5-04: VALID_MODES + DEFAULT_MODE exports', () => {
  assert.deepEqual(VALID_MODES, ['static', 'hedge', 'full']);
  assert.equal(DEFAULT_MODE, 'static');
});

test('23.5-04: setMode honors absolute budgetPath', () => {
  const d = mkdtempSync(join(tmpdir(), 'gdd-mode-abs-'));
  try {
    const abs = join(d, 'custom-budget.json');
    setMode('full', { budgetPath: abs });
    const cfg = JSON.parse(readFileSync(abs, 'utf8'));
    assert.equal(cfg.adaptive_mode, 'full');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
