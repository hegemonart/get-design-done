// tests/perf-analyzer-cost-regression.test.cjs — Plan 27.6-01 coverage.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  loadCosts,
  loadTrajectories,
  DEFAULT_COSTS_PATH,
  DEFAULT_TRAJECTORIES_DIR,
} = require('../scripts/lib/perf-analyzer/index.cjs');
const {
  detectCostRegressions,
  computeCacheHitDelta,
  computeP95Spikes,
} = require('../scripts/lib/perf-analyzer/cost-regression.cjs');

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-perf-${prefix}-`));
}

function writeJsonl(filePath, rows) {
  writeFileSync(filePath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// loadCosts — JSONL tolerance + sinceCycle filtering.

test('27.6-01: loadCosts returns empty result when file is absent', () => {
  const r = loadCosts({ path: '/definitely/does/not/exist.jsonl' });
  assert.deepEqual(r.rows, []);
  assert.equal(r.parsed_count, 0);
  assert.equal(r.skipped_count, 0);
});

test('27.6-01: loadCosts parses a well-formed JSONL file', () => {
  const dir = tmp('load1');
  try {
    const file = join(dir, 'costs.jsonl');
    writeJsonl(file, [
      { agent: 'a', est_cost_usd: 0.1, cycle: 'c1' },
      { agent: 'b', est_cost_usd: 0.2, cycle: 'c1' },
      { agent: 'a', est_cost_usd: 0.15, cycle: 'c2' },
    ]);
    const r = loadCosts({ path: file });
    assert.equal(r.rows.length, 3);
    assert.equal(r.parsed_count, 3);
    assert.equal(r.skipped_count, 0);
    assert.equal(r.rows[0].agent, 'a');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27.6-01: loadCosts tolerates malformed lines (skipped_count incremented)', () => {
  const dir = tmp('load2');
  try {
    const file = join(dir, 'costs.jsonl');
    writeFileSync(
      file,
      [
        '{"agent":"a","est_cost_usd":0.1,"cycle":"c1"}',
        'not-json',
        '{"agent":"b","est_cost_usd":0.2,"cycle":"c1"}',
        '{partial',
      ].join('\n') + '\n',
      'utf8',
    );
    const r = loadCosts({ path: file });
    assert.equal(r.rows.length, 2);
    assert.equal(r.skipped_count, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27.6-01: loadCosts tolerates blank lines without counting them as skipped', () => {
  const dir = tmp('load3');
  try {
    const file = join(dir, 'costs.jsonl');
    writeFileSync(
      file,
      [
        '{"agent":"a","est_cost_usd":0.1,"cycle":"c1"}',
        '',
        '   ',
        '{"agent":"b","est_cost_usd":0.2,"cycle":"c1"}',
        '',
      ].join('\n'),
      'utf8',
    );
    const r = loadCosts({ path: file });
    assert.equal(r.rows.length, 2);
    assert.equal(r.skipped_count, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27.6-01: loadCosts sinceCycle drops earlier cycles', () => {
  const dir = tmp('load4');
  try {
    const file = join(dir, 'costs.jsonl');
    writeJsonl(file, [
      { agent: 'a', est_cost_usd: 0.1, cycle: 'c1' },
      { agent: 'a', est_cost_usd: 0.2, cycle: 'c2' },
      { agent: 'a', est_cost_usd: 0.3, cycle: 'c3' },
    ]);
    const r = loadCosts({ path: file, sinceCycle: 'c2' });
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0].cycle, 'c2');
    assert.equal(r.rows[1].cycle, 'c3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27.6-01: loadCosts honors baseDir for relative paths', () => {
  const dir = tmp('load5');
  try {
    const file = join(dir, 'inner.jsonl');
    writeJsonl(file, [{ agent: 'a', est_cost_usd: 0.05, cycle: 'c1' }]);
    const r = loadCosts({ path: 'inner.jsonl', baseDir: dir });
    assert.equal(r.rows.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// detectCostRegressions — all 9 branches required by the plan.

test('27.6-01: detectCostRegressions returns empty regressions on empty input', () => {
  const r = detectCostRegressions({
    rows: [],
    baseline: {},
    thresholdPct: 25,
    cyclesRequired: 3,
  });
  assert.deepEqual(r.regressions, []);
  assert.equal(r.summary.threshold_pct, 25);
  assert.equal(r.summary.cycles_required, 3);
});

test('27.6-01: detectCostRegressions flags 100% regression with 3 cycles', () => {
  const rows = [
    { agent: 'a', est_cost_usd: 0.1, cycle: 'c1', cache_hit: false },
    { agent: 'a', est_cost_usd: 0.1, cycle: 'c2', cache_hit: false },
    { agent: 'a', est_cost_usd: 0.1, cycle: 'c3', cache_hit: false },
  ];
  const baseline = { a: { p50_usd: 0.05 } };
  const r = detectCostRegressions({ rows, baseline, thresholdPct: 25, cyclesRequired: 3 });
  assert.equal(r.regressions.length, 1);
  assert.equal(r.regressions[0].agent, 'a');
  assert.equal(r.regressions[0].delta_pct, 100);
  assert.equal(r.regressions[0].cycles_observed, 3);
  assert.equal(r.regressions[0].baseline_p50_usd, 0.05);
  assert.equal(r.regressions[0].current_p50_usd, 0.1);
});

test('27.6-01: detectCostRegressions threshold boundary — 25% exactly is a regression (>=, D-01)', () => {
  const rows = [
    { agent: 'a', est_cost_usd: 0.0625, cycle: 'c1' },
    { agent: 'a', est_cost_usd: 0.0625, cycle: 'c2' },
    { agent: 'a', est_cost_usd: 0.0625, cycle: 'c3' },
  ];
  const baseline = { a: { p50_usd: 0.05 } };
  const r = detectCostRegressions({ rows, baseline, thresholdPct: 25, cyclesRequired: 3 });
  assert.equal(r.regressions.length, 1);
  assert.ok(Math.abs(r.regressions[0].delta_pct - 25) < 1e-9);
});

test('27.6-01: detectCostRegressions threshold boundary — 24% is NOT a regression', () => {
  const rows = [
    { agent: 'a', est_cost_usd: 0.062, cycle: 'c1' },
    { agent: 'a', est_cost_usd: 0.062, cycle: 'c2' },
    { agent: 'a', est_cost_usd: 0.062, cycle: 'c3' },
  ];
  const baseline = { a: { p50_usd: 0.05 } };
  const r = detectCostRegressions({ rows, baseline, thresholdPct: 25, cyclesRequired: 3 });
  assert.equal(r.regressions.length, 0);
});

test('27.6-01: detectCostRegressions skips agents with fewer than 3 distinct cycles', () => {
  const rows = [
    { agent: 'b', est_cost_usd: 1.0, cycle: 'c1' },
    { agent: 'b', est_cost_usd: 1.0, cycle: 'c2' }, // only 2 distinct cycles
  ];
  const baseline = { b: { p50_usd: 0.01 } }; // 100x baseline — should still skip
  const r = detectCostRegressions({ rows, baseline, thresholdPct: 25, cyclesRequired: 3 });
  assert.equal(r.regressions.length, 0);
  assert.equal(r.summary.agents_skipped_insufficient_data, 1);
});

test('27.6-01: detectCostRegressions top-3 cap — 5 regressing agents return only 3', () => {
  const rows = [];
  const baseline = {};
  for (const a of ['a', 'b', 'c', 'd', 'e']) {
    for (const c of ['c1', 'c2', 'c3']) {
      rows.push({ agent: a, est_cost_usd: 0.15, cycle: c });
    }
    baseline[a] = { p50_usd: 0.1 }; // 50% regression each
  }
  const r = detectCostRegressions({ rows, baseline, thresholdPct: 25, cyclesRequired: 3 });
  assert.equal(r.regressions.length, 3);
  // Sorted by delta_pct desc — all ~50% (float-imprecision tolerated), length must cap at 3.
  for (const reg of r.regressions) {
    assert.ok(Math.abs(reg.delta_pct - 50) < 1e-9, `delta_pct ${reg.delta_pct} not ~50`);
  }
  assert.equal(r.summary.regressions_count, 3);
  assert.equal(r.summary.agents_evaluated, 5);
});

test('27.6-01: detectCostRegressions baseline=0 with positive current is Infinity (regression flagged)', () => {
  const rows = [
    { agent: 'c', est_cost_usd: 0.01, cycle: 'c1' },
    { agent: 'c', est_cost_usd: 0.01, cycle: 'c2' },
    { agent: 'c', est_cost_usd: 0.01, cycle: 'c3' },
  ];
  const baseline = { c: { p50_usd: 0 } };
  const r = detectCostRegressions({ rows, baseline, thresholdPct: 25, cyclesRequired: 3 });
  assert.equal(r.regressions.length, 1);
  assert.equal(r.regressions[0].delta_pct, Infinity);
});

test('27.6-01: detectCostRegressions baseline=0 AND current=0 is NOT a regression', () => {
  const rows = [
    { agent: 'd', est_cost_usd: 0, cycle: 'c1' },
    { agent: 'd', est_cost_usd: 0, cycle: 'c2' },
    { agent: 'd', est_cost_usd: 0, cycle: 'c3' },
  ];
  const baseline = { d: { p50_usd: 0 } };
  const r = detectCostRegressions({ rows, baseline, thresholdPct: 25, cyclesRequired: 3 });
  assert.equal(r.regressions.length, 0);
});

test('27.6-01: detectCostRegressions missing baseline entry → agent skipped', () => {
  const rows = [
    { agent: 'e', est_cost_usd: 0.5, cycle: 'c1' },
    { agent: 'e', est_cost_usd: 0.5, cycle: 'c2' },
    { agent: 'e', est_cost_usd: 0.5, cycle: 'c3' },
  ];
  const baseline = {}; // no entry for 'e'
  const r = detectCostRegressions({ rows, baseline, thresholdPct: 25, cyclesRequired: 3 });
  assert.ok(r.summary.agents_skipped_insufficient_data >= 1);
  assert.equal(r.regressions.find((x) => x.agent === 'e'), undefined);
});

test('27.6-01: detectCostRegressions defaults thresholdPct=25 and cyclesRequired=3 (D-01)', () => {
  // No thresholdPct / cyclesRequired passed — exercise the nullish-coalesce defaults.
  const r = detectCostRegressions({ rows: [], baseline: {} });
  assert.equal(r.summary.threshold_pct, 25);
  assert.equal(r.summary.cycles_required, 3);
});

// ---------------------------------------------------------------------------
// computeCacheHitDelta.

test('27.6-01: computeCacheHitDelta computes correct delta with current rate < baseline', () => {
  // Agent 'f': 3 cycles, 2 hits + 1 miss → current_hit_rate ≈ 0.667; baseline 1.0 → delta ≈ -33.33
  const rows = [
    { agent: 'f', est_cost_usd: 0.01, cycle: 'c1', cache_hit: true },
    { agent: 'f', est_cost_usd: 0.01, cycle: 'c2', cache_hit: true },
    { agent: 'f', est_cost_usd: 0.01, cycle: 'c3', cache_hit: false },
  ];
  const baseline = { f: { hit_rate: 1.0 } };
  const r = computeCacheHitDelta({ rows, baseline, cyclesRequired: 3 });
  assert.equal(r.perAgent.length, 1);
  assert.equal(r.perAgent[0].agent, 'f');
  assert.ok(r.perAgent[0].delta_pct < -30 && r.perAgent[0].delta_pct > -34,
    `expected -33ish, got ${r.perAgent[0].delta_pct}`);
});

// ---------------------------------------------------------------------------
// computeP95Spikes.

test('27.6-01: computeP95Spikes flags when multiplier >= 1.5', () => {
  // 20 wall_time_ms values centered around 200 — current_p95 ~= 200.
  const wallTimes = [180, 185, 190, 192, 195, 196, 198, 199, 200, 200, 200, 200, 201, 202, 205, 208, 210, 215, 220, 230];
  const entries = wallTimes.map((wt) => ({ agent: 'g', wall_time_ms: wt }));
  const byCycle = { c1: entries };
  const baseline = { g: { p95_ms: 100 } };
  const r = computeP95Spikes({ byCycle, baseline, multiplierThreshold: 1.5 });
  assert.equal(r.spikes.length, 1);
  assert.equal(r.spikes[0].agent, 'g');
  assert.ok(r.spikes[0].multiplier >= 1.5, `multiplier ${r.spikes[0].multiplier}`);
  assert.ok(r.spikes[0].current_p95_ms >= 200);
});

test('27.6-01: computeP95Spikes does NOT flag when multiplier < 1.5', () => {
  const entries = [{ agent: 'h', wall_time_ms: 130 }];
  const byCycle = { c1: entries };
  const baseline = { h: { p95_ms: 100 } };
  const r = computeP95Spikes({ byCycle, baseline, multiplierThreshold: 1.5 });
  assert.equal(r.spikes.length, 0);
});

test('27.6-01: computeP95Spikes default multiplierThreshold is 1.5', () => {
  // No multiplierThreshold supplied — default kicks in.
  const byCycle = { c1: [{ agent: 'i', wall_time_ms: 250 }] };
  const baseline = { i: { p95_ms: 100 } };
  const r = computeP95Spikes({ byCycle, baseline });
  assert.equal(r.spikes.length, 1);
});

// ---------------------------------------------------------------------------
// loadTrajectories.

test('27.6-01: loadTrajectories returns empty byCycle when dir is absent', () => {
  const r = loadTrajectories({ dir: '/nonexistent/path' });
  assert.deepEqual(r.byCycle, {});
  assert.equal(r.files_read, 0);
});

test('27.6-01: loadTrajectories reads multiple cycle files keyed by basename', () => {
  const dir = tmp('traj1');
  try {
    const trajDir = join(dir, 'traj');
    mkdirSync(trajDir);
    writeJsonl(join(trajDir, 'c1.jsonl'), [
      { agent: 'a', wall_time_ms: 100 },
      { agent: 'b', wall_time_ms: 200 },
    ]);
    writeJsonl(join(trajDir, 'c2.jsonl'), [
      { agent: 'a', wall_time_ms: 150 },
      { agent: 'b', wall_time_ms: 250 },
    ]);
    const r = loadTrajectories({ dir: trajDir });
    assert.equal(r.files_read, 2);
    const keys = Object.keys(r.byCycle).sort();
    assert.deepEqual(keys, ['c1', 'c2']);
    assert.equal(r.byCycle.c1.length, 2);
    assert.equal(r.byCycle.c2.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27.6-01: loadTrajectories ignores non-.jsonl entries in the directory', () => {
  const dir = tmp('traj2');
  try {
    const trajDir = join(dir, 'traj');
    mkdirSync(trajDir);
    writeJsonl(join(trajDir, 'c1.jsonl'), [{ agent: 'a', wall_time_ms: 100 }]);
    writeFileSync(join(trajDir, 'README.md'), 'ignored', 'utf8');
    writeFileSync(join(trajDir, 'c2.txt'), 'ignored', 'utf8');
    const r = loadTrajectories({ dir: trajDir });
    assert.equal(r.files_read, 1);
    assert.deepEqual(Object.keys(r.byCycle), ['c1']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Default path constants — exported and stable.

test('27.6-01: DEFAULT_COSTS_PATH and DEFAULT_TRAJECTORIES_DIR are stable strings', () => {
  assert.equal(DEFAULT_COSTS_PATH, '.design/telemetry/costs.jsonl');
  assert.equal(DEFAULT_TRAJECTORIES_DIR, '.design/telemetry/trajectories');
});
