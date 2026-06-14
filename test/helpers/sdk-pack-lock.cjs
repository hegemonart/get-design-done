'use strict';
// test/helpers/sdk-pack-lock.cjs — CI-reliability helper (no production surface).
//
// SERIALIZES `npm pack` across the parallel test suite to kill an intermittent
// Linux/Node-22 flake (observed in PRs #122/#123).
//
// THE RACE
//   `npm test` runs `node --test` over a glob; node:test executes each test FILE
//   in its own child process, in parallel. Several files invoke `npm pack`
//   against the SAME repo working tree:
//     • phase-31-5-headless-e2e.test.cjs  — real pack → install → run hone-sdk
//     • hone-mcp-headless-e2e.test.cjs      — real pack → install → MCP handshake
//     • npm-tarball-contents.test.cjs      — `npm pack --dry-run --json` (×3)
//   Every pack (real AND --dry-run) runs the lifecycle:
//     prepack  → `build:sdk`            (esbuild writes sdk/cli/index.js + 2 more)
//     pack     → stream files → tarball (reads those .js)
//     postpack → `build:sdk --clean`    (deletes those .js)
//   The three .js are gitignored build artifacts that exist ONLY inside a pack's
//   prepack→postpack window. A SINGLE pack is self-consistent, but when two packs
//   overlap, one pack's `--clean` (postpack) or `build:sdk` clean-then-build
//   (prepack) removes/rewrites sdk/cli/index.js WHILE another pack is streaming it
//   into its tarball. That tarball then ships WITHOUT the compiled bin; the
//   installed `hone-sdk` falls back to the raw .ts, which Node ≥22 refuses to
//   type-strip under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING).
//   A local repro at 8+8 concurrency reproduced ~7% corrupt tarballs.
//
// THE FIX
//   Hold a cross-process advisory lock around the ENTIRE `npm pack` invocation
//   (the lifecycle scripts run inside that one synchronous spawn), so prepack →
//   stream → postpack of any one pack never interleaves with another's. Each
//   pack becomes self-consistent again; production publish (a single, lone pack)
//   is unaffected because this lives only in the test suite.
//
//   The lock is SYNCHRONOUS on purpose: the pack callers use spawnSync/execSync
//   (the E2E memoizes a sync ensureInstall() across ~9 call sites), so a sync
//   lock wraps each pack with a one-line change instead of threading async
//   through every caller. Algorithm mirrors sdk/primitives/lockfile.cjs
//   (atomic `wx` create, PID + ISO-timestamp payload, stale-steal) ported to a
//   blocking wait via Atomics.wait.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

// All test processes for THIS checkout must converge on ONE lock file. Anchor on
// this helper's own location (→ repo root) rather than any caller's cwd, and key
// the tmp filename off the repo path so unrelated checkouts/CI jobs on one host
// don't share a lock.
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCK_ID = crypto.createHash('sha1').update(REPO_ROOT).digest('hex').slice(0, 12);
const LOCK_PATH = path.join(os.tmpdir(), `hone-sdk-pack-${LOCK_ID}.lock`);

// A single `npm pack` runs in ~5-20s; ≤3 files contend, so real waits are short.
// STALE > any plausible single pack so we never steal a live, legitimate holder
// (a crashed holder is reclaimed immediately by the dead-PID check). MAX_WAIT is
// a generous backstop: on the (never-in-practice) event it elapses we proceed
// UNLOCKED rather than fail — a serialization helper must not become a NEW flake.
const STALE_MS = 300_000;
const MAX_WAIT_MS = 240_000;
const POLL_MS = 100;

// Block this thread for `ms` without a busy-spin and without Date math.
function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // SharedArrayBuffer/Atomics disabled in some sandboxes — bounded fallback.
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin */ }
  }
}

function readHolder() {
  try {
    return fs.readFileSync(LOCK_PATH, 'utf8');
  } catch (err) {
    return err && err.code === 'ENOENT' ? null : '<unreadable>';
  }
}

// Only declare a lock stale when we are confident: a dead PID on this host, or an
// age beyond STALE_MS. An unparseable/unreadable payload is treated as FRESH so a
// transient read error never lets two writers steal from each other.
function holderIsStale(raw) {
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!p || typeof p.pid !== 'number' || typeof p.acquired_at !== 'string') return false;
  if (p.host === os.hostname() && p.pid !== process.pid) {
    try {
      process.kill(p.pid, 0); // signal 0 = existence probe, delivers nothing
    } catch (err) {
      if (err && err.code === 'ESRCH') return true; // holder is gone
    }
  }
  const t = Date.parse(p.acquired_at);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > STALE_MS;
}

// Returns true if WE created the lock (caller must release), false if we gave up
// waiting and the caller should proceed unlocked.
function tryAcquire() {
  const payload = JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    acquired_at: new Date().toISOString(),
  });
  const startedAt = Date.now();
  for (;;) {
    try {
      fs.writeFileSync(LOCK_PATH, payload, { flag: 'wx', encoding: 'utf8' });
      return true;
    } catch (err) {
      const code = err && err.code;
      // EEXIST: held. EPERM/EBUSY: Windows AV/indexer transient on `wx` create.
      if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EBUSY') throw err;
      const raw = readHolder();
      if (raw === null) continue; // vanished between fail and read — retry now
      if (raw !== '<unreadable>' && holderIsStale(raw)) {
        try {
          fs.unlinkSync(LOCK_PATH);
        } catch {
          /* already reclaimed by someone else — loop and re-contend */
        }
        continue;
      }
      if (Date.now() - startedAt >= MAX_WAIT_MS) return false; // backstop: go unlocked
      sleepSync(POLL_MS);
    }
  }
}

/**
 * Run `fn` (synchronous — e.g. a spawnSync/execSync `npm pack`) while holding a
 * cross-process lock that serializes pack invocations across the parallel suite.
 * Releases the lock even if `fn` throws. Returns `fn`'s return value.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function withPackLock(fn) {
  const acquired = tryAcquire();
  try {
    return fn();
  } finally {
    if (acquired) {
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {
        /* idempotent: ENOENT (already gone) is fine; stale-steal reclaims else */
      }
    }
  }
}

module.exports = { withPackLock, LOCK_PATH };
