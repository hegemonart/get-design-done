// scripts/lib/explore-parallel-runner/types.ts — Plan 21-06 (SDK-18).
//
// Public type surface for the 4-mapper parallel explore runner. Consumers
// import from ./index.ts (the barrel); this file carries the type graph
// so mappers.ts / synthesizer.ts / index.ts can share a single source of
// truth without cyclic imports.
//
// Design notes:
//   * `MapperName` is a closed union. Extending it requires touching the
//     DEFAULT_MAPPERS table in index.ts, so a type-level addition forces
//     a compile error on any registry-consuming site.
//   * `ExploreRunnerOptions.runOverride` mirrors `SessionRunnerOptions.queryOverride`
//     at a higher altitude — it replaces the whole `session-runner.run()`
//     call per-mapper/per-synthesizer. Tests build a deterministic
//     `runOverride` that returns canned `SessionResult`s without touching
//     the Agent SDK.
//   * All numeric fields in usage/outcome default to 0 on unpopulated
//     sessions; we never surface `undefined` in `total_usage` math.
//   * `parallel_count` + `serial_count` together === `specs.length`
//     (after parallelism_safe partitioning). Synthesizer is counted
//     separately under `.synthesizer`.

import type {
  BudgetCap,
  SessionResult,
  SessionRunnerOptions,
} from '../session-runner/types.ts';

/** Closed union of mapper roster. Changing this forces a compile-time
 *  touch of `DEFAULT_MAPPERS` in index.ts — a deliberate choke point
 *  so the roster stays the Phase-21 Locked 4. */
export type MapperName =
  | 'token'
  | 'component-taxonomy'
  | 'a11y'
  | 'visual-hierarchy';

/**
 * A single mapper invocation specification. The runner does NOT own
 * prompt construction — callers assemble the prompt body from their
 * `DESIGN-CONTEXT.md` + roster scaffolding and pass it through here.
 */
export interface MapperSpec {
  /** Mapper identifier — also used in event payloads + log scopes. */
  readonly name: MapperName;
  /** Path to `agents/<name>.md`. Missing file is tolerated (stage default). */
  readonly agentPath: string;
  /** Expected mapper output file, e.g. `.design/map/token.md`. */
  readonly outputPath: string;
  /** Per-mapper prompt body passed to session-runner. */
  readonly prompt: string;
}

/**
 * Terminal record for a single mapper invocation. `output_exists` /
 * `output_bytes` are captured AFTER the session terminates — if the
 * mapper wrote its file but the session errored in cleanup, we still
 * surface the file's presence.
 *
 * `error` is populated iff `status === 'error'`.
 */
export interface MapperOutcome {
  readonly name: MapperName;
  readonly status: 'completed' | 'error' | 'skipped';
  readonly output_exists: boolean;
  readonly output_bytes: number;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly usd_cost: number;
  };
  readonly duration_ms: number;
  readonly error?: { readonly code: string; readonly message: string };
}

/**
 * Caller-facing run options for the explore runner. Most fields mirror
 * session-runner's BudgetCap / turn caps but applied per-mapper.
 *
 * `runOverride`: when supplied, the runner invokes this instead of the
 * real `session-runner.run()`. Tests build overrides that return canned
 * `SessionResult`s without touching the Agent SDK.
 */
export interface ExploreRunnerOptions {
  /** Override the mapper roster. Defaults to DEFAULT_MAPPERS (the locked 4). */
  readonly mappers?: readonly MapperSpec[];
  /** Per-mapper hard budget cap. Shared envelope — does NOT pool across mappers. */
  readonly budget: BudgetCap;
  /** Per-mapper turn cap. */
  readonly maxTurnsPerMapper: number;
  /** Max concurrent mappers. Defaults to 4 (the full locked roster). */
  readonly concurrency?: number;
  /** Prompt body for the synthesizer session. */
  readonly synthesizerPrompt: string;
  /** Budget cap for the synthesizer session. */
  readonly synthesizerBudget: BudgetCap;
  /** Turn cap for the synthesizer session. */
  readonly synthesizerMaxTurns: number;
  /**
   * Replace the session-runner.run() call entirely (test injection). Each
   * mapper + the synthesizer each consume one invocation of this override.
   */
  readonly runOverride?: (
    opts: SessionRunnerOptions,
  ) => Promise<SessionResult>;
  /** Current working directory used for path resolution (fixtures / agent files). */
  readonly cwd?: string;
  /** Override the file-stability polling interval (ms). Default 200. */
  readonly pollIntervalMs?: number;
  /** Override the file-watch timeout (ms). Default 600_000 (10 min). */
  readonly timeoutMs?: number;
}

/**
 * Terminal record for the whole runner invocation. `parallel_count` +
 * `serial_count` === mappers.length (after parallelism_safe partitioning).
 * `total_usage` aggregates mappers + synthesizer.
 */
export interface ExploreRunnerResult {
  readonly mappers: readonly MapperOutcome[];
  readonly synthesizer: {
    readonly status: 'completed' | 'error' | 'skipped' | 'timeout';
    readonly output_path: string;
    readonly usage: {
      readonly input_tokens: number;
      readonly output_tokens: number;
      readonly usd_cost: number;
    };
    readonly files_fed: readonly string[];
    readonly error?: { readonly code: string; readonly message: string };
  };
  readonly parallel_count: number;
  readonly serial_count: number;
  readonly total_usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly usd_cost: number;
  };
}
