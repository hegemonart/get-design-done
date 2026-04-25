// tests/redact.test.cjs — Plan 22-02 secret scrubber
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { redact, redactString, PATTERNS } = require('../scripts/lib/redact.cjs');

test('22-02: redacts Anthropic API key', () => {
  const out = redactString('use sk-ant-abcdef0123456789ABCDEFXX please');
  assert.match(out, /\[REDACTED:anthropic\]/);
  assert.doesNotMatch(out, /sk-ant-/);
});

test('22-02: redacts generic sk- token but anthropic wins for sk-ant-', () => {
  const a = redactString('token: sk-ant-1234567890abcdefghij');
  assert.match(a, /\[REDACTED:anthropic\]/);
  assert.doesNotMatch(a, /\[REDACTED:sk\]/);
  const b = redactString('token: sk-ProjAAAAAAAAAAAAAAAAAA');
  assert.match(b, /\[REDACTED:sk\]/);
});

test('22-02: redacts GitHub PAT', () => {
  const out = redactString('GH=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA done');
  assert.match(out, /\[REDACTED:github_pat\]/);
});

test('22-02: redacts AWS access key id', () => {
  const out = redactString('aws=AKIAIOSFODNN7EXAMPLE');
  assert.match(out, /\[REDACTED:aws\]/);
});

test('22-02: redacts Stripe live secret', () => {
  const out = redactString('STRIPE=sk_live_AAAAAAAAAAAAAAAAAAAA');
  assert.match(out, /\[REDACTED:stripe\]/);
});

test('22-02: redacts Slack token', () => {
  const out = redactString('slack=xoxb-1111-2222-AAAAAAAAAA');
  assert.match(out, /\[REDACTED:slack\]/);
});

test('22-02: redacts JWT', () => {
  const jwt =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const out = redactString(`auth: ${jwt}`);
  assert.match(out, /\[REDACTED:jwt\]/);
});

test('22-02: redacts PEM block', () => {
  const pem =
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIB\n-----END PRIVATE KEY-----';
  const out = redactString(`key: ${pem}`);
  assert.match(out, /\[REDACTED:pem\]/);
});

test('22-02: deep-walks nested objects + arrays', () => {
  const ev = {
    type: 'tool_call.completed',
    payload: {
      args: { token: 'sk-ant-AAAAAAAAAAAAAAAAAAAA' },
      results: ['ok', 'sk-ant-BBBBBBBBBBBBBBBBBBBB', { nested: 'ghp_' + 'C'.repeat(40) }],
    },
  };
  const out = redact(ev);
  const json = JSON.stringify(out);
  assert.match(json, /\[REDACTED:anthropic\]/);
  assert.match(json, /\[REDACTED:github_pat\]/);
  assert.doesNotMatch(json, /sk-ant-/);
  assert.doesNotMatch(json, /ghp_/);
});

test('22-02: passes through non-secret strings unchanged', () => {
  const ev = { type: 'stage.entered', payload: { foo: 'bar', n: 42 } };
  const out = redact(ev);
  assert.deepEqual(out, ev);
});

test('22-02: cycle-safe (no infinite recursion)', () => {
  /** @type {any} */
  const a = { name: 'a' };
  a.self = a;
  // must not throw
  const out = redact(a);
  assert.equal(out.name, 'a');
});

test('22-02: PATTERNS export is non-empty array of {type, re}', () => {
  assert.ok(Array.isArray(PATTERNS));
  assert.ok(PATTERNS.length >= 8);
  for (const p of PATTERNS) {
    assert.equal(typeof p.type, 'string');
    assert.ok(p.re instanceof RegExp);
  }
});
