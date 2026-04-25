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

// ---------------------------------------------------------------------------
// Phase 22 — pre-registered subtypes expansion (Plan 22-01)
// ---------------------------------------------------------------------------

/** Wave orchestration — Plan 21 parallel-mapper / wave execution. */
export type WaveStartedEvent = BaseEvent & {
  type: 'wave.started';
  payload: { wave: string; plan_count: number };
};
export type WaveCompletedEvent = BaseEvent & {
  type: 'wave.completed';
  payload: { wave: string; duration_ms: number; outcome: 'pass' | 'fail' };
};

/** STATE.md mutation lifecycle (Plan 20-03). */
export type BlockerAddedEvent = BaseEvent & {
  type: 'blocker.added';
  payload: { id: string; summary: string; source: string };
};
export type DecisionAddedEvent = BaseEvent & {
  type: 'decision.added';
  payload: { id: string; summary: string; source: string };
};
export type MustHaveAddedEvent = BaseEvent & {
  type: 'must_have.added';
  payload: { id: string; summary: string; source: string };
};

/** Parallelism decision engine output — Plan 21 explore-parallel-runner. */
export type ParallelismVerdictEvent = BaseEvent & {
  type: 'parallelism.verdict';
  payload: { task_ids: string[]; verdict: 'parallel' | 'sequential'; reason: string };
};

/** Phase 10.1 cost-telemetry event-stream sink. */
export type CostUpdateEvent = BaseEvent & {
  type: 'cost.update';
  payload: { agent: string; tier: string; usd: number; tokens_in: number; tokens_out: number };
};

/** Rate-guard / backoff stream (Plan 20-10, 20-11). */
export type RateLimitEvent = BaseEvent & {
  type: 'rate_limit';
  payload: { provider: string; reset_at: string; remaining: number };
};
export type ApiRetryEvent = BaseEvent & {
  type: 'api.retry';
  payload: { provider: string; attempt: number; delay_ms: number; reason: string };
};

/** Context-window churn; emitted by `hooks/context-exhaustion.ts`. */
export type CompactBoundaryEvent = BaseEvent & {
  type: 'compact.boundary';
  payload: { tokens_before: number; tokens_after: number };
};

/** MCP liveness probe from connection-probe primitive (Plan 22-08). */
export type McpProbeEvent = BaseEvent & {
  type: 'mcp.probe';
  payload: { name: string; status: 'ok' | 'degraded' | 'down'; latency_ms?: number };
};

/** Reflector proposal (Phase 11 post-cycle reflector → event stream). */
export type ReflectionProposedEvent = BaseEvent & {
  type: 'reflection.proposed';
  payload: { kind: string; target_file: string; summary: string };
};

/** Connection state transitions emitted by `connection-probe` (Plan 22-08). */
export type ConnectionStatusChangeEvent = BaseEvent & {
  type: 'connection.status_change';
  payload: { name: string; from: string; to: string };
};

/** Per-tool-call trajectory (Plan 22-03). */
export type ToolCallStartedEvent = BaseEvent & {
  type: 'tool_call.started';
  payload: { tool: string; args_hash: string };
};
export type ToolCallCompletedEvent = BaseEvent & {
  type: 'tool_call.completed';
  payload: {
    tool: string;
    args_hash: string;
    result_hash: string;
    latency_ms: number;
    status: 'ok' | 'error';
  };
};

/** Agent-level lifecycle (Plan 21 pipeline-runner / subagent spawn). */
export type AgentSpawnEvent = BaseEvent & {
  type: 'agent.spawn';
  payload: { agent: string; task_id?: string; tier?: string };
};
export type AgentOutcomeEvent = BaseEvent & {
  type: 'agent.outcome';
  payload: {
    agent: string;
    task_id?: string;
    outcome: 'pass' | 'fail' | 'halted';
    duration_ms: number;
    cost_usd?: number;
  };
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
  | ErrorEvent
  | WaveStartedEvent
  | WaveCompletedEvent
  | BlockerAddedEvent
  | DecisionAddedEvent
  | MustHaveAddedEvent
  | ParallelismVerdictEvent
  | CostUpdateEvent
  | RateLimitEvent
  | ApiRetryEvent
  | CompactBoundaryEvent
  | McpProbeEvent
  | ReflectionProposedEvent
  | ConnectionStatusChangeEvent
  | ToolCallStartedEvent
  | ToolCallCompletedEvent
  | AgentSpawnEvent
  | AgentOutcomeEvent;

/**
 * Runtime list of all pre-registered event `type` strings. Used by the
 * Phase 22 baseline test and the CLI transport's `--list-types`
 * subcommand.
 */
export const KNOWN_EVENT_TYPES: readonly string[] = [
  'state.mutation',
  'state.transition',
  'stage.entered',
  'stage.exited',
  'hook.fired',
  'error',
  'wave.started',
  'wave.completed',
  'blocker.added',
  'decision.added',
  'must_have.added',
  'parallelism.verdict',
  'cost.update',
  'rate_limit',
  'api.retry',
  'compact.boundary',
  'mcp.probe',
  'reflection.proposed',
  'connection.status_change',
  'tool_call.started',
  'tool_call.completed',
  'agent.spawn',
  'agent.outcome',
] as const;
