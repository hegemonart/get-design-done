// tests/fixtures/peer-cli/mock-asp-server.cjs
//
// Plan 27-02 — Minimal Codex App-Server-Protocol mock used by the
// asp-client unit tests. Spawned as a Node subprocess via
// `child_process.spawn(process.execPath, [thisFile, ...flags])`.
//
// Behavior is selected by env vars rather than CLI flags so tests can
// configure each spawn cheaply:
//
//   MOCK_ASP_MODE      'happy'        — threadStart returns threadId,
//                                       turn streams 2 progress
//                                       notifications then completes.
//                      'error_turn'   — threadStart OK; turn streams
//                                       1 progress notification then
//                                       emits turnError (resolves with
//                                       {status: error}).
//                      'die_mid_turn' — threadStart OK; on first turn
//                                       request, exit(1) without any
//                                       response (forces the client
//                                       into transport-closure path).
//                      'resume'       — threadStart OK; threadResume
//                                       echoes a known state object.
//
//   MOCK_ASP_THREAD_ID Override the threadId returned by threadStart
//                      (default 'thr_test_1').
//
// Wire framing matches the production client: one JSON object per line
// on stdout, terminated with `\n`. Reads stdin one line at a time with
// the same hand-rolled buffer the client uses.
//
// This file is `.cjs` for parity with the client and so it can run via
// `node` without any flags.

'use strict';

const MODE = process.env.MOCK_ASP_MODE || 'happy';
const THREAD_ID = process.env.MOCK_ASP_THREAD_ID || 'thr_test_1';

let nextTurnSeq = 0;
let stdinBuf = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdinBuf += chunk;
  let nlIdx;
  // eslint-disable-next-line no-cond-assign
  while ((nlIdx = stdinBuf.indexOf('\n')) !== -1) {
    const line = stdinBuf.slice(0, nlIdx);
    stdinBuf = stdinBuf.slice(nlIdx + 1);
    if (line.trim().length === 0) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function handle(msg) {
  if (typeof msg.id !== 'number' && typeof msg.id !== 'string') return;
  const id = msg.id;
  const method = msg.method;
  const params = (msg.params && typeof msg.params === 'object') ? msg.params : {};

  if (method === 'threadStart') {
    // Echo back whatever service_name + experimentalRawEvents we got
    // so tests can assert the client forwarded them.
    send({
      jsonrpc: '2.0',
      id,
      result: {
        threadId: THREAD_ID,
        echoedServiceName: params.service_name,
        echoedExperimentalRawEvents: params.experimentalRawEvents,
      },
    });
    return;
  }

  if (method === 'threadResume') {
    if (MODE === 'resume' || MODE === 'happy') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          threadId: params.threadId,
          state: 'resumed',
          turnCount: 3,
        },
      });
    } else {
      send({
        jsonrpc: '2.0',
        id,
        error: { code: 'not_supported', message: 'threadResume disabled in this mode' },
      });
    }
    return;
  }

  if (method === 'turn') {
    if (MODE === 'die_mid_turn') {
      // Exit without any response. Client should reject the in-flight turn
      // with a transport-closed error.
      process.exit(1);
    }

    nextTurnSeq += 1;
    const turnId = `turn_${nextTurnSeq}`;

    // Acknowledge the method call with the turnId so the client knows
    // which streaming notifications belong to this turn.
    send({
      jsonrpc: '2.0',
      id,
      result: { turnId, threadId: params.threadId },
    });

    // Stream progress notifications, then the terminal one.
    if (MODE === 'error_turn') {
      send({
        jsonrpc: '2.0',
        method: 'turn.progress',
        params: { turnId, message: 'thinking...' },
      });
      send({
        jsonrpc: '2.0',
        method: 'turn.error',
        params: {
          turnId,
          error: { code: 'rate_limited', message: 'mock: simulated rate limit' },
        },
      });
      return;
    }

    // happy path
    send({
      jsonrpc: '2.0',
      method: 'turn.progress',
      params: { turnId, message: 'thinking...' },
    });
    send({
      jsonrpc: '2.0',
      method: 'turn.progress',
      params: { turnId, message: 'tool_use: shell' },
    });
    send({
      jsonrpc: '2.0',
      method: 'turn.complete',
      params: {
        turnId,
        content: { text: `echo: ${params.text}` },
        usage: { input_tokens: 10, output_tokens: 20 },
      },
    });
    return;
  }

  // Unknown method
  send({
    jsonrpc: '2.0',
    id,
    error: { code: 'method_not_found', message: `unknown method: ${method}` },
  });
}

// Keep the process alive even with no stdin data yet.
process.stdin.resume();
