// scripts/lib/error-classifier.cjs
//
// Plan 20-14 — classify raw errors into a recovery-action vocabulary.
//
// Plan 20-04 shipped the GDDError taxonomy (ValidationError /
// StateConflictError / OperationFailedError). This module is one layer
// lower: it maps LOW-LEVEL errors (fetch rejections, Anthropic API
// responses, Node errno rejections) onto a small enum that recovery
// code can switch on without needing to know which SDK produced the
// error.
//
// Consumers (e.g. budget-enforcer retry, figma probe retry, MCP
// transport) check `classify(err).reason` and decide whether to retry,
// compress, surface, or fail.
//
// Classification rules — evaluated in order; first match wins:
//   1. HTTP 429  OR  message ~ /rate.?limit/       → RATE_LIMITED      (retryable)
//   2. HTTP 413  OR  /context.?(length|window|overflow)/
//                OR  /context_length_exceeded/     → CONTEXT_OVERFLOW  (retryable with compression)
//   3. HTTP 401/403                                → AUTH_ERROR        (NOT retryable)
//   4. /tool not found|unknown tool/               → TOOL_NOT_FOUND    (NOT retryable)
//   5. HTTP 5xx  OR  errno ECONNRESET/ETIMEDOUT/EAI_AGAIN/ECONNREFUSED
//                OR  /network|timeout|socket/       → NETWORK_TRANSIENT (retryable)
//   6. HTTP 4xx (non-auth, non-rate, non-overflow) → VALIDATION        (NOT retryable)
//   7. HTTP >= 400 with no other match             → NETWORK_PERMANENT (NOT retryable)
//   8. Anything else (null, undefined, plain Error) → UNKNOWN          (NOT retryable)
//
// Rule order matters: the tool-not-found string can land inside
// otherwise-validation-shaped errors, so it's checked early. Anthropic
// "context_length_exceeded" returns HTTP 400 in some surfaces and HTTP
// 413 in others — rule 2 catches it either way.
//
// Reference: `reference/error-recovery.md` describes the protocol layer
// that sits on top of this module.

'use strict';

/**
 * @readonly
 * @enum {string}
 */
const FailoverReason = Object.freeze({
  RATE_LIMITED: 'rate_limited',
  CONTEXT_OVERFLOW: 'context_overflow',
  AUTH_ERROR: 'auth_error',
  NETWORK_TRANSIENT: 'network_transient',
  NETWORK_PERMANENT: 'network_permanent',
  TOOL_NOT_FOUND: 'tool_not_found',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown',
});

/** Suggested actions per reason — keyed by FailoverReason. */
const SUGGESTED_ACTIONS = Object.freeze({
  [FailoverReason.RATE_LIMITED]:
    'consult scripts/lib/rate-guard.cjs → blockUntilReady(provider); then retry with scripts/lib/jittered-backoff.cjs',
  [FailoverReason.CONTEXT_OVERFLOW]:
    'compress context (drop oldest non-system turns; target 50% reduction) and retry once',
  [FailoverReason.AUTH_ERROR]:
    'surface to user — do not retry; credentials or OAuth session need refresh',
  [FailoverReason.NETWORK_TRANSIENT]:
    'retry with scripts/lib/jittered-backoff.cjs; max 3 attempts',
  [FailoverReason.NETWORK_PERMANENT]:
    'surface to user; do not retry — endpoint is wrong or resource is gone',
  [FailoverReason.TOOL_NOT_FOUND]:
    'do not retry; verify tool name and MCP registration',
  [FailoverReason.VALIDATION]:
    'do not retry same input; surface validation detail to caller',
  [FailoverReason.UNKNOWN]:
    'surface to user — cannot determine safe recovery action',
});

/** Which reasons are safe to retry by policy. */
const RETRYABLE = Object.freeze({
  [FailoverReason.RATE_LIMITED]: true,
  [FailoverReason.CONTEXT_OVERFLOW]: true,
  [FailoverReason.NETWORK_TRANSIENT]: true,
  [FailoverReason.AUTH_ERROR]: false,
  [FailoverReason.NETWORK_PERMANENT]: false,
  [FailoverReason.TOOL_NOT_FOUND]: false,
  [FailoverReason.VALIDATION]: false,
  [FailoverReason.UNKNOWN]: false,
});

/** Extract a numeric HTTP status from an error shape. Returns null on miss. */
function statusOf(err) {
  if (err === null || err === undefined) return null;
  if (typeof err !== 'object') return null;
  // Direct status / statusCode field.
  if (Number.isFinite(err.status)) return Number(err.status);
  if (Number.isFinite(err.statusCode)) return Number(err.statusCode);
  // Fetch / node-fetch responses wrap status under .response.
  if (err.response && typeof err.response === 'object') {
    if (Number.isFinite(err.response.status)) return Number(err.response.status);
    if (Number.isFinite(err.response.statusCode)) return Number(err.response.statusCode);
  }
  return null;
}

/** Extract a string message; tolerant of anything. */
function messageOf(err) {
  if (err === null || err === undefined) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    // Gather every string-ish field in priority order; join with ' | ' so
    // classification regexes can match against any of them without the
    // caller needing to know which SDK shaped the error. OpenAI-style
    // wraps the interesting discriminator in `error.code` while keeping
    // a generic top-level message; the join lets both contribute.
    const parts = [];
    if (typeof err.message === 'string' && err.message.length > 0) parts.push(err.message);
    if (err.error && typeof err.error === 'object') {
      if (typeof err.error.code === 'string') parts.push(err.error.code);
      if (typeof err.error.type === 'string') parts.push(err.error.type);
      if (typeof err.error.message === 'string') parts.push(err.error.message);
    }
    // Only use top-level `code` when it is NOT an errno (errnoOf handles
    // those). Errnos always match /^E[A-Z0-9_]+$/, so filter them out.
    if (typeof err.code === 'string' && !/^E[A-Z0-9_]+$/.test(err.code)) {
      parts.push(err.code);
    }
    if (parts.length > 0) return parts.join(' | ');
  }
  return '';
}

/** Extract a low-level errno code (ECONNRESET, ETIMEDOUT, ...). */
function errnoOf(err) {
  if (err === null || err === undefined || typeof err !== 'object') return '';
  if (typeof err.code === 'string' && /^E[A-Z0-9_]+$/.test(err.code)) return err.code;
  // fetch native in newer Node wraps the cause
  if (err.cause && typeof err.cause === 'object') {
    const code = err.cause.code;
    if (typeof code === 'string' && /^E[A-Z0-9_]+$/.test(code)) return code;
  }
  return '';
}

/**
 * Classify a raw error into a {@link FailoverReason}.
 *
 * @param {unknown} err
 * @returns {{reason: string, retryable: boolean, suggestedAction: string, raw: unknown}}
 */
function classify(err) {
  const status = statusOf(err);
  const message = messageOf(err).toLowerCase();
  const errno = errnoOf(err);

  // 1. Rate limit.
  if (status === 429 || /rate.?limit/.test(message) || /too many requests/.test(message)) {
    return build(FailoverReason.RATE_LIMITED, err);
  }

  // 2. Context overflow. Anthropic returns 400 with type=invalid_request and
  //    message containing "prompt is too long"; OpenAI returns 400 with
  //    code=context_length_exceeded; some edge surfaces use 413.
  if (
    status === 413 ||
    /context_length_exceeded/.test(message) ||
    /context.{0,10}(length|window|overflow|too.?long)/.test(message) ||
    /prompt is too long/.test(message) ||
    /maximum context length/.test(message)
  ) {
    return build(FailoverReason.CONTEXT_OVERFLOW, err);
  }

  // 3. Auth.
  if (status === 401 || status === 403) {
    return build(FailoverReason.AUTH_ERROR, err);
  }
  if (
    /not authenticated/.test(message) ||
    /invalid[_ ]api[_ ]key/.test(message) ||
    /unauthorized/.test(message) ||
    /authentication/.test(message)
  ) {
    return build(FailoverReason.AUTH_ERROR, err);
  }

  // 4. Tool not found.
  if (/tool not found/.test(message) || /unknown tool/.test(message) || /no such tool/.test(message)) {
    return build(FailoverReason.TOOL_NOT_FOUND, err);
  }

  // 5. Network transient: 5xx or low-level errno.
  if (typeof status === 'number' && status >= 500 && status < 600) {
    return build(FailoverReason.NETWORK_TRANSIENT, err);
  }
  if (
    errno === 'ECONNRESET' ||
    errno === 'ETIMEDOUT' ||
    errno === 'EAI_AGAIN' ||
    errno === 'ECONNREFUSED' ||
    errno === 'ENETUNREACH' ||
    errno === 'EPIPE'
  ) {
    return build(FailoverReason.NETWORK_TRANSIENT, err);
  }
  if (/\bsocket\b/.test(message) || /network/.test(message) || /\btimeout\b/.test(message)) {
    return build(FailoverReason.NETWORK_TRANSIENT, err);
  }

  // 6. Other 4xx → validation.
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return build(FailoverReason.VALIDATION, err);
  }

  // 7. Other >= 400 (e.g. 6xx exotic gateway codes).
  if (typeof status === 'number' && status >= 400) {
    return build(FailoverReason.NETWORK_PERMANENT, err);
  }

  // 8. Fallthrough.
  return build(FailoverReason.UNKNOWN, err);
}

function build(reason, raw) {
  return {
    reason,
    retryable: RETRYABLE[reason] === true,
    suggestedAction: SUGGESTED_ACTIONS[reason],
    raw,
  };
}

module.exports = {
  FailoverReason,
  classify,
  SUGGESTED_ACTIONS,
  RETRYABLE,
};
