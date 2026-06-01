'use strict';
// Phase 40 — review-queue.cjs — PURE, dep-free async-review state machine for decisions (SC#7).
//
// Each decision under review lives at .design/reviews/<decision-id>/ and moves through:
//   proposed → reviewing → approved → locked
// `locked` is terminal and HARD: a locked decision cannot be amended. The only way back is an
// explicit, AUDITED unlock (/gdd:unlock-decision <id> --approver <who>), which records who reopened
// it and why. This module is the pure transition core — the skill does the filesystem I/O.
//
// No `require` — pure. Deterministic.

const STATES = Object.freeze(['proposed', 'reviewing', 'approved', 'locked']);

// Allowed forward transitions per state. `locked` has none (terminal — unlock() is the escape hatch).
const TRANSITIONS = Object.freeze({
  proposed: ['reviewing'],
  reviewing: ['approved', 'proposed'], // can bounce back for revision
  approved: ['locked', 'reviewing'],
  locked: [],
});

/** True while a decision may still be edited (before it is locked). */
function canAmend(state) {
  return state === 'proposed' || state === 'reviewing';
}

/**
 * Apply a transition. `event` is the TARGET state.
 * @returns the new state string. Throws on an invalid transition.
 */
function transition(state, event) {
  if (!STATES.includes(state)) throw new Error(`review-queue: unknown state "${state}"`);
  if (!STATES.includes(event)) throw new Error(`review-queue: unknown target "${event}"`);
  const allowed = TRANSITIONS[state];
  if (!allowed.includes(event)) {
    throw new Error(`review-queue: illegal transition ${state} -> ${event} (allowed: ${allowed.join(', ') || 'none'})`);
  }
  return event;
}

/**
 * Explicit audited unlock of a locked decision. Moves locked -> reviewing and returns the new entry
 * with an appended audit record. Requires a non-empty approver. Throws if the entry is not locked.
 * @param {{id, state, audit?: Array}} entry
 * @param {{approver: string, reason?: string}} opts
 */
function unlock(entry, opts) {
  if (!entry || entry.state !== 'locked') {
    throw new Error('review-queue: unlock() requires a locked decision');
  }
  const approver = opts && opts.approver ? String(opts.approver).trim() : '';
  if (!approver) throw new Error('review-queue: unlock() requires an approver');
  const audit = Array.isArray(entry.audit) ? entry.audit.slice() : [];
  audit.push({ action: 'unlock', from: 'locked', to: 'reviewing', approver, reason: (opts && opts.reason) || '' });
  return Object.assign({}, entry, { state: 'reviewing', audit });
}

/** Filter queue entries that still need a human action (not yet locked). */
function pending(entries) {
  if (!Array.isArray(entries)) throw new Error('review-queue: pending() needs an array');
  return entries.filter((e) => e && e.state !== 'locked');
}

module.exports = { STATES, TRANSITIONS, canAmend, transition, unlock, pending };
