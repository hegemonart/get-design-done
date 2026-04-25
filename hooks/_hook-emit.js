/**
 * hooks/_hook-emit.js — shared `hook.fired` emitter for Phase 22 wire-in
 * (Plan 22-09).
 *
 * Hooks must NEVER throw on telemetry failure — a broken event stream
 * cannot block a tool call. This helper wraps appendEvent in try/catch
 * and silently swallows.
 *
 * Why a wrapper instead of importing directly:
 *   * Centralizes the try/catch so each hook stays terse.
 *   * Loads the .ts event-stream lazily — hooks invoked via plain `node`
 *     (no --experimental-strip-types) just no-op on telemetry instead
 *     of crashing. The hooks.json registrations vary on whether they
 *     pass --experimental-strip-types, and we don't want to forbid
 *     plain-node invocation paths.
 *   * Single place to add structured event sinks later (e.g. mirror to
 *     CLI transport) without touching every hook file.
 *
 * Usage:
 *   const { emitHookFired } = require('./_hook-emit.js');
 *   // …decision computed…
 *   emitHookFired('budget-enforcer', 'allow');
 */

'use strict';

let cachedAppendEvent = null;
let resolutionAttempted = false;

/**
 * Lazy-resolve `appendEvent` — only loads the event-stream module the
 * first time a hook fires. Falls back to a no-op if the module is not
 * loadable in the current runtime (e.g. plain `node` without
 * --experimental-strip-types).
 *
 * @returns {(ev: unknown) => void}
 */
function getAppendEvent() {
  if (cachedAppendEvent !== null || resolutionAttempted) {
    return cachedAppendEvent || (() => {});
  }
  resolutionAttempted = true;
  try {
    // event-stream/index.ts requires --experimental-strip-types. Try
    // require()'ing — if Node refuses to parse `.ts`, we silently fall
    // back to no-op.
    // eslint-disable-next-line node/no-missing-require, global-require
    cachedAppendEvent = require('../scripts/lib/event-stream/index.ts').appendEvent;
    return cachedAppendEvent;
  } catch {
    cachedAppendEvent = null;
    return () => {};
  }
}

/**
 * Emit a `hook.fired` event. Silent on every failure mode.
 *
 * @param {string} hookName
 * @param {string} decision
 * @param {Record<string, unknown>} [extras] — opaque additional payload fields
 */
function emitHookFired(hookName, decision, extras) {
  try {
    const appendEvent = getAppendEvent();
    const payload = { hook: hookName, decision };
    if (extras && typeof extras === 'object') {
      Object.assign(payload, extras);
    }
    appendEvent({
      type: 'hook.fired',
      timestamp: new Date().toISOString(),
      sessionId: process.env.GDD_SESSION_ID || 'hook',
      payload,
    });
  } catch {
    /* hooks must never throw on telemetry */
  }
}

module.exports = { emitHookFired };
