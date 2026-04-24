// scripts/lib/logger/index.ts — Plan 21-04 (SDK-16).
//
// Public API for the Phase-21 structured logger. Consumers import ONLY
// from this file; `./types.ts` and `./sinks.ts` are implementation
// detail but their public types/classes are re-exported here for
// advanced callers (e.g., a test that wants to build a custom sink
// stack or a debug harness that wants to introspect levels).
//
// Surface:
//   * createLogger(opts?)        — build a Logger with auto mode detection
//   * getLogger()                — module-level singleton accessor
//   * setLogger(l)               — replace the singleton (tests)
//   * resetLogger()              — clear the singleton (tests)
//   * Types + sinks re-exports   — for advanced consumers / tests
//
// Mode detection (in priority order):
//   1. `opts.headless === true`         → headless (JsonlSink)
//   2. `opts.headless === false`        → interactive (ConsoleSink)
//   3. `process.env.GDD_HEADLESS === '1'` → headless
//   4. `process.env.GDD_HEADLESS === '0'` → interactive (explicit off wins)
//   5. `!process.stdout.isTTY`           → headless
//   6. otherwise                         → interactive
//
// Event-stream integration (warn + error only):
//   * `warn(msg, fields)`  → `appendEvent({ type: 'error', payload: { level: 'warn', msg, fields } })`
//   * `error(msg, fields)` → same, with level: 'error'.
//   * `debug` and `info` never emit events.
//   * Failures inside appendEvent are swallowed (logged once via
//     process.stderr); the logger contract never propagates event-stream
//     failures back to the caller.

import { appendEvent } from '../event-stream/index.ts';
import { ConsoleSink, JsonlSink, MultiSink } from './sinks.ts';
import {
  LEVEL_ORDER,
  type LogEntry,
  type LogLevel,
  type Logger,
  type LoggerOptions,
  type Sink,
} from './types.ts';

export type { LogLevel, LoggerOptions, LogEntry, Logger, Sink } from './types.ts';
export { LEVEL_ORDER } from './types.ts';
export { ConsoleSink, JsonlSink, MultiSink } from './sinks.ts';
export type {
  ConsoleSinkOptions,
  JsonlSinkOptions,
} from './sinks.ts';
export { DEFAULT_LOG_DIR, safeStringify } from './sinks.ts';

/**
 * Decide whether a logger with `opts` should run in headless mode.
 * Explicit `opts.headless` wins; otherwise env; otherwise TTY check.
 */
function detectHeadless(opts: LoggerOptions): boolean {
  if (opts.headless === true) return true;
  if (opts.headless === false) return false;
  const envFlag = process.env['GDD_HEADLESS'];
  if (envFlag === '1') return true;
  if (envFlag === '0') return false;
  return !process.stdout.isTTY;
}

/** Flag so we only emit the `appendEvent failed` tripwire once per process. */
let eventStreamFailureLogged = false;

/**
 * LoggerImpl is not exported; callers build via `createLogger()` and
 * hold a `Logger` interface reference. Keeping the implementation private
 * lets us add fields (metrics, per-level counters) without breaking
 * consumers.
 */
class LoggerImpl implements Logger {
  private readonly sink: Sink;
  private readonly minLevel: LogLevel;
  private readonly scope: string | undefined;
  private readonly baseFields: Record<string, unknown>;
  private readonly now: () => string;
  private readonly emitEvents: boolean;

  constructor(
    sink: Sink,
    minLevel: LogLevel,
    scope: string | undefined,
    baseFields: Record<string, unknown>,
    now: () => string,
    emitEvents: boolean,
  ) {
    this.sink = sink;
    this.minLevel = minLevel;
    this.scope = scope;
    this.baseFields = baseFields;
    this.now = now;
    this.emitEvents = emitEvents;
  }

  private emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    // Level filter first — short-circuit below the minimum for perf.
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

    // Build the entry. Caller fields are merged shallow, then reserved
    // keys are written last so they always override caller input.
    const merged: Record<string, unknown> = { ...this.baseFields, ...(fields ?? {}) };
    const entry: LogEntry = {
      ...merged,
      ts: this.now(),
      level,
      msg,
      pid: process.pid,
    };
    if (this.scope !== undefined) entry.scope = this.scope;

    // Persist to the sink. Sinks are required not to throw, but we
    // wrap defensively so a buggy custom sink cannot break callers.
    try {
      this.sink.write(entry);
    } catch {
      // Swallow.
    }

    // Event-stream integration: warn + error emit an ErrorEvent.
    if (this.emitEvents && (level === 'warn' || level === 'error')) {
      try {
        const payloadFields: Record<string, unknown> = { ...(fields ?? {}) };
        appendEvent({
          type: 'error',
          timestamp: entry.ts,
          sessionId: this.scope ?? 'anonymous',
          payload: {
            level,
            msg,
            fields: payloadFields,
          },
        });
      } catch {
        // Event-stream failures must not surface. Print one tripwire
        // so operators notice, then stay silent.
        if (!eventStreamFailureLogged) {
          eventStreamFailureLogged = true;
          try {
            process.stderr.write(
              '[logger] appendEvent failed; subsequent failures will be silent\n',
            );
          } catch {
            // If stderr is also dead, we've done all we can.
          }
        }
      }
    }
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.emit('debug', msg, fields);
  }
  info(msg: string, fields?: Record<string, unknown>): void {
    this.emit('info', msg, fields);
  }
  warn(msg: string, fields?: Record<string, unknown>): void {
    this.emit('warn', msg, fields);
  }
  error(msg: string, fields?: Record<string, unknown>): void {
    this.emit('error', msg, fields);
  }

  child(scope: string, fields?: Record<string, unknown>): Logger {
    const childScope = this.scope !== undefined ? `${this.scope}.${scope}` : scope;
    const mergedFields: Record<string, unknown> = {
      ...this.baseFields,
      ...(fields ?? {}),
    };
    return new LoggerImpl(
      this.sink,
      this.minLevel,
      childScope,
      mergedFields,
      this.now,
      this.emitEvents,
    );
  }

  flush(): void {
    // v1 sinks are synchronous; reserved for future async implementations.
  }
}

/**
 * Build a Logger with auto mode detection. See the module-level
 * mode-detection table.
 *
 * @throws RangeError when `opts.level` is not a member of LogLevel.
 */
export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level ?? 'info';
  if (!(level in LEVEL_ORDER)) {
    // Defensive: narrow with a runtime check — TypeScript cannot catch
    // a caller passing `'verbose' as any`. Fail loud at construction
    // rather than silently mis-filter downstream.
    throw new RangeError(
      `Invalid LogLevel: ${String(level)}. Expected one of: debug, info, warn, error.`,
    );
  }

  const now = opts.nowOverride ?? ((): string => new Date().toISOString());
  const emitEvents = opts.emitEventsOverride === false ? false : true;
  const scope = opts.scope;

  const headless = detectHeadless(opts);
  const sink: Sink = headless
    ? new JsonlSink({
        ...(opts.logDir !== undefined ? { dir: opts.logDir } : {}),
        ...(opts.nowOverride !== undefined ? { nowOverride: opts.nowOverride } : {}),
      })
    : new ConsoleSink();

  return new LoggerImpl(sink, level, scope, {}, now, emitEvents);
}

/** Module-level singleton. Built lazily on first `getLogger()` call. */
let defaultLogger: Logger | null = null;

/**
 * Return the module-level default logger, constructing it on first
 * call with default options. Used by modules that don't own a logger
 * explicitly (session-runner, pipeline-runner, parallel-runners in
 * later Phase-21 waves).
 */
export function getLogger(): Logger {
  if (defaultLogger === null) {
    defaultLogger = createLogger();
  }
  return defaultLogger;
}

/**
 * Replace the module-level default logger. Intended for tests that
 * want to inject a logger with a captured sink; also used by the
 * session-runner boot path to install a logger with its pinned
 * `logDir`/`scope` before any child import calls `getLogger()`.
 */
export function setLogger(l: Logger): void {
  defaultLogger = l;
}

/**
 * Clear the module-level default logger. Next `getLogger()` rebuilds
 * with current env/TTY state. Primarily a test hook.
 */
export function resetLogger(): void {
  defaultLogger = null;
}
