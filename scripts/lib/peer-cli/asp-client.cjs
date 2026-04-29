// scripts/lib/peer-cli/asp-client.cjs
//
// Plan 27-02 — Codex App Server Protocol (ASP) client.
//
// Protocol shape adapted from greenpolo/cc-multi-cli `asp-client.mjs`
// (Apache 2.0). See NOTICE for full attribution.
//
// What this is:
//   ASP is the wire protocol the Codex CLI exposes when invoked as
//   `codex app-server`. Unlike ACP (which the four other peers speak —
//   Gemini / Cursor / Copilot / Qwen — and treats each call as a one-shot
//   prompt), ASP is THREAD-oriented: a long-lived conversation context
//   that holds across many turns. Codex's tool calls, tool results, and
//   reasoning traces all attach to a `threadId`.
//
// Wire format:
//   * Outbound (client → Codex): one JSON object per line, terminated by
//     `\n`, written to subprocess stdin. Same line-framing as ACP.
//   * Inbound (Codex → client): one JSON object per line on subprocess
//     stdout. Lines may be:
//       - Method-call results: { id, result }     ← correlated by `id`
//       - Method-call errors:  { id, error }      ← correlated by `id`
//       - Notifications:       { method, params } ← no `id`, streaming
//
// Method surface this client exposes:
//   * `threadStart(params)`           → resolves to { threadId, ... }
//   * `threadResume(threadId, params)` → resolves to thread state
//   * `turn(threadId, text, opts)`    → resolves to {status, content, usage}
//                                                  | {status: "error", error}
//
// Critical contract: turn() does NOT throw on Codex-reported errors.
// A `{status: "error"}` payload is a normal resolution path so the
// caller (registry / adapter / session-runner) can decide retry vs.
// fallback policy. turn() rejects only on transport-level breakage
// (process died mid-turn, line buffer overflow, malformed JSON the
// stream parser cannot recover from, an explicit `close()` call).
//
// Implementation details worth their salt:
//
//   1. Hand-rolled line-buffering. Node's built-in `readline` would work
//      but adds an event-loop hop per line and copies the buffer; the
//      hot path here is "10s of notifications per turn × N turns per
//      cycle", so we keep it cheap by carrying a `tail` string forward
//      across `data` events. Same approach the Phase 22 event-stream
//      writer uses for its file-tail reader.
//
//   2. 16 MiB overflow cap on a single un-newline-terminated line. If a
//      Codex tool dump (e.g. a giant file read) exceeds this, the client
//      rejects all in-flight requests, kills the subprocess, and goes
//      into a closed state. Without the cap a malformed `\n`-stripped
//      line would grow the buffer until OOM. Cap chosen for parity with
//      the ACP client (plan 27-01).
//
//   3. Per-turn notification fan-out. Each `turn()` registers a
//      `(threadId, turnId)` mailbox. Notifications carrying that turnId
//      are forwarded to the caller's `onNotification` hook (if any) and
//      collected in `notifications[]` for the final result. The mailbox
//      is torn down on completion regardless of status.
//
//   4. service_name is supplied by the caller on `threadStart`. The
//      canonical value gdd uses is `"gdd_peer_delegation"` (per Plan
//      27-02 contract); the registry layer (Plan 27-05) sets it. We
//      don't hard-code it here so unit tests can exercise multiple
//      service names without monkey-patching.
//
//   5. experimentalRawEvents defaults to `false` per Plan 27-02 contract
//      — gdd consumes structured turn output, not raw model tokens.
//      Callers that want token-level streaming pass `true` explicitly.
//
//   6. threadResume API surface exists for v1.28+ cross-cycle context
//      continuity. v1.27.0 always creates fresh threads via threadStart;
//      the registry layer (27-05) doesn't call threadResume. We expose
//      it now so future plans don't need an ASP-client breaking change.
//
// This module is `.cjs` (not `.ts`) per Phase 20-14 D-01 so it can be
// `require()`d from both the `.ts` runtime (session-runner, registry)
// and `.cjs` callers (broker-lifecycle in Plan 27-03) without needing
// `--experimental-strip-types` at every consumer site.

'use strict';

const { spawn } = require('node:child_process');

/** Per-line cap before we treat the stream as malformed. */
const MAX_LINE_BYTES = 16 * 1024 * 1024;

/** Default options. Overridable per-call. */
const DEFAULTS = Object.freeze({
  experimentalRawEvents: false,
});

/**
 * Create an ASP client wrapping a Codex subprocess.
 *
 * @param {object} opts
 * @param {string} opts.command           Path or command name (e.g. 'codex').
 * @param {string[]} [opts.args]          Default `['app-server']`.
 * @param {string} [opts.cwd]             Working directory for the subprocess.
 * @param {object} [opts.env]             Environment override.
 * @param {object} [opts.spawn]           Pre-built ChildProcess (test injection).
 * @returns {{
 *   threadStart: (params?: object) => Promise<{threadId: string, [k:string]: unknown}>,
 *   threadResume: (threadId: string, params?: object) => Promise<object>,
 *   turn: (threadId: string, text: string, opts?: {onNotification?: (n: object) => void, signal?: AbortSignal}) => Promise<object>,
 *   close: () => Promise<void>,
 *   readonly closed: boolean,
 * }}
 */
function createAspClient(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('createAspClient: opts is required');
  }
  if (typeof opts.command !== 'string' || opts.command.length === 0) {
    throw new TypeError('createAspClient: opts.command must be a non-empty string');
  }

  const args = Array.isArray(opts.args) ? opts.args : ['app-server'];
  const spawnOptions = {
    stdio: ['pipe', 'pipe', 'pipe'],
  };
  if (typeof opts.cwd === 'string' && opts.cwd.length > 0) spawnOptions.cwd = opts.cwd;
  if (opts.env && typeof opts.env === 'object') spawnOptions.env = opts.env;

  // Test-injection seam: callers (or unit tests) can supply a pre-built
  // ChildProcess so we don't actually fork a binary in tests. The mock
  // server in tests/fixtures/peer-cli/mock-asp-server.cjs runs as a
  // forked Node process and we wire it through this seam.
  const child = (opts.spawn && typeof opts.spawn === 'object')
    ? opts.spawn
    : spawn(opts.command, args, spawnOptions);

  // ── State ──────────────────────────────────────────────────────────────

  /** Monotonic request-id counter. */
  let nextId = 1;

  /** id → { resolve, reject } for in-flight method calls. */
  const pendingById = new Map();

  /** turnId → { resolve, reject, onNotification, notifications[] } for in-flight turns. */
  const turnsByTurnId = new Map();

  /**
   * Method-call requests that are awaiting a turn-start response —
   * keyed by request id. Once the response carries a turnId we
   * promote the entry into `turnsByTurnId`.
   */
  const turnsByRequestId = new Map();

  /** Stdout line buffer (carried forward across `data` events). */
  let stdoutBuf = '';

  /** True once close() ran or the process died. */
  let closed = false;

  /** Last fatal error — used to reject newly-arriving requests. */
  let fatalError = null;

  // ── Stream wiring ──────────────────────────────────────────────────────

  if (!child || !child.stdin || !child.stdout) {
    throw new Error('createAspClient: spawn() did not yield stdin/stdout streams');
  }

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', onStdoutData);
  child.stdout.on('end', () => onTransportClose(null));

  // We don't act on stderr — the broker-lifecycle (Plan 27-03) and
  // adapter layer (Plan 27-04) own logging policy. We DO consume it so
  // the buffer doesn't fill and back-pressure the subprocess.
  if (child.stderr && typeof child.stderr.resume === 'function') {
    child.stderr.resume();
  }

  child.on('error', (err) => onTransportClose(err));
  child.on('exit', (code, signal) => {
    const reason = (code === 0)
      ? null
      : new Error(`asp-client: subprocess exited (code=${code}, signal=${signal ?? 'null'})`);
    onTransportClose(reason);
  });

  // Don't let an EPIPE on stdin crash the host process — the subprocess
  // may close stdin first when shutting down, and we surface that as
  // fatalError via the exit handler above.
  child.stdin.on('error', () => { /* swallowed; exit handler is canonical */ });

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Start a new conversation thread. Resolves to the server's response
   * which MUST contain `threadId`.
   */
  function threadStart(params) {
    const merged = {
      experimentalRawEvents: DEFAULTS.experimentalRawEvents,
      ...(params && typeof params === 'object' ? params : {}),
    };
    return sendRequest('threadStart', merged);
  }

  /**
   * Resume an existing thread. Resolves to the server's response.
   */
  function threadResume(threadId, params) {
    if (typeof threadId !== 'string' || threadId.length === 0) {
      return Promise.reject(new TypeError('threadResume: threadId must be a non-empty string'));
    }
    const merged = {
      threadId,
      ...(params && typeof params === 'object' ? params : {}),
    };
    return sendRequest('threadResume', merged);
  }

  /**
   * Send one turn on a thread. Resolves to one of:
   *   { status: 'complete', content, usage, threadId, turnId, notifications }
   *   { status: 'error',    error,            threadId, turnId, notifications }
   *
   * Rejects only on transport breakage (subprocess died, client closed,
   * line buffer overflow, AbortSignal triggered).
   */
  function turn(threadId, text, callOpts) {
    if (typeof threadId !== 'string' || threadId.length === 0) {
      return Promise.reject(new TypeError('turn: threadId must be a non-empty string'));
    }
    if (typeof text !== 'string') {
      return Promise.reject(new TypeError('turn: text must be a string'));
    }

    const onNotification = (callOpts && typeof callOpts.onNotification === 'function')
      ? callOpts.onNotification
      : null;
    const signal = (callOpts && callOpts.signal && typeof callOpts.signal.addEventListener === 'function')
      ? callOpts.signal
      : null;

    if (closed) {
      return Promise.reject(fatalError || new Error('asp-client: client is closed'));
    }

    return new Promise((resolve, reject) => {
      const id = nextId++;
      const entry = {
        // Resolved either by a turn-completion notification (carrying
        // status + content/error) or by the method-call response if the
        // server chose to return the turn result inline.
        resolve,
        reject,
        onNotification,
        notifications: [],
        threadId,
        turnId: null, // populated by the method-response carrying turnId
        settled: false,
        signal,
        onAbort: null,
      };
      turnsByRequestId.set(id, entry);

      if (signal) {
        if (signal.aborted) {
          finalizeTurn(entry, /*reject*/ true, new Error('asp-client: turn aborted'));
          return;
        }
        entry.onAbort = () => {
          finalizeTurn(entry, /*reject*/ true, new Error('asp-client: turn aborted'));
        };
        signal.addEventListener('abort', entry.onAbort, { once: true });
      }

      const wireOk = writeJson({
        jsonrpc: '2.0',
        id,
        method: 'turn',
        params: { threadId, text },
      });
      if (!wireOk) {
        finalizeTurn(entry, /*reject*/ true, fatalError || new Error('asp-client: stdin write failed'));
      }
    });
  }

  /**
   * Tear down the subprocess and reject all in-flight requests.
   */
  function close() {
    if (closed) return Promise.resolve();
    onTransportClose(null);
    return new Promise((resolve) => {
      // Give the subprocess a moment to flush; force-kill on the
      // second tick if it's still alive. This mirrors the broker
      // lifecycle's shutdown contract (Plan 27-03).
      try { child.stdin.end(); } catch { /* already closed */ }
      const t = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch { /* already gone */ }
      }, 50);
      // If the child was already gone, exit fired before close() and
      // we resolve immediately on next tick.
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
      // Belt-and-braces: if 'exit' already fired before this listener
      // attaches, the callback above never runs. Resolve after a hard
      // cap so close() never deadlocks.
      setTimeout(resolve, 200).unref?.();
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────

  /**
   * Send a request and return a promise that resolves with the result
   * (or rejects on error / transport failure).
   */
  function sendRequest(method, params) {
    if (closed) {
      return Promise.reject(fatalError || new Error('asp-client: client is closed'));
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pendingById.set(id, { resolve, reject });
      const ok = writeJson({ jsonrpc: '2.0', id, method, params });
      if (!ok) {
        pendingById.delete(id);
        reject(fatalError || new Error('asp-client: stdin write failed'));
      }
    });
  }

  /**
   * Serialize and write a single newline-terminated JSON line.
   * Returns false on transport failure (caller is responsible for
   * cleanup of any pending entry).
   */
  function writeJson(obj) {
    if (closed) return false;
    let line;
    try {
      line = JSON.stringify(obj) + '\n';
    } catch (err) {
      // Caller passed something non-serializable; surface as fatal so
      // we don't silently drop a request. Synchronous failure path —
      // we want the writer (sendRequest / turn) to reject promptly.
      onTransportClose(err);
      return false;
    }
    try {
      child.stdin.write(line);
      return true;
    } catch (err) {
      onTransportClose(err);
      return false;
    }
  }

  /**
   * Stdout chunk handler. Splits on `\n`, parses each complete line
   * as JSON, dispatches by id (response) or method (notification).
   * Carries an unfinished tail forward.
   */
  function onStdoutData(chunk) {
    if (closed) return;
    stdoutBuf += chunk;
    if (stdoutBuf.length > MAX_LINE_BYTES && !stdoutBuf.includes('\n')) {
      onTransportClose(new Error(
        `asp-client: line buffer exceeded ${MAX_LINE_BYTES} bytes without newline`,
      ));
      return;
    }

    let nlIdx;
    // eslint-disable-next-line no-cond-assign
    while ((nlIdx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, nlIdx);
      stdoutBuf = stdoutBuf.slice(nlIdx + 1);
      if (line.trim().length === 0) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (err) {
        // Single malformed line — log via fatal close. We don't try to
        // skip-and-continue because once framing alignment is lost we
        // can't trust subsequent lines either.
        onTransportClose(new Error(`asp-client: malformed JSON line: ${err.message}`));
        return;
      }
      dispatch(msg);
    }
  }

  /**
   * Route one parsed message: method-result, method-error, or
   * notification.
   */
  function dispatch(msg) {
    if (msg === null || typeof msg !== 'object') return;

    // Notification (no `id`): carries a `method` and `params`.
    if (typeof msg.method === 'string' && !('id' in msg)) {
      const params = (msg.params && typeof msg.params === 'object') ? msg.params : {};
      const turnId = (typeof params.turnId === 'string') ? params.turnId : null;
      if (turnId !== null) {
        const entry = turnsByTurnId.get(turnId);
        if (entry) {
          // Always record for the final result payload.
          entry.notifications.push(msg);
          if (entry.onNotification) {
            try { entry.onNotification(msg); } catch { /* user hook errors don't kill the stream */ }
          }
          // Terminal notifications close the turn. Codex emits
          // `turn.complete` (or `turn.error`) as the final notification
          // in the stream; the method-response may also carry the
          // result. We accept either path — whichever lands first wins.
          if (msg.method === 'turn.complete' || msg.method === 'turnComplete') {
            const result = {
              status: 'complete',
              content: params.content,
              usage: params.usage,
              threadId: entry.threadId,
              turnId: entry.turnId,
              notifications: entry.notifications,
            };
            finalizeTurn(entry, /*reject*/ false, result);
          } else if (msg.method === 'turn.error' || msg.method === 'turnError') {
            const result = {
              status: 'error',
              error: params.error || { code: 'unknown', message: 'turn errored without detail' },
              threadId: entry.threadId,
              turnId: entry.turnId,
              notifications: entry.notifications,
            };
            // NOTE: resolves (does not reject) — Codex-reported errors
            // are a normal control path.
            finalizeTurn(entry, /*reject*/ false, result);
          }
        }
      }
      return;
    }

    // Method response (has `id`): result or error.
    if (typeof msg.id === 'number' || typeof msg.id === 'string') {
      const id = msg.id;

      // Was this a turn() request? If so, the response carries turnId
      // (and possibly the inline result if the server didn't stream).
      const turnEntry = turnsByRequestId.get(id);
      if (turnEntry) {
        turnsByRequestId.delete(id);
        if (msg.error) {
          // Method-call-level error (e.g. invalid params). Distinct
          // from a `{status: "error"}` turn result — this rejects.
          finalizeTurn(turnEntry, /*reject*/ true, asError(msg.error));
          return;
        }
        const result = (msg.result && typeof msg.result === 'object') ? msg.result : {};
        const turnId = typeof result.turnId === 'string' ? result.turnId : null;
        if (turnId === null) {
          finalizeTurn(turnEntry, /*reject*/ true,
            new Error('asp-client: turn response missing turnId'));
          return;
        }
        turnEntry.turnId = turnId;
        // If the server inlined the final status in the method response,
        // settle immediately. Otherwise wait for streaming notifications.
        if (typeof result.status === 'string') {
          if (result.status === 'complete') {
            finalizeTurn(turnEntry, /*reject*/ false, {
              status: 'complete',
              content: result.content,
              usage: result.usage,
              threadId: turnEntry.threadId,
              turnId,
              notifications: turnEntry.notifications,
            });
          } else if (result.status === 'error') {
            finalizeTurn(turnEntry, /*reject*/ false, {
              status: 'error',
              error: result.error || { code: 'unknown', message: 'turn errored without detail' },
              threadId: turnEntry.threadId,
              turnId,
              notifications: turnEntry.notifications,
            });
          } else {
            // Unknown status — register the entry so streaming
            // notifications can settle it.
            turnsByTurnId.set(turnId, turnEntry);
          }
        } else {
          // No inline status: register for streaming completion.
          turnsByTurnId.set(turnId, turnEntry);
        }
        return;
      }

      // Plain method response (threadStart / threadResume).
      const pending = pendingById.get(id);
      if (!pending) return; // unsolicited response — drop
      pendingById.delete(id);
      if (msg.error) {
        pending.reject(asError(msg.error));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Anything else (no method, no id) is silently ignored — Codex may
    // emit progress envelopes we don't recognize, and we don't want to
    // tear down on forward-compat noise.
  }

  /**
   * Resolve or reject the turn entry, removing all bookkeeping.
   * `value` is either the result payload (when resolving) or an Error
   * (when rejecting).
   */
  function finalizeTurn(entry, isReject, value) {
    if (entry.settled) return;
    entry.settled = true;
    if (entry.signal && entry.onAbort) {
      try { entry.signal.removeEventListener('abort', entry.onAbort); } catch { /* noop */ }
    }
    if (entry.turnId !== null) turnsByTurnId.delete(entry.turnId);
    // Remove the request-id mapping if it survived this far.
    for (const [reqId, e] of turnsByRequestId.entries()) {
      if (e === entry) { turnsByRequestId.delete(reqId); break; }
    }
    if (isReject) entry.reject(value);
    else entry.resolve(value);
  }

  /**
   * Convert an ASP `error` envelope into an Error with the original
   * code/data attached for the caller's classifier.
   */
  function asError(envelope) {
    const code = (envelope && (typeof envelope.code === 'string' || typeof envelope.code === 'number'))
      ? envelope.code : 'unknown';
    const message = (envelope && typeof envelope.message === 'string')
      ? envelope.message : 'asp-client: server returned error';
    const e = new Error(`asp-client: ${message} (code=${code})`);
    e.code = code;
    e.data = envelope && envelope.data;
    return e;
  }

  /**
   * Mark the transport as closed and reject every in-flight call.
   * `cause` may be null for a clean shutdown.
   */
  function onTransportClose(cause) {
    if (closed) return;
    closed = true;
    fatalError = cause;

    const err = cause || new Error('asp-client: transport closed');

    for (const [, p] of pendingById) {
      try { p.reject(err); } catch { /* noop */ }
    }
    pendingById.clear();

    for (const [, entry] of turnsByRequestId) {
      try { finalizeTurn(entry, /*reject*/ true, err); } catch { /* noop */ }
    }
    turnsByRequestId.clear();

    for (const [, entry] of turnsByTurnId) {
      try { finalizeTurn(entry, /*reject*/ true, err); } catch { /* noop */ }
    }
    turnsByTurnId.clear();
  }

  return {
    threadStart,
    threadResume,
    turn,
    close,
    get closed() { return closed; },
  };
}

module.exports = { createAspClient, MAX_LINE_BYTES };
