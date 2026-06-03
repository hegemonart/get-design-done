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

/**
 * Canonical action -> color map. Keys are lowercase (matching the emitter's
 * suggested_action values from events.schema.json: allow/review/
 * require_confirmation/block). The display label is separate from the key so
 * the map can do a single case-insensitive lookup.
 */
const ACTION_COLOR = Object.freeze({
  allow: 'green',
  review: 'yellow',
  require_confirmation: 'orange',
  block: 'red',
});

/** The set of recognized suggested-action values (Phase 56 vocabulary, lowercase). */
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
 * Canonicalize a suggested_action to its lowercase snake_case key for lookup.
 * Handles the emitter's lowercase values (allow/review/require_confirmation/block)
 * AND legacy CamelCase (Allow/Review/RequireConfirmation/Block) - the CamelCase
 * 'RequireConfirmation' lowercases to 'requireconfirmation' with no separator, so
 * map that explicitly to 'require_confirmation'. Returns null for non-strings.
 * @param {*} action
 * @returns {string|null}
 */
function canonAction(action) {
  if (typeof action !== 'string') return null;
  let s = action.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (s === 'requireconfirmation') s = 'require_confirmation';
  return s;
}

/**
 * Map a suggested_action to its display color. Case-insensitive so both
 * 'allow' (emitter) and 'Allow' (legacy) resolve correctly. Unknown / absent -> 'default'.
 * @param {*} action
 * @returns {'green'|'yellow'|'orange'|'red'|'default'}
 */
function colorForAction(action) {
  const canon = canonAction(action);
  if (canon !== null && Object.prototype.hasOwnProperty.call(ACTION_COLOR, canon)) {
    return ACTION_COLOR[canon];
  }
  return 'default';
}

/**
 * Surface the risk fields on ONE event/finding. Accepts either a raw
 * risk_assessment envelope (with a `.payload` sub-object) OR a bare payload
 * object. When `.payload` is present it is used as the source of risk fields;
 * otherwise `item` itself is inspected (bare-payload / legacy path).
 *
 * Reads `risk_score`, `confidence`, `suggested_action` WHEN PRESENT; otherwise
 * returns the blank placeholder. PURE; NEVER throws.
 *
 * @param {*} item an event envelope or bare payload (may be missing risk fields pre-56)
 * @returns {{risk_score:number|null, confidence:number|null,
 *            suggested_action:string|null, color:string}}
 */
function surfaceRiskOne(item) {
  if (!item || typeof item !== 'object') return blankRow();

  // Normalize: if the caller passed a full event envelope (with .payload), use the payload.
  const src = (item.payload && typeof item.payload === 'object') ? item.payload : item;

  const risk_score = finiteOrNull(src.risk_score);
  const confidence = finiteOrNull(src.confidence);
  const rawAction = src.suggested_action;
  const canon = canonAction(rawAction);
  const recognized =
    canon !== null && Object.prototype.hasOwnProperty.call(ACTION_COLOR, canon);
  // Preserve the action VERBATIM when recognized: the emitter sends lowercase
  // (allow/review/require_confirmation/block), legacy callers may send CamelCase,
  // and either is echoed back unchanged. Unrecognized / absent -> null.
  const suggested_action = recognized ? rawAction : null;

  // Pre-56: when NONE of the risk fields are present, emit the blank placeholder
  // verbatim (color 'default') so the column reads as "not yet scored".
  if (risk_score === null && confidence === null && suggested_action === null) {
    return blankRow();
  }

  return {
    risk_score,
    confidence,
    suggested_action,
    color: recognized ? ACTION_COLOR[canon] : 'default',
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
