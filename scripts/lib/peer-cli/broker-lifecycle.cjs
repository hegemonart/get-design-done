// scripts/lib/peer-cli/broker-lifecycle.cjs
//
// Plan 27-03 — long-lived broker session per (peer, workspace).
//
// ============================================================================
// WHY A BROKER, NOT PER-CALL SPAWN — Phase 27 D-03
// ============================================================================
//
// Cold-spawning an ACP/ASP peer-CLI session for every delegated agent call
// re-runs the JSON-RPC `initialize` handshake every time. On a real cycle
// with N delegated calls (gemini-research, codex-execute, cursor-debug, ...),
// that's N handshakes × ~200-800ms each = a measurable latency tax that
// erases most of the cost arbitrage win.
//
// Instead, we keep ONE long-lived peer-CLI process per `(peer, workspace)`
// tuple — the "broker" — and route delegated calls to it via:
//
//   - POSIX:    Unix domain socket at
//               `~/.gdd/peer-brokers/<peer>-<workspace-hash>.sock`
//   - Windows:  named pipe at
//               `\\.\pipe\gdd-peer-broker-<peer>-<workspace-hash>`
//
// Brokers live BETWEEN gdd cycles. Closing this client's connection does
// NOT shut down the broker — multiple cycles re-attach to the same broker
// process. The broker is reaped by an external lifecycle manager (TBD in
// Plan 27-06 integration) or by an idle-timeout the broker itself enforces.
//
// This module is the CLIENT-SIDE surface only. It connects, sends JSON-RPC
// frames, awaits replies, and disconnects. It does NOT implement the broker
// server itself — that's a separate concern (likely a small persistent
// process started by the registry on first dispatch). For tests we mock
// the underlying transport entirely; real broker spawn/reap is exercised
// in Plan 27-06's integration harness.
//
// ============================================================================
// CONTRACT
// ============================================================================
//
//     const broker = createBroker({
//       peer:      'gemini',         // peer ID; matches adapters/<peer>.cjs
//       workspace: '/repo',          // absolute repo path
//       transport: 'acp',            // 'acp' or 'asp'
//     });
//     await broker.connect();
//     broker.send({ id: 1, method: 'initialize', params: {...} });
//     const reply = await broker.receive(5000);  // ms timeout
//     await broker.close();
//
//   Properties:
//     - send() is non-blocking; replies arrive via receive()
//     - receive() resolves with the next pending reply OR rejects on timeout
//     - send() throws BrokerBusyError when the in-flight queue exceeds
//       MAX_PENDING (D-03 backpressure: 100)
//     - close() releases this client's transport handle but does NOT signal
//       the broker process to terminate
//
// ============================================================================
// BACKPRESSURE
// ============================================================================
//
// Each client tracks its own pending-request queue. If the broker is slow
// (e.g., a long-running peer LLM call) and the caller fires sends faster
// than the broker drains, send() throws `BrokerBusyError` once the queue
// hits 100 in-flight. This is intentional: a stuck broker should surface
// as "your peer is wedged" rather than silently inflating memory until the
// process OOMs. The session-runner (Plan 27-06) catches BrokerBusyError
// and falls back to local Anthropic SDK on this dispatch — same fallback
// path as peer-absent / peer-error per D-07.

'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');

const MAX_PENDING = 100;
const DEFAULT_RECEIVE_TIMEOUT_MS = 30_000;

/**
 * Thrown by `send()` when this client's pending-request queue is at the
 * `MAX_PENDING` ceiling. Session-runner catches this and falls back.
 */
class BrokerBusyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrokerBusyError';
    this.code = 'EBROKERBUSY';
  }
}

/**
 * Thrown by `receive()` when no reply arrives within the timeout window.
 */
class BrokerTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrokerTimeoutError';
    this.code = 'EBROKERTIMEOUT';
  }
}

/**
 * Compute the platform-appropriate broker endpoint for a (peer, workspace).
 *
 * POSIX → `~/.gdd/peer-brokers/<peer>-<hash>.sock`
 * Windows → `\\.\pipe\gdd-peer-broker-<peer>-<hash>`
 *
 * The workspace hash is a short SHA-256 prefix of the absolute workspace
 * path; we don't include the literal path in the socket name because:
 *   - sockets have a length limit (~104 bytes on macOS) that long repo
 *     paths blow through, and
 *   - paths contain `/` and other chars that make filenames awkward.
 *
 * @param {object} args
 * @param {string} args.peer       e.g. 'gemini'
 * @param {string} args.workspace  absolute path to the workspace root
 * @param {NodeJS.Platform} [args.platform] override; tests inject 'win32'
 * @returns {string} endpoint path or named-pipe address
 */
function brokerEndpoint({ peer, workspace, platform } = {}) {
  if (typeof peer !== 'string' || peer.length === 0) {
    throw new TypeError('brokerEndpoint: peer must be a non-empty string');
  }
  if (typeof workspace !== 'string' || workspace.length === 0) {
    throw new TypeError('brokerEndpoint: workspace must be a non-empty string');
  }
  const plat = platform || process.platform;
  const hash = crypto
    .createHash('sha256')
    .update(workspace)
    .digest('hex')
    .slice(0, 12);

  if (plat === 'win32') {
    return `\\\\.\\pipe\\gdd-peer-broker-${peer}-${hash}`;
  }
  return path.join(os.homedir(), '.gdd', 'peer-brokers', `${peer}-${hash}.sock`);
}

/**
 * @typedef {object} BrokerOptions
 * @property {string} peer       peer-CLI ID (e.g. 'gemini', 'codex')
 * @property {string} workspace  absolute workspace path
 * @property {'acp'|'asp'} transport
 * @property {string} [endpoint] override the computed endpoint (test/escape hatch)
 * @property {(endpoint: string) => any} [connectFn]  test injection: must return
 *   an object with `.write(line: string) → boolean`, `.end()`, and EventEmitter
 *   semantics for `data` (Buffer chunks) + `error` + `close`. Default: `net.createConnection`.
 * @property {NodeJS.Platform} [platform]  override for endpoint computation
 * @property {number} [maxPending]  override MAX_PENDING (test only)
 */

/**
 * @typedef {object} BrokerHandle
 * @property {() => Promise<void>} connect
 * @property {(message: object) => void} send
 * @property {(timeoutMs?: number) => Promise<object>} receive
 * @property {() => Promise<void>} close
 * @property {() => number} pendingCount  current in-flight send count
 * @property {string} endpoint
 */

/**
 * Create a client handle for a peer broker. Idempotent connect — calling
 * `.connect()` twice on the same handle is a no-op after the first.
 *
 * @param {BrokerOptions} opts
 * @returns {BrokerHandle}
 */
function createBroker(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('createBroker: opts object required');
  }
  const { peer, workspace, transport } = opts;
  if (transport !== 'acp' && transport !== 'asp') {
    throw new TypeError(
      `createBroker: transport must be 'acp' or 'asp', got ${JSON.stringify(transport)}`,
    );
  }

  const endpoint =
    opts.endpoint ||
    brokerEndpoint({ peer, workspace, platform: opts.platform });
  const connectFn = opts.connectFn || ((ep) => net.createConnection(ep));
  const maxPending =
    Number.isFinite(opts.maxPending) && opts.maxPending > 0
      ? opts.maxPending
      : MAX_PENDING;

  /** @type {any} the underlying socket / fake transport */
  let socket = null;
  let connected = false;
  let connecting = null;
  let closed = false;

  // Inbound replies that have been parsed but not yet handed to a receive() caller.
  /** @type {object[]} */
  const inbox = [];
  // receive() callers waiting for the next reply. FIFO.
  /** @type {Array<{resolve: (m: object) => void, reject: (e: Error) => void, timer: NodeJS.Timeout | null}>} */
  const waiters = [];
  // Send-side accounting: count of outgoing requests that have not yet been
  // matched by a corresponding inbound reply. We use this for backpressure
  // — when this hits maxPending, send() throws BrokerBusyError.
  let pending = 0;

  // Line-buffer for newline-delimited JSON. ACP and ASP both frame messages
  // with a single `\n` separator; partial chunks are common because TCP /
  // domain-socket reads can split frames anywhere.
  let lineBuf = '';

  function deliver(message) {
    // Decrement pending: every inbound message that matches a sent request
    // frees one slot. We don't try to correlate request IDs here — that's
    // the protocol layer's job (acp-client / asp-client). At the broker
    // level we just count round-trips so backpressure is meaningful.
    if (pending > 0) pending -= 1;

    const next = waiters.shift();
    if (next) {
      if (next.timer) clearTimeout(next.timer);
      next.resolve(message);
    } else {
      inbox.push(message);
    }
  }

  function fail(err) {
    // Reject all pending receivers; future send() calls fail because the
    // socket is gone.
    while (waiters.length > 0) {
      const w = waiters.shift();
      if (w.timer) clearTimeout(w.timer);
      w.reject(err);
    }
    connected = false;
  }

  function onData(chunk) {
    lineBuf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let nl;
    while ((nl = lineBuf.indexOf('\n')) >= 0) {
      const line = lineBuf.slice(0, nl).trim();
      lineBuf = lineBuf.slice(nl + 1);
      if (line.length === 0) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (e) {
        // Malformed frame from the broker — surface as an error to anyone
        // waiting; flush the rest of the buffer to avoid wedging on a
        // poison frame.
        fail(new Error(`broker: malformed JSON frame: ${e.message}`));
        return;
      }
      deliver(parsed);
    }
  }

  function attachSocket(sock) {
    socket = sock;
    sock.on('data', onData);
    sock.on('error', (e) => fail(e));
    sock.on('close', () => {
      // Treat unexpected close as an error for any in-flight callers, but
      // don't synthesize an error if the consumer initiated close().
      if (!closed) {
        fail(new Error('broker: connection closed unexpectedly'));
      }
      connected = false;
    });
  }

  async function connect() {
    if (connected) return;
    if (connecting) return connecting;
    if (closed) {
      throw new Error('broker: cannot reconnect a closed handle');
    }
    connecting = new Promise((resolve, reject) => {
      let sock;
      try {
        sock = connectFn(endpoint);
      } catch (e) {
        reject(e);
        return;
      }
      // If the underlying transport supports a 'connect' / 'ready' event,
      // wait for it. Otherwise (e.g., test fakes that are synchronously
      // ready) fall through to immediate resolve.
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        if (err) {
          reject(err);
        } else {
          attachSocket(sock);
          connected = true;
          resolve();
        }
      };
      // Most net.Socket / mock transports support .once('connect').
      if (typeof sock.once === 'function') {
        sock.once('connect', () => finish(null));
        sock.once('error', (e) => finish(e));
      } else {
        // Synchronous fake: assume already connected.
        queueMicrotask(() => finish(null));
      }
    });
    try {
      await connecting;
    } finally {
      connecting = null;
    }
  }

  function send(message) {
    if (closed) {
      throw new Error('broker: send on closed handle');
    }
    if (!connected) {
      throw new Error('broker: send before connect');
    }
    if (pending >= maxPending) {
      throw new BrokerBusyError(
        `broker: ${pending} pending requests at MAX_PENDING=${maxPending}`,
      );
    }
    const line = JSON.stringify(message) + '\n';
    pending += 1;
    // We deliberately do not await drain() here — line-delimited JSON-RPC
    // is small (typically < 4KB per frame); the kernel buffer absorbs it.
    // If a future workload changes that, switch to a write-with-drain queue.
    socket.write(line);
  }

  function receive(timeoutMs) {
    if (closed) {
      return Promise.reject(new Error('broker: receive on closed handle'));
    }
    // Fast path: a reply arrived before anyone was waiting.
    if (inbox.length > 0) {
      return Promise.resolve(inbox.shift());
    }
    const ms = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_RECEIVE_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        // Remove from queue so a late-arriving reply doesn't resolve a
        // caller that already gave up.
        const idx = waiters.indexOf(waiter);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(
          new BrokerTimeoutError(`broker: receive timeout after ${ms}ms`),
        );
      }, ms);
      // Allow the process to exit even if a receive() is outstanding —
      // matches the behavior of net.Socket which is also unref-friendly.
      if (waiter.timer && typeof waiter.timer.unref === 'function') {
        waiter.timer.unref();
      }
      waiters.push(waiter);
    });
  }

  async function close() {
    if (closed) return;
    closed = true;
    // Reject any outstanding waiters — the consumer is going away.
    while (waiters.length > 0) {
      const w = waiters.shift();
      if (w.timer) clearTimeout(w.timer);
      w.reject(new Error('broker: handle closed'));
    }
    if (socket && typeof socket.end === 'function') {
      try {
        socket.end();
      } catch {
        // Best-effort close — broker may already be gone.
      }
    }
    connected = false;
  }

  return {
    connect,
    send,
    receive,
    close,
    pendingCount: () => pending,
    endpoint,
  };
}

module.exports = {
  createBroker,
  brokerEndpoint,
  BrokerBusyError,
  BrokerTimeoutError,
  MAX_PENDING,
};
