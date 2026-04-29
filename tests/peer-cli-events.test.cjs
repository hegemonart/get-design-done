'use strict';

// Plan 27-08 — minimal smoke tests for the event-chain runtime_role + peer_id
// extension and the new peer_call_* event types. Recovered from a stalled
// async agent (a7928866) — focuses on the type / constants surface that
// downstream phases (27-06 session-runner emission, 27-12 closeout) will
// exercise more thoroughly.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

// ── 1. event-stream/types.ts declares the new event types ──────────────────

test('27-08: event-stream/types.ts declares peer_call_started event', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/event-stream/types.ts'),
    'utf8',
  );
  assert.match(src, /peer_call_started/, 'types.ts must declare peer_call_started');
  assert.match(src, /peer_call_complete/, 'types.ts must declare peer_call_complete');
  assert.match(src, /peer_call_failed/, 'types.ts must declare peer_call_failed');
});

test('27-08: event-stream/types.ts declares runtime_role tag', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/event-stream/types.ts'),
    'utf8',
  );
  assert.match(src, /runtime_role/, 'types.ts must declare runtime_role tag');
  assert.match(
    src,
    /'host'|"host"/,
    'runtime_role must include literal "host" value',
  );
  assert.match(
    src,
    /'peer'|"peer"/,
    'runtime_role must include literal "peer" value',
  );
});

test('27-08: event-stream/types.ts declares peer_id field', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/event-stream/types.ts'),
    'utf8',
  );
  assert.match(src, /peer_id/, 'types.ts must declare peer_id field');
});

// ── 2. event-stream exports the event-type constants ──────────────────────

test('27-08: event-stream exports PEER_CALL_* constants', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/event-stream/types.ts'),
    'utf8',
  );
  assert.match(src, /PEER_CALL_STARTED/, 'must export PEER_CALL_STARTED constant');
  assert.match(src, /PEER_CALL_COMPLETE/, 'must export PEER_CALL_COMPLETE constant');
  assert.match(src, /PEER_CALL_FAILED/, 'must export PEER_CALL_FAILED constant');
});

// ── 3. budget-enforcer threads runtime_role + peer_id ──────────────────────

test('27-08: budget-enforcer reads runtime_role from router decision', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/budget-enforcer.cjs'),
    'utf8',
  );
  assert.match(
    src,
    /runtime_role/,
    'budget-enforcer must reference runtime_role to thread it into cost rows',
  );
});

test('27-08: budget-enforcer threads peer_id when present', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/budget-enforcer.cjs'),
    'utf8',
  );
  assert.match(
    src,
    /peer_id/,
    'budget-enforcer must thread peer_id into cost rows when delegated',
  );
});

// ── 4. Default to "host" when runtime_role is absent ──────────────────────

test('27-08: default runtime_role is "host" (back-compat)', () => {
  const types = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/event-stream/types.ts'),
    'utf8',
  );
  // Look for a default-host annotation in comments or code:
  // either "default to 'host'", "defaults to 'host'", or 'host'
  // appearing in a default context.
  assert.match(
    types,
    /default(s)?\s+(to\s+)?['"]?host['"]?|host.*default/i,
    'types.ts must document that runtime_role defaults to "host" for back-compat',
  );
});

// ── 5. event-stream/index.ts surfaces the new types ──────────────────────

test('27-08: event-stream/index.ts re-exports peer-call event constants', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/event-stream/index.ts'),
    'utf8',
  );
  assert.match(
    src,
    /PEER_CALL|peer_call|types/,
    'index.ts must surface the new peer-call event types or re-export from ./types',
  );
});
