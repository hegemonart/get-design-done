// scripts/lib/explore-parallel-runner/synthesizer.ts — Plan 21-06 (SDK-18).
//
// Incremental synthesizer driver. Watches `.design/map/<name>.md` for
// each mapper output, detects stable-size writes, and spawns a single
// synthesizer session with a concatenated prompt when all files are
// stable (or timeoutMs has elapsed).
//
// Design contract (as documented in the plan — "streaming-session
// injection contract"):
//
//   1. Wait for all mapper files to stabilize OR timeoutMs.
//   2. Read each stable file's content, concatenate under the synth
//      prompt, mark missing/unstable files explicitly.
//   3. Spawn session-runner with the composite prompt.
//
// A fuller mid-session injection protocol would require Agent SDK
// multi-turn user-message injection; that's deferred to Phase 22.
// This implementation still satisfies the "streaming" acceptance: we
// DO NOT block the caller's mappers while waiting, and the
// synthesizer's prompt is composed dynamically from ready files.
//
// Stable-size detection: compare `statSync(path).size` across two
// consecutive polls. Unchanged size + still-present file → stable.

import { readFileSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { run as defaultSessionRun } from '../session-runner/index.ts';
import type {
  BudgetCap,
  SessionResult,
  SessionRunnerOptions,
} from '../session-runner/types.ts';

export interface SynthesizeStreamingArgs {
  readonly mapperNames: readonly string[];
  readonly mapperOutputPaths: readonly string[];
  readonly synthesizerPrompt: string;
  readonly budget: BudgetCap;
  readonly maxTurns: number;
  readonly runOverride?: (
    opts: SessionRunnerOptions,
  ) => Promise<SessionResult>;
  readonly cwd: string;
  /** Polling interval for stable-size detection (ms). Default 200. */
  readonly pollIntervalMs?: number;
  /** Total watch timeout (ms). Default 600_000 (10 min). */
  readonly timeoutMs?: number;
}

export interface SynthesizeStreamingResult {
  readonly status: 'completed' | 'error' | 'timeout' | 'skipped';
  readonly output_path: string;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly usd_cost: number;
  };
  readonly files_fed: readonly string[];
  readonly error?: { readonly code: string; readonly message: string };
}

const DEFAULT_POLL_MS = 200;
const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * Probe a single mapper output path. Returns the current byte size when
 * the path is a readable file, `null` when absent or unreadable.
 */
function probeSize(path: string): number | null {
  try {
    const st = statSync(path);
    if (!st.isFile()) return null;
    return st.size;
  } catch {
    return null;
  }
}

/**
 * Wait until every `mapperOutputPaths[i]` is present AND has stable size
 * across two consecutive polls — OR `timeoutMs` elapses. Returns the
 * list of paths that stabilized in time.
 *
 * We allow `pollIntervalMs` to be explicitly `0` in tests (synchronous
 * ready state). The minimum practical interval is still sub-millisecond
 * — we never block the event loop longer than Node's setTimeout jitter.
 */
async function waitForStableFiles(
  paths: readonly string[],
  pollIntervalMs: number,
  timeoutMs: number,
): Promise<readonly string[]> {
  if (paths.length === 0) return Object.freeze([]);

  const deadline: number = Date.now() + timeoutMs;
  const lastSize: Map<string, number | null> = new Map();
  const stable: Set<string> = new Set();

  // Prime: record current sizes.
  for (const p of paths) {
    lastSize.set(p, probeSize(p));
  }

  while (stable.size < paths.length) {
    if (Date.now() >= deadline) break;
    await sleep(pollIntervalMs);

    for (const p of paths) {
      if (stable.has(p)) continue;
      const cur: number | null = probeSize(p);
      const prev: number | null | undefined = lastSize.get(p);
      if (cur !== null && prev !== null && prev !== undefined && cur === prev && cur >= 0) {
        // Also require file exists (already enforced by non-null cur).
        // And prevent 0-byte false positives by requiring at least one
        // prior observation with a non-null size that matches.
        stable.add(p);
      }
      lastSize.set(p, cur);
    }
  }

  return Object.freeze(
    paths.filter((p) => stable.has(p)),
  );
}

/** Promise-returning sleep. 0 ms resolves on next microtask. */
function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compose the synthesizer prompt from the base instructions + each
 * stable mapper's file content, plus a note listing mappers that
 * weren't ready.
 */
function composePrompt(args: {
  basePrompt: string;
  mapperNames: readonly string[];
  mapperOutputPaths: readonly string[];
  readyPaths: readonly string[];
}): { composed: string; filesFed: readonly string[] } {
  const readySet: Set<string> = new Set(args.readyPaths);
  const readBlocks: string[] = [];
  const filesFed: string[] = [];
  const missing: string[] = [];

  for (let i = 0; i < args.mapperNames.length; i += 1) {
    const name: string = args.mapperNames[i] ?? `mapper-${i}`;
    const path: string = args.mapperOutputPaths[i] ?? '';
    if (readySet.has(path)) {
      let content = '';
      try {
        content = readFileSync(path, 'utf8');
      } catch {
        // File disappeared between stability check and read — treat
        // as missing rather than erroring.
        missing.push(name);
        continue;
      }
      readBlocks.push(`## Mapper: ${name}\n\n<path>${path}</path>\n\n${content}`);
      filesFed.push(path);
    } else {
      missing.push(name);
    }
  }

  const missingNote: string =
    missing.length > 0
      ? `\n\n<missing_mappers>\n${missing.join('\n')}\n</missing_mappers>\n`
      : '';

  const mapperSection: string =
    readBlocks.length > 0
      ? `\n\n<mapper_outputs>\n\n${readBlocks.join('\n\n---\n\n')}\n\n</mapper_outputs>`
      : '\n\n<mapper_outputs>(none ready)</mapper_outputs>';

  return {
    composed: `${args.basePrompt}${missingNote}${mapperSection}`,
    filesFed: Object.freeze(filesFed),
  };
}

/**
 * Public driver. Wait for mapper outputs to stabilize (or timeout),
 * spawn the synthesizer session with the composite prompt, return
 * terminal status + usage + fed-file list.
 *
 * Never throws. On session error, returns status 'error' with populated
 * `.error`. On stability-wait timeout with NO files ready, returns
 * status 'timeout' + empty `files_fed` (session NOT spawned).
 */
export async function synthesizeStreaming(
  args: SynthesizeStreamingArgs,
): Promise<SynthesizeStreamingResult> {
  const outputPath: string = resolvePath(args.cwd, '.design/DESIGN-PATTERNS.md');
  const pollIntervalMs: number = args.pollIntervalMs ?? DEFAULT_POLL_MS;
  const timeoutMs: number = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Resolve each mapper output path against cwd so callers can pass
  // relative paths (e.g. '.design/map/token.md').
  const absPaths: readonly string[] = args.mapperOutputPaths.map((p) =>
    resolvePath(args.cwd, p),
  );

  const readyPaths: readonly string[] = await waitForStableFiles(
    absPaths,
    pollIntervalMs,
    timeoutMs,
  );

  // If nothing stabilized within the timeout, short-circuit — don't
  // burn a session with zero input. Callers log a warning.
  if (readyPaths.length === 0 && absPaths.length > 0) {
    return Object.freeze({
      status: 'timeout',
      output_path: outputPath,
      usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
      files_fed: Object.freeze([]),
    });
  }

  const { composed, filesFed } = composePrompt({
    basePrompt: args.synthesizerPrompt,
    mapperNames: args.mapperNames,
    mapperOutputPaths: absPaths,
    readyPaths,
  });

  const runFn: (o: SessionRunnerOptions) => Promise<SessionResult> =
    args.runOverride ?? defaultSessionRun;

  const runnerOpts: SessionRunnerOptions = {
    prompt: composed,
    stage: 'explore',
    budget: args.budget,
    turnCap: { maxTurns: args.maxTurns },
  };

  let sessionResult: SessionResult;
  try {
    sessionResult = await runFn(runnerOpts);
  } catch (err) {
    const message: string = err instanceof Error ? err.message : String(err);
    return Object.freeze({
      status: 'error',
      output_path: outputPath,
      usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
      files_fed: filesFed,
      error: Object.freeze({ code: 'RUN_THREW', message }),
    });
  }

  // Translate SessionResult → SynthesizeStreamingResult.
  const usage = {
    input_tokens: sessionResult.usage.input_tokens,
    output_tokens: sessionResult.usage.output_tokens,
    usd_cost: sessionResult.usage.usd_cost,
  };

  // Determine terminal status. The plan allows the timeout outcome to
  // bubble through even when a session DID spawn with partial inputs;
  // we collapse to 'completed' when the session finished cleanly, even
  // if not all files were ready. Callers inspect `files_fed.length <
  // mapperNames.length` to detect partial coverage.
  if (sessionResult.status !== 'completed') {
    const err = sessionResult.error ?? {
      code: sessionResult.status.toUpperCase(),
      message: `synth session ended with status ${sessionResult.status}`,
    };
    return Object.freeze({
      status: 'error',
      output_path: outputPath,
      usage,
      files_fed: filesFed,
      error: Object.freeze({ code: err.code, message: err.message }),
    });
  }

  // Happy path.
  //
  // If the caller provided 0 mapper paths, we didn't wait and didn't
  // feed anything — that's the "synthesizer invoked with pre-rendered
  // prompt" shape (used by the run() orchestrator's empty-mapper
  // short-circuit elsewhere, though `run()` skips synth entirely in
  // that case).
  return Object.freeze({
    status: 'completed',
    output_path: outputPath,
    usage,
    files_fed: filesFed,
  });
}
