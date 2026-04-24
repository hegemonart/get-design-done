// scripts/lib/event-stream/emitter.ts — in-process pub-sub for Phase 20+
// telemetry events (Plan 20-06, SDK-08).
//
// Thin wrapper around Node's built-in `EventEmitter`. Two additions over
// the raw primitive:
//
//   1. `subscribe(type, handler)` returns an unsubscribe closure — the
//      standard `on()` / `off()` dance is easy to forget, and our
//      subscribers (hook consumers, Phase 22 transports) need tidy
//      lifecycle management.
//
//   2. `subscribeAll(handler)` lets observability infra (dashboard,
//      log transport) see every event without enumerating known types.
//      We re-emit on a dedicated `'*'` channel so listeners on that
//      channel observe every `emit()`.
//
// Replay semantics:
//   The bus is live-only. Subscribing does NOT deliver historical
//   events from `events.jsonl` — that's a Phase 22 transport concern.

import { EventEmitter } from 'node:events';

import type { BaseEvent } from './types.ts';

/**
 * Default max listeners raised above Node's 10-listener default. Mapper
 * parallelism + multiple hook consumers + a dashboard transport can
 * easily stack above 10; 50 is conservative headroom before Node warns.
 */
export const DEFAULT_MAX_LISTENERS = 50;

/**
 * Typed handler for a specific event subtype. `T extends BaseEvent`
 * means callers can narrow via `subscribe<StateMutationEvent>(…)` and
 * the handler sees the narrowed shape.
 */
export type EventHandler<T extends BaseEvent = BaseEvent> = (ev: T) => void;

/** Unsubscribe closure returned from `subscribe` / `subscribeAll`. */
export type Unsubscribe = () => void;

/**
 * In-process event bus. Extends `EventEmitter` so raw consumers can
 * still call `on()` / `off()` if they need Node-native semantics, but
 * prefer `subscribe` / `subscribeAll` for ergonomic cleanup.
 */
export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(DEFAULT_MAX_LISTENERS);
  }

  /**
   * Subscribe to one specific event type. The handler fires for every
   * subsequent `emit(type, ev)` call where `ev.type === type`. Returns
   * a closure that detaches the listener on invocation.
   *
   * @example
   * const off = bus.subscribe<StateMutationEvent>('state.mutation', (ev) => {
   *   console.log(ev.payload.tool);
   * });
   * // …later
   * off();
   */
  subscribe<T extends BaseEvent = BaseEvent>(
    type: T['type'],
    handler: EventHandler<T>,
  ): Unsubscribe {
    const listener = handler as unknown as (...args: unknown[]) => void;
    this.on(type, listener);
    return () => {
      this.off(type, listener);
    };
  }

  /**
   * Subscribe to *every* event regardless of type. Listeners registered
   * here fire on the special `'*'` channel, which `appendEvent()`
   * re-emits to on every event. Returns an unsubscribe closure.
   */
  subscribeAll(handler: EventHandler<BaseEvent>): Unsubscribe {
    const listener = handler as unknown as (...args: unknown[]) => void;
    this.on('*', listener);
    return () => {
      this.off('*', listener);
    };
  }
}
