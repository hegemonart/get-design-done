// tests/gdd-state-api.test.ts — public-API integration tests.
//
// Covers read(), mutate(), transition() — the entry points consumers see.
// Complements the parser / mutator / lockfile unit tests by exercising
// the composed path: read-from-disk, acquire lock, write-then-rename.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  read,
  mutate,
  transition,
  TransitionGateFailed,
} from '../../sdk/state/index.ts';
import { acquire } from '../../sdk/state/lockfile.ts';
import { REPO_ROOT } from './helpers.ts';

const FIXTURES: string = join(REPO_ROOT, 'test', 'suite', 'fixtures', 'state');

function scaffoldStateFile(): {
  path: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-state-api-'));
  const path = join(dir, 'STATE.md');
  writeFileSync(path, readFileSync(join(FIXTURES, 'mid-pipeline.md'), 'utf8'));
  return {
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('read: returns ParsedState from disk', async () => {
  const { path, cleanup } = scaffoldStateFile();
  try {
    const state = await read(path);
    assert.equal(state.position.stage, 'design');
    assert.equal(state.decisions.length, 3);
    assert.equal(state.must_haves.length, 3);
    assert.equal(state.blockers.length, 2);
  } finally {
    cleanup();
  }
});

test('mutate: applies fn and writes atomically', async () => {
  const { path, cleanup } = scaffoldStateFile();
  try {
    const before = await read(path);
    assert.equal(before.position.task_progress, '3/7');

    const after = await mutate(path, (s) => {
      s.position.task_progress = '4/7';
      return s;
    });
    assert.equal(after.position.task_progress, '4/7');

    // On-disk reflects the change.
    const reread = await read(path);
    assert.equal(reread.position.task_progress, '4/7');

    // No .tmp file left behind.
    assert.equal(existsSync(`${path}.tmp`), false, 'no orphan tmp file');
    // No .lock file left behind.
    assert.equal(existsSync(`${path}.lock`), false, 'lock released');
  } finally {
    cleanup();
  }
});

test('mutate: throwing fn does not modify STATE.md (atomic on error)', async () => {
  const { path, cleanup } = scaffoldStateFile();
  try {
    const originalContents = readFileSync(path, 'utf8');

    let caught: unknown = null;
    try {
      await mutate(path, (s) => {
        s.position.task_progress = 'should-not-be-written';
        throw new Error('consumer error');
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error);
    assert.equal((caught as Error).message, 'consumer error');

    // File contents unchanged.
    assert.equal(readFileSync(path, 'utf8'), originalContents);

    // Lock and tmp cleaned up.
    assert.equal(existsSync(`${path}.tmp`), false);
    assert.equal(existsSync(`${path}.lock`), false);
  } finally {
    cleanup();
  }
});

test('mutate: concurrent mutations serialize without losing updates', async () => {
  const { path, cleanup } = scaffoldStateFile();
  try {
    // Kick off 5 concurrent mutations each appending a decision. Under
    // a correct lock, all 5 should land; any race would drop some.
    const promises = Array.from({ length: 5 }, (_, i) =>
      mutate(path, (s) => {
        s.decisions.push({
          id: `D-${90 + i}`,
          text: `concurrent-decision-${i}`,
          status: 'tentative',
        });
        return s;
      }),
    );
    await Promise.all(promises);

    const final = await read(path);
    // Original 3 + 5 new = 8 decisions.
    assert.equal(final.decisions.length, 8);
    const ids = final.decisions.map((d) => d.id).sort();
    for (let i = 0; i < 5; i++) {
      assert.ok(ids.includes(`D-${90 + i}`), `D-${90 + i} must be present`);
    }
  } finally {
    cleanup();
  }
});

test('transition: advances stage under stub gate (always pass)', async () => {
  const { path, cleanup } = scaffoldStateFile();
  try {
    const before = await read(path);
    assert.equal(before.position.stage, 'design');

    const result = await transition(path, 'verify');
    assert.equal(result.pass, true);
    assert.equal(result.state.position.stage, 'verify');
    assert.equal(result.state.frontmatter.stage, 'verify');
    // last_checkpoint should have been updated to a fresh ISO string.
    assert.match(result.state.frontmatter.last_checkpoint, /^\d{4}-\d{2}-\d{2}T/);
    // verify_started_at timestamp recorded.
    assert.match(
      result.state.timestamps['verify_started_at'] ?? '',
      /^\d{4}-\d{2}-\d{2}T/,
    );
  } finally {
    cleanup();
  }
});

test('transition (D4): re-checks the gate INSIDE the lock against fresh state', async () => {
  // Audit D4: the gate is first evaluated against a PRE-LOCK read. If a
  // concurrent writer changes the stage between that read and the locked
  // mutate, the transition must NOT stamp an invalid advance — the in-lock
  // re-check must catch it and veto.
  //
  // Deterministic ordering, forcing the IN-LOCK path specifically:
  //   1. Manually hold the STATE.md lock (raw acquire()).
  //   2. Start transition('verify'). Its PRE-LOCK read sees stage="design"
  //      (still on disk, the gate design→verify passes), then it BLOCKS on
  //      the held lock before its mutate can re-read.
  //   3. While the lock is held, rewrite STATE.md on disk so stage="verify".
  //   4. Release the lock. transition() acquires, RE-READS "verify", and the
  //      in-lock re-check throws TransitionGateFailed (verify→verify is null),
  //      stamping nothing.
  const { path, cleanup } = scaffoldStateFile();
  try {
    const before = await read(path);
    assert.equal(before.position.stage, 'design');

    // 1. Hold the lock out-of-band.
    const release = await acquire(path, { maxWaitMs: 2_000, pollMs: 10 });

    // 2. Start transition; it does its pre-lock read (sees "design") then
    //    queues on the held lock.
    let caught: unknown = null;
    let result: unknown = null;
    const txn = transition(path, 'verify')
      .then((r) => { result = r; })
      .catch((e) => { caught = e; });

    // Let transition reach its pre-lock read + block on acquire.
    await new Promise((r) => setTimeout(r, 30));

    // 3. Flip stage→verify on disk WHILE the lock is held (direct byte edit
    //    so we don't contend for the lock ourselves).
    const flipped = readFileSync(path, 'utf8')
      .replace(/stage: design/g, 'stage: verify');
    writeFileSync(path, flipped, 'utf8');

    // 4. Release; transition acquires, re-reads "verify", in-lock re-check
    //    vetoes.
    await release();
    await txn;

    assert.ok(
      caught instanceof TransitionGateFailed,
      `expected TransitionGateFailed from the in-lock re-check, got ${String(result)}`,
    );
    assert.match(
      (caught as TransitionGateFailed).blockers.join(' '),
      /changed under lock/,
      'blocker explains the under-lock stage change (in-lock re-check fired)',
    );

    // On-disk stage is the value we flipped to — the vetoed transition
    // stamped NOTHING.
    const final = await read(path);
    assert.equal(final.position.stage, 'verify');
    assert.equal(existsSync(`${path}.lock`), false, 'lock released');
    assert.equal(existsSync(`${path}.tmp`), false, 'no orphan tmp');
  } finally {
    cleanup();
  }
});

test('TransitionGateFailed: carries blockers array', () => {
  const err = new TransitionGateFailed('design', ['gate-A failed', 'gate-B failed']);
  assert.equal(err.name, 'TransitionGateFailed');
  assert.deepEqual(err.blockers, ['gate-A failed', 'gate-B failed']);
  assert.match(err.message, /gate-A failed/);
});
