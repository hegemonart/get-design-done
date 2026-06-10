// sdk/event-stream/writer.ts — append-only JSONL writer for the
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

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, isAbsolute, join } from 'node:path';
import { createRequire } from 'node:module';

import type { BaseEvent } from './types.ts';

// Phase 22 Plan 22-02: write-time secret scrubbing. `redact()` deep-walks
// the event and replaces secret-shaped strings with `[REDACTED:<type>]`
// placeholders before serialization. Loaded via createRequire so the
// CommonJS `redact.cjs` interops cleanly. We avoid `import.meta.url` —
// tsc's Node16 module mode classifies this .ts file as CJS output for
// typecheck purposes (even though it runs as ESM under
// `--experimental-strip-types`), and `import.meta` is forbidden in CJS
// output. Mirror the pattern from `scripts/lib/session-runner/errors.ts`:
// anchor createRequire on the repo-root package.json discovered by
// walking up from `process.cwd()`.
function _findRepoRoot(): string {
  return _walkToPackageJson(process.cwd());
}

/**
 * Walk up from `startDir` until a directory containing `package.json` is
 * found; returns `startDir` itself if none is found within the bound.
 */
function _walkToPackageJson(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

// S2 fix: redaction now fails CLOSED. Previously, if redact.cjs could not be
// resolved from the runtime cwd, `_redact` fell through to the IDENTITY
// function and every event was written UNSCRUBBED — silently leaking secrets
// into events.jsonl whenever the writer ran outside the plugin tree (hook
// subprocesses, temp test dirs, unusual install layouts). That is a fail-open
// security hole.
//
// New contract:
//   * redact.cjs loads  → normal deep-walk scrubbing (unchanged behavior).
//   * redact.cjs MISSING → fail closed: `redact` returns an envelope-only
//     placeholder that DROPS the payload body (replacing it with
//     `{ _redaction_unavailable: true }`) so no raw payload is ever persisted
//     unscrubbed. A single visible stderr warning is emitted (once per
//     process, guarded by `_redactWarned`) so the failure is observable.
//
// Resolution is also improved: we try createRequire anchored on THIS module
// (via the runtime-resolved module path) before the cwd-anchored walk, so it
// loads in more layouts.

/** Module-level guard so the fail-closed warning prints at most once. */
let _redactWarned = false;

/** Emit the one-time fail-closed warning to stderr (guarded, best-effort). */
function _warnRedactUnavailable(): void {
  if (_redactWarned) return;
  _redactWarned = true;
  try {
    process.stderr.write(
      '[event-stream] WARNING: scripts/lib/redact.cjs could not be loaded — ' +
        'failing CLOSED: event payloads are dropped (envelope-only) to avoid ' +
        'writing unscrubbed secrets. Run the event writer from inside the ' +
        'plugin tree or set the redact lib on PATH to restore full payloads.\n',
    );
  } catch {
    // If stderr itself is broken we have no recourse; swallow.
  }
}

/**
 * Attempt to load redact.cjs from a set of candidate roots. Returns the
 * real `redact` function on success, or `null` if no candidate resolves.
 */
function _loadRedact(): ((v: unknown) => unknown) | null {
  const candidates: string[] = [];

  // We cannot use `import.meta.url` (tsc Node16 classifies this .ts as CJS for
  // typecheck), so we probe several anchors so redact.cjs loads in as many
  // layouts as possible BEFORE the fail-closed path engages:
  //
  // 1) The entry script (`process.argv[1]`). For hook subprocesses (e.g.
  //    budget-enforcer.ts spawned by the harness) the entry script lives
  //    INSIDE the plugin tree even when cwd is a detached temp dir — this is
  //    the same anchor the hook itself uses via resolveHookPath(). Walking up
  //    from the entry script to its package.json reliably lands on the plugin
  //    root regardless of cwd.
  // 2) A cwd-walked repo root (works when cwd IS inside the plugin tree).
  // 3) The source-relative layout (writer.ts → ../../scripts/lib/redact.cjs).
  const entry = process.argv[1];
  if (typeof entry === 'string' && entry.length > 0) {
    const entryAbs = isAbsolute(entry) ? entry : resolve(entry);
    const entryRoot = _walkToPackageJson(dirname(entryAbs));
    candidates.push(resolve(entryRoot, 'scripts/lib/redact.cjs'));
  }
  const repoRoot = _findRepoRoot();
  candidates.push(resolve(repoRoot, 'scripts/lib/redact.cjs'));
  candidates.push(resolve(repoRoot, '..', '..', 'scripts/lib/redact.cjs'));

  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue;
      // Anchor createRequire on the candidate file itself so resolution does
      // not depend on a package.json being present at a particular ancestor.
      const req = createRequire(candidate);
      const mod = req(candidate) as { redact?: (v: unknown) => unknown };
      if (mod && typeof mod.redact === 'function') return mod.redact;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

const _realRedact = _loadRedact();

/**
 * The redaction function used at the write boundary. When the real redactor
 * loaded, this is it. When it did not, this is the FAIL-CLOSED shim: it warns
 * once and returns an envelope-only object with the payload body dropped.
 */
const redact: (v: unknown) => unknown =
  _realRedact !== null
    ? _realRedact
    : (v: unknown): unknown => {
        _warnRedactUnavailable();
        if (v !== null && typeof v === 'object') {
          // Preserve envelope metadata; drop the payload body entirely so no
          // raw (potentially secret-bearing) content is persisted.
          const ev = v as Record<string, unknown>;
          const out: Record<string, unknown> = { ...ev };
          out['payload'] = { _redaction_unavailable: true };
          return out;
        }
        return { _redaction_unavailable: true };
      };

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
    // Phase 22 Plan 22-02: scrub secrets from the entire event (envelope +
    // payload) before serialization. Redaction is non-mutating and runs
    // exactly once per event, here at the write boundary.
    const scrubbed = redact(ev) as BaseEvent;
    const raw = JSON.stringify(scrubbed) + '\n';
    if (Buffer.byteLength(raw, 'utf8') <= this.maxLineBytes) {
      return raw;
    }

    // Truncate: keep envelope fields, drop payload content.
    const truncated: BaseEvent = {
      type: scrubbed.type,
      timestamp: scrubbed.timestamp,
      sessionId: scrubbed.sessionId,
      payload: { _truncated_placeholder: true },
      _truncated: true,
    };
    if (scrubbed.stage !== undefined) truncated.stage = scrubbed.stage;
    if (scrubbed.cycle !== undefined) truncated.cycle = scrubbed.cycle;
    if (scrubbed._meta !== undefined) truncated._meta = scrubbed._meta;
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
