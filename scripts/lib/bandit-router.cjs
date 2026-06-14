/**
 * bandit-router.cjs — contextual Thompson-sampling bandit over
 * (agent_type, touches_size_bin[, delegate]) → {haiku, sonnet, opus}
 * (Plan 23.5-01 + Plan 27-07 delegate dimension).
 *
 * Replaces Phase 10.1's static tier_overrides map when the user opts
 * into adaptive_mode = "full". The static map continues to apply when
 * adaptive_mode = "static" (default).
 *
 * Posterior persistence:
 *   .design/telemetry/posterior.json
 *     { schema_version: '1.0.0',
 *       generated_at: ISO,
 *       arms: [{agent, bin, tier, delegate?, alpha, beta, last_used, count}] }
 *
 * The `delegate` field on an arm is OPTIONAL (Plan 27-07 / D-08). Existing
 * callers that pass only `(agent, bin)` continue to read/write arms with
 * `delegate === undefined`, which behaves identically to delegate='none'
 * (i.e., the local-call slice). New callers can opt into the delegate
 * dimension via `pullWithDelegate()` / `updateWithDelegate()` which
 * persist `delegate ∈ {none, gemini, codex, cursor, copilot, qwen}`.
 *
 * Bootstrap discipline (D-08):
 *   - delegate='none' arms inherit Phase 23.5's TIER_PRIOR (informed).
 *   - delegate ∈ {gemini, codex, cursor, copilot, qwen} arms start
 *     neutral — the same TIER_PRIOR shape, on the assumption that we
 *     have no prior to favour any delegate over local; data drives.
 *
 * Bootstrap discipline (Phase 29 Plan 06 / CONTEXT D-04):
 *   - Default `prior_class` (omitted or 'default'): existing informed
 *     TIER_PRIOR bootstrap (Phase 23.5) — byte-for-byte unchanged.
 *   - `prior_class: 'promoted_incubator'`: Beta(2, 8) bootstrap for
 *     arms registered when `/hone:apply-reflections accept` promotes
 *     an incubator draft. The conservative prior (posterior mean 0.2)
 *     suppresses preferential selection until ~8-10 successful pulls
 *     accumulate. The bandit-fairness gate IS the promotion staging
 *     mechanism (D-04: no two-step staging/ratify split).
 *   - The `prior_class` value is persisted on the arm so subsequent
 *     reads + decay calculations preserve it (forward-compat).
 *
 * Atomic per-pid-unique .tmp + rename (Phase 59-8 C2: unique tmp name per
 * process so parallel waves never interleave writes on one scratch file).
 * Discounted Thompson via per-arm time-decay
 * factor `rho^days_since_last_use` applied at sample time, not stored.
 *
 * Reward computation (D-06): two-stage lexicographic — UNCHANGED.
 *   if !solidify_pass:           reward = 0
 *   elif user_undo_in_session:   reward = 0
 *   else:                        reward = 1 - lambda * normalize(cost + epsilon * wall_time)
 *
 * No external deps. CommonJS to match scripts/lib/ siblings.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_POSTERIOR_PATH = '.design/telemetry/posterior.json';
const SCHEMA_VERSION = '1.0.0';

// C2 fix (Phase 59-8): monotonic per-process counter for tmp-file naming.
// Combined with process.pid it guarantees that two concurrent writers — even
// within the same process, even firing in the same millisecond — never target
// the same `.tmp` path. The old fixed `p + '.tmp'` name let parallel agent
// waves interleave partial writes on one tmp file, producing truncated JSON
// that loadPosterior() then silently reset to an empty posterior (losing all
// learned arms). Unique tmp + atomic rename makes a half-written file
// invisible to readers: rename is atomic on the same filesystem, so a reader
// sees either the old complete file or the new complete file, never a partial.
let _tmpCounter = 0;

// Decay factor — 60-day half-life.
const DEFAULT_DECAY = 0.988;

// Informed prior strengths per tier (D-03). alpha + beta ≈ 10 → 5–10
// local samples will visibly shift the posterior.
const TIER_PRIOR = Object.freeze({
  haiku: 0.6,
  sonnet: 0.8,
  opus: 0.85,
});

const PRIOR_STRENGTH = 10;
const DEFAULT_TIERS = Object.freeze(['haiku', 'sonnet', 'opus']);

// Phase 29 Plan 06 / CONTEXT D-04. Conservative prior for arms
// bootstrapped via `/hone:apply-reflections accept` (incubator → live
// agent/skill). Beta(2, 8) — posterior mean 0.2 — suppresses
// preferential selection until ~8-10 successful pulls accumulate.
// The bandit-fairness gate IS the staging mechanism (D-04: no
// two-step staging/ratify split).
const PROMOTED_INCUBATOR_PRIOR = Object.freeze({ alpha: 2, beta: 8 });

// Plan 27-07 / D-08. Delegate context dimension. 'none' = local Anthropic
// call; the other 5 are peer-CLI delegations via ACP/ASP. Adding this as
// a third context dimension expands the arm space 6× (78 → ~468 contexts).
const DELEGATE_NONE = 'none';
const DEFAULT_DELEGATES = Object.freeze([
  DELEGATE_NONE,
  'gemini',
  'codex',
  'cursor',
  'copilot',
  'qwen',
]);

const DEFAULT_PRIORS = Object.freeze({
  decay: DEFAULT_DECAY,
  strength: PRIOR_STRENGTH,
  tiers: DEFAULT_TIERS,
  perTier: TIER_PRIOR,
  delegates: DEFAULT_DELEGATES,
});

const TOUCHES_BINS = Object.freeze([
  { name: 'tiny', max: 4 },
  { name: 'small', max: 15 },
  { name: 'medium', max: 50 },
  { name: 'large', max: Infinity },
]);

/**
 * Resolve a touches-size bin from a glob count.
 * @param {number} globCount
 * @returns {string}
 */
function binForGlobCount(globCount) {
  for (const b of TOUCHES_BINS) {
    if (globCount <= b.max) return b.name;
  }
  return 'large';
}

/**
 * Load the posterior file or return a fresh envelope.
 * @param {{baseDir?: string, posteriorPath?: string}} [opts]
 * @returns {{schema_version: string, generated_at: string, arms: object[]}}
 */
function loadPosterior(opts = {}) {
  const p = resolvePath(opts);
  if (!fs.existsSync(p)) {
    return { schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), arms: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(data.arms)) {
      data.arms = [];
    }
    return data;
  } catch {
    // Corrupt-JSON recovery (preserved, Phase 59-8 C2): fall back to an empty
    // posterior. With the per-pid unique-tmp + atomic-rename write discipline
    // (see savePosterior), a reader can no longer observe a half-written file
    // — rename publishes the complete file in one step — so this branch should
    // now only fire on genuine on-disk corruption (e.g. external truncation),
    // not on a write/read race during a parallel agent wave.
    return { schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), arms: [] };
  }
}

function resolvePath(opts = {}) {
  if (opts.posteriorPath) {
    return path.isAbsolute(opts.posteriorPath)
      ? opts.posteriorPath
      : path.resolve(opts.baseDir ?? process.cwd(), opts.posteriorPath);
  }
  return path.resolve(opts.baseDir ?? process.cwd(), DEFAULT_POSTERIOR_PATH);
}

/**
 * Persist the posterior atomically.
 * @param {object} posterior
 * @param {{baseDir?: string, posteriorPath?: string}} [opts]
 * @returns {string} absolute path written
 */
function savePosterior(posterior, opts = {}) {
  const p = resolvePath(opts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  posterior.generated_at = new Date().toISOString();
  // C2 fix (Phase 59-8): per-process-unique tmp name (pid + monotonic
  // counter) so concurrent writers never collide on the same scratch file.
  // The atomic rename then publishes the fully-written file in one step.
  const tmp = `${p}.${process.pid}.${_tmpCounter++}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(posterior, null, 2));
    fs.renameSync(tmp, p);
  } catch (err) {
    // Best-effort cleanup of the orphaned tmp on failure so a crashed
    // write never leaves stale scratch files behind. ENOENT is fine.
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
  return p;
}

/**
 * Reset the posterior — deletes the file. Next call rebootstraps.
 *
 * @param {{baseDir?: string, posteriorPath?: string, reason?: string}} [opts]
 * @returns {{deleted: boolean, path: string, reason?: string}}
 */
function reset(opts = {}) {
  const p = resolvePath(opts);
  const existed = fs.existsSync(p);
  if (existed) fs.unlinkSync(p);
  return { deleted: existed, path: p, reason: opts.reason };
}

/**
 * Compute the bootstrap prior for a freshly-created arm.
 *
 * @param {string} tier
 * @param {number} strength
 * @param {string} [prior_class] — 'default' (existing behaviour, omittable)
 *   or 'promoted_incubator' (Beta(2,8) bootstrap per Phase 29 Plan 06 /
 *   CONTEXT D-04). The promoted-incubator class is tier-independent —
 *   the conservative suppression applies uniformly across haiku/sonnet/
 *   opus until evidence accumulates.
 * @returns {{alpha: number, beta: number}}
 */
function priorFor(tier, strength, prior_class) {
  if (prior_class === 'promoted_incubator') {
    return {
      alpha: PROMOTED_INCUBATOR_PRIOR.alpha,
      beta: PROMOTED_INCUBATOR_PRIOR.beta,
    };
  }
  // Default-path (Phase 23.5) — byte-for-byte unchanged.
  const prior = TIER_PRIOR[tier];
  if (prior === undefined) {
    return { alpha: strength / 2, beta: strength / 2 };
  }
  return {
    alpha: 2 + prior * (strength - 4),
    beta: 2 + (1 - prior) * (strength - 4),
  };
}

/**
 * @param {object[]} arms
 * @param {string} agent
 * @param {string} bin
 * @param {string} tier
 * @param {string} [delegate] — when provided, match arms with that
 *   delegate label. When omitted, match arms with no delegate field
 *   (legacy Phase 23.5 slice — equivalent to delegate='none' for
 *   bootstrap purposes but persisted distinctly to preserve
 *   round-trippability of existing posterior files).
 */
function findArm(arms, agent, bin, tier, delegate) {
  if (delegate === undefined) {
    return arms.find(
      (a) =>
        a.agent === agent &&
        a.bin === bin &&
        a.tier === tier &&
        a.delegate === undefined,
    );
  }
  return arms.find(
    (a) =>
      a.agent === agent &&
      a.bin === bin &&
      a.tier === tier &&
      a.delegate === delegate,
  );
}

/**
 * Ensure an arm exists, creating it with the informed prior when missing.
 *
 * For Plan 27-07: when `delegate` is provided, the arm is persisted with
 * that label. Bootstrap is identical for delegate='none' (inherits Phase
 * 23.5 prior — no migration needed because the legacy slice and the
 * 'none' slice are independent contexts) and for the 5 peer delegates
 * (each starts neutral with the same TIER_PRIOR shape; data drives).
 *
 * For Phase 29 Plan 06: when `prior_class === 'promoted_incubator'`, the
 * bootstrap prior is Beta(2, 8) regardless of tier/delegate (CONTEXT D-04).
 * The `prior_class` is persisted on the arm so re-reads + decay preserve it.
 * If omitted or 'default', no `prior_class` field is added (clean
 * round-trip with existing posterior files — non-breaking change).
 */
function ensureArm(posterior, agent, bin, tier, strength, delegate, prior_class) {
  let arm = findArm(posterior.arms, agent, bin, tier, delegate);
  if (arm) return arm;
  const { alpha, beta } = priorFor(tier, strength, prior_class);
  arm = {
    agent,
    bin,
    tier,
    alpha,
    beta,
    last_used: null,
    count: 0,
  };
  if (delegate !== undefined) {
    arm.delegate = delegate;
  }
  if (prior_class !== undefined && prior_class !== 'default') {
    arm.prior_class = prior_class;
  }
  posterior.arms.push(arm);
  return arm;
}

/**
 * Sample from a Beta(alpha, beta) distribution via the gamma-ratio
 * trick: X = G(alpha, 1) / (G(alpha, 1) + G(beta, 1)).
 *
 * Gamma(k, 1) sampled via Marsaglia-Tsang (k>=1) or
 * Ahrens-Dieter (k<1). For our priors alpha/beta ∈ [2, ~10] so the
 * k>=1 branch dominates.
 *
 * @param {number} alpha
 * @param {number} beta
 * @returns {number}
 */
function sampleBeta(alpha, beta) {
  if (alpha <= 0 || beta <= 0) return 0.5;
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  if (x + y === 0) return 0.5;
  return x / (x + y);
}

// Math.random() is intentional here. Bandit sampling needs uniform
// noise, not cryptographic randomness — using crypto + arithmetic is
// what CodeQL js/biased-cryptographic-random flags. Math.random is
// uniform-enough for Thompson sampling; security is not a concern.
function randn() {
  const u1 = Math.random() || 1e-12; // avoid log(0)
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function rand01() {
  return Math.random();
}

function sampleGamma(k) {
  if (k < 1) {
    const u = rand01();
    return sampleGamma(k + 1) * Math.pow(u, 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // Marsaglia-Tsang.
  // Loop until accepted; bounded iterations for safety.
  for (let i = 0; i < 1000; i++) {
    const x = randn();
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = rand01();
    if (u < 1 - 0.0331 * Math.pow(x, 4)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d; // fallback to mean
}

/**
 * Apply discounted decay to an arm in place. Returns the (alpha, beta)
 * after decay — does NOT persist.
 *
 * @param {object} arm
 * @param {{decay?: number, now?: Date}} [opts]
 * @returns {{alpha: number, beta: number}}
 */
function decayArm(arm, opts = {}) {
  const decay = opts.decay ?? DEFAULT_DECAY;
  const now = opts.now ?? new Date();
  if (!arm.last_used) return { alpha: arm.alpha, beta: arm.beta };
  const lastDate = new Date(arm.last_used);
  const days = Math.max(0, (now.getTime() - lastDate.getTime()) / 86_400_000);
  const factor = Math.pow(decay, days);
  // Decay shrinks both α and β toward the prior. We never go below the
  // initial prior strength — caller can rebuild a fresh prior via reset().
  //
  // C1 fix (Phase 59-8): decay MUST target the SAME prior the arm was
  // bootstrapped with. The arm persists `prior_class` (Phase 29 Plan 06 /
  // D-04), so pass it through to priorFor — otherwise a promoted-incubator
  // arm (Beta(2,8)) would drift back toward the informed TIER_PRIOR while
  // idle, undoing the D-04 preferential-selection suppression. Default-class
  // arms have no `prior_class` field, so `arm.prior_class` is undefined and
  // priorFor falls through to the Phase 23.5 informed prior (byte-for-byte
  // unchanged).
  const { alpha: pa, beta: pb } = priorFor(
    arm.tier,
    opts.strength ?? PRIOR_STRENGTH,
    arm.prior_class,
  );
  return {
    alpha: pa + factor * Math.max(0, arm.alpha - pa),
    beta: pb + factor * Math.max(0, arm.beta - pb),
  };
}

/**
 * Pull an arm — sample each tier's Beta posterior (with decay) and
 * pick the argmax. Persists the chosen arm's `last_used` + `count`
 * counters. Bandit pull does NOT update the success/fail counters —
 * that happens in `update()` once the outcome is known.
 *
 * @param {{agent: string, bin: string, tiers?: string[], baseDir?: string, posteriorPath?: string, decay?: number, strength?: number, now?: Date, prior_class?: string}} input
 *   `prior_class` (optional, Phase 29 Plan 06 / D-04): 'promoted_incubator'
 *   bootstraps fresh arms with Beta(2,8). Omitting it preserves Phase 23.5
 *   informed-prior behaviour (non-breaking).
 * @returns {{tier: string, samples: Record<string, number>, posteriorPath: string}}
 */
function pull(input) {
  if (!input || typeof input.agent !== 'string' || input.agent.length === 0) {
    throw new TypeError('bandit-router.pull: agent (string) required');
  }
  if (typeof input.bin !== 'string' || input.bin.length === 0) {
    throw new TypeError('bandit-router.pull: bin (string) required');
  }
  const tiers = input.tiers ?? DEFAULT_TIERS;
  const strength = input.strength ?? PRIOR_STRENGTH;
  const now = input.now ?? new Date();

  const posterior = loadPosterior(input);
  /** @type {Record<string, number>} */
  const samples = {};
  let bestTier = tiers[0];
  let bestSample = -1;
  for (const tier of tiers) {
    const arm = ensureArm(posterior, input.agent, input.bin, tier, strength, undefined, input.prior_class);
    const decayed = decayArm(arm, { decay: input.decay, now, strength });
    const s = sampleBeta(decayed.alpha, decayed.beta);
    samples[tier] = s;
    if (s > bestSample) {
      bestSample = s;
      bestTier = tier;
    }
  }
  // Bump counters on the chosen arm.
  const chosen = ensureArm(posterior, input.agent, input.bin, bestTier, strength, undefined, input.prior_class);
  chosen.last_used = now.toISOString();
  chosen.count += 1;
  const written = savePosterior(posterior, input);
  return { tier: bestTier, samples, posteriorPath: written };
}

/**
 * Update the posterior with a reward signal. Reward is applied as a
 * Bernoulli observation: success → α += reward, β += (1 - reward).
 *
 * @param {{agent: string, bin: string, tier: string, reward: number, baseDir?: string, posteriorPath?: string, strength?: number, prior_class?: string}} input
 *   `prior_class` (optional, Phase 29 Plan 06 / D-04): 'promoted_incubator'
 *   bootstraps fresh arms with Beta(2,8). Omitting preserves Phase 23.5
 *   informed-prior behaviour (non-breaking). The reward math is unchanged
 *   — `prior_class` only affects bootstrap, not the Bernoulli update.
 * @returns {{alpha: number, beta: number, posteriorPath: string}}
 */
function update(input) {
  if (!input) throw new TypeError('bandit-router.update: input required');
  for (const k of ['agent', 'bin', 'tier']) {
    if (typeof input[k] !== 'string' || input[k].length === 0) {
      throw new TypeError(`bandit-router.update: ${k} (string) required`);
    }
  }
  if (typeof input.reward !== 'number' || Number.isNaN(input.reward)) {
    throw new TypeError('bandit-router.update: reward (number) required');
  }
  // Reward must be in [0, 1].
  const r = Math.min(1, Math.max(0, input.reward));
  const posterior = loadPosterior(input);
  const arm = ensureArm(
    posterior,
    input.agent,
    input.bin,
    input.tier,
    input.strength ?? PRIOR_STRENGTH,
    undefined,
    input.prior_class,
  );
  arm.alpha += r;
  arm.beta += 1 - r;
  const p = savePosterior(posterior, input);
  return { alpha: arm.alpha, beta: arm.beta, posteriorPath: p };
}

/**
 * Pull an arm with the delegate context dimension (Plan 27-07 / D-08).
 *
 * Joint sample over `tiers × delegates` — i.e., 3 × 6 = 18 arms in the
 * default case. Returns the (tier, delegate) pair with the highest
 * sampled posterior. Bumps the chosen arm's last_used + count.
 *
 * Caller-restricted delegate set:
 *   - For `delegate_to: none` agents (Plan 27-06 frontmatter), the caller
 *     should pass `delegates: ['none']` to constrain sampling to the
 *     local-call slice — the bandit will not explore peer delegations.
 *   - For agents without `delegate_to` (default), the caller may either
 *     omit delegates (legacy `pull()` behaviour) or pass DEFAULT_DELEGATES
 *     to enable adaptive routing across the full 18-arm space.
 *
 * @param {{
 *   agent: string,
 *   bin: string,
 *   tiers?: string[],
 *   delegates?: string[],
 *   baseDir?: string,
 *   posteriorPath?: string,
 *   decay?: number,
 *   strength?: number,
 *   now?: Date,
 *   prior_class?: string,
 * }} input
 *   `prior_class` (optional, Phase 29 Plan 06 / D-04): 'promoted_incubator'
 *   bootstraps fresh arms with Beta(2,8). Omitting preserves Phase 23.5 +
 *   Plan 27-07 behaviour (non-breaking).
 * @returns {{
 *   tier: string,
 *   delegate: string,
 *   samples: Record<string, Record<string, number>>,
 *   posteriorPath: string,
 * }}
 */
function pullWithDelegate(input) {
  if (!input || typeof input.agent !== 'string' || input.agent.length === 0) {
    throw new TypeError('bandit-router.pullWithDelegate: agent (string) required');
  }
  if (typeof input.bin !== 'string' || input.bin.length === 0) {
    throw new TypeError('bandit-router.pullWithDelegate: bin (string) required');
  }
  const tiers = input.tiers ?? DEFAULT_TIERS;
  const delegates = input.delegates ?? DEFAULT_DELEGATES;
  if (!Array.isArray(delegates) || delegates.length === 0) {
    throw new TypeError(
      'bandit-router.pullWithDelegate: delegates must be a non-empty array',
    );
  }
  const strength = input.strength ?? PRIOR_STRENGTH;
  const now = input.now ?? new Date();

  const posterior = loadPosterior(input);
  /** @type {Record<string, Record<string, number>>} */
  const samples = {};
  let bestTier = tiers[0];
  let bestDelegate = delegates[0];
  let bestSample = -1;
  for (const delegate of delegates) {
    samples[delegate] = {};
    for (const tier of tiers) {
      const arm = ensureArm(
        posterior,
        input.agent,
        input.bin,
        tier,
        strength,
        delegate,
        input.prior_class,
      );
      const decayed = decayArm(arm, { decay: input.decay, now, strength });
      const s = sampleBeta(decayed.alpha, decayed.beta);
      samples[delegate][tier] = s;
      if (s > bestSample) {
        bestSample = s;
        bestTier = tier;
        bestDelegate = delegate;
      }
    }
  }
  const chosen = ensureArm(
    posterior,
    input.agent,
    input.bin,
    bestTier,
    strength,
    bestDelegate,
    input.prior_class,
  );
  chosen.last_used = now.toISOString();
  chosen.count += 1;
  const written = savePosterior(posterior, input);
  return {
    tier: bestTier,
    delegate: bestDelegate,
    samples,
    posteriorPath: written,
  };
}

/**
 * Update the posterior with a reward signal — delegate-aware variant.
 *
 * Reward signal is UNCHANGED from Phase 23.5 (D-08): two-stage
 * lexicographic via `computeReward()` — correctness first, cost as
 * tiebreaker. The delegate dimension is applied at the arm-locator
 * level, not the reward computation.
 *
 * @param {{
 *   agent: string,
 *   bin: string,
 *   tier: string,
 *   delegate: string,
 *   reward: number,
 *   baseDir?: string,
 *   posteriorPath?: string,
 *   strength?: number,
 *   prior_class?: string,
 * }} input
 *   `prior_class` (optional, Phase 29 Plan 06 / D-04): 'promoted_incubator'
 *   bootstraps fresh arms with Beta(2,8). Omitting preserves Plan 27-07
 *   behaviour (non-breaking). The reward math is unchanged — `prior_class`
 *   only affects bootstrap, not the Bernoulli update.
 * @returns {{alpha: number, beta: number, posteriorPath: string}}
 */
function updateWithDelegate(input) {
  if (!input) throw new TypeError('bandit-router.updateWithDelegate: input required');
  for (const k of ['agent', 'bin', 'tier', 'delegate']) {
    if (typeof input[k] !== 'string' || input[k].length === 0) {
      throw new TypeError(
        `bandit-router.updateWithDelegate: ${k} (string) required`,
      );
    }
  }
  if (typeof input.reward !== 'number' || Number.isNaN(input.reward)) {
    throw new TypeError('bandit-router.updateWithDelegate: reward (number) required');
  }
  const r = Math.min(1, Math.max(0, input.reward));
  const posterior = loadPosterior(input);
  const arm = ensureArm(
    posterior,
    input.agent,
    input.bin,
    input.tier,
    input.strength ?? PRIOR_STRENGTH,
    input.delegate,
    input.prior_class,
  );
  arm.alpha += r;
  arm.beta += 1 - r;
  const p = savePosterior(posterior, input);
  return { alpha: arm.alpha, beta: arm.beta, posteriorPath: p };
}

/**
 * Two-stage lexicographic reward (D-06).
 *
 *   if !solidify_pass: 0
 *   elif user_undo_in_session: 0
 *   else: 1 - lambda * normalize(cost_usd + epsilon * wall_time_ms / 1000)
 *
 * Cost is normalised via the supplied `costNormalizer` (defaults to
 * mapping [0, 5 USD] → [0, 1], capped at 1).
 *
 * @param {{
 *   solidify_pass: boolean,
 *   user_undo_in_session?: boolean,
 *   cost_usd?: number,
 *   wall_time_ms?: number,
 *   lambda?: number,
 *   epsilon?: number,
 *   costNormalizer?: (n: number) => number,
 * }} input
 * @returns {number} reward in [0, 1]
 */
function computeReward(input) {
  if (!input || typeof input !== 'object') return 0;
  if (!input.solidify_pass) return 0;
  if (input.user_undo_in_session === true) return 0;
  const lambda = typeof input.lambda === 'number' ? input.lambda : 0.3;
  const epsilon = typeof input.epsilon === 'number' ? input.epsilon : 0.05;
  const norm =
    typeof input.costNormalizer === 'function'
      ? input.costNormalizer
      : (n) => Math.min(1, Math.max(0, n / 5));
  const wall = (typeof input.wall_time_ms === 'number' ? input.wall_time_ms : 0) / 1000;
  const raw = (typeof input.cost_usd === 'number' ? input.cost_usd : 0) + epsilon * wall;
  const reward = 1 - lambda * norm(raw);
  return Math.min(1, Math.max(0, reward));
}

module.exports = {
  pull,
  update,
  pullWithDelegate,
  updateWithDelegate,
  reset,
  loadPosterior,
  savePosterior,
  computeReward,
  binForGlobCount,
  decayArm,
  sampleBeta,
  priorFor,
  DEFAULT_PRIORS,
  DEFAULT_TIERS,
  DEFAULT_DELEGATES,
  DELEGATE_NONE,
  TIER_PRIOR,
  PRIOR_STRENGTH,
  PROMOTED_INCUBATOR_PRIOR,
  TOUCHES_BINS,
  DEFAULT_POSTERIOR_PATH,
  SCHEMA_VERSION,
};
