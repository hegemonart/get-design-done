// scripts/lib/pipeline-runner/index.ts — Plan 21-05 Task 5 (SDK-17).
//
// The public surface of the pipeline runner. Re-exports every type
// and helper callers need, plus the `run()` driver.
//
// `run(config)` orchestrates the 5-stage design pipeline end to end:
//
//   1. Resolve the stage order from config (stages / resumeFrom /
//      stopAfter / skipStages).
//   2. For each stage in order:
//        a. Ask the gdd-state transition gate whether we may advance.
//           On veto, halt with `halted-gate-veto` and surface blockers.
//        b. Emit `stage.entered`.
//        c. Invoke the stage via `invokeStage` (retry-once inside).
//        d. Accumulate usage; push outcome.
//        e. On `halted-human-gate` → dispatch the callback. `resume`
//           re-invokes the stage with an optional payload suffix;
//           `stop` halts pipeline with `awaiting-gate`.
//        f. On any other `halted-*` → halt pipeline with `halted`.
//        g. On `stage === config.stopAfter` → halt with `stopped-after`.
//        h. Emit `stage.exited` (outcome mirrors stage status).
//   3. Emit `pipeline.started` at entry + `pipeline.completed` at exit.
//
// NEVER throws — every failure becomes a `PipelineResult`.

import { appendEvent } from '../event-stream/index.ts';
import type { BaseEvent } from '../event-stream/index.ts';
import { getLogger } from '../logger/index.ts';
import { transition as defaultTransition, TransitionGateFailed } from '../gdd-state/index.ts';
import { ValidationError } from '../gdd-errors/index.ts';

import {
  STAGE_ORDER,
  nextStage,
  resolveStageOrder,
  stageIndex,
} from './state-machine.ts';
import { invokeStage, type InvokeStageOverrides } from './stage-handlers.ts';
import { dispatchHumanGate, extractGateMarker } from './human-gate.ts';
import type {
  HumanGateInfo,
  PipelineConfig,
  PipelineResult,
  PipelineStatus,
  Stage,
  StageOutcome,
  StageStatus,
} from './types.ts';

// ---------------------------------------------------------------------------
// Re-exports.
// ---------------------------------------------------------------------------

export type {
  AgentsByStage,
  BudgetCap,
  HumanGateDecision,
  HumanGateInfo,
  PipelineConfig,
  PipelineResult,
  PipelineStatus,
  Stage,
  StageOutcome,
  StageStatus,
} from './types.ts';
export {
  STAGE_ORDER,
  nextStage,
  stageIndex,
  resolveStageOrder,
} from './state-machine.ts';
export type { InvokeStageArgs, InvokeStageOverrides } from './stage-handlers.ts';
export { invokeStage } from './stage-handlers.ts';
export { dispatchHumanGate, extractGateMarker } from './human-gate.ts';

// ---------------------------------------------------------------------------
// Driver — `run()`.
// ---------------------------------------------------------------------------

/**
 * Result of the transition gate check for a single stage. `ok: false`
 * surfaces blockers that the `halted-gate-veto` outcome carries.
 */
export interface TransitionResult {
  readonly ok: boolean;
  readonly blockers?: readonly string[];
}

/**
 * Test + integration overrides for `run()`. Omitted fields fall back
 * to the real implementations (session-runner, context-engine,
 * tool-scoping, gdd-state transition).
 */
export interface RunOverrides extends InvokeStageOverrides {
  /**
   * Override the gdd-state transition gate. Defaults to a shim that
   * invokes `gdd-state.transition(path, to)`. In test mode, returns
   * `{ ok: true }` or `{ ok: false, blockers }`.
   */
  readonly transitionStageOverride?: (to: Stage) => Promise<TransitionResult>;
  /**
   * Override the state file path used by the default transition shim.
   * Defaults to `.design/STATE.md` resolved against `config.cwd`.
   */
  readonly statePathOverride?: string;
}

/**
 * Default transition-stage shim. Calls `gdd-state.transition(path, to)`
 * against the working directory's `.design/STATE.md`. Maps
 * `TransitionGateFailed` to `{ok: false, blockers}`; propagates other
 * errors as `{ok: false, blockers: [message]}` so the pipeline never
 * crashes on state-file hiccups.
 *
 * Wave C (Plan 21-09) may replace this with a direct MCP tool handler
 * import. Until then, the shim calls the module directly.
 */
async function defaultTransitionShim(
  to: Stage,
  statePath: string,
): Promise<TransitionResult> {
  try {
    await defaultTransition(statePath, to);
    return { ok: true };
  } catch (err) {
    if (err instanceof TransitionGateFailed) {
      return { ok: false, blockers: err.blockers };
    }
    // Any other error (lock contention, parse error, etc.) — surface
    // its message as a single blocker so the pipeline can halt
    // gracefully with `halted-gate-veto`.
    const msg: string =
      err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      blockers: Object.freeze([`transition failed: ${msg}`]),
    };
  }
}

/**
 * Resolve the state-path used by the default transition shim.
 */
function defaultStatePath(cwd: string | undefined, override: string | undefined): string {
  if (override !== undefined) return override;
  const root = cwd ?? process.cwd();
  // .design/STATE.md is the canonical Phase-20 location.
  const sep = root.endsWith('/') || root.endsWith('\\') ? '' : '/';
  return `${root}${sep}.design/STATE.md`;
}

/**
 * Validate `config` shape before entering the driver loop. Catches
 * missing required fields early so the first stage's run doesn't
 * proceed on a malformed config.
 */
function validateConfig(config: PipelineConfig, order: readonly Stage[]): void {
  if (
    config.prompts === null ||
    config.prompts === undefined ||
    typeof config.prompts !== 'object'
  ) {
    throw new ValidationError(
      'PipelineConfig.prompts is required',
      'MISSING_PROMPTS',
    );
  }
  for (const s of order) {
    const p: string | undefined = config.prompts[s];
    if (p === undefined || p === null) {
      throw new ValidationError(
        `PipelineConfig.prompts["${s}"] is required (stage is in run order)`,
        'MISSING_STAGE_PROMPT',
        { stage: s, order: [...order] },
      );
    }
  }
  if (!Number.isFinite(config.maxTurnsPerStage) || config.maxTurnsPerStage < 0) {
    throw new ValidationError(
      'PipelineConfig.maxTurnsPerStage must be a non-negative finite number',
      'INVALID_MAX_TURNS',
      { value: config.maxTurnsPerStage },
    );
  }
  const retries = config.stageRetries ?? 1;
  if (retries !== 0 && retries !== 1) {
    throw new ValidationError(
      'PipelineConfig.stageRetries must be 0 or 1',
      'INVALID_STAGE_RETRIES',
      { value: retries },
    );
  }
}

/**
 * Emit a pipeline-level event. Mirrors the session-runner's emit shim —
 * persist-first, broadcast-second, silent on subscriber errors.
 */
function emitPipelineEvent(
  type: string,
  payload: Record<string, unknown>,
  stage?: Stage,
): void {
  const ev: BaseEvent = {
    type,
    timestamp: new Date().toISOString(),
    sessionId: `gdd-pipeline-${process.pid}`,
    payload,
  };
  if (stage !== undefined) ev.stage = stage;
  try {
    appendEvent(ev);
  } catch {
    // Subscriber errors are swallowed per event-stream contract.
  }
}

/**
 * Accumulate `session.usage` onto the running total. Missing sessions
 * (skipped stages) contribute zero.
 */
function foldUsage(
  total: { input_tokens: number; output_tokens: number; usd_cost: number },
  outcome: StageOutcome,
): void {
  const u = outcome.session?.usage;
  if (u === undefined) return;
  total.input_tokens += u.input_tokens;
  total.output_tokens += u.output_tokens;
  total.usd_cost += u.usd_cost;
}

/**
 * Drive the full or partial pipeline. Returns once a terminal state is
 * reached: `completed`, `halted`, `stopped-after`, or `awaiting-gate`.
 *
 * Never throws — all failures land on `PipelineResult`.
 */
export async function run(
  config: PipelineConfig,
  overrides: RunOverrides = {},
): Promise<PipelineResult> {
  const cycle_start: string = new Date().toISOString();
  const total: { input_tokens: number; output_tokens: number; usd_cost: number } = {
    input_tokens: 0,
    output_tokens: 0,
    usd_cost: 0,
  };
  const outcomes: StageOutcome[] = [];
  let pipelineStatus: PipelineStatus = 'completed';
  let halted_at: Stage | undefined;
  let finalGate: HumanGateInfo | undefined;

  // 1. Resolve the stage order (may throw on invalid config).
  let order: readonly Stage[];
  try {
    order = resolveStageOrder({
      ...(config.stages !== undefined ? { stages: config.stages } : {}),
      ...(config.skipStages !== undefined ? { skipStages: config.skipStages } : {}),
      ...(config.resumeFrom !== undefined ? { resumeFrom: config.resumeFrom } : {}),
      ...(config.stopAfter !== undefined ? { stopAfter: config.stopAfter } : {}),
    });
    validateConfig(config, order);
  } catch (err) {
    // Convert to a halted pipeline with no outcomes — driver's
    // no-throw contract.
    try {
      getLogger().error('pipeline.invalid_config', {
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Ignore logger failures.
    }
    const cycle_end = new Date().toISOString();
    return {
      status: 'halted',
      cycle_start,
      cycle_end,
      outcomes: [],
      total_usage: { ...total },
    };
  }

  // 2. Emit pipeline.started.
  emitPipelineEvent('pipeline.started', {
    stages: [...order],
    budget: { ...config.budget },
    maxTurnsPerStage: config.maxTurnsPerStage,
  });
  try {
    getLogger().info('pipeline.started', {
      stages: [...order],
      stageRetries: config.stageRetries ?? 1,
    });
  } catch {
    // Ignore logger failures.
  }

  const transitionImpl =
    overrides.transitionStageOverride ??
    ((to: Stage) =>
      defaultTransitionShim(to, defaultStatePath(config.cwd, overrides.statePathOverride)));

  // 3. Drive the stage loop.
  stageLoop: for (const stage of order) {
    // 3a. Transition gate.
    let gate: TransitionResult;
    try {
      gate = await transitionImpl(stage);
    } catch (err) {
      // The override contract says "return, never throw"; if it does
      // throw, treat it as an implicit veto with the message as the
      // blocker.
      const msg: string = err instanceof Error ? err.message : String(err);
      gate = { ok: false, blockers: Object.freeze([msg]) };
    }
    if (!gate.ok) {
      const blockers: readonly string[] = gate.blockers ?? [];
      const outcome: StageOutcome = {
        stage,
        status: 'halted-gate-veto',
        blockers,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        retries: 0,
      };
      outcomes.push(outcome);
      pipelineStatus = 'halted';
      halted_at = stage;
      emitPipelineEvent('stage.entered', { stage }, stage);
      emitPipelineEvent(
        'stage.exited',
        {
          stage,
          duration_ms: 0,
          outcome: 'halted',
        },
        stage,
      );
      try {
        getLogger().warn('pipeline.halted', {
          stage,
          reason: 'gate-veto',
          blockers: [...blockers],
        });
      } catch {
        // Ignore logger failures.
      }
      break stageLoop;
    }

    // 3b. Emit stage.entered.
    emitPipelineEvent('stage.entered', { stage }, stage);

    // 3c. Run the stage.
    let outcome: StageOutcome = await invokeStage({
      stage,
      config,
      retries: config.stageRetries ?? 1,
      ...(overrides.runOverride !== undefined ? { runOverride: overrides.runOverride } : {}),
      ...(overrides.bundleOverride !== undefined
        ? { bundleOverride: overrides.bundleOverride }
        : {}),
      ...(overrides.scopeOverride !== undefined
        ? { scopeOverride: overrides.scopeOverride }
        : {}),
    });

    // 3d. Human-gate resolution.
    if (outcome.status === 'halted-human-gate') {
      const gateInfo: HumanGateInfo = buildGateInfo(stage, outcome);
      const decision = await dispatchHumanGate(gateInfo, config);
      if (decision.decision === 'resume') {
        // Re-invoke with the payload suffix — replaces the first outcome.
        const resumed: StageOutcome = await invokeStage({
          stage,
          config,
          retries: config.stageRetries ?? 1,
          ...(decision.payload !== undefined ? { _promptSuffix: decision.payload } : {}),
          ...(overrides.runOverride !== undefined ? { runOverride: overrides.runOverride } : {}),
          ...(overrides.bundleOverride !== undefined
            ? { bundleOverride: overrides.bundleOverride }
            : {}),
          ...(overrides.scopeOverride !== undefined
            ? { scopeOverride: overrides.scopeOverride }
            : {}),
        });
        outcome = resumed;
      } else {
        // Stop — record outcome, halt pipeline with awaiting-gate.
        outcomes.push(outcome);
        foldUsage(total, outcome);
        pipelineStatus = 'awaiting-gate';
        finalGate = gateInfo;
        emitPipelineEvent(
          'stage.exited',
          {
            stage,
            duration_ms: durationMs(outcome),
            outcome: 'halted',
          },
          stage,
        );
        try {
          getLogger().info('pipeline.awaiting_gate', {
            stage,
            gateName: gateInfo.gateName,
          });
        } catch {
          // Ignore logger failures.
        }
        break stageLoop;
      }
    }

    // 3e. Accumulate + record.
    outcomes.push(outcome);
    foldUsage(total, outcome);

    // 3f. Emit stage.exited.
    emitPipelineEvent(
      'stage.exited',
      {
        stage,
        duration_ms: durationMs(outcome),
        outcome: mapOutcomeLabel(outcome.status),
      },
      stage,
    );

    // 3g. Non-gate halt?
    if (isHaltingStatus(outcome.status)) {
      pipelineStatus = 'halted';
      halted_at = stage;
      try {
        getLogger().warn('pipeline.halted', {
          stage,
          status: outcome.status,
        });
      } catch {
        // Ignore logger failures.
      }
      break stageLoop;
    }

    // 3h. stopAfter boundary?
    if (config.stopAfter !== undefined && stage === config.stopAfter) {
      pipelineStatus = 'stopped-after';
      break stageLoop;
    }
  }

  const cycle_end: string = new Date().toISOString();

  const result: PipelineResult = {
    status: pipelineStatus,
    cycle_start,
    cycle_end,
    outcomes: Object.freeze([...outcomes]),
    total_usage: { ...total },
    ...(halted_at !== undefined ? { halted_at } : {}),
    ...(finalGate !== undefined ? { gate: finalGate } : {}),
  };

  emitPipelineEvent('pipeline.completed', {
    status: result.status,
    outcomes_count: outcomes.length,
    total_usage: { ...total },
    ...(halted_at !== undefined ? { halted_at } : {}),
  });
  try {
    getLogger().info('pipeline.completed', {
      status: result.status,
      outcomes_count: outcomes.length,
      total_cost_usd: total.usd_cost,
      ...(halted_at !== undefined ? { halted_at } : {}),
    });
  } catch {
    // Ignore logger failures.
  }

  return result;
}

/**
 * Build a HumanGateInfo from a stage outcome whose status is
 * `halted-human-gate`. Falls back to re-extracting the gate marker
 * from `session.final_text` if `outcome.gate` is missing (defensive).
 */
function buildGateInfo(stage: Stage, outcome: StageOutcome): HumanGateInfo {
  if (outcome.gate !== undefined) return outcome.gate;
  const finalText: string = outcome.session?.final_text ?? '';
  const marker = extractGateMarker(finalText);
  return {
    stage,
    gateName: marker?.name ?? 'unnamed',
    stdoutTail: finalText,
  };
}

/** Elapsed wall-clock ms between `started_at` and `ended_at`. */
function durationMs(outcome: StageOutcome): number {
  if (outcome.started_at === undefined || outcome.ended_at === undefined) {
    return 0;
  }
  const s = Date.parse(outcome.started_at);
  const e = Date.parse(outcome.ended_at);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, e - s);
}

/** Map a stage status into the event-stream `StageExitedEvent` outcome label. */
function mapOutcomeLabel(status: StageStatus): 'pass' | 'fail' | 'halted' {
  if (status === 'completed') return 'pass';
  if (status === 'skipped') return 'pass';
  return 'halted';
}

/** True when `status` is a terminal halt (non-human-gate, non-completed). */
function isHaltingStatus(status: StageStatus): boolean {
  return (
    status === 'halted-gate-veto' ||
    status === 'halted-budget' ||
    status === 'halted-turn-cap' ||
    status === 'halted-error'
  );
}
