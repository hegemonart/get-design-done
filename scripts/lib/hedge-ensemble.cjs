/**
 * hedge-ensemble.cjs — AdaNormalHedge weighted-majority over verifier
 * + checker agents (Plan 23.5-02).
 *
 * Parameter-free: no manual learning rate. Weights self-adapt via
 * the AdaNormalHedge regret-bound trick — η is recomputed each round
 * from cumulative loss variance, eliminating the typical "tune η or
 * suffer" tax.
 *
 * Weights persist at `.design/telemetry/hedge-weights.json` (atomic
 * .tmp + rename). Schema:
 *   { schema_version: '1.0.0',
 *     generated_at: ISO,
 *     pools: { <poolId>: { agents: { <agentId>: {weight, cumLoss, cumLoss2, rounds} } } } }
 *
 * Reused by adaptive_mode = "hedge" or "full" — see Plan 23.5-04.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_WEIGHTS_PATH = '.design/telemetry/hedge-weights.json';
const SCHEMA_VERSION = '1.0.0';
const DEFAULT_VOTE_THRESHOLD = 0.5;

function resolvePath(opts = {}) {
  if (opts.weightsPath) {
    return path.isAbsolute(opts.weightsPath)
      ? opts.weightsPath
      : path.resolve(opts.baseDir ?? process.cwd(), opts.weightsPath);
  }
  return path.resolve(opts.baseDir ?? process.cwd(), DEFAULT_WEIGHTS_PATH);
}

/**
 * @returns {{schema_version: string, generated_at: string, pools: object}}
 */
function loadWeights(opts = {}) {
  const p = resolvePath(opts);
  if (!fs.existsSync(p)) {
    return { schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), pools: {} };
  }
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data.pools || typeof data.pools !== 'object') data.pools = {};
    return data;
  } catch {
    return { schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), pools: {} };
  }
}

function saveWeights(state, opts = {}) {
  const p = resolvePath(opts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  state.generated_at = new Date().toISOString();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, p);
  return p;
}

function ensurePool(state, poolId) {
  if (!state.pools[poolId]) state.pools[poolId] = { agents: {} };
  return state.pools[poolId];
}

function ensureAgent(pool, agentId) {
  if (!pool.agents[agentId]) {
    pool.agents[agentId] = {
      weight: 1, // uniform start; normalised on read
      cumLoss: 0,
      cumLoss2: 0,
      rounds: 0,
    };
  }
  return pool.agents[agentId];
}

/**
 * Apply one round of losses to a pool. losses: Record<agentId, lossInZeroOne>.
 *
 * AdaNormalHedge update (parameter-free):
 *   For each agent i:
 *     R_i        = sum of (mean_loss - loss_i) over rounds  (instantaneous regret)
 *     C_i        = sum of (loss_i - mean_loss)^2            (cumulative loss variance)
 *   Set η_i = sqrt(ln(N) / max(1, C_i))  per-agent learning rate.
 *   weight_i ∝ Phi(R_i, C_i) where Phi is a positive-only potential.
 *
 * Simplification used here: w_i *= exp(-η * loss_i) with η derived
 * from cumulative variance — gives the same regret bound as full
 * AdaNormalHedge for the binary-loss case we care about (verifier
 * pass/fail). Trade off: slightly less tight bound vs the full
 * potential, but no need to plumb regret tracking everywhere.
 *
 * @param {{poolId: string, losses: Record<string, number>, baseDir?: string, weightsPath?: string, eta?: number}} input
 * @returns {{weights: Record<string, number>, weightsPath: string}}
 */
function loss(input) {
  if (!input || typeof input.poolId !== 'string' || input.poolId.length === 0) {
    throw new TypeError('hedge-ensemble.loss: poolId (string) required');
  }
  if (!input.losses || typeof input.losses !== 'object') {
    throw new TypeError('hedge-ensemble.loss: losses (Record<string, number>) required');
  }
  const state = loadWeights(input);
  const pool = ensurePool(state, input.poolId);
  // First, ensure every losing agent exists.
  for (const [agentId, lossVal] of Object.entries(input.losses)) {
    if (typeof lossVal !== 'number' || Number.isNaN(lossVal)) {
      throw new TypeError(`hedge-ensemble.loss: losses.${agentId} must be a number`);
    }
  }
  for (const agentId of Object.keys(input.losses)) {
    ensureAgent(pool, agentId);
  }
  const N = Object.keys(pool.agents).length;
  // Compute mean loss this round (over agents that received a value).
  const lossList = Object.values(input.losses);
  const meanLoss = lossList.length > 0 ? lossList.reduce((a, b) => a + b, 0) / lossList.length : 0;
  // Update each agent's cumulative variance + regret-like signal, then
  // recompute its weight via exp(-η_i * loss_i).
  for (const [agentId, rawLoss] of Object.entries(input.losses)) {
    const lossVal = Math.min(1, Math.max(0, rawLoss));
    const a = pool.agents[agentId];
    const dev = lossVal - meanLoss;
    a.cumLoss += lossVal;
    a.cumLoss2 += dev * dev;
    a.rounds += 1;
    const eta =
      typeof input.eta === 'number'
        ? input.eta
        : Math.sqrt(Math.log(Math.max(2, N)) / Math.max(1, a.cumLoss2));
    a.weight *= Math.exp(-eta * lossVal);
    if (!Number.isFinite(a.weight) || a.weight <= 0) a.weight = 1e-9;
  }
  // Renormalize.
  const total = Object.values(pool.agents).reduce((s, x) => s + x.weight, 0) || 1;
  /** @type {Record<string, number>} */
  const out = {};
  for (const agentId of Object.keys(pool.agents)) {
    pool.agents[agentId].weight /= total;
    out[agentId] = pool.agents[agentId].weight;
  }
  const writtenPath = saveWeights(state, input);
  return { weights: out, weightsPath: writtenPath };
}

/**
 * Compute the weighted-majority verdict for a pool given each agent's
 * binary vote (pass=1, fail=0). Vote passes when the weighted sum
 * exceeds threshold (default 0.5).
 *
 * @param {{poolId: string, votes: Record<string, 0|1|boolean>, threshold?: number, baseDir?: string, weightsPath?: string}} input
 * @returns {{passes: boolean, weighted: number, threshold: number, perAgent: Record<string, {weight: number, vote: number}>}}
 */
function vote(input) {
  if (!input || typeof input.poolId !== 'string') {
    throw new TypeError('hedge-ensemble.vote: poolId required');
  }
  if (!input.votes || typeof input.votes !== 'object') {
    throw new TypeError('hedge-ensemble.vote: votes required');
  }
  const state = loadWeights(input);
  const pool = ensurePool(state, input.poolId);
  const threshold = typeof input.threshold === 'number' ? input.threshold : DEFAULT_VOTE_THRESHOLD;
  let total = 0;
  /** @type {Record<string, {weight: number, vote: number}>} */
  const perAgent = {};
  let weightSum = 0;
  for (const [agentId, raw] of Object.entries(input.votes)) {
    const v = raw === true || raw === 1 ? 1 : 0;
    const a = ensureAgent(pool, agentId);
    perAgent[agentId] = { weight: a.weight, vote: v };
    total += a.weight * v;
    weightSum += a.weight;
  }
  // Normalise the weighted sum against the SUM of voting agents'
  // weights — agents in the pool that didn't vote this round don't
  // dilute the result.
  const weighted = weightSum > 0 ? total / weightSum : 0;
  return { passes: weighted >= threshold, weighted, threshold, perAgent };
}

/**
 * Read current weights for a pool, normalised over the pool's agents.
 *
 * @param {{poolId: string, baseDir?: string, weightsPath?: string}} input
 * @returns {Record<string, number>}
 */
function weights(input) {
  if (!input || typeof input.poolId !== 'string') {
    throw new TypeError('hedge-ensemble.weights: poolId required');
  }
  const state = loadWeights(input);
  const pool = state.pools[input.poolId];
  if (!pool) return {};
  const total = Object.values(pool.agents).reduce((s, x) => s + x.weight, 0);
  /** @type {Record<string, number>} */
  const out = {};
  for (const [k, v] of Object.entries(pool.agents)) {
    out[k] = total > 0 ? v.weight / total : 0;
  }
  return out;
}

module.exports = {
  loss,
  vote,
  weights,
  loadWeights,
  saveWeights,
  DEFAULT_VOTE_THRESHOLD,
  DEFAULT_WEIGHTS_PATH,
  SCHEMA_VERSION,
};
