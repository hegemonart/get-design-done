// sdk/mcp/gdd-state/tools/shared.ts
//
// Shared types + helpers for the 11 gdd-state tool handlers (Plan 20-05).
// Every handler returns one of:
//
//   { success: true,  data: <tool-specific> }
//   { success: false, error: { code, message, kind, context? } }
//
// Handlers NEVER throw out to the harness — every catch-all funnels
// through `toToolError()` from `sdk/errors/classification.ts`.
// This mirrors the invariant in the plan: "Tool errors are returned as
// {success:false, error} — handlers never propagate exceptions."

import path from 'node:path';
import fs from 'node:fs';
import {
  ValidationError,
  OperationFailedError,
} from '../../../errors/index.ts';
import { toToolError } from '../../../errors/classification.ts';
import type { ToolErrorPayload } from '../../../errors/classification.ts';
import {
  appendEvent,
  type BaseEvent,
  type StateMutationEvent,
  type StateTransitionEvent,
} from '../../../event-stream/index.ts';
import type { ParsedState, Stage } from '../../../state/types.ts';

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
 * Resolve the target STATE.md path from the environment, with a
 * PATH-TRAVERSAL guard (Plan 33.5-03, D-08).
 *
 * Resolution: `process.env.GDD_STATE_PATH ?? .design/STATE.md`, resolved
 * relative to `process.cwd()`. The resolved target MUST stay within the
 * project root (cwd) boundary — a relative override containing a `..`
 * escape, or an absolute override pointing outside cwd, is REJECTED with a
 * `VALIDATION_STATE_PATH_ESCAPE` error (it never silently resolves outside).
 * A legitimate operator-set absolute path INSIDE the boundary (e.g. a CI
 * tmp `.design`) is still accepted and normalized. A best-effort symlink
 * check rejects a resolved parent whose realpath escapes the boundary.
 *
 * Tests and the server both call this so the resolution logic stays in one
 * place.
 */
export function resolveStatePath(): string {
  const override = process.env['GDD_STATE_PATH'];
  const raw =
    typeof override === 'string' && override.length > 0
      ? override
      : '.design/STATE.md';

  const root = path.resolve(process.cwd());
  const resolved = path.resolve(root, raw);

  // Reject any target that escapes the project-root boundary. A path is
  // in-boundary iff it equals root or sits beneath `root + sep`.
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(withSep)) {
    throwValidation(
      'STATE_PATH_ESCAPE',
      `GDD_STATE_PATH resolves outside the project boundary: ${raw}`,
      { raw, resolved, root },
    );
  }

  // Best-effort symlink-escape check: if the resolved parent exists and its
  // realpath escapes the boundary, reject. A non-existent path is not yet a
  // symlink risk, so a thrown realpath error is swallowed.
  try {
    const parent = path.dirname(resolved);
    const realParent = fs.realpathSync(parent);
    const realRoot = fs.realpathSync(root);
    const realRootSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
    if (realParent !== realRoot && !realParent.startsWith(realRootSep)) {
      throwValidation(
        'STATE_PATH_ESCAPE',
        `GDD_STATE_PATH parent symlink escapes the project boundary: ${raw}`,
        { raw, resolved, realParent, realRoot },
      );
    }
  } catch (err) {
    // Re-throw our own validation error; swallow fs errors (non-existent path).
    if (err instanceof ValidationError) throw err;
  }

  // Preserve the prior return contract: a bare relative default returns the
  // relative string; an explicit override returns the (validated) resolved path.
  if (typeof override === 'string' && override.length > 0) return resolved;
  return '.design/STATE.md';
}

/**
 * Documented input limits for the gdd-state tools (Plan 33.5-03, D-08).
 * Defends against JSON-bomb / memory-exhaustion inputs. The schema
 * `maxLength` bounds are the declarative twin of MAX_STRING_LEN.
 */
export const MAX_INPUT_BYTES = 64 * 1024; // 64 KiB serialized input cap
export const MAX_STRING_LEN = 8192; // longest single free-form string field
export const MAX_DEPTH = 32; // deepest object/array nesting

interface InputLimitOpts {
  maxInputBytes?: number;
  maxStringLen?: number;
  maxDepth?: number;
}

/**
 * Reject oversized / pathologically deep tool inputs BEFORE processing
 * (Plan 33.5-03, D-08). Throws a `VALIDATION_INPUT_*` error on breach:
 *   - INPUT_TOO_LARGE   — serialized JSON byte-size exceeds the cap
 *   - INPUT_FIELD_TOO_LARGE — a single string field exceeds MAX_STRING_LEN
 *   - INPUT_TOO_DEEP    — object/array nesting exceeds MAX_DEPTH
 * Handlers call this on their raw input; it is also unit-tested directly.
 */
export function assertInputWithinLimits(
  input: unknown,
  opts?: InputLimitOpts,
): void {
  const maxBytes = opts?.maxInputBytes ?? MAX_INPUT_BYTES;
  const maxStr = opts?.maxStringLen ?? MAX_STRING_LEN;
  const maxDepth = opts?.maxDepth ?? MAX_DEPTH;

  // Walk first so a deep/long field is caught even on huge inputs, bounding
  // the depth so the walk itself cannot be turned into the attack.
  const walk = (node: unknown, depth: number): void => {
    if (depth > maxDepth) {
      throwValidation(
        'INPUT_TOO_DEEP',
        `Input nesting exceeds the maximum depth of ${maxDepth}`,
        { maxDepth },
      );
    }
    if (typeof node === 'string') {
      if (node.length > maxStr) {
        throwValidation(
          'INPUT_FIELD_TOO_LARGE',
          `A string field exceeds the maximum length of ${maxStr}`,
          { maxStringLen: maxStr, length: node.length },
        );
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const value of Object.values(node as Record<string, unknown>)) {
        walk(value, depth + 1);
      }
    }
  };
  walk(input, 0);

  // Total serialized byte-size cap (JSON-bomb guard). Guard against a circular
  // structure — JSON.stringify would throw; treat that as a rejectable input.
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(input) ?? '');
  } catch {
    throwValidation('INPUT_TOO_LARGE', 'Input is not serializable JSON', {});
  }
  if (bytes > maxBytes) {
    throwValidation(
      'INPUT_TOO_LARGE',
      `Serialized input (${bytes} bytes) exceeds the maximum of ${maxBytes} bytes`,
      { maxInputBytes: maxBytes, bytes },
    );
  }
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
 * see `sdk/event-stream/index.ts`. `appendEvent()` never throws
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
