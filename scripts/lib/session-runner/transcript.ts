// scripts/lib/session-runner/transcript.ts — append-only JSONL
// transcript writer for Phase 21 headless Agent SDK sessions
// (Plan 21-01 Task 4).
//
// Design mirrors scripts/lib/event-stream/writer.ts but is scoped to one
// session per file rather than the global telemetry stream. Each session
// owns a dedicated `.design/sessions/<ISO>-<stage>.jsonl` file; the
// filename is stable for the full run and survives retries (retries
// continue to append to the same transcript).
//
// Key guarantees:
//   * Atomic append via `fs.appendFileSync(..., { flag: 'a' })`. On
//     POSIX O_APPEND makes single-call writes under PIPE_BUF (4 KiB)
//     non-interleaved; on Windows FILE_APPEND_DATA provides the same.
//     Oversized chunks are truncated (below) so we stay well under the
//     POSIX atomicity ceiling.
//   * Oversized payloads (> MAX_LINE_BYTES = 64 KiB) are REPLACED with
//     `{ truncated: true, preview: "<first 1024 chars>" }` rather than
//     dropped. The transcript always has a line per emitted chunk.
//   * `close()` is a no-op today — we don't hold a file handle between
//     appends (each `appendFileSync` opens/closes). The method exists
//     so future buffering doesn't break callers.
//   * `pathFor(stage, baseDir?)` produces Windows-safe filenames by
//     replacing `:` in the ISO timestamp with `-`.
//
// Cross-reference: the run-loop in ./index.ts calls `append()` once per
// SDK message chunk. Test fixtures (tests/fixtures/session-runner/) use
// this module directly to assert JSONL line integrity.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/** Default transcript base directory (overridable via env or constructor). */
export const DEFAULT_SESSION_DIR = '.design/sessions';

/** Hard cap on serialized line size. Oversized → truncated with preview. */
export const MAX_LINE_BYTES = 64 * 1024;

/**
 * Preview length when truncating. 1 KiB of the stringified payload is
 * enough to spot-check what was emitted without blowing up line size.
 */
export const TRUNCATION_PREVIEW_BYTES = 1024;

/**
 * One line in the `.jsonl` transcript. `turn` is a monotonic 0-indexed
 * counter incremented by the run-loop whenever `stop_reason` fires.
 */
export interface TranscriptChunk {
  /** ISO 8601 timestamp of chunk emission. */
  ts: string;
  /** Kind of chunk. Kept open-ended for forward-compat with SDK additions. */
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'usage' | 'error';
  /** Monotonic turn counter (0-indexed). */
  turn: number;
  /** Raw SDK message; JSON-serialized by the writer (truncated on overflow). */
  payload: unknown;
}

/**
 * Append-only writer for a single session's `.jsonl` file. One instance
 * per session — the run-loop constructs it once and calls `append()`
 * for every chunk it observes.
 */
export class TranscriptWriter {
  /** Resolved absolute path. */
  readonly path: string;

  /** `true` once we've ensured the target directory exists. */
  private directoryEnsured: boolean = false;

  /** Running count of chunks appended (including truncated ones). */
  chunksWritten: number = 0;

  /** Running count of chunks replaced by truncation. */
  chunksTruncated: number = 0;

  /** Most recent write error. `null` while healthy. */
  lastError: Error | null = null;

  constructor(rawPath: string) {
    this.path = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
  }

  /**
   * Append one chunk. Never throws; I/O failures are recorded on
   * `lastError` and a short diagnostic is written to stderr.
   *
   * If serialization overflows `MAX_LINE_BYTES`, the payload is replaced
   * with `{ truncated: true, preview: "<first 1024 chars of stringified payload>" }`.
   */
  append(chunk: TranscriptChunk): void {
    try {
      const line = this.serialize(chunk);
      this.ensureDirectory();
      appendFileSync(this.path, line, { flag: 'a' });
      this.chunksWritten += 1;
    } catch (err) {
      this.lastError = err instanceof Error ? err : new Error(String(err));
      try {
        process.stderr.write(
          `[session-runner:transcript] write failed: ${this.lastError.message}\n`,
        );
      } catch {
        // No recourse — give up quietly.
      }
    }
  }

  /**
   * No-op today; kept so callers that wrap the writer in a try/finally
   * don't need to change when we add buffering.
   */
  close(): void {
    // Intentional no-op.
  }

  /**
   * Serialize a chunk to its on-disk form. Handles oversized payloads
   * by substituting a truncation marker. Exposed for tests; callers
   * should use {@link append}.
   */
  serialize(chunk: TranscriptChunk): string {
    const raw = JSON.stringify(chunk) + '\n';
    if (Buffer.byteLength(raw, 'utf8') <= MAX_LINE_BYTES) {
      return raw;
    }

    this.chunksTruncated += 1;

    // Build a preview string: JSON.stringify of the payload, sliced to
    // TRUNCATION_PREVIEW_BYTES UTF-8 bytes. We slice by character length
    // first (cheap) then hard-cap by byte length in case the prefix
    // includes multi-byte characters that push us over.
    let preview: string;
    try {
      const stringified = JSON.stringify(chunk.payload);
      if (typeof stringified === 'string') {
        preview = stringified.slice(0, TRUNCATION_PREVIEW_BYTES);
      } else {
        preview = '';
      }
    } catch {
      preview = '';
    }
    // Byte-cap: walk back until we fit.
    while (Buffer.byteLength(preview, 'utf8') > TRUNCATION_PREVIEW_BYTES && preview.length > 0) {
      preview = preview.slice(0, preview.length - 1);
    }

    const replacement: TranscriptChunk = {
      ts: chunk.ts,
      type: chunk.type,
      turn: chunk.turn,
      payload: { truncated: true, preview },
    };
    return JSON.stringify(replacement) + '\n';
  }

  /**
   * Build the conventional path for a session's transcript. Callers
   * typically don't use this directly — they pass a pre-resolved path
   * to the constructor — but the run-loop uses it to default the
   * transcript location.
   *
   * Windows-safe: `:` characters from the ISO timestamp are replaced
   * with `-` so Windows filesystems accept the filename.
   *
   * @param stage     per-stage identifier (explore, plan, ...)
   * @param baseDir   optional override; defaults to
   *                  `process.env.GDD_SESSION_DIR ?? '.design/sessions'`
   * @returns         absolute path string
   */
  static pathFor(stage: string, baseDir?: string): string {
    const iso = new Date().toISOString().replace(/[:]/g, '-');
    const safeStage = /^[a-z0-9][a-z0-9._-]*$/i.test(stage) ? stage : 'custom';
    const dir = baseDir ?? process.env['GDD_SESSION_DIR'] ?? DEFAULT_SESSION_DIR;
    const filename = `${iso}-${safeStage}.jsonl`;
    const full = join(dir, filename);
    return isAbsolute(full) ? full : resolve(process.cwd(), full);
  }

  /** Ensure the target directory exists. Memoized per-writer. */
  private ensureDirectory(): void {
    if (this.directoryEnsured) return;
    mkdirSync(dirname(this.path), { recursive: true });
    this.directoryEnsured = true;
  }
}
