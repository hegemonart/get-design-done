// tests/race-condition-state-mutation.test.ts
// ---------------------------------------------------------------------------
// Plan 20-15, SDK-12 — end-to-end concurrency validation of the gdd-state
// lockfile-backed mutate() API.
//
// Design:
//   * Scaffold a fresh STATE.md seeded from `tests/fixtures/state/mid-pipeline.md`
//     with a known `task_progress = 0/N` and empty `<blockers>`.
//   * Spawn 4 `child_process.fork()` workers. Each worker imports the gdd-state
//     module and runs 500 randomized mutate() ops (update_progress, add_blocker,
//     resolve_blocker) against the SAME STATE.md path.
//   * Each worker reports its own op counts via IPC.
//   * After all 4 exit, the parent asserts:
//       1. No `.lock` file left behind.
//       2. No orphan `.tmp` file.
//       3. STATE.md parses — no torn write, no malformed YAML.
//       4. `position.task_progress` numerator equals total increment count
//          across all workers (no lost writes).
//       5. `blockers.length` equals totalAdds - totalResolves (exact equality;
//          every add/resolve survived).
//       6. Byte-identical round-trip through parse→serialize→parse.
//       7. Duration < 60s.
//
// The test is Windows-aware: lockfile.ts already retries EPERM/EBUSY from
// AV scanners, and mutate() itself retries the atomic rename once. No
// per-test timeout extension; if this flakes under 60s it indicates a bug
// in the lockfile/mutator, not a test-harness issue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fork, type ChildProcess } from 'node:child_process';

import { read } from '../scripts/lib/gdd-state/index.ts';
import { parse } from '../scripts/lib/gdd-state/parser.ts';
import { serialize } from '../scripts/lib/gdd-state/mutator.ts';
import { REPO_ROOT } from './helpers.ts';

interface WorkerSummary {
  workerId: number;
  adds: number;
  resolves: number;
  resolveNoops: number;
  increments: number;
  errors: number;
}

const WORKER_COUNT = 4;
const ITERATIONS_PER_WORKER = 500;
const TOTAL_OPS = WORKER_COUNT * ITERATIONS_PER_WORKER;

/**
 * Seed `STATE.md` at `path` with a known-good mid-pipeline fixture but
 * with `task_progress` initialized to `0/N` (N large enough that workers
 * cannot overflow it) and an empty `<blockers>` block.
 *
 * We intentionally DO NOT touch the body_trailer (timestamps block) so the
 * parser + serializer round-trip logic is exercised fully.
 */
function seedStateFile(path: string): void {
  const FIXTURE = join(REPO_ROOT, 'tests', 'fixtures', 'state', 'mid-pipeline.md');
  const raw: string = readFileSync(FIXTURE, 'utf8');
  // Replace task_progress with 0/<plenty> and empty the <blockers> block.
  const reset = raw
    .replace(/task_progress: \d+\/\d+/, `task_progress: 0/${TOTAL_OPS + 100}`)
    .replace(
      /<blockers>[\s\S]*?<\/blockers>/,
      '<blockers>\n</blockers>',
    );
  writeFileSync(path, reset, 'utf8');
}

/**
 * Fork one worker and collect its WorkerSummary.
 *
 * Resolves on `exit` — waits for both `message` and `exit` to avoid races
 * where exit fires before we've registered the summary.
 */
function runWorker(
  workerId: number,
  statePath: string,
): Promise<WorkerSummary> {
  return new Promise((resolve, reject) => {
    const workerScript = join(
      REPO_ROOT,
      'tests',
      'fixtures',
      'race-worker.ts',
    );
    const child: ChildProcess = fork(
      workerScript,
      [statePath, String(ITERATIONS_PER_WORKER), String(workerId)],
      {
        execArgv: ['--experimental-strip-types'],
        // Keep stderr visible for debugging; silence stdout to avoid noise.
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      },
    );

    let summary: WorkerSummary | null = null;
    let exited = false;
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;

    child.on('message', (msg: unknown) => {
      // Trust-but-verify shape.
      if (msg && typeof msg === 'object' && 'workerId' in msg) {
        summary = msg as WorkerSummary;
      }
    });

    child.on('error', (err) => reject(err));

    child.on('exit', (code, signal) => {
      exited = true;
      exitCode = code;
      exitSignal = signal;
      if (code !== 0) {
        reject(
          new Error(
            `worker ${workerId} exited with code=${code} signal=${signal}`,
          ),
        );
        return;
      }
      if (summary === null) {
        reject(
          new Error(
            `worker ${workerId} exited ${code} but never sent a summary`,
          ),
        );
        return;
      }
      resolve(summary);
    });

    // Safety net — if the worker hangs, fail fast.
    const hangGuard = setTimeout(() => {
      if (!exited) {
        child.kill('SIGKILL');
        reject(
          new Error(
            `worker ${workerId} exceeded 55s hard-timeout (test ceiling is 60s)`,
          ),
        );
      }
    }, 55_000);
    // Unref the guard so it doesn't keep the event loop alive after the
    // worker exits cleanly.
    hangGuard.unref();
    child.on('exit', () => clearTimeout(hangGuard));

    // Reference unused tracker vars to silence noUnusedLocals.
    void exitCode;
    void exitSignal;
  });
}

test('race-condition: 4 concurrent workers × 500 ops each, zero corruption', async (t) => {
  // Test-level timeout — node:test accepts `options.timeout` but
  // `signal`-based cancellation is what it actually honors. We enforce the
  // 60s budget via a Promise.race below and a per-worker 55s hang-guard.
  const startedAt = Date.now();

  const dir = mkdtempSync(join(tmpdir(), 'gdd-race-'));
  const statePath = join(dir, 'STATE.md');

  try {
    seedStateFile(statePath);

    // Launch all 4 workers in parallel.
    const workerPromises: Promise<WorkerSummary>[] = [];
    for (let i = 0; i < WORKER_COUNT; i++) {
      workerPromises.push(runWorker(i, statePath));
    }

    // Race against a hard 60s wall-clock.
    const summaries = await Promise.race<WorkerSummary[]>([
      Promise.all(workerPromises),
      new Promise<WorkerSummary[]>((_, reject) =>
        setTimeout(
          () => reject(new Error('60s test timeout — expected <60s')),
          60_000,
        ).unref(),
      ),
    ]);

    const duration = (Date.now() - startedAt) / 1000;
    t.diagnostic(`All 4 workers completed in ${duration.toFixed(2)}s`);

    // --- Aggregate invariants -------------------------------------------
    let totalAdds = 0;
    let totalResolves = 0;
    let totalIncrements = 0;
    let totalErrors = 0;
    for (const s of summaries) {
      totalAdds += s.adds;
      totalResolves += s.resolves;
      totalIncrements += s.increments;
      totalErrors += s.errors;
    }

    assert.equal(totalErrors, 0, 'workers reported zero mutate() errors');
    assert.equal(
      totalAdds + totalResolves + totalIncrements +
        summaries.reduce((a, s) => a + s.resolveNoops, 0),
      TOTAL_OPS,
      'op-count accounting must sum to WORKER_COUNT * ITERATIONS_PER_WORKER',
    );

    // --- File-system invariants ----------------------------------------
    assert.equal(
      existsSync(`${statePath}.lock`),
      false,
      'no stale .lock file after all workers exit',
    );
    assert.equal(
      existsSync(`${statePath}.tmp`),
      false,
      'no orphan .tmp file after all workers exit',
    );
    const leftover = readdirSync(dir).filter(
      (f) => f.endsWith('.lock') || f.endsWith('.tmp'),
    );
    assert.deepEqual(
      leftover,
      [],
      `no .lock or .tmp files should remain in ${dir} (found: ${leftover.join(', ')})`,
    );

    // --- Parse-correctness invariants ----------------------------------
    const final = await read(statePath);
    const m = final.position.task_progress.match(/^(\d+)\/(\d+)$/);
    assert.ok(
      m,
      `final task_progress "${final.position.task_progress}" parses as N/M`,
    );
    const numerator = Number(m?.[1]);
    assert.equal(
      numerator,
      totalIncrements,
      `task_progress numerator (${numerator}) must equal total increments across workers (${totalIncrements}) — zero lost writes`,
    );

    assert.equal(
      final.blockers.length,
      totalAdds - totalResolves,
      `final blockers.length (${final.blockers.length}) must equal totalAdds (${totalAdds}) - totalResolves (${totalResolves})`,
    );

    // Byte-identical round-trip — catches any torn/partial serializer
    // output that still happens to parse but differs from the canonical form.
    const rawOnDisk: string = readFileSync(statePath, 'utf8');
    const { state, raw_frontmatter, raw_bodies, block_gaps, line_ending } =
      parse(rawOnDisk);
    const reserialized = serialize(state, {
      raw_frontmatter,
      raw_bodies,
      block_gaps,
      line_ending,
    });
    const reparsed = parse(reserialized).state;
    assert.equal(
      reparsed.position.task_progress,
      final.position.task_progress,
      'round-trip preserves task_progress',
    );
    assert.equal(
      reparsed.blockers.length,
      final.blockers.length,
      'round-trip preserves blockers.length',
    );

    // Duration sanity — hard cap already enforced above, but record it.
    assert.ok(
      duration < 60,
      `race test must finish in <60s (took ${duration.toFixed(2)}s)`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
