'use strict';
/**
 * scripts/lib/live/bandit-feed.cjs — Phase 47 (Live Mode) → Phase 38 design-arms bridge.
 *
 * When a user ACCEPTS a generated variant in /hone:live, that acceptance is a weak,
 * dev-time positive signal for the variant's design pattern. We fold it into the Phase 38
 * `design_arms` posterior store as a WON observation — but at a discounted weight
 * (DEV_TIME_WEIGHT = 0.5) because a developer's pick during authoring is advisory until
 * real production A/B + user-research data arrives (Phase 38 D-03: advisory, never
 * directive). The full posterior math + atomic persistence lives in the design-arms
 * store; we only reuse it (variantKey + observe) and never duplicate the Beta math.
 *
 * Pure, dependency-free CommonJS. Persistence + `baseDir`/`armsPath` test-injection are
 * inherited from the store. Ships in the npm package; requires only the in-repo store.
 */

const { variantKey, observe } = require('../ds-arms/design-arms-store.cjs');

/**
 * The dev-time acceptance weight. Half a win — a developer's accept is a discounted,
 * advisory signal (Phase 38 D-03) until production user-outcome data shifts the arm.
 */
const DEV_TIME_WEIGHT = 0.5;

/**
 * Record an accepted Live Mode variant as a discounted WON observation on its design arm.
 *
 * @param {object} args
 * @param {string} args.componentType   The component class (e.g. 'button', 'card').
 * @param {string|object} args.pattern  The variant's design pattern (string or object;
 *                                       hashed to the arm key via the store's variantKey).
 * @param {string} [args.label]         Human-readable arm label, stored on first observe.
 * @param {number} [args.weight]        Override the dev-time weight (defaults to DEV_TIME_WEIGHT).
 * @param {string} [args.projectRoot]   Repo root — forwarded to the store as `baseDir` so the
 *                                       arms file resolves under it (testable / hermetic).
 * @param {string} [args.armsPath]      Explicit arms-file path override (forwarded to the store).
 * @returns {object} The updated arm posterior (as returned by the store's observe()).
 */
function recordAccepted(args = {}) {
  const { componentType, pattern, label, projectRoot, armsPath } = args;
  if (typeof componentType !== 'string' || componentType.length === 0) {
    throw new TypeError('recordAccepted: componentType is required (non-empty string)');
  }
  if (pattern == null) {
    throw new TypeError('recordAccepted: pattern is required');
  }

  const weight = typeof args.weight === 'number' && args.weight > 0 ? args.weight : DEV_TIME_WEIGHT;
  const hash = variantKey(componentType, pattern);

  // Forward store options only when provided so the store keeps its own defaults otherwise.
  const opts = {};
  if (projectRoot) opts.baseDir = projectRoot;
  if (armsPath) opts.armsPath = armsPath;

  return observe(
    componentType,
    hash,
    { won: true, weight, source: 'dev_time', label },
    opts,
  );
}

module.exports = { recordAccepted, DEV_TIME_WEIGHT };
