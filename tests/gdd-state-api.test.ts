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
} from '../scripts/lib/gdd-state/index.ts';
import { REPO_ROOT } from './helpers.ts';

const FIXTURES: string = join(REPO_ROOT, 'tests', 'fixtures', 'state');

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

test('TransitionGateFailed: carries blockers array', () => {
  const err = new TransitionGateFailed('design', ['gate-A failed', 'gate-B failed']);
  assert.equal(err.name, 'TransitionGateFailed');
  assert.deepEqual(err.blockers, ['gate-A failed', 'gate-B failed']);
  assert.match(err.message, /gate-A failed/);
});
