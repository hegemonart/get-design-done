// scripts/lib/cli/commands/stage.ts — Plan 21-09 Task 3 (SDK-21).
//
// `gdd-sdk stage <name>` — run a single pipeline stage. Delegates to
// `pipeline-runner.run()` with `stages: [<name>]` for design-pipeline
// stages. `--parallel` routes explore/discuss through their dedicated
// parallel runners instead.
//
// Stage vocabulary (positional arg):
//   brief | explore | plan | design | verify   — 5-stage design pipeline
//   discuss                                    — parallel discussant leaf
//
// `--parallel` modifier:
//   explore --parallel  → exploreParallelRunner.run()
//   discuss --parallel  → discussParallelRunner.run()
//   discuss            (no --parallel) → error (discuss is leaf-only)
//
// Exit codes: same as `run` (0 completed, 1 halted, 2 awaiting-gate, 3 arg).

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import {
  run as defaultPipelineRun,
  type PipelineConfig,
  type PipelineResult,
  type Stage,
} from '../../pipeline-runner/index.ts';
import {
  run as defaultExploreParallelRun,
  type ExploreRunnerResult,
} from '../../explore-parallel-runner/index.ts';
import {
  run as defaultDiscussParallelRun,
  type DiscussRunnerResult,
} from '../../discuss-parallel-runner/index.ts';
import { getLogger } from '../../logger/index.ts';

import {
  coerceFlags,
  COMMON_FLAGS,
  type FlagSpec,
  type ParsedArgs,
} from '../parse-args.ts';

// ---------------------------------------------------------------------------
// Flag spec + help.
// ---------------------------------------------------------------------------

const STAGE_FLAGS: readonly FlagSpec[] = [
  ...COMMON_FLAGS,
  { name: 'parallel', type: 'boolean', default: false },
  { name: 'prompt-file', type: 'string' },
  { name: 'synthesizer-prompt-file', type: 'string' },
  { name: 'aggregator-prompt-file', type: 'string' },
];

const USAGE = `gdd-sdk stage <name> [flags]

Run a single stage.

Names:
  brief | explore | plan | design | verify   — design pipeline stages
  discuss                                    — discussion leaf (requires --parallel)

Flags:
  --parallel                     Route explore/discuss to their parallel runners
  --prompt-file <path>           Path to prompt body for the stage
  --synthesizer-prompt-file      (explore --parallel) synthesizer prompt
  --aggregator-prompt-file       (discuss --parallel) aggregator prompt
  --budget-usd <n>               Budget cap (default 2.0)
  --max-turns <n>                Turn cap (default 40)
  --concurrency <n>              Parallel runner concurrency (default 4)
  --cwd <dir>                    Working dir (default: current)
  --json                         Emit JSON to stdout
  --text                         Human-readable (default)

Exit codes:
  0  completed
  1  halted
  2  awaiting-gate
  3  arg/config error
`;

// ---------------------------------------------------------------------------
// Public deps.
// ---------------------------------------------------------------------------

export type PipelineRunFn = typeof defaultPipelineRun;
export type ExploreParallelRunFn = typeof defaultExploreParallelRun;
export type DiscussParallelRunFn = typeof defaultDiscussParallelRun;

export interface StageCommandDeps {
  readonly pipelineRun?: PipelineRunFn;
  readonly exploreParallelRun?: ExploreParallelRunFn;
  readonly discussParallelRun?: DiscussParallelRunFn;
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

const VALID_STAGE_NAMES = new Set<string>([
  'brief',
  'explore',
  'plan',
  'design',
  'verify',
  'discuss',
]);

export async function stageCommand(
  args: ParsedArgs,
  deps: StageCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (args.flags['help'] === true || args.flags['h'] === true) {
    stdout.write(USAGE);
    return 0;
  }

  // First positional after the subcommand is the stage name.
  const stageName: string | undefined = args.positionals[0];
  if (stageName === undefined || stageName.length === 0) {
    stderr.write('gdd-sdk stage: missing stage name\n');
    stderr.write(USAGE);
    return 3;
  }

  if (!VALID_STAGE_NAMES.has(stageName)) {
    stderr.write(
      `gdd-sdk stage: "${stageName}" is not one of brief|explore|plan|design|verify|discuss\n`,
    );
    return 3;
  }

  let flags: Record<string, unknown>;
  try {
    flags = coerceFlags(args, STAGE_FLAGS);
  } catch (err) {
    stderr.write(`gdd-sdk stage: ${errMessage(err)}\n`);
    return 3;
  }

  const parallel: boolean = flags['parallel'] === true;
  const cwd: string =
    typeof flags['cwd'] === 'string' ? (flags['cwd'] as string) : process.cwd();

  // `discuss` is leaf-only: always requires --parallel.
  if (stageName === 'discuss') {
    if (!parallel) {
      stderr.write('gdd-sdk stage discuss: requires --parallel\n');
      return 3;
    }
    return await runDiscussParallel(flags, cwd, stdout, stderr, deps);
  }

  // explore --parallel route.
  if (stageName === 'explore' && parallel) {
    return await runExploreParallel(flags, cwd, stdout, stderr, deps);
  }

  // Regular design-pipeline stage via pipeline-runner.
  return await runPipelineStage(
    stageName as Stage,
    flags,
    cwd,
    stdout,
    stderr,
    deps,
  );
}

// ---------------------------------------------------------------------------
// Path 1: single design-pipeline stage via pipeline-runner.
// ---------------------------------------------------------------------------

async function runPipelineStage(
  stage: Stage,
  flags: Record<string, unknown>,
  cwd: string,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  deps: StageCommandDeps,
): Promise<number> {
  // Prompt resolution.
  let promptBody: string;
  try {
    promptBody = loadSingleStagePrompt(stage, flags, cwd);
  } catch (err) {
    stderr.write(`gdd-sdk stage: ${errMessage(err)}\n`);
    return 3;
  }

  const budget = {
    usdLimit:
      typeof flags['budget-usd'] === 'number' ? (flags['budget-usd'] as number) : 2.0,
    inputTokensLimit:
      typeof flags['budget-input-tokens'] === 'number'
        ? (flags['budget-input-tokens'] as number)
        : 200_000,
    outputTokensLimit:
      typeof flags['budget-output-tokens'] === 'number'
        ? (flags['budget-output-tokens'] as number)
        : 50_000,
    perStage: true as const,
  };

  const maxTurnsPerStage: number =
    typeof flags['max-turns'] === 'number' ? (flags['max-turns'] as number) : 40;

  const prompts: Record<Stage, string> = {
    brief: '',
    explore: '',
    plan: '',
    design: '',
    verify: '',
  };
  prompts[stage] = promptBody;

  const config: PipelineConfig = {
    stages: [stage],
    prompts,
    budget,
    maxTurnsPerStage,
    stageRetries: 1,
    cwd,
  };

  const pipelineRun: PipelineRunFn = deps.pipelineRun ?? defaultPipelineRun;
  let result: PipelineResult;
  try {
    result = await pipelineRun(config);
  } catch (err) {
    try {
      getLogger().error('cli.stage.unexpected_error', {
        stage,
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // swallow
    }
    stderr.write(`gdd-sdk stage: unexpected error: ${errMessage(err)}\n`);
    return 3;
  }

  if (flags['json'] === true) {
    stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    stdout.write(`stage ${stage}: ${result.status}\n`);
    for (const o of result.outcomes) {
      stdout.write(`  ${o.stage}: ${o.status} (retries=${o.retries})\n`);
    }
  }

  if (result.status === 'completed' || result.status === 'stopped-after') return 0;
  if (result.status === 'awaiting-gate') return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Path 2: explore --parallel via explore-parallel-runner.
// ---------------------------------------------------------------------------

async function runExploreParallel(
  flags: Record<string, unknown>,
  cwd: string,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  deps: StageCommandDeps,
): Promise<number> {
  let synthesizerPrompt: string;
  try {
    synthesizerPrompt = loadExploreSynthesizerPrompt(flags, cwd);
  } catch (err) {
    stderr.write(`gdd-sdk stage explore --parallel: ${errMessage(err)}\n`);
    return 3;
  }

  const budget = {
    usdLimit:
      typeof flags['budget-usd'] === 'number' ? (flags['budget-usd'] as number) : 2.0,
    inputTokensLimit:
      typeof flags['budget-input-tokens'] === 'number'
        ? (flags['budget-input-tokens'] as number)
        : 200_000,
    outputTokensLimit:
      typeof flags['budget-output-tokens'] === 'number'
        ? (flags['budget-output-tokens'] as number)
        : 50_000,
  };
  const maxTurnsPerMapper: number =
    typeof flags['max-turns'] === 'number' ? (flags['max-turns'] as number) : 40;
  const concurrency: number =
    typeof flags['concurrency'] === 'number' ? (flags['concurrency'] as number) : 4;

  const exploreRun: ExploreParallelRunFn =
    deps.exploreParallelRun ?? defaultExploreParallelRun;

  let result: ExploreRunnerResult;
  try {
    result = await exploreRun({
      budget,
      maxTurnsPerMapper,
      concurrency,
      synthesizerPrompt,
      synthesizerBudget: budget,
      synthesizerMaxTurns: maxTurnsPerMapper,
      cwd,
    });
  } catch (err) {
    stderr.write(
      `gdd-sdk stage explore --parallel: unexpected error: ${errMessage(err)}\n`,
    );
    return 3;
  }

  if (flags['json'] === true) {
    stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    stdout.write(
      `explore --parallel: synth=${result.synthesizer.status}, ` +
        `parallel=${result.parallel_count}, serial=${result.serial_count}\n`,
    );
    for (const m of result.mappers) {
      stdout.write(`  mapper ${m.name}: ${m.status}\n`);
    }
  }

  // Treat non-completed synthesizer as a halt.
  if (result.synthesizer.status === 'completed') return 0;
  return 1;
}

// ---------------------------------------------------------------------------
// Path 3: discuss --parallel via discuss-parallel-runner.
// ---------------------------------------------------------------------------

async function runDiscussParallel(
  flags: Record<string, unknown>,
  cwd: string,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  deps: StageCommandDeps,
): Promise<number> {
  const aggregatorPrompt = loadOptionalAggregatorPrompt(flags, cwd);

  const budget = {
    usdLimit:
      typeof flags['budget-usd'] === 'number' ? (flags['budget-usd'] as number) : 2.0,
    inputTokensLimit:
      typeof flags['budget-input-tokens'] === 'number'
        ? (flags['budget-input-tokens'] as number)
        : 200_000,
    outputTokensLimit:
      typeof flags['budget-output-tokens'] === 'number'
        ? (flags['budget-output-tokens'] as number)
        : 50_000,
  };
  const maxTurnsPerDiscussant: number =
    typeof flags['max-turns'] === 'number' ? (flags['max-turns'] as number) : 40;
  const concurrency: number =
    typeof flags['concurrency'] === 'number' ? (flags['concurrency'] as number) : 4;

  const discussRun: DiscussParallelRunFn =
    deps.discussParallelRun ?? defaultDiscussParallelRun;

  let result: DiscussRunnerResult;
  try {
    result = await discussRun({
      budget,
      maxTurnsPerDiscussant,
      aggregatorBudget: budget,
      aggregatorMaxTurns: maxTurnsPerDiscussant,
      concurrency,
      cwd,
      ...(aggregatorPrompt !== undefined ? { aggregatorPrompt } : {}),
    });
  } catch (err) {
    // discuss-parallel-runner throws OperationFailedError when all
    // discussants fail — surface as exit 1.
    stderr.write(`gdd-sdk stage discuss --parallel: ${errMessage(err)}\n`);
    return 1;
  }

  if (flags['json'] === true) {
    stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    stdout.write(
      `discuss --parallel: contributions=${result.contributions.length}, ` +
        `themes=${result.aggregated.themes.length}, ` +
        `questions=${result.aggregated.questions.length}\n`,
    );
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function loadSingleStagePrompt(
  stage: Stage,
  flags: Record<string, unknown>,
  cwd: string,
): string {
  const file = flags['prompt-file'];
  if (typeof file === 'string' && file.length > 0) {
    const abs = resolvePath(cwd, file);
    try {
      return readFileSync(abs, 'utf8');
    } catch (err) {
      throw new Error(`cannot read prompt file "${file}": ${errMessage(err)}`);
    }
  }
  // Convention: `.design/prompts/<stage>.md`.
  const conv = resolvePath(cwd, '.design/prompts', `${stage}.md`);
  try {
    return readFileSync(conv, 'utf8');
  } catch {
    // Fall back to a minimal default — tests may supply nothing.
    return `Run the ${stage} stage. Follow SKILL.md for the stage.`;
  }
}

function loadExploreSynthesizerPrompt(
  flags: Record<string, unknown>,
  cwd: string,
): string {
  const file = flags['synthesizer-prompt-file'];
  if (typeof file === 'string' && file.length > 0) {
    const abs = resolvePath(cwd, file);
    try {
      return readFileSync(abs, 'utf8');
    } catch (err) {
      throw new Error(
        `cannot read synthesizer prompt file "${file}": ${errMessage(err)}`,
      );
    }
  }
  // Reasonable default; callers can override.
  return (
    'Synthesize .design/DESIGN-PATTERNS.md from the streaming mapper ' +
    'outputs in .design/map/.'
  );
}

function loadOptionalAggregatorPrompt(
  flags: Record<string, unknown>,
  cwd: string,
): string | undefined {
  const file = flags['aggregator-prompt-file'];
  if (typeof file !== 'string' || file.length === 0) return undefined;
  const abs = resolvePath(cwd, file);
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return undefined;
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
