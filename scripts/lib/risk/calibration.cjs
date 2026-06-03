'use strict';
/**
 * scripts/lib/risk/calibration.cjs — Phase 56 (CAL-01) per-agent risk
 * calibration + the bandit reward bridge.
 *
 * The risk scorer (scripts/lib/risk/compute-risk.cjs) is a STATIC table-driven
 * model — it cannot learn that a particular writer agent chronically under- or
 * over-scores its own actions. This module is the feedback layer: it records
 * per-agent outcomes in a rolling-50 window, derives three calibration
 * statistics, flags drift, and feeds a reward signal into the Phase 23.5
 * Thompson-sampling bandit (scripts/lib/bandit-router.cjs) so the adaptive
 * router can react to a mis-calibrated agent over time.
 *
 * Persistence:
 *   .design/telemetry/calibration.json
 *     {
 *       schema_version: '56.0',
 *       generated_at:   ISO,
 *       agents: {
 *         "<agent>": {
 *           window: [ { risk, accepted, user_undo, post_apply_correct }, … ≤50 ],
 *           mean_risk_emitted:      number,  // mean(window.risk)
 *           override_rate:          number,  // P(rejected OR undone)
 *           post_apply_correctness: number   // P(correct | applied)
 *         }, …
 *       }
 *     }
 *   Atomic .tmp + rename (mirrors instinct-store.save / ds-arms.save). The
 *   `.design/` tree is gitignored + worktree-local (R5).
 *
 * Purity contract:
 *   - detectDrift + riskReward are PURE (no I/O, no Date.now / Math.random;
 *     the DRIFT thresholds are frozen). Deterministic for the suite.
 *   - updateCalibration reads/writes the FS, but only via the injected
 *     `{root}` (or `file`) so tests run hermetically under a tmpdir. The only
 *     non-determinism is `generated_at` (an ISO stamp), which callers can pin
 *     via opts.now.
 *   - recordRiskOutcome calls bandit-router.update BEST-EFFORT — it never
 *     throws (a telemetry write must never break a hook / agent turn).
 *
 * Zero new dependency. CommonJS to match the scripts/lib/ siblings.
 */

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = '56.0';
const DEFAULT_CALIBRATION_PATH = '.design/telemetry/calibration.json';

/** Rolling window length (CAL-01): keep the last 50 outcomes per agent. */
const WINDOW_SIZE = 50;

/**
 * Drift thresholds (frozen). detectDrift compares the rolling stats against
 * these bands:
 *   under_scoring — the agent emits LOW risk yet the user overrides OFTEN:
 *                   the scores are too tame (false sense of safety).
 *   over_scoring  — the agent emits HIGH risk yet applied actions are almost
 *                   always correct AND the user rarely overrides: the scores
 *                   are too alarmist (friction without payoff).
 */
const DRIFT = Object.freeze({
  under_scoring: Object.freeze({ mean_risk_max: 0.35, override_rate_min: 0.30 }),
  over_scoring: Object.freeze({
    mean_risk_min: 0.65,
    correctness_min: 0.90,
    override_rate_max: 0.10,
  }),
});

/**
 * Clamp to [0, 1]. Non-finite -> 0 (matches compute-risk.clamp01 semantics).
 * @param {number} n
 * @returns {number}
 */
function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Resolve the on-disk calibration file, honouring an absolute override.
 * Accepts `{ file }` (explicit path) or `{ root }` / `{ baseDir }` (a project
 * root under which DEFAULT_CALIBRATION_PATH is resolved).
 * @param {{file?:string, root?:string, baseDir?:string}} [opts]
 * @returns {{file:string, dir:string}}
 */
function paths(opts = {}) {
  let file;
  if (opts.file) {
    file = path.isAbsolute(opts.file)
      ? opts.file
      : path.resolve(opts.root ?? opts.baseDir ?? process.cwd(), opts.file);
  } else {
    file = path.resolve(opts.root ?? opts.baseDir ?? process.cwd(), DEFAULT_CALIBRATION_PATH);
  }
  return { file, dir: path.dirname(file) };
}

/**
 * Load the calibration store, or a fresh envelope when absent/corrupt.
 * @param {{file?:string, root?:string, baseDir?:string}} [opts]
 * @returns {{schema_version:string, generated_at?:string, agents:object}}
 */
function load(opts = {}) {
  const { file } = paths(opts);
  if (!fs.existsSync(file)) {
    return { schema_version: SCHEMA_VERSION, agents: {} };
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || typeof data.agents !== 'object' || data.agents === null) {
      return { schema_version: SCHEMA_VERSION, agents: {} };
    }
    return data;
  } catch {
    return { schema_version: SCHEMA_VERSION, agents: {} };
  }
}

/**
 * Persist the calibration store atomically (.tmp + rename).
 * @param {object} store
 * @param {{file?:string, root?:string, baseDir?:string, now?:string|Date}} [opts]
 * @returns {string} absolute path written
 */
function save(store, opts = {}) {
  const { file, dir } = paths(opts);
  fs.mkdirSync(dir, { recursive: true });
  store.schema_version = SCHEMA_VERSION;
  store.generated_at =
    opts.now instanceof Date
      ? opts.now.toISOString()
      : typeof opts.now === 'string'
        ? opts.now
        : new Date().toISOString();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return file;
}

/**
 * Coerce a raw outcome into the canonical window record. Unknown / missing
 * fields degrade safely:
 *   risk               -> clamp01(number), default 0
 *   accepted           -> boolean (default true — an action that produced an
 *                         outcome without an explicit reject is treated as
 *                         applied)
 *   user_undo          -> boolean (default false)
 *   post_apply_correct -> boolean | null (null = "not yet known"; only counts
 *                         toward post_apply_correctness once resolved)
 * @param {object} record
 * @returns {{risk:number, accepted:boolean, user_undo:boolean, post_apply_correct:(boolean|null)}}
 */
function normalizeRecord(record) {
  const r = record && typeof record === 'object' ? record : {};
  return {
    risk: clamp01(typeof r.risk === 'number' ? r.risk : 0),
    accepted: r.accepted === undefined ? true : Boolean(r.accepted),
    user_undo: Boolean(r.user_undo),
    post_apply_correct:
      r.post_apply_correct === undefined || r.post_apply_correct === null
        ? null
        : Boolean(r.post_apply_correct),
  };
}

/**
 * Recompute the three rolling statistics over a window of normalized records.
 *
 *   mean_risk_emitted      = mean(risk)                           (0 when empty)
 *   override_rate          = P(!accepted OR user_undo)            (0 when empty)
 *   post_apply_correctness = P(post_apply_correct | applied)      (1 when no
 *       resolved applied records — an agent with no known-bad applied actions
 *       reads as fully correct; this is the conservative direction for the
 *       over_scoring drift gate, which additionally requires high mean risk +
 *       low override, so an empty window never spuriously trips it)
 *
 * @param {Array} window  normalized records
 * @returns {{mean_risk_emitted:number, override_rate:number, post_apply_correctness:number}}
 */
function computeStats(window) {
  const w = Array.isArray(window) ? window : [];
  const n = w.length;
  if (n === 0) {
    return { mean_risk_emitted: 0, override_rate: 0, post_apply_correctness: 1 };
  }
  let riskSum = 0;
  let overrides = 0;
  let appliedResolved = 0;
  let appliedCorrect = 0;
  for (const rec of w) {
    riskSum += rec.risk;
    const overridden = !rec.accepted || rec.user_undo;
    if (overridden) overrides += 1;
    // "applied" = accepted AND not undone. Only resolved (non-null) correctness
    // signals count toward the correctness rate.
    const applied = rec.accepted && !rec.user_undo;
    if (applied && rec.post_apply_correct !== null) {
      appliedResolved += 1;
      if (rec.post_apply_correct === true) appliedCorrect += 1;
    }
  }
  return {
    mean_risk_emitted: riskSum / n,
    override_rate: overrides / n,
    post_apply_correctness: appliedResolved === 0 ? 1 : appliedCorrect / appliedResolved,
  };
}

/**
 * Record one risk outcome for `agent`, append to its rolling-50 window, drop
 * the oldest beyond 50, recompute the three statistics, and persist atomically.
 *
 * @param {string} agent   the writer agent the assessment scored (e.g. 'design-fixer')
 * @param {{risk?:number, accepted?:boolean, user_undo?:boolean, post_apply_correct?:boolean}} record
 * @param {{file?:string, root?:string, baseDir?:string, now?:string|Date}} [opts]
 * @returns {{agent:string, stats:{mean_risk_emitted:number, override_rate:number, post_apply_correctness:number}, windowSize:number, path:string}}
 */
function updateCalibration(agent, record, opts = {}) {
  if (typeof agent !== 'string' || agent.length === 0) {
    throw new TypeError('updateCalibration: agent (non-empty string) required');
  }
  const store = load(opts);
  if (!store.agents || typeof store.agents !== 'object') store.agents = {};

  const prev = store.agents[agent];
  const prevWindow =
    prev && Array.isArray(prev.window) ? prev.window.map(normalizeRecord) : [];

  prevWindow.push(normalizeRecord(record));
  // Keep only the last WINDOW_SIZE entries (rolling window).
  const window =
    prevWindow.length > WINDOW_SIZE ? prevWindow.slice(prevWindow.length - WINDOW_SIZE) : prevWindow;

  const stats = computeStats(window);
  store.agents[agent] = {
    window,
    mean_risk_emitted: stats.mean_risk_emitted,
    override_rate: stats.override_rate,
    post_apply_correctness: stats.post_apply_correctness,
  };

  const written = save(store, opts);
  return { agent, stats, windowSize: window.length, path: written };
}

/**
 * Classify calibration drift from an agent's rolling stats. PURE.
 *
 *   under_scoring: mean_risk_emitted < 0.35  &&  override_rate > 0.30
 *   over_scoring:  mean_risk_emitted > 0.65  &&  post_apply_correctness > 0.90
 *                  &&  override_rate < 0.10
 *   else:          'none'
 *
 * under_scoring is checked first; the two bands are mutually exclusive by
 * construction (mean-risk bands do not overlap) but the explicit order makes
 * the contract unambiguous.
 *
 * @param {{mean_risk_emitted?:number, override_rate?:number, post_apply_correctness?:number}} stats
 * @param {object} [cfg]  defaults to the frozen DRIFT thresholds
 * @returns {'under_scoring'|'over_scoring'|'none'}
 */
function detectDrift(stats, cfg = DRIFT) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const mean = typeof s.mean_risk_emitted === 'number' ? s.mean_risk_emitted : 0;
  const override = typeof s.override_rate === 'number' ? s.override_rate : 0;
  const correct = typeof s.post_apply_correctness === 'number' ? s.post_apply_correctness : 0;

  const under = cfg && cfg.under_scoring ? cfg.under_scoring : DRIFT.under_scoring;
  const over = cfg && cfg.over_scoring ? cfg.over_scoring : DRIFT.over_scoring;

  if (mean < under.mean_risk_max && override > under.override_rate_min) {
    return 'under_scoring';
  }
  if (
    mean > over.mean_risk_min &&
    correct > over.correctness_min &&
    override < over.override_rate_max
  ) {
    return 'over_scoring';
  }
  return 'none';
}

/**
 * Map a single risk outcome to a bandit reward in [0, 1]. PURE.
 *
 * Contract (mirrors the Phase 23.5 lexicographic shape — correctness first):
 *   - rejected (accepted === false) OR undone (user_undo === true) -> 0
 *     (the user vetoed the action; no credit regardless of risk).
 *   - otherwise -> clamp01(1 - 0.5 * risk)
 *     (an accepted, not-undone action earns a reward that decays linearly with
 *     the risk it carried: a confident low-risk accept ≈ 1.0; a high-risk
 *     accept still earns partial credit ≈ 0.5 because the user did keep it).
 *
 * Examples (the calibration suite pins these):
 *   {accepted:true,  risk:0.2}                 -> 0.9
 *   {accepted:false, risk:0.2}                 -> 0
 *   {accepted:true,  risk:0.9}                 -> 0.55
 *   {accepted:true,  risk:0.0, user_undo:true} -> 0
 *
 * @param {{accepted?:boolean, risk?:number, user_undo?:boolean}} input
 * @returns {number} reward in [0, 1]
 */
function riskReward(input) {
  const i = input && typeof input === 'object' ? input : {};
  // An explicit reject, or any user_undo, zeroes the reward.
  if (i.accepted === false) return 0;
  if (i.user_undo === true) return 0;
  const risk = clamp01(typeof i.risk === 'number' ? i.risk : 0);
  return clamp01(1 - 0.5 * risk);
}

/**
 * Thin best-effort bridge: compute the risk reward for an outcome and feed it
 * into the Thompson-sampling bandit (scripts/lib/bandit-router.cjs update()).
 *
 * NEVER throws — a telemetry/learning write must not break the hook or agent
 * turn that triggered it. On any failure (bandit module absent, bad input,
 * FS error) it returns `{ recorded:false, reason }` and swallows the error.
 *
 * The bandit's update() needs `(agent, bin, tier, reward)`. The caller supplies
 * the routing context it used (bin = touches-size bin, tier = model tier). When
 * a context field is missing we DO NOT guess — we skip the bandit write and
 * report it, because writing to the wrong arm would corrupt the posterior.
 *
 * @param {{
 *   agent: string,
 *   bin?: string,
 *   tier?: string,
 *   accepted?: boolean,
 *   risk?: number,
 *   user_undo?: boolean,
 *   bandit?: object,            // injectable for tests (defaults to require'd module)
 *   root?: string, baseDir?: string, posteriorPath?: string,
 * }} input
 * @returns {{recorded:boolean, reward:number, reason?:string}}
 */
function recordRiskOutcome(input) {
  const reward = riskReward(input || {});
  try {
    const i = input && typeof input === 'object' ? input : {};
    if (typeof i.agent !== 'string' || i.agent.length === 0) {
      return { recorded: false, reward, reason: 'agent required for bandit update' };
    }
    if (typeof i.bin !== 'string' || i.bin.length === 0 || typeof i.tier !== 'string' || i.tier.length === 0) {
      // Without a routing context we cannot address an arm — skip cleanly.
      return { recorded: false, reward, reason: 'bin+tier required for bandit update' };
    }
    // Lazy require so a missing/breaking bandit module degrades to best-effort.
    const bandit = i.bandit || require('../bandit-router.cjs');
    bandit.update({
      agent: i.agent,
      bin: i.bin,
      tier: i.tier,
      reward,
      baseDir: i.baseDir ?? i.root,
      posteriorPath: i.posteriorPath,
    });
    return { recorded: true, reward };
  } catch (err) {
    return { recorded: false, reward, reason: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  updateCalibration,
  detectDrift,
  riskReward,
  recordRiskOutcome,
  // Exposed for tests + sibling reuse.
  computeStats,
  normalizeRecord,
  load,
  save,
  clamp01,
  DRIFT,
  WINDOW_SIZE,
  SCHEMA_VERSION,
  DEFAULT_CALIBRATION_PATH,
};
