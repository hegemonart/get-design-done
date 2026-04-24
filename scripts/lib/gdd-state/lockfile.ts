// scripts/lib/gdd-state/lockfile.ts — PID+timestamp sibling lockfile.
//
// Pattern (from GSD state-mutation.ts D2):
//   Lock file at `${target}.lock` holds JSON
//     { pid: <number>, host: <string>, acquired_at: <ISO 8601> }
//   Acquire = atomic `writeFileSync(..., { flag: 'wx' })`.
//   On EEXIST: check staleness, retry after pollMs, fail after maxWaitMs.
//   Stale = pid dead (ESRCH via process.kill(pid, 0)) OR acquired_at older
//           than staleMs.
//   Release = unlink(path); ENOENT is not an error.
//
// Windows note: on Windows, AV scanners and file-indexers can hold a file
// briefly after close. A writeFileSync with 'wx' can fail with EPERM or
// EBUSY even when the target is free; we treat these as transient and
// retry (same code path as EEXIST).

import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { hostname } from 'node:os';

import { LockAcquisitionError } from './types.ts';

export interface AcquireOptions {
  /** ms after which an existing lock is considered stale. Default 60_000. */
  staleMs?: number;
  /** total ms to wait before throwing LockAcquisitionError. Default 5_000. */
  maxWaitMs?: number;
  /** ms between retry attempts. Default 50. */
  pollMs?: number;
}

/** Release function returned by `acquire()`. Idempotent. */
export type LockRelease = () => Promise<void>;

interface LockPayload {
  pid: number;
  host: string;
  acquired_at: string;
}

const DEFAULTS = {
  staleMs: 60_000,
  maxWaitMs: 5_000,
  pollMs: 50,
};

/**
 * Acquire an advisory lock at `${path}.lock`. Returns a release function.
 *
 * @throws LockAcquisitionError when `maxWaitMs` elapses without acquiring.
 */
export async function acquire(
  path: string,
  opts: AcquireOptions = {},
): Promise<LockRelease> {
  const staleMs: number = opts.staleMs ?? DEFAULTS.staleMs;
  const maxWaitMs: number = opts.maxWaitMs ?? DEFAULTS.maxWaitMs;
  const pollMs: number = opts.pollMs ?? DEFAULTS.pollMs;
  const lockPath: string = `${path}.lock`;
  const startedAt: number = Date.now();

  const payload: LockPayload = {
    pid: process.pid,
    host: hostname(),
    acquired_at: new Date().toISOString(),
  };
  const payloadText: string = JSON.stringify(payload);

  // Guard against absurd configs that would make the function never run.
  if (maxWaitMs < 0 || pollMs < 0 || staleMs < 0) {
    throw new Error(
      `invalid AcquireOptions: staleMs=${staleMs}, maxWaitMs=${maxWaitMs}, pollMs=${pollMs}`,
    );
  }

  while (true) {
    try {
      // Atomic create — fails if lock exists. 'wx' = O_CREAT | O_EXCL.
      writeFileSync(lockPath, payloadText, { flag: 'wx', encoding: 'utf8' });
      // Got it. Return idempotent release.
      return makeRelease(lockPath);
    } catch (err) {
      const code = getErrnoCode(err);
      // EEXIST: another holder present — check staleness.
      // EPERM / EBUSY on Windows: transient AV / indexer — same retry path.
      if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EBUSY') {
        // Unexpected error (e.g., ENOENT if the parent dir doesn't exist,
        // EACCES, ENOSPC). Rethrow untouched — callers should see the
        // OS-level reason.
        throw err;
      }

      // Try to read current holder. Best-effort — if the file just
      // vanished between EEXIST and read, loop immediately.
      const existing: string | null = readLockSafe(lockPath);
      if (existing === null) {
        // vanished; retry without sleeping.
        continue;
      }

      const parsed: LockPayload | null = parseLock(existing);
      if (parsed !== null && isStale(parsed, staleMs)) {
        // Clear stale lock and retry.
        try {
          unlinkSync(lockPath);
        } catch (delErr) {
          const delCode = getErrnoCode(delErr);
          if (delCode !== 'ENOENT') {
            // Someone else cleared it first; fall through to retry.
          }
        }
        continue;
      }

      // Fresh (or unparseable — treat as fresh to avoid clobbering a
      // different writer). Wait and retry.
      if (Date.now() - startedAt >= maxWaitMs) {
        throw new LockAcquisitionError(lockPath, existing, Date.now() - startedAt);
      }
      await sleep(pollMs);
    }
  }
}

/** --- helpers --- */

function makeRelease(lockPath: string): LockRelease {
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      unlinkSync(lockPath);
    } catch (err) {
      const code = getErrnoCode(err);
      if (code !== 'ENOENT') {
        // EPERM on Windows from AV: retry once. If still bad, swallow —
        // idempotent release should not throw on best-effort cleanup.
        if (code === 'EPERM' || code === 'EBUSY') {
          await sleep(50);
          try {
            if (existsSync(lockPath)) unlinkSync(lockPath);
          } catch {
            // give up silently — lock will be considered stale next acquire.
          }
        }
        // For any other code, silently ignore; the next acquirer will
        // either succeed (file is gone) or treat it as stale.
      }
    }
  };
}

function readLockSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    const code = getErrnoCode(err);
    if (code === 'ENOENT') return null;
    // EPERM/EBUSY on Windows: treat as still-locked; return a placeholder
    // so the caller can surface it.
    return '<unreadable>';
  }
}

function parseLock(raw: string): LockPayload | null {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (
      typeof obj === 'object' &&
      obj !== null &&
      typeof (obj as Record<string, unknown>)['pid'] === 'number' &&
      typeof (obj as Record<string, unknown>)['host'] === 'string' &&
      typeof (obj as Record<string, unknown>)['acquired_at'] === 'string'
    ) {
      return obj as LockPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function isStale(payload: LockPayload, staleMs: number): boolean {
  // 1) PID check — if the process is dead, the lock is stale.
  if (!isPidAlive(payload.pid, payload.host)) return true;
  // 2) Age check — acquired_at older than staleMs is stale even if the
  //    PID is reused by something else.
  const acquiredAt = Date.parse(payload.acquired_at);
  if (!Number.isFinite(acquiredAt)) return true; // garbage timestamp
  return Date.now() - acquiredAt > staleMs;
}

/**
 * Check whether a PID is alive *on this host*. Returns true (treat as
 * alive) when the holder is on a different host — cross-host reasoning
 * requires coordination we don't have, so we fall back to the age-based
 * staleness check.
 */
function isPidAlive(pid: number, host: string): boolean {
  if (host !== hostname()) {
    // Can't introspect another host's process table — assume alive.
    return true;
  }
  if (pid === process.pid) {
    // Own pid — alive.
    return true;
  }
  try {
    // Signal 0 just validates the pid; doesn't deliver a signal.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = getErrnoCode(err);
    if (code === 'ESRCH') return false; // no such process → dead
    // EPERM on Windows / POSIX: process exists but we can't signal it
    // (different user or privilege). Treat as alive — safer than
    // accidentally stealing someone else's lock.
    return true;
  }
}

function getErrnoCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
