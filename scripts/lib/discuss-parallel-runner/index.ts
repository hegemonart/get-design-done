// scripts/lib/discuss-parallel-runner/index.ts — Plan 21-07 (SDK-19).
//
// Top-level orchestrator for the parallel discussion runner.
//
// Public surface:
//   * run(opts)              — the entry point. Spawns N discussants,
//                              aggregates their contributions, returns
//                              typed DiscussRunnerResult.
//   * DEFAULT_DISCUSSANTS     — the 4-variant default roster (frozen).
//   * Re-exports              — every type + named function from the
//                              three internal modules so consumers need
//                              only one import site.
//
// Algorithm (per PLAN.md Task 4):
//   1. specs = opts.discussants ?? DEFAULT_DISCUSSANTS.
//   2. Spawn all via `spawnDiscussantsParallel` with concurrency
//      default 4.
//   3. Keep ALL contributions in the return value (successful + failed).
//      The aggregator only receives the successful ones.
//   4. If zero successful contributions → throw OperationFailedError
//      code 'NO_DISCUSSANTS_SUCCEEDED'.
//   5. Run `spawnAggregator(successfulContributions, {...})` with the
//      separate aggregator budget + max turns.
//   6. Aggregate usage: sum per-discussant usage + aggregator usage.
//   7. Return DiscussRunnerResult.
//
// Consumers: `discuss` skill (Plan 21-08 / future) + `gdd-sdk discuss`
// CLI subcommand (Plan 21-09).

import { OperationFailedError } from '../gdd-errors/index.ts';
import { getLogger } from '../logger/index.ts';

import {
  spawnAggregator,
} from './aggregator.ts';
import {
  spawnDiscussantsParallel,
} from './discussants.ts';
import type {
  DiscussantSpec,
  DiscussionContribution,
  DiscussRunnerOptions,
  DiscussRunnerResult,
} from './types.ts';

// ---------------------------------------------------------------------------
// Re-exports — one import site for consumers
// ---------------------------------------------------------------------------

export type {
  AggregatedDiscussion,
  AggregatedQuestion,
  DiscussantName,
  DiscussantSpec,
  DiscussionContribution,
  DiscussionItem,
  DiscussRunnerOptions,
  DiscussRunnerResult,
  Severity,
} from './types.ts';

export {
  parseDiscussionBlock,
  spawnDiscussant,
  spawnDiscussantsParallel,
} from './discussants.ts';
export type {
  DiscussantRunOverride,
  SpawnDiscussantOptions,
  SpawnDiscussantsParallelOptions,
} from './discussants.ts';

export {
  buildAggregatorPrompt,
  computeQuestionKey,
  parseAggregatorOutput,
  spawnAggregator,
} from './aggregator.ts';
export type {
  AggregatorRunOverride,
  SpawnAggregatorOptions,
} from './aggregator.ts';

// ---------------------------------------------------------------------------
// DEFAULT_DISCUSSANTS
// ---------------------------------------------------------------------------

/**
 * Default discussant roster — four variants covering user-journey,
 * technical-constraint, brand-fit, accessibility angles. Frozen so
 * callers can safely spread into new arrays without worrying about
 * mutation.
 */
export const DEFAULT_DISCUSSANTS: readonly DiscussantSpec[] = Object.freeze([
  Object.freeze({
    name: 'user-journey',
    prompt:
      'You are a UX researcher reviewing the design brief. Surface friction points in the user journey you would want to validate. Emit the DISCUSSION COMPLETE block at the end.',
  }),
  Object.freeze({
    name: 'technical-constraint',
    prompt:
      'You are a senior engineer reviewing the design brief. Surface feasibility, performance, and cross-platform concerns. Emit the DISCUSSION COMPLETE block at the end.',
  }),
  Object.freeze({
    name: 'brand-fit',
    prompt:
      'You are a brand director reviewing the design brief. Surface brand-archetype misalignment or visual-tone questions. Emit the DISCUSSION COMPLETE block at the end.',
  }),
  Object.freeze({
    name: 'accessibility',
    prompt:
      'You are an accessibility specialist reviewing the design brief. Surface inclusion concerns you would need answered. Emit the DISCUSSION COMPLETE block at the end.',
  }),
]);

// ---------------------------------------------------------------------------
// run — top-level orchestrator
// ---------------------------------------------------------------------------

/**
 * Orchestrate a parallel discussion run.
 *
 * Failure modes:
 *   * Zero successful discussants → `OperationFailedError` code
 *     `'NO_DISCUSSANTS_SUCCEEDED'` (with per-discussant errors in context).
 *   * Aggregator parse failure → `ValidationError` code
 *     `'AGGREGATOR_PARSE_ERROR'` (propagated from spawnAggregator).
 *   * Aggregator session failure → `ValidationError` code
 *     `'AGGREGATOR_SESSION_FAILED'`.
 *
 * Per-discussant failures do NOT abort the run — they surface as
 * `status !== 'completed'` contributions in the return value.
 */
export async function run(
  opts: DiscussRunnerOptions,
): Promise<DiscussRunnerResult> {
  const logger = getLogger();
  const specs = opts.discussants ?? DEFAULT_DISCUSSANTS;
  const concurrency = opts.concurrency !== undefined && opts.concurrency > 0
    ? opts.concurrency
    : 4;
  const cwd = opts.cwd ?? process.cwd();

  logger.info('discuss.runner.started', {
    discussants: specs.length,
    concurrency,
    cwd,
  });

  const contributions = await spawnDiscussantsParallel(specs, {
    concurrency,
    budget: opts.budget,
    maxTurns: opts.maxTurnsPerDiscussant,
    ...(opts.runOverride !== undefined ? { runOverride: opts.runOverride } : {}),
    cwd,
  });

  const successful: DiscussionContribution[] = contributions.filter(
    (c): c is DiscussionContribution => c.status === 'completed',
  );

  if (successful.length === 0) {
    // Collect per-discussant error details for the operator.
    const errorSummary = contributions.map((c) => ({
      discussant: c.discussant,
      status: c.status,
      error: c.error ?? null,
    }));
    logger.error('discuss.runner.no_successes', {
      attempted: contributions.length,
      errors: errorSummary,
    });
    throw new OperationFailedError(
      `all ${contributions.length} discussants failed — aggregator cannot run`,
      'NO_DISCUSSANTS_SUCCEEDED',
      { attempted: contributions.length, contributions: errorSummary },
    );
  }

  const aggregated = await spawnAggregator(successful, {
    budget: opts.aggregatorBudget,
    maxTurns: opts.aggregatorMaxTurns,
    ...(opts.runOverride !== undefined ? { runOverride: opts.runOverride } : {}),
    cwd,
    ...(opts.aggregatorPrompt !== undefined
      ? { customPrompt: opts.aggregatorPrompt }
      : {}),
  });

  // Aggregate usage = sum(contributions.usage) + aggregated.usage.
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  for (const c of contributions) {
    totalInput += c.usage.input_tokens;
    totalOutput += c.usage.output_tokens;
    totalCost += c.usage.usd_cost;
  }
  totalInput += aggregated.usage.input_tokens;
  totalOutput += aggregated.usage.output_tokens;
  totalCost += aggregated.usage.usd_cost;

  logger.info('discuss.runner.completed', {
    attempted: contributions.length,
    successful: successful.length,
    themes: aggregated.themes.length,
    questions: aggregated.questions.length,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    total_usd_cost: totalCost,
  });

  return {
    contributions,
    aggregated,
    total_usage: {
      input_tokens: totalInput,
      output_tokens: totalOutput,
      usd_cost: totalCost,
    },
  };
}
