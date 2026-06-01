'use strict';
/**
 * scripts/lib/rollout/rollout-status.cjs — Phase 38.5 rollout-state classifier.
 *
 * Pure + dep-free (D-01): zero `require`. Given a NORMALIZED feature-flag state (the
 * rollout-coordinator normalizes LaunchDarkly / Statsig / GrowthBook payloads to this shape),
 * classify the per-cycle rollout state, the deployed percentage, whether a rollout is stuck,
 * and the deployed-weight a `verify_outcome` observation carries into the `design_arms` posterior.
 * Deterministic — same input → same output (hermetic tests, D-07).
 *
 * Normalized flag state:
 *   { stagingEnabled: boolean, prodEnabled: boolean, prodPercent: number (0..100) }
 *
 * Rollout states: 'unrolled' | 'staging-only' | 'canary-N%' | 'prod-100%'
 */

const STUCK_DEFAULT_DAYS = 14; // D-04

function clampPct(n) {
  if (typeof n !== 'number' || !isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** classifyRollout(flagState) → the rollout-state string. */
function classifyRollout(flagState = {}) {
  const stagingEnabled = !!flagState.stagingEnabled;
  const prodEnabled = !!flagState.prodEnabled;
  const pct = clampPct(flagState.prodPercent);
  if (!prodEnabled || pct === 0) {
    return stagingEnabled || prodEnabled ? 'staging-only' : 'unrolled';
  }
  if (pct >= 100) return 'prod-100%';
  return `canary-${pct}%`;
}

/** deployedPct(flagState) → the live production rollout percentage (0 when not in prod). */
function deployedPct(flagState = {}) {
  return flagState.prodEnabled ? clampPct(flagState.prodPercent) : 0;
}

/**
 * isStuck(state, daysSinceChange, threshold=14) — a PARTIAL rollout (staging-only / canary-N%)
 * that has not advanced for >= threshold days. A finished (prod-100%) or never-started (unrolled)
 * rollout is never "stuck".
 */
function isStuck(state, daysSinceChange, threshold = STUCK_DEFAULT_DAYS) {
  if (state === 'prod-100%' || state === 'unrolled') return false;
  const partial = state === 'staging-only' || /^canary-\d+%$/.test(state);
  return partial && typeof daysSinceChange === 'number' && daysSinceChange >= threshold;
}

/**
 * deployedWeight(pct) — the weight a verify_outcome observation carries into design_arms.
 * Linear (D-03): a 10%-rolled variant counts 0.1; 100% counts 1.0. Range [0, 1].
 */
function deployedWeight(pct) {
  return clampPct(pct) / 100;
}

module.exports = { classifyRollout, deployedPct, isStuck, deployedWeight, clampPct, STUCK_DEFAULT_DAYS };
