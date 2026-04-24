// scripts/lib/pipeline-runner/types.ts — Plan 21-05 (SDK-17).
//
// Typed surface for the Brief → Verify state machine that drives the
// full headless Phase-21 pipeline. Consumed by `state-machine.ts`,
// `stage-handlers.ts`, `human-gate.ts`, and `index.ts` (the `run()`
// driver).
//
// Design notes:
//   * `Stage` is the 5-stage design pipeline (brief → explore → plan →
//     design → verify). It is intentionally NARROWER than the session-
//     runner's Stage union (which also carries `init` + `custom`) —
//     the pipeline runner orchestrates only the design stages. `init`
//     is owned by Plan 21-08; `custom` is a one-off escape valve.
//   * `StageStatus` encodes terminal outcomes at the stage level. Any
//     status beginning with `halted-*` aborts the pipeline (except
//     `halted-human-gate`, which the driver disambiguates via the
//     `onHumanGate` callback).
//   * `PipelineStatus` is the pipeline-level terminal state. The driver
//     NEVER throws — all failure modes land here.
//   * Budget + turn caps apply per-stage. `BudgetCap.perStage` is
//     advisory for future aggregate-mode support (not used in this
//     plan — Plan 21-11's real-SDK E2E may revisit).

/**
 * The 5 stages of the design pipeline. Mirrors `.design/STATE.md`'s
 * stage field (Plan 20-01's gdd-state contract).
 */
export type Stage = 'brief' | 'explore' | 'plan' | 'design' | 'verify';

/**
 * Terminal outcome for a single stage. `completed` and `skipped` are
 * non-halting; every `halted-*` status aborts the pipeline — except
 * `halted-human-gate`, which the driver may resolve by invoking the
 * caller's `onHumanGate` callback.
 */
export type StageStatus =
  | 'completed'
  | 'skipped'
  | 'halted-gate-veto'
  | 'halted-budget'
  | 'halted-turn-cap'
  | 'halted-error'
  | 'halted-human-gate';

/**
 * Terminal state for the whole pipeline. `awaiting-gate` means a
 * human-gate paused execution; the caller may resume via a new `run()`
 * invocation with `resumeFrom` set to the paused stage.
 */
export type PipelineStatus =
  | 'completed'
  | 'halted'
  | 'stopped-after'
  | 'awaiting-gate';

/**
 * Hard caps on cost that apply to every stage's session. See
 * `session-runner/types.ts` for per-attempt semantics; `perStage=true`
 * means these caps fire independently per stage, not aggregated across
 * the pipeline.
 */
export interface BudgetCap {
  readonly usdLimit: number;
  readonly inputTokensLimit: number;
  readonly outputTokensLimit: number;
  /**
   * When `true`, the budget applies individually to each stage (default).
   * When `false`, the aggregate pipeline budget is split evenly across
   * the targeted stages — advisory; implementation still treats each
   * session's cap as a full `usdLimit` because session-runner owns the
   * per-session envelope.
   */
  readonly perStage: boolean;
}

/**
 * Information surfaced to the caller when a stage pauses at a
 * recognized `AWAIT_USER_GATE` marker. `stdoutTail` is bounded by
 * `session-runner`'s transcript capture — typically the last few KiB.
 */
export interface HumanGateInfo {
  readonly stage: Stage;
  readonly gateName: string;
  readonly stdoutTail: string;
}

/**
 * Caller's decision after inspecting a `HumanGateInfo`. `resume`
 * re-invokes the same stage with the optional `payload` appended to
 * the prompt (so the caller can inject a directive like "approve and
 * proceed"). `stop` halts the pipeline with `status: awaiting-gate`.
 */
export interface HumanGateDecision {
  readonly decision: 'resume' | 'stop';
  readonly payload?: string;
}

/**
 * Per-stage agent-frontmatter override. Maps a stage to an
 * `agents/<name>.md` path whose YAML `tools:` field overrides the
 * stage's default tool scope. See tool-scoping (Plan 21-03).
 */
export type AgentsByStage = Readonly<Partial<Record<Stage, string>>>;

/**
 * Per-stage prompt + system-prompt maps. `prompts` is required for every
 * stage in the run order; missing keys throw a `ValidationError` at
 * driver entry. `systemPrompts` are optional.
 */
export interface PipelineConfig {
  /** Stages to run, defaulting to the full 5. */
  readonly stages?: readonly Stage[];
  /** Stages to skip (subset of stages). */
  readonly skipStages?: readonly Stage[];
  /** Resume from this stage (earlier stages are no-ops). */
  readonly resumeFrom?: Stage;
  /** Stop after completing this stage. */
  readonly stopAfter?: Stage;
  /** Per-stage prompt templates. Keys: stage name. Value: prompt body. */
  readonly prompts: Readonly<Record<Stage, string>>;
  /** Per-stage system prompts (optional). */
  readonly systemPrompts?: Readonly<Partial<Record<Stage, string>>>;
  /** Budget applied to every stage's session. */
  readonly budget: BudgetCap;
  /** Turn cap applied to every stage's session. */
  readonly maxTurnsPerStage: number;
  /** Max stage-level retry attempts. Must be 0 or 1; default 1. */
  readonly stageRetries?: 0 | 1;
  /** Callback invoked when a stage hits a human-verify gate. */
  readonly onHumanGate?: (info: HumanGateInfo) => Promise<HumanGateDecision>;
  /** Per-stage agent-frontmatter override map. */
  readonly agentsByStage?: AgentsByStage;
  /** Working directory (repo root); defaults to process.cwd(). */
  readonly cwd?: string;
}

/**
 * Per-stage outcome inside a `PipelineResult`. The `session` field is
 * absent when the stage was skipped (never entered session-runner).
 *
 * `retries` is the number of stage-level re-invocations actually
 * performed. `0` means the first attempt completed (or failed
 * non-retryably); `1` means the first attempt failed with a retryable
 * error and the second attempt terminated the stage.
 */
export interface StageOutcome {
  readonly stage: Stage;
  readonly status: StageStatus;
  /** SessionResult from the stage's run (absent if skipped). */
  readonly session?: import('../session-runner/types.ts').SessionResult;
  /** Blockers if `status === 'halted-gate-veto'`. */
  readonly blockers?: readonly string[];
  /** ISO timestamp when the stage started; absent if skipped. */
  readonly started_at?: string;
  /** ISO timestamp when the stage ended; absent if skipped. */
  readonly ended_at?: string;
  /** Number of stage-level retry attempts actually performed. */
  readonly retries: number;
  /** Human-gate info when `status === 'halted-human-gate'`. */
  readonly gate?: HumanGateInfo;
}

/**
 * Final, terminal shape returned by `run()`. Includes per-stage
 * outcomes, aggregate usage, and the stage where execution halted
 * (if any).
 */
export interface PipelineResult {
  readonly status: PipelineStatus;
  readonly cycle_start: string;
  readonly cycle_end: string;
  readonly outcomes: readonly StageOutcome[];
  /** Aggregate usage across all attempted stages. */
  readonly total_usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly usd_cost: number;
  };
  /** Stage at which the pipeline halted (if any). */
  readonly halted_at?: Stage;
  /** Human-gate pause info when `status === 'awaiting-gate'`. */
  readonly gate?: HumanGateInfo;
}
