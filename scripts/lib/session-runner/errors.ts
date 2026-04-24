// scripts/lib/session-runner/errors.ts — map Anthropic Agent SDK
// errors onto the gdd-errors taxonomy (Plan 21-01 Task 3).
//
// The SDK throws a variety of shapes — typed APIError subclasses,
// plain Error objects, AbortError from node:dom, and occasionally
// unwrapped provider payloads. This module normalizes any of those
// into:
//
//   * a GDDError subclass instance (ValidationError / StateConflictError /
//     OperationFailedError) for the caller to surface in SessionResult.error
//   * a `retryable` flag the run-loop uses to decide whether to re-invoke
//     `query()`
//   * a `backoff_hint_ms` the run-loop may honor instead of the baseline
//     jittered backoff (server-provided retry-after wins when larger)
//
// Classification rules (evaluated top to bottom; first match wins):
//   1. rate_limit_error / message /rate.?limit/i           → StateConflictError / retryable
//   2. overloaded_error / message /overloaded/i            → StateConflictError / retryable
//   3. authentication_error                                 → ValidationError / NOT retryable
//   4. permission_error                                     → ValidationError / NOT retryable
//   5. context length / overflow / token-limit message      → OperationFailedError / NOT retryable
//   6. invalid_request_error with schema shape              → ValidationError / NOT retryable
//   7. api_error (5xx surface)                              → OperationFailedError / retryable
//   8. AbortError                                           → OperationFailedError / NOT retryable
//   9. Transport errno (ECONNRESET etc. via error-classifier) → OperationFailedError / retryable
//  10. Fallthrough                                          → OperationFailedError / NOT retryable
//
// Rule 5 is before rule 6 because context-overflow is shaped as
// invalid_request_error in some SDK surfaces; we want the more specific
// OperationFailedError classification rather than ValidationError.

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve, dirname } from 'node:path';

import {
  ValidationError,
  OperationFailedError,
  StateConflictError,
  type GDDError,
} from '../gdd-errors/index.ts';

/**
 * Build an absolute path to a repo-root-relative file. We can't use
 * `import.meta.url` here because tsc's Node16 module mode classifies
 * this .ts file as CommonJS output for typecheck purposes even though
 * it actually runs as ESM under `--experimental-strip-types`. Instead
 * we locate the repo root by walking up from `process.cwd()` until we
 * find `package.json`, memoize the result, and resolve relative paths
 * against that anchor. This survives cwd changes during test runs
 * (sandbox chdir) because we resolve once at module load time.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
const REPO_ROOT = findRepoRoot();

/**
 * Build a `createRequire` loader anchored to the repo root. From this
 * loader we resolve our `.cjs` siblings via absolute path strings.
 */
const nodeRequire = createRequire(join(REPO_ROOT, 'package.json'));
const transportClassifier = nodeRequire(
  resolve(REPO_ROOT, 'scripts/lib/error-classifier.cjs'),
) as {
  classify: (err: unknown) => {
    reason: string;
    retryable: boolean;
    suggestedAction: string;
    raw: unknown;
  };
  FailoverReason: {
    readonly RATE_LIMITED: 'rate_limited';
    readonly CONTEXT_OVERFLOW: 'context_overflow';
    readonly AUTH_ERROR: 'auth_error';
    readonly NETWORK_TRANSIENT: 'network_transient';
    readonly NETWORK_PERMANENT: 'network_permanent';
    readonly TOOL_NOT_FOUND: 'tool_not_found';
    readonly VALIDATION: 'validation';
    readonly UNKNOWN: 'unknown';
  };
};

/** Return type of {@link mapSdkError}. */
export interface MappedSdkError {
  /** A GDDError subclass instance (ValidationError / StateConflictError / OperationFailedError). */
  gddError: GDDError;
  /** Caller may retry with backoff iff `true`. */
  retryable: boolean;
  /** Server-provided hint in ms (retry-after header or similar); 0 when unknown. */
  backoff_hint_ms: number;
}

/** Extract `error.type` from Anthropic-shaped errors. Robust to missing keys. */
function sdkType(err: unknown): string {
  if (err === null || err === undefined || typeof err !== 'object') return '';
  // Direct property (SDK's APIError class exposes `type`).
  const direct = (err as { type?: unknown }).type;
  if (typeof direct === 'string') return direct;
  // Nested `error.type` (raw API response shape).
  const nested = (err as { error?: unknown }).error;
  if (nested !== null && typeof nested === 'object') {
    const t = (nested as { type?: unknown }).type;
    if (typeof t === 'string') return t;
  }
  return '';
}

/** Extract a message string. Handles strings / Error / plain objects. */
function sdkMessage(err: unknown): string {
  if (err === null || err === undefined) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
    // Anthropic raw shape: { error: { message } }.
    const nested = (err as { error?: unknown }).error;
    if (nested !== null && typeof nested === 'object') {
      const em = (nested as { message?: unknown }).message;
      if (typeof em === 'string') return em;
    }
  }
  return '';
}

/** Extract numeric HTTP status. */
function sdkStatus(err: unknown): number | null {
  if (err === null || err === undefined || typeof err !== 'object') return null;
  const direct = (err as { status?: unknown }).status;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  const code = (err as { statusCode?: unknown }).statusCode;
  if (typeof code === 'number' && Number.isFinite(code)) return code;
  const resp = (err as { response?: unknown }).response;
  if (resp !== null && typeof resp === 'object') {
    const s = (resp as { status?: unknown }).status;
    if (typeof s === 'number' && Number.isFinite(s)) return s;
  }
  return null;
}

/**
 * Extract a retry-after hint in ms. Checks the common locations:
 *   1. `err.retryAfter` (typed SDK field, seconds)
 *   2. `err.headers['retry-after']` (seconds or HTTP-date)
 *   3. `err.response.headers['retry-after']`
 *
 * Returns 0 when nothing usable is present.
 */
function retryAfterMs(err: unknown): number {
  if (err === null || err === undefined || typeof err !== 'object') return 0;

  // 1. Direct numeric field.
  const direct = (err as { retryAfter?: unknown }).retryAfter;
  if (typeof direct === 'number' && Number.isFinite(direct) && direct >= 0) {
    return Math.floor(direct * 1000);
  }
  if (typeof direct === 'string') {
    const parsed = parseRetryAfter(direct);
    if (parsed !== null) return parsed;
  }

  // 2. Header bag at top level.
  const headers = (err as { headers?: unknown }).headers;
  const fromHeaders = retryAfterFromHeaders(headers);
  if (fromHeaders > 0) return fromHeaders;

  // 3. Header bag under .response.
  const resp = (err as { response?: unknown }).response;
  if (resp !== null && typeof resp === 'object') {
    const respHeaders = (resp as { headers?: unknown }).headers;
    const fromResp = retryAfterFromHeaders(respHeaders);
    if (fromResp > 0) return fromResp;
  }

  return 0;
}

function retryAfterFromHeaders(headers: unknown): number {
  if (headers === null || headers === undefined) return 0;
  let raw: unknown;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    raw = (headers as { get: (name: string) => unknown }).get('retry-after');
  } else if (headers instanceof Map) {
    for (const [k, v] of headers.entries()) {
      if (typeof k === 'string' && k.toLowerCase() === 'retry-after') {
        raw = v;
        break;
      }
    }
  } else if (typeof headers === 'object') {
    for (const k of Object.keys(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === 'retry-after') {
        raw = (headers as Record<string, unknown>)[k];
        break;
      }
    }
  }
  if (raw === undefined || raw === null) return 0;
  const parsed = parseRetryAfter(String(raw));
  return parsed ?? 0;
}

function parseRetryAfter(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) {
    const secs = Number(trimmed);
    if (Number.isFinite(secs) && secs >= 0) return Math.floor(secs * 1000);
    return null;
  }
  const t = Date.parse(trimmed);
  if (Number.isFinite(t)) {
    const delta = t - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

/** Detect schema-shaped invalid_request_error (has `.type === 'invalid_request_error'`). */
function isInvalidRequestShape(err: unknown): boolean {
  return sdkType(err) === 'invalid_request_error';
}

/** Detect context-length / overflow / token-limit messages. */
function isContextOverflow(err: unknown): boolean {
  const msg = sdkMessage(err).toLowerCase();
  if (msg === '') return false;
  return (
    /context.?length/.test(msg) ||
    /context.?overflow/.test(msg) ||
    /context.?window/.test(msg) ||
    /token.?limit/.test(msg) ||
    /prompt is too long/.test(msg) ||
    /maximum context length/.test(msg) ||
    /context_length_exceeded/.test(msg)
  );
}

/** Detect AbortError from node:events or DOM abort signals. */
function isAbortError(err: unknown): boolean {
  if (err === null || err === undefined || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError';
}

/**
 * Map an error thrown/returned by @anthropic-ai/claude-agent-sdk into the
 * gdd-errors taxonomy.
 *
 * See the rules table at the top of this file for the decision tree.
 */
export function mapSdkError(err: unknown): MappedSdkError {
  const type = sdkType(err);
  const msg = sdkMessage(err);
  const status = sdkStatus(err);
  const hint = retryAfterMs(err);

  const context: Record<string, unknown> = { sdkType: type || null };
  if (msg !== '' && err instanceof Error && err.name !== 'Error') {
    context['errorName'] = err.name;
  }
  if (status !== null) context['status'] = status;

  // 1. rate_limit_error.
  if (type === 'rate_limit_error' || /rate.?limit/i.test(msg) || status === 429) {
    return {
      gddError: new StateConflictError(
        msg || 'rate limited by provider',
        'RATE_LIMITED',
        context,
      ),
      retryable: true,
      backoff_hint_ms: hint,
    };
  }

  // 2. overloaded_error.
  if (type === 'overloaded_error' || /overloaded/i.test(msg)) {
    return {
      gddError: new StateConflictError(
        msg || 'provider overloaded',
        'OVERLOADED',
        context,
      ),
      retryable: true,
      backoff_hint_ms: hint,
    };
  }

  // 3. authentication_error.
  if (type === 'authentication_error' || status === 401) {
    return {
      gddError: new ValidationError(
        msg || 'authentication failed; check ANTHROPIC_API_KEY',
        'AUTH_ERROR',
        context,
      ),
      retryable: false,
      backoff_hint_ms: 0,
    };
  }

  // 4. permission_error.
  if (type === 'permission_error' || status === 403) {
    return {
      gddError: new ValidationError(
        msg || 'permission denied; tool not allowed by scope',
        'PERMISSION_DENIED',
        context,
      ),
      retryable: false,
      backoff_hint_ms: 0,
    };
  }

  // 5. context overflow (checked BEFORE invalid_request_error because
  //    it's the more specific classification when both apply).
  if (isContextOverflow(err)) {
    return {
      gddError: new OperationFailedError(
        msg || 'context length exceeded',
        'CONTEXT_OVERFLOW',
        context,
      ),
      retryable: false,
      backoff_hint_ms: 0,
    };
  }

  // 6. invalid_request_error / schema-shape.
  if (isInvalidRequestShape(err) || type === 'not_found_error') {
    return {
      gddError: new ValidationError(
        msg || 'invalid request to Agent SDK',
        'INVALID_REQUEST',
        context,
      ),
      retryable: false,
      backoff_hint_ms: 0,
    };
  }

  // 7. api_error / 5xx.
  if (type === 'api_error' || (status !== null && status >= 500 && status < 600)) {
    return {
      gddError: new OperationFailedError(
        msg || 'provider API error',
        'API_ERROR',
        context,
      ),
      retryable: true,
      backoff_hint_ms: hint,
    };
  }

  // 8. AbortError (caller cancelled).
  if (isAbortError(err)) {
    return {
      gddError: new OperationFailedError(
        msg || 'session aborted',
        'ABORTED',
        context,
      ),
      retryable: false,
      backoff_hint_ms: 0,
    };
  }

  // 9. Transport-layer classification (ECONNRESET, ETIMEDOUT, etc.).
  //    Delegate to scripts/lib/error-classifier.cjs which knows the errno
  //    vocabulary. Only trust its `retryable` flag for transient network
  //    classes — other classes were already handled above.
  const classified = transportClassifier.classify(err);
  if (classified.reason === transportClassifier.FailoverReason.NETWORK_TRANSIENT) {
    return {
      gddError: new OperationFailedError(
        msg || 'transport error (transient)',
        'NETWORK_TRANSIENT',
        { ...context, classifier: classified.reason },
      ),
      retryable: true,
      backoff_hint_ms: hint,
    };
  }

  // 10. Fallthrough — plain Error, non-Error throw, anything unclassified.
  const fallbackMsg =
    msg || (err === null || err === undefined ? 'unknown SDK error' : String(err));
  return {
    gddError: new OperationFailedError(
      fallbackMsg,
      'SDK_UNKNOWN',
      { ...context, classifier: classified.reason },
    ),
    retryable: false,
    backoff_hint_ms: 0,
  };
}
