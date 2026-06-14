'use strict';
// tests/figma-extract-receiver.test.cjs — Plan 31-06 (Wave B.3)
// Offline lifecycle coverage for scripts/lib/figma-extract/receiver.cjs.
//
// "Offline" = no cross-machine network. Lifecycle tests issue a REAL HTTP
// request to 127.0.0.1:5179 (loopback — still local). The non-localhost refusal
// (and IPv6-loopback acceptance / routing) cases invoke the EXPORTED request
// handler synchronously with a fake { socket: { remoteAddress } } req + a stub
// res — no real remote socket needed (D-06 403 path asserted this way).
//
// The port is hardcoded to 5179, so live-bind tests MUST run serially and each
// MUST fully resolve (which closes the server) before the next binds. node:test
// runs tests within a file sequentially by default; each live test awaits its
// startReceiver promise to completion, so the server is closed before the next.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  startReceiver,
  createHandler,
  validatePayload,
  isLoopbackRemote,
  RECEIVER_PORT,
  RECEIVER_HOST,
  PLUGIN_PAYLOAD_MARKER,
} = require('../../scripts/lib/figma-extract/receiver.cjs');

// ── fixtures ──────────────────────────────────────────────────────────────────

function mkOutDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hone-receiver-'));
}

function validPayload() {
  return {
    source: PLUGIN_PAYLOAD_MARKER, // 'hone-plugin'
    fileKey: 'ABC123',
    collections: [
      { id: 'c1', name: 'core', modes: [{ modeId: 'm1', name: 'Light' }] },
    ],
    variables: [
      {
        id: 'v1',
        name: 'color/bg',
        resolvedType: 'COLOR',
        collectionId: 'c1',
        valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
      },
      {
        id: 'v2',
        name: 'color/fg',
        resolvedType: 'COLOR',
        collectionId: 'c1',
        valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'v1' } },
      },
    ],
  };
}

/** Issue a real loopback POST to the running receiver. Resolves {status, body}. */
function postVariables(bodyStr, { urlPath = '/variables', method = 'POST' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: RECEIVER_PORT,
        path: urlPath,
        method,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.end(bodyStr);
  });
}

/** Probe whether anything is listening on the receiver port (post-close check). */
function connectRefused() {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: RECEIVER_PORT, path: '/variables', method: 'GET', timeout: 1000 },
      (res) => {
        res.resume();
        resolve(false); // something answered → NOT refused
      }
    );
    req.on('error', () => resolve(true)); // ECONNREFUSED → refused (server closed)
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/** Minimal stub ServerResponse capturing status + body for synchronous handler tests. */
function stubRes() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    headersSent: false,
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers;
      this.headersSent = true;
    },
    end(chunk) {
      if (chunk !== undefined) this.body += chunk;
      this.ended = true;
    },
  };
}

/** Drive the exported handler synchronously with a fake remote address. */
function invokeHandler({ remoteAddress, method = 'POST', url = '/variables', outDir, onReceipt }) {
  const handler = createHandler({ outDir, onReceipt });
  const req = { method, url, socket: { remoteAddress }, on() {} };
  const res = stubRes();
  handler(req, res);
  return res;
}

// ── pure-unit guards (no socket) ───────────────────────────────────────────────

test('31-06: isLoopbackRemote accepts 127.0.0.1, ::1, ::ffff:127.0.0.1 and rejects public IPs', () => {
  assert.equal(isLoopbackRemote('127.0.0.1'), true);
  assert.equal(isLoopbackRemote('::1'), true);
  assert.equal(isLoopbackRemote('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackRemote('203.0.113.5'), false);
  assert.equal(isLoopbackRemote('10.0.0.4'), false);
  assert.equal(isLoopbackRemote(undefined), false);
});

test('31-06: validatePayload passes a well-formed payload and fails a missing-source one', () => {
  assert.equal(validatePayload(validPayload()).valid, true);
  const noSource = validPayload();
  delete noSource.source;
  assert.equal(validatePayload(noSource).valid, false);
});

test('31-06: RECEIVER_PORT===5179, RECEIVER_HOST===127.0.0.1, and module source has no env override for the port', () => {
  assert.equal(RECEIVER_PORT, 5179);
  assert.equal(RECEIVER_HOST, '127.0.0.1');
  const src = fs.readFileSync(
    path.join(__dirname, '../..', 'scripts', 'lib', 'figma-extract', 'receiver.cjs'),
    'utf8'
  );
  // No env-derived port: neither a PORT/RECEIVER_PORT env read nor process.env near 5179.
  assert.ok(
    !/process\.env\.(RECEIVER_PORT|PORT)\b/.test(src),
    'receiver.cjs must not read the port from process.env'
  );
  assert.ok(!/process\.env[^\n]*5179/.test(src), 'port 5179 must not be env-overridable');
  assert.ok(/127\.0\.0\.1/.test(src), 'receiver must reference the loopback host literal');
});

// ── synchronous handler tests (mocked remote — no real socket) ──────────────────

test("31-06: non-localhost remote (mocked remoteAddress='203.0.113.5') -> 403, nothing written, onReceipt NOT called", () => {
  const outDir = mkOutDir();
  let receiptCalled = false;
  const res = invokeHandler({
    remoteAddress: '203.0.113.5',
    outDir,
    onReceipt: () => {
      receiptCalled = true;
    },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(receiptCalled, false, 'a non-localhost request must never count as a receipt');
  assert.equal(
    fs.existsSync(path.join(outDir, 'variables.json')),
    false,
    'nothing must be written for a refused remote'
  );
});

test('31-06: ::1 loopback remote passes the gate (not 403)', () => {
  const outDir = mkOutDir();
  // GET (wrong route) keeps it synchronous: a loopback remote that passes the
  // gate falls through to the 404 router rather than the 403 refusal.
  const res = invokeHandler({ remoteAddress: '::1', method: 'GET', url: '/variables', outDir });
  assert.notEqual(res.statusCode, 403, '::1 is loopback and must pass the remote gate');
  assert.equal(res.statusCode, 404);
});

test('31-06: ::ffff:127.0.0.1 mapped loopback passes the gate (not 403)', () => {
  const outDir = mkOutDir();
  const res = invokeHandler({
    remoteAddress: '::ffff:127.0.0.1',
    method: 'GET',
    url: '/variables',
    outDir,
  });
  assert.notEqual(res.statusCode, 403, '::ffff:127.0.0.1 is mapped loopback and must pass the gate');
  assert.equal(res.statusCode, 404);
});

test('31-06: loopback remote + non-POST or wrong path -> 404 (router, not the 403 gate)', () => {
  const outDir = mkOutDir();
  const getRoot = invokeHandler({ remoteAddress: '127.0.0.1', method: 'GET', url: '/', outDir });
  assert.equal(getRoot.statusCode, 404);
  const postWrong = invokeHandler({
    remoteAddress: '127.0.0.1',
    method: 'POST',
    url: '/nope',
    outDir,
  });
  assert.equal(postWrong.statusCode, 404);
});

// ── live loopback lifecycle tests (serial; each closes its server) ──────────────

test('31-06: timeout with no request -> resolves {received:false, reason:"timeout"} and server closed', async () => {
  const outDir = mkOutDir();
  const result = await startReceiver({ outDir, timeoutMs: 150 });
  assert.deepEqual(result, { received: false, reason: 'timeout' });
  // After timeout the port must be closed: a follow-up connect is refused.
  assert.equal(await connectRefused(), true, 'server must be closed after timeout');
});

test('31-06: valid localhost POST /variables -> resolves {received:true, path}, writes variables.json, server closed', async () => {
  const outDir = mkOutDir();
  const p = startReceiver({ outDir, timeoutMs: 5000 });
  // give listen() a beat, then POST
  await new Promise((r) => setTimeout(r, 100));
  const resp = await postVariables(JSON.stringify(validPayload()));
  assert.equal(resp.status, 200);
  const result = await p;
  assert.equal(result.received, true);
  assert.equal(result.path, path.join(outDir, 'variables.json'));
  assert.equal(fs.existsSync(result.path), true, 'variables.json must be written');
  assert.equal(await connectRefused(), true, 'server must be closed after a valid receipt');
});

test("31-06: written variables.json contains source:'hone-plugin' + the posted variables", async () => {
  const outDir = mkOutDir();
  const p = startReceiver({ outDir, timeoutMs: 5000 });
  await new Promise((r) => setTimeout(r, 100));
  await postVariables(JSON.stringify(validPayload()));
  const result = await p;
  const written = JSON.parse(fs.readFileSync(result.path, 'utf8'));
  assert.equal(written.source, 'hone-plugin', 'the Path C marker must be present for digest.cjs');
  assert.equal(Array.isArray(written.variables), true);
  assert.equal(written.variables.length, 2, 'all posted variables must be persisted (D-13)');
  assert.equal(written.variables[0].name, 'color/bg');
});

test('31-06: schema-invalid body (missing source) -> 400, nothing written, server keeps waiting (then times out)', async () => {
  const outDir = mkOutDir();
  const p = startReceiver({ outDir, timeoutMs: 600 });
  await new Promise((r) => setTimeout(r, 100));
  const bad = validPayload();
  delete bad.source;
  const resp = await postVariables(JSON.stringify(bad));
  assert.equal(resp.status, 400);
  assert.equal(
    fs.existsSync(path.join(outDir, 'variables.json')),
    false,
    'a schema-invalid payload must not be written'
  );
  // Server did NOT resolve on the 400 — it keeps waiting and then times out.
  const result = await p;
  assert.deepEqual(result, { received: false, reason: 'timeout' });
});

test('31-06: schema-invalid body (missing variables) -> 400, nothing written', async () => {
  const outDir = mkOutDir();
  const p = startReceiver({ outDir, timeoutMs: 600 });
  await new Promise((r) => setTimeout(r, 100));
  const bad = validPayload();
  delete bad.variables;
  const resp = await postVariables(JSON.stringify(bad));
  assert.equal(resp.status, 400);
  assert.equal(fs.existsSync(path.join(outDir, 'variables.json')), false);
  await p; // drain to close the server
});

test('31-06: malformed JSON body -> 400, nothing written', async () => {
  const outDir = mkOutDir();
  const p = startReceiver({ outDir, timeoutMs: 600 });
  await new Promise((r) => setTimeout(r, 100));
  const resp = await postVariables('{ this is : not json ]');
  assert.equal(resp.status, 400);
  assert.equal(fs.existsSync(path.join(outDir, 'variables.json')), false);
  await p; // drain to close the server
});

test('31-06: a 400 rejection followed by a valid POST on the SAME run -> receipt (server stayed open through the 400)', async () => {
  const outDir = mkOutDir();
  const p = startReceiver({ outDir, timeoutMs: 5000 });
  await new Promise((r) => setTimeout(r, 100));
  const bad = validPayload();
  delete bad.source;
  const r1 = await postVariables(JSON.stringify(bad));
  assert.equal(r1.status, 400, 'first POST is schema-invalid');
  // Server must still be accepting — retry with a valid payload.
  const r2 = await postVariables(JSON.stringify(validPayload()));
  assert.equal(r2.status, 200, 'retry on the same open server succeeds');
  const result = await p;
  assert.equal(result.received, true);
  assert.equal(fs.existsSync(result.path), true);
});

test('31-06: startReceiver without outDir rejects (outDir is required)', async () => {
  await assert.rejects(() => startReceiver({ timeoutMs: 100 }), /outDir is required/);
});
