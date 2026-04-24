// scripts/lib/pipeline-runner/stage-handlers.ts — Plan 21-05 Task 3.
//
// Invokes a single pipeline stage. Wires together:
//   * context-engine  → builds the per-stage file bundle + renders it
//   * tool-scoping    → enforces the allowed-tools set
//   * session-runner  → runs the headless Agent SDK session
//
// Stage-level retry-once is implemented here via recursion on a
// `retries` budget. Test harnesses inject mocks via the override args.
//
// Mapping from `SessionResult.status` → `StageOutcome.status`:
//   completed           → completed (OR halted-human-gate if AWAIT_USER_GATE)
//   budget_exceeded     → halted-budget
//   turn_cap_exceeded   → halted-turn-cap
//   aborted             → halted-error (external cancel)
//   error + retryable   → recurse with retries - 1
//   error otherwise     → halted-error

import type { Stage, PipelineConfig, StageOutcome, HumanGateInfo } from './types.ts';
import type {
  SessionResult,
  SessionRunnerOptions,
} from '../session-runner/types.ts';
import type { ContextBundle, Stage as ContextStage } from '../context-engine/types.ts';
import {
  buildContextBundle as defaultBuildBundle,
  renderBundle,
} from '../context-engine/index.ts';
import {
  enforceScope,
  parseAgentToolsByName,
  type Stage as ScopeStage,
} from '../tool-scoping/index.ts';
import { run as defaultRun } from '../session-runner/index.ts';
import { extractGateMarker } from './human-gate.ts';

/**
 * Test-injection overrides for `invokeStage`. Every override is
 * optional; omitted overrides fall through to the real module.
 */
export interface InvokeStageOverrides {
  /** Override session-runner.run — defaults to the real `run`. */
  readonly runOverride?: (opts: SessionRunnerOptions) => Promise<SessionResult>;
  /** Override context-engine.buildContextBundle — defaults to the real builder. */
  readonly bundleOverride?: (stage: Stage, cwd?: string) => ContextBundle;
  /**
   * Override tool-scoping.enforceScope — defaults to real enforcement.
   * Returns the final `allowedTools` list.
   */
  readonly scopeOverride?: (stage: Stage, agentPath?: string) => readonly string[];
}

export interface InvokeStageArgs extends InvokeStageOverrides {
  readonly stage: Stage;
  readonly config: PipelineConfig;
  /** Remaining retry budget (0 or 1). */
  readonly retries: 0 | 1;
  /** Attempts already consumed (test hook; default 0). */
  readonly _retriesConsumed?: number;
  /**
   * Optional prompt suffix to append (used by the driver to inject
   * human-gate resume payloads into a retry).
   */
  readonly _promptSuffix?: string;
}

/**
 * Build the sanitized context prompt by rendering the context-engine
 * bundle and appending the stage's configured prompt.
 */
function buildStagePrompt(args: {
  stage: Stage;
  config: PipelineConfig;
  bundle: ContextBundle;
  promptSuffix?: string;
}): string {
  const rendered: string = renderBundle(args.bundle);
  const stagePrompt: string = args.config.prompts[args.stage];
  const parts: string[] = [rendered, '\n\n---\n\n', stagePrompt];
  if (args.promptSuffix !== undefined && args.promptSuffix !== '') {
    parts.push('\n\n---\n\n', args.promptSuffix);
  }
  return parts.join('');
}

/**
 * Map a session-runner `SessionResult` onto the stage-level status.
 * Human-gate detection runs on `final_text` only when the session
 * itself completed cleanly — a failed session cannot also be gated.
 */
function mapSessionStatus(
  session: SessionResult,
): { status: StageOutcome['status']; gate?: { name: string; stdoutTail: string } } {
  switch (session.status) {
    case 'completed': {
      const marker = extractGateMarker(session.final_text ?? '');
      if (marker !== null) {
        return {
          status: 'halted-human-gate',
          gate: {
            name: marker.name,
            stdoutTail: session.final_text ?? '',
          },
        };
      }
      return { status: 'completed' };
    }
    case 'budget_exceeded':
      return { status: 'halted-budget' };
    case 'turn_cap_exceeded':
      return { status: 'halted-turn-cap' };
    case 'aborted':
      return { status: 'halted-error' };
    case 'error':
    default:
      return { status: 'halted-error' };
  }
}

/**
 * Determine whether the stage-level retry budget permits a second
 * attempt. Session-runner owns its own transport-level retry; the
 * STAGE retry fires only when the session returns `status: 'error'`
 * AND the mapped SDK error is `retryable`.
 */
function isRetryableStageError(session: SessionResult): boolean {
  if (session.status !== 'error') return false;
  if (session.error === undefined) return false;
  // session-runner's `mapSdkError` already stamped the GDDError kind
  // into session.error.kind. StateConflictError maps to retryable
  // (rate-limited, overloaded, network-transient). OperationFailedError
  // may or may not be retryable; we gate on the error code.
  const kind = session.error.kind;
  if (kind === 'state_conflict') return true;
  // For operation_failed we consult the code explicitly — NETWORK_TRANSIENT
  // and API_ERROR are retryable, everything else isn't.
  if (kind === 'operation_failed') {
    const code = session.error.code;
    return code === 'NETWORK_TRANSIENT' || code === 'API_ERROR';
  }
  return false;
}

/**
 * Cast the pipeline `Stage` into the context-engine's `Stage` union
 * (which includes `init`). The pipeline stages are a strict subset of
 * the context-engine's stages, so this cast is safe.
 */
function toContextStage(stage: Stage): ContextStage {
  return stage as ContextStage;
}

/**
 * Cast the pipeline `Stage` into the tool-scoping `Stage` union
 * (which also includes `init` + `custom`).
 */
function toScopeStage(stage: Stage): ScopeStage {
  return stage as ScopeStage;
}

/**
 * Invoke one pipeline stage. Returns a StageOutcome describing what
 * happened, including timing + retry count.
 *
 * Never throws — all failure modes surface via `outcome.status` plus
 * (when relevant) `outcome.session.error`.
 */
export async function invokeStage(args: InvokeStageArgs): Promise<StageOutcome> {
  const started_at: string = new Date().toISOString();
  const retriesConsumed: number = args._retriesConsumed ?? 0;

  // -- 1. Build the context bundle for this stage. ------------------------
  let bundle: ContextBundle;
  try {
    if (args.bundleOverride !== undefined) {
      bundle = args.bundleOverride(args.stage, args.config.cwd);
    } else {
      bundle = defaultBuildBundle(toContextStage(args.stage), {
        ...(args.config.cwd !== undefined ? { cwd: args.config.cwd } : {}),
      });
    }
  } catch (err) {
    return {
      stage: args.stage,
      status: 'halted-error',
      started_at,
      ended_at: new Date().toISOString(),
      retries: retriesConsumed,
      session: makeErrorSession(err, 'bundle_build_failed'),
    };
  }

  // -- 2. Resolve the agent frontmatter override + tool scope. ------------
  let allowedTools: readonly string[];
  try {
    if (args.scopeOverride !== undefined) {
      const agentPath = args.config.agentsByStage?.[args.stage];
      if (agentPath !== undefined) {
        allowedTools = args.scopeOverride(args.stage, agentPath);
      } else {
        allowedTools = args.scopeOverride(args.stage);
      }
    } else {
      const agentPath = args.config.agentsByStage?.[args.stage];
      const agentTools: readonly string[] | null =
        agentPath !== undefined ? parseAgentToolsByName(agentPath) : null;
      allowedTools = enforceScope({
        stage: toScopeStage(args.stage),
        ...(agentTools !== null ? { agentTools } : {}),
      });
    }
  } catch (err) {
    return {
      stage: args.stage,
      status: 'halted-error',
      started_at,
      ended_at: new Date().toISOString(),
      retries: retriesConsumed,
      session: makeErrorSession(err, 'scope_resolution_failed'),
    };
  }

  // -- 3. Compose the session-runner options. -----------------------------
  const prompt: string = buildStagePrompt({
    stage: args.stage,
    config: args.config,
    bundle,
    ...(args._promptSuffix !== undefined ? { promptSuffix: args._promptSuffix } : {}),
  });

  const systemPrompt: string | undefined = args.config.systemPrompts?.[args.stage];

  const runOpts: SessionRunnerOptions = {
    prompt,
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    allowedTools: [...allowedTools],
    budget: {
      usdLimit: args.config.budget.usdLimit,
      inputTokensLimit: args.config.budget.inputTokensLimit,
      outputTokensLimit: args.config.budget.outputTokensLimit,
    },
    turnCap: { maxTurns: args.config.maxTurnsPerStage },
    stage: toScopeStage(args.stage),
  };

  // -- 4. Invoke session-runner (or the override). ------------------------
  const runImpl = args.runOverride ?? defaultRun;
  let session: SessionResult;
  try {
    session = await runImpl(runOpts);
  } catch (err) {
    // session-runner contracts never to throw. If the override throws,
    // we still surface a halted-error outcome with a synthetic session.
    return {
      stage: args.stage,
      status: 'halted-error',
      started_at,
      ended_at: new Date().toISOString(),
      retries: retriesConsumed,
      session: makeErrorSession(err, 'session_run_threw'),
    };
  }

  // -- 5. Map session status → stage status. ------------------------------
  const mapped = mapSessionStatus(session);

  // -- 6. Stage-level retry-once on retryable error. ----------------------
  if (
    mapped.status === 'halted-error' &&
    args.retries > 0 &&
    isRetryableStageError(session)
  ) {
    // Recurse with retries exhausted (0). The retry must reuse the
    // same config + overrides so the test harness can observe it.
    const nextArgs: InvokeStageArgs = {
      stage: args.stage,
      config: args.config,
      retries: 0,
      _retriesConsumed: retriesConsumed + 1,
      ...(args._promptSuffix !== undefined ? { _promptSuffix: args._promptSuffix } : {}),
      ...(args.runOverride !== undefined ? { runOverride: args.runOverride } : {}),
      ...(args.bundleOverride !== undefined ? { bundleOverride: args.bundleOverride } : {}),
      ...(args.scopeOverride !== undefined ? { scopeOverride: args.scopeOverride } : {}),
    };
    return invokeStage(nextArgs);
  }

  const ended_at: string = new Date().toISOString();

  const gateInfo: HumanGateInfo | undefined =
    mapped.status === 'halted-human-gate' && mapped.gate !== undefined
      ? {
          stage: args.stage,
          gateName: mapped.gate.name,
          stdoutTail: mapped.gate.stdoutTail,
        }
      : undefined;

  return {
    stage: args.stage,
    status: mapped.status,
    session,
    started_at,
    ended_at,
    retries: retriesConsumed,
    ...(gateInfo !== undefined ? { gate: gateInfo } : {}),
  };
}

/**
 * Build a synthetic `SessionResult` describing a failure that occurred
 * outside the session (bundle build, scope resolution, or a thrown
 * run override). The shape matches session-runner's `SessionResult` so
 * downstream code treats it uniformly.
 */
function makeErrorSession(err: unknown, code: string): SessionResult {
  const message: string =
    err === null || err === undefined
      ? 'unknown error'
      : err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'unknown error';
  return {
    status: 'error',
    transcript_path: '',
    turns: 0,
    usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
    tool_calls: [],
    sanitizer: { applied: [], removedSections: [] },
    error: {
      code,
      message,
      kind: 'operation_failed',
      context: {},
    },
  };
}
