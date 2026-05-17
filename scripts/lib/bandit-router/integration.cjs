/**
 * scripts/lib/bandit-router/integration.cjs — Plan 27.5-01
 *
 * Production-integration shim for the Phase 23.5 bandit posterior +
 * Phase 27-07 delegate dimension. Hides the `pull` vs `pullWithDelegate`
 * + `update` vs `updateWithDelegate` choice from callers.
 *
 * Two functions:
 *   consultBandit({agent, bin, delegate, agentFrontmatter, adaptiveMode, baseDir?, posteriorPath?})
 *     → {tier, decision_log}
 *   recordOutcome({agent, bin, delegate, tier, status, costUsd, adaptiveMode, baseDir?, posteriorPath?})
 *     → void (best-effort write per D-04)
 *
 * Routing rules (D-05 + D-07):
 *   1. agentFrontmatter.tier_override is set         → bypass bandit, return tier_override
 *   2. adaptiveMode !== 'full'                       → bandit silent, return frontmatter.default_tier
 *      (covers 'static' and 'hedge' per D-07)
 *   3. adaptiveMode === 'full' && delegate is 'none' / undefined
 *                                                    → call pull()
 *   4. adaptiveMode === 'full' && delegate is a peer name
 *                                                    → call pullWithDelegate({delegates:[delegate]})
 *
 * recordOutcome is symmetric on the adaptive_mode gate:
 *   - non-'full'                                     → no-op
 *   - 'full' && delegate 'none'/undefined            → update()
 *   - 'full' && delegate is a peer                   → updateWithDelegate()
 *
 * Reward function = Phase 23.5's computeReward unchanged (D-08).
 *
 * Posterior writes are best-effort — all throws are swallowed. The
 * shim's job is to plumb the call; telemetry resilience is downstream.
 */

'use strict';

const banditRouter = require('../bandit-router.cjs');
const adaptiveModeLib = require('../adaptive-mode.cjs');

const DELEGATE_NONE = banditRouter.DELEGATE_NONE; // 'none'
const VALID_DELEGATES = banditRouter.DEFAULT_DELEGATES; // ['none','gemini','codex','cursor','copilot','qwen']

/**
 * Validate that `delegate` is either undefined, DELEGATE_NONE, or a
 * member of VALID_DELEGATES. Returns the canonical delegate string
 * (undefined → 'none').
 *
 * @param {string|undefined} delegate
 * @param {string} fnName — for error message context
 * @returns {string}
 */
function resolveDelegate(delegate, fnName) {
  if (delegate === undefined || delegate === null) return DELEGATE_NONE;
  if (typeof delegate !== 'string') {
    throw new TypeError(
      `integration.${fnName}: delegate must be a string when provided, got ${typeof delegate}`,
    );
  }
  if (!VALID_DELEGATES.includes(delegate)) {
    throw new RangeError(
      `integration.${fnName}: unknown delegate '${delegate}'; expected one of ${VALID_DELEGATES.join(',')}`,
    );
  }
  return delegate;
}

/**
 * Resolve the adaptive_mode for a call. If the caller passed it
 * explicitly we use that; otherwise we read it from disk via
 * adaptive-mode.getMode (D-07: single gating surface).
 *
 * @param {string|undefined} adaptiveMode
 * @param {{baseDir?: string}} opts
 * @returns {'static'|'hedge'|'full'}
 */
function resolveAdaptiveMode(adaptiveMode, opts) {
  if (typeof adaptiveMode === 'string' && adaptiveMode.length > 0) {
    return /** @type {'static'|'hedge'|'full'} */ (adaptiveMode);
  }
  return adaptiveModeLib.getMode({ baseDir: opts && opts.baseDir, quiet: true });
}

/**
 * consultBandit — single canonical lookup that returns a tier + a
 * decision_log explaining how the tier was chosen. Five paths:
 *
 *   Path 1 — static mode → frontmatter.default_tier (or 'sonnet' fallback)
 *   Path 2 — tier_override set on frontmatter → bypass bandit
 *   Path 3 — full mode + delegate='none' (or undefined) → pull()
 *   Path 4 — full mode + delegate=<peer> → pullWithDelegate()
 *   Path 5 — hedge mode → frontmatter.default_tier (bandit silent)
 *
 * Path 2 takes precedence over Path 1 / 3 / 4 / 5 (tier_override is the
 * explicit operator override per D-05).
 *
 * @param {{
 *   agent: string,
 *   bin: string,
 *   delegate?: string,
 *   agentFrontmatter?: {tier_override?: string, default_tier?: string},
 *   adaptiveMode?: 'static'|'hedge'|'full',
 *   baseDir?: string,
 *   posteriorPath?: string,
 * }} input
 * @returns {{
 *   tier: string,
 *   decision_log: {
 *     source: 'frontmatter'|'tier_override_bypass'|'bandit_pull'|'bandit_pull_with_delegate',
 *     samples?: object,
 *     delegate?: string,
 *     adaptive_mode: 'static'|'hedge'|'full',
 *     reason?: string,
 *   }
 * }}
 */
function consultBandit(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('integration.consultBandit: input object required');
  }
  if (typeof input.agent !== 'string' || input.agent.length === 0) {
    throw new TypeError('integration.consultBandit: agent (string) required');
  }
  if (typeof input.bin !== 'string' || input.bin.length === 0) {
    throw new TypeError('integration.consultBandit: bin (string) required');
  }

  const agentFrontmatter = input.agentFrontmatter && typeof input.agentFrontmatter === 'object'
    ? input.agentFrontmatter
    : {};
  const adaptiveMode = resolveAdaptiveMode(input.adaptiveMode, input);
  const delegate = resolveDelegate(input.delegate, 'consultBandit');

  // Step 1 — tier_override bypass (D-05). Highest priority; beats both
  // bandit consultation and static/hedge frontmatter.default_tier.
  if (typeof agentFrontmatter.tier_override === 'string' && agentFrontmatter.tier_override.length > 0) {
    return {
      tier: agentFrontmatter.tier_override,
      decision_log: {
        source: 'tier_override_bypass',
        adaptive_mode: adaptiveMode,
        reason: 'frontmatter_tier_override_set',
      },
    };
  }

  // Step 2 — non-full short-circuit (D-07). Static and hedge are both
  // "bandit silent"; frontmatter.default_tier (or 'sonnet' fallback)
  // is authoritative. No posterior read or write.
  if (adaptiveMode !== 'full') {
    const fallbackTier = (typeof agentFrontmatter.default_tier === 'string' && agentFrontmatter.default_tier.length > 0)
      ? agentFrontmatter.default_tier
      : 'sonnet';
    return {
      tier: fallbackTier,
      decision_log: {
        source: 'frontmatter',
        adaptive_mode: adaptiveMode,
        reason: adaptiveMode === 'hedge' ? 'hedge_mode_skips_bandit' : 'static_mode_authoritative',
      },
    };
  }

  // Step 3/4 — full mode → consult the bandit. Choice of pull vs
  // pullWithDelegate is driven by `delegate`:
  //   delegate === 'none' (or undefined → 'none')  → pull()
  //   delegate ∈ {gemini,codex,cursor,copilot,qwen} → pullWithDelegate
  if (delegate === DELEGATE_NONE) {
    const result = banditRouter.pull({
      agent: input.agent,
      bin: input.bin,
      baseDir: input.baseDir,
      posteriorPath: input.posteriorPath,
    });
    return {
      tier: result.tier,
      decision_log: {
        source: 'bandit_pull',
        samples: result.samples,
        delegate: DELEGATE_NONE,
        adaptive_mode: 'full',
      },
    };
  }

  // Path 4 — peer delegate. Constrain the delegate axis to the single
  // requested peer so the bandit samples the (tier × delegate) joint
  // restricted to {delegate}. Same posterior file, same arm shape; the
  // arm's `delegate` field is set so the slice is distinct from local.
  const result = banditRouter.pullWithDelegate({
    agent: input.agent,
    bin: input.bin,
    delegates: [delegate],
    baseDir: input.baseDir,
    posteriorPath: input.posteriorPath,
  });
  return {
    tier: result.tier,
    decision_log: {
      source: 'bandit_pull_with_delegate',
      samples: result.samples,
      delegate: result.delegate,
      adaptive_mode: 'full',
    },
  };
}

/**
 * recordOutcome — post-spawn telemetry update. Computes a reward via
 * computeReward (Phase 23.5 D-08, unchanged) and writes the posterior
 * arm. Best-effort: all errors swallowed so telemetry can never break
 * a session (D-04).
 *
 * No-op when adaptive_mode is not 'full' (D-07).
 *
 * @param {{
 *   agent: string,
 *   bin: string,
 *   delegate?: string,
 *   tier: string,
 *   status: string,
 *   costUsd?: number,
 *   adaptiveMode?: 'static'|'hedge'|'full',
 *   baseDir?: string,
 *   posteriorPath?: string,
 * }} input
 * @returns {void}
 */
function recordOutcome(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('integration.recordOutcome: input object required');
  }
  if (typeof input.agent !== 'string' || input.agent.length === 0) {
    throw new TypeError('integration.recordOutcome: agent (string) required');
  }
  if (typeof input.bin !== 'string' || input.bin.length === 0) {
    throw new TypeError('integration.recordOutcome: bin (string) required');
  }
  if (typeof input.tier !== 'string' || input.tier.length === 0) {
    throw new TypeError('integration.recordOutcome: tier (string) required');
  }
  if (typeof input.status !== 'string') {
    throw new TypeError('integration.recordOutcome: status (string) required');
  }

  const adaptiveMode = resolveAdaptiveMode(input.adaptiveMode, input);

  // D-07 + D-04: posterior is silent in static/hedge. No-op early.
  if (adaptiveMode !== 'full') {
    return undefined;
  }

  const delegate = resolveDelegate(input.delegate, 'recordOutcome');

  // D-08: reward function unchanged. wall_time_ms always 0 per
  // Phase 23.5 / 27.5 — the wall-time tiebreaker is not used at the
  // recordOutcome boundary; correctness + cost are the only signals.
  const reward = banditRouter.computeReward({
    solidify_pass: input.status === 'completed',
    cost_usd: typeof input.costUsd === 'number' ? input.costUsd : 0,
    wall_time_ms: 0,
  });

  // D-04: best-effort write. Swallow ALL exceptions so a broken
  // posterior file never breaks a session.
  try {
    if (delegate === DELEGATE_NONE) {
      banditRouter.update({
        agent: input.agent,
        bin: input.bin,
        tier: input.tier,
        reward,
        baseDir: input.baseDir,
        posteriorPath: input.posteriorPath,
      });
    } else {
      banditRouter.updateWithDelegate({
        agent: input.agent,
        bin: input.bin,
        tier: input.tier,
        delegate,
        reward,
        baseDir: input.baseDir,
        posteriorPath: input.posteriorPath,
      });
    }
  } catch (err) {
    // Live-tail breadcrumb opt-in via env var. Inner try/catch around
    // the stderr write itself keeps the swallow guarantee even when
    // stderr is closed/unavailable.
    if (process.env.GDD_BANDIT_DEBUG === '1') {
      try {
        process.stderr.write(
          '[bandit-integration] recordOutcome swallowed: ' +
            (err && err.message ? err.message : String(err)) +
            '\n',
        );
      } catch {
        /* swallow */
      }
    }
  }

  return undefined;
}

module.exports = {
  consultBandit,
  recordOutcome,
  DELEGATE_NONE,
};
