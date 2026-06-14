/**
 * transports/ws.cjs — WebSocket event-stream transport (Plan 22-07).
 *
 * Optional dep: requires `ws`. probeOptional() returns null if absent;
 * importer renders a clear install hint.
 *
 * Wire format:
 *   * One event per WebSocket text frame, JSON-encoded.
 *   * If `tailFrom` is supplied at startup, replay that file's contents
 *     to each new connection BEFORE subscribing to live events.
 *   * Live events come from a caller-supplied `subscribe(handler) →
 *     unsub` — typically the event-stream bus's subscribeAll. Decoupling
 *     keeps this CommonJS module independent of the TS bus implementation.
 *
 * Auth:
 *   * `Authorization: Bearer <token>` header required on the upgrade.
 *   * Mismatched / missing token → HTTP 401 close on the upgrade socket.
 *
 * Backpressure:
 *   * Fire-and-forget. If a client's socket is not in OPEN state we drop
 *     the event for that client and log a warning. No queue.
 */

'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const { probeOptional } = require('../probe-optional.cjs');

const ws = probeOptional('ws');
if (!ws) {
  // Importer (hone-events.mjs) handles this throw and renders the hint.
  throw new Error(
    "ws module not installed (optional dep). Install via: npm i -D ws",
  );
}
const { WebSocketServer } = ws;

/**
 * Synchronously read a JSONL events file and yield parsed objects.
 * Matches reader.ts line semantics: skip blank lines + invalid JSON.
 *
 * @param {string} path
 * @returns {Generator<Record<string, unknown>>}
 */
function* readEventsSync(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    try {
      yield JSON.parse(line);
    } catch {
      /* skip invalid */
    }
  }
}

/**
 * Defensively read `.design/config.json`. Returns the parsed object or `{}`
 * on ANY failure (missing file, bad JSON, read error) — NEVER throws. The
 * transport must still start when no config is present, so this mirrors the
 * house defensive-fs idiom.
 *
 * @returns {Record<string, any>}
 */
function readDesignConfig() {
  try {
    const cfgPath = path.join(process.cwd(), '.design', 'config.json');
    if (!existsSync(cfgPath)) return {};
    const parsed = JSON.parse(readFileSync(cfgPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the bind host once, before listen (D-04). Order:
 *   opts.host → env GDD_WS_BIND_HOST → .design/config.json#event_stream.bind_host → '127.0.0.1'
 * The DEFAULT (no opt, no env, no config) is loopback only — remote bind is
 * an explicit operator opt-in.
 *
 * @param {{ host?: unknown }} opts
 * @returns {string}
 */
function resolveBindHost(opts) {
  if (typeof opts.host === 'string' && opts.host.trim()) {
    return opts.host.trim();
  }
  const envHost = process.env['GDD_WS_BIND_HOST'];
  if (typeof envHost === 'string' && envHost.trim()) {
    return envHost.trim();
  }
  const cfg = readDesignConfig();
  const cfgHost =
    cfg && cfg.event_stream && typeof cfg.event_stream.bind_host === 'string'
      ? cfg.event_stream.bind_host.trim()
      : '';
  if (cfgHost) return cfgHost;
  return '127.0.0.1';
}

/**
 * Start the WebSocket server. Returns a handle with `close()`.
 *
 * @param {{
 *   port: number,
 *   token: string,
 *   host?: string,
 *   tailFrom?: string,
 *   subscribe?: (handler: (ev: unknown) => void) => () => void,
 * }} opts
 * @returns {Promise<{close: () => void, port: number, host: string}>}
 */
async function startServer(opts) {
  if (typeof opts.port !== 'number' || !Number.isFinite(opts.port)) {
    throw new TypeError('startServer: port (number) required');
  }
  if (typeof opts.token !== 'string' || opts.token.length < 8) {
    throw new TypeError('startServer: token (string, ≥8 chars) required');
  }

  // Resolve the bind host once (D-04): default 127.0.0.1 (loopback only).
  const host = resolveBindHost(opts);

  const httpServer = http.createServer((_req, res) => {
    res.statusCode = 426; // Upgrade Required
    res.setHeader('Content-Type', 'text/plain');
    res.end('upgrade required');
  });

  const wss = new WebSocketServer({ noServer: true });

  /** @type {Set<import('ws').WebSocket>} */
  const clients = new Set();

  /** @type {() => void} */
  let unsub = () => {};
  if (typeof opts.subscribe === 'function') {
    unsub = opts.subscribe((ev) => {
      const frame = JSON.stringify(ev);
      for (const client of clients) {
        if (client.readyState === ws.OPEN) {
          try {
            client.send(frame);
          } catch (err) {
            try {
              process.stderr.write(`[ws] send failed: ${err.message}\n`);
            } catch {
              /* swallow */
            }
          }
        }
      }
    });
  }

  httpServer.on('upgrade', (req, socket, head) => {
    const auth = req.headers['authorization'];
    const expected = `Bearer ${opts.token}`;
    // Constant-time compare (D-04, D-12 node:crypto built-in). The length
    // pre-check is REQUIRED — timingSafeEqual throws on a length mismatch —
    // and is acceptable here because the secret is the TOKEN bytes, not its
    // length. A missing/short/mismatched token still yields the 401 close.
    const ok =
      typeof auth === 'string' &&
      Buffer.byteLength(auth) === Buffer.byteLength(expected) &&
      crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
    if (!ok) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      clients.add(client);

      if (opts.tailFrom) {
        try {
          for (const ev of readEventsSync(opts.tailFrom)) {
            try {
              client.send(JSON.stringify(ev));
            } catch {
              break;
            }
          }
        } catch (err) {
          try {
            process.stderr.write(`[ws] replay failed: ${err.message}\n`);
          } catch {
            /* swallow */
          }
        }
      }

      client.on('close', () => clients.delete(client));
      client.on('error', () => clients.delete(client));
    });
  });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, host, () => resolve(undefined));
  });

  const addr = httpServer.address();
  return {
    port: typeof addr === 'object' && addr ? addr.port : opts.port,
    host:
      typeof addr === 'object' && addr && typeof addr.address === 'string'
        ? addr.address
        : host,
    close() {
      try {
        unsub();
      } catch {
        /* swallow */
      }
      for (const c of clients) {
        try {
          c.close();
        } catch {
          /* swallow */
        }
      }
      clients.clear();
      try {
        wss.close();
      } catch {
        /* swallow */
      }
      try {
        httpServer.close();
      } catch {
        /* swallow */
      }
    },
  };
}

module.exports = { startServer, readEventsSync };
