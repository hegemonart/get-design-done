// scripts/lib/logger/sinks.ts — Plan 21-04 (SDK-16).
//
// Sink implementations for the Phase-21 structured logger:
//   * ConsoleSink — pretty stderr output with ANSI colors when TTY.
//   * JsonlSink   — crash-safe append-only JSONL to .design/logs/<file>.
//   * MultiSink   — fan-out to N sinks (e.g., console + JSONL simultaneously
//                   under a test harness).
//
// Design rules:
//   * Sinks MUST NOT throw from `.write()`. IO failures are swallowed
//     (they'd otherwise break the caller's happy path). A one-shot
//     `process.stderr.write` of the error is acceptable as a tripwire.
//   * `safeStringify()` walks the entry with a WeakSet for circular
//     detection and replaces non-JSON-serializable values with
//     `"<unserializable: <reason>>"` so a bad caller payload never
//     crashes the process.
//   * File paths encode the ISO timestamp with `:` → `-` (Windows won't
//     allow colons in filenames).

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import type { LogEntry, Sink } from './types.ts';

/**
 * Default directory for JSONL logs when neither `opts.dir` nor
 * `GDD_LOG_DIR` is set. Resolved relative to `process.cwd()`.
 */
export const DEFAULT_LOG_DIR = '.design/logs';

/**
 * ANSI color codes keyed by log level. Empty string when color disabled.
 */
const ANSI_RESET = '\u001b[0m';
const ANSI_BY_LEVEL: Record<LogEntry['level'], string> = {
  debug: '\u001b[90m', // gray
  info: '\u001b[36m', // cyan
  warn: '\u001b[33m', // yellow
  error: '\u001b[31m', // red
};

/**
 * Reserved keys that the logger controls directly. The sinks rely on
 * these being present; extraction helpers skip them when rendering
 * "extra fields".
 */
const RESERVED_KEYS = new Set(['ts', 'level', 'msg', 'pid', 'scope']);

/**
 * Replacer that handles non-JSON-serializable values. Uses a single
 * WeakSet across the whole walk to catch circular refs. Returns
 * `"<unserializable: <reason>>"` for:
 *   * circular references (object already seen on the ancestor path)
 *   * BigInt values
 *   * Function values
 *   * anything else that `JSON.stringify` would otherwise throw on.
 */
function buildSafeReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_key: string, value: unknown): unknown => {
    if (typeof value === 'bigint') return '<unserializable: bigint>';
    if (typeof value === 'function') return '<unserializable: function>';
    if (typeof value === 'symbol') return '<unserializable: symbol>';
    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) return '<unserializable: circular>';
      seen.add(value);
    }
    return value;
  };
}

/**
 * JSON.stringify that never throws. All unserializable leaves become
 * `<unserializable: ...>` placeholders.
 */
export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, buildSafeReplacer()) ?? 'null';
  } catch {
    // Extremely pathological cases (e.g., `toJSON` throws after our
    // replacer) still fall through here. Return a tagged sentinel
    // rather than propagate.
    return '"<unserializable: stringify-failed>"';
  }
}

/**
 * Split a LogEntry into (reserved header, caller fields) for rendering.
 * The reserved header controls output ordering; caller fields are
 * rendered as an inline JSON object suffix.
 */
function splitEntry(entry: LogEntry): {
  header: { ts: string; level: string; msg: string; pid: number; scope?: string };
  extras: Record<string, unknown>;
} {
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!RESERVED_KEYS.has(k)) extras[k] = v;
  }
  const header: { ts: string; level: string; msg: string; pid: number; scope?: string } = {
    ts: entry.ts,
    level: entry.level,
    msg: entry.msg,
    pid: entry.pid,
  };
  if (entry.scope !== undefined) header.scope = entry.scope;
  return { header, extras };
}

export interface ConsoleSinkOptions {
  /**
   * Enable ANSI color output. When `undefined` (default), autodetected
   * from `process.stderr.isTTY`. Explicit `false` disables coloring;
   * explicit `true` forces it even for non-TTY streams (useful for
   * tests that assert the colorized form).
   */
  color?: boolean;
  /**
   * Write target. Defaults to `process.stderr.write`. Tests inject a
   * capturing function here.
   */
  write?: (chunk: string) => void;
}

/**
 * Pretty-printed stderr sink used in interactive mode. Format:
 *   `<ts> [<LEVEL>] <scope?> <msg> <json-fields>`
 * Fields JSON is omitted when the entry has no caller fields.
 */
export class ConsoleSink implements Sink {
  readonly colorEnabled: boolean;
  private readonly writer: (chunk: string) => void;

  constructor(opts: ConsoleSinkOptions = {}) {
    this.colorEnabled =
      opts.color !== undefined ? opts.color : Boolean(process.stderr.isTTY);
    this.writer = opts.write ?? ((chunk: string) => {
      process.stderr.write(chunk);
    });
  }

  write(entry: LogEntry): void {
    const { header, extras } = splitEntry(entry);
    const levelToken = header.level.toUpperCase();
    const coloredLevel = this.colorEnabled
      ? `${ANSI_BY_LEVEL[entry.level]}${levelToken}${ANSI_RESET}`
      : levelToken;
    const scopePart = header.scope !== undefined ? ` ${header.scope}` : '';
    const extrasKeys = Object.keys(extras);
    const fieldsPart = extrasKeys.length > 0 ? ` ${safeStringify(extras)}` : '';
    const line = `${header.ts} [${coloredLevel}]${scopePart} ${header.msg}${fieldsPart}\n`;
    try {
      this.writer(line);
    } catch {
      // Swallow: writing to stderr failed (very rare — detached stdio,
      // pipe closed). We intentionally do nothing to honor the "sinks
      // never throw" contract.
    }
  }

  close(): void {
    // No fd to release; stderr is process-owned.
  }
}

export interface JsonlSinkOptions {
  /**
   * Output directory. Resolved relative to `process.cwd()` when relative.
   * Priority: `opts.dir` → `process.env.GDD_LOG_DIR` → `DEFAULT_LOG_DIR`.
   */
  dir?: string;
  /**
   * Override the ISO timestamp used when composing the filename. Only
   * affects the filename itself — entry timestamps come from the Logger.
   * Allows tests to produce a deterministic file path.
   */
  nowOverride?: () => string;
  /**
   * Override pid used in the filename suffix. Tests use this to pin
   * the filename when `process.pid` would otherwise vary.
   */
  pidOverride?: number;
}

/**
 * Append-only JSONL sink. One entry per line, UTF-8, newline-terminated.
 * File path: `<dir>/<ISO-with-dashes>-<pid>.jsonl`.
 *
 * Uses `appendFileSync` on every write — crash-safe (kernel-level atomic
 * append for small writes), no in-memory buffering. Writes are sync so
 * the logger caller can return immediately; async buffering would
 * complicate ordering guarantees under concurrent pipeline stages.
 */
export class JsonlSink implements Sink {
  readonly path: string;
  private dirCreated = false;

  constructor(opts: JsonlSinkOptions = {}) {
    const dirOpt =
      opts.dir ?? process.env['GDD_LOG_DIR'] ?? DEFAULT_LOG_DIR;
    const dir = isAbsolute(dirOpt) ? dirOpt : resolve(process.cwd(), dirOpt);
    const iso = opts.nowOverride ? opts.nowOverride() : new Date().toISOString();
    const pid = opts.pidOverride ?? process.pid;
    // Replace colons (invalid on Windows filesystems) with dashes.
    const safeIso = iso.replace(/:/g, '-');
    this.path = join(dir, `${safeIso}-${pid}.jsonl`);
  }

  private ensureDir(): void {
    if (this.dirCreated) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      this.dirCreated = true;
    } catch {
      // If mkdir fails (e.g., permission denied), subsequent appendFileSync
      // will also fail and we'll swallow there. Keep dirCreated=false so
      // a later write attempts mkdir again (the condition may clear).
    }
  }

  write(entry: LogEntry): void {
    this.ensureDir();
    const line = `${safeStringify(entry)}\n`;
    try {
      appendFileSync(this.path, line, { encoding: 'utf8' });
    } catch {
      // Swallow. The logger contract forbids throwing from sinks.
      // A sustained IO failure is visible via missing log file.
    }
  }

  close(): void {
    // `appendFileSync` opens+closes per call; nothing to release.
  }
}

/**
 * Fan-out sink: every `.write()` is forwarded to every child sink.
 * Construction validates that the input is a non-null array; null/undefined
 * entries are rejected defensively (they'd NPE on write otherwise).
 */
export class MultiSink implements Sink {
  private readonly sinks: readonly Sink[];

  constructor(sinks: readonly Sink[]) {
    this.sinks = sinks.filter((s): s is Sink => s !== null && s !== undefined);
  }

  write(entry: LogEntry): void {
    for (const s of this.sinks) {
      try {
        s.write(entry);
      } catch {
        // Defense in depth: child sinks shouldn't throw, but if one does,
        // it must not block the others. Swallow per-sink.
      }
    }
  }

  close(): void {
    for (const s of this.sinks) {
      try {
        s.close();
      } catch {
        // Same defense — close of one sink must not block another.
      }
    }
  }
}
