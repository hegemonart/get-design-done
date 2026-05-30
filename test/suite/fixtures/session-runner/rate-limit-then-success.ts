// tests/fixtures/session-runner/rate-limit-then-success.ts
//
// Retry-once fixture: first call throws a rate-limit shaped error,
// second call succeeds with a simple end_turn. Used to verify the
// session-runner's retry-once behavior.

import { assistantChunk, type MockChunk } from './mock-query-stream.ts';

/**
 * Build a query() that rejects with a rate-limit error on its first
 * invocation and succeeds on subsequent invocations. The success path
 * yields one assistant chunk with stop_reason=end_turn plus minimal
 * usage so the run-loop completes cleanly.
 */
export function makeRateLimitThenSuccess(opts?: {
  inputTokens?: number;
  outputTokens?: number;
  retryAfterSeconds?: number;
}): (args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) => AsyncIterable<unknown> {
  let callCount = 0;
  const successChunks: MockChunk[] = [
    assistantChunk({
      stopReason: 'end_turn',
      inputTokens: opts?.inputTokens ?? 5,
      outputTokens: opts?.outputTokens ?? 7,
      model: 'claude-sonnet-4-5',
      text: 'ok, done',
    }),
  ];

  const rateErr = {
    name: 'APIError',
    type: 'rate_limit_error',
    message: 'rate limit reached',
    status: 429,
    retryAfter: opts?.retryAfterSeconds ?? 0,
  };

  return function query(args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) {
    const thisCall = callCount;
    callCount += 1;
    const signal = args.options?.abortSignal;
    return (async function* () {
      if (thisCall === 0) {
        throw rateErr;
      }
      for (const ch of successChunks) {
        if (signal?.aborted) return;
        yield ch;
      }
    })();
  };
}

/** Factory: both attempts throw rate-limit — exercises retries-exhausted. */
export function makeRateLimitAlways(): (args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) => AsyncIterable<unknown> {
  const rateErr = {
    name: 'APIError',
    type: 'rate_limit_error',
    message: 'rate limit reached',
    status: 429,
  };
  return function query(_args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) {
    return (async function* () {
      throw rateErr;
    })();
  };
}
