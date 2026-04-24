// scripts/lib/gdd-errors/index.ts — unified GDD error taxonomy.
//
// Three classes exactly — mirrors the GSD errors.ts discipline:
//
//   * ValidationError       — throw at boundary; "fix your input"
//   * StateConflictError    — throw; lockfile contention or transition guard
//                             failed; retryable by upstream
//   * OperationFailedError  — return in data.error; "couldn't complete in
//                             this state"; expected failure mode the caller
//                             should branch on, not crash on
//
// MCP tool handlers place OperationFailedError instances into data.error
// so the model can see and reason about them. ValidationError and
// StateConflictError are thrown (non-zero exit path).
//
// Plan 20-01 introduced LockAcquisitionError and TransitionGateFailed as
// local Error subclasses; this module re-exports taxonomy-compliant
// versions so the existing `gdd-state` surface (tests + consumers) keeps
// working unchanged. Plan 20-05 wires `toToolError` into MCP tool
// handlers; Plan 20-06 emits error events to the telemetry stream.

/** Short machine-readable code. Example: "VALIDATION_MISSING_FIELD". */
export type GDDErrorCode = string;

/**
 * Abstract base class — every GDD taxonomy error inherits from this.
 *
 * Subclasses set a literal `kind` discriminant so `classify()` can
 * branch on it without `instanceof` chains, and `toJSON()` produces a
 * lossless payload for tool-result transport.
 */
export abstract class GDDError extends Error {
  abstract readonly kind: 'validation' | 'state_conflict' | 'operation_failed';
  readonly code: GDDErrorCode;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    message: string,
    code: GDDErrorCode,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.code = code;
    this.context = Object.freeze({ ...context });
    // Set .name to the concrete subclass name (LockAcquisitionError,
    // ValidationError, etc.) so error serialization is human-meaningful.
    this.name = new.target.name;
  }

  /**
   * Serialize to a plain object safe for JSON.stringify. Round-trips
   * through JSON without loss of `name`, `kind`, `code`, `message`, or
   * `context`. Does NOT include the stack trace — MCP tool handlers do
   * not forward stacks to the model.
   */
  toJSON(): {
    name: string;
    kind: GDDError['kind'];
    code: GDDErrorCode;
    message: string;
    context: Readonly<Record<string, unknown>>;
  } {
    return {
      name: this.name,
      kind: this.kind,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

/**
 * Throw at boundary when the caller's input is malformed.
 *
 * Example: MCP tool handler receives an argument that fails schema
 * validation; the correct response is `throw new ValidationError(...)`
 * so the harness catches it and returns a structured error to the model.
 * The model should fix its input and retry.
 */
export class ValidationError extends GDDError {
  readonly kind = 'validation' as const;
  constructor(
    message: string,
    code: GDDErrorCode = 'VALIDATION',
    context?: Record<string, unknown>,
  ) {
    super(message, code, context);
  }
}

/**
 * Throw when a concurrency primitive or transition guard vetoes the
 * operation. Retryable by upstream — the caller may try again after a
 * backoff, or surface the blocker to the operator.
 *
 * Examples: lockfile contention (LockAcquisitionError), transition
 * gate failure (TransitionGateFailed).
 */
export class StateConflictError extends GDDError {
  readonly kind = 'state_conflict' as const;
  constructor(
    message: string,
    code: GDDErrorCode = 'STATE_CONFLICT',
    context?: Record<string, unknown>,
  ) {
    super(message, code, context);
  }
}

/**
 * Return as `data.error` — do NOT throw. This is the expected failure
 * mode the caller should branch on: the operation is well-formed, the
 * state is valid, but the specific request cannot complete right now.
 *
 * Example: "try to advance to `design`, but no plan exists yet" — the
 * model should be told, not crashed on.
 */
export class OperationFailedError extends GDDError {
  readonly kind = 'operation_failed' as const;
  constructor(
    message: string,
    code: GDDErrorCode = 'OPERATION_FAILED',
    context?: Record<string, unknown>,
  ) {
    super(message, code, context);
  }
}

// -----------------------------------------------------------------------
// Plan 20-01 compatibility re-exports.
//
// These keep the `gdd-state` module's public surface stable post-refactor:
// - LockAcquisitionError — lockfile contention (plan 20-01 lockfile.ts)
// - TransitionGateFailed — transition gate veto (plan 20-01 transition())
// Both are StateConflictError subclasses (retryable / contention-class
// errors).
// -----------------------------------------------------------------------

/**
 * Error thrown when `acquire()` cannot obtain the lockfile within
 * `maxWaitMs`. Carries the contents of the offending lockfile (as
 * text — may be JSON, may be garbage if corrupted) so callers can
 * surface them to operators.
 *
 * The `lockPath` and `lockContents` instance properties are preserved
 * from the Plan 20-01 shape for API compat; they're also stored in
 * the frozen `context` object for uniform GDDError serialization.
 */
export class LockAcquisitionError extends StateConflictError {
  readonly lockPath: string;
  readonly lockContents: string;
  readonly waitedMs: number;
  constructor(
    lockPath: string,
    lockContents: string,
    waitedMs: number,
    context?: Record<string, unknown>,
  ) {
    super(
      `failed to acquire lock at ${lockPath} after ${waitedMs}ms; current holder: ${lockContents}`,
      'LOCK_ACQUISITION',
      { ...context, lockPath, lockContents, waitedMs },
    );
    this.lockPath = lockPath;
    this.lockContents = lockContents;
    this.waitedMs = waitedMs;
  }
}

/**
 * Error thrown when a transition gate vetoes a stage advance. Carries
 * the frozen list of blocker messages so callers can surface them to
 * operators or retry after resolving.
 *
 * The `blockers` instance property is preserved from the Plan 20-01
 * shape (readonly string[]) for API compat; it's also mirrored into
 * the frozen `context` object for uniform GDDError serialization.
 */
export class TransitionGateFailed extends StateConflictError {
  readonly blockers: readonly string[];
  readonly toStage: string;
  constructor(
    toStage: string,
    blockers: string[],
    context?: Record<string, unknown>,
  ) {
    super(
      `transition to "${toStage}" blocked by gate: ${blockers.join('; ') || '(no detail)'}`,
      'TRANSITION_GATE_FAILED',
      { ...context, toStage, blockers: [...blockers] },
    );
    this.toStage = toStage;
    this.blockers = Object.freeze([...blockers]);
  }
}

/**
 * Error thrown by STATE.md `parse()` when the input cannot be
 * interpreted. `ValidationError` semantics: the caller (likely the
 * operator or an upstream generator) gave us malformed input — fix
 * your STATE.md and retry.
 *
 * The `line` instance property points at the 1-indexed line in the
 * source markdown where the parser gave up. It's also mirrored into
 * the frozen `context` object.
 */
export class ParseError extends ValidationError {
  readonly line: number;
  constructor(message: string, line: number, context?: Record<string, unknown>) {
    super(
      `STATE.md parse error at line ${line}: ${message}`,
      'PARSE_ERROR',
      { ...context, line },
    );
    this.line = line;
  }
}
