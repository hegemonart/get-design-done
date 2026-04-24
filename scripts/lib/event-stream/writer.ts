// scripts/lib/event-stream/writer.ts — append-only JSONL writer for the
// Phase 20+ telemetry stream (Plan 20-06, SDK-08).
//
// Design:
//   * One file per .design/: `.design/telemetry/events.jsonl`, sibling to
//     the existing `costs.jsonl` (which this plan does NOT modify).
//   * Each `append()` is one call to `fs.appendFileSync(…, { flag: 'a' })`.
//     On POSIX the O_APPEND semantic guarantees that a single write()
//     under `PIPE_BUF` (4096 bytes) is atomic with respect to other
//     appenders — multiple processes can append concurrently without
//     interleaving or corruption. On Windows, `FILE_APPEND_DATA` via the
//     Node runtime supplies the same guarantee. Typical event lines are
//     well under 1KB; oversized events are truncated (see below) so we
//     never approach the 4KB atomicity ceiling even on stricter POSIX
//     implementations.
//   * `append()` NEVER throws to the caller. On I/O failure we record
//     the error (so observability tooling can surface it) and write a
//     single diagnostic line to stderr.
//   * Oversized payloads (> `maxLineBytes`, default 64KB) are truncated
//     rather than dropped: we keep envelope metadata and replace
//     `payload` with `{ _truncated_placeholder: true }`, then re-serialize
//     and stamp `_truncated: true` on the line.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, isAbsolute, join } from 'node:path';

import type { BaseEvent } from './types.ts';

/** Default relative path for the persisted event stream. */
export const DEFAULT_EVENTS_PATH = '.design/telemetry/events.jsonl';

/** Default max line size in bytes. JSONL lines that exceed this are truncated. */
export const DEFAULT_MAX_LINE_BYTES = 64 * 1024; // 64 KiB

/** Constructor options for {@link EventWriter}. */
export interface WriterOptions {
  /**
   * Target file path for persisted events. Resolved to absolute at
   * construction. Relative paths are resolved against `process.cwd()`.
   *
   * Default: `.design/telemetry/events.jsonl`.
   */
  path?: string;
  /**
   * Maximum serialized line size in bytes (JSON.stringify length + `\n`).
   * Events exceeding this cap are truncated — the envelope is preserved
   * and the payload is replaced with a `_truncated_placeholder` marker.
   *
   * Default: 65536 (64 KiB).
   */
  maxLineBytes?: number;
}

/**
 * Append-only JSONL writer. One instance per file path is sufficient;
 * the module-level cache in `./index.ts` shares a single default writer
 * across the process so directory creation only happens once.
 */
export class EventWriter {
  /** Resolved absolute target path. */
  readonly path: string;
  /** Maximum line size in bytes (see {@link WriterOptions.maxLineBytes}). */
  readonly maxLineBytes: number;
  /** Number of failed append attempts since construction. */
  writeErrors: number = 0;
  /** The most recent write error, or `null` if none has occurred. */
  lastError: Error | null = null;

  /** `true` once we've ensured the target directory exists. */
  private directoryEnsured: boolean = false;

  constructor(opts: WriterOptions = {}) {
    const rawPath = opts.path ?? DEFAULT_EVENTS_PATH;
    this.path = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
    this.maxLineBytes = opts.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
  }

  /**
   * Append one event to the target file.
   *
   * Contract:
   *   * SYNC — returns when the write has been accepted by the kernel.
   *   * NEVER throws — I/O errors increment {@link writeErrors} and update
   *     {@link lastError}; a diagnostic is written to stderr and
   *     execution continues.
   *   * Truncates oversized payloads rather than dropping the event.
   */
  append(ev: BaseEvent): void {
    try {
      const line = this.serialize(ev);
      this.ensureDirectory();
      appendFileSync(this.path, line, { flag: 'a' });
    } catch (err) {
      this.writeErrors += 1;
      this.lastError = err instanceof Error ? err : new Error(String(err));
      // One-line diagnostic; intentionally minimal so callers aren't
      // spammed under sustained failure.
      try {
        process.stderr.write(
          `[event-stream] write failed: ${this.lastError.message}\n`,
        );
      } catch {
        // If stderr itself is broken we have no recourse; swallow.
      }
    }
  }

  /**
   * Produce the on-disk JSONL representation of an event, truncating
   * oversized payloads so the line fits within {@link maxLineBytes}.
   *
   * Exposed on the instance for unit-testability; callers should use
   * {@link append}.
   */
  serialize(ev: BaseEvent): string {
    const raw = JSON.stringify(ev) + '\n';
    if (Buffer.byteLength(raw, 'utf8') <= this.maxLineBytes) {
      return raw;
    }

    // Truncate: keep envelope fields, drop payload content.
    const truncated: BaseEvent = {
      type: ev.type,
      timestamp: ev.timestamp,
      sessionId: ev.sessionId,
      payload: { _truncated_placeholder: true },
      _truncated: true,
    };
    if (ev.stage !== undefined) truncated.stage = ev.stage;
    if (ev.cycle !== undefined) truncated.cycle = ev.cycle;
    if (ev._meta !== undefined) truncated._meta = ev._meta;
    return JSON.stringify(truncated) + '\n';
  }

  /**
   * Ensure the target directory exists. Memoized so we only pay the
   * filesystem stat cost once per writer lifetime.
   */
  private ensureDirectory(): void {
    if (this.directoryEnsured) return;
    mkdirSync(dirname(this.path), { recursive: true });
    this.directoryEnsured = true;
  }
}

/**
 * Convenience helper: resolve a relative events-path against a supplied
 * base directory (typically the project root) rather than `process.cwd()`.
 * Intended for tests that scaffold a temp workspace and don't want to
 * chdir.
 */
export function eventsPathFor(baseDir: string): string {
  return join(baseDir, DEFAULT_EVENTS_PATH);
}
