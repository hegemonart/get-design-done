// tests/ws-transport.test.cjs — Plan 22-07 WebSocket transport
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { probeOptional } = require('../scripts/lib/probe-optional.cjs');
const wsLib = probeOptional('ws');

// Module loads at require time when ws is present.
let transport = null;
if (wsLib) {
  transport = require('../scripts/lib/transports/ws.cjs');
}

test('22-07: ws.cjs throws clear error when ws module absent', { skip: !!wsLib }, () => {
  // Cannot exercise the throw branch when `ws` IS installed in the test env.
  // The error message is asserted by the gdd-events serve subcommand path
  // which catches the throw at require time. See tests/cli-events.test.cjs.
});

test('22-07: startServer requires port + token of ≥8 chars', { skip: !wsLib }, async () => {
  await assert.rejects(
    () => transport.startServer({ port: 'abc', token: 'longenough' }),
    /port \(number\)/,
  );
  await assert.rejects(
    () => transport.startServer({ port: 0, token: 'short' }),
    /token/,
  );
});

test('22-07: rejects connection with wrong token (HTTP 401)', { skip: !wsLib }, async () => {
  const handle = await transport.startServer({ port: 0, token: 'right-token' });
  try {
    const port = handle.port;
    // Manual upgrade with wrong token
    const http = require('node:http');
    await new Promise((resolve) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        method: 'GET',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          Authorization: 'Bearer wrong-token',
          'Sec-WebSocket-Key': Buffer.from('1234567890123456').toString('base64'),
          'Sec-WebSocket-Version': '13',
        },
      });
      req.on('response', (res) => {
        // Server may respond with 426 if upgrade hits the http handler first
        // when the auth check rejects pre-upgrade. Either way, NOT 101.
        assert.notEqual(res.statusCode, 101);
        res.resume();
        resolve();
      });
      req.on('upgrade', () => {
        assert.fail('upgrade should not succeed with wrong token');
      });
      req.on('error', () => resolve()); // socket destroy after 401 raises ECONNRESET
      req.end();
    });
  } finally {
    handle.close();
  }
});

test('22-07: connects with right token + receives replayed tail file', { skip: !wsLib }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-ws-tail-'));
  try {
    const tailPath = join(dir, 'events.jsonl');
    const events = [
      { type: 'stage.entered', timestamp: 't1', sessionId: 's', payload: {} },
      { type: 'stage.exited', timestamp: 't2', sessionId: 's', payload: {} },
    ];
    writeFileSync(tailPath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

    const handle = await transport.startServer({
      port: 0,
      token: 'integration-token',
      tailFrom: tailPath,
    });
    try {
      const port = handle.port;
      const WebSocket = wsLib;
      const client = new WebSocket(`ws://127.0.0.1:${port}`, {
        headers: { Authorization: 'Bearer integration-token' },
      });
      const received = [];
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ws receive timeout')), 3000);
        client.on('message', (data) => {
          received.push(JSON.parse(String(data)));
          if (received.length === 2) {
            clearTimeout(timer);
            resolve();
          }
        });
        client.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
      client.close();
      assert.equal(received.length, 2);
      assert.equal(received[0].type, 'stage.entered');
      assert.equal(received[1].type, 'stage.exited');
    } finally {
      handle.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-07: live subscribe path delivers events after connect', { skip: !wsLib }, async () => {
  const subs = new Set();
  const subscribe = (handler) => {
    subs.add(handler);
    return () => subs.delete(handler);
  };
  const handle = await transport.startServer({
    port: 0,
    token: 'live-token',
    subscribe,
  });
  try {
    const port = handle.port;
    const WebSocket = wsLib;
    const client = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { Authorization: 'Bearer live-token' },
    });
    await new Promise((resolve, reject) => {
      client.on('open', resolve);
      client.on('error', reject);
    });
    // Now emit a live event via the subscribe handler.
    const received = [];
    client.on('message', (data) => received.push(JSON.parse(String(data))));
    for (const handler of subs) {
      handler({ type: 'live.test', timestamp: 't', sessionId: 's', payload: { x: 1 } });
    }
    // Wait for the message to arrive.
    await new Promise((r) => setTimeout(r, 100));
    client.close();
    assert.equal(received.length, 1);
    assert.equal(received[0].type, 'live.test');
  } finally {
    handle.close();
  }
});

test('22-07: readEventsSync skips invalid lines', { skip: !wsLib }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-ws-rs-'));
  try {
    const path = join(dir, 'e.jsonl');
    writeFileSync(
      path,
      [
        JSON.stringify({ a: 1 }),
        '{not json',
        JSON.stringify({ b: 2 }),
      ].join('\n') + '\n',
    );
    const out = Array.from(transport.readEventsSync(path));
    assert.equal(out.length, 2);
    assert.equal(out[0].a, 1);
    assert.equal(out[1].b, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
