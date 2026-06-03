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
import { resolveConcurrency } from '../parallelism-engine/concurrency-tuner.cjs';
// Phase 53 (DISC-01): the incremental batching composer. CJS, imported the same
// way as concurrency-tuner.cjs above. Only invoked when opts.incremental.graph
// is supplied — the default explore path never loads its ESM/TS dependencies.
import { planIncremental } from '../mappers/incremental-discover.cjs';
// Phase 54 (REG-01): stack detection + addendum composition. Both CJS, imported
// the same way. The pre-spawn step (composeMapperSpecs below) calls detectStack
// ONCE and applyAddendums per spec; both are wrapped in try/catch so a failure
// degrades to the unmodified Phase-21 spec roster.
import { detectStack } from '../detect/stack.cjs';
import { applyAddendums } from '../mapper-spawn.cjs';

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
// Phase 54 (REG-01) — pre-spawn stack-addendum composition
// ---------------------------------------------------------------------------

/** Derive the agent name an addendum's composes_into list matches against. */
function agentNameOf(spec: MapperSpec): string {
  // Addendum composes_into uses the AGENT filename (token-mapper,
  // component-taxonomy-mapper, motion-mapper, visual-hierarchy-mapper), not the
  // short MapperSpec.name (token, component-taxonomy, ...). Derive it from the
  // agentPath basename so the registry match keys line up.
  const base = spec.agentPath
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\.md$/i, '');
  return base && base.length > 0 ? base : spec.name;
}

/**
 * Compose stack-specific guidance into each mapper spec BEFORE spawn.
 *
 * Detects the project stack ONCE (detect/stack.cjs#detectStack) and, for each
 * spec, appends the matching `type:"stack-addendum"` reference bodies to the
 * prompt (mapper-spawn.cjs#applyAddendums, cap 1 system + 1 framework + 1
 * motion). The match is keyed by the spec's AGENT name against the registry
 * `composes_into` list.
 *
 * Contract:
 *   * ADDITIVE + BACKWARD-COMPATIBLE: a spec with no matching addendum (or no
 *     detected stack) is returned with a byte-for-byte unchanged prompt. When
 *     NOTHING matches across all specs, the original `specs` array is returned
 *     unchanged (same reference), so the Phase-21 path is identical.
 *   * NEVER THROWS: detection / registry / file-read failures degrade to the
 *     unmodified roster. Dispatch is never blocked by this step.
 *   * The frozen DEFAULT_MAPPERS entries are never mutated — a spec that gains
 *     an addendum is returned as a fresh object.
 *
 * @returns `{ specs, missingByMapper }` — the (possibly) recomposed roster +
 *          a per-agent-name list of detected stack values that had NO addendum
 *          for that mapper (drives the R6 fallback flag / health coverage row).
 */
function composeMapperSpecs(
  specs: readonly MapperSpec[],
  cwd: string,
  addendumOpts: ExploreRunnerOptions['addendums'],
  logger: ReturnType<typeof getLogger>,
): { specs: readonly MapperSpec[]; missingByMapper: Record<string, string[]> } {
  const missingByMapper: Record<string, string[]> = {};
  const opt = addendumOpts ?? {};
  if (opt.enabled === false) return { specs, missingByMapper };

  try {
    const root: string = typeof opt.root === 'string' ? opt.root : cwd;
    const detect = typeof opt.detectStack === 'function' ? opt.detectStack : detectStack;
    const stack = detect(root) as {
      ds?: string | null;
      framework?: string | null;
      motion_libs?: string[];
    } | null;

    // Resolve the registry + refDir. Defaults read the shipped registry and the
    // repo reference/ dir; tests inject both. A missing registry simply yields
    // no matches (applyAddendums degrades to an empty block).
    let registry: unknown = opt.registry;
    const refDir: string =
      typeof opt.refDir === 'string'
        ? opt.refDir
        : resolvePath(cwd, 'reference');
    if (registry === undefined) {
      try {
        // Lazy require so the default path only touches disk when enabled.
        const { loadRegistry } = require('../reference-registry.cjs') as {
          loadRegistry: (o: { cwd?: string }) => unknown;
        };
        registry = loadRegistry({ cwd });
      } catch {
        registry = undefined; // no registry ⇒ no addendums (unchanged prompts)
      }
    }

    let anyChanged = false;
    const recomposed: MapperSpec[] = specs.map((spec) => {
      const agentName = agentNameOf(spec);
      // applyAddendums mutates a spec-shaped object's `.prompt` in place; we feed
      // it a throwaway carrying the AGENT name so the registry match keys align,
      // then copy the (possibly) augmented prompt back onto a fresh spec.
      const carrier = { name: agentName, prompt: spec.prompt };
      const { block, missing } = applyAddendums(carrier, stack, {
        registry,
        refDir,
      }) as { block: string; used: string[]; missing: string[] };

      if (Array.isArray(missing) && missing.length > 0) {
        missingByMapper[agentName] = missing;
      }
      if (block && block.length > 0 && carrier.prompt !== spec.prompt) {
        anyChanged = true;
        return Object.freeze({ ...spec, prompt: carrier.prompt });
      }
      return spec;
    });

    if (anyChanged) {
      logger.info('explore.runner.addendums_composed', {
        mappers_augmented: recomposed.filter((s, i) => s !== specs[i]).length,
        ds: stack && stack.ds ? stack.ds : null,
        framework: stack && stack.framework ? stack.framework : null,
        motion_libs:
          stack && Array.isArray(stack.motion_libs) ? stack.motion_libs.length : 0,
      });
      return { specs: Object.freeze(recomposed), missingByMapper };
    }
    // Nothing matched — return the original roster reference unchanged.
    return { specs, missingByMapper };
  } catch (err) {
    // The addendum step must NEVER break dispatch. Degrade to the unmodified
    // roster + surface a warn for observability.
    const message: string = err instanceof Error ? err.message : String(err);
    logger.warn('explore.runner.addendums_failed', { message });
    return { specs, missingByMapper };
  }
}

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
  const baseSpecs: readonly MapperSpec[] = opts.mappers ?? DEFAULT_MAPPERS;
  const cwd: string = opts.cwd ?? process.cwd();
  // Phase 27.6 D-07: data-driven concurrency default. Falls back to
  // min(cpu-1, 8) when no `parallelism.verdict` events exist in
  // .design/telemetry/events.jsonl. Explicit `opts.concurrency` still wins.
  const concurrency: number = opts.concurrency ?? resolveConcurrency();

  const logger = getLogger().child('explore.runner');

  // --- Phase 54 (REG-01): compose stack addendums into mapper prompts -------
  //
  // Fingerprint the project ONCE and append the matching stack-addendum bodies
  // to each mapper's prompt BEFORE partitioning / spawn. ADDITIVE +
  // backward-compatible: no detected stack / no matching addendum ⇒ `specs` is
  // the unchanged roster reference. NEVER throws (composeMapperSpecs guards).
  const { specs } = composeMapperSpecs(baseSpecs, cwd, opts.addendums, logger);

  const outputPath: string = resolvePath(cwd, '.design/DESIGN-PATTERNS.md');

  // --- Phase 53 (DISC-01): incremental batching ----------------------------
  //
  // ONLY runs when a Phase-52 graph is supplied. Groups the graph into Louvain
  // community batches, runs the change classifier against the prior fingerprint
  // snapshot, and elects which batches to re-map (SKIP=0, PARTIAL=affected,
  // FULL=all). The result rides on `batching`; the spec roster + rolling
  // semaphore below are UNCHANGED. Backward-compatible: absent graph ⇒ undefined
  // batching ⇒ the Phase-21 path is byte-for-byte the same. Never throws —
  // batching is advisory metadata, and a planning failure must not abort mappers.
  let batching: ExploreRunnerResult['batching'] = undefined;
  if (opts.incremental && opts.incremental.graph !== undefined && opts.incremental.graph !== null) {
    try {
      const plan = await planIncremental({
        graph: opts.incremental.graph,
        prevFingerprints: opts.incremental.prevFingerprints,
        opts: {
          ...(opts.incremental.forceFull !== undefined ? { forceFull: opts.incremental.forceFull } : {}),
          ...(opts.incremental.computeBatchesOpts !== undefined ? { computeBatchesOpts: opts.incremental.computeBatchesOpts } : {}),
          ...(opts.incremental.neighborCap !== undefined ? { neighborCap: opts.incremental.neighborCap } : {}),
          ...(opts.incremental.thresholds !== undefined ? { thresholds: opts.incremental.thresholds } : {}),
        },
      });
      batching = Object.freeze({
        action: plan.action,
        method: plan.method,
        modularity: plan.modularity,
        batches: Object.freeze(plan.batches.map((b: { id: string; members: string[]; mergeable: boolean; kind: string; source: string }) => Object.freeze({
          id: b.id,
          members: Object.freeze([...b.members]),
          mergeable: b.mergeable,
          kind: b.kind,
          source: b.source,
        }))),
        batchesToMap: Object.freeze(plan.batchesToMap.map((b: { id: string }) => b.id)),
        neighborMaps: Object.freeze({ ...plan.neighborMaps }),
        classification: Object.freeze({ ...plan.classification }),
      });
      logger.info('explore.runner.batching', {
        action: plan.action,
        method: plan.method,
        batch_count: plan.batches.length,
        batches_to_map: plan.batchesToMap.length,
        structural_count: plan.classification.structuralCount,
      });
    } catch (err) {
      // Planning failure degrades to "no batching" — the mappers still run.
      const message: string = err instanceof Error ? err.message : String(err);
      logger.warn('explore.runner.batching_failed', { message });
      batching = undefined;
    }
  }

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
      ...(batching !== undefined ? { batching } : {}),
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
    ...(batching !== undefined ? { batching } : {}),
  });
}
