// tests/fixtures/race-worker.ts — child worker for the 4-way STATE.md
// race-condition test (Plan 20-15, SDK-12).
//
// Invocation: `node --experimental-strip-types tests/fixtures/race-worker.ts <statePath> <iterations> <workerId>`
// When launched via `child_process.fork()` with the `--experimental-strip-types`
// exec-argv, stdio includes an IPC channel; we report the summary via
// `process.send()`.
//
// Each iteration picks one of three ops uniformly at random:
//   * update_progress — bump `position.task_progress` numerator by 1
//   * add_blocker      — append a blocker tagged with this worker id + seq
//   * resolve_blocker  — remove the first blocker whose text starts with
//                        `worker-<id>:` (may no-op if this worker has none
//                        outstanding yet; that is expected).
//
// The serializer for `<blockers>` is canonical `[stage] [date]: text`; we
// encode the worker-id + sequence in `text` so the parent test can
// post-hoc count how many adds/resolves survived vs. which were absorbed
// into the final state.

import { mutate } from '../../scripts/lib/gdd-state/index.ts';

interface WorkerSummary {
  workerId: number;
  adds: number;
  resolves: number;
  resolveNoops: number;
  increments: number;
  errors: number;
}

async function main(): Promise<void> {
  const [statePathArg, iterationsArg, workerIdArg] = process.argv.slice(2);
  const statePath: string | undefined = statePathArg;
  const iterations: number = Number(iterationsArg);
  const workerId: number = Number(workerIdArg);
  if (!statePath || !Number.isFinite(iterations) || !Number.isFinite(workerId)) {
    throw new Error(
      `race-worker: missing/invalid args. Got statePath=${statePath}, iterations=${iterationsArg}, workerId=${workerIdArg}`,
    );
  }

  const summary: WorkerSummary = {
    workerId,
    adds: 0,
    resolves: 0,
    resolveNoops: 0,
    increments: 0,
    errors: 0,
  };

  // Deterministic per-worker RNG so the test stays reproducible but each
  // worker explores a different op sequence. Simple LCG seeded by workerId.
  let seed: number = (workerId + 1) * 0x9e3779b1;
  function nextOp(): number {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % 3;
  }

  for (let seq = 0; seq < iterations; seq++) {
    const op: number = nextOp();
    try {
      if (op === 0) {
        // update_progress — parse current numerator/total, bump numerator.
        await mutate(statePath, (s) => {
          const tp: string = s.position.task_progress;
          const m = tp.match(/^(\d+)\/(\d+)$/);
          if (m) {
            const next: number = Number(m[1]) + 1;
            s.position.task_progress = `${next}/${m[2]}`;
          } else {
            // Fallback: initialize to 1/<workers*iters>. Should not happen
            // because the parent seeds a valid value.
            s.position.task_progress = `1/${4 * iterations}`;
          }
          return s;
        });
        summary.increments++;
      } else if (op === 1) {
        // add_blocker — append uniquely-tagged entry.
        const tag = `worker-${workerId}:${seq}`;
        await mutate(statePath, (s) => {
          s.blockers.push({
            stage: s.position.stage || 'design',
            date: '2026-04-24',
            text: tag,
          });
          return s;
        });
        summary.adds++;
      } else {
        // resolve_blocker — remove the first blocker this worker previously
        // added that is still present. No-op when none remain.
        const tagPrefix = `worker-${workerId}:`;
        let removed = false;
        await mutate(statePath, (s) => {
          const idx: number = s.blockers.findIndex((b) =>
            b.text.startsWith(tagPrefix),
          );
          if (idx >= 0) {
            s.blockers.splice(idx, 1);
            removed = true;
          }
          return s;
        });
        if (removed) summary.resolves++;
        else summary.resolveNoops++;
      }
    } catch (err) {
      summary.errors++;
      const msg: string =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      // Report once per worker — parent will fail the test if errors > 0.
      process.stderr.write(
        `[race-worker ${workerId}] op=${op} seq=${seq} error: ${msg}\n`,
      );
    }
  }

  if (typeof process.send === 'function') {
    process.send(summary);
  } else {
    // Fallback for direct invocation (not via fork) — print to stdout.
    process.stdout.write(JSON.stringify(summary) + '\n');
  }
}

main().catch((err: unknown) => {
  const msg: string =
    err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  process.stderr.write(`[race-worker] fatal: ${msg}\n`);
  process.exit(1);
});
