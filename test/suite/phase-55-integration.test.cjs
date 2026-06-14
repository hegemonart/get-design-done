'use strict';
// test/suite/phase-55-integration.test.cjs — Phase 55 (GDD Dashboard, dep-free),
// executor F (INT-01/02). Tag: '55-11:'.
//
// Covers the two integration seams F owns:
//
//   1. health-mirror's 10th check `dashboard_reachable` (scripts/lib/health-mirror)
//      — GRACEFUL-ABSENT: a valid status is always present and getHealthChecks
//        NEVER throws, whether the dashboard bin is present OR absent. We drive
//        both arms with hermetic fixture roots (a fake GDD package root that
//        either plants bin/hone-dashboard or omits it), and additionally assert
//        the bin-present fixture surfaces status 'ok'.
//
//   2. sdk/dashboard/data/risk-surface.cjs `surfaceRisk()`
//      — pre-Phase-56 (no risk fields) -> a blank placeholder row with all-null
//        fields + color 'default'; with risk_score + suggested_action present
//        -> correct color routing (Allow/Review/RequireConfirmation/Block).
//
// Dep-free; hermetic tmpdir fixtures; no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getHealthChecks } = require('../../scripts/lib/health-mirror/index.cjs');
const {
  surfaceRisk,
  surfaceRiskOne,
} = require('../../sdk/dashboard/data/risk-surface.cjs');

// --- helpers ---------------------------------------------------------------

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hone-55-11-int-'));
}

function rmRoot(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Build a minimal complete project surface so the first 9 checks resolve
 * normally.
 *
 * `gddName` controls whether package.json declares the GDD package name. When
 * true, the dashboard probe treats THIS fixture root as the authoritative GDD
 * root (hermetic: it resolves bin/ + sdk/dashboard/data/source.cjs UNDER the
 * fixture, never the real shipped tree). When false, the fixture is an
 * unrelated consumer project and the probe falls back to the shipped root.
 *
 * `plantBin` writes a bin/hone-dashboard trampoline file under the fixture.
 * `plantDataPlane` writes a MINIMAL sdk/dashboard/data/source.cjs stub that
 * exports loadDashboardModel — enough for dashboardDataPlaneLoads to detect a
 * loadable data plane without coupling the test to the real source.cjs.
 */
function writeProject(
  root,
  { gddName = false, plantBin = false, plantDataPlane = false } = {}
) {
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.mkdirSync(path.join(root, '.design'), { recursive: true });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# CLAUDE');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: gddName ? 'hone' : 'some-consumer-project',
      version: '0.0.1',
    })
  );
  if (plantBin) {
    fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'bin', 'hone-dashboard'),
      '#!/usr/bin/env node\n// fixture trampoline\n'
    );
  }
  if (plantDataPlane) {
    const dpDir = path.join(root, 'sdk', 'dashboard', 'data');
    fs.mkdirSync(dpDir, { recursive: true });
    fs.writeFileSync(
      path.join(dpDir, 'source.cjs'),
      "'use strict';\nmodule.exports = { loadDashboardModel: async () => ({}) };\n"
    );
  }
}

/** Pull the dashboard_reachable check out of a getHealthChecks result. */
function dashboardCheck(result) {
  return result.checks.find((c) => c.name === 'dashboard_reachable');
}

// ===========================================================================
// 1. health-mirror — dashboard_reachable (graceful, never throws)
// ===========================================================================

test('55-11: getHealthChecks includes a dashboard_reachable check with a valid status (consumer-project root, bin absent)', async () => {
  // A non-GDD consumer project: the rootDir walk-up finds no GDD marker, so the
  // check falls back to the shipped package root. Whether or not executor D has
  // landed bin/hone-dashboard yet, the check must be present with a valid status
  // and MUST NOT be a hard 'fail'.
  const root = makeRoot();
  try {
    writeProject(root, { gddName: false });
    let result;
    await assert.doesNotReject(async () => {
      result = await getHealthChecks(root);
    }, 'getHealthChecks must never reject');
    const dc = dashboardCheck(result);
    assert.ok(dc, 'dashboard_reachable check must be present');
    assert.ok(
      ['ok', 'warn'].includes(dc.status),
      'dashboard_reachable must be ok|warn (never a hard fail): ' + dc.status
    );
    assert.equal(typeof dc.detail, 'string');
    assert.ok(dc.detail.startsWith('dashboard:'), 'detail prefix: ' + dc.detail);
  } finally {
    rmRoot(root);
  }
});

test('55-11: dashboard_reachable is graceful-absent — bin missing -> warn, never throws (fake GDD root, no bin)', async () => {
  // A fake GDD package root WITHOUT bin/hone-dashboard planted. The rootDir
  // walk-up treats this as the GDD root, finds no bin -> 'warn'. (The shipped
  // root fallback also has no bin until executor D lands it.)
  const root = makeRoot();
  try {
    // Authoritative GDD fixture root WITH a loadable data plane stub but NO bin —
    // isolates "bin missing" as the only failing condition -> deterministic warn.
    writeProject(root, { gddName: true, plantBin: false, plantDataPlane: true });
    let result;
    await assert.doesNotReject(async () => {
      result = await getHealthChecks(root);
    }, 'getHealthChecks must never reject when the dashboard bin is missing');
    const dc = dashboardCheck(result);
    assert.ok(dc, 'dashboard_reachable check must be present');
    assert.equal(dc.status, 'warn', 'bin missing -> warn');
    assert.equal(dc.detail, 'dashboard: bin missing', 'exact bin-missing detail: ' + dc.detail);
  } finally {
    rmRoot(root);
  }
});

test('55-11: dashboard_reachable -> ok when bin/hone-dashboard present AND data plane loads (fake GDD root, bin planted)', async () => {
  // A fake GDD package root WITH bin/hone-dashboard planted: the bin resolves via
  // the rootDir walk-up; the data plane (sdk/dashboard/data/source.cjs) loads via
  // the shipped package root -> status 'ok' + the exact detail string.
  const root = makeRoot();
  try {
    writeProject(root, { gddName: true, plantBin: true, plantDataPlane: true });
    const result = await getHealthChecks(root);
    const dc = dashboardCheck(result);
    assert.ok(dc, 'dashboard_reachable check must be present');
    assert.equal(dc.status, 'ok', 'bin present + data plane ok -> ok');
    assert.equal(dc.detail, 'dashboard: bin/hone-dashboard present; data plane ok');
  } finally {
    rmRoot(root);
  }
});

test('55-11: dashboard_reachable -> warn "data plane unavailable" when bin present but data plane absent (fake GDD root)', async () => {
  // Authoritative GDD fixture root WITH the bin but NO data plane stub -> the
  // data-plane probe fails under the fixture root -> deterministic warn.
  const root = makeRoot();
  try {
    writeProject(root, { gddName: true, plantBin: true, plantDataPlane: false });
    const result = await getHealthChecks(root);
    const dc = dashboardCheck(result);
    assert.ok(dc, 'dashboard_reachable check must be present');
    assert.equal(dc.status, 'warn', 'bin present but data plane absent -> warn');
    assert.equal(dc.detail, 'dashboard: data plane unavailable');
  } finally {
    rmRoot(root);
  }
});

test('55-11: dashboard_reachable is the 10th check and total count is 10 (additive invariant)', async () => {
  const root = makeRoot();
  try {
    writeProject(root, { gddName: false });
    const result = await getHealthChecks(root);
    assert.equal(result.checks.length, 10, 'health surface is exactly 10 checks');
    assert.equal(
      result.checks[result.checks.length - 1].name,
      'dashboard_reachable',
      'dashboard_reachable is appended last (stable order)'
    );
  } finally {
    rmRoot(root);
  }
});

// ===========================================================================
// 2. risk-surface — surfaceRisk() placeholder + color routing
// ===========================================================================

test('55-11: surfaceRisk pre-56 (no risk fields) -> blank placeholder + default color', () => {
  // The pre-Phase-56 reality: events/findings carry NO risk fields.
  const findings = [
    { id: 'f1', message: 'some finding' },
    { id: 'f2', message: 'another' },
  ];
  const rows = surfaceRisk(findings);
  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.risk_score, null);
    assert.equal(row.confidence, null);
    assert.equal(row.suggested_action, null);
    assert.equal(row.color, 'default');
  }
});

test('55-11: surfaceRisk routes color from suggested_action (Allow/Review/RequireConfirmation/Block)', () => {
  const items = [
    { risk_score: 0.1, suggested_action: 'Allow' },
    { risk_score: 0.5, suggested_action: 'Review' },
    { risk_score: 0.8, suggested_action: 'RequireConfirmation' },
    { risk_score: 0.97, suggested_action: 'Block' },
  ];
  const rows = surfaceRisk(items);
  assert.deepEqual(
    rows.map((r) => r.color),
    ['green', 'yellow', 'orange', 'red']
  );
  // risk_score passes through verbatim; suggested_action preserved.
  assert.equal(rows[0].risk_score, 0.1);
  assert.equal(rows[0].suggested_action, 'Allow');
  assert.equal(rows[3].risk_score, 0.97);
  assert.equal(rows[3].suggested_action, 'Block');
});

test('55-11: surfaceRisk passes through confidence when present and routes a single object', () => {
  const row = surfaceRisk({ risk_score: 0.42, confidence: 0.9, suggested_action: 'Review' });
  // Single object in -> single object out (not wrapped in an array).
  assert.ok(!Array.isArray(row));
  assert.equal(row.risk_score, 0.42);
  assert.equal(row.confidence, 0.9);
  assert.equal(row.suggested_action, 'Review');
  assert.equal(row.color, 'yellow');
});

test('55-11: surfaceRisk degrades unknown action / malformed input to the blank placeholder', () => {
  // Unknown action -> default color, action null (not a recognized vocabulary value).
  const unknown = surfaceRiskOne({ risk_score: 0.5, suggested_action: 'Escalate' });
  assert.equal(unknown.color, 'default');
  assert.equal(unknown.suggested_action, null);
  assert.equal(unknown.risk_score, 0.5); // numeric field still passes through

  // Malformed / nullish items -> blank placeholder, never a throw.
  for (const bad of [null, undefined, 42, 'str', []]) {
    const r = surfaceRiskOne(bad);
    assert.equal(r.risk_score, null);
    assert.equal(r.confidence, null);
    assert.equal(r.suggested_action, null);
    assert.equal(r.color, 'default');
  }

  // Non-array, non-object top-level input -> a single blank placeholder.
  const single = surfaceRisk(null);
  assert.ok(!Array.isArray(single));
  assert.equal(single.color, 'default');
});

test('55-11: surfaceRisk ignores non-finite numeric risk fields (NaN/Infinity -> null)', () => {
  const row = surfaceRiskOne({ risk_score: NaN, confidence: Infinity, suggested_action: 'Allow' });
  // suggested_action present makes the row non-blank; numerics coerce to null.
  assert.equal(row.risk_score, null);
  assert.equal(row.confidence, null);
  assert.equal(row.suggested_action, 'Allow');
  assert.equal(row.color, 'green');
});
