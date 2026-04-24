'use strict';
// tests/error-classifier.test.cjs — Plan 20-14 Task 3.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FailoverReason,
  classify,
  SUGGESTED_ACTIONS,
  RETRYABLE,
} = require('../scripts/lib/error-classifier.cjs');

function expect(fixture, reason, retryable) {
  const r = classify(fixture);
  assert.equal(
    r.reason,
    reason,
    `expected reason=${reason}, got ${r.reason} for fixture ${JSON.stringify(fixture)}`,
  );
  assert.equal(
    r.retryable,
    retryable,
    `expected retryable=${retryable}, got ${r.retryable} for fixture ${JSON.stringify(fixture)}`,
  );
  assert.equal(typeof r.suggestedAction, 'string', 'suggestedAction must be a string');
  assert.ok(r.suggestedAction.length > 0, 'suggestedAction must be non-empty');
  // `raw` must preserve the input untouched
  if (fixture !== undefined) assert.strictEqual(r.raw, fixture);
}

test('Anthropic 429 response → RATE_LIMITED, retryable', () => {
  const err = {
    status: 429,
    error: { type: 'rate_limit_error', message: 'rate limit exceeded' },
  };
  expect(err, FailoverReason.RATE_LIMITED, true);
});

test('Anthropic 413 context_length_exceeded → CONTEXT_OVERFLOW, retryable', () => {
  const err = {
    status: 413,
    message: 'prompt is too long: 250000 tokens > 200000 maximum',
  };
  expect(err, FailoverReason.CONTEXT_OVERFLOW, true);
});

test('OpenAI-style context_length_exceeded at 400 → CONTEXT_OVERFLOW', () => {
  const err = {
    status: 400,
    error: { code: 'context_length_exceeded', message: 'Max context exceeded' },
  };
  expect(err, FailoverReason.CONTEXT_OVERFLOW, true);
});

test('Anthropic 401 auth error → AUTH_ERROR, not retryable', () => {
  const err = {
    status: 401,
    error: { type: 'authentication_error', message: 'invalid API key' },
  };
  expect(err, FailoverReason.AUTH_ERROR, false);
});

test('403 forbidden → AUTH_ERROR', () => {
  const err = { status: 403, message: 'Forbidden' };
  expect(err, FailoverReason.AUTH_ERROR, false);
});

test('Node ECONNRESET from fetch → NETWORK_TRANSIENT, retryable', () => {
  const err = { code: 'ECONNRESET', message: 'socket hang up' };
  expect(err, FailoverReason.NETWORK_TRANSIENT, true);
});

test('Node ETIMEDOUT → NETWORK_TRANSIENT', () => {
  const err = { code: 'ETIMEDOUT', message: 'operation timed out' };
  expect(err, FailoverReason.NETWORK_TRANSIENT, true);
});

test('fetch cause ECONNREFUSED (wrapped error) → NETWORK_TRANSIENT', () => {
  const err = { message: 'fetch failed', cause: { code: 'ECONNREFUSED' } };
  expect(err, FailoverReason.NETWORK_TRANSIENT, true);
});

test('500 with no body → NETWORK_TRANSIENT', () => {
  const err = { status: 500 };
  expect(err, FailoverReason.NETWORK_TRANSIENT, true);
});

test('502/503/504 → NETWORK_TRANSIENT', () => {
  expect({ status: 502 }, FailoverReason.NETWORK_TRANSIENT, true);
  expect({ status: 503 }, FailoverReason.NETWORK_TRANSIENT, true);
  expect({ status: 504 }, FailoverReason.NETWORK_TRANSIENT, true);
});

test('400 with validation body → VALIDATION, not retryable', () => {
  const err = { status: 400, error: { type: 'invalid_request_error', message: 'missing field: model' } };
  expect(err, FailoverReason.VALIDATION, false);
});

test('422 unprocessable → VALIDATION', () => {
  const err = { status: 422, message: 'Unprocessable Entity' };
  expect(err, FailoverReason.VALIDATION, false);
});

test('"tool not found" string → TOOL_NOT_FOUND, not retryable', () => {
  const err = 'tool not found: mcp__figma__get_metadata';
  expect(err, FailoverReason.TOOL_NOT_FOUND, false);
});

test('"unknown tool" error object → TOOL_NOT_FOUND', () => {
  const err = new Error('unknown tool: foo');
  expect(err, FailoverReason.TOOL_NOT_FOUND, false);
});

test('random Error object → UNKNOWN, not retryable', () => {
  const err = new Error('something went wrong');
  expect(err, FailoverReason.UNKNOWN, false);
});

test('null → UNKNOWN', () => {
  expect(null, FailoverReason.UNKNOWN, false);
});

test('undefined → UNKNOWN', () => {
  expect(undefined, FailoverReason.UNKNOWN, false);
});

test('empty object → UNKNOWN', () => {
  expect({}, FailoverReason.UNKNOWN, false);
});

test('non-Error primitive → UNKNOWN', () => {
  expect(42, FailoverReason.UNKNOWN, false);
  expect('random string with no keywords', FailoverReason.UNKNOWN, false);
});

test('fetch response wrapper (err.response.status) is read correctly', () => {
  const err = { response: { status: 429 }, message: 'Request failed' };
  expect(err, FailoverReason.RATE_LIMITED, true);
});

test('HTTP 600 (exotic >=400) with no other signal → NETWORK_PERMANENT', () => {
  const err = { status: 600, message: 'gateway weirdness' };
  expect(err, FailoverReason.NETWORK_PERMANENT, false);
});

test('"too many requests" message without status → RATE_LIMITED', () => {
  const err = new Error('Too Many Requests');
  expect(err, FailoverReason.RATE_LIMITED, true);
});

test('"network error" generic message → NETWORK_TRANSIENT', () => {
  const err = new Error('generic network error while reading');
  expect(err, FailoverReason.NETWORK_TRANSIENT, true);
});

test('"unauthorized" message with no status → AUTH_ERROR', () => {
  const err = new Error('unauthorized: invalid API key');
  expect(err, FailoverReason.AUTH_ERROR, false);
});

test('FailoverReason exposes all 8 values with stable strings', () => {
  assert.equal(FailoverReason.RATE_LIMITED, 'rate_limited');
  assert.equal(FailoverReason.CONTEXT_OVERFLOW, 'context_overflow');
  assert.equal(FailoverReason.AUTH_ERROR, 'auth_error');
  assert.equal(FailoverReason.NETWORK_TRANSIENT, 'network_transient');
  assert.equal(FailoverReason.NETWORK_PERMANENT, 'network_permanent');
  assert.equal(FailoverReason.TOOL_NOT_FOUND, 'tool_not_found');
  assert.equal(FailoverReason.VALIDATION, 'validation');
  assert.equal(FailoverReason.UNKNOWN, 'unknown');
  assert.ok(Object.isFrozen(FailoverReason), 'enum must be frozen');
});

test('every FailoverReason has an entry in SUGGESTED_ACTIONS and RETRYABLE', () => {
  for (const k of Object.keys(FailoverReason)) {
    const v = FailoverReason[k];
    assert.equal(typeof SUGGESTED_ACTIONS[v], 'string', `missing suggestedAction for ${v}`);
    assert.equal(typeof RETRYABLE[v], 'boolean', `missing retryable for ${v}`);
  }
});

test('raw field preserves original input reference', () => {
  const err = { status: 429 };
  const c = classify(err);
  assert.strictEqual(c.raw, err);
});
