// scripts/lib/explore-parallel-runner/index.ts — Plan 21-06 (SDK-18).
//
// Public surface:
//
//   run(opts: ExploreRunnerOptions): Promise<ExploreRunnerResult>
//   DEFAULT_MAPPERS — the locked Phase-21 4-mapper roster (frozen).
//   isParallelismSafe, spawnMapper, spawnMappersParallel (from mappers.ts)
//   synthesizeStreaming (from synthesizer.ts)
//   Types (from types.ts) — MapperName, MapperSpec, MapperOutcome,
//     ExploreRunnerOptions, ExploreRunnerResult.
//
// Algorithm:
//   1. specs = opts.mappers ?? DEFAULT_MAPPERS.
//   2. Partition by isParallelismSafe(spec.agentPath).
//   3. Run safe mappers via spawnMappersParallel(concurrency).
//   4. Run unsafe mappers sequentially (tail phase).
//   5. Run synthesizer via synthesizeStreaming.
//   6. Aggregate total_usage = sum mapper + synthesizer.
//   7. Emit logger + explore.runner.* lifecycle events.
//   8. Return ExploreRunnerResult.
//
// Empty specs short-circuits: no mappers spawned, synthesizer skipped,
// returns an all-zero result.

import { resolve as resolvePath } from 'node:path';

import { getLogger } from '../logger/index.ts';

import {
  isParallelismSafe,
  spawnMapper,
  spawnMappersParallel,
} from './mappers.ts';
import { synthesizeStreaming } from './synthesizer.ts';
import type {
  ExploreRunnerOptions,
  ExploreRunnerResult,
  MapperOutcome,
  MapperSpec,
} from './types.ts';

// Re-exports.
export type {
  MapperName,
  MapperSpec,
  MapperOutcome,
  ExploreRunnerOptions,
  ExploreRunnerResult,
} from './types.ts';
export {
  isParallelismSafe,
  spawnMapper,
  spawnMappersParallel,
} from './mappers.ts';
export { synthesizeStreaming } from './synthesizer.ts';

// ---------------------------------------------------------------------------
// DEFAULT_MAPPERS — locked Phase-21 roster
// ---------------------------------------------------------------------------

/**
 * Locked 4-mapper roster for the explore stage. Frozen end-to-end so
 * consumers can't mutate entries; override via ExploreRunnerOptions.mappers.
 *
 * Agent paths use the exact filenames from `agents/` (as of Phase 21):
 *   token-mapper.md, component-taxonomy-mapper.md, a11y-mapper.md,
 *   visual-hierarchy-mapper.md.
 *
 * When an agent file is missing, session-runner scope computation
 * gracefully falls through to the stage default (see mappers.ts).
 */
export const DEFAULT_MAPPERS: readonly MapperSpec[] = Object.freeze([
  Object.freeze({
    name: 'token' as const,
    agentPath: 'agents/token-mapper.md',
    outputPath: '.design/map/token.md',
    prompt:
      'Enumerate every design token found in the UI source: colors, typography, spacing, radii, shadows, motion durations. Output to .design/map/token.md as a canonical token inventory.',
  }),
  Object.freeze({
    name: 'component-taxonomy' as const,
    agentPath: 'agents/component-taxonomy-mapper.md',
    outputPath: '.design/map/component-taxonomy.md',
    prompt:
      'Enumerate component archetypes and their variants. Output to .design/map/component-taxonomy.md — one entry per archetype with variant list, slot inventory, and usage count.',
  }),
  Object.freeze({
    name: 'a11y' as const,
    agentPath: 'agents/a11y-mapper.md',
    outputPath: '.design/map/a11y.md',
    prompt:
      'WCAG-axis scan: contrast ratios, keyboard navigation, ARIA semantics, focus management, reduced-motion respect. Output to .design/map/a11y.md — one section per axis with findings.',
  }),
  Object.freeze({
    name: 'visual-hierarchy' as const,
    agentPath: 'agents/visual-hierarchy-mapper.md',
    outputPath: '.design/map/visual-hierarchy.md',
    prompt:
      'Describe z-order, focal points, and attention grammar. Output to .design/map/visual-hierarchy.md — one section per surface describing layering, emphasis, and scan path.',
  }),
]);

// ---------------------------------------------------------------------------
// run — main orchestrator
// ---------------------------------------------------------------------------

/**
 * Spawn the 4 mapper sessions (parallel) + the synthesizer (sequential
 * after mappers become stable), aggregate usage, emit lifecycle events,
 * return terminal ExploreRunnerResult.
 *
 * Contract:
 *   * Never throws. All failure modes land as outcomes / synth status.
 *   * Individual mapper errors do NOT abort other mappers.
 *   * parallelism_safe: false mappers run serially AFTER the safe batch.
 *   * total_usage aggregates mappers + synthesizer.
 */
export async function run(
  opts: ExploreRunnerOptions,
): Promise<ExploreRunnerResult> {
  const specs: readonly MapperSpec[] = opts.mappers ?? DEFAULT_MAPPERS;
  const cwd: string = opts.cwd ?? process.cwd();
  const concurrency: number = opts.concurrency ?? 4;

  const logger = getLogger().child('explore.runner');

  const outputPath: string = resolvePath(cwd, '.design/DESIGN-PATTERNS.md');

  logger.info('explore.runner.started', {
    mapper_count: specs.length,
    concurrency,
  });

  // Empty-spec short-circuit — no mappers, no synthesizer, zero usage.
  if (specs.length === 0) {
    logger.info('explore.runner.completed', {
      parallel_count: 0,
      serial_count: 0,
      synthesizer_status: 'skipped',
      total_usd_cost: 0,
    });
    return Object.freeze({
      mappers: Object.freeze([]),
      synthesizer: Object.freeze({
        status: 'skipped' as const,
        output_path: outputPath,
        usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
        files_fed: Object.freeze([]),
      }),
      parallel_count: 0,
      serial_count: 0,
      total_usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
    });
  }

  // --- Partition specs by parallelism_safe frontmatter ---------------------
  const safeSpecs: MapperSpec[] = [];
  const serialSpecs: MapperSpec[] = [];
  for (const spec of specs) {
    const resolvedAgentPath: string = resolvePath(cwd, spec.agentPath);
    if (isParallelismSafe(resolvedAgentPath)) {
      safeSpecs.push(spec);
    } else {
      serialSpecs.push(spec);
    }
  }

  // --- Parallel batch ------------------------------------------------------
  const parallelOutcomes: readonly MapperOutcome[] =
    safeSpecs.length > 0
      ? await spawnMappersParallel(safeSpecs, {
          concurrency,
          budget: opts.budget,
          maxTurns: opts.maxTurnsPerMapper,
          cwd,
          ...(opts.runOverride !== undefined ? { runOverride: opts.runOverride } : {}),
        })
      : Object.freeze([]);

  for (const o of parallelOutcomes) {
    logger.info('explore.runner.mapper_done', {
      mapper: o.name,
      status: o.status,
      duration_ms: o.duration_ms,
      output_exists: o.output_exists,
      output_bytes: o.output_bytes,
      mode: 'parallel',
    });
  }

  // --- Serial tail --------------------------------------------------------
  const serialOutcomes: MapperOutcome[] = [];
  for (const spec of serialSpecs) {
    const spawnOpts: Parameters<typeof spawnMapper>[1] = {
      budget: opts.budget,
      maxTurns: opts.maxTurnsPerMapper,
      cwd,
      ...(opts.runOverride !== undefined ? { runOverride: opts.runOverride } : {}),
    };
    const outcome = await spawnMapper(spec, spawnOpts);
    serialOutcomes.push(outcome);
    logger.info('explore.runner.mapper_done', {
      mapper: outcome.name,
      status: outcome.status,
      duration_ms: outcome.duration_ms,
      output_exists: outcome.output_exists,
      output_bytes: outcome.output_bytes,
      mode: 'serial',
    });
  }

  // --- Merge outcomes in ORIGINAL spec order -------------------------------
  //
  // Callers rely on `.mappers[i]` pairing with `opts.mappers[i]` (or
  // DEFAULT_MAPPERS[i]). We rebuild by indexing the name→outcome map.
  const byName: Map<string, MapperOutcome> = new Map();
  for (const o of parallelOutcomes) byName.set(o.name, o);
  for (const o of serialOutcomes) byName.set(o.name, o);
  const mergedOutcomes: MapperOutcome[] = specs.map((s) => {
    const o = byName.get(s.name);
    if (o === undefined) {
      // Shouldn't happen unless partitioning dropped a spec. Surface
      // as a synthetic error outcome rather than throwing.
      return Object.freeze({
        name: s.name,
        status: 'error',
        output_exists: false,
        output_bytes: 0,
        usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
        duration_ms: 0,
        error: Object.freeze({
          code: 'PARTITION_LOST',
          message: `mapper ${s.name} was not executed by either batch`,
        }),
      });
    }
    return o;
  });

  // --- Synthesizer --------------------------------------------------------
  logger.info('explore.runner.synthesizer_started', {
    mappers_ready: mergedOutcomes.filter((m) => m.output_exists).length,
    mappers_total: mergedOutcomes.length,
  });

  const synthResult = await synthesizeStreaming({
    mapperNames: specs.map((s) => s.name),
    mapperOutputPaths: specs.map((s) => s.outputPath),
    synthesizerPrompt: opts.synthesizerPrompt,
    budget: opts.synthesizerBudget,
    maxTurns: opts.synthesizerMaxTurns,
    cwd,
    ...(opts.runOverride !== undefined ? { runOverride: opts.runOverride } : {}),
    ...(opts.pollIntervalMs !== undefined ? { pollIntervalMs: opts.pollIntervalMs } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });

  // --- Aggregate usage ----------------------------------------------------
  let totalInput = synthResult.usage.input_tokens;
  let totalOutput = synthResult.usage.output_tokens;
  let totalCost = synthResult.usage.usd_cost;
  for (const m of mergedOutcomes) {
    totalInput += m.usage.input_tokens;
    totalOutput += m.usage.output_tokens;
    totalCost += m.usage.usd_cost;
  }

  logger.info('explore.runner.completed', {
    parallel_count: safeSpecs.length,
    serial_count: serialSpecs.length,
    synthesizer_status: synthResult.status,
    total_usd_cost: totalCost,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
  });

  return Object.freeze({
    mappers: Object.freeze(mergedOutcomes),
    synthesizer: Object.freeze({
      status: synthResult.status,
      output_path: synthResult.output_path,
      usage: synthResult.usage,
      files_fed: synthResult.files_fed,
      ...(synthResult.error !== undefined ? { error: synthResult.error } : {}),
    }),
    parallel_count: safeSpecs.length,
    serial_count: serialSpecs.length,
    total_usage: {
      input_tokens: totalInput,
      output_tokens: totalOutput,
      usd_cost: totalCost,
    },
  });
}
