// tests/gdd-state-lockfile.test.ts — lockfile concurrency + stale detection.
//
// Plan 20-01 acceptance:
//   * Two concurrent acquire() calls serialize.
//   * Dead-PID lockfile is cleared within pollMs + 100ms.
//   * Release is idempotent.
//   * maxWaitMs enforced — throws LockAcquisitionError with lock contents.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hostname } from 'node:os';

import { acquire } from '../scripts/lib/gdd-state/lockfile.ts';
import { LockAcquisitionError } from '../scripts/lib/gdd-state/types.ts';

function tmpPath(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-lockfile-'));
  const path = join(dir, 'STATE.md');
  writeFileSync(path, '---\nstage: brief\n---\n', 'utf8');
  return {
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// Pick a PID that is extremely unlikely to exist. 0x7FFFFFFE is past the
// default Linux kernel's PID max (4194304) and far above typical Windows
// PID values (rarely exceed 65_536). If by cosmic coincidence this PID
// exists, the test will spuriously pass (we'd treat the lock as alive)
// — not a flaky failure.
const LIKELY_DEAD_PID = 0x7ffffffe;

test('lockfile: acquire + release writes and removes the .lock file', async () => {
  const { path, cleanup } = tmpPath();
  try {
    const lockPath = `${path}.lock`;
    assert.equal(existsSync(lockPath), false);

    const release = await acquire(path, { maxWaitMs: 1_000 });
    assert.equal(existsSync(lockPath), true);

    await release();
    assert.equal(existsSync(lockPath), false);
  } finally {
    cleanup();
  }
});

test('lockfile: release is idempotent', async () => {
  const { path, cleanup } = tmpPath();
  try {
    const release = await acquire(path, { maxWaitMs: 1_000 });
    await release();
    // Second call should not throw.
    await release();
    await release();
    assert.ok(true, 'release called 3x without throwing');
  } finally {
    cleanup();
  }
});

test('lockfile: two concurrent acquires serialize', async () => {
  const { path, cleanup } = tmpPath();
  try {
    const order: string[] = [];
    const a = (async () => {
      const rel = await acquire(path, { maxWaitMs: 3_000, pollMs: 10 });
      order.push('a-acquired');
      await new Promise((r) => setTimeout(r, 100));
      order.push('a-releasing');
      await rel();
    })();
    // Tiny delay to ensure `a` gets the lock first.
    await new Promise((r) => setTimeout(r, 5));
    const b = (async () => {
      const rel = await acquire(path, { maxWaitMs: 3_000, pollMs: 10 });
      order.push('b-acquired');
      await rel();
    })();
    await Promise.all([a, b]);
    assert.deepEqual(order, ['a-acquired', 'a-releasing', 'b-acquired']);
  } finally {
    cleanup();
  }
});

test('lockfile: dead-PID lockfile is cleared within pollMs + staleness window', async () => {
  const { path, cleanup } = tmpPath();
  try {
    const lockPath = `${path}.lock`;
    // Plant a lock file with a pid that is NOT alive on this host.
    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: LIKELY_DEAD_PID,
        host: hostname(),
        acquired_at: new Date().toISOString(),
      }),
      { encoding: 'utf8' },
    );
    assert.equal(existsSync(lockPath), true);

    // PID-dead check fires on the first EEXIST retry; 500ms maxWaitMs is
    // plenty. If the stale detection doesn't fire, we'd time out and throw.
    const start = Date.now();
    const release = await acquire(path, { maxWaitMs: 500, pollMs: 20 });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `acquired in ${elapsed}ms, must be < 500ms`);
    await release();
  } finally {
    cleanup();
  }
});

test('lockfile: age-older-than-staleMs is cleared (even if PID is alive)', async () => {
  const { path, cleanup } = tmpPath();
  try {
    const lockPath = `${path}.lock`;
    // Plant a lock with THIS process's pid (definitely alive) but an
    // acquired_at timestamp older than staleMs.
    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        host: hostname(),
        acquired_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      { encoding: 'utf8' },
    );

    // staleMs = 100ms; the planted lock is 60s old → stale on first check.
    const release = await acquire(path, {
      maxWaitMs: 500,
      pollMs: 20,
      staleMs: 100,
    });
    await release();
  } finally {
    cleanup();
  }
});

test('lockfile: fresh lock held by alive PID forces maxWaitMs timeout', async () => {
  const { path, cleanup } = tmpPath();
  try {
    const lockPath = `${path}.lock`;
    // Plant a fresh, alive-PID lock — this process holds it.
    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        host: hostname(),
        acquired_at: new Date().toISOString(),
      }),
      { encoding: 'utf8' },
    );

    let caught: unknown = null;
    try {
      await acquire(path, { maxWaitMs: 200, pollMs: 20, staleMs: 60_000 });
    } catch (err) {
      caught = err;
    }
    assert.ok(
      caught instanceof LockAcquisitionError,
      'expected LockAcquisitionError',
    );
    assert.match((caught as LockAcquisitionError).lockContents, /"pid"/);
  } finally {
    cleanup();
  }
});

test('lockfile: corrupted lock contents are treated as fresh (not stale)', async () => {
  const { path, cleanup } = tmpPath();
  try {
    const lockPath = `${path}.lock`;
    writeFileSync(lockPath, 'this is not JSON', 'utf8');

    // A garbage lock: parseLock returns null → isStale NOT called → retry
    // until maxWaitMs. This avoids clobbering an unknown writer.
    let caught: unknown = null;
    try {
      await acquire(path, { maxWaitMs: 200, pollMs: 20 });
    } catch (err) {
      caught = err;
    }
    assert.ok(
      caught instanceof LockAcquisitionError,
      'expected LockAcquisitionError for corrupted lock',
    );
  } finally {
    cleanup();
  }
});
