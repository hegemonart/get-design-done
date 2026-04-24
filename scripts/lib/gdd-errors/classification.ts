// scripts/lib/gdd-errors/classification.ts — error classification + MCP helpers.
//
// Two exports:
//   * classify(err)      — normalize any thrown value into an
//                          ErrorClassification descriptor
//   * toToolError(err)   — wrap into the shape MCP tool handlers return
//                          inside data.error
//
// These helpers are the bridge between the taxonomy (index.ts) and the
// MCP tool layer (plan 20-05 wires them into all 11 tool handlers).

import {
  GDDError,
  ValidationError,
  StateConflictError,
  OperationFailedError,
} from './index.ts';

/**
 * The four-valued classification of any error value. `kind === 'unknown'`
 * means the thrown value was not a GDDError — either a plain Error or a
 * non-Error value (string, number, etc.).
 *
 * Flag semantics:
 *   shouldThrow=true   — caller should propagate (or rethrow) this error;
 *                        it represents an invariant violation or bad input
 *   shouldThrow=false  — caller should embed this in data.error and
 *                        return normally (expected branching failure)
 *   retryable=true     — upstream may retry after a backoff (only
 *                        StateConflictError; e.g. lockfile contention)
 */
export interface ErrorClassification {
  kind: 'validation' | 'state_conflict' | 'operation_failed' | 'unknown';
  shouldThrow: boolean;
  retryable: boolean;
  code: string;
  message: string;
}

/**
 * Classify any value thrown at us. Robust to non-Error throws (strings,
 * numbers, plain objects) — returns `kind: 'unknown'` with a sensible
 * message rather than blowing up.
 */
export function classify(err: unknown): ErrorClassification {
  if (err instanceof ValidationError) {
    return {
      kind: 'validation',
      shouldThrow: true,
      retryable: false,
      code: err.code,
      message: err.message,
    };
  }
  if (err instanceof StateConflictError) {
    return {
      kind: 'state_conflict',
      shouldThrow: true,
      retryable: true,
      code: err.code,
      message: err.message,
    };
  }
  if (err instanceof OperationFailedError) {
    return {
      kind: 'operation_failed',
      shouldThrow: false,
      retryable: false,
      code: err.code,
      message: err.message,
    };
  }
  if (err instanceof Error) {
    return {
      kind: 'unknown',
      shouldThrow: true,
      retryable: false,
      code: 'UNKNOWN',
      message: err.message,
    };
  }
  return {
    kind: 'unknown',
    shouldThrow: true,
    retryable: false,
    code: 'UNKNOWN',
    message: String(err),
  };
}

/**
 * Shape MCP tool handlers return inside `data.error`. The `context`
 * key is only present when the error is a GDDError instance — plain
 * errors don't carry structured context, and we intentionally don't
 * fabricate one (the `code` + `message` pair is sufficient).
 */
export interface ToolErrorPayload {
  error: {
    code: string;
    message: string;
    kind: ErrorClassification['kind'];
    context?: Readonly<Record<string, unknown>>;
  };
}

/**
 * Convert any error into the shape MCP tool handlers return in
 * data.error. Plan 20-05 wires this into the 11 tool handlers; Plan
 * 20-06 emits it as an `error` event on the telemetry stream.
 */
export function toToolError(err: unknown): ToolErrorPayload {
  const c = classify(err);
  const out: ToolErrorPayload = {
    error: {
      code: c.code,
      message: c.message,
      kind: c.kind,
    },
  };
  if (err instanceof GDDError) {
    out.error.context = err.context;
  }
  return out;
}
