'use strict';
/**
 * scripts/lib/risk/route.cjs — pure confidence×risk router for the Phase 56
 * gate (the risk sibling of scripts/lib/confidence-route.cjs from Phase 49).
 *
 * Decides what a writer agent (design-fixer Step 2.5) should DO with an action,
 * given (a) the agent's CONFIDENCE in the change [0..1] and (b) the risk
 * scorer's suggested_action ('allow'|'review'|'require_confirmation'|'block').
 *
 * Canonical rule (mirrors the Phase 56 shared contract):
 *   1. action === 'block'                       -> 'override'   (always; block short-circuits)
 *   2. confidence < 0.5                          -> 'skip'       (low-confidence floor; non-block)
 *   3. confidence >= 0.8 && action in {allow,review}        -> 'auto'
 *   4. confidence >= 0.8 && action === 'require_confirmation'-> 'confirm'
 *   5. else (0.5 <= confidence < 0.8, non-block) -> 'confirm'
 *
 * Note the ordering: BLOCK is checked before the low-confidence floor, so a
 * block with low confidence still routes to 'override' (you cannot silently
 * skip a blocked action — it must be explicitly overridden). A non-block action
 * with confidence < 0.5 is skipped.
 *
 * Returns: 'auto' | 'confirm' | 'skip' | 'override'. Dependency-free, no I/O.
 */

const AUTO_FLOOR = 0.8;     // at/above this, low-risk actions auto-apply
const SKIP_FLOOR = 0.5;     // below this, non-block actions are skipped

const AUTO_OK_ACTIONS = new Set(['allow', 'review']);

/**
 * @param {number} confidence  agent confidence in the change, 0.0-1.0
 * @param {string} action      risk suggested_action: allow|review|require_confirmation|block
 * @returns {'auto'|'confirm'|'skip'|'override'}
 */
function route(confidence, action) {
  const a = typeof action === 'string' ? action.trim().toLowerCase() : '';
  // A missing/non-numeric confidence is treated as the lowest tier (0).
  const c = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0;

  // 1. Block short-circuits everything: it must be explicitly overridden,
  //    regardless of confidence.
  if (a === 'block') return 'override';

  // 2. Low-confidence floor (non-block): not worth surfacing — skip.
  if (c < SKIP_FLOOR) return 'skip';

  // 3-4. High confidence: auto-apply low-risk, confirm if confirmation asked.
  if (c >= AUTO_FLOOR) {
    if (AUTO_OK_ACTIONS.has(a)) return 'auto';
    if (a === 'require_confirmation') return 'confirm';
    // Any other (unknown) non-block action at high confidence: be conservative.
    return 'confirm';
  }

  // 5. Mid confidence [0.5, 0.8), non-block: surface for confirmation.
  return 'confirm';
}

module.exports = { route, AUTO_FLOOR, SKIP_FLOOR, AUTO_OK_ACTIONS };
