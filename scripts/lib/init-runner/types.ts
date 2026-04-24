// scripts/lib/init-runner/types.ts — public type surface for the
// `gdd-sdk init` runner (Plan 21-08, SDK-20).
//
// The init runner bootstraps a new project's `.design/` directory by
// spawning a fixed roster of 4 researchers in parallel through the
// session-runner (Plan 21-01) and then running a synthesizer pass that
// composes `.design/DESIGN-CONTEXT.md` from the researcher outputs.
//
// These types are consumed by:
//   * `researchers.ts`  — dispatch + outcome shape.
//   * `synthesizer.ts`  — synthesizer I/O contract.
//   * `scaffold.ts`     — STATE.md + backup helpers.
//   * `index.ts`        — top-level `run()` orchestrator.
//   * CLI wiring (Plan 21-09) — consumes `InitRunnerResult`.
//
// No file outside `scripts/lib/init-runner/` should construct any of
// these shapes directly; `index.ts` re-exports each one.

import type { BudgetCap, QueryOverride } from '../session-runner/types.ts';

/**
 * Locked roster of researcher names. The init cycle always spawns
 * exactly these four; adding a fifth is a breaking change because it
 * widens every `ResearcherOutcome[]` consumer's input.
 */
export type ResearcherName =
  | 'design-system-audit'
  | 'brand-context'
  | 'accessibility-baseline'
  | 'competitive-references';

/**
 * One researcher's spec. The `agentPath` is optional — if the file is
 * absent on disk, the runner falls back to the `init` stage scope from
 * `tool-scoping` (Plan 21-03), which grants the broad research-capable
 * toolset (Read, Write, Grep, Glob, Bash, Task, WebSearch, WebFetch).
 */
export interface ResearcherSpec {
  readonly name: ResearcherName;
  /** Optional agent frontmatter path; missing → init stage scope. */
  readonly agentPath?: string;
  readonly prompt: string;
  /** Where the researcher's markdown output lands (relative to cwd). */
  readonly outputPath: string;
}

/**
 * Per-researcher outcome. Never-throws contract: if the session errored
 * internally, `status` is `'error'` and the `error` field is populated —
 * the runner never re-raises.
 *
 * `output_exists` + `output_bytes` are measured on disk AFTER the
 * session returns; a successful session that failed to write its file
 * lands with `status: 'completed'` and `output_exists: false` so the
 * synthesizer can drop the slot cleanly.
 */
export interface ResearcherOutcome {
  readonly name: ResearcherName;
  readonly status: 'completed' | 'error';
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
 * Terminal status for a full `run()` invocation.
 *
 *   * `completed`                — every step ran; scaffold + synth produced.
 *   * `already-initialized`      — `.design/STATE.md` exists and `force` is off.
 *   * `no-researchers-succeeded` — all 4 researchers errored; synth skipped.
 *   * `error`                    — precondition failure (e.g., STATE-TEMPLATE.md missing).
 */
export type InitStatus =
  | 'completed'
  | 'already-initialized'
  | 'no-researchers-succeeded'
  | 'error';

/**
 * Options for the top-level `run()`. Every researcher and the synthesizer
 * get their own budget envelope so a runaway researcher cannot starve
 * the synthesizer's token budget.
 *
 * `runOverride` + `synthesizerPromptOverride` are test injection points;
 * production callers leave them unset.
 */
export interface InitRunnerOptions {
  /** Researchers to run. Default: `DEFAULT_RESEARCHERS` (the 4-locked roster). */
  readonly researchers?: readonly ResearcherSpec[];
  /** Per-researcher budget envelope. Each researcher gets a fresh copy. */
  readonly budget: BudgetCap;
  /** Max assistant turns per researcher session. */
  readonly maxTurnsPerResearcher: number;
  /** Synthesizer budget envelope. */
  readonly synthesizerBudget: BudgetCap;
  /** Max assistant turns for the synthesizer session. */
  readonly synthesizerMaxTurns: number;
  /** Parallelism cap for researcher dispatch. Default: 4. */
  readonly concurrency?: number;
  /** Working directory; `.design/` resolved relative to this. Default: `process.cwd()`. */
  readonly cwd?: string;
  /** Force re-init: backup existing `.design/` to `.design.backup.<ISO>/`. */
  readonly force?: boolean;
  /** Path to `reference/STATE-TEMPLATE.md`; defaults to plugin-package-local. */
  readonly stateTemplatePath?: string;
  /** Test-injectable session-runner `run()` replacement. */
  readonly runOverride?: QueryOverride;
  /** Override the synthesizer's embedded prompt. */
  readonly synthesizerPromptOverride?: string;
}

/**
 * Terminal result from `run()`. The union discriminant is `status`;
 * `researchers` + `scaffold` + `total_usage` are populated on all
 * branches (empty arrays / false flags / zeroed usage) so callers can
 * present a uniform summary.
 */
export interface InitRunnerResult {
  readonly status: InitStatus;
  /** Resolved working directory the run targeted. */
  readonly cwd: string;
  /** Resolved `.design/` directory path (absolute). */
  readonly design_dir: string;
  readonly researchers: readonly ResearcherOutcome[];
  readonly scaffold: {
    readonly state_md_written: boolean;
    readonly design_context_md_written: boolean;
    /** When `opts.force` triggered a backup, the backup dir path. */
    readonly backup_dir?: string;
  };
  /** Aggregated usage across all researchers + the synthesizer. */
  readonly total_usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly usd_cost: number;
  };
}
