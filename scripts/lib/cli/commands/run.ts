// scripts/lib/cli/commands/run.ts — Plan 21-09 Task 2 (SDK-21),
// extended by Plan 21-11 Task 3 (dry-run).
//
// `gdd-sdk run` — drives the full design pipeline via
// `pipeline-runner.run()`. Builds a PipelineConfig from CLI flags,
// loads per-stage prompts (from --prompt-file mapping, from
// `.design/prompts/<stage>.md`, or embedded defaults), wires the
// human-gate callback, prints the outcome as JSON or human text, and
// maps pipeline status to an exit code.
//
// Exit codes:
//   * 0 — PipelineStatus === 'completed' or 'stopped-after'.
//   * 1 — PipelineStatus === 'halted'.
//   * 2 — PipelineStatus === 'awaiting-gate'.
//   * 3 — argument / config error (missing prompts, malformed flags).
//
// --dry-run (Plan 21-11):
//   Installs a mocked session-runner that reads canned SessionResult
//   objects from `<cwd>/expected-outputs/canned-<stage>.json` plus a
//   permissive transition-stage override. Each mock "session" also
//   writes the stage-appropriate artifact (DESIGN-PATTERNS.md,
//   DESIGN-PLAN.md, DESIGN.md, SUMMARY.md) under `<cwd>/.design/`
//   so callers can assert artifact shape without a real API call.
//   Zero API cost. Intended for CI; the fixture at
//   `test-fixture/headless-e2e/` is the canonical consumer.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve as resolvePath, join as joinPath, dirname as dirnamePath } from 'node:path';

import {
  run as defaultPipelineRun,
  type HumanGateDecision,
  type HumanGateInfo,
  type PipelineConfig,
  type PipelineResult,
  type RunOverrides,
  type Stage,
  type StageOutcome,
} from '../../pipeline-runner/index.ts';
import { getLogger } from '../../logger/index.ts';
import { ValidationError } from '../../gdd-errors/index.ts';
import type { SessionResult, SessionRunnerOptions } from '../../session-runner/types.ts';

import {
  coerceFlags,
  COMMON_FLAGS,
  type FlagSpec,
  type ParsedArgs,
} from '../parse-args.ts';

// ---------------------------------------------------------------------------
// Flag spec + help text.
// ---------------------------------------------------------------------------

const RUN_FLAGS: readonly FlagSpec[] = [
  ...COMMON_FLAGS,
  { name: 'stages', type: 'string' },
  { name: 'skip', type: 'string' },
  { name: 'resume-from', type: 'string' },
  { name: 'stop-after', type: 'string' },
  { name: 'prompt-file', type: 'string' },
  { name: 'gate-reply', type: 'string' },
  { name: 'dry-run', type: 'boolean', default: false },
  { name: 'fixture', type: 'string' },
];

const USAGE = `gdd-sdk run [flags]

Drive the full design pipeline headlessly.

Flags:
  --stages <list>          Comma-separated subset: brief,explore,plan,design,verify
  --skip <list>            Comma-separated stages to skip
  --resume-from <stage>    Start from this stage (inclusive)
  --stop-after <stage>     Stop after this stage (inclusive)
  --prompt-file <spec>     stage=path pairs; e.g., --prompt-file brief=./prompts/brief.md
  --gate-reply <mode>      Canned reply when a human-gate pauses:
                             stop            — halt with awaiting-gate (default)
                             resume[:payload]— resume with optional payload
  --budget-usd <n>         Total USD cap (default 10.0)
  --budget-input-tokens    Input-token cap (default 200000)
  --budget-output-tokens   Output-token cap (default 50000)
  --max-turns <n>          Per-stage turn cap (default 40)
  --cwd <dir>              Working directory (default: current)
  --log-level <lvl>        debug|info|warn|error (default info)
  --json                   Emit machine-parseable JSON to stdout
  --text                   Force human-readable output (default)
  --headless / --interactive  Override logger auto-mode
  --dry-run                Mock mode: read canned SessionResults from
                           <fixture>/expected-outputs/canned-<stage>.json
                           and write stub artifacts under <cwd>/.design/.
                           Zero API cost; used by the E2E fixture test
                           harness (test-fixture/headless-e2e/).
  --fixture <dir>          Override the fixture root whose
                           expected-outputs/ directory supplies canned
                           SessionResults. Defaults to --cwd.

Exit codes:
  0  completed / stopped-after
  1  halted
  2  awaiting-gate
  3  arg/config error
`;

// ---------------------------------------------------------------------------
// Public types.
// ---------------------------------------------------------------------------

/**
 * Test-injection point. Default resolves to `pipeline-runner.run`. Keeps
 * unit tests independent of the real Agent SDK.
 */
export type PipelineRunFn = typeof defaultPipelineRun;

/** Writable streams for deterministic test capture. */
export interface RunCommandDeps {
  readonly pipelineRun?: PipelineRunFn;
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
}

// ---------------------------------------------------------------------------
// runCommand — entry point.
// ---------------------------------------------------------------------------

const ALL_STAGES: readonly Stage[] = ['brief', 'explore', 'plan', 'design', 'verify'];

/**
 * Entry point for `gdd-sdk run`. Returns the process exit code (never
 * throws). All diagnostic output goes to stderr; result output to stdout.
 */
export async function runCommand(
  args: ParsedArgs,
  deps: RunCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (args.flags['help'] === true || args.flags['h'] === true) {
    stdout.write(USAGE);
    return 0;
  }

  let flags: Record<string, unknown>;
  try {
    flags = coerceFlags(args, RUN_FLAGS);
  } catch (err) {
    stderr.write(`gdd-sdk run: ${errMessage(err)}\n`);
    return 3;
  }

  const cwd: string = typeof flags['cwd'] === 'string' ? (flags['cwd'] as string) : process.cwd();

  // Resolve stages / skip / resumeFrom / stopAfter.
  let stages: readonly Stage[] | undefined;
  try {
    stages = parseStageList(flags['stages']);
  } catch (err) {
    stderr.write(`gdd-sdk run: ${errMessage(err)}\n`);
    return 3;
  }
  let skipStages: readonly Stage[] | undefined;
  try {
    skipStages = parseStageList(flags['skip']);
  } catch (err) {
    stderr.write(`gdd-sdk run: ${errMessage(err)}\n`);
    return 3;
  }
  const resumeFrom = parseSingleStage(flags['resume-from']);
  const stopAfter = parseSingleStage(flags['stop-after']);

  // Resolve the stage subset used for prompt loading. Defaults to all 5.
  const effectiveStages: readonly Stage[] = stages ?? ALL_STAGES;

  // Load prompts.
  let prompts: Record<Stage, string>;
  try {
    prompts = loadPrompts(effectiveStages, flags, cwd);
  } catch (err) {
    stderr.write(`gdd-sdk run: ${errMessage(err)}\n`);
    return 3;
  }

  // Build budget.
  const budget = {
    usdLimit: typeof flags['budget-usd'] === 'number' ? (flags['budget-usd'] as number) : 10.0,
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

  // Human-gate callback — default STOP (exit code 2); optional canned
  // `--gate-reply resume[:payload]` lets tests / operators pre-seed a
  // decision without an interactive prompt.
  const gateReply: string | undefined =
    typeof flags['gate-reply'] === 'string' ? (flags['gate-reply'] as string) : undefined;
  const onHumanGate: (info: HumanGateInfo) => Promise<HumanGateDecision> = async (info) => {
    // Always surface gate info to stderr so operators see it even in
    // --json mode (where stdout carries the result JSON).
    stderr.write(
      `gdd-sdk run: human gate "${info.gateName}" at stage "${info.stage}"\n`,
    );
    if (gateReply === undefined) return { decision: 'stop' };
    if (gateReply === 'stop') return { decision: 'stop' };
    if (gateReply === 'resume') return { decision: 'resume' };
    if (gateReply.startsWith('resume:')) {
      return { decision: 'resume', payload: gateReply.slice('resume:'.length) };
    }
    stderr.write(
      `gdd-sdk run: unrecognized --gate-reply "${gateReply}"; defaulting to stop\n`,
    );
    return { decision: 'stop' };
  };

  const config: PipelineConfig = {
    prompts,
    budget,
    maxTurnsPerStage,
    stageRetries: 1,
    ...(stages !== undefined ? { stages } : {}),
    ...(skipStages !== undefined ? { skipStages } : {}),
    ...(resumeFrom !== undefined ? { resumeFrom } : {}),
    ...(stopAfter !== undefined ? { stopAfter } : {}),
    cwd,
    onHumanGate,
  };

  const pipelineRun: PipelineRunFn = deps.pipelineRun ?? defaultPipelineRun;

  // Plan 21-11: --dry-run installs canned session overrides + a
  // permissive transition shim. Artifacts are written to disk by the
  // override so assertions can still check artifact shape.
  let overrides: RunOverrides = {};
  if (flags['dry-run'] === true) {
    const fixtureDir: string =
      typeof flags['fixture'] === 'string' && (flags['fixture'] as string).length > 0
        ? resolvePath(process.cwd(), flags['fixture'] as string)
        : cwd;
    try {
      overrides = buildDryRunOverrides(cwd, fixtureDir);
    } catch (err) {
      stderr.write(`gdd-sdk run: ${errMessage(err)}\n`);
      return 3;
    }
    try {
      getLogger().info('cli.run.dry_run_enabled', {
        fixture: fixtureDir,
        cwd,
      });
    } catch {
      // Swallow logger failures.
    }
  }

  let result: PipelineResult;
  try {
    result = await pipelineRun(config, overrides);
  } catch (err) {
    // pipeline-runner is contracted never to throw, but belt-and-braces:
    // surface the error as exit 3 rather than crashing.
    try {
      getLogger().error('cli.run.unexpected_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Swallow logger failures.
    }
    stderr.write(`gdd-sdk run: unexpected error: ${errMessage(err)}\n`);
    return 3;
  }

  // Output.
  if (flags['json'] === true) {
    stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    stdout.write(renderHumanSummary(result));
  }

  // Exit code mapping.
  if (result.status === 'completed' || result.status === 'stopped-after') return 0;
  if (result.status === 'awaiting-gate') return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/** Default embedded prompt body when no file is supplied. */
const DEFAULT_PROMPTS: Readonly<Record<Stage, string>> = Object.freeze({
  brief: 'Draft the design brief. Follow SKILL.md for the stage.',
  explore: 'Run the explore-stage mappers and synthesize DESIGN-PATTERNS.md.',
  plan: 'Plan the design changes. Produce locked decisions + must-haves.',
  design: 'Implement design-stage deliverables per plan.',
  verify: 'Verify design deliverables; close must-haves; probe regressions.',
});

function loadPrompts(
  stages: readonly Stage[],
  flags: Record<string, unknown>,
  cwd: string,
): Record<Stage, string> {
  // Start with defaults, then layer in per-stage file paths (convention),
  // then layer in explicit `--prompt-file stage=path` mappings. Later
  // sources override earlier ones.
  const prompts: Record<Stage, string> = {
    brief: DEFAULT_PROMPTS.brief,
    explore: DEFAULT_PROMPTS.explore,
    plan: DEFAULT_PROMPTS.plan,
    design: DEFAULT_PROMPTS.design,
    verify: DEFAULT_PROMPTS.verify,
  };

  // Convention: `.design/prompts/<stage>.md` (load if file readable).
  for (const stage of stages) {
    const p = resolvePath(cwd, '.design/prompts', `${stage}.md`);
    try {
      prompts[stage] = readFileSync(p, 'utf8');
    } catch {
      // Best-effort: falls back to default.
    }
  }

  // Explicit --prompt-file mapping. Support comma-separated pairs plus
  // repeated --prompt-file usage (coerceFlags last-write-wins collapses
  // repeats, so for tests we also accept a semicolon-separated list).
  const rawMapping = flags['prompt-file'];
  if (typeof rawMapping === 'string' && rawMapping.length > 0) {
    // Split by `;` or `,` to support multiple pairs; a single `stage=path`
    // parses as one entry.
    const parts = rawMapping.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    for (const pair of parts) {
      const eq = pair.indexOf('=');
      if (eq < 0) {
        throw new ValidationError(
          `--prompt-file expected stage=path, got "${pair}"`,
          'BAD_PROMPT_FILE_SPEC',
          { spec: pair },
        );
      }
      const stageName = pair.slice(0, eq).trim();
      const filePath = pair.slice(eq + 1).trim();
      if (!isStage(stageName)) {
        throw new ValidationError(
          `--prompt-file stage "${stageName}" is not one of brief|explore|plan|design|verify`,
          'BAD_PROMPT_FILE_STAGE',
          { stageName },
        );
      }
      const absPath = resolvePath(cwd, filePath);
      try {
        prompts[stageName] = readFileSync(absPath, 'utf8');
      } catch (err) {
        throw new ValidationError(
          `--prompt-file ${stageName}: cannot read "${filePath}": ${errMessage(err)}`,
          'PROMPT_FILE_READ_ERROR',
          { stage: stageName, path: absPath },
        );
      }
    }
  }

  return prompts;
}

function parseStageList(value: unknown): readonly Stage[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return undefined;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  const stages: Stage[] = [];
  for (const p of parts) {
    if (!isStage(p)) {
      throw new ValidationError(
        `stage "${p}" is not one of brief|explore|plan|design|verify`,
        'INVALID_STAGE_NAME',
        { stage: p },
      );
    }
    stages.push(p);
  }
  return stages.length === 0 ? undefined : stages;
}

function parseSingleStage(value: unknown): Stage | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (!isStage(trimmed)) {
    throw new ValidationError(
      `stage "${trimmed}" is not one of brief|explore|plan|design|verify`,
      'INVALID_STAGE_NAME',
      { stage: trimmed },
    );
  }
  return trimmed;
}

function isStage(s: string): s is Stage {
  return (
    s === 'brief' || s === 'explore' || s === 'plan' || s === 'design' || s === 'verify'
  );
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function renderHumanSummary(result: PipelineResult): string {
  const lines: string[] = [];
  lines.push(`pipeline status: ${result.status}`);
  if (result.halted_at !== undefined) {
    lines.push(`halted at stage: ${result.halted_at}`);
  }
  if (result.gate !== undefined) {
    lines.push(`awaiting gate: ${result.gate.gateName} (stage=${result.gate.stage})`);
  }
  lines.push(
    `total usage: input=${result.total_usage.input_tokens} ` +
      `output=${result.total_usage.output_tokens} cost=$${result.total_usage.usd_cost.toFixed(4)}`,
  );
  lines.push('stage outcomes:');
  for (const outcome of result.outcomes) {
    lines.push(`  ${formatOutcome(outcome)}`);
  }
  return lines.join('\n') + '\n';
}

function formatOutcome(outcome: StageOutcome): string {
  const retries = outcome.retries > 0 ? ` retries=${outcome.retries}` : '';
  const blockers =
    outcome.blockers !== undefined && outcome.blockers.length > 0
      ? ` blockers=[${outcome.blockers.join('; ')}]`
      : '';
  return `${outcome.stage}: ${outcome.status}${retries}${blockers}`;
}

// ---------------------------------------------------------------------------
// Dry-run support — Plan 21-11 Task 3.
//
// Reads canned SessionResult objects from
// `<fixtureDir>/expected-outputs/canned-<stage>.json` and writes a
// stub artifact per stage under `<cwd>/.design/` so downstream
// assertions can still grep for artifact shape. Transition-stage gate
// is bypassed with an always-OK override (the dry-run is about shape
// assertions, not full state-machine gating — that is exercised by
// the pipeline-runner unit test suite).
// ---------------------------------------------------------------------------

/**
 * Per-stage "pretend LLM output" that the dry-run override writes to
 * `.design/`. Each payload embeds the structural tokens that the Plan
 * 21-11 harness asserts on (`## Tokens`, `## Components`, `Wave`, etc.).
 */
const DRY_RUN_ARTIFACTS: Readonly<Record<Stage, readonly { readonly path: string; readonly body: string }[]>> =
  Object.freeze({
    brief: [
      {
        path: '.design/BRIEF.md',
        body: [
          '# Design Brief — dry-run',
          '',
          '**Goal:** Audit design-system consistency; extract tokens; normalize spacing.',
          '',
          '## BRIEF COMPLETE',
          '',
        ].join('\n'),
      },
    ],
    explore: [
      {
        path: '.design/DESIGN-PATTERNS.md',
        body: [
          '# Design Patterns — dry-run',
          '',
          '## Tokens',
          '- #0066ff (button primary)',
          '- #111 (heading)',
          '- #f5f5f5 (page bg)',
          '- #ffffff (card bg)',
          '',
          '## Components',
          '- Button (2 variants: Start, Continue)',
          '- Card (title + children slot)',
          '',
          '## Accessibility',
          '- Button has no focus-visible ring; recommend outline or ring token.',
          '',
          '## Visual Hierarchy',
          '- h1 28px / h2 inherits; recommend locking to scale token.',
          '',
          '## EXPLORE COMPLETE',
          '',
        ].join('\n'),
      },
    ],
    plan: [
      {
        path: '.design/DESIGN-PLAN.md',
        body: [
          '# Design Plan — dry-run',
          '',
          '## Wave 1 — Token extraction',
          'Type: refactor',
          'Touches: src/components/Button.tsx, src/components/Card.tsx',
          'Parallel: yes',
          'Acceptance: every hex literal replaced with a CSS custom property.',
          '',
          '## Wave 2 — Spacing normalization',
          'Type: refactor',
          'Touches: src/components/Button.tsx, src/components/Card.tsx, src/App.tsx',
          'Parallel: no',
          'Acceptance: all padding values are multiples of 4px.',
          '',
          '## PLAN COMPLETE',
          '',
        ].join('\n'),
      },
    ],
    design: [
      {
        path: '.design/DESIGN.md',
        body: [
          '# Design — dry-run',
          '',
          '## Tokens',
          '- --color-primary: #0066ff',
          '- --color-text: #111',
          '- --space-2: 8px',
          '- --space-3: 12px',
          '- --space-4: 16px',
          '',
          '## DESIGN COMPLETE',
          '',
        ].join('\n'),
      },
    ],
    verify: [
      {
        path: '.design/SUMMARY.md',
        body: [
          '# Summary — dry-run',
          '',
          '- M-01: pass (every hex literal extracted into a token)',
          '- M-02: pass (all padding values are multiples of 4px)',
          '',
          '## VERIFY COMPLETE',
          '',
        ].join('\n'),
      },
    ],
  });

/**
 * Build the RunOverrides bundle that drives --dry-run.
 *
 * Reads and validates each canned-<stage>.json up-front so missing or
 * malformed files fail fast (exit 3) before the pipeline enters stage
 * dispatch.
 */
function buildDryRunOverrides(cwd: string, fixtureDir: string): RunOverrides {
  // Pre-load every canned SessionResult so missing/malformed files
  // surface as a single validation error, not partway through a run.
  const canned: Record<Stage, SessionResult> = {
    brief: loadCannedSession(fixtureDir, 'brief'),
    explore: loadCannedSession(fixtureDir, 'explore'),
    plan: loadCannedSession(fixtureDir, 'plan'),
    design: loadCannedSession(fixtureDir, 'design'),
    verify: loadCannedSession(fixtureDir, 'verify'),
  };

  const runOverride = async (opts: SessionRunnerOptions): Promise<SessionResult> => {
    // `opts.stage` is narrower than the pipeline Stage union in one
    // direction (adds `init` + `custom`). We only ever run pipeline
    // stages under --dry-run, but narrow defensively.
    const stage = opts.stage as Stage;
    writeDryRunArtifacts(cwd, stage);
    // Force zero usage regardless of what the canned JSON says — the
    // contract is "dry-run costs nothing".
    const source = canned[stage];
    return {
      ...source,
      usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
    };
  };

  // Permissive transition shim: always OK, no real STATE.md mutation.
  // The dry-run's purpose is to exercise the run() dispatch + artifact
  // shape, not to re-test gate logic (that's covered by
  // tests/pipeline-runner.test.ts and tests/mcp-gdd-state.test.ts).
  const transitionStageOverride = async () => ({ ok: true as const });

  return {
    runOverride,
    transitionStageOverride,
  };
}

/** Load and validate one canned-<stage>.json file. Throws ValidationError on miss. */
function loadCannedSession(fixtureDir: string, stage: Stage): SessionResult {
  const cannedPath = resolvePath(fixtureDir, 'expected-outputs', `canned-${stage}.json`);
  let raw: string;
  try {
    raw = readFileSync(cannedPath, 'utf8');
  } catch (err) {
    throw new ValidationError(
      `--dry-run: cannot read canned session for stage "${stage}" at "${cannedPath}": ${errMessage(err)}`,
      'DRY_RUN_CANNED_MISSING',
      { stage, path: cannedPath },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ValidationError(
      `--dry-run: canned session for stage "${stage}" is not valid JSON: ${errMessage(err)}`,
      'DRY_RUN_CANNED_INVALID',
      { stage, path: cannedPath },
    );
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new ValidationError(
      `--dry-run: canned session for stage "${stage}" must be a JSON object`,
      'DRY_RUN_CANNED_INVALID',
      { stage, path: cannedPath },
    );
  }
  return parsed as SessionResult;
}

/**
 * Write the per-stage dry-run artifacts under `<cwd>/.design/`. Creates
 * parent directories as needed and is idempotent — re-running overwrites.
 */
function writeDryRunArtifacts(cwd: string, stage: Stage): void {
  const artifacts = DRY_RUN_ARTIFACTS[stage];
  for (const { path: relPath, body } of artifacts) {
    const abs = joinPath(cwd, relPath);
    const dir = dirnamePath(abs);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(abs, body, 'utf8');
  }
}
