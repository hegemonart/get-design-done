// scripts/lib/bandit-arbitrage.cjs
//
// Plan 27.5-04 — design-reflector bandit-arbitrage analysis (D-10).
//
// Pure function: given a bandit posterior (as produced by
// `bandit-router.cjs`'s `loadPosterior()`) plus a map of each agent's
// declared frontmatter `default-tier:`, surface structured proposals
// when the bandit's measured best-arm tier for an `(agent, bin)` slice
// has drifted from the frontmatter default. This is the "stale
// frontmatter" signal described in Phase 27.5 CONTEXT D-10 — it mirrors
// the cross-runtime `cost-arbitrage.cjs` module from Phase 26-06 so
// `/gdd:apply-reflections` can iterate both arbitrage sources
// homogeneously.
//
// Contract:
//   analyze(posterior, options) → proposals[]
//
// Inputs:
//   * `posterior` — JSON object as returned by
//     `bandit-router.loadPosterior()`:
//       {
//         schema_version: '1.0.0',
//         generated_at: ISO-8601,
//         arms: [
//           { agent, bin, tier, delegate?, alpha, beta, last_used, count },
//           ...
//         ]
//       }
//     Malformed input (non-object, missing `arms`, non-array `arms`) is
//     treated as "no signal" and returns `[]` rather than throwing.
//
//   * `options.frontmatters` — REQUIRED map `{ agent: defaultTier }`.
//     Without this, no stale-frontmatter signal can be computed (we
//     would not know what the current declared default is); analyze()
//     stays silent and returns `[]`. The caller (reflector agent)
//     builds this map by parsing each `agents/*.md`'s frontmatter
//     `default-tier:` value.
//
//   * `options.pullCountThreshold` — minimum total pull count across
//     the slice's tier arms required before any proposal can fire.
//     Default 3 (D-10's "3+ cycles" proxy — early in life the
//     posterior is too thin to disagree with frontmatter).
//
//   * `options.stddevThreshold` — maximum stddev(Beta(α,β)) the best
//     tier may have while still being considered "credible interval
//     narrow enough". Default 0.05 — matches CONTEXT.md research-tail
//     guidance that credible intervals should narrow to ≤0.05 on
//     heavily-used slices within ~50 cycles.
//
//   * `options.deltaPct` — relative delta the best mean must exceed
//     the second-best mean by, before the signal fires. Default 0.5
//     (50%) — matches D-09/D-10's 50% heuristic. Smaller deltas are
//     noise / measurement variance, not actionable drift.
//
//   * `options.delegateFilter` — which delegate slice of the posterior
//     to consider. Default `'none'` (matches both the Phase 23.5 legacy
//     slice where `delegate === undefined` AND Plan 27-07's explicit
//     `delegate === 'none'` slice — both represent the local-call
//     routing slice). Pass `null` to disable filtering entirely.
//     Future: pass a specific peer (`'codex'`, `'gemini'`, …) once
//     peer-side posterior coverage is dense enough to credibly disagree
//     with frontmatter.
//
// Output:
//   Array of structured proposals, each shaped like:
//     {
//       type: 'bandit_arbitrage',
//       agent: 'design-verifier',
//       bin: 'medium',
//       current_frontmatter_tier: 'sonnet',
//       posterior_best_tier: 'opus',
//       posterior_mean:   { haiku: 0.50, sonnet: 0.62, opus: 0.95 },
//       posterior_stddev: { haiku: 0.04, sonnet: 0.03, opus: 0.02 },
//       pull_count: 18,
//       proposal: '<human-readable narrative>',
//       evidence: 'posterior_cred_int_narrow'
//     }
//   Proposals are sorted deterministically by (agent, bin) ascending,
//   matching cost-arbitrage.cjs's discipline — output ordering is
//   stable across runs and platforms for snapshot tests and
//   reproducible reflection files.
//
// Design notes:
//   - The 50% delta + 3+ pulls + stddev<0.05 thresholds are starting
//     heuristics, NOT learned values. Bandit-style learning over which
//     arbitrage proposals were ACTED ON (was the frontmatter updated?
//     did the posterior subsequently match?) is future work; this
//     module's job is to surface measurement signals deterministically.
//   - Single-tier-only slices are silent — no comparison is possible
//     when only one tier has been pulled.
//   - The default `delegateFilter='none'` focuses on the local-call
//     slice. Arbitrage on peer-delegate slices is out of scope for
//     v1.27.5 (CONTEXT D-10 explicitly notes peer-side coverage is
//     still too sparse).
//   - Pure: no I/O, no global state, no `require('fs')` /
//     `require('path')`. Tests inject synthetic posterior objects;
//     production callers (the reflector agent) load the on-disk
//     posterior via `bandit-router.loadPosterior()` and pass the
//     returned object in.

'use strict';

const DEFAULT_PULL_COUNT_THRESHOLD = 3;
const DEFAULT_STDDEV_THRESHOLD = 0.05;
const DEFAULT_DELTA_PCT = 0.5;
const DEFAULT_DELEGATE_FILTER = 'none';
const TIERS = Object.freeze(['haiku', 'sonnet', 'opus']);

/**
 * Posterior mean of Beta(α, β) is α / (α + β). When α + β === 0 (a
 * pathological / impossible arm), return 0 rather than NaN so callers
 * can compare numerically.
 *
 * @param {number} alpha
 * @param {number} beta
 * @returns {number}
 */
function mean(alpha, beta) {
  const sum = alpha + beta;
  if (sum === 0) return 0;
  return alpha / sum;
}

/**
 * Posterior stddev of Beta(α, β) is
 *   sqrt( αβ / ((α+β)² · (α+β+1)) ).
 *
 * Used as the credible-interval-width proxy (CONTEXT D-10 / research
 * tail). When α + β === 0, return 0 rather than NaN.
 *
 * @param {number} alpha
 * @param {number} beta
 * @returns {number}
 */
function stddev(alpha, beta) {
  const sum = alpha + beta;
  if (sum === 0) return 0;
  const variance = (alpha * beta) / (sum * sum * (sum + 1));
  return Math.sqrt(variance);
}

/**
 * Filter an arm list down to a single `(agent, bin, delegate-slice)`
 * slice.
 *
 * delegateFilter semantics:
 *   - `null`                  → no delegate filtering; all arms for
 *                                (agent, bin) are returned.
 *   - `'none'` (the default)  → match arms where `delegate === 'none'`
 *                                OR `delegate === undefined`. The
 *                                latter covers the Phase 23.5 legacy
 *                                slice where the `delegate` field had
 *                                not yet been added — both represent
 *                                the local-call routing slice.
 *   - any other string         → match arms where `delegate ===
 *                                delegateFilter` exactly.
 *
 * @param {object[]} arms
 * @param {string} agent
 * @param {string} bin
 * @param {string|null} delegateFilter
 * @returns {object[]}
 */
function findArmsForSlice(arms, agent, bin, delegateFilter) {
  const filtered = arms.filter((a) => a && a.agent === agent && a.bin === bin);
  if (delegateFilter === null) return filtered;
  if (delegateFilter === 'none') {
    return filtered.filter(
      (a) => a.delegate === undefined || a.delegate === 'none',
    );
  }
  return filtered.filter((a) => a.delegate === delegateFilter);
}

/**
 * Build the proposal sentence. Fixed phrasing keeps test assertions
 * stable across cycles.
 *
 * @param {string} agent
 * @param {string} bin
 * @param {string} currentTier
 * @param {string} bestTier
 * @param {number} meanBest
 * @param {number} meanCurrent
 * @param {number} pullCount
 * @param {number} stddevBest
 * @returns {string}
 */
function buildProposalText(
  agent,
  bin,
  currentTier,
  bestTier,
  meanBest,
  meanCurrent,
  pullCount,
  stddevBest,
) {
  return (
    `${agent} (${bin} bin) frontmatter says ${currentTier} but bandit picks ${bestTier} ` +
    `(posterior mean ${meanBest.toFixed(3)} vs ${meanCurrent.toFixed(3)}, ` +
    `${pullCount} pulls, stddev ${stddevBest.toFixed(3)}) — ` +
    `update frontmatter or add tier_override: ${currentTier} if intentional`
  );
}

/**
 * Resolve options with defaults. Centralised so the analyze() body
 * can stay readable.
 */
function resolveOptions(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const pullCountThreshold =
    typeof opts.pullCountThreshold === 'number' && opts.pullCountThreshold > 0
      ? Math.floor(opts.pullCountThreshold)
      : DEFAULT_PULL_COUNT_THRESHOLD;
  const stddevThreshold =
    typeof opts.stddevThreshold === 'number' && opts.stddevThreshold > 0
      ? opts.stddevThreshold
      : DEFAULT_STDDEV_THRESHOLD;
  const deltaPct =
    typeof opts.deltaPct === 'number' && opts.deltaPct > 0
      ? opts.deltaPct
      : DEFAULT_DELTA_PCT;
  // delegateFilter has three valid shapes: undefined (use default),
  // null (no filtering), or a string (specific delegate slice).
  let delegateFilter;
  if (opts.delegateFilter === null) {
    delegateFilter = null;
  } else if (typeof opts.delegateFilter === 'string' && opts.delegateFilter.length > 0) {
    delegateFilter = opts.delegateFilter;
  } else {
    delegateFilter = DEFAULT_DELEGATE_FILTER;
  }
  const frontmatters =
    opts.frontmatters && typeof opts.frontmatters === 'object'
      ? opts.frontmatters
      : null;
  return {
    pullCountThreshold,
    stddevThreshold,
    deltaPct,
    delegateFilter,
    frontmatters,
  };
}

/**
 * Group arms by `(agent, bin)` key. Returns a Map keyed by
 * `<agent>::<bin>` whose values are arrays of arms in that slice
 * (across all tiers / delegates — `findArmsForSlice` applies the
 * delegate filter downstream).
 */
function groupByAgentBin(arms) {
  /** @type {Map<string, {agent: string, bin: string, arms: object[]}>} */
  const groups = new Map();
  for (const a of arms) {
    if (!a || typeof a !== 'object') continue;
    if (typeof a.agent !== 'string' || a.agent.length === 0) continue;
    if (typeof a.bin !== 'string' || a.bin.length === 0) continue;
    const key = a.agent + '::' + a.bin;
    let group = groups.get(key);
    if (group === undefined) {
      group = { agent: a.agent, bin: a.bin, arms: [] };
      groups.set(key, group);
    }
    group.arms.push(a);
  }
  return groups;
}

/**
 * Main entry point. See module-level header for contract.
 *
 * @param {{schema_version?: string, generated_at?: string, arms?: object[]}} posterior
 * @param {{
 *   frontmatters: Record<string, string>,
 *   pullCountThreshold?: number,
 *   stddevThreshold?: number,
 *   deltaPct?: number,
 *   delegateFilter?: string|null,
 * }} options
 * @returns {object[]}
 */
function analyze(posterior, options) {
  if (!posterior || typeof posterior !== 'object') return [];
  if (!Array.isArray(posterior.arms) || posterior.arms.length === 0) return [];

  const {
    pullCountThreshold,
    stddevThreshold,
    deltaPct,
    delegateFilter,
    frontmatters,
  } = resolveOptions(options);

  // No frontmatters → no stale-frontmatter signal can be computed.
  // Silent rather than emit garbage proposals tagged "unknown current".
  if (frontmatters === null) return [];

  const groups = groupByAgentBin(posterior.arms);

  // Iterate (agent, bin) deterministically (sorted) so output ordering
  // is stable across runs and platforms — matches cost-arbitrage.cjs
  // discipline; useful for snapshot tests and reproducible reflection
  // files.
  const sortedKeys = Array.from(groups.keys()).sort();

  const proposals = [];
  for (const key of sortedKeys) {
    const group = groups.get(key);
    if (group === undefined) continue;
    const { agent, bin } = group;
    const sliceArms = findArmsForSlice(group.arms, agent, bin, delegateFilter);

    // Compute per-tier mean / stddev / count, restricted to the tiers
    // actually present in the slice. The standard tier set is
    // {haiku, sonnet, opus} but we accept any tier names the posterior
    // happens to contain.
    /** @type {Record<string, number>} */
    const meansPerTier = {};
    /** @type {Record<string, number>} */
    const stddevsPerTier = {};
    /** @type {Record<string, number>} */
    const countsPerTier = {};
    let totalPulls = 0;
    for (const arm of sliceArms) {
      if (typeof arm.tier !== 'string' || arm.tier.length === 0) continue;
      const a = typeof arm.alpha === 'number' && Number.isFinite(arm.alpha) ? arm.alpha : 0;
      const b = typeof arm.beta === 'number' && Number.isFinite(arm.beta) ? arm.beta : 0;
      const c = typeof arm.count === 'number' && Number.isFinite(arm.count) ? arm.count : 0;
      meansPerTier[arm.tier] = mean(a, b);
      stddevsPerTier[arm.tier] = stddev(a, b);
      countsPerTier[arm.tier] = c;
      totalPulls += c;
    }

    // Skip if fewer than 2 tiers represented — no comparison possible.
    const tiersPresent = Object.keys(meansPerTier);
    if (tiersPresent.length < 2) continue;

    // Skip if total pulls below threshold (posterior too thin to
    // credibly disagree with frontmatter).
    if (totalPulls < pullCountThreshold) continue;

    // Identify best and second-best tier by posterior mean.
    const sortedByMean = tiersPresent
      .slice()
      .sort((x, y) => meansPerTier[y] - meansPerTier[x]);
    const bestTier = sortedByMean[0];
    const secondTier = sortedByMean[1];
    const bestMean = meansPerTier[bestTier];
    const secondMean = meansPerTier[secondTier];

    // Skip if zero-mean second-best (avoid division-by-zero and
    // misleading Infinity% deltas).
    if (secondMean <= 0) continue;

    const delta = (bestMean - secondMean) / secondMean;
    if (delta < deltaPct) continue;

    // Skip if best-tier credible interval too wide.
    if (stddevsPerTier[bestTier] >= stddevThreshold) continue;

    // Look up frontmatter; silent if missing or already matches best.
    const currentTier = frontmatters[agent];
    if (typeof currentTier !== 'string' || currentTier.length === 0) continue;
    if (currentTier === bestTier) continue;

    // Render posterior means/stddevs across the canonical TIERS set
    // (filling in undefined tiers with 0 for stable proposal shape).
    /** @type {Record<string, number>} */
    const posteriorMean = {};
    /** @type {Record<string, number>} */
    const posteriorStddev = {};
    for (const t of TIERS) {
      posteriorMean[t] = meansPerTier[t] === undefined ? 0 : meansPerTier[t];
      posteriorStddev[t] = stddevsPerTier[t] === undefined ? 0 : stddevsPerTier[t];
    }

    // Use the current frontmatter tier's mean (if present in slice)
    // when building the proposal text; fall back to second-best mean
    // when the frontmatter tier was not pulled at all in the slice.
    const meanCurrent =
      meansPerTier[currentTier] !== undefined ? meansPerTier[currentTier] : secondMean;

    proposals.push({
      type: 'bandit_arbitrage',
      agent,
      bin,
      current_frontmatter_tier: currentTier,
      posterior_best_tier: bestTier,
      posterior_mean: posteriorMean,
      posterior_stddev: posteriorStddev,
      pull_count: totalPulls,
      proposal: buildProposalText(
        agent,
        bin,
        currentTier,
        bestTier,
        bestMean,
        meanCurrent,
        totalPulls,
        stddevsPerTier[bestTier],
      ),
      evidence: 'posterior_cred_int_narrow',
    });
  }

  return proposals;
}

module.exports = {
  analyze,
  mean,
  stddev,
  findArmsForSlice,
  DEFAULT_PULL_COUNT_THRESHOLD,
  DEFAULT_STDDEV_THRESHOLD,
  DEFAULT_DELTA_PCT,
  DEFAULT_DELEGATE_FILTER,
  TIERS,
};
