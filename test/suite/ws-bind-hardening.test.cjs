'use strict';
// test/suite/ws-bind-hardening.test.cjs — Plan 33.5-03 (SC#2, D-04/D-12/D-10).
//
// Proves the WebSocket event-stream transport (scripts/lib/transports/ws.cjs)
// is hardened per D-04:
//   (a) startServer with NO host binds 127.0.0.1 (loopback only) — not 0.0.0.0;
//   (b) a Bearer token differing only in the last char is rejected (the
//       crypto.timingSafeEqual compare still returns false) → 401 close;
//   (c) the exact Bearer token upgrades successfully;
//   (d) scripts/scan-ws-bind.cjs (DIRECT file invocation — the npm alias +
//       CI step are 33.5-04's deliverable) exits 0 on the secure default.
//
// Hermetic (D-10): every server binds an EPHEMERAL OS-assigned port on the
// loopback default and is closed in a finally. NO non-loopback host is ever
// bound. The optional `ws` dep is skip-guarded: a bare checkout without
// `ws` skips the live-server cases (CI installs `ws` as a dev dep).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WS_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'transports', 'ws.cjs');
const SCAN_PATH = path.join(REPO_ROOT, 'scripts', 'scan-ws-bind.cjs');

/**
 * Load the transport module, returning null if the optional `ws` dep is
 * absent (the module throws a clear "ws module not installed" error at
 * require time). Tests that need a live server skip when this is null.
 * @returns {null | { startServer: Function, readEventsSync: Function }}
 */
function loadTransport() {
  try {
    return require(WS_PATH);
  } catch (err) {
    if (/ws module not installed/i.test(String(err && err.message))) return null;
    throw err;
  }
}

/** Is a bound-address host string a loopback address? */
function isLoopback(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

test('33.5-03: default bind is 127.0.0.1 (loopback only)', async (t) => {
  const transport = loadTransport();
  if (!transport) {
    t.skip('optional dep `ws` not installed — skipping live-server bind check');
    return;
  }
  // port:0 = OS-assigned ephemeral; no host → must resolve to the loopback default.
  const handle = await transport.startServer({ port: 0, token: 'x'.repeat(8) });
  try {
    // The transport optionally exposes the resolved host; assert it is loopback.
    assert.ok(
      isLoopback(handle.host),
      `resolved bind host should be loopback, got ${String(handle.host)}`,
    );
  } finally {
    handle.close();
  }
});

test('33.5-03: timing-safe token rejects a near-miss', async (t) => {
  const transport = loadTransport();
  if (!transport) {
    t.skip('optional dep `ws` not installed — skipping token-compare check');
    return;
  }
  const ws = require('ws');
  const token = 'abcdef12'; // ≥8 chars
  const handle = await transport.startServer({ port: 0, token });
  try {
    // Flip the last char → a same-length, one-char-different token. A naive
    // `!==` would reject it (good), but we specifically assert the upgrade is
    // refused so the timing-safe path is exercised end-to-end.
    const wrong = token.slice(0, -1) + (token.endsWith('2') ? '3' : '2');
    const result = await new Promise((resolve) => {
      const client = new ws.WebSocket(`ws://127.0.0.1:${handle.port}`, {
        headers: { authorization: `Bearer ${wrong}` },
      });
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        try { client.terminate(); } catch { /* ignore */ }
        resolve(v);
      };
      client.on('open', () => done('open'));
      client.on('error', () => done('rejected'));
      client.on('unexpected-response', () => done('rejected'));
      setTimeout(() => done('timeout'), 2000);
    });
    assert.equal(result, 'rejected', 'near-miss Bearer token must be rejected (401)');
  } finally {
    handle.close();
  }
});

test('33.5-03: correct token is accepted', async (t) => {
  const transport = loadTransport();
  if (!transport) {
    t.skip('optional dep `ws` not installed — skipping accept check');
    return;
  }
  const ws = require('ws');
  const token = 'abcdef12';
  const handle = await transport.startServer({ port: 0, token });
  try {
    const result = await new Promise((resolve) => {
      const client = new ws.WebSocket(`ws://127.0.0.1:${handle.port}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        try { client.terminate(); } catch { /* ignore */ }
        resolve(v);
      };
      client.on('open', () => done('open'));
      client.on('error', () => done('rejected'));
      client.on('unexpected-response', () => done('rejected'));
      setTimeout(() => done('timeout'), 2000);
    });
    assert.equal(result, 'open', 'correct Bearer token must upgrade successfully');
  } finally {
    handle.close();
  }
});

test('33.5-03: scan-ws-bind exits 0 on secure default', () => {
  // DIRECT file invocation — the `scan:ws-bind` npm alias + CI step are
  // registered by 33.5-04 (single Wave-B package.json owner); this test does
  // not depend on the alias.
  const r = spawnSync(process.execPath, [SCAN_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(
    r.status,
    0,
    `scan-ws-bind.cjs should exit 0 on the 127.0.0.1 default.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
  );
});
