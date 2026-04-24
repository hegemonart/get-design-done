// scripts/lib/event-stream/types.ts — typed event envelope + pre-registered
// event shapes, per Plan 20-06 (SDK-08).
//
// The event stream is the Phase 20+ observability primitive that every
// downstream consumer (Plan 20-05 MCP tool handlers, Plan 20-13 hooks)
// builds on. A single append-only JSONL file at
// `.design/telemetry/events.jsonl` holds the persisted form; an in-process
// `EventEmitter` bus (see `./emitter.ts`) broadcasts the same events
// live to subscribers within the same Node process.
//
// Envelope invariants (also encoded in `reference/schemas/events.schema.json`):
//   * `type`       — required, string, free-form. Pre-registered subtypes
//                    below are merely the seeded set; unknown types are
//                    allowed (validation is structural, not a closed enum).
//   * `timestamp`  — required, ISO-8601 (`date-time` format).
//   * `sessionId`  — required, stable per GDD pipeline run.
//   * `stage`      — optional, narrow `Stage` union.
//   * `cycle`      — optional, free-form string identifier.
//   * `payload`    — required, opaque object bag.
//   * `_meta`      — optional, writer-injected `{ pid, host, source }`.
//   * `_truncated` — optional, writer-set when a payload exceeds
//                    `maxLineBytes` and has been replaced by a placeholder.
//
// Plan 20-04 owns the error taxonomy that feeds `ErrorEvent.payload`:
// `{ code, message, kind }` mirrors `toToolError(err)` output.

import type { Stage } from '../gdd-state/types.ts';

/** Writer-injected metadata. Never populated by callers. */
export interface EventMeta {
  pid: number;
  host: string;
  /**
   * Free-form identifier for the module that produced the event.
   * Defaults to `"event-stream"` when `appendEvent()` fills the field
   * itself; callers that wrap `appendEvent()` in a module-specific helper
   * should overwrite this before calling.
   */
  source: string;
}

/**
 * Canonical event envelope. All persisted and in-process events share
 * this shape. Concrete subtypes narrow `type` + `payload` but add no
 * additional top-level fields.
 */
export interface BaseEvent {
  type: string;
  timestamp: string;
  sessionId: string;
  stage?: Stage;
  cycle?: string;
  payload: Record<string, unknown>;
  _meta?: EventMeta;
  /**
   * Set to `true` by the writer when the serialized event exceeded
   * `maxLineBytes` and the payload has been replaced with a placeholder.
   * Never set by callers.
   */
  _truncated?: boolean;
}

/**
 * Emitted by Plan 20-05's MCP tool handlers after a successful
 * `mutate()` / `transition()` call. `diff` is an opaque structural
 * description of the change; consumers (Phase 22 dashboard) render it.
 */
export type StateMutationEvent = BaseEvent & {
  type: 'state.mutation';
  payload: { tool: string; diff: unknown };
};

/**
 * Emitted by Plan 20-05 wrapping `transition()`. `pass=false` means
 * the gate blocked the advance; `blockers` carries the same list the
 * transition's `TransitionGateFailed` would expose.
 */
export type StateTransitionEvent = BaseEvent & {
  type: 'state.transition';
  payload: { from: Stage; to: Stage; blockers: string[]; pass: boolean };
};

/** Lifecycle hook emitted when a pipeline stage begins execution. */
export type StageEnteredEvent = BaseEvent & {
  type: 'stage.entered';
  payload: { stage: Stage };
};

/**
 * Lifecycle hook emitted when a pipeline stage finishes. `duration_ms`
 * measures wall-clock time from `stage.entered`. `outcome` mirrors the
 * stage's terminal state.
 */
export type StageExitedEvent = BaseEvent & {
  type: 'stage.exited';
  payload: { stage: Stage; duration_ms: number; outcome: 'pass' | 'fail' | 'halted' };
};

/** Emitted by Plan 20-13 hook consumers when a hook dispatches a decision. */
export type HookFiredEvent = BaseEvent & {
  type: 'hook.fired';
  payload: { hook: string; decision: string };
};

/**
 * Emitted whenever a `GDDError` is surfaced to the user or returned from
 * a tool handler. `kind` mirrors `classify(err).kind`; `code` +
 * `message` mirror the error's `code` + `message`.
 */
export type ErrorEvent = BaseEvent & {
  type: 'error';
  payload: { code: string; message: string; kind: string };
};

/**
 * Union of all pre-registered event types. Not a closed enum at the
 * envelope level — callers can emit unknown types — but downstream
 * consumers use this to drive typed `switch` statements with exhaustive
 * checks for the subset they care about.
 */
export type KnownEvent =
  | StateMutationEvent
  | StateTransitionEvent
  | StageEnteredEvent
  | StageExitedEvent
  | HookFiredEvent
  | ErrorEvent;
