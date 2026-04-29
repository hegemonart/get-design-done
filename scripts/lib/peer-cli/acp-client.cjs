// scripts/lib/peer-cli/acp-client.cjs
//
// Plan 27-01 — Agent Client Protocol (ACP) client.
//
// Protocol shape adapted from greenpolo/cc-multi-cli `acp-client.mjs`
// (Apache 2.0). See NOTICE for full attribution (added by Plan 27-12).
//
// ACP is the line-delimited JSON-RPC 2.0 transport spoken by the Gemini,
// Cursor, Copilot, and Qwen CLIs when launched in their `acp` mode. We
// drive a child process over stdio, send framed JSON requests on stdin,
// and read framed JSON responses + notifications off stdout. Every
// outbound request gets a numeric `id`; the server's reply is correlated
// back via that id. Server-pushed notifications (`agent_message_chunk`,
// `tool_call`, `file_change`, etc.) lack an id and are surfaced through
// the `onNotification` callback supplied to `prompt()`.
//
// Wire framing:
//   send:    `<json>\n` over stdin.
//   recv:    `<json>\n` over stdout, line-delimited.
//
// The framing layer must handle three real-world conditions:
//   (a) multiple complete JSON messages arriving in one stdout chunk,
//   (b) a single JSON message split across multiple stdout chunks, and
//   (c) misbehaved peer never emitting a newline — we cap the buffered
//       line length at 16 MiB and reject the active prompt rather than
//       grow memory unbounded.
//
// Module exports:
//   createAcpClient({command, args, cwd, env}) -> AcpClient
//
// AcpClient:
//   initialize(params) -> Promise<result>
//     First call after spawn. Sends the JSON-RPC `initialize` request
//     with the negotiated `protocolVersion` + `clientCapabilities` and
//     resolves with the server's capability reply.
//
//   prompt(text, opts) -> Promise<result>
//     Sends a `prompt` request. Notifications received between request
//     send and response receive are forwarded to opts.onNotification(n).
//     Resolves with the final `result` payload tied to the request id.
//
//   close() -> Promise<void>
//     Sends SIGTERM to the child, waits for exit, drains any in-flight
//     promises with a "client closed" rejection.
//
// This module has no external dependencies — only Node built-ins
// (`child_process`, `events`).

'use strict';

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

/**
 * Hard cap on the size of a single un-terminated line read from the
 * peer's stdout. If the peer streams more than this without a `\n`, we
 * treat it as a protocol violation and reject all pending requests.
 * 16 MiB is well above any legitimate ACP payload (largest observed in
 * cc-multi-cli traces is ~2 MiB for tool-call results with embedded
 * file diffs) but small enough that a runaway peer can't OOM the host.
 */
const MAX_LINE_BYTES = 16 * 1024 * 1024;

/**
 * Default ACP protocol version we negotiate with. Callers can override
 * via `initialize({ protocolVersion: '...' })`. The current Gemini /
 * Cursor / Copilot / Qwen CLIs all advertise `2025-06-18` as of writing.
 */
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

/**
 * Create an ACP client wrapping a freshly spawned peer-CLI process.
 *
 * @param {object} opts
 * @param {string} opts.command  Absolute path (or PATH-resolvable name)
 *   to the peer-CLI binary. The caller is responsible for resolving
 *   peer-binary location (Plan 27-11 ships `peerBinary` on runtimes.cjs
 *   for that). On Windows, `.cmd` shims need the spawn-cmd.cjs
 *   workaround (Plan 27-03) — this module does NOT apply that shim
 *   itself, callers must wrap.
 * @param {string[]} [opts.args=[]]  Extra args to the peer binary;
 *   typical value is `['acp']` to launch the peer in ACP mode.
 * @param {string} [opts.cwd=process.cwd()]  Working directory for the
 *   child process.
 * @param {Record<string,string>} [opts.env]  Environment overrides.
 *   Defaults to inheriting from process.env.
 * @returns {{
 *   initialize: (params: object) => Promise<unknown>,
 *   prompt: (text: string, opts?: object) => Promise<unknown>,
 *   close: () => Promise<void>,
 *   on: (event: string, listener: Function) => void,
 *   pid: number | undefined,
 * }}
 */
function createAcpClient(opts) {
  if (!opts || typeof opts.command !== 'string' || opts.command.length === 0) {
    throw new TypeError('createAcpClient: opts.command (string) is required');
  }
  const command = opts.command;
  const args = Array.isArray(opts.args) ? opts.args : [];
  const cwd = typeof opts.cwd === 'string' ? opts.cwd : process.cwd();
  const env = opts.env && typeof opts.env === 'object' ? opts.env : process.env;

  const events = new EventEmitter();

  // Spawn the child. We use plain `spawn` (no shell) — Windows `.cmd`
  // dispatch is the caller's responsibility (Plan 27-03 spawn-cmd.cjs).
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  // Per-request correlation. Server replies carry the id we sent; we
  // resolve/reject the matching pending entry. Notifications (no id)
  // bypass this map and route to the active prompt's onNotification.
  let nextRequestId = 1;
  /** @type {Map<number, {resolve: Function, reject: Function, onNotification?: Function}>} */
  const pending = new Map();

  // The id of the request whose notifications we currently surface.
  // ACP is half-duplex per stream — only one prompt is in flight at
  // once from the host's perspective — so we track it as a single ref.
  let activeNotificationTargetId = null;

  // Closure / error state.
  let closed = false;
  /** @type {Error | null} */
  let fatalError = null;

  // Line-buffer state. Stdout chunks accumulate here; each `\n` flushes
  // a complete JSON message into handleMessage().
  let lineBuffer = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', onStdoutData);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    // Surface stderr verbatim so callers can wire it into Phase 22
    // event chain or simple debug logging without us imposing a
    // structure on it.
    events.emit('stderr', chunk);
  });
  child.on('error', (err) => {
    fail(err);
  });
  child.on('exit', (code, signal) => {
    events.emit('exit', { code, signal });
    if (!closed) {
      // Unexpected exit → fail every in-flight request.
      fail(new Error(`ACP peer exited unexpectedly (code=${code}, signal=${signal})`));
    }
  });

  /**
   * Append a stdout chunk to the line buffer and flush every complete
   * line. A "line" is everything up to (but not including) a `\n`.
   * Lines longer than MAX_LINE_BYTES indicate a malformed peer stream
   * — we tear the client down with an error so callers don't OOM.
   */
  function onStdoutData(chunk) {
    if (fatalError) return;
    lineBuffer += chunk;

    if (lineBuffer.length > MAX_LINE_BYTES) {
      // We measured length in code units (UTF-16) but the cap is in
      // bytes; this is an over-eager check (UTF-16 length <= UTF-8
      // byte count is not always true, but for our payloads of mostly
      // ASCII JSON the two are within a small constant). The intent
      // is "no peer should ever emit this much without a newline" —
      // exact byte accounting isn't worth the Buffer churn here.
      fail(new Error(
        `ACP peer emitted ${lineBuffer.length} bytes without a newline ` +
        `(cap: ${MAX_LINE_BYTES} bytes) — protocol violation`,
      ));
      return;
    }

    let newlineIdx;
    while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
      const line = lineBuffer.slice(0, newlineIdx);
      lineBuffer = lineBuffer.slice(newlineIdx + 1);
      if (line.length === 0) continue; // tolerate keep-alive blank lines
      handleLine(line);
    }
  }

  /**
   * Parse one JSON-RPC frame and dispatch it to either the response
   * correlation table (if it has an `id` matching a pending request)
   * or the active notification sink.
   */
  function handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      // Malformed JSON from the peer is a protocol violation but not
      // necessarily fatal — the peer may recover on the next line.
      // Surface it so callers can log, but keep going.
      events.emit('parse_error', { line, error: err });
      return;
    }

    // Standard JSON-RPC 2.0 dispatch:
    //   - response  : has `id` AND (`result` OR `error`)
    //   - notification : has `method` AND no `id`
    //   - request from server (e.g. tool_call back-channel) : has `id`
    //     AND `method`. ACP peers can issue these; for v1 we treat
    //     them as notifications (callers handle via onNotification).
    //
    // We dispatch in priority: response first (id present + no method),
    // then notifications (method present).
    const hasId = Object.prototype.hasOwnProperty.call(msg, 'id') && msg.id !== null;
    const hasMethod = typeof msg.method === 'string';

    if (hasId && !hasMethod) {
      const entry = pending.get(msg.id);
      if (!entry) {
        // Unknown id — peer replied to a request we didn't send (or
        // we already timed it out). Surface for diagnostic but ignore.
        events.emit('orphan_response', msg);
        return;
      }
      pending.delete(msg.id);
      if (msg.id === activeNotificationTargetId) {
        activeNotificationTargetId = null;
      }
      if (msg.error) {
        const err = new Error(
          (msg.error && msg.error.message) || 'ACP peer returned error',
        );
        // Preserve the JSON-RPC error envelope so callers can inspect
        // .code and .data without losing typing.
        err.code = msg.error.code;
        err.data = msg.error.data;
        entry.reject(err);
      } else {
        entry.resolve(msg.result);
      }
      return;
    }

    if (hasMethod) {
      // Notification (or server-issued request — same handling for v1).
      if (activeNotificationTargetId !== null) {
        const entry = pending.get(activeNotificationTargetId);
        if (entry && typeof entry.onNotification === 'function') {
          try {
            entry.onNotification(msg);
          } catch (err) {
            // Caller's notification handler threw — surface but don't
            // tear down the protocol stream.
            events.emit('notification_handler_error', { error: err, notification: msg });
          }
        }
      }
      // Always emit on the EventEmitter too, so callers without an
      // active prompt (e.g. health monitor) can still observe.
      events.emit('notification', msg);
      return;
    }

    // Neither id+result nor method — malformed. Surface for diagnostic.
    events.emit('protocol_violation', msg);
  }

  /**
   * Send a JSON-RPC request and return a Promise resolving to its
   * `result`. Caller-supplied `onNotification` is fired for every
   * notification received between send and reply.
   */
  function sendRequest(method, params, onNotification) {
    if (closed) {
      return Promise.reject(new Error('ACP client is closed'));
    }
    if (fatalError) {
      return Promise.reject(fatalError);
    }
    const id = nextRequestId++;
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onNotification });
      activeNotificationTargetId = id;
      const ok = child.stdin.write(frame + '\n', 'utf8', (err) => {
        if (err) {
          pending.delete(id);
          if (activeNotificationTargetId === id) activeNotificationTargetId = null;
          reject(err);
        }
      });
      // Backpressure: `write` returning false signals the kernel buffer
      // is full. For a JSON-RPC line of typical size (<10 KiB) this is
      // exceedingly rare; we don't block on `drain` but trust Node's
      // internal queue. If a pathological peer stalls reads, the
      // kernel buffer fills and write throws via the callback above.
      void ok;
    });
  }

  /**
   * Tear down all in-flight promises with the given error. Safe to
   * call multiple times — subsequent calls are no-ops.
   */
  function fail(err) {
    if (fatalError) return;
    fatalError = err;
    for (const [, entry] of pending) {
      try { entry.reject(err); } catch { /* ignore */ }
    }
    pending.clear();
    activeNotificationTargetId = null;
  }

  /** ACP `initialize` — first call after spawn. */
  function initialize(params) {
    const merged = Object.assign(
      { protocolVersion: DEFAULT_PROTOCOL_VERSION, clientCapabilities: {} },
      params || {},
    );
    return sendRequest('initialize', merged);
  }

  /** ACP `prompt` — primary turn-driver. */
  function prompt(text, promptOpts) {
    const params = Object.assign({ text }, (promptOpts && promptOpts.params) || {});
    const onNotification = promptOpts && typeof promptOpts.onNotification === 'function'
      ? promptOpts.onNotification
      : undefined;
    return sendRequest('prompt', params, onNotification);
  }

  /** Gracefully terminate the peer; resolves once the child exits. */
  function close() {
    if (closed) return Promise.resolve();
    closed = true;
    return new Promise((resolve) => {
      const onExit = () => {
        fail(new Error('ACP client is closed'));
        resolve();
      };
      if (child.exitCode !== null || child.signalCode !== null) {
        // Already exited.
        onExit();
        return;
      }
      child.once('exit', onExit);
      try {
        child.stdin.end();
      } catch { /* ignore */ }
      // Give the peer a moment to exit on its own after stdin EOF.
      // 500ms is well above ACP cleanup time observed in cc-multi-cli.
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
        }
      }, 500);
    });
  }

  return {
    initialize,
    prompt,
    close,
    on: events.on.bind(events),
    get pid() { return child.pid; },
  };
}

module.exports = {
  createAcpClient,
  MAX_LINE_BYTES,
  DEFAULT_PROTOCOL_VERSION,
};
