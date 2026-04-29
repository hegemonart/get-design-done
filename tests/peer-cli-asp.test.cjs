'use strict';
// tests/peer-cli-asp.test.cjs
//
// Plan 27-02 — Codex ASP client tests. Verifies:
//   1. threadStart returns a threadId and forwards service_name +
//      experimentalRawEvents.
//   2. threadResume reads back state from the same mock server.
//   3. turn lifecycle: streams notifications, then completes with
//      {status: complete, content, usage}.
//   4. turn error path: ends with {status: error}; client RESOLVES
//      (does not throw) so the caller can decide retry/fallback.
//   5. Process death mid-turn rejects the in-flight turn with a
//      structured transport error.
//   6. Static contract: line buffer cap + module surface.
//
// Each test boots a fresh mock subprocess via createAspClient —
// spawning `node tests/fixtures/peer-cli/mock-asp-server.cjs` with
// MOCK_ASP_MODE configured per scenario.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createAspClient, MAX_LINE_BYTES } = require('../scripts/lib/peer-cli/asp-client.cjs');

const MOCK_SERVER = path.join(__dirname, 'fixtures', 'peer-cli', 'mock-asp-server.cjs');

/** Build a client wired to the mock server in a given mode. */
function clientForMode(mode, extraEnv) {
  return createAspClient({
    command: process.execPath,
    args: [MOCK_SERVER],
    env: {
      ...process.env,
      MOCK_ASP_MODE: mode,
      ...(extraEnv || {}),
    },
  });
}

test('threadStart returns threadId and forwards service_name + experimentalRawEvents', async () => {
  const client = clientForMode('happy', { MOCK_ASP_THREAD_ID: 'thr_alpha' });
  try {
    const res = await client.threadStart({ service_name: 'gdd_peer_delegation' });
    assert.equal(res.threadId, 'thr_alpha');
    assert.equal(res.echoedServiceName, 'gdd_peer_delegation');
    // Default per Plan 27-02 contract: experimentalRawEvents is `false`
    // unless the caller explicitly overrides.
    assert.equal(res.echoedExperimentalRawEvents, false);
  } finally {
    await client.close();
  }
});

test('threadStart honors caller-supplied experimentalRawEvents=true', async () => {
  const client = clientForMode('happy');
  try {
    const res = await client.threadStart({
      service_name: 'gdd_peer_delegation',
      experimentalRawEvents: true,
    });
    assert.equal(res.echoedExperimentalRawEvents, true);
  } finally {
    await client.close();
  }
});

test('threadResume returns server state for the supplied threadId', async () => {
  const client = clientForMode('resume');
  try {
    const start = await client.threadStart({ service_name: 'gdd_peer_delegation' });
    const resumed = await client.threadResume(start.threadId);
    assert.equal(resumed.threadId, start.threadId);
    assert.equal(resumed.state, 'resumed');
    assert.equal(resumed.turnCount, 3);
  } finally {
    await client.close();
  }
});

test('threadResume rejects when threadId is missing or empty', async () => {
  const client = clientForMode('happy');
  try {
    await assert.rejects(() => client.threadResume(''), /non-empty string/);
    await assert.rejects(() => client.threadResume(undefined), /non-empty string/);
  } finally {
    await client.close();
  }
});

test('turn streams notifications then completes with content + usage', async () => {
  const client = clientForMode('happy');
  try {
    const { threadId } = await client.threadStart({ service_name: 'gdd_peer_delegation' });
    const seen = [];
    const result = await client.turn(threadId, 'hello world', {
      onNotification: (n) => seen.push(n.method),
    });
    assert.equal(result.status, 'complete');
    assert.equal(result.content.text, 'echo: hello world');
    assert.equal(result.usage.input_tokens, 10);
    assert.equal(result.usage.output_tokens, 20);
    assert.equal(typeof result.turnId, 'string');
    assert.equal(result.threadId, threadId);
    // The mock emits two progress notifications + the terminal one.
    // The terminal is included in the recorded list per the contract.
    assert.deepEqual(seen, ['turn.progress', 'turn.progress', 'turn.complete']);
    assert.equal(result.notifications.length, 3);
  } finally {
    await client.close();
  }
});

test('turn error path RESOLVES with {status: error} (does NOT throw)', async () => {
  const client = clientForMode('error_turn');
  try {
    const { threadId } = await client.threadStart({ service_name: 'gdd_peer_delegation' });
    const result = await client.turn(threadId, 'do something');
    // Critical contract: error path resolves so the caller decides
    // retry-vs-fallback. It does NOT reject the promise.
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'rate_limited');
    assert.match(result.error.message, /simulated rate limit/);
    assert.equal(result.threadId, threadId);
    assert.equal(typeof result.turnId, 'string');
  } finally {
    await client.close();
  }
});

test('process death mid-turn rejects the in-flight turn promise', async () => {
  const client = clientForMode('die_mid_turn');
  // threadStart succeeds; the kill happens on the first turn() call.
  const { threadId } = await client.threadStart({ service_name: 'gdd_peer_delegation' });
  await assert.rejects(
    () => client.turn(threadId, 'this will kill the server'),
    (err) => {
      // Either a transport-close error (most common race) or an exit-
      // code error from the 'exit' handler — both are acceptable.
      assert.ok(err instanceof Error, 'err must be an Error');
      assert.match(
        err.message,
        /transport closed|subprocess exited|stdin write failed|stdin/i,
        `unexpected rejection message: ${err.message}`,
      );
      return true;
    },
  );
  // The client should be in a closed state after the subprocess died.
  assert.equal(client.closed, true);
  // close() on an already-closed client is a no-op.
  await client.close();
});

test('turn rejects with TypeError when threadId or text are wrong shape', async () => {
  const client = clientForMode('happy');
  try {
    await assert.rejects(() => client.turn('', 'text'), /threadId/);
    // @ts-expect-error — intentional bad input
    await assert.rejects(() => client.turn('thr_x', 42), /text must be a string/);
  } finally {
    await client.close();
  }
});

test('close() rejects all newly arriving requests', async () => {
  const client = clientForMode('happy');
  await client.threadStart({ service_name: 'gdd_peer_delegation' });
  await client.close();
  await assert.rejects(
    () => client.threadStart({ service_name: 'x' }),
    /closed|transport/i,
  );
  await assert.rejects(
    () => client.turn('thr_x', 'hi'),
    /closed|transport/i,
  );
});

test('module surface: createAspClient is a function and MAX_LINE_BYTES is 16 MiB', () => {
  assert.equal(typeof createAspClient, 'function');
  assert.equal(MAX_LINE_BYTES, 16 * 1024 * 1024);
});

test('createAspClient validates required opts', () => {
  assert.throws(() => createAspClient(), /opts is required/);
  assert.throws(() => createAspClient({}), /command must be a non-empty string/);
  assert.throws(
    () => createAspClient({ command: '' }),
    /command must be a non-empty string/,
  );
});

test('attribution comment is present in the client source', () => {
  // Apache 2.0 §4 attribution gate (D-02 + D-14). We don't ship the
  // NOTICE file until plan 27-12, but the source-level attribution
  // comment must already be in place at this plan boundary.
  const fs = require('node:fs');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'lib', 'peer-cli', 'asp-client.cjs'),
    'utf8',
  );
  assert.match(src, /cc-multi-cli/i, 'asp-client.cjs must cite cc-multi-cli');
  assert.match(src, /Apache 2\.0/i, 'asp-client.cjs must cite Apache 2.0');
  assert.match(src, /NOTICE/, 'asp-client.cjs must reference NOTICE');
});
