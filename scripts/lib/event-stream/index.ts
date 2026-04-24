// scripts/lib/event-stream/index.ts — public API for the Phase 20+
// telemetry stream (Plan 20-06, SDK-08).
//
// Consumers import ONLY from this file. The internal parts
// (`./types.ts`, `./writer.ts`, `./emitter.ts`) are implementation
// detail; changing them without updating this export surface is a
// breaking change for downstream plans (20-05 MCP handlers, 20-13 hooks).
//
// Surface:
//   * appendEvent(ev)          — persist + broadcast one event
//   * getWriter(opts?)         — lazy singleton EventWriter
//   * getBus()                 — lazy singleton EventBus
//   * reset()                  — clear module-level singletons (tests)
//   * types                    — BaseEvent, KnownEvent, and every pre-
//                                registered subtype (StateMutationEvent,
//                                StateTransitionEvent, …).

import { hostname } from 'node:os';

import { EventBus } from './emitter.ts';
import type { Unsubscribe, EventHandler } from './emitter.ts';
import { EventWriter } from './writer.ts';
import type { WriterOptions } from './writer.ts';
import type { BaseEvent, EventMeta } from './types.ts';

export type {
  BaseEvent,
  EventMeta,
  KnownEvent,
  StateMutationEvent,
  StateTransitionEvent,
  StageEnteredEvent,
  StageExitedEvent,
  HookFiredEvent,
  ErrorEvent,
} from './types.ts';
export { EventBus } from './emitter.ts';
export type { EventHandler, Unsubscribe } from './emitter.ts';
export { EventWriter, DEFAULT_EVENTS_PATH, DEFAULT_MAX_LINE_BYTES } from './writer.ts';
export type { WriterOptions } from './writer.ts';

/**
 * Lazily-constructed module-level singletons. `getWriter()` honors the
 * first `opts` it receives; subsequent calls with different options are
 * ignored. Tests that need to vary options across runs should call
 * {@link reset} between runs.
 */
let defaultWriter: EventWriter | null = null;
let defaultBus: EventBus | null = null;
/**
 * Cached host name. `os.hostname()` is cheap but not free (syscall on
 * some platforms) and we stamp it onto every event; compute once.
 */
let cachedHost: string | null = null;

/**
 * Return the module-level default writer, constructing it on first
 * call. Passing `opts` on subsequent calls is a no-op (the first
 * caller wins); that matches the "single shared file per process"
 * intent.
 */
export function getWriter(opts?: WriterOptions): EventWriter {
  if (defaultWriter === null) {
    defaultWriter = new EventWriter(opts ?? {});
  }
  return defaultWriter;
}

/** Return the module-level default bus, constructing it on first call. */
export function getBus(): EventBus {
  if (defaultBus === null) {
    defaultBus = new EventBus();
  }
  return defaultBus;
}

/**
 * Persist `ev` to the on-disk JSONL stream AND broadcast it to the
 * in-process bus. This is the normal emission path for every Phase 20+
 * event producer.
 *
 * Ordering:
 *   1. Stamp `_meta` (pid/host/source) if the caller didn't supply it.
 *   2. Persist via `getWriter().append(ev)` — sync, never throws.
 *   3. Broadcast via `getBus().emit(ev.type, ev)` AND `emit('*', ev)`
 *      so typed subscribers and `subscribeAll` observers both see it.
 *
 * Bus emission can still throw if a subscriber handler throws; we
 * intentionally surface that rather than silently swallowing, since a
 * failing handler is a programming bug, not an expected runtime
 * condition. Plan 20-13's hooks wrap their handler bodies defensively
 * for this reason.
 */
export function appendEvent(ev: BaseEvent): void {
  // Stamp writer-injected metadata if absent. We don't clone the full
  // event — callers typically build it fresh per emission — but we do
  // need to ensure `_meta` is present by the time we persist.
  if (ev._meta === undefined) {
    if (cachedHost === null) {
      try {
        cachedHost = hostname();
      } catch {
        cachedHost = 'unknown';
      }
    }
    const meta: EventMeta = {
      pid: process.pid,
      host: cachedHost,
      source: 'event-stream',
    };
    ev._meta = meta;
  }

  // Persist first. Bus emission is synchronous; if a subscriber throws
  // after we've persisted, the durable record is already safe.
  getWriter().append(ev);

  const bus = getBus();
  bus.emit(ev.type, ev);
  bus.emit('*', ev);
}

/**
 * Reset module-level singletons. Intended for tests that want a fresh
 * writer (e.g. pointed at a new temp directory) or a fresh bus (e.g.
 * to assert isolation between test cases).
 *
 * Safe to call from production code but the intended caller is a test.
 * `appendEvent()` will lazily reconstruct both singletons on the next
 * emission.
 */
export function reset(): void {
  if (defaultBus !== null) {
    defaultBus.removeAllListeners();
  }
  defaultWriter = null;
  defaultBus = null;
}

// Re-export `subscribe`/`subscribeAll` convenience: some callers only
// need to subscribe, not emit, and `getBus().subscribe(…)` reads fine
// but the shorter form keeps consumer code terse.
/** Convenience: subscribe to one event type on the default bus. */
export function subscribe<T extends BaseEvent = BaseEvent>(
  type: T['type'],
  handler: EventHandler<T>,
): Unsubscribe {
  return getBus().subscribe<T>(type, handler);
}

/** Convenience: subscribe to every event on the default bus. */
export function subscribeAll(handler: EventHandler<BaseEvent>): Unsubscribe {
  return getBus().subscribeAll(handler);
}
