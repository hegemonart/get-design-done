'use strict';
/**
 * sdk/dashboard/data/risk-surface.cjs — Phase 55 (GDD Dashboard, dep-free).
 *
 * Risk/confidence surfacing helper (CONTEXT.md D-8): the dashboard's Findings
 * pane shows a risk column. Phase 56 will POPULATE `risk_score` / `confidence`
 * / `suggested_action` on events/findings; until then those fields are ABSENT.
 * This helper bridges the gap WITHOUT depending on Phase 56:
 *
 *   - When the fields are PRESENT, it reads them and routes a display color.
 *   - When they are ABSENT (the pre-56 reality), it emits a blank placeholder
 *     row (all null fields + color 'default') so the column renders cleanly and
 *     the migration to Phase 56 needs no UI change — the data simply fills in.
 *
 * PURE + dependency-free + deterministic: no FS, no network, no Date.now /
 * Math.random. Input is an array (or a single item); output is a parallel array
 * (or single item) of surfaced rows. NEVER throws on malformed input — a
 * non-object / null item degrades to the blank placeholder.
 *
 * Surfaced row shape (the dashboard contract):
 *   {
 *     risk_score:       number | null,   // pass-through when a finite number
 *     confidence:       number | null,   // pass-through when a finite number
 *     suggested_action: 'Allow' | 'Review' | 'RequireConfirmation' | 'Block' | null,
 *     color:            'green' | 'yellow' | 'orange' | 'red' | 'default'
 *   }
 *
 * Color route (D-8):
 *   Allow               -> green
 *   Review              -> yellow
 *   RequireConfirmation -> orange
 *   Block               -> red
 *   (absent / unknown)  -> default
 */

/** Canonical action → color map (the only colors the Findings pane uses). */
const ACTION_COLOR = Object.freeze({
  Allow: 'green',
  Review: 'yellow',
  RequireConfirmation: 'orange',
  Block: 'red',
});

/** The set of recognized suggested-action values (Phase 56 vocabulary). */
const VALID_ACTIONS = Object.freeze(Object.keys(ACTION_COLOR));

/** The blank placeholder row emitted pre-56 (or for malformed/absent input). */
function blankRow() {
  return {
    risk_score: null,
    confidence: null,
    suggested_action: null,
    color: 'default',
  };
}

/**
 * Coerce a value to a finite number, or null. (Pass-through for the numeric
 * risk fields — NaN / Infinity / non-numbers degrade to null so the column
 * never renders garbage.)
 * @param {*} v
 * @returns {number|null}
 */
function finiteOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Map a suggested_action to its display color. Unknown / absent -> 'default'.
 * @param {*} action
 * @returns {'green'|'yellow'|'orange'|'red'|'default'}
 */
function colorForAction(action) {
  if (typeof action === 'string' && Object.prototype.hasOwnProperty.call(ACTION_COLOR, action)) {
    return ACTION_COLOR[action];
  }
  return 'default';
}

/**
 * Surface the risk fields on ONE event/finding. Reads `risk_score`,
 * `confidence`, `suggested_action` WHEN PRESENT; otherwise returns the blank
 * placeholder. PURE; NEVER throws.
 *
 * @param {*} item an event or finding (may be missing the risk fields pre-56)
 * @returns {{risk_score:number|null, confidence:number|null,
 *            suggested_action:string|null, color:string}}
 */
function surfaceRiskOne(item) {
  if (!item || typeof item !== 'object') return blankRow();

  const risk_score = finiteOrNull(item.risk_score);
  const confidence = finiteOrNull(item.confidence);
  const rawAction = item.suggested_action;
  const suggested_action =
    typeof rawAction === 'string' && VALID_ACTIONS.includes(rawAction) ? rawAction : null;

  // Pre-56: when NONE of the risk fields are present, emit the blank placeholder
  // verbatim (color 'default') so the column reads as "not yet scored".
  if (risk_score === null && confidence === null && suggested_action === null) {
    return blankRow();
  }

  return {
    risk_score,
    confidence,
    suggested_action,
    color: colorForAction(suggested_action),
  };
}

/**
 * Surface risk across a list of events/findings (or a single item). The output
 * shape mirrors the input arity: an array in -> an array out (parallel,
 * order-preserving); a single object in -> a single surfaced row out. A nullish
 * / non-array, non-object input -> a single blank placeholder. PURE; NEVER
 * throws.
 *
 * @param {*} eventsOrFindings array of items, a single item, or nullish
 * @returns {object|object[]} surfaced row(s)
 */
function surfaceRisk(eventsOrFindings) {
  if (Array.isArray(eventsOrFindings)) {
    return eventsOrFindings.map(surfaceRiskOne);
  }
  return surfaceRiskOne(eventsOrFindings);
}

module.exports = {
  surfaceRisk,
  // Exposed for tests + sibling reuse.
  surfaceRiskOne,
  colorForAction,
  ACTION_COLOR,
  VALID_ACTIONS,
};
