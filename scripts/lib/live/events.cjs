'use strict';
/**
 * scripts/lib/live/events.cjs — Phase 47 (Live Mode) telemetry emitter.
 *
 * /hone:live emits six event types across a session — start, pick, generate, accept,
 * discard, end. This module is the single typed entry point: it validates the `type`
 * against the closed LIVE_EVENT_TYPES allow-list (an unknown live type is a programmer
 * error and is rejected) and appends the event via the in-repo event-chain emitter
 * (scripts/lib/event-chain.cjs), the same write path router_pick uses.
 *
 * The emitted row carries the events.schema.json envelope fields verbatim
 * (type / timestamp / sessionId / payload) so that, projected back to
 * {type, timestamp, sessionId, payload}, it validates against the additive `live_*`
 * seed types in reference/schemas/events.schema.json. `agent` + `outcome` are the
 * chain emitter's two required fields; we set agent='live' and outcome=type.
 *
 * Pure, dependency-free CommonJS:
 *   - NO top-level clock: the timestamp comes from an injectable `now` (default
 *     `Date.now`), so tests are deterministic.
 *   - `baseDir` is injectable (the emitter resolves the chain file relative to it),
 *     so tests write to a temp project and never touch the repo's real stream.
 *
 * Ships in the npm package; requires only the in-repo event-chain emitter.
 */

const { appendChainEvent } = require('../event-chain.cjs');

/** The six Live Mode event types. Closed allow-list — an unknown type is rejected. */
const LIVE_EVENT_TYPES = Object.freeze([
  'live_session_start',
  'live_pick',
  'live_generate',
  'live_accept',
  'live_discard',
  'live_session_end',
]);

const LIVE_EVENT_TYPE_SET = new Set(LIVE_EVENT_TYPES);

/**
 * Emit a Live Mode telemetry event.
 *
 * @param {object} args
 * @param {string} args.projectRoot   Repo root — injected as the emitter `baseDir` so the
 *                                     chain file resolves under it (testable / hermetic).
 * @param {string} args.type          One of LIVE_EVENT_TYPES. Anything else throws.
 * @param {string} args.sessionId     Stable per-session id (correlates the event stream).
 * @param {object} [args.payload]     Free-form, event-specific payload (MVP: opaque object).
 * @param {(() => number)} [args.now] Injectable clock returning epoch ms (default Date.now).
 * @returns {{event_id: string, type: string, timestamp: string, sessionId: string, payload: object}}
 *          The projected envelope (also the shape that validates against events.schema.json).
 */
function emitLiveEvent(args = {}) {
  const { projectRoot, type, sessionId, payload } = args;
  const now = typeof args.now === 'function' ? args.now : Date.now;

  if (!LIVE_EVENT_TYPE_SET.has(type)) {
    throw new Error(
      `emitLiveEvent: unknown live event type "${String(type)}". ` +
        `Expected one of: ${LIVE_EVENT_TYPES.join(', ')}.`,
    );
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('emitLiveEvent: sessionId is required (non-empty string)');
  }

  const timestamp = new Date(now()).toISOString();
  const envelopePayload = payload && typeof payload === 'object' ? payload : {};

  // Mirror the router_pick emit surface: write a chain row carrying the events-schema
  // envelope fields verbatim. agent/outcome are the chain emitter's required fields.
  const event_id = appendChainEvent({
    baseDir: projectRoot,
    agent: 'live',
    outcome: type,
    // Envelope fields preserved verbatim by appendChainEvent (opaque-extras pass-through):
    type,
    timestamp,
    sessionId,
    payload: envelopePayload,
  });

  return { event_id, type, timestamp, sessionId, payload: envelopePayload };
}

module.exports = { emitLiveEvent, LIVE_EVENT_TYPES };
