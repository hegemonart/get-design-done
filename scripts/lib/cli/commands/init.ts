// scripts/lib/cli/commands/init.ts — Plan 21-09 Task 6 (SDK-21).
//
// `gdd-sdk init` — bootstrap a new project's `.design/` directory by
// delegating to `init-runner.run()` (Plan 21-08).
//
// Exit-code mapping (InitRunnerResult.status → code):
//   * completed                  → 0
//   * already-initialized        → 1  (not strictly an error — operator re-ran)
//   * no-researchers-succeeded   → 2  (partial: STATE.md scaffolded, no context)
//   * error                      → 3  (precondition failure, e.g., template missing)
//
// Per PLAN.md: code 1 for already-initialized is deliberate ("not an
// error; operator ran init twice"). Callers that want to treat re-init
// as success should branch on the JSON output.

import {
  run as defaultInitRun,
  type InitRunnerResult,
} from '../../init-runner/index.ts';
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

const INIT_FLAGS: readonly FlagSpec[] = [
  ...COMMON_FLAGS,
  { name: 'force', type: 'boolean', default: false },
  { name: 'state-template', type: 'string' },
];

const USAGE = `gdd-sdk init [flags]

Bootstrap a new project's .design/ directory.

Flags:
  --force                    Back up an existing .design/ and re-initialize
  --concurrency <n>          Researcher parallelism (default 4)
  --max-turns <n>            Per-researcher turn cap (default 40)
  --budget-usd <n>           Per-researcher USD cap (default 2.0)
  --state-template <path>    Override reference/STATE-TEMPLATE.md path
  --cwd <dir>                Target directory (default: current)
  --json                     Emit JSON result (default: human-readable)

Exit codes:
  0  completed
  1  already-initialized (re-run with --force to overwrite)
  2  no researchers succeeded (STATE.md scaffolded, DESIGN-CONTEXT.md absent)
  3  error
`;

// ---------------------------------------------------------------------------
// Deps.
// ---------------------------------------------------------------------------

export type InitRunFn = typeof defaultInitRun;

export interface InitCommandDeps {
  readonly initRun?: InitRunFn;
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

export async function initCommand(
  args: ParsedArgs,
  deps: InitCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (args.flags['help'] === true || args.flags['h'] === true) {
    stdout.write(USAGE);
    return 0;
  }

  let flags: Record<string, unknown>;
  try {
    flags = coerceFlags(args, INIT_FLAGS);
  } catch (err) {
    stderr.write(`gdd-sdk init: ${errMessage(err)}\n`);
    return 3;
  }

  const cwd: string =
    typeof flags['cwd'] === 'string' ? (flags['cwd'] as string) : process.cwd();

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

  const maxTurns: number =
    typeof flags['max-turns'] === 'number' ? (flags['max-turns'] as number) : 40;
  const concurrency: number =
    typeof flags['concurrency'] === 'number' ? (flags['concurrency'] as number) : 4;
  const force: boolean = flags['force'] === true;
  const stateTemplatePath: string | undefined =
    typeof flags['state-template'] === 'string' && (flags['state-template'] as string).length > 0
      ? (flags['state-template'] as string)
      : undefined;

  const initRun: InitRunFn = deps.initRun ?? defaultInitRun;

  let result: InitRunnerResult;
  try {
    result = await initRun({
      budget,
      maxTurnsPerResearcher: maxTurns,
      synthesizerBudget: budget,
      synthesizerMaxTurns: maxTurns,
      concurrency,
      cwd,
      force,
      ...(stateTemplatePath !== undefined ? { stateTemplatePath } : {}),
    });
  } catch (err) {
    // init-runner is contracted never to throw; belt-and-braces.
    try {
      getLogger().error('cli.init.unexpected_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // swallow
    }
    stderr.write(`gdd-sdk init: unexpected error: ${errMessage(err)}\n`);
    return 3;
  }

  if (flags['json'] === true) {
    stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    stdout.write(renderHuman(result));
  }

  return mapStatusToExitCode(result.status);
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function mapStatusToExitCode(status: InitRunnerResult['status']): number {
  switch (status) {
    case 'completed':
      return 0;
    case 'already-initialized':
      return 1;
    case 'no-researchers-succeeded':
      return 2;
    case 'error':
      return 3;
    default: {
      // Exhaustiveness guard — compile error surfaces if a new status is
      // added without updating this switch.
      const _exhaustive: never = status;
      void _exhaustive;
      return 3;
    }
  }
}

function renderHuman(result: InitRunnerResult): string {
  const lines: string[] = [];
  lines.push(`init: ${result.status}`);
  lines.push(`  cwd: ${result.cwd}`);
  lines.push(`  design dir: ${result.design_dir}`);
  if (result.scaffold.backup_dir !== undefined) {
    lines.push(`  backup: ${result.scaffold.backup_dir}`);
  }
  lines.push(
    `  STATE.md: ${result.scaffold.state_md_written ? 'written' : 'skipped'}`,
  );
  lines.push(
    `  DESIGN-CONTEXT.md: ${result.scaffold.design_context_md_written ? 'written' : 'skipped'}`,
  );
  const succeeded = result.researchers.filter(
    (r) => r.status === 'completed' && r.output_exists,
  ).length;
  lines.push(
    `  researchers: ${succeeded}/${result.researchers.length} succeeded`,
  );
  for (const r of result.researchers) {
    const ok = r.status === 'completed' && r.output_exists;
    lines.push(
      `    ${r.name}: ${r.status}${ok ? '' : ' (no output)'}`,
    );
  }
  lines.push(
    `  total cost: $${result.total_usage.usd_cost.toFixed(4)} ` +
      `(in=${result.total_usage.input_tokens}, out=${result.total_usage.output_tokens})`,
  );
  return lines.join('\n') + '\n';
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
