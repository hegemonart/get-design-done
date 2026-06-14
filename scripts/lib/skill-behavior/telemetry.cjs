/**
 * telemetry.cjs — reflector-telemetry layer for the pressure-scenario harness
 * (Plan 33-05). The third leg of Phase 33: it CONSUMES the 33-01 runner result
 * ({ scenario, target_skill, pass, compliance_hits, violation_hits }), records a
 * scenario-failure event to a JSONL artifact, detects SUSTAINED failure, and on
 * sustained failure produces a PROPOSE-ONLY reflector content-edit draft via the
 * same incubator/apply-reflections surface the shipped reflector-kfm-proposer
 * uses.
 *
 * Why this module exists: behavior tests only matter if a sustained failure
 * prompts a content fix. This closes that loop — a failing run is recorded; when
 * a scenario fails ≥3 of its last 10 runs (D-07 threshold), the reflector
 * proposes a skill-content edit for human review via /hone:apply-reflections. The
 * proposal NEVER auto-edits a skill (Phase 11/29 propose-only SC; Phase 33
 * out-of-scope: "Auto-applying reflector-proposed skill edits — propose-only").
 *
 * Decisions honored:
 *   * D-07 — telemetry → .design/telemetry/skill-behavior.jsonl (runtime
 *     artifact, gitignored, local); sustained-failure signal = ≥3 of the last 10
 *     runs failing for a scenario; reflector consumption is STUB-tested (no live
 *     runs — all paths + the clock are injectable so tests use a tmp dir).
 *   * D-06 — this module is exercised by the DEFAULT suite (no API key / no LLM).
 *
 * Injectability / purity:
 *   The JSONL path, the incubator root, `fs`, and the clock (`now`) are ALL
 *   injectable via opts so every test writes to an os.tmpdir() dir and NOTHING
 *   touches the real .design/ tree. The runner (33-01) does NOT stamp a `ts`;
 *   the timestamp is stamped HERE via the injected `now`.
 *
 * Pattern references (style mirrored, NOT imported):
 *   * scripts/lib/event-chain.cjs — house JSONL append (defensive mkdir -p +
 *     append, never-throw) + findRepoRoot + line-by-line read idiom.
 *   * scripts/lib/reflector-kfm-proposer.cjs — shouldPropose-style stability gate
 *     + proposeKfmDraft writing a proposal-only draft under
 *     .design/reflections/incubator/<slug>/CATALOGUE-ENTRY.md.
 *
 * Public API:
 *   recordRun(result, opts)              → event | null   (append on pass:false)
 *   readRuns(scenario, opts)             → Array<event>   (tail JSONL, filter)
 *   isSustainedFailure(scenario, opts)   → boolean         (≥3 of last 10 failed)
 *   maybeProposeReflection(scenario, opts) → { action:'drafted', path, slug }
 *                                            | { action:'skipped', reason }
 *
 * Pure CommonJS, deps = node:fs + node:path ONLY. No npm dependencies.
 */

'use strict';

const nodeFs = require('node:fs');
const path = require('node:path');

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const EVENT_TYPE = 'skill_behavior_failure';
const DEFAULT_JSONL_REL = '.design/telemetry/skill-behavior.jsonl';
const DEFAULT_INCUBATOR_REL = '.design/reflections/incubator';
const SUSTAINED_WINDOW = 10; // D-07: look at the last N runs
const SUSTAINED_THRESHOLD = 3; // D-07: ≥3 failures of the last 10 == sustained
const INCUBATOR_PREFIX = 'skill-edit-';

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/**
 * Walk up from a start dir until a package.json is found (repo root). Mirrors
 * the reflector-kfm-proposer / event-chain findRepoRoot idiom.
 *
 * @param {string} [startDir]
 * @returns {string}
 */
function findRepoRoot(startDir) {
  let dir = startDir || __dirname;
  for (let i = 0; i < 12; i++) {
    if (nodeFs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..', '..');
}

/**
 * Resolve the JSONL emit path: explicit opts.jsonlPath wins (absolute or
 * relative to cwd); otherwise <repoRoot>/.design/telemetry/skill-behavior.jsonl.
 */
function resolveJsonlPath(opts) {
  const o = opts || {};
  if (o.jsonlPath) {
    return path.isAbsolute(o.jsonlPath)
      ? o.jsonlPath
      : path.resolve(o.repoRoot || process.cwd(), o.jsonlPath);
  }
  return path.join(o.repoRoot || findRepoRoot(), DEFAULT_JSONL_REL);
}

/**
 * Resolve the incubator draft root: explicit opts.incubatorRoot wins; otherwise
 * <repoRoot>/.design/reflections/incubator.
 */
function resolveIncubatorRoot(opts) {
  const o = opts || {};
  if (o.incubatorRoot) {
    return path.isAbsolute(o.incubatorRoot)
      ? o.incubatorRoot
      : path.resolve(o.repoRoot || process.cwd(), o.incubatorRoot);
  }
  return path.join(o.repoRoot || findRepoRoot(), DEFAULT_INCUBATOR_REL);
}

/**
 * Kebab-case slug from a free-text scenario name (mirrors the reflector-kfm
 * deriveSlug semantics — ASCII-only, dash-collapsed, ≤40 chars).
 */
function deriveSlug(text) {
  const raw = typeof text === 'string' ? text : '';
  let s = raw.toLowerCase();
  s = s.replace(/[^\x20-\x7e]+/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  if (s.length > 40) s = s.slice(0, 40);
  s = s.replace(/-+$/g, '');
  return s || 'unnamed';
}

// -------------------------------------------------------------------
// recordRun — emit a scenario-failure event to the JSONL artifact
// -------------------------------------------------------------------

/**
 * Append ONE scenario-failure event to the JSONL artifact when a 33-01 runner
 * result has pass:false. The timestamp is stamped HERE via the injected clock
 * (the runner does not emit a `ts`). On a passing result, returns null (the
 * sustained-failure detector reads failures only).
 *
 * Never throws on a missing .design/ tree — mkdir -p the parent defensively and
 * swallow write errors (mirrors event-chain.cjs).
 *
 * EVENT SHAPE:
 *   { event_type:'skill_behavior_failure', scenario, target_skill?, pass:false,
 *     compliance_hits, violation_hits, ts }
 *
 * @param {{ scenario:string, target_skill?:string, pass:boolean,
 *           compliance_hits?:number, violation_hits?:number }} result
 * @param {{ jsonlPath?:string, fs?:typeof import('node:fs'),
 *           now?:() => number|string, repoRoot?:string }} [opts]
 * @returns {object | null} the appended event, or null on a passing result
 */
function recordRun(result, opts) {
  const o = opts || {};
  const fs = o.fs || nodeFs;
  const now = typeof o.now === 'function' ? o.now : () => new Date().toISOString();

  if (!result || typeof result !== 'object') return null;
  // Detector reads FAILURES only — a passing run emits nothing.
  if (result.pass !== false) return null;

  const event = {
    event_type: EVENT_TYPE,
    scenario: result.scenario,
    pass: false,
    compliance_hits: Number.isFinite(result.compliance_hits) ? result.compliance_hits : 0,
    violation_hits: Number.isFinite(result.violation_hits) ? result.violation_hits : 0,
    ts: now(),
  };
  // Preserve target_skill when the runner supplied it (useful for the proposal).
  if (result.target_skill !== undefined) event.target_skill = result.target_skill;

  const jsonlPath = resolveJsonlPath(o);
  try {
    fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
    fs.appendFileSync(jsonlPath, JSON.stringify(event) + '\n', { flag: 'a' });
  } catch (err) {
    // Defensive: telemetry must never crash a run. Mirror event-chain.cjs.
    try {
      process.stderr.write(
        `[skill-behavior-telemetry] write failed: ${err && err.message ? err.message : String(err)}\n`,
      );
    } catch (_e) {
      /* swallow */
    }
  }
  return event;
}

// -------------------------------------------------------------------
// readRuns — tail the JSONL, filter by scenario
// -------------------------------------------------------------------

/**
 * Read the JSONL artifact and return every recorded event for `scenario`, in
 * file order (oldest → newest). Defensive on a missing file: returns []. Invalid
 * JSON lines are skipped.
 *
 * @param {string} scenario
 * @param {{ jsonlPath?:string, fs?:typeof import('node:fs'), repoRoot?:string }} [opts]
 * @returns {Array<object>}
 */
function readRuns(scenario, opts) {
  const o = opts || {};
  const fs = o.fs || nodeFs;
  const jsonlPath = resolveJsonlPath(o);
  if (!fs.existsSync(jsonlPath)) return [];

  let raw;
  try {
    raw = fs.readFileSync(jsonlPath, 'utf8');
  } catch (_e) {
    return [];
  }

  const out = [];
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (_e) {
      continue; // skip malformed line
    }
    if (rec && rec.scenario === scenario) out.push(rec);
  }
  return out;
}

// -------------------------------------------------------------------
// isSustainedFailure — ≥3 of the last 10 runs failed for a scenario (D-07)
// -------------------------------------------------------------------

/**
 * Sustained-failure detector. Considers the LAST 10 runs for `scenario` and
 * returns true iff ≥3 of them failed (D-07). Accepts EITHER an in-memory
 * opts.window (array of `{ pass }` objects — for unit tests) OR reads the
 * on-disk JSONL tail via readRuns().
 *
 * Boundary: 2/10 → false, 3/10 → true; strictly windowed to the last 10 (older
 * failures excluded).
 *
 * Note: recordRun only persists FAILURE events, so the on-disk path counts each
 * recorded row as a failure. The in-memory window path inspects `pass` so tests
 * can mix pass/fail entries to exercise the windowing math precisely.
 *
 * @param {string} scenario
 * @param {{ window?:Array<{pass:boolean}>, jsonlPath?:string,
 *           fs?:typeof import('node:fs'), window_size?:number,
 *           threshold?:number, repoRoot?:string }} [opts]
 * @returns {boolean}
 */
function isSustainedFailure(scenario, opts) {
  const o = opts || {};
  const windowSize = Number.isInteger(o.window_size) && o.window_size > 0 ? o.window_size : SUSTAINED_WINDOW;
  const threshold = Number.isInteger(o.threshold) && o.threshold > 0 ? o.threshold : SUSTAINED_THRESHOLD;

  let runs;
  if (Array.isArray(o.window)) {
    runs = o.window;
  } else {
    runs = readRuns(scenario, o);
  }

  // Strictly the LAST `windowSize` runs.
  const tail = runs.slice(-windowSize);
  // A row counts as a failure when pass === false. On-disk rows are all failures
  // (recordRun only persists pass:false), so a missing `pass` defaults to failed
  // for the disk path; the in-memory window always carries an explicit `pass`.
  const failures = tail.filter((r) => r && r.pass !== true).length;
  return failures >= threshold;
}

// -------------------------------------------------------------------
// maybeProposeReflection — propose-only reflector content-edit draft
// -------------------------------------------------------------------

/**
 * Reflector consumption point (mirrors reflector-kfm-proposer's shouldPropose +
 * proposeKfmDraft idiom): gate on isSustainedFailure(scenario); if NOT sustained
 * return { action:'skipped', reason:'below_sustained_threshold' }; if sustained,
 * write a PROPOSE-ONLY draft under the (injectable) incubator root at
 * <incubatorRoot>/skill-edit-<scenario>/CATALOGUE-ENTRY.md naming the failing
 * scenario/skill + the sustained-failure signal + a TODO for the content edit,
 * and return { action:'drafted', path, slug }.
 *
 * This draft lands in the SAME incubator tree that
 * scripts/lib/apply-reflections/incubator-proposals.cjs surfaces in
 * /hone:apply-reflections — so a maintainer reviews + accepts/rejects the proposed
 * skill edit there. It NEVER auto-edits a skill (Phase 11/29 propose-only SC;
 * Phase 33 out-of-scope).
 *
 * @param {string} scenario
 * @param {{ window?:Array<{pass:boolean}>, jsonlPath?:string,
 *           incubatorRoot?:string, fs?:typeof import('node:fs'),
 *           now?:() => number|string, target_skill?:string,
 *           repoRoot?:string }} [opts]
 * @returns {{ action:'drafted', path:string, slug:string }
 *           | { action:'skipped', reason:string }}
 */
function maybeProposeReflection(scenario, opts) {
  const o = opts || {};
  const fs = o.fs || nodeFs;
  const now = typeof o.now === 'function' ? o.now : () => new Date().toISOString();

  // Stability gate — the ≥3/10 sustained-failure threshold (analogous to the
  // reflector-kfm ≥K gate).
  if (!isSustainedFailure(scenario, o)) {
    return { action: 'skipped', reason: 'below_sustained_threshold' };
  }

  const slug = `${INCUBATOR_PREFIX}${deriveSlug(scenario)}`;
  const incubatorRoot = resolveIncubatorRoot(o);
  const draftDir = path.join(incubatorRoot, slug);
  const draftPath = path.join(draftDir, 'CATALOGUE-ENTRY.md');

  // Best-effort target_skill: prefer an injected hint, else the latest recorded
  // failure event for this scenario (recordRun stamps target_skill).
  let targetSkill = o.target_skill;
  if (!targetSkill && !Array.isArray(o.window)) {
    const recorded = readRuns(scenario, o);
    const last = recorded.length ? recorded[recorded.length - 1] : null;
    if (last && last.target_skill) targetSkill = last.target_skill;
  }

  const body = [
    `# Skill-edit proposal — ${scenario}`,
    '',
    `**Source:** skill-behavior-telemetry (pressure-scenario harness)`,
    `**Failing scenario:** ${scenario}`,
    `**Target skill:** ${targetSkill || 'TODO: <skill that failed under pressure>'}`,
    `**Signal:** sustained failure — ≥${SUSTAINED_THRESHOLD} of the last ${SUSTAINED_WINDOW} runs failed (D-07).`,
    '',
    `Drafted ${now()}. **PROPOSE-ONLY** — review via \`/hone:apply-reflections\`.`,
    'This draft NEVER auto-edits a skill (Phase 11/29 propose-only SC; Phase 33 out-of-scope).',
    '',
    '## Rationalization signal',
    '',
    `The "${scenario}" pressure scenario is failing repeatedly: the target skill is`,
    'not holding under pressure (an agent is rationalizing past its HARD-GATE /',
    'rationalization table). A content edit is proposed to close the loophole.',
    '',
    '## Proposed content edit',
    '',
    `- TODO: identify which rationalization the "${scenario}" scenario exploits.`,
    '- TODO: add / strengthen the counter-rationalization row in the target skill',
    "  (the '| Thought | Reality |' table) OR tighten its <HARD-GATE> wording.",
    '- TODO: re-run `npm run test:behavior` for this scenario to confirm GREEN.',
    '',
  ].join('\n');

  try {
    fs.mkdirSync(draftDir, { recursive: true });
    fs.writeFileSync(draftPath, body);
  } catch (err) {
    // A draft-write failure must not crash the harness; surface as skipped.
    return { action: 'skipped', reason: `draft_write_failed: ${err && err.message ? err.message : String(err)}` };
  }

  return { action: 'drafted', path: draftPath, slug };
}

// -------------------------------------------------------------------
// Exports
// -------------------------------------------------------------------

module.exports = {
  recordRun,
  readRuns,
  isSustainedFailure,
  maybeProposeReflection,
  // Exposed for tests / higher-level integration.
  EVENT_TYPE,
  DEFAULT_JSONL_REL,
  DEFAULT_INCUBATOR_REL,
  SUSTAINED_WINDOW,
  SUSTAINED_THRESHOLD,
  _deriveSlug: deriveSlug,
  _findRepoRoot: findRepoRoot,
};
