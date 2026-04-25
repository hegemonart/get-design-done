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
const { readFileSync, existsSync } = require('node:fs');
const { probeOptional } = require('../probe-optional.cjs');

const ws = probeOptional('ws');
if (!ws) {
  // Importer (gdd-events.mjs) handles this throw and renders the hint.
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
 * Start the WebSocket server. Returns a handle with `close()`.
 *
 * @param {{
 *   port: number,
 *   token: string,
 *   tailFrom?: string,
 *   subscribe?: (handler: (ev: unknown) => void) => () => void,
 * }} opts
 * @returns {Promise<{close: () => void, port: number}>}
 */
async function startServer(opts) {
  if (typeof opts.port !== 'number' || !Number.isFinite(opts.port)) {
    throw new TypeError('startServer: port (number) required');
  }
  if (typeof opts.token !== 'string' || opts.token.length < 8) {
    throw new TypeError('startServer: token (string, ≥8 chars) required');
  }

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
    if (!auth || auth !== `Bearer ${opts.token}`) {
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
    httpServer.listen(opts.port, () => resolve(undefined));
  });

  const addr = httpServer.address();
  return {
    port: typeof addr === 'object' && addr ? addr.port : opts.port,
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
