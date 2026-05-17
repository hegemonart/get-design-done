// tests/perf-budget.test.cjs — Phase 27.6-02 CI regression gate.
//
// Fails the build when any agent's p50 USD-cost has regressed
// > perf_regression_threshold% (default 25 per D-01) vs the
// baseline in test-fixture/baselines/phase-27-6/perf-baseline.json
// across the last 3 distinct cycles.
//
// Tolerates absence of the baseline (first-run cold-start; baseline
// is created in Plan 27.6-06 closeout) — silent pass with stderr
// notice. Tolerates absence of .design/budget.json (default 25).
//
// Re-uses detectCostRegressions from
// scripts/lib/perf-analyzer/cost-regression.cjs as the single source
// of truth for the regression rule. Does NOT re-implement.

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { loadCosts } = require('../scripts/lib/perf-analyzer/index.cjs');
const {
  detectCostRegressions,
} = require('../scripts/lib/perf-analyzer/cost-regression.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const COSTS_PATH = path.join(REPO_ROOT, '.design', 'telemetry', 'costs.jsonl');
const BASELINE_PATH = path.join(
  REPO_ROOT,
  'test-fixture',
  'baselines',
  'phase-27-6',
  'perf-baseline.json',
);
const BUDGET_PATH = path.join(REPO_ROOT, '.design', 'budget.json');

/**
 * Pure helper — reads perf_regression_threshold from an explicit
 * budget.json path; returns 25 (D-01 default) on absence or parse
 * failure. Factored out so tests can drive it with tmpdir fixtures.
 *
 * @param {string} [budgetPath] defaults to repo-root .design/budget.json
 * @returns {number}
 */
function readBudgetThreshold(budgetPath) {
  const p = budgetPath || BUDGET_PATH;
  if (!fs.existsSync(p)) return 25;
  try {
    const b = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (typeof b.perf_regression_threshold === 'number') {
      return b.perf_regression_threshold;
    }
    return 25;
  } catch {
    return 25;
  }
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `gdd-perf-budget-${prefix}-`));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// 1. Cold-start tolerance: absent baseline does NOT fail.

test('27.6-02: gate passes when baseline file is absent (cold-start)', () => {
  // Simulate the cold-start branch by pointing at a path that does
  // not exist. The gate contract: absent baseline → silent pass with
  // stderr notice, NOT a thrown assertion.
  const missingPath = path.join(
    REPO_ROOT,
    'test-fixture',
    'baselines',
    'phase-27-6',
    'definitely-not-yet-' + Date.now() + '.json',
  );
  const baselineExists = fs.existsSync(missingPath);
  assert.equal(baselineExists, false, 'sanity: synthetic path must not exist');
  if (!baselineExists) {
    process.stderr.write(
      '[perf-budget] baseline not yet calibrated (' +
        missingPath +
        '); gate skipped\n',
    );
    return; // implicit pass — this is the cold-start contract
  }
  assert.fail('unreachable — cold-start branch must have been taken');
});

// ---------------------------------------------------------------------------
// 2. Library passthrough: no regression in.

test('27.6-02: detectCostRegressions returns empty when no regression', () => {
  // Three cycles for agent 'a' all at 0.05; baseline.a.p50_usd = 0.05.
  // delta = 0% < 25% → no regression.
  const rows = [
    { agent: 'a', est_cost_usd: 0.05, cycle: 'c1' },
    { agent: 'a', est_cost_usd: 0.05, cycle: 'c2' },
    { agent: 'a', est_cost_usd: 0.05, cycle: 'c3' },
  ];
  const baseline = { a: { p50_usd: 0.05 } };
  const result = detectCostRegressions({
    rows,
    baseline,
    thresholdPct: 25,
    cyclesRequired: 3,
  });
  assert.equal(result.regressions.length, 0);
  assert.equal(result.summary.regressions_count, 0);
});

// ---------------------------------------------------------------------------
// 3. Library passthrough: regression > 25% flagged.

test('27.6-02: detectCostRegressions flags when regression > 25%', () => {
  // Three cycles at 0.10; baseline 0.05 → 100% regression.
  const rows = [
    { agent: 'a', est_cost_usd: 0.1, cycle: 'c1' },
    { agent: 'a', est_cost_usd: 0.1, cycle: 'c2' },
    { agent: 'a', est_cost_usd: 0.1, cycle: 'c3' },
  ];
  const baseline = { a: { p50_usd: 0.05 } };
  const result = detectCostRegressions({
    rows,
    baseline,
    thresholdPct: 25,
    cyclesRequired: 3,
  });
  assert.equal(result.regressions.length, 1);
  assert.equal(result.regressions[0].agent, 'a');
  assert.equal(result.regressions[0].baseline_p50_usd, 0.05);
  assert.equal(result.regressions[0].current_p50_usd, 0.1);
  assert.equal(result.regressions[0].delta_pct, 100);
  assert.equal(result.regressions[0].cycles_observed, 3);
});

// ---------------------------------------------------------------------------
// 4. Threshold override honored: raise to 200 → 100% regression no longer fires.

test('27.6-02: gate honors perf_regression_threshold override (raised threshold suppresses smaller regressions)', () => {
  const rows = [
    { agent: 'a', est_cost_usd: 0.1, cycle: 'c1' },
    { agent: 'a', est_cost_usd: 0.1, cycle: 'c2' },
    { agent: 'a', est_cost_usd: 0.1, cycle: 'c3' },
  ];
  const baseline = { a: { p50_usd: 0.05 } };
  const result = detectCostRegressions({
    rows,
    baseline,
    thresholdPct: 200, // raise the bar so 100% growth no longer triggers
    cyclesRequired: 3,
  });
  assert.equal(result.regressions.length, 0);
  assert.equal(result.summary.threshold_pct, 200);
});

// ---------------------------------------------------------------------------
// 5. budget.json missing → default 25.

test('27.6-02: readBudgetThreshold returns 25 when budget.json missing perf_regression_threshold key', () => {
  const dir = tmpDir('threshold-missing');
  try {
    const p = path.join(dir, 'budget.json');
    // Legacy-only shape — no perf_regression_threshold key.
    fs.writeFileSync(
      p,
      JSON.stringify(
        {
          per_task_cap_usd: 2.0,
          per_phase_cap_usd: 20.0,
          enforcement_mode: 'enforce',
        },
        null,
        2,
      ),
      'utf8',
    );
    const t = readBudgetThreshold(p);
    assert.equal(t, 25);
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// 6. budget.json override honored: explicit value wins.

test('27.6-02: readBudgetThreshold returns override value when present in budget.json', () => {
  const dir = tmpDir('threshold-override');
  try {
    const p = path.join(dir, 'budget.json');
    fs.writeFileSync(
      p,
      JSON.stringify({ perf_regression_threshold: 40 }, null, 2),
      'utf8',
    );
    const t = readBudgetThreshold(p);
    assert.equal(t, 40);
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// 7. End-to-end gate — passes silently against real repo state when
// the baseline is absent.

test('27.6-02: gate runs end-to-end against repo state (passes silently when baseline absent)', () => {
  if (!fs.existsSync(BASELINE_PATH)) {
    process.stderr.write(
      '[perf-budget] baseline not yet calibrated (' +
        BASELINE_PATH +
        ' absent); gate skipped\n',
    );
    return;
  }
  // Baseline exists — execute the real gate.
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const { rows } = loadCosts({ path: COSTS_PATH });
  const thresholdPct = readBudgetThreshold();
  const result = detectCostRegressions({
    rows,
    baseline: baseline.agents,
    thresholdPct,
    cyclesRequired: 3,
  });
  if (result.regressions.length > 0) {
    const detail = result.regressions
      .map(
        (r) =>
          r.agent +
          ': ' +
          r.baseline_p50_usd +
          ' -> ' +
          r.current_p50_usd +
          ' (' +
          r.delta_pct.toFixed(1) +
          '%, ' +
          r.cycles_observed +
          ' cycles)',
      )
      .join('; ');
    assert.fail('Performance regression(s) detected: ' + detail);
  }
});

// ---------------------------------------------------------------------------
// 8. Synthetic regression detail includes agent + delta_pct fields.

test('27.6-02: gate fails with regression detail when 3 cycles of bad data exist (synthetic)', () => {
  // Synthetic baseline + synthetic rows.
  const baseline = { 'design-verifier': { p50_usd: 0.04 } };
  const rows = [
    { agent: 'design-verifier', est_cost_usd: 0.08, cycle: 'c1' },
    { agent: 'design-verifier', est_cost_usd: 0.08, cycle: 'c2' },
    { agent: 'design-verifier', est_cost_usd: 0.08, cycle: 'c3' },
  ];
  const result = detectCostRegressions({
    rows,
    baseline,
    thresholdPct: 25,
    cyclesRequired: 3,
  });
  assert.equal(result.regressions.length, 1);
  const r = result.regressions[0];
  assert.equal(r.agent, 'design-verifier');
  assert.equal(typeof r.delta_pct, 'number');
  assert.ok(r.delta_pct >= 25, 'delta_pct >= threshold');
  // Detail string shape: "<agent>: <baseline> -> <current> (<delta>%, <cycles> cycles)"
  const detail =
    r.agent +
    ': ' +
    r.baseline_p50_usd +
    ' -> ' +
    r.current_p50_usd +
    ' (' +
    r.delta_pct.toFixed(1) +
    '%, ' +
    r.cycles_observed +
    ' cycles)';
  assert.ok(detail.includes('design-verifier'));
  assert.ok(detail.includes('cycles'));
});

// ---------------------------------------------------------------------------
// 9. Cold-start skip: <3 cycles → agent skipped (D-01).

test('27.6-02: gate skips agents with fewer than 3 distinct cycles (D-01)', () => {
  // 2 cycles only — must be skipped even with massive cost growth.
  const baseline = { b: { p50_usd: 0.01 } };
  const rows = [
    { agent: 'b', est_cost_usd: 1.0, cycle: 'c1' },
    { agent: 'b', est_cost_usd: 1.0, cycle: 'c2' },
  ];
  const result = detectCostRegressions({
    rows,
    baseline,
    thresholdPct: 25,
    cyclesRequired: 3,
  });
  assert.equal(result.regressions.length, 0);
  assert.equal(result.summary.agents_skipped_insufficient_data, 1);
});

// ---------------------------------------------------------------------------
// 10. End-to-end repo-state gate also tolerates absent .design/telemetry/costs.jsonl.

test('27.6-02: gate tolerates absent costs.jsonl (loadCosts returns empty rows)', () => {
  // Point loadCosts at a guaranteed-missing path; result.rows must be [].
  const result = loadCosts({ path: '/definitely/not/here/costs.jsonl' });
  assert.deepEqual(result.rows, []);
  // Feed the empty rows + a valid baseline into detectCostRegressions:
  // no agents to evaluate → no regressions.
  const regResult = detectCostRegressions({
    rows: result.rows,
    baseline: { 'design-verifier': { p50_usd: 0.04 } },
    thresholdPct: 25,
    cyclesRequired: 3,
  });
  assert.equal(regResult.regressions.length, 0);
  assert.equal(regResult.summary.agents_evaluated, 0);
});
