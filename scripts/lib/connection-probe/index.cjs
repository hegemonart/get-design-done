/**
 * connection-probe/index.cjs — code-level connection liveness probe
 * (Plan 22-08).
 *
 * Replaces today's per-connection ad-hoc probe bash snippets in
 * `connections/` with one typed primitive. Used by Phase 21
 * pipeline-runner and Phase 22 reflector.
 *
 * Contract:
 *   probe({
 *     name:     'figma' | 'pinterest' | …    // free-form connection id
 *     cmd:      async () => boolean | Truthy  // probe action
 *     timeout:  number ms                     // default 5000
 *     retries:  number                        // default 3 attempts total
 *     fallback: async () => unknown           // optional degraded path
 *   }) → {
 *     status:        'ok' | 'degraded' | 'down'
 *     latency_ms:    number
 *     attempts:      number
 *     fallback_used: boolean
 *     error?:        string                   // last error message if any
 *   }
 *
 * State persistence:
 *   * `.design/telemetry/connection-state.json` records `{name → status}`
 *     across runs.
 *   * On every probe, if the new status differs from cached, emit a
 *     `connection.status_change` event via the event-stream bus and
 *     overwrite the cached value atomically (write to .tmp + rename).
 *
 * Backoff:
 *   * Uses `jittered-backoff.cjs` — `delayMs(attempt)` between retries.
 *
 * The probe `cmd` is awaited with a Promise.race against a timeout. On
 * fulfilment with truthy → ok. On rejection or falsy → fail-this-attempt;
 * retry until exhausted. After full-fail, if `fallback` is supplied,
 * runs it and reports `degraded` + `fallback_used: true`.
 */

'use strict';

const { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } = require('node:fs');
const { dirname, isAbsolute, resolve, join } = require('node:path');

const { delayMs } = require('../jittered-backoff.cjs');

const DEFAULT_STATE_PATH = '.design/telemetry/connection-state.json';

/**
 * Resolve the connection-state file path against a base dir.
 * @param {{baseDir?: string, statePath?: string}} [opts]
 */
function statePathFor(opts = {}) {
  const raw = opts.statePath ?? DEFAULT_STATE_PATH;
  if (isAbsolute(raw)) return raw;
  return resolve(opts.baseDir ?? process.cwd(), raw);
}

/**
 * Load + return the cached state object (or `{}` if absent / corrupt).
 * @param {string} path
 * @returns {Record<string, string>}
 */
function loadState(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Atomic state write: write to `.tmp` sibling, rename. Renames are
 * atomic on POSIX and at least crash-safe on Windows for same-volume
 * targets.
 * @param {string} path
 * @param {Record<string, string>} state
 */
function saveState(path, state) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = path + '.tmp';
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, path);
  } catch (err) {
    try {
      process.stderr.write(
        `[connection-probe] state write failed: ${err && err.message ? err.message : String(err)}\n`,
      );
    } catch {
      /* swallow */
    }
  }
}

/**
 * Race `promise` against a timeout. Rejects with `TimeoutError` after
 * `ms` if the promise hasn't settled.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`probe timed out after ${ms}ms`);
      err.code = 'PROBE_TIMEOUT';
      reject(err);
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Run the probe with retries + optional fallback. Resolves to a
 * structured outcome; never rejects.
 *
 * @param {{
 *   name: string,
 *   cmd: () => Promise<unknown>,
 *   timeout?: number,
 *   retries?: number,
 *   fallback?: () => Promise<unknown>,
 *   baseDir?: string,
 *   statePath?: string,
 *   emit?: (ev: unknown) => void,
 * }} opts
 * @returns {Promise<{
 *   status: 'ok' | 'degraded' | 'down',
 *   latency_ms: number,
 *   attempts: number,
 *   fallback_used: boolean,
 *   error?: string,
 * }>}
 */
async function probe(opts) {
  if (!opts || typeof opts.name !== 'string' || opts.name.length === 0) {
    throw new TypeError('probe: name (string) required');
  }
  if (typeof opts.cmd !== 'function') {
    throw new TypeError('probe: cmd (async fn) required');
  }
  const timeout = opts.timeout ?? 5000;
  const retries = Math.max(1, opts.retries ?? 3);
  const path = statePathFor(opts);

  const start = Date.now();
  let attempts = 0;
  let lastError;

  for (let i = 0; i < retries; i++) {
    attempts += 1;
    try {
      const result = await withTimeout(Promise.resolve(opts.cmd()), timeout);
      if (result) {
        const outcome = {
          status: /** @type {'ok'} */ ('ok'),
          latency_ms: Date.now() - start,
          attempts,
          fallback_used: false,
        };
        await recordTransition(opts.name, outcome.status, path, opts.emit);
        return outcome;
      }
      // falsy = soft-fail; retry
      lastError = new Error('probe returned falsy');
    } catch (err) {
      lastError = err;
    }
    if (i < retries - 1) {
      await sleep(delayMs(i));
    }
  }

  // All retries failed. Try fallback if supplied.
  if (typeof opts.fallback === 'function') {
    try {
      await opts.fallback();
      const outcome = {
        status: /** @type {'degraded'} */ ('degraded'),
        latency_ms: Date.now() - start,
        attempts,
        fallback_used: true,
        error: lastError && lastError.message ? lastError.message : String(lastError),
      };
      await recordTransition(opts.name, outcome.status, path, opts.emit);
      return outcome;
    } catch {
      /* fall through to down */
    }
  }

  const outcome = {
    status: /** @type {'down'} */ ('down'),
    latency_ms: Date.now() - start,
    attempts,
    fallback_used: false,
    error: lastError && lastError.message ? lastError.message : String(lastError),
  };
  await recordTransition(opts.name, outcome.status, path, opts.emit);
  return outcome;
}

/** Sleep for `ms` milliseconds. */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Compare against cached state. If status differs, emit a
 * `connection.status_change` event (when an `emit` callback is supplied)
 * and overwrite the cached value atomically.
 *
 * @param {string} name
 * @param {string} status
 * @param {string} statePath
 * @param {undefined | ((ev: unknown) => void)} emit
 */
async function recordTransition(name, status, statePath, emit) {
  const state = loadState(statePath);
  const previous = state[name];
  if (previous === status) return; // no transition
  state[name] = status;
  saveState(statePath, state);
  if (typeof emit === 'function') {
    try {
      emit({
        type: 'connection.status_change',
        timestamp: new Date().toISOString(),
        sessionId: process.env.GDD_SESSION_ID || 'unknown',
        payload: { name, from: previous ?? 'unknown', to: status },
      });
    } catch (err) {
      try {
        process.stderr.write(
          `[connection-probe] emit failed: ${err && err.message ? err.message : String(err)}\n`,
        );
      } catch {
        /* swallow */
      }
    }
  }
}

module.exports = {
  probe,
  statePathFor,
  loadState,
  saveState,
  DEFAULT_STATE_PATH,
};
