'use strict';
// tests/peer-cli-acp.test.cjs — Plan 27-01.
//
// Drives scripts/lib/peer-cli/acp-client.cjs against a Node-based mock
// ACP peer (tests/fixtures/peer-cli/mock-acp-server.cjs) so we can
// exercise the line-delimited JSON-RPC framing without needing a real
// Gemini/Cursor/Copilot/Qwen binary on the test machine.
//
// Coverage:
//   1. Handshake: initialize round-trip with id correlation.
//   2. Multi-message single chunk: 3 notifications + result in one
//      stdout write — client must split correctly.
//   3. Single message split across chunks: half + 100ms + half — client
//      must buffer until newline.
//   4. Line-buffer overflow guard: 17 MiB without newline must reject.
//   5. prompt round-trip: notifications fire onNotification; final
//      result resolves the prompt promise.
//
// Each test spawns its own mock server (so MOCK_ACP_MODE can vary) and
// closes the client at the end.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createAcpClient, MAX_LINE_BYTES } = require('../scripts/lib/peer-cli/acp-client.cjs');

const MOCK_PATH = path.join(__dirname, 'fixtures', 'peer-cli', 'mock-acp-server.cjs');

/**
 * Spawn a fresh client wired to the mock peer in the requested mode.
 * The mode is passed via env (MOCK_ACP_MODE) — see mock-acp-server.cjs.
 */
function spawnClient(mode) {
  return createAcpClient({
    command: process.execPath, // node binary
    args: [MOCK_PATH],
    cwd: __dirname,
    env: Object.assign({}, process.env, { MOCK_ACP_MODE: mode }),
  });
}

test('initialize handshake correlates by id and returns server capabilities', async () => {
  const client = spawnClient('normal');
  try {
    const result = await client.initialize({
      protocolVersion: '2025-06-18',
      clientCapabilities: { fs: true },
    });
    assert.equal(result.protocolVersion, '2025-06-18');
    assert.deepEqual(result.serverCapabilities.tools, ['fs', 'shell']);
    assert.equal(result.serverCapabilities.prompt, true);
  } finally {
    await client.close();
  }
});

test('prompt round-trip: notifications surface via onNotification, final result resolves', async () => {
  const client = spawnClient('normal');
  try {
    await client.initialize({});
    /** @type {object[]} */
    const notifications = [];
    const result = await client.prompt('say hi', {
      onNotification: (n) => notifications.push(n),
    });
    assert.equal(result.content, 'hello world');
    assert.equal(result.finish_reason, 'stop');
    assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 2 });
    // Both agent_message_chunk notifications must have fired in order.
    assert.equal(notifications.length, 2);
    assert.equal(notifications[0].method, 'agent_message_chunk');
    assert.equal(notifications[0].params.text, 'hello ');
    assert.equal(notifications[1].params.text, 'world');
  } finally {
    await client.close();
  }
});

test('multi-message single chunk: client splits 3 notifications + result correctly', async () => {
  const client = spawnClient('batched');
  try {
    await client.initialize({});
    /** @type {object[]} */
    const notifications = [];
    const result = await client.prompt('batched test', {
      onNotification: (n) => notifications.push(n),
    });
    assert.equal(result.content, 'ab');
    // 3 notifications: 2x agent_message_chunk + 1x tool_call.
    assert.equal(notifications.length, 3, `expected 3 notifications, got ${notifications.length}`);
    assert.equal(notifications[0].method, 'agent_message_chunk');
    assert.equal(notifications[1].method, 'agent_message_chunk');
    assert.equal(notifications[2].method, 'tool_call');
    assert.equal(notifications[2].params.name, 'fs.read');
  } finally {
    await client.close();
  }
});

test('split message across chunks: client buffers until newline arrives', async () => {
  const client = spawnClient('split');
  try {
    await client.initialize({});
    const result = await client.prompt('split test', {});
    // Even though the JSON arrived in two chunks 100ms apart, we still
    // got the complete result.
    assert.equal(result.content, 'split-message');
    assert.equal(result.finish_reason, 'stop');
  } finally {
    await client.close();
  }
});

test('line-buffer overflow guard: peer streaming >16 MiB without newline rejects', async () => {
  const client = spawnClient('overflow');
  try {
    await client.initialize({});
    // The prompt promise must reject because the client tears down
    // when the line buffer exceeds MAX_LINE_BYTES.
    await assert.rejects(
      client.prompt('overflow test', {}),
      (err) => {
        // Error message should mention the cap. We don't pin exact text
        // beyond that — the implementation is free to phrase it.
        assert.ok(err instanceof Error, 'rejected with Error');
        assert.match(
          err.message,
          /(without a newline|protocol violation|closed|exited)/i,
          `unexpected reject message: ${err.message}`,
        );
        return true;
      },
    );
  } finally {
    await client.close();
  }
});

test('MAX_LINE_BYTES is exported and is the documented 16 MiB', () => {
  assert.equal(MAX_LINE_BYTES, 16 * 1024 * 1024);
});

test('close() is idempotent and rejects in-flight requests with a clear message', async () => {
  const client = spawnClient('normal');
  await client.initialize({});
  // Don't await prompt — close while it's pending.
  // (normal mode replies fast, so we race close vs. reply; either
  // outcome is acceptable: prompt resolves or rejects with closed-msg.)
  const p = client.prompt('race', {}).catch((err) => err);
  await client.close();
  await client.close(); // second close: must be a no-op
  const settled = await p;
  // Either it resolved (peer was fast) or it rejected with a closed-style error.
  if (settled instanceof Error) {
    assert.match(settled.message, /(closed|exited|SIGTERM)/i);
  } else {
    // Resolved before close landed — that's fine too.
    assert.ok(settled);
  }
});
