// scripts/lib/lockfile.cjs
//
// Plan 20-14 — PID+timestamp sibling lockfile for `.cjs` consumers.
//
// Algorithm mirrors scripts/lib/gdd-state/lockfile.ts (Plan 20-01):
//   Lock path:     `${target}.lock`
//   Payload:       { pid: number, host: string, acquired_at: ISO8601 }
//   Acquire:       atomic `writeFileSync(..., { flag: 'wx' })`
//   Stale rule:    pid dead (ESRCH via `kill(pid, 0)`) OR `acquired_at` older
//                  than `staleMs` OR unparseable payload
//   Release:       unlink; ENOENT is not an error; idempotent
//
// Windows: AV scanners and file-indexers can hold a file briefly after
// close. `wx` create may fail with EPERM/EBUSY even when the target is
// free; we treat these as transient and loop (same code path as EEXIST).
//
// Dependency-cycle note: Plan 20-14's rate-guard + iteration-budget
// consume this module, and both are required to stay dependency-light so
// that hooks/budget-enforcer.ts can import them without dragging the
// gdd-state MCP graph along. Hence this standalone .cjs port instead of
// calling the .ts version.

'use strict';

const fs = require('node:fs');
const os = require('node:os');

const DEFAULT_STALE_MS = 60_000;
const DEFAULT_MAX_WAIT_MS = 5_000;
const DEFAULT_POLL_MS = 50;

/**
 * Acquire an advisory lock at `${path}.lock`. Returns an idempotent
 * async release function.
 *
 * @param {string} path path being locked (we append `.lock`)
 * @param {object} [opts]
 * @param {number} [opts.staleMs]   ms after which an existing lock is stale. Default 60_000.
 * @param {number} [opts.maxWaitMs] total ms to wait before throwing. Default 5_000.
 * @param {number} [opts.pollMs]    ms between retry attempts. Default 50.
 * @returns {Promise<() => Promise<void>>} release function
 * @throws {Error} with name === 'LockAcquisitionError' when maxWaitMs elapses
 */
async function acquire(path, opts) {
  const o = opts || {};
  const staleMs = Number.isFinite(o.staleMs) ? o.staleMs : DEFAULT_STALE_MS;
  const maxWaitMs = Number.isFinite(o.maxWaitMs) ? o.maxWaitMs : DEFAULT_MAX_WAIT_MS;
  const pollMs = Number.isFinite(o.pollMs) ? o.pollMs : DEFAULT_POLL_MS;

  if (staleMs < 0 || maxWaitMs < 0 || pollMs < 0) {
    throw new Error(
      `lockfile.acquire: invalid options (staleMs=${staleMs}, maxWaitMs=${maxWaitMs}, pollMs=${pollMs})`,
    );
  }

  const lockPath = `${path}.lock`;
  const payload = JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    acquired_at: new Date().toISOString(),
  });
  const startedAt = Date.now();

  while (true) {
    try {
      fs.writeFileSync(lockPath, payload, { flag: 'wx', encoding: 'utf8' });
      return makeRelease(lockPath);
    } catch (err) {
      const code = err && typeof err === 'object' ? err.code : undefined;
      if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EBUSY') {
        throw err;
      }
      // Try to read the current holder; if it vanished between EEXIST and
      // read, loop immediately.
      const existing = readLockSafe(lockPath);
      if (existing === null) continue;

      const parsed = parseLock(existing);
      // Only clear when we're confident the lock is stale: the payload
      // parses AND the PID/age check says so. An unparseable payload is
      // treated as fresh — on Windows, AV/indexer can transiently deny
      // reads (EACCES/EPERM/EBUSY), and clearing under that condition
      // would let two writers race and lose increments.
      if (parsed !== null && isStale(parsed, staleMs)) {
        // Clear stale lock; race-tolerant — if it's already gone we get
        // ENOENT, no-op.
        try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
        continue;
      }

      if (Date.now() - startedAt >= maxWaitMs) {
        const e = new Error(
          `lockfile: failed to acquire ${lockPath} within ${maxWaitMs}ms (held by ${existing})`,
        );
        e.name = 'LockAcquisitionError';
        e.lockPath = lockPath;
        e.holder = existing;
        e.waitedMs = Date.now() - startedAt;
        throw e;
      }
      await sleep(pollMs);
    }
  }
}

function makeRelease(lockPath) {
  let released = false;
  return async function release() {
    if (released) return;
    released = true;
    try {
      fs.unlinkSync(lockPath);
    } catch (err) {
      const code = err && typeof err === 'object' ? err.code : undefined;
      if (code === 'ENOENT') return; // idempotent — already gone
      if (code === 'EPERM' || code === 'EBUSY') {
        // Windows AV/indexer: retry once.
        await sleep(50);
        try {
          if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        } catch { /* give up; stale-detection will reclaim */ }
        return;
      }
      // Any other errno: swallow. Best-effort cleanup; stale-age check
      // will eventually reclaim the lock.
    }
  };
}

function readLockSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : undefined;
    if (code === 'ENOENT') return null;
    return '<unreadable>';
  }
}

function parseLock(raw) {
  try {
    const obj = JSON.parse(raw);
    if (
      obj && typeof obj === 'object' &&
      typeof obj.pid === 'number' &&
      typeof obj.host === 'string' &&
      typeof obj.acquired_at === 'string'
    ) {
      return obj;
    }
    return null;
  } catch {
    return null;
  }
}

function isStale(payload, staleMs) {
  if (!isPidAlive(payload.pid, payload.host)) return true;
  const t = Date.parse(payload.acquired_at);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > staleMs;
}

function isPidAlive(pid, host) {
  if (host !== os.hostname()) return true; // can't introspect other hosts
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0); // signal 0 = validate, don't deliver
    return true;
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : undefined;
    if (code === 'ESRCH') return false;
    // EPERM / EACCES: process exists but is unsignalable; treat as alive.
    return true;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `fs.renameSync` wrapper that retries once on Windows EPERM/EBUSY/EACCES.
 * AV scanners and the file-indexer can briefly hold a destination open
 * after another process closed it, causing rename to fail even when the
 * advisory lock is correctly held.
 *
 * Mirrors the inline retry in scripts/lib/gdd-state/index.ts mutate().
 */
async function renameWithRetry(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : undefined;
    if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw err;
    await sleep(50);
    fs.renameSync(from, to);
  }
}

module.exports = { acquire, renameWithRetry };
