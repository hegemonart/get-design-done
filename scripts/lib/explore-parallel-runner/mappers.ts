// scripts/lib/explore-parallel-runner/mappers.ts — Plan 21-06 (SDK-18).
//
// Mapper spawner + parallelism_safe helper. Wraps session-runner.run()
// per mapper; aggregates N mappers concurrently with a semaphore capped
// at `concurrency`.
//
// Design notes:
//   * `isParallelismSafe` parses the `parallelism_safe` field from
//     agent-markdown frontmatter using the same hand-rolled splitter
//     pattern as tool-scoping/parse-agent-tools.ts. Missing file, missing
//     frontmatter, or missing field all return `true` (default-safe).
//   * `spawnMapper` never throws; any session-level failure lands as
//     MapperOutcome.status === 'error' with `.error` populated. Output
//     file presence is captured post-run so callers can distinguish
//     "session completed but mapper didn't write" from "session errored".
//   * `spawnMappersParallel` uses a rolling semaphore (NOT batch groups).
//     Outcomes are returned in INPUT order, not completion order — tests
//     assert this invariant.

import { readFileSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { run as defaultSessionRun } from '../session-runner/index.ts';
import type {
  SessionResult,
  SessionRunnerOptions,
  BudgetCap,
} from '../session-runner/types.ts';
import {
  enforceScope,
  parseAgentToolsByName,
} from '../tool-scoping/index.ts';

import type { MapperOutcome, MapperSpec } from './types.ts';

// ---------------------------------------------------------------------------
// isParallelismSafe — frontmatter parser
// ---------------------------------------------------------------------------

/**
 * Parse the `parallelism_safe` field from an agent markdown file's YAML
 * frontmatter. Returns `true` (default-safe) when the file is missing,
 * has no frontmatter, or the field is absent.
 *
 * Supported shapes:
 *   parallelism_safe: true        → true
 *   parallelism_safe: false       → false
 *   parallelism_safe: "true"      → true
 *   parallelism_safe: 'false'     → false
 *
 * Anything else (garbage values, commented-out lines, etc.) falls through
 * to `true` — fail-open is safer than blocking parallel execution on a
 * stale frontmatter typo.
 */
export function isParallelismSafe(agentPath: string): boolean {
  let raw: string;
  try {
    raw = readFileSync(agentPath, 'utf8');
  } catch {
    // ENOENT or any IO error → default-safe.
    return true;
  }

  const match: RegExpExecArray | null = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (match === null) return true;
  const frontmatter: string = match[1] ?? '';

  const lines: string[] = frontmatter.split(/\r?\n/);
  for (const line of lines) {
    const m: RegExpExecArray | null = /^parallelism_safe:\s*(.*)$/.exec(line);
    if (m === null) continue;
    const value: string = (m[1] ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();
    if (value === 'false') return false;
    if (value === 'true') return true;
    // Unknown / garbage → default-safe.
    return true;
  }
  return true;
}

// ---------------------------------------------------------------------------
// spawnMapper — run a single mapper session
// ---------------------------------------------------------------------------

export interface SpawnMapperOptions {
  readonly budget: BudgetCap;
  readonly maxTurns: number;
  readonly runOverride?: (
    opts: SessionRunnerOptions,
  ) => Promise<SessionResult>;
  readonly cwd: string;
}

/**
 * Spawn a single mapper session. Returns a MapperOutcome — never throws.
 *
 * Scope resolution:
 *   * Parse agent frontmatter `tools:` via parseAgentToolsByName(name).
 *   * Compute allowedTools via enforceScope({ stage: 'explore', agentTools }).
 *   * Missing agent file → agentTools is null → stage 'explore' default applies.
 */
export async function spawnMapper(
  spec: MapperSpec,
  opts: SpawnMapperOptions,
): Promise<MapperOutcome> {
  const start = Date.now();

  // Resolve tool scope. Agent frontmatter is read by bare name; we
  // derive that from the spec.agentPath (`agents/<name>.md`).
  const agentBaseName: string = spec.agentPath.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '') ?? spec.name;
  const agentsRoot: string = resolvePath(
    opts.cwd,
    spec.agentPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/') || 'agents',
  );

  let allowedTools: readonly string[];
  try {
    const agentTools = parseAgentToolsByName(agentBaseName, agentsRoot);
    allowedTools = enforceScope({ stage: 'explore', agentTools: agentTools ?? null });
  } catch (err) {
    // enforceScope throws ValidationError on denied tool additions — we
    // don't pass additional tools, so a throw here means the stage itself
    // was rejected (which shouldn't happen). Degrade to empty scope +
    // surface the error.
    const message: string = err instanceof Error ? err.message : String(err);
    return Object.freeze({
      name: spec.name,
      status: 'error',
      output_exists: false,
      output_bytes: 0,
      usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
      duration_ms: Date.now() - start,
      error: Object.freeze({ code: 'SCOPE_ERROR', message }),
    });
  }

  const runFn: (o: SessionRunnerOptions) => Promise<SessionResult> =
    opts.runOverride ?? defaultSessionRun;

  const runnerOpts: SessionRunnerOptions = {
    prompt: spec.prompt,
    stage: 'custom',
    allowedTools: [...allowedTools],
    budget: opts.budget,
    turnCap: { maxTurns: opts.maxTurns },
  };

  let sessionResult: SessionResult;
  try {
    sessionResult = await runFn(runnerOpts);
  } catch (err) {
    // session-runner.run() NEVER throws, but a test override might. Guard.
    const message: string = err instanceof Error ? err.message : String(err);
    return Object.freeze({
      name: spec.name,
      status: 'error',
      output_exists: false,
      output_bytes: 0,
      usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
      duration_ms: Date.now() - start,
      error: Object.freeze({ code: 'RUN_THREW', message }),
    });
  }

  // Capture output-file presence + size (post-run).
  const outputFullPath: string = resolvePath(opts.cwd, spec.outputPath);
  let outputExists = false;
  let outputBytes = 0;
  try {
    const st = statSync(outputFullPath);
    outputExists = st.isFile();
    outputBytes = outputExists ? st.size : 0;
  } catch {
    outputExists = false;
    outputBytes = 0;
  }

  // Translate SessionResult.status → MapperOutcome.status. Anything
  // other than 'completed' collapses to 'error'; the session-runner's
  // error payload propagates.
  if (sessionResult.status !== 'completed') {
    const err = sessionResult.error ?? {
      code: sessionResult.status.toUpperCase(),
      message: `session ended with status ${sessionResult.status}`,
    };
    return Object.freeze({
      name: spec.name,
      status: 'error',
      output_exists: outputExists,
      output_bytes: outputBytes,
      usage: {
        input_tokens: sessionResult.usage.input_tokens,
        output_tokens: sessionResult.usage.output_tokens,
        usd_cost: sessionResult.usage.usd_cost,
      },
      duration_ms: Date.now() - start,
      error: Object.freeze({ code: err.code, message: err.message }),
    });
  }

  return Object.freeze({
    name: spec.name,
    status: 'completed',
    output_exists: outputExists,
    output_bytes: outputBytes,
    usage: {
      input_tokens: sessionResult.usage.input_tokens,
      output_tokens: sessionResult.usage.output_tokens,
      usd_cost: sessionResult.usage.usd_cost,
    },
    duration_ms: Date.now() - start,
  });
}

// ---------------------------------------------------------------------------
// spawnMappersParallel — rolling semaphore over N specs
// ---------------------------------------------------------------------------

export interface SpawnMappersParallelOptions {
  readonly concurrency: number;
  readonly budget: BudgetCap;
  readonly maxTurns: number;
  readonly runOverride?: (
    opts: SessionRunnerOptions,
  ) => Promise<SessionResult>;
  readonly cwd: string;
}

/**
 * Spawn N mappers concurrently, capped at `concurrency`. Returns
 * outcomes in the SAME ORDER as `specs` (not completion order). A
 * single mapper erroring does NOT cancel others.
 *
 * Concurrency < specs.length → rolling semaphore (new task starts as
 * soon as a slot frees up). Concurrency >= specs.length → all spawn
 * simultaneously.
 *
 * Empty specs → empty array.
 */
export async function spawnMappersParallel(
  specs: readonly MapperSpec[],
  opts: SpawnMappersParallelOptions,
): Promise<readonly MapperOutcome[]> {
  if (specs.length === 0) return Object.freeze([]);

  const n: number = specs.length;
  const cap: number = Math.max(1, Math.min(opts.concurrency, n));
  const outcomes: (MapperOutcome | null)[] = new Array(n).fill(null);

  // Build a rolling-semaphore scheduler: we keep `cap` promises in
  // flight at once. As each resolves we start the next. This is more
  // flexible than a fixed batch grouping — if mapper #0 is slow and
  // #1..3 all finish, #4 can start without waiting for #0.
  let nextIndex = 0;
  const workers: Promise<void>[] = [];

  const launch = async (): Promise<void> => {
    while (true) {
      const myIndex = nextIndex;
      nextIndex += 1;
      if (myIndex >= n) return;
      const spec = specs[myIndex];
      if (spec === undefined) return;
      const spawnOpts: SpawnMapperOptions = {
        budget: opts.budget,
        maxTurns: opts.maxTurns,
        cwd: opts.cwd,
        ...(opts.runOverride !== undefined ? { runOverride: opts.runOverride } : {}),
      };
      const outcome = await spawnMapper(spec, spawnOpts);
      outcomes[myIndex] = outcome;
    }
  };

  for (let w = 0; w < cap; w += 1) {
    workers.push(launch());
  }

  await Promise.all(workers);

  // Narrow `(MapperOutcome | null)[]` → `MapperOutcome[]`. All slots
  // MUST be filled by now; a `null` indicates a scheduler bug.
  const final: MapperOutcome[] = outcomes.map((o, i) => {
    if (o === null) {
      throw new Error(`spawnMappersParallel: slot ${i} was never filled`);
    }
    return o;
  });
  return Object.freeze(final);
}
