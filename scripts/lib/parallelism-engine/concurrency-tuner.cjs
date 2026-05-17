/**
 * scripts/lib/parallelism-engine/concurrency-tuner.cjs — Plan 27.6-04
 *
 * Data-driven concurrency resolver per Phase 27.6 D-07. Reads the
 * most-recent `parallelism.verdict` event from .design/telemetry/
 * events.jsonl (Phase 22 stream) and computes:
 *
 *   resolveConcurrency = max(1, min(min(cpu-1, last_observed), ceiling))
 *
 * where:
 *   cpu           = os.cpus().length (override via cpuCount opt)
 *   last_observed = payload.observed_concurrency from the latest
 *                   parallelism.verdict event (null if absent)
 *   ceiling       = process.env.GDD_CONCURRENCY_CEILING (default 8)
 *
 * Hard ceiling of 8 prevents pathological process-spawn storms on
 * high-core machines (D-07 wording: "Hard ceiling prevents pathological
 * process-spawn storms").
 *
 * Public surface:
 *   * resolveConcurrency({cpuCount?, lastObservedOptimum?, hardCeiling?,
 *                        eventsPath?, baseDir?}) -> number  (>=1)
 *   * readLastObservedOptimum({eventsPath?, baseDir?}) -> number|null
 *   * emitParallelismVerdict({task_ids, verdict, reason,
 *                            intended_concurrency?, observed_concurrency?,
 *                            contention_detected?, wall_clock_ms?,
 *                            sessionId?}) -> void
 *   * DEFAULT_HARD_CEILING (=8)
 *   * DEFAULT_EVENTS_PATH (='.design/telemetry/events.jsonl')
 *
 * The `parallelism.verdict` payload extension is purely additive
 * (`intended_concurrency`, `observed_concurrency`, `contention_detected`,
 * `wall_clock_ms` are all optional). Existing consumers that only read
 * `{task_ids, verdict, reason}` keep working unchanged.
 *
 * No external deps. Lazy event-stream require for emit (best-effort
 * telemetry — a failed event-stream load must not break the resolver).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_HARD_CEILING = 8;
const DEFAULT_EVENTS_PATH = '.design/telemetry/events.jsonl';

/**
 * Lazy-require the event-stream module. Returns a no-op `appendEvent`
 * when the module is unavailable so callers never have to wrap emit
 * calls in try/catch themselves.
 *
 * @returns {(ev: object) => void}
 */
function getAppendEvent() {
  try {
    // Resolved relative to this file: scripts/lib/parallelism-engine/
    // -> ../event-stream. The event-stream module is .ts; Node 22+
    // with --experimental-strip-types (or Node 24 built-in TS) can
    // require it. If require fails (e.g., older runtime, missing
    // module), fall through to the no-op.
    const m = require('../event-stream');
    if (m && typeof m.appendEvent === 'function') return m.appendEvent;
  } catch {
    // Swallow — best-effort telemetry. Losing one verdict is
    // acceptable; breaking concurrency resolution is not.
  }
  return function noopAppend(_ev) {
    /* event-stream unavailable */
  };
}

/**
 * Resolve the hard ceiling. Operator override via GDD_CONCURRENCY_CEILING
 * env var (parsed as integer) takes precedence; the explicit `override`
 * argument wins over the env. Default is 8 (D-07).
 *
 * @param {number|undefined} override
 * @returns {number}
 */
function resolveCeiling(override) {
  if (typeof override === 'number' && override >= 1) return Math.floor(override);
  const env = process.env.GDD_CONCURRENCY_CEILING;
  if (typeof env === 'string' && env.length > 0) {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return DEFAULT_HARD_CEILING;
}

/**
 * Compose the JSONL events path. Relative paths are joined to baseDir
 * when supplied; absolute paths are returned as-is.
 *
 * @param {{eventsPath?: string, baseDir?: string}} opts
 * @returns {string}
 */
function resolvePath({ eventsPath, baseDir }) {
  let p = typeof eventsPath === 'string' && eventsPath.length > 0
    ? eventsPath
    : DEFAULT_EVENTS_PATH;
  if (baseDir && !path.isAbsolute(p)) p = path.join(baseDir, p);
  return p;
}

/**
 * Read .design/telemetry/events.jsonl and return the
 * `observed_concurrency` from the MOST RECENT parallelism.verdict event
 * (sequential read order). Tolerates malformed lines and absent file.
 *
 * @param {object} [opts]
 * @param {string} [opts.eventsPath] override events.jsonl path
 * @param {string} [opts.baseDir]    base for relative eventsPath
 * @returns {number|null}
 */
function readLastObservedOptimum({ eventsPath, baseDir } = {} ) {
  const target = resolvePath({ eventsPath, baseDir });
  if (!fs.existsSync(target)) return null;
  let body;
  try {
    body = fs.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
  const lines = body.split(/\r?\n/);
  let lastOptimum = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const ev = JSON.parse(trimmed);
      if (
        ev
        && ev.type === 'parallelism.verdict'
        && ev.payload
        && typeof ev.payload.observed_concurrency === 'number'
      ) {
        lastOptimum = Math.floor(ev.payload.observed_concurrency);
      }
    } catch {
      // Tolerate malformed line — JSONL is best-effort.
    }
  }
  return lastOptimum;
}

/**
 * Resolve the recommended concurrency per D-07.
 *
 *   1. base       = max(1, cpuCount - 1)         // never below 1
 *   2. optimum    = lastObservedOptimum         // explicit override
 *                   ?? readLastObservedOptimum() // or read from JSONL
 *   3. candidate  = optimum > 0 ? min(base, optimum) : base
 *   4. ceiling    = override ?? GDD_CONCURRENCY_CEILING ?? 8
 *   5. return max(1, min(candidate, ceiling))
 *
 * @param {object} [opts]
 * @param {number} [opts.cpuCount]            override os.cpus().length
 * @param {number|null} [opts.lastObservedOptimum] explicit override; null/undefined triggers JSONL read
 * @param {number} [opts.hardCeiling]         override the env/default ceiling
 * @param {string} [opts.eventsPath]          override events.jsonl path
 * @param {string} [opts.baseDir]             base for relative eventsPath
 * @returns {number} integer >= 1
 */
function resolveConcurrency({
  cpuCount,
  lastObservedOptimum,
  hardCeiling,
  eventsPath,
  baseDir,
} = {}) {
  const cpu = typeof cpuCount === 'number' && cpuCount >= 1
    ? Math.floor(cpuCount)
    : os.cpus().length;
  const base = Math.max(1, cpu - 1);
  let optimum = lastObservedOptimum;
  if (optimum === undefined || optimum === null) {
    optimum = readLastObservedOptimum({ eventsPath, baseDir });
  }
  const candidate = typeof optimum === 'number' && optimum >= 1
    ? Math.min(base, Math.floor(optimum))
    : base;
  const ceiling = resolveCeiling(hardCeiling);
  return Math.max(1, Math.min(candidate, ceiling));
}

/**
 * Emit a `parallelism.verdict` event with the Phase 27.6 superset
 * payload. Existing fields ({task_ids, verdict, reason}) are always
 * present; the new fields (intended_concurrency, observed_concurrency,
 * contention_detected, wall_clock_ms) are appended only when supplied.
 *
 * Side effect: appendEvent({type: 'parallelism.verdict', ...}). When
 * event-stream is unavailable, this is a no-op (lazy require fallback).
 *
 * @param {object} opts
 * @param {string[]} opts.task_ids
 * @param {'parallel'|'sequential'} opts.verdict
 * @param {string}  opts.reason
 * @param {number}  [opts.intended_concurrency]
 * @param {number}  [opts.observed_concurrency]
 * @param {boolean} [opts.contention_detected]
 * @param {number}  [opts.wall_clock_ms]
 * @param {string}  [opts.sessionId]
 * @returns {void}
 */
function emitParallelismVerdict({
  task_ids,
  verdict,
  reason,
  intended_concurrency,
  observed_concurrency,
  contention_detected,
  wall_clock_ms,
  sessionId,
} = {}) {
  const append = getAppendEvent();
  /** @type {Record<string, unknown>} */
  const payload = {
    task_ids: Array.isArray(task_ids) ? task_ids : [],
    verdict: verdict === 'parallel' || verdict === 'sequential' ? verdict : 'sequential',
    reason: typeof reason === 'string' ? reason : 'unspecified',
  };
  // Additive 27.6 fields — only include when set, to keep payloads
  // compact and avoid noisy `undefined` keys on the wire.
  if (typeof intended_concurrency === 'number') {
    payload.intended_concurrency = intended_concurrency;
  }
  if (typeof observed_concurrency === 'number') {
    payload.observed_concurrency = observed_concurrency;
  }
  if (typeof contention_detected === 'boolean') {
    payload.contention_detected = contention_detected;
  }
  if (typeof wall_clock_ms === 'number') {
    payload.wall_clock_ms = wall_clock_ms;
  }
  try {
    append({
      type: 'parallelism.verdict',
      timestamp: new Date().toISOString(),
      sessionId: typeof sessionId === 'string' && sessionId.length > 0
        ? sessionId
        : 'concurrency-tuner',
      payload,
    });
  } catch {
    // Best-effort telemetry. A failed write must never break the
    // caller's wave-execution flow.
  }
}

module.exports = {
  resolveConcurrency,
  readLastObservedOptimum,
  emitParallelismVerdict,
  DEFAULT_HARD_CEILING,
  DEFAULT_EVENTS_PATH,
};
