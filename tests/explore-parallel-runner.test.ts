// tests/explore-parallel-runner.test.ts — Plan 21-06 (SDK-18) coverage.
//
// Exercises the 4-mapper parallel explore runner end-to-end via the
// `runOverride` injection (no Agent SDK, no network, no real sessions).
//
// Test groups (per Plan 21-06 Task 5):
//   1. isParallelismSafe                     (4 tests)
//   2. spawnMapper                           (4 tests)
//   3. spawnMappersParallel                  (4 tests)
//   4. synthesizeStreaming                   (4 tests)
//   5. run() orchestrator                    (6 tests)
//   6. Logger integration                    (2 tests)
//
// Target: 24+ tests. Runner: `node --test --experimental-strip-types tests/explore-parallel-runner.test.ts`.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DEFAULT_MAPPERS,
  isParallelismSafe,
  run,
  spawnMapper,
  spawnMappersParallel,
  synthesizeStreaming,
} from '../scripts/lib/explore-parallel-runner/index.ts';
import type {
  ExploreRunnerOptions,
  MapperSpec,
  MapperName,
} from '../scripts/lib/explore-parallel-runner/index.ts';
import type {
  BudgetCap,
  SessionResult,
  SessionRunnerOptions,
} from '../scripts/lib/session-runner/types.ts';
import {
  createLogger,
  resetLogger,
  setLogger,
} from '../scripts/lib/logger/index.ts';
import type { LogEntry, Sink } from '../scripts/lib/logger/index.ts';

// ── Sandbox helpers ─────────────────────────────────────────────────────────

let SANDBOX_ROOT: string = '';
let ORIGINAL_CWD: string = process.cwd();
const FIXTURES_ROOT: string = resolve('tests/fixtures/explore-parallel-runner');

beforeEach(() => {
  SANDBOX_ROOT = mkdtempSync(join(tmpdir(), 'gdd-explore-runner-'));
  mkdirSync(join(SANDBOX_ROOT, '.design', 'map'), { recursive: true });
  mkdirSync(join(SANDBOX_ROOT, 'agents'), { recursive: true });
  ORIGINAL_CWD = process.cwd();
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  resetLogger();
  rmSync(SANDBOX_ROOT, { recursive: true, force: true });
});

/** Default BudgetCap used by every test. */
const BUDGET: BudgetCap = Object.freeze({
  usdLimit: 100,
  inputTokensLimit: 1_000_000,
  outputTokensLimit: 1_000_000,
});

/** Build a canned SessionResult for runOverride stubs. */
function fakeSessionResult(
  overrides: Partial<SessionResult> = {},
): SessionResult {
  return {
    status: 'completed',
    transcript_path: '/tmp/fake-transcript.jsonl',
    turns: 1,
    usage: { input_tokens: 100, output_tokens: 50, usd_cost: 0.001 },
    tool_calls: [],
    sanitizer: { applied: [], removedSections: [] },
    ...overrides,
  };
}

/** Build a MapperSpec pointing at a sandbox-relative output path. */
function spec(
  name: MapperName,
  outputRel: string,
  agentRel: string,
): MapperSpec {
  return Object.freeze({
    name,
    agentPath: agentRel,
    outputPath: outputRel,
    prompt: `run ${name}`,
  });
}

/** Copy a fixture agent into the sandbox/agents dir under a chosen name. */
function installAgentFixture(fixtureFile: string, targetName: string): string {
  const src = join(FIXTURES_ROOT, fixtureFile);
  const dst = join(SANDBOX_ROOT, 'agents', `${targetName}.md`);
  writeFileSync(dst, readFileSync(src, 'utf8'));
  return dst;
}

/** Pre-populate a `.design/map/*.md` file inside the sandbox. */
function writeMapFile(name: string, content: string): string {
  const path = join(SANDBOX_ROOT, '.design', 'map', `${name}.md`);
  writeFileSync(path, content);
  return path;
}

// ============================================================================
// 1. isParallelismSafe (4 tests)
// ============================================================================

test('isParallelismSafe: missing file → true (default-safe)', () => {
  assert.equal(
    isParallelismSafe(join(SANDBOX_ROOT, 'agents', 'does-not-exist.md')),
    true,
  );
});

test('isParallelismSafe: missing field → true (default-safe)', () => {
  const path = installAgentFixture('agent-no-field.md', 'no-field');
  assert.equal(isParallelismSafe(path), true);
});

test('isParallelismSafe: parallelism_safe: true → true', () => {
  const path = installAgentFixture('agent-safe.md', 'safe');
  assert.equal(isParallelismSafe(path), true);
});

test('isParallelismSafe: parallelism_safe: false → false', () => {
  const path = installAgentFixture('agent-unsafe.md', 'unsafe');
  assert.equal(isParallelismSafe(path), false);
});

// ============================================================================
// 2. spawnMapper (4 tests)
// ============================================================================

test('spawnMapper: mocked success + output file present → status completed, output_exists true', async () => {
  const outRel = '.design/map/token.md';
  const runOverride = async (
    _o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    // Simulate the mapper writing its output during the session.
    writeMapFile('token', '# token map\n\ncontent');
    return fakeSessionResult();
  };

  const outcome = await spawnMapper(
    spec('token', outRel, 'agents/token-mapper.md'),
    { budget: BUDGET, maxTurns: 5, cwd: SANDBOX_ROOT, runOverride },
  );

  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.output_exists, true);
  assert.ok(outcome.output_bytes > 0);
  assert.ok(outcome.duration_ms >= 0);
});

test('spawnMapper: session returns error → MapperOutcome.status error + .error populated', async () => {
  const runOverride = async (): Promise<SessionResult> =>
    fakeSessionResult({
      status: 'error',
      error: { code: 'BUDGET', message: 'budget exceeded', kind: 'resource_exhausted' },
      usage: { input_tokens: 50, output_tokens: 25, usd_cost: 0.0005 },
    });

  const outcome = await spawnMapper(
    spec('token', '.design/map/token.md', 'agents/token-mapper.md'),
    { budget: BUDGET, maxTurns: 5, cwd: SANDBOX_ROOT, runOverride },
  );

  assert.equal(outcome.status, 'error');
  assert.notEqual(outcome.error, undefined);
  assert.equal(outcome.error?.code, 'BUDGET');
  assert.equal(outcome.usage.input_tokens, 50);
});

test('spawnMapper: session completed but output file missing → output_exists false, status still completed', async () => {
  const runOverride = async (): Promise<SessionResult> =>
    fakeSessionResult(); // does NOT write the output file

  const outcome = await spawnMapper(
    spec('a11y', '.design/map/a11y.md', 'agents/a11y-mapper.md'),
    { budget: BUDGET, maxTurns: 5, cwd: SANDBOX_ROOT, runOverride },
  );

  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.output_exists, false);
  assert.equal(outcome.output_bytes, 0);
});

test('spawnMapper: duration_ms measured from start to end', async () => {
  const runOverride = async (): Promise<SessionResult> => {
    await new Promise((r) => setTimeout(r, 20));
    return fakeSessionResult();
  };

  const outcome = await spawnMapper(
    spec('token', '.design/map/token.md', 'agents/token-mapper.md'),
    { budget: BUDGET, maxTurns: 5, cwd: SANDBOX_ROOT, runOverride },
  );

  assert.ok(
    outcome.duration_ms >= 15,
    `expected duration_ms >= 15, got ${outcome.duration_ms}`,
  );
});

// ============================================================================
// 3. spawnMappersParallel (4 tests)
// ============================================================================

test('spawnMappersParallel: 4 mappers with concurrency 4 → all start before any finishes', async () => {
  const startTimes: number[] = [];
  const endBarrier: { resolve?: () => void; promise?: Promise<void> } = {};
  endBarrier.promise = new Promise((r) => {
    endBarrier.resolve = r;
  });

  let started = 0;
  const runOverride = async (): Promise<SessionResult> => {
    startTimes.push(Date.now());
    started += 1;
    if (started >= 4) {
      // Release all once the 4th starts.
      endBarrier.resolve?.();
    }
    await endBarrier.promise;
    return fakeSessionResult();
  };

  const specs: readonly MapperSpec[] = [
    spec('token', '.design/map/token.md', 'agents/token-mapper.md'),
    spec('component-taxonomy', '.design/map/component-taxonomy.md', 'agents/component-taxonomy-mapper.md'),
    spec('a11y', '.design/map/a11y.md', 'agents/a11y-mapper.md'),
    spec('visual-hierarchy', '.design/map/visual-hierarchy.md', 'agents/visual-hierarchy-mapper.md'),
  ];

  const outcomes = await spawnMappersParallel(specs, {
    concurrency: 4,
    budget: BUDGET,
    maxTurns: 5,
    cwd: SANDBOX_ROOT,
    runOverride,
  });

  assert.equal(outcomes.length, 4);
  assert.equal(started, 4, 'all 4 must have started concurrently');
  // All start timestamps should be within a small window (proving all
  // 4 launched before any returned).
  const spread = Math.max(...startTimes) - Math.min(...startTimes);
  assert.ok(spread < 500, `start spread ${spread}ms — concurrent spawn should be tight`);
});

test('spawnMappersParallel: concurrency 2 → at most 2 concurrent; third waits', async () => {
  let concurrent = 0;
  let peak = 0;
  const runOverride = async (): Promise<SessionResult> => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await new Promise((r) => setTimeout(r, 25));
    concurrent -= 1;
    return fakeSessionResult();
  };

  const specs: readonly MapperSpec[] = [
    spec('token', '.design/map/token.md', 'agents/token-mapper.md'),
    spec('component-taxonomy', '.design/map/component-taxonomy.md', 'agents/component-taxonomy-mapper.md'),
    spec('a11y', '.design/map/a11y.md', 'agents/a11y-mapper.md'),
    spec('visual-hierarchy', '.design/map/visual-hierarchy.md', 'agents/visual-hierarchy-mapper.md'),
  ];

  await spawnMappersParallel(specs, {
    concurrency: 2,
    budget: BUDGET,
    maxTurns: 5,
    cwd: SANDBOX_ROOT,
    runOverride,
  });

  assert.ok(peak <= 2, `peak concurrency ${peak} should be ≤ 2`);
});

test('spawnMappersParallel: one mapper errors → others continue; outcomes in input order', async () => {
  const runOverride = async (
    o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    if (o.prompt.startsWith('run a11y')) {
      return fakeSessionResult({
        status: 'error',
        error: { code: 'BOOM', message: 'a11y exploded', kind: 'operation_failed' },
      });
    }
    return fakeSessionResult();
  };

  const specs: readonly MapperSpec[] = [
    spec('token', '.design/map/token.md', 'agents/token-mapper.md'),
    spec('component-taxonomy', '.design/map/component-taxonomy.md', 'agents/component-taxonomy-mapper.md'),
    spec('a11y', '.design/map/a11y.md', 'agents/a11y-mapper.md'),
    spec('visual-hierarchy', '.design/map/visual-hierarchy.md', 'agents/visual-hierarchy-mapper.md'),
  ];

  const outcomes = await spawnMappersParallel(specs, {
    concurrency: 4,
    budget: BUDGET,
    maxTurns: 5,
    cwd: SANDBOX_ROOT,
    runOverride,
  });

  assert.equal(outcomes.length, 4);
  assert.deepEqual(
    outcomes.map((o) => o.name),
    ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy'],
    'order must match input spec order',
  );
  assert.equal(outcomes[0]?.status, 'completed');
  assert.equal(outcomes[1]?.status, 'completed');
  assert.equal(outcomes[2]?.status, 'error');
  assert.equal(outcomes[2]?.error?.code, 'BOOM');
  assert.equal(outcomes[3]?.status, 'completed');
});

test('spawnMappersParallel: empty specs → empty outcomes array', async () => {
  const outcomes = await spawnMappersParallel([], {
    concurrency: 4,
    budget: BUDGET,
    maxTurns: 5,
    cwd: SANDBOX_ROOT,
  });
  assert.equal(outcomes.length, 0);
});

// ============================================================================
// 4. synthesizeStreaming (4 tests)
// ============================================================================

test('synthesizeStreaming: all mapper files present at start → synthesizer receives concat prompt', async () => {
  writeMapFile('token', '# TOKEN MAP\ncolor: red');
  writeMapFile('component-taxonomy', '# COMPONENT MAP\nButton');
  writeMapFile('a11y', '# A11Y MAP\ncontrast OK');
  writeMapFile('visual-hierarchy', '# VH MAP\nz-order');

  let observedPrompt: string = '';
  const runOverride = async (
    o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    observedPrompt = o.prompt;
    return fakeSessionResult({
      usage: { input_tokens: 1000, output_tokens: 500, usd_cost: 0.01 },
    });
  };

  const result = await synthesizeStreaming({
    mapperNames: ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy'],
    mapperOutputPaths: [
      '.design/map/token.md',
      '.design/map/component-taxonomy.md',
      '.design/map/a11y.md',
      '.design/map/visual-hierarchy.md',
    ],
    synthesizerPrompt: 'SYNTH BASE PROMPT',
    budget: BUDGET,
    maxTurns: 5,
    cwd: SANDBOX_ROOT,
    runOverride,
    pollIntervalMs: 10,
    timeoutMs: 2000,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.files_fed.length, 4);
  assert.ok(observedPrompt.includes('SYNTH BASE PROMPT'));
  assert.ok(observedPrompt.includes('# TOKEN MAP'));
  assert.ok(observedPrompt.includes('# A11Y MAP'));
  assert.ok(observedPrompt.includes('## Mapper: token'));
  assert.equal(result.usage.usd_cost, 0.01);
});

test('synthesizeStreaming: file appears mid-wait → picked up on next stable poll', async () => {
  // Start with no files. Spawn file-appearance after a short delay.
  const appearDelay = 60;
  setTimeout(() => {
    writeMapFile('token', '# token appeared');
  }, appearDelay);

  let observedPrompt: string = '';
  const runOverride = async (
    o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    observedPrompt = o.prompt;
    return fakeSessionResult();
  };

  const result = await synthesizeStreaming({
    mapperNames: ['token'],
    mapperOutputPaths: ['.design/map/token.md'],
    synthesizerPrompt: 'SYNTH',
    budget: BUDGET,
    maxTurns: 5,
    cwd: SANDBOX_ROOT,
    runOverride,
    pollIntervalMs: 15,
    timeoutMs: 2000,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.files_fed.length, 1);
  assert.ok(observedPrompt.includes('# token appeared'));
});

test('synthesizeStreaming: timeout with no files → status timeout, session never spawned', async () => {
  let spawned = 0;
  const runOverride = async (): Promise<SessionResult> => {
    spawned += 1;
    return fakeSessionResult();
  };

  const result = await synthesizeStreaming({
    mapperNames: ['token', 'a11y'],
    mapperOutputPaths: [
      '.design/map/token.md',
      '.design/map/a11y.md',
    ],
    synthesizerPrompt: 'SYNTH',
    budget: BUDGET,
    maxTurns: 5,
    cwd: SANDBOX_ROOT,
    runOverride,
    pollIntervalMs: 10,
    timeoutMs: 50,
  });

  assert.equal(result.status, 'timeout');
  assert.equal(result.files_fed.length, 0);
  assert.equal(spawned, 0, 'synthesizer session must NOT spawn with zero inputs');
});

test('synthesizeStreaming: session error during synth → status error, .error populated', async () => {
  writeMapFile('token', '# token');
  const runOverride = async (): Promise<SessionResult> =>
    fakeSessionResult({
      status: 'error',
      error: { code: 'SDK_BOOM', message: 'synth session failed', kind: 'operation_failed' },
    });

  const result = await synthesizeStreaming({
    mapperNames: ['token'],
    mapperOutputPaths: ['.design/map/token.md'],
    synthesizerPrompt: 'SYNTH',
    budget: BUDGET,
    maxTurns: 5,
    cwd: SANDBOX_ROOT,
    runOverride,
    pollIntervalMs: 10,
    timeoutMs: 2000,
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error?.code, 'SDK_BOOM');
  assert.equal(result.files_fed.length, 1);
});

// ============================================================================
// 5. run() orchestrator (6 tests)
// ============================================================================

/** Helper: build ExploreRunnerOptions with common fields defaulted. */
function runOpts(
  overrides: Partial<ExploreRunnerOptions> = {},
): ExploreRunnerOptions {
  const base: ExploreRunnerOptions = {
    budget: BUDGET,
    maxTurnsPerMapper: 5,
    synthesizerPrompt: 'SYNTH PROMPT',
    synthesizerBudget: BUDGET,
    synthesizerMaxTurns: 5,
    cwd: SANDBOX_ROOT,
    pollIntervalMs: 10,
    timeoutMs: 2000,
  };
  return { ...base, ...overrides };
}

/** Build a 4-spec roster pointing into the sandbox's agents/ dir. */
function sandboxMappers(): readonly MapperSpec[] {
  return Object.freeze([
    spec('token', '.design/map/token.md', 'agents/token-mapper.md'),
    spec('component-taxonomy', '.design/map/component-taxonomy.md', 'agents/component-taxonomy-mapper.md'),
    spec('a11y', '.design/map/a11y.md', 'agents/a11y-mapper.md'),
    spec('visual-hierarchy', '.design/map/visual-hierarchy.md', 'agents/visual-hierarchy-mapper.md'),
  ]);
}

test('run: default 4 mappers all parallel → parallel_count 4, serial_count 0', async () => {
  // No agent files → all default to parallelism_safe=true.
  const runOverride = async (
    o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    // Write each mapper's output so synthesizer can stabilize.
    for (const m of ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy']) {
      if (o.prompt.startsWith(`run ${m}`)) {
        writeMapFile(m, `# ${m}`);
      }
    }
    return fakeSessionResult({ usage: { input_tokens: 10, output_tokens: 5, usd_cost: 0.001 } });
  };

  const result = await run(
    runOpts({ mappers: sandboxMappers(), runOverride }),
  );

  assert.equal(result.parallel_count, 4);
  assert.equal(result.serial_count, 0);
  assert.equal(result.mappers.length, 4);
  assert.equal(result.synthesizer.status, 'completed');
});

test('run: one mapper flagged parallelism_safe: false → partitioned to serial', async () => {
  // Install an unsafe fixture for `a11y-mapper`.
  installAgentFixture('agent-unsafe.md', 'a11y-mapper');
  installAgentFixture('agent-safe.md', 'token-mapper');
  installAgentFixture('agent-safe.md', 'component-taxonomy-mapper');
  installAgentFixture('agent-safe.md', 'visual-hierarchy-mapper');

  const runOverride = async (
    o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    for (const m of ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy']) {
      if (o.prompt.startsWith(`run ${m}`)) {
        writeMapFile(m, `# ${m}`);
      }
    }
    return fakeSessionResult();
  };

  const result = await run(
    runOpts({ mappers: sandboxMappers(), runOverride }),
  );

  assert.equal(result.parallel_count, 3);
  assert.equal(result.serial_count, 1);
  assert.equal(result.mappers.length, 4);
  // All 4 must still have run and appear in results (input order).
  assert.deepEqual(
    result.mappers.map((m) => m.name),
    ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy'],
  );
});

test('run: usage aggregated correctly across mappers + synthesizer', async () => {
  let callCount = 0;
  const runOverride = async (
    o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    callCount += 1;
    for (const m of ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy']) {
      if (o.prompt.startsWith(`run ${m}`)) {
        writeMapFile(m, `# ${m}`);
      }
    }
    if (o.prompt.includes('SYNTH')) {
      return fakeSessionResult({
        usage: { input_tokens: 1000, output_tokens: 500, usd_cost: 1.0 },
      });
    }
    return fakeSessionResult({
      usage: { input_tokens: 100, output_tokens: 50, usd_cost: 0.1 },
    });
  };

  const result = await run(
    runOpts({ mappers: sandboxMappers(), runOverride }),
  );

  // 4 mappers × (100, 50, 0.1) + synthesizer (1000, 500, 1.0).
  assert.equal(result.total_usage.input_tokens, 400 + 1000);
  assert.equal(result.total_usage.output_tokens, 200 + 500);
  assert.ok(
    Math.abs(result.total_usage.usd_cost - (0.4 + 1.0)) < 1e-9,
    `got ${result.total_usage.usd_cost}`,
  );
  assert.equal(callCount, 5);
});

test('run: runOverride used for every session call (mappers + synth)', async () => {
  const invocations: string[] = [];
  const runOverride = async (
    o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    invocations.push(o.prompt.slice(0, 30));
    for (const m of ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy']) {
      if (o.prompt.startsWith(`run ${m}`)) {
        writeMapFile(m, `# ${m}`);
      }
    }
    return fakeSessionResult();
  };

  await run(runOpts({ mappers: sandboxMappers(), runOverride }));

  assert.equal(invocations.length, 5, 'expected 4 mappers + 1 synth');
});

test('run: concurrency 1 → all mappers serial (semaphore respects concurrency)', async () => {
  let concurrent = 0;
  let peak = 0;
  const runOverride = async (
    o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await new Promise((r) => setTimeout(r, 10));
    concurrent -= 1;
    for (const m of ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy']) {
      if (o.prompt.startsWith(`run ${m}`)) {
        writeMapFile(m, `# ${m}`);
      }
    }
    return fakeSessionResult();
  };

  await run(
    runOpts({ mappers: sandboxMappers(), concurrency: 1, runOverride }),
  );

  assert.equal(peak, 1, 'concurrency 1 should prevent parallel mapper execution');
});

test('run: empty mapper list short-circuits → synthesizer skipped', async () => {
  let called = 0;
  const runOverride = async (): Promise<SessionResult> => {
    called += 1;
    return fakeSessionResult();
  };

  const result = await run(runOpts({ mappers: [], runOverride }));

  assert.equal(result.mappers.length, 0);
  assert.equal(result.parallel_count, 0);
  assert.equal(result.serial_count, 0);
  assert.equal(result.synthesizer.status, 'skipped');
  assert.equal(result.total_usage.usd_cost, 0);
  assert.equal(called, 0, 'runOverride must not be called for empty roster');
});

// ============================================================================
// 6. Logger integration (2 tests)
// ============================================================================

class CapturingSink implements Sink {
  readonly entries: LogEntry[] = [];
  write(e: LogEntry): void {
    this.entries.push(e);
  }
  close(): void {
    /* noop */
  }
}

test('logger: explore.runner.mapper_done fires for each completed mapper', async () => {
  const sink = new CapturingSink();
  // Build a logger bound to the captured sink. createLogger() doesn't
  // take a sink directly — we install a custom logger via setLogger().
  const baseLogger = createLogger({ level: 'debug', emitEventsOverride: false });
  // Shim: wrap the real logger's .child() so emitted entries flow to
  // the captured sink instead. Simpler: construct a minimal Logger that
  // just captures — but we want child() propagation. We use the test
  // hook below:
  const capturingLogger = makeCapturingLogger(sink);
  setLogger(capturingLogger);

  const runOverride = async (
    o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    for (const m of ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy']) {
      if (o.prompt.startsWith(`run ${m}`)) {
        writeMapFile(m, `# ${m}`);
      }
    }
    return fakeSessionResult();
  };

  await run(runOpts({ mappers: sandboxMappers(), runOverride }));

  const mapperDone = sink.entries.filter(
    (e) => e.msg === 'explore.runner.mapper_done',
  );
  assert.equal(mapperDone.length, 4, 'expected 4 mapper_done entries, got ' + mapperDone.length);
  // Verify we have one per mapper name.
  const names = new Set(mapperDone.map((e) => e['mapper'] as string));
  assert.equal(names.size, 4);

  // Silence linter on unused baseLogger — it's the comparison anchor.
  void baseLogger;
});

test('logger: explore.runner.completed fires at end with total counts', async () => {
  const sink = new CapturingSink();
  setLogger(makeCapturingLogger(sink));

  const runOverride = async (
    o: SessionRunnerOptions,
  ): Promise<SessionResult> => {
    for (const m of ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy']) {
      if (o.prompt.startsWith(`run ${m}`)) {
        writeMapFile(m, `# ${m}`);
      }
    }
    return fakeSessionResult({
      usage: { input_tokens: 10, output_tokens: 5, usd_cost: 0.01 },
    });
  };

  await run(runOpts({ mappers: sandboxMappers(), runOverride }));

  const completed = sink.entries.filter(
    (e) => e.msg === 'explore.runner.completed',
  );
  assert.equal(completed.length, 1);
  const entry = completed[0];
  assert.ok(entry !== undefined);
  assert.equal(entry['parallel_count'], 4);
  assert.equal(entry['serial_count'], 0);
  assert.equal(entry['synthesizer_status'], 'completed');
});

// ============================================================================
// Bonus: DEFAULT_MAPPERS invariants
// ============================================================================

test('DEFAULT_MAPPERS: frozen; 4 entries covering the locked mapper roster', () => {
  assert.ok(Object.isFrozen(DEFAULT_MAPPERS));
  assert.equal(DEFAULT_MAPPERS.length, 4);
  const names = DEFAULT_MAPPERS.map((m) => m.name).sort();
  assert.deepEqual(names, ['a11y', 'component-taxonomy', 'token', 'visual-hierarchy']);
  // Each entry is also frozen.
  for (const m of DEFAULT_MAPPERS) {
    assert.ok(Object.isFrozen(m), `spec ${m.name} must be frozen`);
  }
});

// ---------------------------------------------------------------------------
// Test-only logger helper
// ---------------------------------------------------------------------------

/**
 * Build a Logger that writes every entry to `sink`. We can't use
 * createLogger() directly because it doesn't expose a "custom sink"
 * option without headless mode; instead, this helper implements the
 * Logger interface inline.
 */
function makeCapturingLogger(sink: Sink): ReturnType<typeof createLogger> {
  const emit = (
    level: 'debug' | 'info' | 'warn' | 'error',
    scope: string | undefined,
    msg: string,
    fields?: Record<string, unknown>,
  ): void => {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      pid: process.pid,
      ...(scope !== undefined ? { scope } : {}),
      ...(fields ?? {}),
    };
    sink.write(entry);
  };

  const build = (scope: string | undefined): ReturnType<typeof createLogger> => ({
    debug: (msg: string, fields?: Record<string, unknown>) =>
      emit('debug', scope, msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) =>
      emit('info', scope, msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) =>
      emit('warn', scope, msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) =>
      emit('error', scope, msg, fields),
    child: (sub: string, _fields?: Record<string, unknown>) =>
      build(scope !== undefined ? `${scope}.${sub}` : sub),
    flush: () => undefined,
  });

  return build(undefined);
}
