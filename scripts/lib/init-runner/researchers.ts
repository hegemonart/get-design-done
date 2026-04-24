// scripts/lib/init-runner/researchers.ts — researcher dispatch for the
// `gdd-sdk init` runner (Plan 21-08, SDK-20).
//
// Two exports:
//
//   * spawnResearcher(spec, opts)       — one session, returns ResearcherOutcome.
//   * spawnResearchersParallel(specs, opts) — semaphore-bound concurrent dispatch.
//
// Each researcher runs through `session-runner.run()` so the session
// layer owns budget + turn-cap + sanitizer + transcript policy. This
// module only orchestrates and packages outcomes.
//
// Tool scope resolution:
//   * If `spec.agentPath` is set and the file exists, parse its
//     frontmatter tools list via `parseAgentTools`.
//   * Otherwise (or if parse returns `null` meaning wildcard/absent),
//     use the `init` stage scope from `tool-scoping`.
//
// Never-throws contract: a thrown session + a session with `status !==
// 'completed'` both land as `ResearcherOutcome.status = 'error'`. The
// outer `spawnResearchersParallel` therefore never rejects even if
// every researcher explodes.

import { existsSync } from 'node:fs';

import { run as runSession } from '../session-runner/index.ts';
import type {
  BudgetCap,
  QueryOverride,
  SessionResult,
} from '../session-runner/types.ts';
import { enforceScope, parseAgentTools } from '../tool-scoping/index.ts';
import type { ResearcherOutcome, ResearcherSpec } from './types.ts';
import { fileSize } from './scaffold.ts';

/** Monotonic-enough wall-clock helper. Used for duration_ms measurement.
 *  We use `Date.now()` rather than `performance.now()` because the Node
 *  `perf_hooks` module is unavailable in some sandboxed test runners;
 *  ms-precision is plenty for a researcher that runs for seconds. */
function nowMs(): number {
  return Date.now();
}

// ---------------------------------------------------------------------------
// spawnResearcher — single researcher session
// ---------------------------------------------------------------------------

export interface SpawnResearcherOptions {
  readonly budget: BudgetCap;
  readonly maxTurns: number;
  /** Test-injectable `queryOverride` forwarded into session-runner. */
  readonly runOverride?: QueryOverride;
  readonly cwd: string;
}

/**
 * Spawn one researcher session through `session-runner.run()`. Returns
 * a structured `ResearcherOutcome` regardless of outcome; never throws
 * for any session-level failure mode.
 *
 * Dual measurement:
 *   * `output_exists` + `output_bytes` — measured on disk AFTER the
 *     session returns; a session that claimed success but failed to
 *     call the Write tool lands with `output_exists: false`.
 *   * `usage`, `duration_ms`, `error` — read off the `SessionResult`.
 */
export async function spawnResearcher(
  spec: ResearcherSpec,
  opts: SpawnResearcherOptions,
): Promise<ResearcherOutcome> {
  const start = nowMs();

  // Resolve allowed tool list via tool-scoping.
  //
  // `parseAgentTools` returns:
  //   null      — file missing, no frontmatter, tools absent, or wildcard
  //   []        — explicit MCP-only (tools: [])
  //   string[]  — declared list
  //
  // Pass `agentTools` to `enforceScope` ONLY when we got a concrete list
  // or an explicit empty array; `null` → omit so the stage default wins.
  let agentTools: readonly string[] | null = null;
  if (spec.agentPath !== undefined && existsSync(spec.agentPath)) {
    agentTools = parseAgentTools(spec.agentPath);
  }

  let allowedTools: readonly string[];
  try {
    allowedTools = enforceScope({
      stage: 'init',
      ...(agentTools !== null ? { agentTools } : {}),
    });
  } catch (err) {
    // Scope enforcement failure — package as a researcher error without
    // throwing. This is a precondition bug; the caller can present it
    // alongside any other researcher failures.
    return packageErrorOutcome(spec, start, 'SCOPE_ENFORCEMENT', err);
  }

  // Build the session options. `runOverride` is forwarded as the
  // session-runner's `queryOverride` (same shape).
  let session: SessionResult;
  try {
    session = await runSession({
      prompt: spec.prompt,
      stage: 'init',
      budget: opts.budget,
      turnCap: { maxTurns: opts.maxTurns },
      allowedTools: [...allowedTools],
      ...(opts.runOverride !== undefined
        ? { queryOverride: opts.runOverride }
        : {}),
    });
  } catch (err) {
    // session-runner.run() is documented to never throw — but be
    // defensive: if a test injects a runOverride that throws during
    // setup we still package a clean outcome.
    return packageErrorOutcome(spec, start, 'SESSION_THREW', err);
  }

  const duration = nowMs() - start;
  const outputExists = existsSync(spec.outputPath);
  const outputBytes = outputExists ? fileSize(spec.outputPath) : 0;

  if (session.status === 'completed') {
    return Object.freeze({
      name: spec.name,
      status: 'completed' as const,
      output_exists: outputExists,
      output_bytes: outputBytes,
      usage: {
        input_tokens: session.usage.input_tokens,
        output_tokens: session.usage.output_tokens,
        usd_cost: session.usage.usd_cost,
      },
      duration_ms: duration,
    });
  }

  // Non-completed statuses (budget_exceeded, turn_cap_exceeded,
  // aborted, error) all land here as researcher errors. Preserve the
  // session-runner's error code/message when present, otherwise
  // synthesize one from the status.
  const code = session.error?.code ?? session.status.toUpperCase();
  const message = session.error?.message ?? `session ended: ${session.status}`;
  return Object.freeze({
    name: spec.name,
    status: 'error' as const,
    output_exists: outputExists,
    output_bytes: outputBytes,
    usage: {
      input_tokens: session.usage.input_tokens,
      output_tokens: session.usage.output_tokens,
      usd_cost: session.usage.usd_cost,
    },
    duration_ms: duration,
    error: { code, message },
  });
}

/** Build a ResearcherOutcome for a local (non-session) error. */
function packageErrorOutcome(
  spec: ResearcherSpec,
  start: number,
  code: string,
  err: unknown,
): ResearcherOutcome {
  const message = err instanceof Error ? err.message : String(err);
  const outputExists = existsSync(spec.outputPath);
  const outputBytes = outputExists ? fileSize(spec.outputPath) : 0;
  return Object.freeze({
    name: spec.name,
    status: 'error' as const,
    output_exists: outputExists,
    output_bytes: outputBytes,
    usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
    duration_ms: nowMs() - start,
    error: { code, message },
  });
}

// ---------------------------------------------------------------------------
// spawnResearchersParallel — semaphore-bound dispatch
// ---------------------------------------------------------------------------

export interface SpawnParallelOptions {
  readonly concurrency: number;
  readonly budget: BudgetCap;
  readonly maxTurns: number;
  readonly runOverride?: QueryOverride;
  readonly cwd: string;
}

/**
 * Run all `specs` in parallel with a semaphore cap of
 * `opts.concurrency`. The returned outcomes are ordered to match the
 * input `specs` order so consumers can zip the two arrays directly;
 * completion ordering within a batch is timing-dependent and not
 * stable.
 *
 * Never rejects: every outcome is packaged via `spawnResearcher`, which
 * itself never throws.
 */
export async function spawnResearchersParallel(
  specs: readonly ResearcherSpec[],
  opts: SpawnParallelOptions,
): Promise<readonly ResearcherOutcome[]> {
  const concurrency = Math.max(1, Math.floor(opts.concurrency));
  const outcomes: ResearcherOutcome[] = new Array<ResearcherOutcome>(
    specs.length,
  );

  // Simple index-based worker pool. Workers race for the next slot
  // until all indices are claimed.
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= specs.length) return;
      const spec = specs[i];
      // specs[i] is guaranteed present (i < specs.length) but the
      // noUncheckedIndexedAccess flag forces the guard.
      if (spec === undefined) return;
      outcomes[i] = await spawnResearcher(spec, {
        budget: opts.budget,
        maxTurns: opts.maxTurns,
        cwd: opts.cwd,
        ...(opts.runOverride !== undefined
          ? { runOverride: opts.runOverride }
          : {}),
      });
    }
  }

  // Launch `concurrency` workers and await all.
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(concurrency, specs.length);
  for (let w = 0; w < workerCount; w += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return outcomes;
}
