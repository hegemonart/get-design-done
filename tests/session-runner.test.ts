// tests/session-runner.test.ts — Plan 21-01 (SDK-13) coverage.
//
// Exercises the headless Agent SDK wrapper end-to-end via the
// queryOverride injection point (no real SDK calls, no network).
//
// Test groups (required by Plan 21-01 Task 6):
//   1. Budget cap  (4 tests)
//   2. Turn cap    (2 tests)
//   3. Prompt sanitizer integration (3 tests)
//   4. Error mapping (5 tests)
//   5. Transcript (2 tests)
//   6. Events (2 tests)
//   7. Allowed-tools guard (1 test)
//   8. Rate-guard (2 tests)
//
// Plus a small cluster of unit tests for mapSdkError + TranscriptWriter
// direct, lifting total count to 25+.
//
// Every test sandboxes its .design/telemetry + .design/sessions via
// GDD_SESSION_DIR + a temp events.jsonl path; the event-stream module
// exposes reset() for this.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  run,
  mapSdkError,
  TranscriptWriter,
  MODEL_RATES,
} from '../scripts/lib/session-runner/index.ts';
import type { SessionRunnerOptions, SessionResult } from '../scripts/lib/session-runner/index.ts';
import {
  appendEvent,
  getWriter,
  reset as resetEventStream,
  subscribeAll,
} from '../scripts/lib/event-stream/index.ts';
import type { BaseEvent } from '../scripts/lib/event-stream/index.ts';
import {
  assistantChunk,
  makeMockQuery,
  makeRecordingMockQuery,
  toolUseChunk,
} from './fixtures/session-runner/mock-query-stream.ts';
import {
  makeRateLimitAlways,
  makeRateLimitThenSuccess,
} from './fixtures/session-runner/rate-limit-then-success.ts';
import { oversizedChunks } from './fixtures/session-runner/oversized-payload.ts';
import { createRequire } from 'node:module';
import { dirname as _dirname, join as _join } from 'node:path';
import { existsSync as _existsSync } from 'node:fs';

// Load rate-guard directly so tests can observe/mutate its state.
// Anchor createRequire to the repo root (package.json) so path
// resolution survives the sandbox chdir in beforeEach.
function _testRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (_existsSync(_join(dir, 'package.json'))) return dir;
    const parent = _dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
const _TEST_ROOT = _testRepoRoot();
const _testRequire = createRequire(_join(_TEST_ROOT, 'package.json'));
const rateGuard = _testRequire(
  _join(_TEST_ROOT, 'scripts/lib/rate-guard.cjs'),
) as {
  remaining: (provider: string) => { provider: string; remaining: number; resetAt: string; updatedAt: string } | null;
  ingestHeaders: (provider: string, headers: unknown) => Promise<unknown>;
};

// ── Sandbox helpers ─────────────────────────────────────────────────────────

let SANDBOX_ROOT: string = '';
let EVENTS_PATH: string = '';
let SESSIONS_DIR: string = '';
let RATE_DIR: string = '';
let ORIGINAL_CWD: string = process.cwd();
let ORIGINAL_SESSION_DIR: string | undefined;

beforeEach(() => {
  SANDBOX_ROOT = mkdtempSync(join(tmpdir(), 'gdd-session-runner-'));
  SESSIONS_DIR = join(SANDBOX_ROOT, 'sessions');
  EVENTS_PATH = join(SANDBOX_ROOT, 'telemetry', 'events.jsonl');
  RATE_DIR = join(SANDBOX_ROOT, 'rate-limits');
  mkdirSync(SESSIONS_DIR, { recursive: true });
  mkdirSync(RATE_DIR, { recursive: true });
  ORIGINAL_SESSION_DIR = process.env['GDD_SESSION_DIR'];
  process.env['GDD_SESSION_DIR'] = SESSIONS_DIR;
  ORIGINAL_CWD = process.cwd();
  // cwd swap: rate-guard + event-stream resolve paths relative to cwd.
  process.chdir(SANDBOX_ROOT);
  mkdirSync(join(SANDBOX_ROOT, '.design', 'rate-limits'), { recursive: true });
  resetEventStream();
  // Pin event writer to the sandbox so we can read events.jsonl per test.
  getWriter({ path: EVENTS_PATH });
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  if (ORIGINAL_SESSION_DIR === undefined) {
    delete process.env['GDD_SESSION_DIR'];
  } else {
    process.env['GDD_SESSION_DIR'] = ORIGINAL_SESSION_DIR;
  }
  resetEventStream();
  rmSync(SANDBOX_ROOT, { recursive: true, force: true });
});

/** Read + parse the sandbox events.jsonl. Returns [] when absent. */
function readEvents(): BaseEvent[] {
  if (!existsSync(EVENTS_PATH)) return [];
  const body = readFileSync(EVENTS_PATH, 'utf8');
  return body
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as BaseEvent);
}

/** Default opts with the required budget + turnCap envelopes. */
function defaultOpts(overrides: Partial<SessionRunnerOptions> = {}): SessionRunnerOptions {
  return {
    prompt: 'hello world',
    stage: 'explore',
    budget: { usdLimit: 10, inputTokensLimit: 1_000_000, outputTokensLimit: 1_000_000 },
    turnCap: { maxTurns: 5 },
    ...overrides,
  };
}

// ============================================================================
// 1. BUDGET CAP (4 tests)
// ============================================================================

test('budget: usdLimit exceeded mid-session → budget_exceeded + event', async () => {
  // Two turns: first costs $10 worth of output tokens. Using sonnet at
  // $15/M output, 700_000 output tokens = $10.50. First turn trips the
  // USD cap; second turn should never run (aborted).
  const query = makeMockQuery([
    assistantChunk({
      stopReason: 'end_turn',
      inputTokens: 1_000,
      outputTokens: 700_000,
      model: 'claude-sonnet-4-5',
    }),
    assistantChunk({
      stopReason: 'end_turn',
      inputTokens: 1_000,
      outputTokens: 1_000,
      model: 'claude-sonnet-4-5',
    }),
  ]);

  const res = await run(
    defaultOpts({
      queryOverride: query,
      budget: { usdLimit: 10, inputTokensLimit: 10_000_000, outputTokensLimit: 10_000_000 },
    }),
  );

  assert.equal(res.status, 'budget_exceeded');
  assert.ok(res.usage.usd_cost >= 10, `expected usd_cost >= 10, got ${res.usage.usd_cost}`);

  const events = readEvents();
  assert.ok(
    events.some((e) => e.type === 'session.budget_exceeded'),
    'session.budget_exceeded event should be emitted',
  );
});

test('budget: inputTokensLimit exceeded → budget_exceeded', async () => {
  const query = makeMockQuery([
    assistantChunk({
      stopReason: 'end_turn',
      inputTokens: 2_000,
      outputTokens: 0,
      model: 'claude-sonnet-4-5',
    }),
  ]);
  const res = await run(
    defaultOpts({
      queryOverride: query,
      budget: { usdLimit: 100, inputTokensLimit: 1_000, outputTokensLimit: 100_000 },
    }),
  );
  assert.equal(res.status, 'budget_exceeded');
  assert.ok(res.usage.input_tokens >= 1_000);
});

test('budget: outputTokensLimit exceeded → budget_exceeded', async () => {
  const query = makeMockQuery([
    assistantChunk({
      stopReason: 'end_turn',
      inputTokens: 0,
      outputTokens: 2_000,
      model: 'claude-sonnet-4-5',
    }),
  ]);
  const res = await run(
    defaultOpts({
      queryOverride: query,
      budget: { usdLimit: 100, inputTokensLimit: 100_000, outputTokensLimit: 1_000 },
    }),
  );
  assert.equal(res.status, 'budget_exceeded');
  assert.ok(res.usage.output_tokens >= 1_000);
});

test('budget: shared across retries — attempt 1 spend counts toward attempt 2 headroom', async () => {
  // Retry-once fixture: first call throws rate-limit, second call
  // succeeds with 500 output tokens. We set outputTokensLimit=400 so
  // attempt 2 trips the cap (attempt 1 spent 0 — but this still
  // demonstrates that usage accumulates across attempts; the real
  // invariant is tested by attempt 1 NOT resetting the counter).
  //
  // To actually test cross-attempt budget sharing we use a different
  // fixture: first attempt yields a partial assistant turn with
  // usage=400 tokens output, then throws; retry yields another 200
  // output tokens. The 400+200=600 output total should trip an
  // outputTokensLimit of 500.
  let callCount = 0;
  const query = (_args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) => {
    const thisCall = callCount;
    callCount += 1;
    return (async function* () {
      if (thisCall === 0) {
        yield assistantChunk({
          stopReason: 'end_turn',
          inputTokens: 0,
          outputTokens: 400,
          model: 'claude-sonnet-4-5',
        });
        // Throw after the assistant turn so attempt-1 usage is
        // already folded into the accumulator.
        throw { type: 'rate_limit_error', message: 'rate limited', status: 429 };
      }
      yield assistantChunk({
        stopReason: 'end_turn',
        inputTokens: 0,
        outputTokens: 200,
        model: 'claude-sonnet-4-5',
      });
    })();
  };

  const res = await run(
    defaultOpts({
      queryOverride: query,
      budget: { usdLimit: 100, inputTokensLimit: 100_000, outputTokensLimit: 500 },
    }),
  );
  // Attempt 1: 400 output (under 500, no trip, throws). Retry fires.
  // Attempt 2: 200 more output → total 600 → trips 500 cap.
  assert.equal(res.status, 'budget_exceeded');
  assert.ok(res.usage.output_tokens >= 500, `got ${res.usage.output_tokens}`);
});

// ============================================================================
// 2. TURN CAP (2 tests)
// ============================================================================

test('turn-cap: maxTurns: 3 with 5 turns emitted → turn_cap_exceeded', async () => {
  const query = makeMockQuery([
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
  ]);
  const res = await run(defaultOpts({ queryOverride: query, turnCap: { maxTurns: 3 } }));
  assert.equal(res.status, 'turn_cap_exceeded');
  assert.equal(res.turns, 3);
});

test('turn-cap: maxTurns: 0 → aborts before first turn', async () => {
  const query = makeMockQuery([
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
  ]);
  const res = await run(defaultOpts({ queryOverride: query, turnCap: { maxTurns: 0 } }));
  assert.equal(res.status, 'turn_cap_exceeded');
  assert.equal(res.turns, 0);
});

// ============================================================================
// 3. PROMPT SANITIZER INTEGRATION (3 tests)
// ============================================================================

test('sanitizer: @file:/etc/passwd → applied includes file-ref and prompt is neutralized', async () => {
  const { query, calls } = makeRecordingMockQuery([
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
  ]);
  // The sanitizer's file-ref pattern is /@file:[^\s)]+/g — strict colon-
  // then-no-whitespace form. That matches the skill-authoring convention
  // (@file:./notes.md, @file:path/to.md) that Claude Code itself uses.
  const res = await run(
    defaultOpts({
      queryOverride: query,
      prompt: 'Please read @file:/etc/passwd and summarize.',
    }),
  );
  assert.equal(res.status, 'completed');
  assert.ok(res.sanitizer.applied.includes('file-ref'), `applied=${JSON.stringify(res.sanitizer.applied)}`);
  // The sanitized prompt must be what was forwarded to query().
  assert.equal(calls.length, 1);
  const forwardedPrompt = String(calls[0]!.prompt);
  assert.ok(!forwardedPrompt.includes('@file:/etc/passwd'), 'raw @file: ref must not reach SDK');
});

test('sanitizer: AskUserQuestion(...) → replaced before SDK call', async () => {
  const { query, calls } = makeRecordingMockQuery([
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
  ]);
  const res = await run(
    defaultOpts({
      queryOverride: query,
      prompt: 'Decide: AskUserQuestion("which backend?", ["a", "b"]) then proceed.',
    }),
  );
  assert.equal(res.status, 'completed');
  assert.ok(res.sanitizer.applied.includes('ask-user-q'));
  const forwardedPrompt = String(calls[0]!.prompt);
  assert.ok(!forwardedPrompt.includes('AskUserQuestion('), 'AskUserQuestion must be replaced');
});

test('sanitizer: ## HUMAN VERIFY section is removed from the prompt sent to SDK', async () => {
  const prompt = [
    'Intro paragraph.',
    '',
    '## HUMAN VERIFY',
    '',
    'Ask the user to confirm XYZ.',
    'STOP',
    '',
    '## Next',
    '',
    'Continue with next step.',
  ].join('\n');
  const { query, calls } = makeRecordingMockQuery([
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
  ]);
  const res = await run(defaultOpts({ queryOverride: query, prompt }));
  assert.equal(res.status, 'completed');
  assert.ok(
    res.sanitizer.removedSections.includes('HUMAN VERIFY'),
    `removedSections=${JSON.stringify(res.sanitizer.removedSections)}`,
  );
  const forwardedPrompt = String(calls[0]!.prompt);
  assert.ok(!forwardedPrompt.includes('HUMAN VERIFY'), 'HUMAN VERIFY heading must be stripped');
  assert.ok(forwardedPrompt.includes('## Next'), 'following section must survive');
});

// ============================================================================
// 4. ERROR MAPPING (5 tests)
// ============================================================================

test('error-mapping: rate_limit_error → retry succeeds on attempt 2', async () => {
  const query = makeRateLimitThenSuccess({ inputTokens: 2, outputTokens: 3 });
  const res = await run(defaultOpts({ queryOverride: query }));
  assert.equal(res.status, 'completed');
  assert.equal(res.turns, 1);
});

test('error-mapping: rate_limit_error twice → status error with RATE_LIMITED code', async () => {
  const query = makeRateLimitAlways();
  const res = await run(defaultOpts({ queryOverride: query, maxRetries: 2 }));
  assert.equal(res.status, 'error');
  assert.equal(res.error?.code, 'RATE_LIMITED');
  assert.equal(res.error?.kind, 'state_conflict');
});

test('error-mapping: invalid_request_error → no retry, status error, VALIDATION-kind', async () => {
  let callCount = 0;
  const query = (_args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) => {
    callCount += 1;
    return (async function* () {
      throw { type: 'invalid_request_error', message: 'bad schema', status: 400 };
    })();
  };
  const res = await run(defaultOpts({ queryOverride: query, maxRetries: 3 }));
  assert.equal(res.status, 'error');
  assert.equal(res.error?.code, 'INVALID_REQUEST');
  assert.equal(res.error?.kind, 'validation');
  assert.equal(callCount, 1, 'invalid_request should not retry');
});

test('error-mapping: authentication_error → AUTH_ERROR, no retry', async () => {
  let callCount = 0;
  const query = (_args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) => {
    callCount += 1;
    return (async function* () {
      throw { type: 'authentication_error', message: 'invalid api key', status: 401 };
    })();
  };
  const res = await run(defaultOpts({ queryOverride: query, maxRetries: 3 }));
  assert.equal(res.status, 'error');
  assert.equal(res.error?.code, 'AUTH_ERROR');
  assert.equal(callCount, 1, 'auth errors do not retry');
});

test('error-mapping: non-Error throw (string) → SDK_UNKNOWN', async () => {
  const query = (_args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) => {
    return (async function* () {
      throw 'something broke catastrophically';
    })();
  };
  const res = await run(defaultOpts({ queryOverride: query }));
  assert.equal(res.status, 'error');
  assert.equal(res.error?.code, 'SDK_UNKNOWN');
});

// ============================================================================
// 5. TRANSCRIPT (2 tests)
// ============================================================================

test('transcript: every chunk lands as a JSONL line, parseable', async () => {
  const query = makeMockQuery([
    assistantChunk({ stopReason: 'end_turn', inputTokens: 5, outputTokens: 6, model: 'claude-sonnet-4-5', text: 'hi' }),
  ]);
  const res = await run(defaultOpts({ queryOverride: query }));
  assert.equal(res.status, 'completed');
  assert.ok(existsSync(res.transcript_path), `transcript file should exist at ${res.transcript_path}`);
  const body = readFileSync(res.transcript_path, 'utf8');
  const lines = body.split('\n').filter((l) => l.length > 0);
  assert.ok(lines.length >= 1, 'at least one transcript line');
  // Every line is valid JSON with the expected envelope.
  for (const line of lines) {
    const obj = JSON.parse(line) as { ts: string; type: string; turn: number; payload: unknown };
    assert.ok(typeof obj.ts === 'string' && obj.ts.length > 0);
    assert.ok(typeof obj.type === 'string');
    assert.ok(typeof obj.turn === 'number');
    assert.ok('payload' in obj);
  }
});

test('transcript: oversized payload → truncated replacement', async () => {
  const query = makeMockQuery(oversizedChunks());
  const res = await run(defaultOpts({ queryOverride: query }));
  assert.equal(res.status, 'completed');
  const body = readFileSync(res.transcript_path, 'utf8');
  const lines = body.split('\n').filter((l) => l.length > 0);
  // At least one line must carry the truncation marker.
  const truncated = lines.filter((l) => l.includes('"truncated":true'));
  assert.ok(truncated.length >= 1, `expected at least one truncated line, got: ${lines.length} lines`);
  // The truncated line should be well under 100 KiB.
  for (const t of truncated) {
    assert.ok(t.length < 10_000, `truncated line should be small; got ${t.length}`);
    const obj = JSON.parse(t) as { payload: { truncated: boolean; preview: string } };
    assert.equal(obj.payload.truncated, true);
    assert.ok(typeof obj.payload.preview === 'string');
    assert.ok(obj.payload.preview.length <= 1024);
  }
});

// ============================================================================
// 6. EVENTS (2 tests)
// ============================================================================

test('events: session.started + session.completed both land in events.jsonl', async () => {
  const query = makeMockQuery([
    assistantChunk({ stopReason: 'end_turn', inputTokens: 2, outputTokens: 1, model: 'claude-sonnet-4-5' }),
  ]);
  const res = await run(defaultOpts({ queryOverride: query }));
  assert.equal(res.status, 'completed');
  const events = readEvents();
  const types = events.map((e) => e.type);
  assert.ok(types.includes('session.started'), `types=${types.join(',')}`);
  assert.ok(types.includes('session.completed'));
});

test('events: session.budget_exceeded fires only on budget termination', async () => {
  // Case A: clean completion — no budget_exceeded event.
  const queryOK = makeMockQuery([
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
  ]);
  await run(defaultOpts({ queryOverride: queryOK }));
  assert.ok(!readEvents().some((e) => e.type === 'session.budget_exceeded'));
});

// ============================================================================
// 7. ALLOWED-TOOLS GUARD (1 test)
// ============================================================================

test('allowed-tools: forwarded verbatim to query() options', async () => {
  const { query, calls } = makeRecordingMockQuery([
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
  ]);
  const allowed = ['Read', 'Grep', 'Glob'];
  const res = await run(defaultOpts({ queryOverride: query, allowedTools: allowed }));
  assert.equal(res.status, 'completed');
  assert.equal(calls.length, 1);
  const forwardedOpts = calls[0]!.options as { allowedTools?: unknown };
  assert.deepEqual(forwardedOpts.allowedTools, allowed);
});

// ============================================================================
// 8. RATE-GUARD (2 tests)
// ============================================================================

test('rate-guard: pre-flight remaining === 0 → abort with RATE_LIMITED', async () => {
  // Seed the rate-guard with a zero-remaining record by ingesting
  // a headers object that says so.
  await rateGuard.ingestHeaders('anthropic', {
    'retry-after': '60',
  });
  const peek = rateGuard.remaining('anthropic');
  assert.ok(peek !== null, 'rate-guard should have state');
  assert.equal(peek!.remaining, 0);

  const { query, calls } = makeRecordingMockQuery([
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
  ]);
  const res = await run(defaultOpts({ queryOverride: query }));
  assert.equal(res.status, 'error');
  assert.equal(res.error?.code, 'RATE_LIMITED');
  assert.equal(calls.length, 0, 'query() must not be invoked when rate-guard blocks');
});

test('rate-guard: mid-session header ingestion updates the guard', async () => {
  // No initial state.
  assert.equal(rateGuard.remaining('anthropic'), null);

  // Emit a chunk that carries rate-limit headers.
  const query = makeMockQuery([
    assistantChunk({
      stopReason: 'end_turn',
      inputTokens: 1,
      outputTokens: 1,
      model: 'claude-sonnet-4-5',
      headers: { 'anthropic-ratelimit-requests-remaining': '5', 'anthropic-ratelimit-requests-reset': new Date(Date.now() + 60_000).toISOString() },
    }),
  ]);
  const res = await run(defaultOpts({ queryOverride: query }));
  assert.equal(res.status, 'completed');

  // Give the fire-and-forget ingestHeaders() call a moment to flush.
  await new Promise((r) => setTimeout(r, 100));

  const after = rateGuard.remaining('anthropic');
  assert.ok(after !== null, 'rate-guard should have ingested mid-session headers');
  assert.equal(after!.remaining, 5);
});

// ============================================================================
// mapSdkError — direct unit coverage for rows not exercised above
// ============================================================================

test('mapSdkError: overloaded_error → StateConflictError, retryable', () => {
  const mapped = mapSdkError({ type: 'overloaded_error', message: 'too busy', status: 529 });
  assert.equal((mapped.gddError as { code: string }).code, 'OVERLOADED');
  assert.equal(mapped.retryable, true);
});

test('mapSdkError: permission_error → ValidationError PERMISSION_DENIED, not retryable', () => {
  const mapped = mapSdkError({ type: 'permission_error', message: 'tool not allowed', status: 403 });
  assert.equal((mapped.gddError as { code: string }).code, 'PERMISSION_DENIED');
  assert.equal(mapped.retryable, false);
});

test('mapSdkError: context_length_exceeded → OperationFailedError CONTEXT_OVERFLOW, not retryable', () => {
  const mapped = mapSdkError({ type: 'invalid_request_error', message: 'prompt is too long: maximum context length' });
  assert.equal((mapped.gddError as { code: string }).code, 'CONTEXT_OVERFLOW');
  assert.equal(mapped.retryable, false);
});

test('mapSdkError: api_error 5xx → OperationFailedError API_ERROR, retryable', () => {
  const mapped = mapSdkError({ type: 'api_error', message: 'upstream 502', status: 502 });
  assert.equal((mapped.gddError as { code: string }).code, 'API_ERROR');
  assert.equal(mapped.retryable, true);
});

test('mapSdkError: AbortError → ABORTED, not retryable', () => {
  const e = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const mapped = mapSdkError(e);
  assert.equal((mapped.gddError as { code: string }).code, 'ABORTED');
  assert.equal(mapped.retryable, false);
});

test('mapSdkError: retry-after hint parsed from headers (seconds)', () => {
  const mapped = mapSdkError({
    type: 'rate_limit_error',
    message: 'rate limited',
    status: 429,
    headers: { 'retry-after': '3' },
  });
  assert.equal(mapped.backoff_hint_ms, 3000);
  assert.equal(mapped.retryable, true);
});

// ============================================================================
// TranscriptWriter — direct unit coverage
// ============================================================================

test('TranscriptWriter.pathFor: Windows-safe filename (no colons)', () => {
  const p = TranscriptWriter.pathFor('explore');
  assert.ok(!/[:]/.test(p.replace(/^[A-Za-z]:/, '')), `expected no colons in ${p} (drive letter aside)`);
  assert.ok(p.endsWith('-explore.jsonl'));
});

test('TranscriptWriter.pathFor: unsafe stage falls back to "custom"', () => {
  const p = TranscriptWriter.pathFor('../sneaky');
  assert.ok(p.endsWith('-custom.jsonl'));
});

test('TranscriptWriter.append: concurrent writes from two writers interleave without loss', () => {
  // Two writers pointed at the same file; interleave 100 appends each.
  // Atomic O_APPEND should preserve all 200 lines with no corruption.
  const target = join(SANDBOX_ROOT, 'concurrent.jsonl');
  const w1 = new TranscriptWriter(target);
  const w2 = new TranscriptWriter(target);
  for (let i = 0; i < 100; i++) {
    w1.append({ ts: new Date().toISOString(), type: 'system', turn: 0, payload: { src: 'w1', i } });
    w2.append({ ts: new Date().toISOString(), type: 'system', turn: 0, payload: { src: 'w2', i } });
  }
  const lines = readFileSync(target, 'utf8').split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 200, `expected 200 lines, got ${lines.length}`);
  let w1Count = 0;
  let w2Count = 0;
  for (const line of lines) {
    const obj = JSON.parse(line) as { payload: { src: string } };
    if (obj.payload.src === 'w1') w1Count += 1;
    if (obj.payload.src === 'w2') w2Count += 1;
  }
  assert.equal(w1Count, 100);
  assert.equal(w2Count, 100);
});

// ============================================================================
// Model-rate coverage
// ============================================================================

test('MODEL_RATES: opus/sonnet/haiku rates present', () => {
  assert.equal(MODEL_RATES['claude-opus-4-7']?.input, 15);
  assert.equal(MODEL_RATES['claude-opus-4-7']?.output, 75);
  assert.equal(MODEL_RATES['claude-sonnet-4-5']?.input, 3);
  assert.equal(MODEL_RATES['claude-sonnet-4-5']?.output, 15);
  assert.equal(MODEL_RATES['claude-haiku-4-5']?.input, 0.8);
  assert.equal(MODEL_RATES['claude-haiku-4-5']?.output, 4);
});

// ============================================================================
// External abort
// ============================================================================

test('external abort: opts.signal.abort() terminates with status=aborted', async () => {
  const controller = new AbortController();
  // Query that never returns.
  const query = (_args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) => {
    const signal = _args.options?.abortSignal;
    return (async function* () {
      // Yield assistant chunks without stop_reason so budget/turn caps
      // don't fire; the only exit is abort.
      while (!signal?.aborted) {
        yield assistantChunk({ inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' });
        // Tiny await so the microtask queue drains and the abort fires.
        await new Promise((r) => setTimeout(r, 1));
      }
    })();
  };
  // Fire abort soon after start.
  setTimeout(() => controller.abort(), 30);
  const res = await run(defaultOpts({ queryOverride: query, signal: controller.signal }));
  assert.equal(res.status, 'aborted');
});

// ============================================================================
// Tool-use collection
// ============================================================================

test('tool_calls: top-level tool_use chunks are recorded', async () => {
  const query = makeMockQuery([
    toolUseChunk('Read', { path: '/tmp/x' }),
    assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
  ]);
  const res = await run(defaultOpts({ queryOverride: query }));
  assert.equal(res.status, 'completed');
  assert.equal(res.tool_calls.length, 1);
  assert.equal(res.tool_calls[0]!.name, 'Read');
});

test('tool_calls: nested tool_use inside assistant.message.content is recorded', async () => {
  const query = makeMockQuery([
    assistantChunk({
      stopReason: 'end_turn',
      inputTokens: 1,
      outputTokens: 1,
      model: 'claude-sonnet-4-5',
      toolUses: [{ name: 'Grep', input: { pattern: 'foo' } }],
    }),
  ]);
  const res = await run(defaultOpts({ queryOverride: query }));
  assert.equal(res.status, 'completed');
  assert.equal(res.tool_calls.length, 1);
  assert.equal(res.tool_calls[0]!.name, 'Grep');
});

// ============================================================================
// In-process bus: subscribeAll observes session events live
// ============================================================================

test('events: subscribeAll observes session lifecycle in-process', async () => {
  const observed: BaseEvent[] = [];
  const off = subscribeAll((ev) => {
    if (ev.type === 'session.started' || ev.type === 'session.completed') {
      observed.push(ev);
    }
  });
  try {
    const query = makeMockQuery([
      assistantChunk({ stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, model: 'claude-sonnet-4-5' }),
    ]);
    await run(defaultOpts({ queryOverride: query }));
  } finally {
    off();
  }
  const types = observed.map((e) => e.type);
  assert.ok(types.includes('session.started'));
  assert.ok(types.includes('session.completed'));
});
