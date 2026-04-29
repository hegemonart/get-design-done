#!/usr/bin/env node
// tests/fixtures/peer-cli/mock-acp-server.cjs
//
// Plan 27-01 — Mock ACP peer for acp-client tests.
//
// Reads line-delimited JSON-RPC frames from stdin and emits framed
// responses + notifications on stdout. Behavior is controlled via the
// MOCK_ACP_MODE env var (read at startup):
//
//   normal       — handshake + prompt with one notification then result.
//   batched      — prompt: emit 3 notifications + final result in ONE
//                  stdout chunk (single fs.write call with embedded \n's).
//   split        — prompt: emit half of one JSON message, wait 100ms,
//                  emit the other half + \n. Tests cross-chunk buffering.
//   overflow     — on first prompt, emit 17 MiB of non-newline garbage
//                  to trigger the 16 MiB line cap on the client side.
//
// All modes implement `initialize` identically (returns a fixed
// capability stub) so the test harness can call it before the
// mode-specific prompt scenario fires.
//
// The mock has zero dependencies — pure Node built-ins — and exits
// cleanly when its stdin closes.

'use strict';

const mode = process.env.MOCK_ACP_MODE || 'normal';

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (line.length === 0) continue;
    try {
      const msg = JSON.parse(line);
      handleRequest(msg);
    } catch (err) {
      // Send a JSON-RPC parse-error response if id is unknowable.
      writeFrame({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});

function writeFrame(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function handleRequest(req) {
  if (req.method === 'initialize') {
    writeFrame({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: (req.params && req.params.protocolVersion) || '2025-06-18',
        serverCapabilities: { prompt: true, tools: ['fs', 'shell'] },
      },
    });
    return;
  }

  if (req.method === 'prompt') {
    if (mode === 'normal') {
      // One notification then a result.
      writeFrame({ jsonrpc: '2.0', method: 'agent_message_chunk', params: { text: 'hello ' } });
      writeFrame({ jsonrpc: '2.0', method: 'agent_message_chunk', params: { text: 'world' } });
      writeFrame({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: 'hello world',
          finish_reason: 'stop',
          usage: { input_tokens: 10, output_tokens: 2 },
        },
      });
      return;
    }

    if (mode === 'batched') {
      // Emit 3 notifications + the final result in a SINGLE write call.
      // The client must split this on its own.
      const lines = [
        JSON.stringify({ jsonrpc: '2.0', method: 'agent_message_chunk', params: { text: 'a' } }),
        JSON.stringify({ jsonrpc: '2.0', method: 'agent_message_chunk', params: { text: 'b' } }),
        JSON.stringify({ jsonrpc: '2.0', method: 'tool_call', params: { name: 'fs.read', args: { path: '/tmp/x' } } }),
        JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { content: 'ab', finish_reason: 'stop' } }),
      ].join('\n') + '\n';
      process.stdout.write(lines);
      return;
    }

    if (mode === 'split') {
      // Build one full JSON message, then write it in two chunks
      // separated by 100ms — half of the JSON, pause, second half + \n.
      const full = JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: { content: 'split-message', finish_reason: 'stop' },
      });
      const mid = Math.floor(full.length / 2);
      const a = full.slice(0, mid);
      const b = full.slice(mid);
      process.stdout.write(a);
      setTimeout(() => {
        process.stdout.write(b + '\n');
      }, 100);
      return;
    }

    if (mode === 'overflow') {
      // Stream 17 MiB of 'x' with NO newline — the client must trip
      // its 16 MiB cap and reject. We write in 1 MiB chunks to avoid
      // a single allocation spike on the mock side.
      const ONE_MIB = 1024 * 1024;
      const target = 17 * ONE_MIB;
      let written = 0;
      const filler = 'x'.repeat(ONE_MIB);
      const pump = () => {
        while (written < target) {
          const ok = process.stdout.write(filler);
          written += ONE_MIB;
          if (!ok) {
            process.stdout.once('drain', pump);
            return;
          }
        }
      };
      pump();
      return;
    }

    // Default fallback: error response.
    writeFrame({
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32601, message: `unknown mock mode: ${mode}` },
    });
    return;
  }

  // Unknown method.
  writeFrame({
    jsonrpc: '2.0',
    id: req.id,
    error: { code: -32601, message: `method not found: ${req.method}` },
  });
}
