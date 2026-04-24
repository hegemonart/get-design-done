// scripts/lib/init-runner/index.ts — public entry for the `gdd-sdk init`
// runner (Plan 21-08, SDK-20).
//
// Public surface:
//
//   run(opts: InitRunnerOptions): Promise<InitRunnerResult>
//   DEFAULT_RESEARCHERS: readonly ResearcherSpec[]
//   + re-exports of submodule types + helpers.
//
// Orchestration algorithm:
//
//   1. Resolve cwd + .design/ path.
//   2. Existence check on .design/STATE.md:
//      - exists + !force → return status: 'already-initialized'
//      - exists + force  → backup via backupExistingDesignDir
//   3. ensureDesignDirs (idempotent).
//   4. writeStateFromTemplate. Missing template → status: 'error'.
//   5. spawnResearchersParallel with concurrency ?? 4.
//   6. Filter to successful outcomes. Zero → status: 'no-researchers-succeeded'.
//   7. Read each successful output; build SynthesizerInput[].
//   8. spawnSynthesizer.
//   9. Aggregate usage + emit lifecycle logs.
//  10. Return InitRunnerResult.
//
// This module emits two logger events:
//   * init.runner.started   — before researcher dispatch.
//   * init.runner.completed — regardless of status.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getLogger } from '../logger/index.ts';
import {
  spawnResearcher,
  spawnResearchersParallel,
} from './researchers.ts';
import {
  buildSynthesizerPrompt,
  DEFAULT_SYNTHESIZER_PROMPT,
  spawnSynthesizer,
} from './synthesizer.ts';
import {
  backupExistingDesignDir,
  ensureDesignDirs,
  resolveStateTemplatePath,
  writeStateFromTemplate,
} from './scaffold.ts';
import type {
  InitRunnerOptions,
  InitRunnerResult,
  InitStatus,
  ResearcherName,
  ResearcherOutcome,
  ResearcherSpec,
} from './types.ts';

// ---------------------------------------------------------------------------
// Re-exports — consumers import everything from this file.
// ---------------------------------------------------------------------------

export type {
  InitRunnerOptions,
  InitRunnerResult,
  InitStatus,
  ResearcherName,
  ResearcherOutcome,
  ResearcherSpec,
} from './types.ts';
export { spawnResearcher, spawnResearchersParallel } from './researchers.ts';
export {
  buildSynthesizerPrompt,
  DEFAULT_SYNTHESIZER_PROMPT,
  spawnSynthesizer,
} from './synthesizer.ts';
export type {
  SpawnSynthesizerArgs,
  SpawnSynthesizerResult,
  SynthesizerInput,
} from './synthesizer.ts';
export type {
  SpawnParallelOptions,
  SpawnResearcherOptions,
} from './researchers.ts';
export {
  backupExistingDesignDir,
  ensureDesignDirs,
  resolveStateTemplatePath,
  writeStateFromTemplate,
} from './scaffold.ts';

// ---------------------------------------------------------------------------
// DEFAULT_RESEARCHERS — frozen roster of four
// ---------------------------------------------------------------------------

/**
 * The locked 4-researcher roster run by default. Callers can override
 * via `opts.researchers`, but the roster is stable enough that widening
 * it would be a breaking change (CLI summary rendering, telemetry
 * aggregation, and the synthesizer prompt all depend on exactly four).
 */
export const DEFAULT_RESEARCHERS: readonly ResearcherSpec[] = Object.freeze([
  Object.freeze({
    name: 'design-system-audit' as const,
    prompt:
      'Audit this repo for existing design system surface: design tokens (CSS vars, Tailwind config, JS const exports), components (file names + prop shapes), patterns (recurring UI idioms). Output .design/research/design-system-audit.md with findings organized as: Tokens, Components, Patterns, Gaps.',
    outputPath: '.design/research/design-system-audit.md',
  }),
  Object.freeze({
    name: 'brand-context' as const,
    prompt:
      'Scan this repo for brand signals: README, marketing/landing pages, style guides, voice/tone docs. Infer archetype (per reference/typography.md), voice, visual tone. Output .design/research/brand-context.md.',
    outputPath: '.design/research/brand-context.md',
  }),
  Object.freeze({
    name: 'accessibility-baseline' as const,
    prompt:
      'Scan this repo for WCAG conformance baseline: color contrast, keyboard navigation, ARIA labels, focus management, motion preferences. Output .design/research/accessibility-baseline.md with findings + a conformance score (AA / partial / fail).',
    outputPath: '.design/research/accessibility-baseline.md',
  }),
  Object.freeze({
    name: 'competitive-references' as const,
    prompt:
      'Identify 3-5 peer products in the same domain as this repo. Use WebSearch + WebFetch. For each, extract design patterns worth referencing. Output .design/research/competitive-references.md.',
    outputPath: '.design/research/competitive-references.md',
  }),
]);

// ---------------------------------------------------------------------------
// run — top-level orchestrator
// ---------------------------------------------------------------------------

/** Default concurrency when not specified. Matches the 4-researcher roster. */
const DEFAULT_CONCURRENCY = 4;

/**
 * Bootstrap a `.design/` directory for a fresh project. See module
 * header for the algorithm. Never throws; every failure mode surfaces
 * as `InitRunnerResult.status`.
 */
export async function run(opts: InitRunnerOptions): Promise<InitRunnerResult> {
  const logger = getLogger();
  const cwd = resolve(opts.cwd ?? process.cwd());
  const designDir = resolve(cwd, '.design');
  const researchers = opts.researchers ?? DEFAULT_RESEARCHERS;

  logger.info('init.runner.started', {
    cwd,
    design_dir: designDir,
    researcher_count: researchers.length,
    force: opts.force === true,
  });

  // ------------------------------------------------------------------
  // 1. Re-init safety check.
  // ------------------------------------------------------------------
  const stateMdPath = resolve(designDir, 'STATE.md');
  let backupDir: string | null = null;
  if (existsSync(stateMdPath)) {
    if (opts.force !== true) {
      const result = buildResult({
        status: 'already-initialized',
        cwd,
        designDir,
        researchers: [],
        stateMdWritten: false,
        designContextMdWritten: false,
        totalUsage: zeroUsage(),
      });
      logger.info('init.runner.completed', logPayloadFor(result));
      return result;
    }
    backupDir = backupExistingDesignDir(cwd);
  }

  // ------------------------------------------------------------------
  // 2. Ensure .design/ + .design/research/ exist.
  // ------------------------------------------------------------------
  ensureDesignDirs(cwd);

  // ------------------------------------------------------------------
  // 3. Write STATE.md from template.
  // ------------------------------------------------------------------
  const templatePath =
    opts.stateTemplatePath ?? resolveStateTemplatePath() ?? '';
  const stateWritten = templatePath === ''
    ? false
    : writeStateFromTemplate({
        cwd,
        templatePath,
        destPath: stateMdPath,
      });

  if (!stateWritten) {
    const result = buildResult({
      status: 'error',
      cwd,
      designDir,
      researchers: [],
      stateMdWritten: false,
      designContextMdWritten: false,
      totalUsage: zeroUsage(),
      ...(backupDir !== null ? { backupDir } : {}),
    });
    logger.error('init.runner.completed', {
      ...logPayloadFor(result),
      reason: 'STATE-TEMPLATE.md not found or unreadable',
      template_path: templatePath,
    });
    return result;
  }

  // ------------------------------------------------------------------
  // 4. Spawn researchers in parallel.
  // ------------------------------------------------------------------
  const outcomes = await spawnResearchersParallel(researchers, {
    concurrency: opts.concurrency ?? DEFAULT_CONCURRENCY,
    budget: opts.budget,
    maxTurns: opts.maxTurnsPerResearcher,
    cwd,
    ...(opts.runOverride !== undefined
      ? { runOverride: opts.runOverride }
      : {}),
  });

  const successful = outcomes.filter(
    (o) => o.status === 'completed' && o.output_exists,
  );
  if (successful.length === 0) {
    const totalUsage = aggregateUsage(outcomes);
    const result = buildResult({
      status: 'no-researchers-succeeded',
      cwd,
      designDir,
      researchers: outcomes,
      stateMdWritten: true,
      designContextMdWritten: false,
      totalUsage,
      ...(backupDir !== null ? { backupDir } : {}),
    });
    logger.warn('init.runner.completed', {
      ...logPayloadFor(result),
      reason: 'all researchers failed or produced no output',
    });
    return result;
  }

  // ------------------------------------------------------------------
  // 5. Load successful researcher outputs and spawn synthesizer.
  // ------------------------------------------------------------------
  const specByName = new Map<ResearcherName, ResearcherSpec>(
    researchers.map((s) => [s.name, s]),
  );
  const synthesizerInputs = successful
    .map((o) => {
      const spec = specByName.get(o.name);
      if (spec === undefined) return null;
      const absPath = resolve(cwd, spec.outputPath);
      let content: string;
      try {
        content = readFileSync(absPath, 'utf8');
      } catch {
        return null;
      }
      return { name: o.name, path: absPath, content };
    })
    .filter((x): x is { name: ResearcherName; path: string; content: string } =>
      x !== null,
    );

  const synth = await spawnSynthesizer({
    researcherOutputs: synthesizerInputs,
    cwd,
    budget: opts.synthesizerBudget,
    maxTurns: opts.synthesizerMaxTurns,
    ...(opts.runOverride !== undefined
      ? { runOverride: opts.runOverride }
      : {}),
    ...(opts.synthesizerPromptOverride !== undefined
      ? { promptOverride: opts.synthesizerPromptOverride }
      : {}),
  });

  // ------------------------------------------------------------------
  // 6. Aggregate + return.
  // ------------------------------------------------------------------
  const totalUsage = aggregateUsageAll(outcomes, synth.usage);
  const designContextWritten = synth.status === 'completed';
  const status: InitStatus = 'completed';

  const result = buildResult({
    status,
    cwd,
    designDir,
    researchers: outcomes,
    stateMdWritten: true,
    designContextMdWritten: designContextWritten,
    totalUsage,
    ...(backupDir !== null ? { backupDir } : {}),
  });

  if (synth.status !== 'completed') {
    logger.warn('init.runner.completed', {
      ...logPayloadFor(result),
      synthesizer_error: synth.error ?? 'unknown',
    });
  } else {
    logger.info('init.runner.completed', logPayloadFor(result));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function zeroUsage(): InitRunnerResult['total_usage'] {
  return { input_tokens: 0, output_tokens: 0, usd_cost: 0 };
}

function aggregateUsage(
  outcomes: readonly ResearcherOutcome[],
): InitRunnerResult['total_usage'] {
  let input = 0;
  let output = 0;
  let cost = 0;
  for (const o of outcomes) {
    input += o.usage.input_tokens;
    output += o.usage.output_tokens;
    cost += o.usage.usd_cost;
  }
  return { input_tokens: input, output_tokens: output, usd_cost: cost };
}

function aggregateUsageAll(
  outcomes: readonly ResearcherOutcome[],
  synthUsage: { input_tokens: number; output_tokens: number; usd_cost: number },
): InitRunnerResult['total_usage'] {
  const researcherUsage = aggregateUsage(outcomes);
  return {
    input_tokens: researcherUsage.input_tokens + synthUsage.input_tokens,
    output_tokens: researcherUsage.output_tokens + synthUsage.output_tokens,
    usd_cost: researcherUsage.usd_cost + synthUsage.usd_cost,
  };
}

interface BuildResultInput {
  readonly status: InitStatus;
  readonly cwd: string;
  readonly designDir: string;
  readonly researchers: readonly ResearcherOutcome[];
  readonly stateMdWritten: boolean;
  readonly designContextMdWritten: boolean;
  readonly totalUsage: InitRunnerResult['total_usage'];
  readonly backupDir?: string;
}

function buildResult(input: BuildResultInput): InitRunnerResult {
  const scaffold: InitRunnerResult['scaffold'] = input.backupDir !== undefined
    ? {
        state_md_written: input.stateMdWritten,
        design_context_md_written: input.designContextMdWritten,
        backup_dir: input.backupDir,
      }
    : {
        state_md_written: input.stateMdWritten,
        design_context_md_written: input.designContextMdWritten,
      };

  return Object.freeze({
    status: input.status,
    cwd: input.cwd,
    design_dir: input.designDir,
    researchers: input.researchers,
    scaffold,
    total_usage: input.totalUsage,
  });
}

function logPayloadFor(result: InitRunnerResult): Record<string, unknown> {
  return {
    status: result.status,
    cwd: result.cwd,
    design_dir: result.design_dir,
    researcher_total: result.researchers.length,
    researcher_succeeded: result.researchers.filter(
      (r) => r.status === 'completed' && r.output_exists,
    ).length,
    state_md_written: result.scaffold.state_md_written,
    design_context_md_written: result.scaffold.design_context_md_written,
    ...(result.scaffold.backup_dir !== undefined
      ? { backup_dir: result.scaffold.backup_dir }
      : {}),
    total_usage: result.total_usage,
  };
}
