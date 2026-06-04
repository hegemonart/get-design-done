#!/usr/bin/env node
'use strict';
/**
 * hooks/gdd-risk-gate.js — PreToolUse:Write|Edit|MultiEdit|Bash risk gate (Phase 56, RISK-02).
 * Payload shape locked to RiskAssessmentPayload (events.schema.json): event_id, tool_name,
 * risk_score, suggested_action, reasons (required). Optional: agent, decision_context.
 * additionalProperties:false — do NOT add breakdown/paths/score/tool to the payload.
 *
 * Quantifies the confidence/risk of a writer action with the PURE scorer
 * `scripts/lib/risk/compute-risk.cjs` (executor A), emits a `risk_assessment`
 * telemetry event, writes a rolling-50 calibration row via
 * `scripts/lib/risk/calibration.cjs` updateCalibration() (Phase 56 CAL-01 — this
 * closes the calibration loop end-to-end: production traffic, not just tests,
 * drives detectDrift), and routes by the scorer's `suggested_action`:
 *
 *   allow                -> { continue: true }                                  (silent)
 *   review               -> { continue: true, hookSpecificOutput: { … } }       (advisory, non-blocking)
 *   require_confirmation -> { continue: true, hookSpecificOutput: { … } }       (advisory; the AGENT — design-fixer —
 *                                                                                 does the AskUserQuestion, NOT the hook; R2)
 *   block                -> { continue: false, stopReason: '…' }                (the block: continue:false at EXIT 0)
 *
 * Contract (the repo house-style — gdd-bash-guard / gdd-protected-paths, R1):
 *   Input  (stdin JSON): { tool_name, tool_input, cwd, session_id? }
 *   Output (stdout JSON):
 *     - allow/review/confirm -> { continue: true [, hookSpecificOutput] }
 *     - block                -> { continue: false, stopReason }
 *   Exit: ALWAYS 0. `continue:false` is the block — never `process.exit(2)`.
 *
 * Resilience: best-effort. ANY error (bad stdin, unresolvable sibling, scorer
 * throw, telemetry failure) fails OPEN -> { continue: true } and a logged note.
 * A risk scorer can never be the reason a tool call is hard-blocked by accident.
 *
 * Sibling resolution: package-root WALK-UP (Phase 53/54 lesson — hooks run from
 * varied cwds and installed-plugin layouts; a fixed `__dirname/..` is fragile).
 * We walk up from this file to the directory that actually contains
 * `scripts/lib/risk/compute-risk.cjs` and require it from there.
 *
 * Writer-agent gate: best-effort. If the repo signals the active agent
 * (`payload.agent` / GDD_AGENT) AND it is a known READ-ONLY agent, we skip
 * scoring (a read-only agent should not see write-risk advisories). When the
 * agent is unknowable — the common case for a PreToolUse hook — we score ALL
 * matched calls: advisory output is non-blocking and the score for low-risk
 * work stays in the allow band, so scoring-all is safe (per the plan).
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('node:crypto');

// ── Package-root walk-up: locate scripts/lib/risk/compute-risk.cjs ──────────
// Start at this file's dir and climb until we find the risk module (or a
// package.json that owns it). Cwd-independent; survives installed-plugin
// layouts where __dirname is not simply <pkg>/hooks.
const RISK_REL = path.join('scripts', 'lib', 'risk', 'compute-risk.cjs');

function findRiskModule(startDir) {
  let dir = startDir;
  // Bound the climb to the filesystem root.
  for (let i = 0; i < 64; i++) {
    const candidate = path.join(dir, RISK_REL);
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* stat error — keep climbing */ }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached the root
    dir = parent;
  }
  return null;
}

// Resolve once at module load. If it cannot be found, `compute` stays null and
// the hook fails open on every call (logged note).
let _risk = null;
let _riskLoadError = null;
(function loadRisk() {
  try {
    const modPath = findRiskModule(__dirname);
    if (!modPath) {
      _riskLoadError = `compute-risk.cjs not found above ${__dirname}`;
      return;
    }
    // eslint-disable-next-line global-require, import/no-dynamic-require
    _risk = require(modPath);
  } catch (err) {
    _riskLoadError = err && err.message ? err.message : String(err);
  }
})();

// ── Calibration sibling resolver (same walk-up shape as the risk module) ────
// scripts/lib/risk/calibration.cjs is the rolling-50 per-agent calibration
// store (Phase 56 CAL-01). We call updateCalibration AFTER scoring so the
// store grows over time with real per-agent (risk, accepted) outcomes — that
// is what wires the calibration loop end-to-end (under_scoring / over_scoring
// drift becomes detectable from real traffic, not just from synthetic tests).
const CAL_REL = path.join('scripts', 'lib', 'risk', 'calibration.cjs');

function findCalibrationModule(startDir) {
  let dir = startDir;
  for (let i = 0; i < 64; i++) {
    const candidate = path.join(dir, CAL_REL);
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* keep climbing */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

let _cal = null;
let _calLoadError = null;
(function loadCal() {
  try {
    const modPath = findCalibrationModule(__dirname);
    if (!modPath) {
      _calLoadError = `calibration.cjs not found above ${__dirname}`;
      return;
    }
    // eslint-disable-next-line global-require, import/no-dynamic-require
    _cal = require(modPath);
  } catch (err) {
    _calLoadError = err && err.message ? err.message : String(err);
  }
})();

// ── Calibration write (best-effort, never throws) ───────────────────────────
// Records one (agent, risk, accepted) outcome for the rolling-50 window.
//
// The signal we can KNOW at PreToolUse time:
//   * action === 'block' -> definitive accepted:false (the hook rejected the
//     call; the user never sees the tool run).
//   * action ∈ {allow, review, require_confirmation} -> accepted:true at the
//     PreToolUse boundary. The action proceeds past the risk gate; a later
//     hook may still block, and the user may later /gdd:override or undo, but
//     for THIS gate's calibration loop "the risk gate let it through" IS the
//     acceptance signal. user_undo / post_apply_correct are deliberately left
//     null (unresolved) — a future PostToolUse pass can resolve them later.
//
// Agent gate: a calibration row needs an agent key. When the agent is unknown
// (the common case for a generic PreToolUse hook) we skip the write rather
// than pool everything into an 'unknown' bucket that would render drift
// detection meaningless. The risk_assessment event still fires either way.
//
// Always best-effort: a calibration write must NEVER break a tool call.
function recordCalibration(agent, assessment, cwd) {
  try {
    if (!_cal || typeof _cal.updateCalibration !== 'function') return;
    if (!agent || typeof agent !== 'string') return;
    const action = assessment && assessment.suggested_action;
    if (!action) return;
    const score = typeof assessment.score === 'number' ? assessment.score : 0;
    _cal.updateCalibration(
      agent,
      {
        risk: score,
        accepted: action !== 'block',
        user_undo: false,
        post_apply_correct: null,
      },
      { root: cwd || process.cwd() },
    );
  } catch {
    /* swallow — calibration writes must never throw into the gate */
  }
}

// ── Best-effort `risk_assessment` event emit ────────────────────────────────
// The firehose (`appendEvent`, sdk/event-stream) is the sink the wire-in tests
// read via GDD_EVENTS_PATH. `type` is free-form on the envelope, so emitting
// `risk_assessment` is valid today; executor E adds it to KNOWN_EVENT_TYPES +
// the schema. Lazily resolved + fully swallowed — telemetry never throws into
// the hot path (mirrors hooks/_hook-emit.js's lazy .ts require).
let _appendEvent = null;
let _appendResolved = false;

function getAppendEvent() {
  if (_appendResolved) return _appendEvent || (() => {});
  _appendResolved = true;
  // Resolve the event-stream sibling via the same package-root walk-up so we
  // do not depend on a fixed `hooks/..` layout.
  const candidates = [
    path.join('sdk', 'event-stream', 'index.ts'),
    path.join('scripts', 'lib', 'event-stream', 'index.ts'),
  ];
  let dir = __dirname;
  for (let i = 0; i < 64; i++) {
    for (const rel of candidates) {
      const p = path.join(dir, rel);
      try {
        if (fs.existsSync(p)) {
          // eslint-disable-next-line global-require, import/no-dynamic-require
          _appendEvent = require(p).appendEvent;
          return _appendEvent || (() => {});
        }
      } catch { /* not loadable in this runtime (plain node + .ts) → keep trying */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  _appendEvent = null;
  return () => {};
}

function emitRiskAssessment(payload, sessionId) {
  try {
    const appendEvent = getAppendEvent();
    appendEvent({
      type: 'risk_assessment',
      timestamp: new Date().toISOString(),
      sessionId: sessionId || process.env.GDD_SESSION_ID || 'hook',
      payload,
    });
  } catch {
    /* telemetry must never throw into the gate */
  }
}

// Also emit the canonical `hook.fired` row (same as gdd-bash-guard) so the
// Phase 22 wire-in baselines stay uniform. Best-effort.
function emitHookFired(decision, extras) {
  try {
    // _hook-emit.js lives beside this hook; resolve it relatively but
    // defensively (it is part of the same hooks/ dir in every layout).
    // eslint-disable-next-line global-require
    require('./_hook-emit.js').emitHookFired('gdd-risk-gate', decision, extras);
  } catch {
    /* swallow */
  }
}

// ── Writer-agent gate (best-effort, inclusive) ──────────────────────────────
// Known read-only agent ids that should NOT receive write-risk advisories.
// Conservative + small: only agents whose whole job is reading/analysis. When
// the agent is unknown we score anyway (advisory is safe; the plan: "if
// unknowable, score all matched calls").
const READ_ONLY_AGENTS = new Set([
  'design-context-checker',
  'design-context-reviewer',
  'design-plan-checker',
  'design-verifier-gate',
  'design-integration-checker',
  'brief-auditor',
  'copy-auditor',
  'design-auditor',
]);

function agentFrom(payload) {
  const a = (payload && typeof payload.agent === 'string' && payload.agent)
    || process.env.GDD_AGENT
    || '';
  return String(a).trim();
}

function isReadOnlyAgent(agent) {
  if (!agent) return false; // unknown -> not read-only -> score it
  return READ_ONLY_AGENTS.has(agent);
}

const MATCHED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'Bash']);

// ── Extend-only table merge (D7 / protected-paths discipline) ───────────────
// loadRiskConfig returns numeric `base_tool_extra`, plus `file_sensitivity_extra`
// / `input_pattern_extra` arrays sourced from JSON. We EXTEND the frozen
// defaults (never shrink). JSON-sourced file-sensitivity entries carry a STRING
// `test`; compile it to a linear RegExp defensively (malformed entries are
// dropped, never thrown). input_pattern_extra needs a callable `when` (cannot
// come from JSON) so it is passed through only when already callable.
function compileFileSensitivityExtra(extra) {
  const out = [];
  if (!Array.isArray(extra)) return out;
  for (const e of extra) {
    if (!e || typeof e !== 'object') continue;
    let test = e.test;
    if (typeof test === 'string') {
      try { test = new RegExp(test, 'i'); } catch { continue; }
    }
    if (!(test instanceof RegExp)) continue;
    out.push({
      test,
      mult: typeof e.mult === 'number' && Number.isFinite(e.mult) ? e.mult : 1,
      add: typeof e.add === 'number' && Number.isFinite(e.add) ? e.add : 0,
      label: typeof e.label === 'string' ? e.label : 'config',
    });
  }
  return out;
}

function buildMergedTables(cfg) {
  // Frozen defaults are re-exported from compute-risk for exactly this.
  const baseDefault = _risk.BASE_TOOL_RISK || {};
  const fileDefault = _risk.FILE_SENSITIVITY || [];
  const inputDefault = _risk.INPUT_PATTERN_RISK || [];

  const baseExtra = (cfg && cfg.base_tool_extra && typeof cfg.base_tool_extra === 'object') ? cfg.base_tool_extra : {};
  const fileExtra = compileFileSensitivityExtra(cfg && cfg.file_sensitivity_extra);
  const inputExtra = Array.isArray(cfg && cfg.input_pattern_extra)
    ? cfg.input_pattern_extra.filter((e) => e && typeof e.when === 'function')
    : [];

  // Only allocate new tables when there is something to extend; otherwise reuse
  // the frozen defaults so the common path stays allocation-free + identical to
  // the pure unit tests.
  const haveBaseExtra = Object.keys(baseExtra).length > 0;
  if (!haveBaseExtra && fileExtra.length === 0 && inputExtra.length === 0) {
    return undefined; // computeRisk defaults to the frozen tables
  }
  return {
    BASE_TOOL_RISK: haveBaseExtra ? { ...baseDefault, ...sanitizeNumeric(baseExtra) } : baseDefault,
    // Config entries are appended AFTER defaults; pickMaxFileSensitivity takes
    // the highest-weight match across the union, so order is immaterial.
    FILE_SENSITIVITY: fileExtra.length ? [...fileDefault, ...fileExtra] : fileDefault,
    INPUT_PATTERN_RISK: inputExtra.length ? [...inputDefault, ...inputExtra] : inputDefault,
  };
}

function sanitizeNumeric(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === 'number' && Number.isFinite(obj[k])) out[k] = obj[k];
  }
  return out;
}

// ── Rationale / advisory rendering ──────────────────────────────────────────
function rationaleLine(tool, assessment) {
  const score = typeof assessment.score === 'number' ? assessment.score.toFixed(2) : '?';
  const reasons = Array.isArray(assessment.reasons) ? assessment.reasons.join(', ') : '';
  return `gdd-risk-gate: ${tool} risk=${score} (${assessment.suggested_action}) — ${reasons}`;
}

function buildAdvisory(tool, assessment, extraNote) {
  const head = rationaleLine(tool, assessment);
  const body = extraNote ? `${head}\n${extraNote}` : head;
  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: body,
    },
  };
}

function buildBlock(tool, assessment) {
  return {
    continue: false,
    stopReason: `${rationaleLine(tool, assessment)} — run /gdd:override to escalate`,
  };
}

const ALLOW = { continue: true };

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk;

  let payload;
  try {
    payload = JSON.parse(buf || '{}');
  } catch {
    // Malformed stdin -> fail open.
    emitHookFired('allow', { reason: 'parse-error' });
    process.stdout.write(JSON.stringify(ALLOW));
    return;
  }

  const tool = payload && typeof payload.tool_name === 'string' ? payload.tool_name : '';
  if (!MATCHED_TOOLS.has(tool)) {
    // Not a writer action we gate (the matcher should already exclude these,
    // but be defensive).
    emitHookFired('allow', { reason: 'unmatched-tool', tool });
    process.stdout.write(JSON.stringify(ALLOW));
    return;
  }

  const agent = agentFrom(payload);
  if (isReadOnlyAgent(agent)) {
    emitHookFired('allow', { reason: 'read-only-agent', agent });
    process.stdout.write(JSON.stringify(ALLOW));
    return;
  }

  // If the scorer could not be located/loaded, fail open with a logged note.
  if (!_risk || typeof _risk.computeRisk !== 'function') {
    try {
      process.stderr.write(
        `[gdd-risk-gate] risk scorer unavailable (${_riskLoadError || 'unknown'}) — failing open\n`,
      );
    } catch { /* swallow */ }
    emitHookFired('allow', { reason: 'scorer-unavailable' });
    process.stdout.write(JSON.stringify(ALLOW));
    return;
  }

  const cwd = (payload && typeof payload.cwd === 'string' && payload.cwd) || process.cwd();
  const input = (payload && payload.tool_input && typeof payload.tool_input === 'object') ? payload.tool_input : {};
  const sessionId = (payload && typeof payload.session_id === 'string' && payload.session_id) || undefined;

  let assessment;
  try {
    const cfg = _risk.loadRiskConfig(cwd);
    const mergedTables = buildMergedTables(cfg);
    assessment = _risk.computeRisk(tool, input, cfg.thresholds, mergedTables);
  } catch (err) {
    // Any scorer failure -> fail open with a logged note.
    try {
      process.stderr.write(
        `[gdd-risk-gate] computeRisk threw (${err && err.message ? err.message : String(err)}) — failing open\n`,
      );
    } catch { /* swallow */ }
    emitHookFired('allow', { reason: 'scorer-error' });
    emitRiskAssessment({
      event_id: randomUUID(),
      tool_name: tool,
      risk_score: 0,
      suggested_action: 'allow',
      reasons: [],
      agent: agent || undefined,
    }, sessionId);
    process.stdout.write(JSON.stringify(ALLOW));
    return;
  }

  const action = assessment && assessment.suggested_action;

  // Emit the typed risk_assessment event for EVERY scored call (allow→block),
  // so the dashboard (risk-surface, Phase 55) + calibration (E) see the full
  // distribution. Best-effort.
  emitRiskAssessment(
    {
      event_id: randomUUID(),
      tool_name: tool,
      risk_score: assessment.score,
      suggested_action: action,
      reasons: Array.isArray(assessment.reasons) ? assessment.reasons : [],
      agent: agent || undefined,
    },
    sessionId,
  );

  // Update the rolling-50 per-agent calibration window with this outcome
  // (Phase 56 CAL-01). Best-effort; no-op when the agent is unknown. This is
  // what closes the calibration loop end-to-end: the store accrues real
  // (risk, accepted) pairs across the writer agent's actions, so detectDrift
  // can flag under_scoring / over_scoring from production traffic rather than
  // only from synthetic test calls.
  recordCalibration(agent, assessment, cwd);

  // Mirror the decision onto the hook.fired row (allow|review|confirm|block).
  const firedDecision = action === 'block' ? 'block' : 'allow';
  emitHookFired(firedDecision, { suggested_action: action, score: assessment.score });

  switch (action) {
    case 'block':
      process.stdout.write(JSON.stringify(buildBlock(tool, assessment)));
      return;
    case 'require_confirmation':
      // Advisory + flag. The hook does NOT prompt (R2) — design-fixer's
      // confidence×risk routing will surface the AskUserQuestion with the diff.
      process.stdout.write(JSON.stringify(buildAdvisory(
        tool,
        assessment,
        'High-risk action — design-fixer will confirm with you (AskUserQuestion) before applying; or run /gdd:override to escalate.',
      )));
      return;
    case 'review':
      // Advisory, non-blocking: surface the rationale so the agent can weigh it.
      process.stdout.write(JSON.stringify(buildAdvisory(tool, assessment, null)));
      return;
    case 'allow':
    default:
      process.stdout.write(JSON.stringify(ALLOW));
      return;
  }
}

// Auto-run only when invoked directly (hooks.json runs `node hooks/gdd-risk-gate.js`,
// where require.main === module). Guarding the auto-run lets tests require() the
// module in-process to unit-test the pure helpers without a stdin read.
if (require.main === module) {
  main().catch((err) => {
    // Last-resort fail-open. Never throw out of the hook.
    try {
      process.stderr.write(
        `[gdd-risk-gate] unexpected error (${err && err.message ? err.message : String(err)}) — failing open\n`,
      );
    } catch { /* swallow */ }
    process.stdout.write(JSON.stringify({ continue: true }));
  });
}

// Exported for tests — pure helpers + the resolver. main() owns the I/O + contract.
module.exports = {
  findRiskModule,
  findCalibrationModule,
  recordCalibration,
  buildMergedTables,
  compileFileSensitivityExtra,
  isReadOnlyAgent,
  agentFrom,
  rationaleLine,
  buildAdvisory,
  buildBlock,
  READ_ONLY_AGENTS,
  main,
};
