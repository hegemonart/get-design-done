// tests/gdd-sdk-cli.test.ts — Plan 21-09 Task 8 (SDK-21) coverage.
//
// Exercises the gdd-sdk CLI: argv parser, each subcommand's dispatch
// logic, and the bin/gdd-sdk trampoline integration. Uses dep-injection
// (mocked pipelineRun / initRun / exploreParallelRun / discussParallelRun)
// so no real Agent SDK invocations happen during tests.
//
// Groups:
//   1. parseArgs / coerceFlags               (8 tests)
//   2. runCommand                            (4 tests)
//   3. stageCommand                          (4 tests)
//   4. queryCommand                          (6 tests)
//   5. auditCommand                          (3 tests)
//   6. initCommand                           (4 tests)
//   7. Trampoline / dispatcher integration   (2 tests)
//
// Total: 31 tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

import {
  parseArgs,
  coerceFlags,
  type FlagSpec,
} from '../scripts/lib/cli/parse-args.ts';
import { runCommand } from '../scripts/lib/cli/commands/run.ts';
import { stageCommand } from '../scripts/lib/cli/commands/stage.ts';
import { queryCommand } from '../scripts/lib/cli/commands/query.ts';
import { auditCommand } from '../scripts/lib/cli/commands/audit.ts';
import { initCommand } from '../scripts/lib/cli/commands/init.ts';
import { dispatch, main, USAGE } from '../scripts/lib/cli/index.ts';
import type {
  PipelineConfig,
  PipelineResult,
} from '../scripts/lib/pipeline-runner/index.ts';
import type { InitRunnerResult } from '../scripts/lib/init-runner/index.ts';
import type { ExploreRunnerResult } from '../scripts/lib/explore-parallel-runner/index.ts';
import type { DiscussRunnerResult } from '../scripts/lib/discuss-parallel-runner/index.ts';

// ==========================================================================
// Helpers
// ==========================================================================

const FIXTURES_ROOT = resolvePath(process.cwd(), 'tests', 'fixtures', 'gdd-sdk-cli');
const SCAFFOLD_PROJECT = resolvePath(FIXTURES_ROOT, 'scaffold-project');
const SCAFFOLD_STATE = resolvePath(SCAFFOLD_PROJECT, '.design', 'STATE.md');
const SCAFFOLD_EVENTS = resolvePath(SCAFFOLD_PROJECT, '.design', 'events.jsonl');
const SCAFFOLD_STATE_DEGRADED = resolvePath(
  SCAFFOLD_PROJECT,
  '.design',
  'STATE-degraded.md',
);
const BASELINE_DIR = resolvePath(FIXTURES_ROOT, 'baseline');

class CaptureStream {
  public chunks: string[] = [];
  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }
  end(): void {
    // no-op
  }
  get buffer(): string {
    return this.chunks.join('');
  }
}

/** Build a mock pipelineRun that returns a canned PipelineResult. */
function mockPipelineRun(result: Partial<PipelineResult>) {
  let lastConfig: PipelineConfig | undefined;
  const fn = async (config: PipelineConfig): Promise<PipelineResult> => {
    lastConfig = config;
    const full: PipelineResult = {
      status: 'completed',
      cycle_start: '2026-04-24T00:00:00Z',
      cycle_end: '2026-04-24T00:10:00Z',
      outcomes: [],
      total_usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
      ...result,
    };
    return full;
  };
  return { fn, getLastConfig: () => lastConfig };
}

function mockInitRun(result: Partial<InitRunnerResult>) {
  let lastOpts: unknown;
  const fn = async (opts: unknown): Promise<InitRunnerResult> => {
    lastOpts = opts;
    const full: InitRunnerResult = {
      status: 'completed',
      cwd: process.cwd(),
      design_dir: resolvePath(process.cwd(), '.design'),
      researchers: [],
      scaffold: {
        state_md_written: true,
        design_context_md_written: true,
      },
      total_usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
      ...result,
    };
    return full;
  };
  return { fn, getLastOpts: () => lastOpts };
}

function mockExploreRun(result: Partial<ExploreRunnerResult>) {
  let called = false;
  const fn = async (): Promise<ExploreRunnerResult> => {
    called = true;
    return Object.freeze({
      mappers: Object.freeze([]),
      synthesizer: Object.freeze({
        status: 'completed' as const,
        output_path: '.design/DESIGN-PATTERNS.md',
        usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
        files_fed: Object.freeze([]),
      }),
      parallel_count: 0,
      serial_count: 0,
      total_usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
      ...result,
    }) as ExploreRunnerResult;
  };
  return { fn, wasCalled: () => called };
}

function mockDiscussRun(result: Partial<DiscussRunnerResult>) {
  let called = false;
  const fn = async (): Promise<DiscussRunnerResult> => {
    called = true;
    return {
      contributions: [],
      aggregated: {
        themes: [],
        questions: [],
      } as unknown as DiscussRunnerResult['aggregated'],
      total_usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
      ...result,
    };
  };
  return { fn, wasCalled: () => called };
}

// ==========================================================================
// Group 1 — parseArgs / coerceFlags (8 tests)
// ==========================================================================

test('parseArgs: --name value form', () => {
  const parsed = parseArgs(['run', '--budget-usd', '5.5']);
  assert.equal(parsed.subcommand, 'run');
  assert.equal(parsed.flags['budget-usd'], '5.5');
});

test('parseArgs: --name=value form', () => {
  const parsed = parseArgs(['run', '--budget-usd=1.25']);
  assert.equal(parsed.subcommand, 'run');
  assert.equal(parsed.flags['budget-usd'], '1.25');
});

test('parseArgs: -h short flag', () => {
  const parsed = parseArgs(['-h']);
  // With only a flag, subcommand stays null.
  assert.equal(parsed.subcommand, null);
  assert.equal(parsed.flags['h'], true);
});

test('parseArgs: boolean toggle', () => {
  const parsed = parseArgs(['run', '--headless']);
  assert.equal(parsed.flags['headless'], true);
});

test('parseArgs: passthrough after --', () => {
  const parsed = parseArgs(['run', '--', '--this', '--that']);
  assert.deepEqual([...parsed.passthrough], ['--this', '--that']);
});

test('coerceFlags: numeric coercion happy + failure', () => {
  const specs: FlagSpec[] = [
    { name: 'budget-usd', type: 'number', default: 2 },
    { name: 'other', type: 'number' },
  ];
  const good = parseArgs(['run', '--budget-usd', '1.5']);
  const coerced = coerceFlags(good, specs);
  assert.equal(coerced['budget-usd'], 1.5);

  const bad = parseArgs(['run', '--other', 'abc']);
  assert.throws(() => coerceFlags(bad, specs), /expects a number/);
});

test('parseArgs: unknown subcommand detected', () => {
  const parsed = parseArgs(['totally-unknown-cmd']);
  assert.equal(parsed.subcommand, 'totally-unknown-cmd');
});

test('parseArgs: empty argv returns subcommand null', () => {
  const parsed = parseArgs([]);
  assert.equal(parsed.subcommand, null);
  assert.equal(parsed.positionals.length, 0);
  assert.equal(parsed.passthrough.length, 0);
});

// ==========================================================================
// Group 2 — runCommand (4 tests)
// ==========================================================================

test('runCommand: defaults call pipelineRun with all 5 stages', async () => {
  const mock = mockPipelineRun({ status: 'completed' });
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const parsed = parseArgs(['run']);
  const code = await runCommand(parsed, {
    pipelineRun: mock.fn,
    stdout: stdout as unknown as NodeJS.WritableStream,
    stderr: stderr as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const cfg = mock.getLastConfig();
  assert.ok(cfg !== undefined);
  // When --stages is not supplied, config.stages is left undefined so
  // pipeline-runner picks the canonical 5-stage order from STAGE_ORDER.
  // All 5 prompts must be populated (required by validateConfig).
  assert.equal(typeof cfg!.prompts.brief, 'string');
  assert.equal(typeof cfg!.prompts.verify, 'string');
});

test('runCommand: --stages brief,explore selects 2 stages', async () => {
  const mock = mockPipelineRun({ status: 'completed' });
  const stdout = new CaptureStream();
  const parsed = parseArgs(['run', '--stages', 'brief,explore']);
  const code = await runCommand(parsed, {
    pipelineRun: mock.fn,
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const cfg = mock.getLastConfig();
  assert.deepEqual([...(cfg!.stages ?? [])], ['brief', 'explore']);
});

test('runCommand: --gate-reply stop routes to stop decision', async () => {
  const mock = mockPipelineRun({ status: 'completed' });
  const parsed = parseArgs(['run', '--gate-reply', 'stop']);
  const stdout = new CaptureStream();
  const code = await runCommand(parsed, {
    pipelineRun: mock.fn,
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const cfg = mock.getLastConfig();
  // Invoke the gate callback to verify it responds with stop.
  const decision = await cfg!.onHumanGate!({
    stage: 'brief',
    gateName: 'test',
    stdoutTail: '',
  });
  assert.equal(decision.decision, 'stop');
});

test('runCommand: halted status maps to exit 1', async () => {
  const mock = mockPipelineRun({ status: 'halted', halted_at: 'explore' });
  const parsed = parseArgs(['run']);
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const code = await runCommand(parsed, {
    pipelineRun: mock.fn,
    stdout: stdout as unknown as NodeJS.WritableStream,
    stderr: stderr as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 1);
});

// ==========================================================================
// Group 3 — stageCommand (4 tests)
// ==========================================================================

test('stageCommand: stage plan routes to pipeline-runner with stages=[plan]', async () => {
  const mock = mockPipelineRun({ status: 'completed' });
  const parsed = parseArgs(['stage', 'plan']);
  const code = await stageCommand(parsed, {
    pipelineRun: mock.fn,
    stdout: new CaptureStream() as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const cfg = mock.getLastConfig();
  assert.deepEqual([...(cfg!.stages ?? [])], ['plan']);
});

test('stageCommand: stage explore --parallel invokes explore-parallel-runner', async () => {
  const explore = mockExploreRun({});
  const pipeline = mockPipelineRun({ status: 'completed' });
  const parsed = parseArgs(['stage', 'explore', '--parallel']);
  const code = await stageCommand(parsed, {
    exploreParallelRun: explore.fn,
    pipelineRun: pipeline.fn,
    stdout: new CaptureStream() as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  assert.ok(explore.wasCalled());
});

test('stageCommand: stage discuss --parallel invokes discuss-parallel-runner', async () => {
  const discuss = mockDiscussRun({});
  const parsed = parseArgs(['stage', 'discuss', '--parallel']);
  const code = await stageCommand(parsed, {
    discussParallelRun: discuss.fn,
    stdout: new CaptureStream() as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  assert.ok(discuss.wasCalled());
});

test('stageCommand: invalid stage name exits 3', async () => {
  const parsed = parseArgs(['stage', 'bogus-stage']);
  const stderr = new CaptureStream();
  const code = await stageCommand(parsed, {
    stderr: stderr as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 3);
  assert.match(stderr.buffer, /not one of brief\|explore\|plan\|design\|verify\|discuss/);
});

// ==========================================================================
// Group 4 — queryCommand (6 tests)
// ==========================================================================

test('queryCommand: get returns JSON of full state', async () => {
  const parsed = parseArgs([
    'query',
    'get',
    '--state-path',
    SCAFFOLD_STATE,
    '--cwd',
    SCAFFOLD_PROJECT,
    '--json',
  ]);
  const stdout = new CaptureStream();
  const code = await queryCommand(parsed, {
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const json = JSON.parse(stdout.buffer);
  assert.equal(json.frontmatter.stage, 'plan');
  assert.equal(json.position.stage, 'plan');
});

test('queryCommand: position prints cycle/stage/task_progress', async () => {
  const parsed = parseArgs([
    'query',
    'position',
    '--state-path',
    SCAFFOLD_STATE,
    '--cwd',
    SCAFFOLD_PROJECT,
  ]);
  const stdout = new CaptureStream();
  const code = await queryCommand(parsed, {
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const json = JSON.parse(stdout.buffer);
  assert.equal(json.stage, 'plan');
  assert.equal(json.task_progress, '4/4');
});

test('queryCommand: decisions returns decisions array', async () => {
  const parsed = parseArgs([
    'query',
    'decisions',
    '--state-path',
    SCAFFOLD_STATE,
    '--cwd',
    SCAFFOLD_PROJECT,
  ]);
  const stdout = new CaptureStream();
  const code = await queryCommand(parsed, {
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const json: unknown[] = JSON.parse(stdout.buffer);
  assert.ok(Array.isArray(json));
  assert.ok(json.length >= 1);
});

test('queryCommand: events --tail 5 returns last 5 events', async () => {
  const parsed = parseArgs([
    'query',
    'events',
    '--tail',
    '5',
    '--events-path',
    SCAFFOLD_EVENTS,
    '--cwd',
    SCAFFOLD_PROJECT,
  ]);
  const stdout = new CaptureStream();
  const code = await queryCommand(parsed, {
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const json: unknown[] = JSON.parse(stdout.buffer);
  assert.ok(Array.isArray(json));
  assert.equal(json.length, 5);
});

test('queryCommand: can-transition uses gateFor()', async () => {
  // Fixture is stage=plan; gate plan→design requires ≥1 locked decision +
  // non-empty must_haves (both satisfied in fixture).
  const parsed = parseArgs([
    'query',
    'can-transition',
    'design',
    '--state-path',
    SCAFFOLD_STATE,
    '--cwd',
    SCAFFOLD_PROJECT,
  ]);
  const stdout = new CaptureStream();
  const code = await queryCommand(parsed, {
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const json = JSON.parse(stdout.buffer);
  assert.equal(json.ok, true);
});

test('queryCommand: missing STATE.md exits 1', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gdd-sdk-query-'));
  try {
    const parsed = parseArgs(['query', 'get', '--cwd', tmp]);
    const stderr = new CaptureStream();
    const code = await queryCommand(parsed, {
      stderr: stderr as unknown as NodeJS.WritableStream,
    });
    assert.equal(code, 1);
    assert.match(stderr.buffer, /STATE\.md not found/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ==========================================================================
// Group 5 — auditCommand (3 tests)
// ==========================================================================

test('auditCommand: all probes green → exit 0', async () => {
  // Fixture STATE.md has figma=available + refero=not_configured (both ok)
  // + preview=available + storybook=not_configured. M-01/M-02 pending, M-03 pass.
  // No "fail" status → must_haves ok.
  const parsed = parseArgs([
    'audit',
    '--state-path',
    SCAFFOLD_STATE,
    '--cwd',
    SCAFFOLD_PROJECT,
    '--json',
  ]);
  const stdout = new CaptureStream();
  const code = await auditCommand(parsed, {
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const json = JSON.parse(stdout.buffer);
  assert.equal(json.summary.overall_ok, true);
});

test('auditCommand: connection unavailable → exit 1', async () => {
  // Degraded fixture: figma=unavailable + M-01 fail.
  const parsed = parseArgs([
    'audit',
    '--state-path',
    SCAFFOLD_STATE_DEGRADED,
    '--cwd',
    SCAFFOLD_PROJECT,
    '--json',
  ]);
  const stdout = new CaptureStream();
  const code = await auditCommand(parsed, {
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 1);
  const json = JSON.parse(stdout.buffer);
  assert.equal(json.summary.connections_ok, false);
  assert.equal(json.summary.must_haves_ok, false);
});

test('auditCommand: baseline mismatch → exit 1', async () => {
  // Fixture connections: figma=available, refero=not_configured, preview=available, storybook=not_configured.
  // Baseline connections: figma=available, refero=available (drift), preview=available, storybook=not_configured.
  // → connection drift on refero (available → not_configured).
  const parsed = parseArgs([
    'audit',
    '--state-path',
    SCAFFOLD_STATE,
    '--baseline',
    BASELINE_DIR,
    '--cwd',
    SCAFFOLD_PROJECT,
    '--json',
  ]);
  const stdout = new CaptureStream();
  const code = await auditCommand(parsed, {
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 1);
  const json = JSON.parse(stdout.buffer);
  assert.equal(json.summary.baseline_ok, false);
  assert.ok(json.baseline.connection_drift.length > 0);
});

// ==========================================================================
// Group 6 — initCommand (4 tests)
// ==========================================================================

test('initCommand: completed status → exit 0', async () => {
  const mock = mockInitRun({ status: 'completed' });
  const parsed = parseArgs(['init']);
  const stdout = new CaptureStream();
  const code = await initCommand(parsed, {
    initRun: mock.fn as unknown as typeof import('../scripts/lib/init-runner/index.ts').run,
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  assert.ok(mock.getLastOpts() !== undefined);
});

test('initCommand: already-initialized → exit 1', async () => {
  const mock = mockInitRun({ status: 'already-initialized' });
  const parsed = parseArgs(['init']);
  const stdout = new CaptureStream();
  const code = await initCommand(parsed, {
    initRun: mock.fn as unknown as typeof import('../scripts/lib/init-runner/index.ts').run,
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 1);
});

test('initCommand: --force passed to runner', async () => {
  const mock = mockInitRun({ status: 'completed' });
  const parsed = parseArgs(['init', '--force']);
  const stdout = new CaptureStream();
  const code = await initCommand(parsed, {
    initRun: mock.fn as unknown as typeof import('../scripts/lib/init-runner/index.ts').run,
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  const opts = mock.getLastOpts() as { force?: boolean };
  assert.equal(opts.force, true);
});

test('initCommand: no-researchers-succeeded → exit 2', async () => {
  const mock = mockInitRun({
    status: 'no-researchers-succeeded',
    scaffold: {
      state_md_written: true,
      design_context_md_written: false,
    },
  });
  const parsed = parseArgs(['init']);
  const stdout = new CaptureStream();
  const code = await initCommand(parsed, {
    initRun: mock.fn as unknown as typeof import('../scripts/lib/init-runner/index.ts').run,
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 2);
});

// ==========================================================================
// Group 7 — Trampoline + dispatcher integration (2 tests)
// ==========================================================================

test('dispatcher: bare invocation prints USAGE', async () => {
  const stdout = new CaptureStream();
  const parsed = parseArgs([]);
  const code = await dispatch(parsed, {
    stdout: stdout as unknown as NodeJS.WritableStream,
  });
  assert.equal(code, 0);
  assert.match(stdout.buffer, /gdd-sdk <command> \[flags\]/);
});

test('bin/gdd-sdk --help via spawnSync prints USAGE + exit 0', () => {
  const trampoline = resolvePath(process.cwd(), 'bin', 'gdd-sdk');
  const res = spawnSync(process.execPath, [trampoline, '--help'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
  assert.match(res.stdout, /gdd-sdk <command> \[flags\]/);
});

test('bin/gdd-sdk unknown-cmd prints error + exits 3', () => {
  const trampoline = resolvePath(process.cwd(), 'bin', 'gdd-sdk');
  const res = spawnSync(process.execPath, [trampoline, 'bogus-cmd'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(res.status, 3);
  assert.match(res.stderr, /unknown subcommand/);
});
