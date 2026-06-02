'use strict';
/**
 * scripts/lib/confidence-route.cjs — pure routing helper for the reviewer
 * confidence gate (Phase 49). Decides where a single finding/gap goes based on
 * its severity, its `confidence` score (0.0-1.0), and whether the reviewer
 * parked it in the `## Tentative` section.
 *
 * Canonical rule (mirrors reference/reviewer-confidence-gate.md):
 *   - A finding in `## Tentative`            -> 'drop'         (never reaches design-fixer)
 *   - confidence < 0.5                       -> 'drop'         (low-confidence floor; stays tentative)
 *   - HIGH/CRITICAL (BLOCKER|MAJOR) needs    -> 'fix' only when confidence >= 0.8,
 *                                               otherwise 'user-review'
 *   - confidence in [0.5, 0.8)               -> 'user-review'  (surfaced, not auto-fixed)
 *   - confidence >= 0.8                       -> 'fix'
 *
 * Returns one of: 'fix' | 'user-review' | 'drop'. Dependency-free and side
 * effect free so the routing matrix is unit-testable in isolation.
 */

const HIGH_FLOOR = 0.8; // BLOCKER/MAJOR must clear this to auto-fix
const SURFACE_FLOOR = 0.5; // below this a finding is dropped (stays tentative)

// Severity labels that count as HIGH/CRITICAL for the auto-fix floor.
const HIGH_SEVERITIES = new Set(['blocker', 'major', 'high', 'critical']);

function isHighSeverity(severity) {
  if (typeof severity !== 'string') return false;
  return HIGH_SEVERITIES.has(severity.trim().toLowerCase());
}

/**
 * Route a finding/gap.
 * @param {object} finding
 * @param {string} finding.severity   - BLOCKER | MAJOR | MINOR | COSMETIC (case-insensitive).
 * @param {number} finding.confidence - 0.0-1.0 confidence score.
 * @param {boolean} [finding.tentative] - true when the finding sits in `## Tentative`.
 * @returns {'fix'|'user-review'|'drop'}
 */
function route({ severity, confidence, tentative = false } = {}) {
  // 1. Tentative findings never reach the fixer, regardless of score.
  if (tentative === true) return 'drop';

  // 2. A missing/non-numeric confidence is treated as the lowest tier: surface
  //    for user review rather than silently auto-fixing or dropping.
  const c = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0;

  // 3. Low-confidence floor: anything under 0.5 is dropped (stays tentative).
  if (c < SURFACE_FLOOR) return 'drop';

  // 4. HIGH/CRITICAL findings must clear the 0.8 floor to auto-fix; otherwise
  //    they are routed to the user instead of the fixer.
  if (isHighSeverity(severity)) {
    return c >= HIGH_FLOOR ? 'fix' : 'user-review';
  }

  // 5. Lower-severity findings: 0.5-0.8 surfaces for review, >= 0.8 auto-fixes.
  return c >= HIGH_FLOOR ? 'fix' : 'user-review';
}

module.exports = { route, isHighSeverity, HIGH_FLOOR, SURFACE_FLOOR };
