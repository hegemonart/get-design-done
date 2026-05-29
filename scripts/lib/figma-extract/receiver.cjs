'use strict';
// scripts/lib/figma-extract/receiver.cjs — Plan 31-06 (Wave B.3)
// Path C receiver; D-06: ephemeral + 127.0.0.1-only.
//
// The localhost half of Path C (D-04). The Figma plugin "GDD Sync" (31-05)
// reads `figma.variables` from inside Figma (works on any plan — sidesteps the
// spike's Variables-API-403 Enterprise blocker) and POSTs them here. This
// receiver validates the payload against payload-schema.json and writes it into
// the raw/ cache as variables.json, where digest.cjs (31-02) consumes it as
// Path C via the `source:'gdd-plugin'` marker.
//
// Security properties are the WHOLE point (D-06):
//   - Binds 127.0.0.1 ONLY (host '127.0.0.1', never 0.0.0.0) — unreachable off
//     the loopback interface.
//   - REFUSES any non-loopback remote with 403 (req.socket.remoteAddress gate),
//     even though the bind already makes that essentially unreachable — defense
//     in depth, and asserted by test via a mocked remote address.
//   - Validates EVERY payload against the schema BEFORE touching disk (400 on
//     invalid; nothing written).
//   - Port is HARDCODED to 5179 — NOT read from env or a CLI flag (acceptance
//     criterion). Changing it requires a code edit. There is intentionally no
//     `process.env.*PORT*` read in this module.
//   - EPHEMERAL: listens only for the duration of one extract run and exits on
//     the FIRST valid receipt OR on a timeout — never a lingering open port.
//
// D-10: this module handles design variables ONLY. It NEVER touches the Figma
// token (that's a REST-path concern, not Path C). There is no secret-handling
// code here, and the logger seam receives lifecycle events + counts only —
// never full payloads.

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const Ajv = require('ajv');

const payloadSchema = require('./payload-schema.json');

// ── constants (D-06 acceptance criterion: hardcoded, no env override) ─────────
const RECEIVER_HOST = '127.0.0.1'; // loopback ONLY
const RECEIVER_PORT = 5179; // HARDCODED — intentionally not read from process.env

// The marker digest.cjs (31-02) keys on to route variables.json to Path C.
const PLUGIN_PAYLOAD_MARKER = 'gdd-plugin';

// Defensive body cap. Large design systems can ship sizeable variable sets
// (the risk register notes streaming for the raw pull); 50MB is generous for a
// variables-only JSON payload while still bounding memory from a hostile body.
const MAX_BODY_BYTES = 50 * 1024 * 1024;

// ── validator (Ajv is a hard repo dependency — package.json "ajv": "^8.18.0") ─
// Compiled once at module load. Ajv 8 CJS: require('ajv') is the constructor.
const AjvCtor = Ajv.default || Ajv;
const _ajv = new AjvCtor({ strict: false, allErrors: true });
const _validate = _ajv.compile(payloadSchema);

/**
 * Validate a parsed body against payload-schema.json.
 * @param {*} body
 * @returns {{ valid: boolean, errors: Array }}
 */
function validatePayload(body) {
  const valid = _validate(body) === true;
  return { valid, errors: valid ? [] : (_validate.errors || []) };
}

/** Normalize req.socket.remoteAddress to a loopback test (IPv4, IPv6, mapped). */
function isLoopbackRemote(remoteAddress) {
  return (
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1'
  );
}

/** Read the full request body with a hard size cap. Rejects on overflow. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** No-op logger fallback. The real seam receives lifecycle events + counts only. */
function emit(logger, event) {
  if (typeof logger === 'function') {
    try {
      logger(event);
    } catch {
      /* a broken logger must never crash the receiver */
    }
  }
}

/**
 * Build the request handler. Exported (`createHandler`) so tests can exercise
 * the loopback gate / routing synchronously by invoking it with a fake req/res
 * — no real remote socket needed (D-06 refusal path is asserted this way).
 *
 * The `onReceipt(parsed, filePath)` callback is invoked exactly once, on the
 * first VALID localhost POST, AFTER the file is written. startReceiver wires it
 * to close the server + resolve. Non-localhost (403), bad route (404), parse
 * error / schema-invalid (400) NEVER call onReceipt — the server keeps waiting.
 *
 * @param {object} opts
 * @param {string} opts.outDir
 * @param {Function} [opts.logger]
 * @param {Function} opts.onReceipt  async (parsed, filePath) => void
 * @returns {Function} (req, res) => void
 */
function createHandler({ outDir, logger, onReceipt }) {
  return function handler(req, res) {
    // (1) Loopback gate FIRST (D-06) — defense in depth on top of the bind.
    const remoteAddress = req.socket && req.socket.remoteAddress;
    if (!isLoopbackRemote(remoteAddress)) {
      emit(logger, { event: 'reject-403', reason: 'non-localhost' });
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden: non-localhost');
      return;
    }

    // (2) Route — only POST /variables is handled.
    if (req.method !== 'POST' || req.url !== '/variables') {
      emit(logger, { event: 'reject-404', method: req.method, url: req.url });
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }

    // (3) Read + parse + validate + write. Any thrown error → 500 (no crash).
    readBody(req)
      .then(async (raw) => {
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          emit(logger, { event: 'reject-400', reason: 'malformed-json' });
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'malformed-json' }));
          return;
        }

        const { valid, errors } = validatePayload(parsed);
        if (!valid) {
          emit(logger, { event: 'reject-400', reason: 'schema', errorCount: errors.length });
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'schema', details: errors }));
          return;
        }

        // Valid. Stamp the marker if (defensively) absent, then write the file.
        if (parsed.source !== PLUGIN_PAYLOAD_MARKER) parsed.source = PLUGIN_PAYLOAD_MARKER;
        const filePath = path.join(outDir, 'variables.json');
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(parsed));

        emit(logger, {
          event: 'receipt',
          path: filePath,
          collections: Array.isArray(parsed.collections) ? parsed.collections.length : 0,
          variables: Array.isArray(parsed.variables) ? parsed.variables.length : 0,
        });

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

        if (typeof onReceipt === 'function') await onReceipt(parsed, filePath);
      })
      .catch((err) => {
        // Body-too-large or unexpected I/O error. Do NOT leak internals; do NOT
        // resolve the receipt. 500 keeps the server waiting for a retry.
        emit(logger, { event: 'error', message: err && err.message });
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'internal' }));
        }
      });
  };
}

/**
 * Start the ephemeral Path C receiver.
 *
 * @param {object} opts
 * @param {string} opts.outDir              REQUIRED — writes <outDir>/variables.json on valid receipt
 * @param {number} [opts.timeoutMs=120000]  exits if no valid payload arrives in time
 * @param {Function} [opts.logger]          structured lifecycle sink (never receives secrets/full payloads)
 * @returns {Promise<{received:true, path:string} | {received:false, reason:'timeout'}>}
 *
 * Resolves with `{received:true, path}` on the FIRST valid POST /variables, or
 * `{received:false, reason:'timeout'}` on timeout. The server is closed on BOTH
 * exit paths (ephemeral — D-06). Non-localhost → 403; schema-invalid → 400;
 * neither resolves the promise (the server keeps waiting until receipt/timeout).
 */
function startReceiver({ outDir, timeoutMs = 120000, logger } = {}) {
  if (!outDir) {
    return Promise.reject(new TypeError('startReceiver: opts.outDir is required'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    let server = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Close the server on BOTH exit paths so the port is never left open and
      // the event loop can drain (process can exit). close() is idempotent-safe.
      if (server) server.close(() => resolve(result));
      else resolve(result);
    };

    const handler = createHandler({
      outDir,
      logger,
      onReceipt: (_parsed, filePath) => finish({ received: true, path: filePath }),
    });

    server = http.createServer(handler);

    server.on('error', (err) => {
      // Most likely EADDRINUSE (another receiver already bound 5179) — surface
      // it to the caller rather than hanging. Only meaningful before listen.
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        reject(err);
      }
    });

    server.listen(RECEIVER_PORT, RECEIVER_HOST, () => {
      emit(logger, { event: 'listen', host: RECEIVER_HOST, port: RECEIVER_PORT });
      // Arm the timeout only once we are actually listening.
      timer = setTimeout(() => {
        emit(logger, { event: 'timeout', timeoutMs });
        finish({ received: false, reason: 'timeout' });
      }, timeoutMs);
      // Don't let the timeout itself keep the process alive past its purpose.
      if (typeof timer.unref === 'function') timer.unref();
    });
  });
}

module.exports = {
  startReceiver,
  createHandler,
  validatePayload,
  isLoopbackRemote,
  RECEIVER_PORT,
  RECEIVER_HOST,
  PLUGIN_PAYLOAD_MARKER,
};
