// scripts/lib/session-runner/types.ts — public type surface for the
// Phase 21 headless Agent SDK wrapper (Plan 21-01, SDK-13).
//
// These types are consumed by every other Phase-21 runner (pipeline,
// explore, discuss, init). No other file in the repo should import
// `@anthropic-ai/claude-agent-sdk` directly — all session creation
// flows through `run(opts)` in `./index.ts`.
//
// Design notes:
//   * `BudgetCap` is a hard cap across the ENTIRE session, including
//     retries. Plan spec (Task 5): "budget.usdLimit caps TOTAL session
//     cost across retries, NOT per-attempt."
//   * `TurnCap.maxTurns` counts assistant turns (response cycles). A
//     tool_use + tool_result pair is part of the SAME turn.
//   * `stage` drives event payloads + transcript filenames. The union
//     mirrors `Stage` from `gdd-state/types.ts` plus `init` + `custom`.
//   * `queryOverride` / `sanitizeOverride` exist solely for tests; the
//     default behavior imports the real SDK + the real sanitizer.

/**
 * Hard caps on session cost. Any dimension exceeded aborts the session
 * mid-stream and surfaces status `budget_exceeded`. All three caps are
 * session-total, not per-attempt — retry usage accumulates against the
 * same envelope.
 */
export interface BudgetCap {
  /** Hard USD limit across the session (inbound + outbound). Aborts when exceeded. */
  usdLimit: number;
  /** Input-token hard cap. Aborts when exceeded. */
  inputTokensLimit: number;
  /** Output-token hard cap. Aborts when exceeded. */
  outputTokensLimit: number;
}

/**
 * Hard cap on the number of assistant response turns. A `tool_use` +
 * `tool_result` round-trip stays inside the same turn; the counter
 * increments only when `message.stop_reason` is observed on a message.
 */
export interface TurnCap {
  /** Maximum assistant turns (response cycles). Counts tool_use + tool_result as part of the same turn. */
  maxTurns: number;
}

/**
 * One shot at the Agent SDK. Callers that need retries or backoff should
 * rely on the built-in retry-once mechanism rather than wrapping this.
 *
 * Field-by-field:
 *   * `prompt` — raw skill body or operator message. MUST go through the
 *     prompt sanitizer before the SDK sees it; the wrapper does that
 *     automatically.
 *   * `systemPrompt` — forwarded verbatim to `query({options.systemPrompt})`.
 *   * `allowedTools` — forwarded verbatim; enforcement lives in Plan 21-03.
 *   * `budget` / `turnCap` — see types above.
 *   * `stage` — drives event payloads + transcript filename.
 *   * `transcriptDir` — override default `.design/sessions/`.
 *   * `signal` — external abort hook (user Ctrl+C, parent pipeline kill).
 *   * `maxRetries` — total attempts, not extra attempts. Default 2
 *     (first try + retry-once).
 *   * `queryOverride` / `sanitizeOverride` — test injection points.
 */
export interface SessionRunnerOptions {
  prompt: string;
  systemPrompt?: string;
  /** Allowed tool names (e.g., ["Read","Grep","Glob","Bash"]). Enforced by Plan 21-03. */
  allowedTools?: string[];
  budget: BudgetCap;
  turnCap: TurnCap;
  /** Per-stage identifier for event emission + transcript path. */
  stage: 'brief' | 'explore' | 'plan' | 'design' | 'verify' | 'init' | 'custom';
  /** Optional transcript directory; defaults to `.design/sessions/<ISO>-<stage>.jsonl`. */
  transcriptDir?: string;
  /** AbortController for external cancellation. */
  signal?: AbortSignal;
  /** Max retry attempts on retryable errors (default: 2, first try + retry-once). */
  maxRetries?: number;
  /** Override the SDK `query()` import (for tests). Default imports real SDK. */
  queryOverride?: (...args: unknown[]) => AsyncIterable<unknown>;
  /** Override the prompt sanitizer (for tests). Default calls prompt-sanitizer.sanitize(). */
  sanitizeOverride?: (raw: string) => {
    sanitized: string;
    applied: readonly string[];
    removedSections: readonly string[];
  };
}

/**
 * Terminal shape returned by `run()`. Union discriminant is `status`.
 *
 *   * `completed`          — session ended naturally (final `stop_reason`).
 *   * `budget_exceeded`    — any of usdLimit / inputTokensLimit / outputTokensLimit tripped.
 *   * `turn_cap_exceeded`  — maxTurns tripped.
 *   * `aborted`            — external `opts.signal` fired.
 *   * `error`              — unhandled / non-retryable / retries-exhausted.
 *
 * `run()` NEVER throws. Inspect `error` when `status !== 'completed'`.
 */
export interface SessionResult {
  status: 'completed' | 'budget_exceeded' | 'turn_cap_exceeded' | 'aborted' | 'error';
  transcript_path: string;
  turns: number;
  usage: { input_tokens: number; output_tokens: number; usd_cost: number };
  final_text?: string;
  tool_calls: Array<{ name: string; input: unknown; output?: unknown; error?: string }>;
  error?: { code: string; message: string; kind: string; context?: unknown };
  /** Prompt-sanitizer diagnostics (pattern names that fired; removed section headings). */
  sanitizer: { applied: readonly string[]; removedSections: readonly string[] };
}
