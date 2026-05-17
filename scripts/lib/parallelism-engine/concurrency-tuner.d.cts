// scripts/lib/parallelism-engine/concurrency-tuner.d.cts — types for concurrency-tuner.cjs (Phase 27.6 D-07).

export interface ResolveConcurrencyOptions {
  /** Override CPU count detection (defaults to `os.cpus().length`). */
  cpuCount?: number;
  /** Override last-observed optimum (else read from event-chain). */
  lastObservedOptimum?: number;
  /** Hard ceiling cap. Defaults to `DEFAULT_HARD_CEILING` (8). */
  hardCeiling?: number;
  /** Event-chain path override (else use `DEFAULT_EVENTS_PATH`). */
  eventsPath?: string;
  /** Base directory override (else `process.cwd()`). */
  baseDir?: string;
}

export interface ReadLastObservedOptimumOptions {
  eventsPath?: string;
  baseDir?: string;
}

export interface EmitParallelismVerdictPayload {
  task_ids?: string[];
  verdict?: string;
  reason?: string;
  intended_concurrency?: number;
  observed_concurrency?: number;
  contention_detected?: boolean;
  wall_clock_ms?: number;
}

/**
 * Resolve the concurrency default per D-07: `min(cpu-1, last_observed_optimum, hard_ceiling)`.
 * Falls back to `cpu-1` capped at `hard_ceiling` when no prior verdict exists.
 */
export function resolveConcurrency(opts?: ResolveConcurrencyOptions): number;

/**
 * Read the latest `parallelism.verdict` event's optimum from the event chain.
 * Returns null when no prior verdict exists.
 */
export function readLastObservedOptimum(
  opts?: ReadLastObservedOptimumOptions,
): number | null;

/**
 * Emit a `parallelism.verdict` event (additive payload — back-compat preserved).
 */
export function emitParallelismVerdict(
  payload?: EmitParallelismVerdictPayload,
): void;

export const DEFAULT_HARD_CEILING: number;
export const DEFAULT_EVENTS_PATH: string;
