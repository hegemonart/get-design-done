// scripts/lib/discuss-parallel-runner/types.ts — Plan 21-07 (SDK-19).
//
// Public type surface for the parallel discussion runner. The runner
// spawns N design-discussant variants (each a different persona / angle
// — user-journey, technical-constraint, brand-fit, accessibility)
// concurrently via `session-runner`, collects each discussant's open
// questions and concerns as a structured `DiscussionContribution`, and
// runs an aggregator pass that deduplicates, clusters by theme, and
// surfaces a single ranked question list for the user.
//
// Consumers: the `discuss` skill (standalone leaf) and the `gdd-sdk
// discuss` CLI subcommand (Plan 21-09).
//
// Design invariants (see PLAN.md Context):
//   * Discussant sessions are independent — none write to shared files;
//     parallelism is always safe.
//   * The aggregator runs AFTER all discussants complete.
//   * Error isolation: one discussant's failure never cascades into
//     other discussant sessions.
//   * `AggregatedQuestion.key` is SHA-256-based (stable across runs)
//     per the aggregator prompt contract.

import type {
  BudgetCap,
  SessionResult,
  SessionRunnerOptions,
} from '../session-runner/types.ts';

/**
 * Named discussant variants. The default roster is the four values in
 * the union below, but callers can pass any string (arbitrary custom
 * discussant).
 */
export type DiscussantName =
  | 'user-journey'
  | 'technical-constraint'
  | 'brand-fit'
  | 'accessibility'
  | string;

/** Severity ordering is blocker > major > minor > nice-to-have. */
export type Severity = 'blocker' | 'major' | 'minor' | 'nice-to-have';

/**
 * One discussant specification. The runner passes `prompt` verbatim
 * through `session-runner.run()` as the prompt body.
 *
 * `agentPath` is optional; when absent, the runner defaults to the
 * stage scope from tool-scoping (`discuss` maps to `custom` — see
 * Plan 21-03). When present, the runner reads the agent markdown's
 * `tools:` frontmatter via `parseAgentToolsByName` and passes the
 * resolved list as `allowedTools`.
 */
export interface DiscussantSpec {
  name: DiscussantName;
  /** Optional agent frontmatter path; missing → stage scope from tool-scoping. */
  agentPath?: string;
  /** Per-discussant prompt body. */
  prompt: string;
}

/**
 * One parsed item from a discussant's DISCUSSION COMPLETE block.
 *
 * `kind` discriminates questions (things the discussant wants
 * answered) from concerns (things they want to flag).
 *
 * `tag` captures the per-item annotation from the discussant output
 * (`Concern: <stakeholder>` for questions, `Area: <scope>` for
 * concerns). Optional because lenient parse allows missing.
 */
export interface DiscussionItem {
  kind: 'question' | 'concern';
  text: string;
  /** Area / angle / concern tag per discussant output. */
  tag?: string;
  severity: Severity;
  rationale?: string;
}

/**
 * One discussant's complete contribution. `items` is empty when the
 * session errored or the block was missing/malformed.
 *
 * `status`:
 *   * `completed`    — session ended cleanly AND a DISCUSSION COMPLETE
 *                      block was parsed successfully.
 *   * `parse-error`  — session ended cleanly but the block was absent
 *                      or malformed (items: []).
 *   * `error`        — session failed (budget, turn cap, aborted, error);
 *                      `error` populated; items: [].
 */
export interface DiscussionContribution {
  discussant: DiscussantName;
  items: readonly DiscussionItem[];
  /** Raw final_text captured for audit / aggregator input. */
  raw: string;
  usage: { input_tokens: number; output_tokens: number; usd_cost: number };
  status: 'completed' | 'error' | 'parse-error';
  error?: { code: string; message: string };
}

/**
 * One aggregated (post-dedup, post-cluster) question.
 *
 *   * `key`      — SHA-256 of the normalized question text (lowercase,
 *                  whitespace-collapsed) truncated to 8 hex chars.
 *                  Stable across runs.
 *   * `raised_by` — discussants that raised (a semantic variant of)
 *                   this question.
 *   * `theme`    — cluster/theme name from aggregator.
 *   * `rank`     — 0-indexed priority (0 = highest). Ranking combines
 *                  severity + frequency per the aggregator prompt.
 */
export interface AggregatedQuestion {
  /** Stable key across runs (hash of normalized question text). */
  key: string;
  text: string;
  severity: Severity;
  /** Discussants that raised this question. */
  raised_by: readonly DiscussantName[];
  /** Cluster/theme assignment from aggregator. */
  theme: string;
  /** Aggregator-assigned rank (0 = highest priority). */
  rank: number;
}

/**
 * The aggregator's final output. `output_path` is the Markdown file
 * written to disk (`.design/DISCUSSION.md` by default). `usage` is
 * the aggregator session's token/cost spend — separate from the
 * per-discussant usage aggregated in `DiscussRunnerResult.total_usage`.
 */
export interface AggregatedDiscussion {
  themes: readonly { name: string; summary: string }[];
  questions: readonly AggregatedQuestion[];
  /** Output path. */
  output_path: string;
  /** Aggregator session usage. */
  usage: { input_tokens: number; output_tokens: number; usd_cost: number };
}

/**
 * Options for `run()` — the top-level orchestrator entry point.
 *
 *   * `discussants` — omit to use `DEFAULT_DISCUSSANTS` (4 variants).
 *   * `budget` + `maxTurnsPerDiscussant` — applied per-discussant.
 *   * `aggregatorBudget` + `aggregatorMaxTurns` — applied to the
 *     aggregator session specifically.
 *   * `concurrency` — defaults to 4 (matches the default roster size).
 *   * `runOverride` — test injection for `session-runner.run()`. All
 *     discussants AND the aggregator receive the SAME override so one
 *     mock controls the entire run.
 *   * `aggregatorPrompt` — replace the default aggregator prompt
 *     (advanced / debug use).
 */
export interface DiscussRunnerOptions {
  /** Discussants to run. Default: the 4-variant roster. */
  discussants?: readonly DiscussantSpec[];
  budget: BudgetCap;
  maxTurnsPerDiscussant: number;
  aggregatorBudget: BudgetCap;
  aggregatorMaxTurns: number;
  concurrency?: number;
  runOverride?: (opts: SessionRunnerOptions) => Promise<SessionResult>;
  cwd?: string;
  /** Custom aggregator prompt override. */
  aggregatorPrompt?: string;
}

/**
 * The final return value from `run()`.
 *
 *   * `contributions` — one per discussant, in input spec order (NOT
 *     completion order). Failed discussants are included with
 *     `status !== 'completed'`.
 *   * `aggregated` — the aggregator's parsed output.
 *   * `total_usage` — sum of per-discussant + aggregator usage.
 */
export interface DiscussRunnerResult {
  contributions: readonly DiscussionContribution[];
  aggregated: AggregatedDiscussion;
  total_usage: { input_tokens: number; output_tokens: number; usd_cost: number };
}
