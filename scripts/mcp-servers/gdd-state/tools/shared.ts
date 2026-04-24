// scripts/mcp-servers/gdd-state/tools/shared.ts
//
// Shared types + helpers for the 11 gdd-state tool handlers (Plan 20-05).
// Every handler returns one of:
//
//   { success: true,  data: <tool-specific> }
//   { success: false, error: { code, message, kind, context? } }
//
// Handlers NEVER throw out to the harness — every catch-all funnels
// through `toToolError()` from `scripts/lib/gdd-errors/classification.ts`.
// This mirrors the invariant in the plan: "Tool errors are returned as
// {success:false, error} — handlers never propagate exceptions."

import {
  ValidationError,
  OperationFailedError,
} from '../../../lib/gdd-errors/index.ts';
import { toToolError } from '../../../lib/gdd-errors/classification.ts';
import type { ToolErrorPayload } from '../../../lib/gdd-errors/classification.ts';
import {
  appendEvent,
  type BaseEvent,
  type StateMutationEvent,
  type StateTransitionEvent,
} from '../../../lib/event-stream/index.ts';
import type { ParsedState, Stage } from '../../../lib/gdd-state/types.ts';

/** Public tool-handler response shape (consistent across all 11 tools). */
export type ToolResponse =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: ToolErrorPayload['error'] };

/**
 * Session-id generator. The MCP server stamps a single session ID per
 * process (via `getSessionId()`) so every event emitted by that server
 * run correlates to a single pipeline session. The generator produces a
 * sortable, opaque string — `gdd-mcp-<iso>-<pid>`.
 */
export function makeSessionId(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  return `gdd-mcp-${iso}-${process.pid}`;
}

let CACHED_SESSION_ID: string | null = null;

/** Return the session id for this process, generating it lazily. */
export function getSessionId(): string {
  if (CACHED_SESSION_ID === null) CACHED_SESSION_ID = makeSessionId();
  return CACHED_SESSION_ID;
}

/**
 * Resolve the target STATE.md path from the environment. Mirrors the
 * plan's contract: `process.env.GDD_STATE_PATH ?? .design/STATE.md`.
 *
 * Resolution is relative to `process.cwd()` when the env override is
 * missing or relative. Tests and the server both call this so the
 * resolution logic stays in one place.
 */
export function resolveStatePath(): string {
  const override = process.env['GDD_STATE_PATH'];
  if (typeof override === 'string' && override.length > 0) return override;
  return '.design/STATE.md';
}

/** Narrow helper: is this a well-known Stage string? */
export function isStageValue(value: unknown): value is Stage {
  return (
    value === 'brief' ||
    value === 'explore' ||
    value === 'plan' ||
    value === 'design' ||
    value === 'verify'
  );
}

/** Narrow helper: does this value look like ParsedState's position.stage shape. */
export function hasStage(state: ParsedState): state is ParsedState {
  return typeof state.position?.stage === 'string';
}

/**
 * Emit a state.mutation event after a successful mutation. Callers pass
 * the mutating tool's `name` and an opaque `diff` describing what changed.
 *
 * The event is persisted to the JSONL stream AND broadcast on the bus —
 * see `scripts/lib/event-stream/index.ts`. `appendEvent()` never throws
 * on I/O (the writer swallows write errors into `writeErrors`), so this
 * helper is safe to call inside a `success: true` return path.
 */
export function emitStateMutation(
  tool: string,
  diff: unknown,
  stateAfter: ParsedState,
): void {
  const stage = isStageValue(stateAfter.position.stage)
    ? stateAfter.position.stage
    : undefined;
  const ev: StateMutationEvent = {
    type: 'state.mutation',
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    ...(stage !== undefined ? { stage } : {}),
    ...(typeof stateAfter.frontmatter.cycle === 'string' &&
    stateAfter.frontmatter.cycle.length > 0
      ? { cycle: stateAfter.frontmatter.cycle }
      : {}),
    payload: { tool, diff },
  };
  appendEvent(ev);
}

/**
 * Emit a state.transition event. Two shapes exist: `pass=true` after a
 * successful advance, and `pass=false` after a gate veto. Both cases are
 * worth recording — gate vetoes are user-visible operational data.
 */
export function emitStateTransition(
  from: Stage,
  to: Stage,
  pass: boolean,
  blockers: string[],
  state: ParsedState | null,
): void {
  const cycle =
    state !== null &&
    typeof state.frontmatter.cycle === 'string' &&
    state.frontmatter.cycle.length > 0
      ? state.frontmatter.cycle
      : undefined;
  const ev: StateTransitionEvent = {
    type: 'state.transition',
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    stage: pass ? to : from,
    ...(cycle !== undefined ? { cycle } : {}),
    payload: { from, to, blockers: [...blockers], pass },
  };
  appendEvent(ev);
}

/**
 * Map an error into a tool-response `{success:false,error}` object.
 * Single entry point for every handler — keeps the error-shape decision
 * in one place and lets us layer extra context (e.g. transition blockers)
 * consistently.
 */
export function errorResponse(err: unknown): ToolResponse {
  const payload = toToolError(err);
  return { success: false, error: payload.error };
}

/**
 * Shorthand for a `{success:true,data}` return with a plain object.
 */
export function okResponse(data: Record<string, unknown>): ToolResponse {
  return { success: true, data };
}

/**
 * Raise a ValidationError whose `message` is human-readable and whose
 * `code` is `VALIDATION_*` — the default error code used across Plan
 * 20-05 for input shape problems. Handlers call this after the JSON
 * Schema check (which catches the big structural issues); this covers
 * invariant checks that the schema cannot express (e.g. "patch contains
 * a forbidden key").
 */
export function throwValidation(
  codeSuffix: string,
  message: string,
  context?: Record<string, unknown>,
): never {
  throw new ValidationError(message, `VALIDATION_${codeSuffix}`, context);
}

/**
 * Raise an OperationFailedError — the caller's input was well-formed,
 * but the requested operation cannot complete in the current state.
 * Example: `resolve_blocker` asked to delete a row that doesn't exist.
 */
export function operationFailed(
  codeSuffix: string,
  message: string,
  context?: Record<string, unknown>,
): never {
  throw new OperationFailedError(
    message,
    `OPERATION_${codeSuffix}`,
    context,
  );
}

/** Re-exports kept local to avoid every handler importing the whole taxonomy. */
export type { BaseEvent };
