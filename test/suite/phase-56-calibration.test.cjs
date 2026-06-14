// test/suite/phase-56-calibration.test.cjs — Phase 56 (TELE-01 + CAL-01)
//
// Proves the telemetry + calibration layer (executor E):
//   - reference/schemas/events.schema.json now accepts a `risk_assessment`
//     event (a 4th allOf payload discriminator + RiskAssessmentPayload def).
//   - scripts/lib/risk/calibration.cjs:
//       updateCalibration(agent, record, opts)  rolling-50 window, atomic write
//       detectDrift(stats, cfg)                 under / over / none classifier (pure)
//       riskReward({accepted, risk, user_undo}) -> [0,1] (pure)
//       recordRiskOutcome(...)                  best-effort bandit-router.update bridge
//
// Coverage:
//   56-05: events.schema compiles + validates a well-formed risk_assessment
//          event; rejects a bad suggested_action / out-of-range risk_score /
//          extra payload property. (ajv when resolvable; dep-free structural
//          fallback otherwise — both paths assert the same contract.)
//   56-06: rolling-50 (write 60, last 50 kept); detectDrift under/over/none;
//          riskReward named cases; calibration round-trip under a {root} tmpdir.
//
// PURE: detectDrift + riskReward are deterministic (no I/O, no clock). The FS
// tests inject a {root} tmpdir so they are hermetic and parallel-safe.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cal = require('../../scripts/lib/risk/calibration.cjs');
const { updateCalibration, detectDrift, riskReward, recordRiskOutcome, computeStats } = cal;

const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'reference', 'schemas', 'events.schema.json');
const SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// ── helpers ─────────────────────────────────────────────────────────────────

function mkTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p56-cal-'));
}
function rmTmpRoot(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeRiskEvent(overrides = {}) {
  const basePayload = {
    event_id: 'ra-' + Math.random().toString(16).slice(2, 10),
    tool_name: 'Edit',
    risk_score: 0.81,
    suggested_action: 'require_confirmation',
    reasons: ['base:Edit=0.35', 'file:STATE.md(x2+0)'],
    agent: 'design-fixer',
    decision_context: 'finding-7',
  };
  return {
    type: 'risk_assessment',
    timestamp: new Date().toISOString(),
    sessionId: 's-' + Math.random().toString(16).slice(2, 8),
    payload: { ...basePayload, ...(overrides.payload || {}) },
    ...(overrides.envelope || {}),
  };
}

/**
 * Build a validator. Prefers ajv (the existing capability-gap/router-pick tests
 * use it; it resolves from the repo's node_modules). When ajv is NOT resolvable
 * (e.g. a node_modules-less worktree), fall back to a dep-free structural
 * validator that enforces exactly the RiskAssessmentPayload contract. Both
 * return a `(event) => boolean` so the assertions are identical.
 */
function makeRiskValidator() {
  let Ajv = null;
  try {
    Ajv = require('ajv');
  } catch {
    Ajv = null;
  }
  if (Ajv) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const compiled = ajv.compile(SCHEMA);
    return { via: 'ajv', validate: (ev) => Boolean(compiled(ev)) };
  }
  // Dep-free structural fallback — mirror the RiskAssessmentPayload def.
  const def = SCHEMA.definitions.RiskAssessmentPayload;
  const ACTIONS = def.properties.suggested_action.enum;
  const allowed = new Set(Object.keys(def.properties));
  const required = def.required;
  const validate = (ev) => {
    if (!ev || typeof ev !== 'object') return false;
    if (ev.type !== 'risk_assessment') return false;
    if (typeof ev.timestamp !== 'string' || ev.timestamp.length === 0) return false;
    if (typeof ev.sessionId !== 'string' || ev.sessionId.length === 0) return false;
    const p = ev.payload;
    if (!p || typeof p !== 'object') return false;
    for (const k of required) {
      if (!(k in p)) return false;
    }
    for (const k of Object.keys(p)) {
      if (!allowed.has(k)) return false; // additionalProperties: false
    }
    if (typeof p.event_id !== 'string' || p.event_id.length === 0) return false;
    if (typeof p.tool_name !== 'string' || p.tool_name.length === 0) return false;
    if (typeof p.risk_score !== 'number' || p.risk_score < 0 || p.risk_score > 1) return false;
    if (!ACTIONS.includes(p.suggested_action)) return false;
    if (!Array.isArray(p.reasons) || !p.reasons.every((r) => typeof r === 'string')) return false;
    return true;
  };
  return { via: 'structural', validate };
}

// ── 56-05: schema accepts risk_assessment ───────────────────────────────────

test('56-05: events.schema declares the risk_assessment discriminator + payload def', () => {
  // free-form type, with risk_assessment seeded in the description.
  assert.equal(SCHEMA.properties.type.type, 'string');
  assert.ok(!('enum' in SCHEMA.properties.type), 'type stays free-form (no closed enum)');
  assert.match(SCHEMA.properties.type.description, /risk_assessment/);

  // a 4th allOf branch discriminates type === 'risk_assessment'.
  const branches = Array.isArray(SCHEMA.allOf) ? SCHEMA.allOf : [];
  const found = branches.some(
    (b) => b && b.if && b.if.properties && b.if.properties.type && b.if.properties.type.const === 'risk_assessment',
  );
  assert.ok(found, 'risk_assessment allOf branch must exist');

  // the payload def exists with the 5 required fields.
  const def = SCHEMA.definitions && SCHEMA.definitions.RiskAssessmentPayload;
  assert.ok(def, 'RiskAssessmentPayload definition must be present');
  assert.equal(def.additionalProperties, false);
  assert.deepEqual(
    def.required.slice().sort(),
    ['event_id', 'reasons', 'risk_score', 'suggested_action', 'tool_name'],
    'RiskAssessmentPayload required list',
  );
  assert.deepEqual(def.properties.suggested_action.enum, [
    'allow',
    'review',
    'require_confirmation',
    'block',
  ]);
});

test('56-05: schema compiles + validates a well-formed risk_assessment event', () => {
  const { validate } = makeRiskValidator();
  // full payload (with the two optional fields).
  assert.equal(validate(makeRiskEvent()), true, 'full risk_assessment event must validate');
  // minimal payload (no optional agent / decision_context).
  const minimal = makeRiskEvent({
    payload: {
      event_id: 'ra-min',
      tool_name: 'Bash',
      risk_score: 1,
      suggested_action: 'block',
      reasons: [],
      agent: undefined,
      decision_context: undefined,
    },
  });
  delete minimal.payload.agent;
  delete minimal.payload.decision_context;
  assert.equal(validate(minimal), true, 'minimal risk_assessment event must validate');
});

test('56-05: schema rejects bad suggested_action / out-of-range risk_score / extra prop', () => {
  const { validate } = makeRiskValidator();

  const badAction = makeRiskEvent({ payload: { suggested_action: 'nope' } });
  assert.equal(validate(badAction), false, 'unknown suggested_action must be rejected');

  const badScoreHigh = makeRiskEvent({ payload: { risk_score: 1.5 } });
  assert.equal(validate(badScoreHigh), false, 'risk_score > 1 must be rejected');

  const badScoreLow = makeRiskEvent({ payload: { risk_score: -0.1 } });
  assert.equal(validate(badScoreLow), false, 'risk_score < 0 must be rejected');

  const extra = makeRiskEvent({ payload: { surprise: 'x' } });
  assert.equal(validate(extra), false, 'additionalProperties:false must reject extra payload keys');

  const missing = makeRiskEvent();
  delete missing.payload.event_id;
  assert.equal(validate(missing), false, 'missing required event_id must be rejected');
});

// ── 56-06: rolling-50 window ─────────────────────────────────────────────────

test('56-06: updateCalibration keeps a rolling-50 window (write 60 -> last 50 kept)', () => {
  const root = mkTmpRoot();
  try {
    let last;
    for (let i = 0; i < 60; i++) {
      last = updateCalibration(
        'design-fixer',
        { risk: 0.4, accepted: true, user_undo: false, post_apply_correct: true },
        { root, now: '2026-06-03T00:00:00.000Z' },
      );
    }
    assert.equal(last.windowSize, 50, 'window must cap at 50 after 60 writes');

    // persisted file reflects the cap.
    const file = path.join(root, '.design', 'telemetry', 'calibration.json');
    assert.ok(fs.existsSync(file), 'calibration.json must be written under {root}/.design/telemetry');
    const store = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(store.agents['design-fixer'].window.length, 50);
    // stats are present + sane.
    assert.equal(Math.round(store.agents['design-fixer'].mean_risk_emitted * 100) / 100, 0.4);
  } finally {
    rmTmpRoot(root);
  }
});

test('56-06: rolling window evicts the OLDEST records (FIFO), not arbitrary ones', () => {
  const root = mkTmpRoot();
  try {
    // 50 low-risk, then 10 high-risk. After the 60th write the window holds
    // the last 50 => 40 low + 10 high. Mean = (40*0.2 + 10*0.8)/50 = 0.32.
    for (let i = 0; i < 50; i++) {
      updateCalibration('a', { risk: 0.2, accepted: true }, { root });
    }
    let last;
    for (let i = 0; i < 10; i++) {
      last = updateCalibration('a', { risk: 0.8, accepted: true }, { root });
    }
    assert.equal(last.windowSize, 50);
    assert.ok(Math.abs(last.stats.mean_risk_emitted - 0.32) < 1e-9, `mean ${last.stats.mean_risk_emitted} ~ 0.32`);
  } finally {
    rmTmpRoot(root);
  }
});

// ── 56-06: detectDrift ───────────────────────────────────────────────────────

test('56-06: detectDrift classifies under_scoring (low risk + high override)', () => {
  assert.equal(
    detectDrift({ mean_risk_emitted: 0.20, override_rate: 0.40, post_apply_correctness: 0.5 }),
    'under_scoring',
  );
  // boundary: mean exactly at 0.35 is NOT under (strict <), override exactly at
  // 0.30 is NOT under (strict >).
  assert.equal(
    detectDrift({ mean_risk_emitted: 0.35, override_rate: 0.40, post_apply_correctness: 0.5 }),
    'none',
  );
  assert.equal(
    detectDrift({ mean_risk_emitted: 0.20, override_rate: 0.30, post_apply_correctness: 0.5 }),
    'none',
  );
});

test('56-06: detectDrift classifies over_scoring (high risk + high correctness + low override)', () => {
  assert.equal(
    detectDrift({ mean_risk_emitted: 0.80, override_rate: 0.05, post_apply_correctness: 0.95 }),
    'over_scoring',
  );
  // boundary: correctness exactly 0.90 is NOT over (strict >).
  assert.equal(
    detectDrift({ mean_risk_emitted: 0.80, override_rate: 0.05, post_apply_correctness: 0.90 }),
    'none',
  );
  // boundary: override exactly 0.10 is NOT over (strict <).
  assert.equal(
    detectDrift({ mean_risk_emitted: 0.80, override_rate: 0.10, post_apply_correctness: 0.95 }),
    'none',
  );
});

test('56-06: detectDrift returns none for a well-calibrated / mid agent', () => {
  assert.equal(
    detectDrift({ mean_risk_emitted: 0.50, override_rate: 0.15, post_apply_correctness: 0.85 }),
    'none',
  );
  // empty-window defaults (mean 0, override 0, correctness 1) -> none.
  assert.equal(detectDrift(computeStats([])), 'none');
  // malformed input is tolerated -> none.
  assert.equal(detectDrift(null), 'none');
  assert.equal(detectDrift(undefined), 'none');
});

test('56-06: detectDrift honours an injected cfg override', () => {
  const strict = {
    under_scoring: { mean_risk_max: 0.10, override_rate_min: 0.50 },
    over_scoring: { mean_risk_min: 0.95, correctness_min: 0.99, override_rate_max: 0.01 },
  };
  // The default would flag under_scoring; the stricter cfg does not.
  assert.equal(
    detectDrift({ mean_risk_emitted: 0.20, override_rate: 0.40, post_apply_correctness: 0.5 }, strict),
    'none',
  );
});

// ── 56-06: riskReward ────────────────────────────────────────────────────────

test('56-06: riskReward — low-risk accepted ~ 0.9', () => {
  assert.ok(Math.abs(riskReward({ accepted: true, risk: 0.2 }) - 0.9) < 1e-9);
});

test('56-06: riskReward — rejected -> 0 (regardless of risk)', () => {
  assert.equal(riskReward({ accepted: false, risk: 0.2 }), 0);
  assert.equal(riskReward({ accepted: false, risk: 0.0 }), 0);
});

test('56-06: riskReward — high-risk accepted ~ 0.55', () => {
  assert.ok(Math.abs(riskReward({ accepted: true, risk: 0.9 }) - 0.55) < 1e-9);
});

test('56-06: riskReward — user_undo zeroes an otherwise-accepted action', () => {
  assert.equal(riskReward({ accepted: true, risk: 0.0, user_undo: true }), 0);
});

test('56-06: riskReward — clamps + tolerates missing fields', () => {
  // default risk 0 (missing) on an accepted action -> 1.0.
  assert.equal(riskReward({ accepted: true }), 1);
  assert.equal(riskReward({}), 1); // accepted defaults to "not rejected"
  // risk above 1 clamps before the 1 - 0.5*risk math (0.5 floor).
  assert.equal(riskReward({ accepted: true, risk: 5 }), 0.5);
  assert.equal(riskReward(null), 1);
});

// ── 56-06: calibration round-trip under a {root} tmpdir ──────────────────────

test('56-06: calibration round-trips per-agent stats + survives reload', () => {
  const root = mkTmpRoot();
  try {
    // agent A: 3 low-risk accepts, 7 low-risk overrides -> under-scoring shape.
    for (let i = 0; i < 3; i++) {
      updateCalibration('agent-A', { risk: 0.2, accepted: true, post_apply_correct: true }, { root });
    }
    for (let i = 0; i < 7; i++) {
      updateCalibration('agent-A', { risk: 0.2, accepted: false }, { root });
    }
    // agent B (separate key): high-risk accepts, all correct, no overrides.
    let lastB;
    for (let i = 0; i < 10; i++) {
      lastB = updateCalibration('agent-B', { risk: 0.8, accepted: true, post_apply_correct: true }, { root });
    }

    // reload from disk via the module's load().
    const store = cal.load({ root });
    assert.deepEqual(Object.keys(store.agents).sort(), ['agent-A', 'agent-B']);

    const a = store.agents['agent-A'];
    assert.equal(a.window.length, 10);
    assert.ok(Math.abs(a.mean_risk_emitted - 0.2) < 1e-9);
    assert.ok(Math.abs(a.override_rate - 0.7) < 1e-9, `A override ${a.override_rate} ~ 0.7`);
    assert.equal(detectDrift(a), 'under_scoring');

    const b = store.agents['agent-B'];
    assert.ok(Math.abs(b.mean_risk_emitted - 0.8) < 1e-9);
    assert.equal(b.override_rate, 0);
    assert.equal(b.post_apply_correctness, 1);
    assert.equal(detectDrift(b), 'over_scoring');
    // the returned stats match the persisted ones.
    assert.ok(Math.abs(lastB.stats.mean_risk_emitted - 0.8) < 1e-9);
  } finally {
    rmTmpRoot(root);
  }
});

test('56-06: load() tolerates absent + corrupt calibration files', () => {
  const root = mkTmpRoot();
  try {
    // absent -> fresh envelope.
    const fresh = cal.load({ root });
    assert.deepEqual(fresh.agents, {});
    assert.equal(fresh.schema_version, cal.SCHEMA_VERSION);

    // corrupt -> fresh envelope (never throws).
    const file = path.join(root, '.design', 'telemetry', 'calibration.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ not json', 'utf8');
    const recovered = cal.load({ root });
    assert.deepEqual(recovered.agents, {});
  } finally {
    rmTmpRoot(root);
  }
});

// ── 56-06: recordRiskOutcome bandit bridge (best-effort, never throws) ───────

test('56-06: recordRiskOutcome feeds riskReward into an injected bandit (best-effort)', () => {
  const calls = [];
  const fakeBandit = {
    update(input) {
      calls.push(input);
      return { alpha: 1, beta: 1, posteriorPath: 'fake' };
    },
  };
  const res = recordRiskOutcome({
    agent: 'design-fixer',
    bin: 'small',
    tier: 'sonnet',
    accepted: true,
    risk: 0.2,
    bandit: fakeBandit,
  });
  assert.equal(res.recorded, true);
  assert.ok(Math.abs(res.reward - 0.9) < 1e-9);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agent, 'design-fixer');
  assert.equal(calls[0].bin, 'small');
  assert.equal(calls[0].tier, 'sonnet');
  assert.ok(Math.abs(calls[0].reward - 0.9) < 1e-9);
});

test('56-06: recordRiskOutcome skips (does not throw) when routing context is missing', () => {
  // no bin/tier -> cannot address an arm -> skip cleanly, still report reward.
  const res = recordRiskOutcome({ agent: 'design-fixer', accepted: false, risk: 0.5 });
  assert.equal(res.recorded, false);
  assert.equal(res.reward, 0); // rejected
  assert.match(res.reason, /bin\+tier/);
});

test('56-06: recordRiskOutcome never throws when the bandit update fails', () => {
  const throwingBandit = {
    update() {
      throw new Error('posterior write failed');
    },
  };
  const res = recordRiskOutcome({
    agent: 'a',
    bin: 'tiny',
    tier: 'haiku',
    accepted: true,
    risk: 0.0,
    bandit: throwingBandit,
  });
  assert.equal(res.recorded, false);
  assert.equal(res.reward, 1); // accepted, risk 0
  assert.match(res.reason, /posterior write failed/);
});
