'use strict';
/**
 * scripts/lib/risk/override.cjs — PURE helpers for the `/hone:override` skill
 * (Phase 56). Mirrors the unlock-decision precedent (Phase 40): override is the
 * deliberately heavyweight escape hatch from a risk-blocked action or a
 * fact-force gate, and every use is audited.
 *
 * NO I/O, NO Date.now / Math.random. The SKILL.md (and C's fact-force hook) do
 * the actual atomic file write; these functions only shape the data so the
 * routing/override matrix stays unit-testable in isolation.
 *
 * Two modes, one per exported builder:
 *
 *   1. overrideDecisionEntry(findingId, { approver, reason })
 *        -> { text, status, tag } for `mcp__hone_state__add_decision`.
 *      The audit invariant: a recorded approver is mandatory. The `override`
 *      tag is embedded in `text` (the Decision shape is { id, text, status } —
 *      it has no dedicated tags field), so the entry is greppable and the
 *      D-XX it becomes carries the override marker in STATE.md <decisions>.
 *
 *   2. setFactForceChecked(state, path)
 *        -> a NEW session-state object with checked[path] = true.
 *      The fact-force gate (hooks/gdd-fact-force.js) reads this map at
 *      `<cwd>/.design/locks/factforce-<session_id>.json`; once a path is
 *      checked it stops blocking the first mutation of that path.
 *
 * Dependency-free.
 */

const OVERRIDE_TAG = 'override';

/**
 * Build the audited decision entry for a risk-blocked finding override.
 * @param {string} findingId  e.g. "G-12" or a risk finding id
 * @param {object} opts
 * @param {string} opts.approver  REQUIRED non-empty approver name (audit invariant)
 * @param {string} [opts.reason]  optional rationale, recorded verbatim
 * @returns {{ text:string, status:'locked', tag:'override' }}
 * @throws {Error} when approver is missing/empty (override is never silent)
 */
function overrideDecisionEntry(findingId, opts = {}) {
  const id = typeof findingId === 'string' ? findingId.trim() : '';
  const approver = typeof opts.approver === 'string' ? opts.approver.trim() : '';
  const reason = typeof opts.reason === 'string' ? opts.reason.trim() : '';
  if (!id) throw new Error('override: a finding id is required');
  if (!approver) throw new Error('override: --approver is required (audit invariant)');
  // The tag prefix keeps the entry greppable; reason is recorded when present.
  const base = `[${OVERRIDE_TAG}] ${id} risk-blocked action approved by ${approver}`;
  const text = reason ? `${base}. Reason: ${reason}` : base;
  return { text, status: 'locked', tag: OVERRIDE_TAG };
}

/**
 * Mark a path as fact-force-checked in a session-state object. Pure: returns a
 * new object, never mutates the input. A non-object/absent state seeds a fresh
 * one ({ reads:{}, checked:{} }) so the first override on a greenfield session
 * still produces a valid file for the hook to read.
 * @param {object} state  the parsed factforce session state (or null/undefined)
 * @param {string} p      the path to unblock
 * @returns {{ reads:object, checked:object }}
 */
function setFactForceChecked(state, p) {
  const key = typeof p === 'string' ? p.replace(/\\/g, '/').replace(/^\.\//, '') : '';
  if (!key) throw new Error('override: a path is required for factforce mode');
  const src = state && typeof state === 'object' ? state : {};
  const reads = src.reads && typeof src.reads === 'object' ? { ...src.reads } : {};
  const checked = src.checked && typeof src.checked === 'object' ? { ...src.checked } : {};
  checked[key] = true;
  return { ...src, reads, checked };
}

/**
 * isFactForceChecked(state, path) — read-side predicate the gate uses to decide
 * whether a path was overridden. Pure.
 */
function isFactForceChecked(state, p) {
  const key = typeof p === 'string' ? p.replace(/\\/g, '/').replace(/^\.\//, '') : '';
  if (!key || !state || typeof state !== 'object' || !state.checked) return false;
  return state.checked[key] === true;
}

module.exports = {
  overrideDecisionEntry,
  setFactForceChecked,
  isFactForceChecked,
  OVERRIDE_TAG,
};
