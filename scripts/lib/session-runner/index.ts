// scripts/lib/session-runner/index.ts — Phase 21 headless Agent SDK
// wrapper (Plan 21-01, SDK-13).
//
// Public surface:
//
//   run(opts: SessionRunnerOptions): Promise<SessionResult>
//
// This is the ONLY point at which the repo should import
// `@anthropic-ai/claude-agent-sdk`. Every other Phase-21 runner
// (pipeline, explore, discuss, init) spawns sessions via `run()` so
// policy (budget, turn-cap, sanitizer, rate-guard, retry-once) is
// enforced in exactly one place.
//
// Contract highlights:
//
//   * NEVER throws. Every failure mode becomes `SessionResult.status !==
//     'completed'` with `SessionResult.error` populated.
//   * Prompt sanitizer runs BEFORE every SDK invocation (including
//     retries). Sanitizer diagnostics ride on `SessionResult.sanitizer`.
//   * Budget caps (USD + both token dims) are SESSION-TOTAL; retries
//     share the envelope.
//   * Retry-once fires only when `mapSdkError(err).retryable === true`.
//   * Rate-guard is consulted pre-flight; response headers on chunks are
//     ingested mid-session for cross-session cooperation.
//   * Two events: `session.started` (always) + `session.completed`
//     (always; payload status mirrors SessionResult.status). Optional
//     `session.budget_exceeded` emitted when the budget trips.

import { appendEvent } from '../event-stream/index.ts';
import type { BaseEvent } from '../event-stream/index.ts';
import { sanitize as defaultSanitize } from '../prompt-sanitizer/index.ts';

import { mapSdkError } from './errors.ts';
import { TranscriptWriter, type TranscriptChunk } from './transcript.ts';
import type {
  BudgetCap,
  SessionResult,
  SessionRunnerOptions,
  TurnCap,
} from './types.ts';

// Re-exports — consumers import only from this file.
export type { BudgetCap, SessionRunnerOptions, SessionResult, TurnCap } from './types.ts';
export { mapSdkError } from './errors.ts';
export { TranscriptWriter } from './transcript.ts';

// CommonJS primitives — `.cjs` files loaded via createRequire. See
// errors.ts for the full rationale; same pattern here. We resolve paths
// against a repo-root anchor discovered at module load time so the
// session-runner survives tests that chdir into sandboxes.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname as _dirname, join as _join, resolve as _resolve } from 'node:path';
function _findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(_join(dir, 'package.json'))) return dir;
    const parent = _dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
const _REPO_ROOT = _findRepoRoot();
const _nodeRequire = createRequire(_join(_REPO_ROOT, 'package.json'));
const jitteredBackoff = _nodeRequire(
  _resolve(_REPO_ROOT, 'scripts/lib/jittered-backoff.cjs'),
) as {
  delayMs: (attempt: number, opts?: { baseMs?: number; maxMs?: number; factor?: number; jitter?: number }) => number;
};
const rateGuard = _nodeRequire(
  _resolve(_REPO_ROOT, 'scripts/lib/rate-guard.cjs'),
) as {
  remaining: (provider: string) => {
    provider: string;
    remaining: number;
    resetAt: string;
    updatedAt: string;
  } | null;
  ingestHeaders: (provider: string, headers: unknown) => Promise<unknown>;
};

/** Rate-guard provider key for the Anthropic Agent SDK. */
const RATE_GUARD_PROVIDER = 'anthropic';

/** Default retries (first attempt + 1 retry). */
const DEFAULT_MAX_RETRIES = 2;

/** Baseline retry backoff parameters (matches jittered-backoff defaults for
 *  the SDK-retry case; 1s base → 30s cap). */
const RETRY_BACKOFF = { baseMs: 1000, maxMs: 30_000 } as const;

/**
 * Per-million-token USD rates. Unknown models default to the Sonnet
 * rate (safer overestimate — we'd rather cap early than under-bill).
 */
const MODEL_RATES: Readonly<Record<string, { input: number; output: number }>> = Object.freeze({
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
});
const DEFAULT_MODEL_RATE = Object.freeze({ input: 3, output: 15 });

/** Resolve a per-M-token rate for a model name, matching prefix when possible. */
function rateFor(modelName: string | null): { input: number; output: number } {
  if (modelName === null || modelName === '') return DEFAULT_MODEL_RATE;
  // Direct match first.
  const direct = MODEL_RATES[modelName];
  if (direct !== undefined) return direct;
  // Prefix match (e.g. "claude-opus-4-7-20250101" → "claude-opus-4-7").
  for (const key of Object.keys(MODEL_RATES)) {
    if (modelName.startsWith(key)) {
      const hit = MODEL_RATES[key];
      if (hit !== undefined) return hit;
    }
  }
  return DEFAULT_MODEL_RATE;
}

/** Compute USD cost from accumulated input + output tokens. */
function usdCost(inputTokens: number, outputTokens: number, modelName: string | null): number {
  const r = rateFor(modelName);
  return (inputTokens / 1_000_000) * r.input + (outputTokens / 1_000_000) * r.output;
}

/** Build a stable session identifier. */
function buildSessionId(stage: string): string {
  return `gdd-session-${new Date().toISOString()}-${process.pid}-${stage}`;
}

/** Shape of a message chunk we care about. The SDK exports many types;
 *  this structural type captures just the fields the run-loop touches.
 *  Unknown fields are ignored safely. */
interface ChunkShape {
  type?: string;
  stop_reason?: string | null;
  model?: string;
  message?: {
    stop_reason?: string | null;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
    content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>;
  };
  content?: Array<{ type?: string; text?: string; name?: string; input?: unknown; tool_use_id?: string; is_error?: boolean }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  headers?: unknown;
  rate_limit?: unknown;
  subtype?: string;
  // Tool event fields (SDK may emit tool_use / tool_result at top level).
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
  result?: unknown;
  error?: unknown;
}

/** Narrow `unknown` to our structural ChunkShape when it's object-like. */
function asChunk(raw: unknown): ChunkShape {
  if (raw === null || raw === undefined || typeof raw !== 'object') return {};
  return raw as ChunkShape;
}

/** Transcript type inference from SDK chunk shape. */
function chunkKind(ch: ChunkShape): TranscriptChunk['type'] {
  const t = ch.type ?? '';
  switch (t) {
    case 'user':
      return 'user';
    case 'assistant':
      return 'assistant';
    case 'tool_use':
      return 'tool_use';
    case 'tool_result':
      return 'tool_result';
    case 'system':
      return 'system';
    case 'usage':
      return 'usage';
    default:
      // SDK's "result" / control frames land here — classify as system.
      return 'system';
  }
}

/**
 * Try to extract rate-limit headers from a chunk. The SDK exposes them on
 * `chunk.headers` or `chunk.rate_limit` depending on subtype. Returns
 * `null` when nothing usable is present.
 */
function extractHeaders(ch: ChunkShape): unknown {
  if (ch.headers !== undefined && ch.headers !== null) return ch.headers;
  if (ch.rate_limit !== undefined && ch.rate_limit !== null) return ch.rate_limit;
  return null;
}

/**
 * Accumulate usage numbers from a chunk onto a running total. Handles
 * both top-level `usage` and nested `message.usage` shapes.
 */
function foldUsage(
  acc: { input: number; output: number; model: string | null },
  ch: ChunkShape,
): void {
  const fromTop = ch.usage;
  if (fromTop !== undefined) {
    if (typeof fromTop.input_tokens === 'number' && Number.isFinite(fromTop.input_tokens)) {
      acc.input += fromTop.input_tokens;
    }
    if (typeof fromTop.output_tokens === 'number' && Number.isFinite(fromTop.output_tokens)) {
      acc.output += fromTop.output_tokens;
    }
  }
  const fromMsg = ch.message?.usage;
  if (fromMsg !== undefined) {
    if (typeof fromMsg.input_tokens === 'number' && Number.isFinite(fromMsg.input_tokens)) {
      acc.input += fromMsg.input_tokens;
    }
    if (typeof fromMsg.output_tokens === 'number' && Number.isFinite(fromMsg.output_tokens)) {
      acc.output += fromMsg.output_tokens;
    }
  }
  if (acc.model === null) {
    const candidate = ch.model ?? ch.message?.model ?? null;
    if (candidate !== null && candidate !== '') acc.model = candidate;
  }
}

/** Detect an end-of-turn marker. Covers both top-level and nested forms. */
function isTurnStop(ch: ChunkShape): boolean {
  if (ch.stop_reason !== undefined && ch.stop_reason !== null && ch.stop_reason !== '') {
    return true;
  }
  const inner = ch.message?.stop_reason;
  if (inner !== undefined && inner !== null && inner !== '') return true;
  return false;
}

/** Collect tool_use chunks into the SessionResult's tool_calls array. */
function collectToolUse(
  ch: ChunkShape,
  toolCalls: SessionResult['tool_calls'],
): void {
  if (ch.type === 'tool_use') {
    toolCalls.push({ name: ch.name ?? '', input: ch.input ?? null });
    return;
  }
  // The SDK nests tool_use inside `content` blocks. Depending on the
  // chunk subtype it may land at the top level (`ch.content`) or one
  // level deeper (`ch.message.content`); check both.
  const topContent = ch.content;
  if (Array.isArray(topContent)) {
    for (const block of topContent) {
      if (block !== null && typeof block === 'object' && block.type === 'tool_use') {
        toolCalls.push({ name: block.name ?? '', input: block.input ?? null });
      }
    }
  }
  const innerContent = ch.message?.content;
  if (Array.isArray(innerContent)) {
    for (const block of innerContent) {
      if (block !== null && typeof block === 'object' && block.type === 'tool_use') {
        toolCalls.push({ name: block.name ?? '', input: block.input ?? null });
      }
    }
  }
}

/**
 * Collect the final assistant text from `assistant`/`message.content[].text`
 * blocks. We keep the LAST non-empty string we see — that matches the
 * Agent SDK's convention where the final reply lands in the last assistant
 * turn before the terminal `stop_reason`.
 */
function updateFinalText(ch: ChunkShape, currentFinal: string | undefined): string | undefined {
  // Top-level assistant text blocks.
  const topContent = ch.content;
  if (Array.isArray(topContent)) {
    for (const block of topContent) {
      if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
        currentFinal = block.text;
      }
    }
  }
  // Nested message.content[].text.
  const innerContent = ch.message?.content;
  if (Array.isArray(innerContent)) {
    for (const block of innerContent) {
      if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
        currentFinal = block.text;
      }
    }
  }
  return currentFinal;
}

/** Emit a session event via the shared appendEvent() surface. */
function emit(
  type: 'session.started' | 'session.completed' | 'session.budget_exceeded',
  stage: SessionRunnerOptions['stage'],
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  const ev: BaseEvent = {
    type,
    timestamp: new Date().toISOString(),
    sessionId,
    payload,
  };
  // The event-stream `Stage` union is narrower than the runner's stage
  // union (no 'init' / 'custom'); only stamp it when it's a Stage.
  if (stage !== 'init' && stage !== 'custom') {
    ev.stage = stage;
  }
  try {
    appendEvent(ev);
  } catch {
    // appendEvent is persist-first + broadcast-second; persist never
    // throws. Any throw here would come from a bus subscriber — we
    // swallow because a broken observer must not fail the session.
  }
}

/** Run-loop result for a single attempt. */
interface AttemptOutcome {
  /** `null` when the attempt completed naturally; populated on error / cap. */
  terminal: SessionResult['status'] | null;
  error: SessionResult['error'];
  backoff_hint_ms: number;
  retryable: boolean;
}

/**
 * Spawn one headless Agent SDK session. See the module header comment
 * for the full contract. Never throws; check `SessionResult.status` to
 * distinguish outcomes.
 */
export async function run(opts: SessionRunnerOptions): Promise<SessionResult> {
  // -- 1. Sanitize prompt first. ------------------------------------------
  const sanitizer = opts.sanitizeOverride ?? defaultSanitize;
  const sanResult = sanitizer(opts.prompt);
  const sanitizedPrompt = sanResult.sanitized;

  // -- 2. Resolve transcript path + open writer. --------------------------
  const transcriptPath = TranscriptWriter.pathFor(opts.stage, opts.transcriptDir);
  const transcript = new TranscriptWriter(transcriptPath);

  // -- 3. Seed result accumulator. ----------------------------------------
  const sessionId = buildSessionId(opts.stage);
  const toolCalls: SessionResult['tool_calls'] = [];
  const usage = { input: 0, output: 0, model: null as string | null };
  let turns = 0;
  let finalText: string | undefined;

  // -- 4. Emit session.started. -------------------------------------------
  emit('session.started', opts.stage, sessionId, {
    stage: opts.stage,
    sessionId,
    allowedTools: opts.allowedTools ?? [],
    budget: { ...opts.budget },
    turnCap: { ...opts.turnCap },
    transcript_path: transcriptPath,
  });

  // -- 5. Rate-guard pre-flight. ------------------------------------------
  const preflight = rateGuard.remaining(RATE_GUARD_PROVIDER);
  if (preflight !== null && preflight.remaining <= 0) {
    const result = buildResult({
      status: 'error',
      transcriptPath,
      turns,
      usage,
      toolCalls,
      finalText,
      sanitizer: sanResult,
      error: {
        code: 'RATE_LIMITED',
        message: `rate-guard reports 0 remaining for ${RATE_GUARD_PROVIDER} until ${preflight.resetAt}`,
        kind: 'state_conflict',
        context: { provider: RATE_GUARD_PROVIDER, resetAt: preflight.resetAt },
      },
    });
    emit('session.completed', opts.stage, sessionId, {
      stage: opts.stage,
      sessionId,
      status: result.status,
      turns: result.turns,
      usage: result.usage,
      transcript_path: transcriptPath,
      sanitizer: { applied: [...result.sanitizer.applied], removedSections: [...result.sanitizer.removedSections] },
    });
    transcript.close();
    return result;
  }

  // -- 6. External abort propagation. -------------------------------------
  const abortController = new AbortController();
  let externalAbortHit = false;
  const onExternalAbort = () => {
    externalAbortHit = true;
    abortController.abort();
  };
  if (opts.signal !== undefined) {
    if (opts.signal.aborted) {
      onExternalAbort();
    } else {
      opts.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  // -- 7. Retry-once loop. ------------------------------------------------
  const maxAttempts = opts.maxRetries !== undefined && opts.maxRetries > 0
    ? opts.maxRetries
    : DEFAULT_MAX_RETRIES;

  // `maxTurns: 0` is a legal config meaning "abort before first turn".
  if (opts.turnCap.maxTurns <= 0) {
    const status: SessionResult['status'] = 'turn_cap_exceeded';
    const result = buildResult({
      status,
      transcriptPath,
      turns,
      usage,
      toolCalls,
      finalText,
      sanitizer: sanResult,
    });
    emit('session.completed', opts.stage, sessionId, {
      stage: opts.stage,
      sessionId,
      status,
      turns,
      usage: result.usage,
      transcript_path: transcriptPath,
      sanitizer: { applied: [...sanResult.applied], removedSections: [...sanResult.removedSections] },
    });
    transcript.close();
    if (opts.signal !== undefined) opts.signal.removeEventListener('abort', onExternalAbort);
    return result;
  }

  let attempt = 0;
  let terminalStatus: SessionResult['status'] = 'completed';
  let terminalError: SessionResult['error'] | undefined;

  while (attempt < maxAttempts) {
    const outcome = await runOneAttempt({
      attempt,
      sanitizedPrompt,
      opts,
      abortController,
      transcript,
      toolCalls,
      usage,
      turnsRef: (v: number) => {
        turns = v;
      },
      turnsGet: () => turns,
      finalTextRef: (v: string | undefined) => {
        finalText = v;
      },
      finalTextGet: () => finalText,
    });

    if (externalAbortHit) {
      terminalStatus = 'aborted';
      terminalError = undefined;
      break;
    }

    if (outcome.terminal === null) {
      // Clean completion.
      terminalStatus = 'completed';
      terminalError = undefined;
      break;
    }

    if (outcome.terminal === 'budget_exceeded' || outcome.terminal === 'turn_cap_exceeded') {
      terminalStatus = outcome.terminal;
      terminalError = undefined;
      if (outcome.terminal === 'budget_exceeded') {
        emit('session.budget_exceeded', opts.stage, sessionId, {
          stage: opts.stage,
          sessionId,
          usage: { input_tokens: usage.input, output_tokens: usage.output, usd_cost: usdCost(usage.input, usage.output, usage.model) },
          budget: { ...opts.budget },
          transcript_path: transcriptPath,
        });
      }
      break;
    }

    // outcome.terminal === 'error' — decide retry.
    terminalStatus = 'error';
    terminalError = outcome.error;

    if (outcome.retryable && attempt + 1 < maxAttempts) {
      const baseBackoff = jitteredBackoff.delayMs(attempt, RETRY_BACKOFF);
      const wait = Math.max(baseBackoff, outcome.backoff_hint_ms);
      await sleep(wait);
      attempt += 1;
      continue;
    }

    break;
  }

  if (opts.signal !== undefined) opts.signal.removeEventListener('abort', onExternalAbort);
  transcript.close();

  const result = buildResult({
    status: terminalStatus,
    transcriptPath,
    turns,
    usage,
    toolCalls,
    finalText,
    sanitizer: sanResult,
    error: terminalError,
  });

  emit('session.completed', opts.stage, sessionId, {
    stage: opts.stage,
    sessionId,
    status: result.status,
    turns: result.turns,
    usage: result.usage,
    transcript_path: transcriptPath,
    sanitizer: { applied: [...sanResult.applied], removedSections: [...sanResult.removedSections] },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Run-loop internals
// ---------------------------------------------------------------------------

interface AttemptContext {
  attempt: number;
  sanitizedPrompt: string;
  opts: SessionRunnerOptions;
  abortController: AbortController;
  transcript: TranscriptWriter;
  toolCalls: SessionResult['tool_calls'];
  usage: { input: number; output: number; model: string | null };
  turnsRef: (v: number) => void;
  turnsGet: () => number;
  finalTextRef: (v: string | undefined) => void;
  finalTextGet: () => string | undefined;
}

/**
 * One attempt at the SDK. Returns `{ terminal: null }` on clean
 * completion, `{ terminal: 'budget_exceeded' | 'turn_cap_exceeded' }`
 * on cap trip, or `{ terminal: 'error', error, retryable, backoff_hint_ms }`
 * on thrown error.
 *
 * Budget + turn-cap accounting is mutated on the caller-supplied `usage`
 * + `turns` refs so they survive retry boundaries.
 */
async function runOneAttempt(ctx: AttemptContext): Promise<AttemptOutcome> {
  const queryImpl = ctx.opts.queryOverride ?? (await loadSdkQuery());

  let stream: AsyncIterable<unknown>;
  try {
    const invokeOpts: Record<string, unknown> = {
      abortSignal: ctx.abortController.signal,
    };
    if (ctx.opts.systemPrompt !== undefined) invokeOpts['systemPrompt'] = ctx.opts.systemPrompt;
    if (ctx.opts.allowedTools !== undefined) invokeOpts['allowedTools'] = ctx.opts.allowedTools;

    stream = queryImpl({ prompt: ctx.sanitizedPrompt, options: invokeOpts });
  } catch (err) {
    return asErrorOutcome(err);
  }

  try {
    for await (const raw of stream) {
      const ch = asChunk(raw);

      // Write the chunk to the transcript regardless of kind.
      ctx.transcript.append({
        ts: new Date().toISOString(),
        type: chunkKind(ch),
        turn: ctx.turnsGet(),
        payload: raw,
      });

      // Fold usage.
      foldUsage(ctx.usage, ch);

      // Collect tool-use + final text.
      collectToolUse(ch, ctx.toolCalls);
      const nextFinal = updateFinalText(ch, ctx.finalTextGet());
      if (nextFinal !== undefined) ctx.finalTextRef(nextFinal);

      // Ingest rate-limit headers if the chunk carried any.
      const h = extractHeaders(ch);
      if (h !== null) {
        // Fire and forget — rate-guard persists under its own lock.
        void rateGuard.ingestHeaders(RATE_GUARD_PROVIDER, h).catch(() => {
          // Rate-guard write failed; tolerated — fresh headers next time.
        });
      }

      // Turn boundary?
      if (isTurnStop(ch)) {
        ctx.turnsRef(ctx.turnsGet() + 1);

        // Turn cap?
        if (ctx.turnsGet() >= ctx.opts.turnCap.maxTurns) {
          ctx.abortController.abort();
          return { terminal: 'turn_cap_exceeded', error: undefined, backoff_hint_ms: 0, retryable: false };
        }

        // Budget (USD + both token dims)?
        const costSoFar = usdCost(ctx.usage.input, ctx.usage.output, ctx.usage.model);
        if (costSoFar >= ctx.opts.budget.usdLimit) {
          ctx.abortController.abort();
          return { terminal: 'budget_exceeded', error: undefined, backoff_hint_ms: 0, retryable: false };
        }
        if (ctx.usage.input >= ctx.opts.budget.inputTokensLimit) {
          ctx.abortController.abort();
          return { terminal: 'budget_exceeded', error: undefined, backoff_hint_ms: 0, retryable: false };
        }
        if (ctx.usage.output >= ctx.opts.budget.outputTokensLimit) {
          ctx.abortController.abort();
          return { terminal: 'budget_exceeded', error: undefined, backoff_hint_ms: 0, retryable: false };
        }
      }
    }
  } catch (err) {
    return asErrorOutcome(err);
  }

  // Stream ended without error.
  return { terminal: null, error: undefined, backoff_hint_ms: 0, retryable: false };
}

/** Build an AttemptOutcome from a thrown error. */
function asErrorOutcome(err: unknown): AttemptOutcome {
  const mapped = mapSdkError(err);
  const gdd = mapped.gddError;
  return {
    terminal: 'error',
    error: {
      code: (gdd as { code?: string }).code ?? 'SDK_UNKNOWN',
      message: (gdd as { message?: string }).message ?? 'unknown SDK error',
      kind: (gdd as { kind?: string }).kind ?? 'operation_failed',
      context: (gdd as { context?: unknown }).context ?? {},
    },
    retryable: mapped.retryable,
    backoff_hint_ms: mapped.backoff_hint_ms,
  };
}

/** Lazy import of the real SDK. Kept in its own function so tests can
 *  inject `queryOverride` without pulling the SDK into the test process.
 *
 *  Uses the repo-root-anchored `createRequire` loader (see top of file)
 *  so the SDK resolves regardless of cwd. */
async function loadSdkQuery(): Promise<(args: { prompt: unknown; options?: unknown }) => AsyncIterable<unknown>> {
  const sdk = _nodeRequire('@anthropic-ai/claude-agent-sdk') as {
    query: (args: { prompt: unknown; options?: unknown }) => AsyncIterable<unknown>;
  };
  return sdk.query;
}

/** Promise-returning sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

// ---------------------------------------------------------------------------
// Result construction
// ---------------------------------------------------------------------------

interface BuildResultArgs {
  status: SessionResult['status'];
  transcriptPath: string;
  turns: number;
  usage: { input: number; output: number; model: string | null };
  toolCalls: SessionResult['tool_calls'];
  finalText: string | undefined;
  sanitizer: { sanitized: string; applied: readonly string[]; removedSections: readonly string[] };
  error?: SessionResult['error'];
}

function buildResult(args: BuildResultArgs): SessionResult {
  const cost = usdCost(args.usage.input, args.usage.output, args.usage.model);
  const res: SessionResult = {
    status: args.status,
    transcript_path: args.transcriptPath,
    turns: args.turns,
    usage: {
      input_tokens: args.usage.input,
      output_tokens: args.usage.output,
      usd_cost: cost,
    },
    tool_calls: args.toolCalls,
    sanitizer: {
      applied: [...args.sanitizer.applied],
      removedSections: [...args.sanitizer.removedSections],
    },
  };
  if (args.finalText !== undefined) res.final_text = args.finalText;
  if (args.error !== undefined) res.error = args.error;
  return res;
}

// Re-export types and primitives specifically for plan-level budget hint
// invariant: session-runner consumers can rely on these constants being
// stable across minor releases.
export { MODEL_RATES, DEFAULT_MODEL_RATE, RATE_GUARD_PROVIDER };
