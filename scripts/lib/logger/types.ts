// scripts/lib/logger/types.ts — Plan 21-04 (SDK-16).
//
// Public type surface for the structured logger. Consumers import from
// `./index.ts` (the module barrel); this file exists to keep the type
// graph clean for `./sinks.ts` and `./index.ts` which both depend on the
// same `LogEntry`/`Sink`/`Logger` contracts.
//
// Contracts:
//   * LogLevel — closed union of the four levels supported in v1.
//   * LEVEL_ORDER — numeric map used for min-level filtering. Higher
//     numbers are more severe. Frozen so callers cannot mutate.
//   * LoggerOptions — construction-time options. All fields optional so
//     `createLogger()` can be called with zero args.
//   * LogEntry — the on-wire shape (both JSONL and console). `ts`,
//     `level`, `msg`, `pid` are reserved keys: the logger overwrites
//     caller fields of the same name to preserve the guarantee that a
//     JSONL line always has a valid timestamp/level/msg/pid.
//   * Logger — the public API: 4 level methods, `child()`, `flush()`.
//   * Sink — the sink interface used by ConsoleSink/JsonlSink/MultiSink
//     in `./sinks.ts`.

/** Closed set of log levels. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Numeric ordering for level filtering. Higher = more severe.
 * `LEVEL_ORDER[entry.level] >= LEVEL_ORDER[opts.level]` → emit; otherwise drop.
 * Frozen to prevent accidental mutation by consumers.
 */
export const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

export interface LoggerOptions {
  /** Minimum level to emit. Levels below this are dropped. Default: `'info'`. */
  level?: LogLevel;
  /**
   * Force headless mode regardless of env / TTY detection. When `undefined`
   * (the default), mode is auto-detected: `GDD_HEADLESS=1` OR
   * `!process.stdout.isTTY` → headless. `GDD_HEADLESS=0` pins interactive.
   */
  headless?: boolean;
  /**
   * JSONL output directory (headless mode only). Resolved at construction
   * time; falls back to `process.env.GDD_LOG_DIR` then `'.design/logs'`.
   */
  logDir?: string;
  /**
   * Module / subsystem tag merged into every entry (e.g., `'session-runner'`).
   * `child(scope)` concatenates onto this dot-joined.
   */
  scope?: string;
  /**
   * Test-only override: replaces the `new Date().toISOString()` source so
   * test fixtures can be byte-identical across runs.
   */
  nowOverride?: () => string;
  /**
   * Test-only override: when explicitly `false`, `warn`/`error` do NOT
   * emit an `ErrorEvent` via event-stream. Any other value behaves as
   * "emit normally" (the default).
   */
  emitEventsOverride?: false;
}

/**
 * Shape written to JSONL sinks and passed to ConsoleSink.write().
 * Reserved keys (`ts`, `level`, `msg`, `pid`) are always present; caller
 * fields are merged shallow but never override reserved keys.
 */
export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  pid: number;
  scope?: string;
  [field: string]: unknown;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  /**
   * Returns a child logger inheriting options, with additional scope
   * appended (dot-joined if a parent scope exists) and additional fields
   * merged into every entry. Child loggers share the parent's sink(s).
   */
  child(scope: string, fields?: Record<string, unknown>): Logger;
  /**
   * Flush buffered writes. JSONL and Console sinks in v1 are synchronous,
   * so this is a no-op — reserved for async sinks in a future wave.
   */
  flush(): void;
}

/**
 * Sink interface implemented by ConsoleSink/JsonlSink/MultiSink in
 * `./sinks.ts`. Logger.write() is expected to never throw; sinks SHOULD
 * swallow IO errors and either retry or drop the line rather than
 * surface failures to the caller.
 */
export interface Sink {
  write(entry: LogEntry): void;
  close(): void;
}
