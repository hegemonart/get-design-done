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

const fs = require('node:fs');
const path = require('node:path');

let cachedAppendEvent = null;
let resolutionAttempted = false;

/**
 * Best-effort resolve of the SDK `appendEvent`. On modern Node (≥22.18,
 * which supports `require()` of ESM/`.ts` via type-stripping) this loads
 * the full event-stream writer — giving us bus broadcast + the SDK's
 * truncation/redaction logic for free. On older Node (22.0–22.17), the
 * `.ts` require throws and we fall back to `null`; the inline appender
 * below takes over so `hook.fired` STILL lands on disk.
 *
 * Returns `null` (not a no-op) when unavailable so the caller knows to
 * use the inline path instead of silently dropping the event.
 *
 * @returns {((ev: unknown) => void) | null}
 */
function getAppendEvent() {
  if (resolutionAttempted) return cachedAppendEvent;
  resolutionAttempted = true;
  try {
    // eslint-disable-next-line node/no-missing-require, global-require
    const m = require('../sdk/event-stream/index.ts');
    if (m && typeof m.appendEvent === 'function') {
      cachedAppendEvent = m.appendEvent;
    }
  } catch {
    cachedAppendEvent = null;
  }
  return cachedAppendEvent;
}

// ---------------------------------------------------------------------------
// Inline redaction (best-effort). The SDK writer scrubs secrets at the
// serialize boundary via scripts/lib/redact.cjs. When we take the inline
// append path (older Node), replicate that scrubbing so the fallback never
// leaks secrets that the SDK path would have caught. redact.cjs is plain
// CommonJS, so it loads under any Node version. If unreachable, identity.
// ---------------------------------------------------------------------------

let cachedRedact = null;
let redactResolved = false;

function getRedact() {
  if (redactResolved) return cachedRedact;
  redactResolved = true;
  try {
    // eslint-disable-next-line global-require
    const m = require('../scripts/lib/redact.cjs');
    if (m && typeof m.redact === 'function') cachedRedact = m.redact;
  } catch {
    cachedRedact = null;
  }
  return cachedRedact;
}

/**
 * Resolve the on-disk events.jsonl path the same way the SDK writer does:
 * honor GDD_EVENTS_PATH (absolute path used by tests/E2E to steer the
 * stream), else default to `<cwd>/.design/telemetry/events.jsonl`.
 *
 * @returns {string}
 */
function resolveEventsPath() {
  const envPath = process.env.GDD_EVENTS_PATH;
  if (typeof envPath === 'string' && envPath.length > 0) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(process.cwd(), '.design', 'telemetry', 'events.jsonl');
}

/**
 * Inline append of one event as a JSONL line. Mirrors the SDK
 * EventWriter.append minimal envelope contract: redact → JSON.stringify →
 * appendFileSync with O_APPEND. NEVER throws.
 *
 * @param {Record<string, unknown>} ev
 */
function inlineAppend(ev) {
  try {
    const redact = getRedact();
    const scrubbed = redact ? redact(ev) : ev;
    const dest = resolveEventsPath();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.appendFileSync(dest, JSON.stringify(scrubbed) + '\n', { flag: 'a' });
  } catch {
    /* hooks must never throw on telemetry */
  }
}

/**
 * Persist an arbitrary event envelope. Silent on every failure mode.
 * Uses the SDK writer when loadable (modern Node), else the inline
 * appender (older Node) — so the event ACTUALLY lands on disk on every
 * supported Node version instead of no-op'ing.
 *
 * @param {Record<string, unknown>} ev — must carry at least `type`
 */
function emitEvent(ev) {
  try {
    if (!ev || typeof ev !== 'object') return;
    const appendEvent = getAppendEvent();
    if (appendEvent) {
      appendEvent(ev);
    } else {
      inlineAppend(ev);
    }
  } catch {
    /* hooks must never throw on telemetry */
  }
}

/**
 * Emit a `hook.fired` event. Silent on every failure mode.
 *
 * Happy path actually lands a line in `.design/telemetry/events.jsonl`
 * (or GDD_EVENTS_PATH) on EVERY supported Node version — via the SDK
 * writer when loadable, else via the inline appender.
 *
 * @param {string} hookName
 * @param {string} decision
 * @param {Record<string, unknown>} [extras] — opaque additional payload fields
 */
function emitHookFired(hookName, decision, extras) {
  const payload = { hook: hookName, decision };
  if (extras && typeof extras === 'object') {
    Object.assign(payload, extras);
  }
  emitEvent({
    type: 'hook.fired',
    timestamp: new Date().toISOString(),
    sessionId: process.env.GDD_SESSION_ID || 'hook',
    payload,
  });
}

module.exports = { emitHookFired, emitEvent };
