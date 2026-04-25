/**
 * bandit-router.cjs — contextual Thompson-sampling bandit over
 * (agent_type, touches_size_bin) → {haiku, sonnet, opus} (Plan 23.5-01).
 *
 * Replaces Phase 10.1's static tier_overrides map when the user opts
 * into adaptive_mode = "full". The static map continues to apply when
 * adaptive_mode = "static" (default).
 *
 * Posterior persistence:
 *   .design/telemetry/posterior.json
 *     { schema_version: '1.0.0',
 *       generated_at: ISO,
 *       arms: [{agent, bin, tier, alpha, beta, last_used, count}] }
 *
 * Atomic .tmp + rename. Discounted Thompson via per-arm time-decay
 * factor `rho^days_since_last_use` applied at sample time, not stored.
 *
 * Reward computation (D-06): two-stage lexicographic
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

const DEFAULT_PRIORS = Object.freeze({
  decay: DEFAULT_DECAY,
  strength: PRIOR_STRENGTH,
  tiers: DEFAULT_TIERS,
  perTier: TIER_PRIOR,
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
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(posterior, null, 2));
  fs.renameSync(tmp, p);
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

function priorFor(tier, strength) {
  const prior = TIER_PRIOR[tier];
  if (prior === undefined) {
    return { alpha: strength / 2, beta: strength / 2 };
  }
  return {
    alpha: 2 + prior * (strength - 4),
    beta: 2 + (1 - prior) * (strength - 4),
  };
}

function findArm(arms, agent, bin, tier) {
  return arms.find((a) => a.agent === agent && a.bin === bin && a.tier === tier);
}

function ensureArm(posterior, agent, bin, tier, strength) {
  let arm = findArm(posterior.arms, agent, bin, tier);
  if (arm) return arm;
  const { alpha, beta } = priorFor(tier, strength);
  arm = {
    agent,
    bin,
    tier,
    alpha,
    beta,
    last_used: null,
    count: 0,
  };
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
  const { alpha: pa, beta: pb } = priorFor(arm.tier, opts.strength ?? PRIOR_STRENGTH);
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
 * @param {{agent: string, bin: string, tiers?: string[], baseDir?: string, posteriorPath?: string, decay?: number, strength?: number, now?: Date}} input
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
    const arm = ensureArm(posterior, input.agent, input.bin, tier, strength);
    const decayed = decayArm(arm, { decay: input.decay, now, strength });
    const s = sampleBeta(decayed.alpha, decayed.beta);
    samples[tier] = s;
    if (s > bestSample) {
      bestSample = s;
      bestTier = tier;
    }
  }
  // Bump counters on the chosen arm.
  const chosen = ensureArm(posterior, input.agent, input.bin, bestTier, strength);
  chosen.last_used = now.toISOString();
  chosen.count += 1;
  const written = savePosterior(posterior, input);
  return { tier: bestTier, samples, posteriorPath: written };
}

/**
 * Update the posterior with a reward signal. Reward is applied as a
 * Bernoulli observation: success → α += reward, β += (1 - reward).
 *
 * @param {{agent: string, bin: string, tier: string, reward: number, baseDir?: string, posteriorPath?: string, strength?: number}} input
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
  const arm = ensureArm(posterior, input.agent, input.bin, input.tier, input.strength ?? PRIOR_STRENGTH);
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
  TIER_PRIOR,
  PRIOR_STRENGTH,
  TOUCHES_BINS,
  DEFAULT_POSTERIOR_PATH,
  SCHEMA_VERSION,
};
