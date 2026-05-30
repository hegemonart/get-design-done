// tests/fixtures/session-runner/mock-query-stream.ts
//
// Deterministic async-iterable producer for session-runner tests. Wraps
// a prebuilt list of chunks and optionally throws at a specified index.
//
// Usage (from a test):
//
//   const q = makeMockQuery([
//     assistantChunk({ stopReason: 'end_turn', inputTokens: 10, outputTokens: 20, model: 'claude-sonnet-4-5' }),
//   ]);
//   const res = await run({ ..., queryOverride: q });
//
// Each call to the returned `query()` function yields the chunks in
// order. Unlike the real SDK, this mock respects `options.abortSignal`
// — mid-stream iteration checks `signal.aborted` between chunks so the
// run-loop's abort triggers immediately rather than waiting for the
// next chunk.

export interface MockAssistantChunk {
  type: 'assistant';
  stop_reason?: string;
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
  content?: Array<{ type: 'text' | 'tool_use'; text?: string; name?: string; input?: unknown }>;
  headers?: Record<string, string>;
}

export interface MockUsageChunk {
  type: 'usage';
  usage: { input_tokens: number; output_tokens: number };
  model?: string;
}

export interface MockToolUseChunk {
  type: 'tool_use';
  name: string;
  input: unknown;
}

export interface MockSystemChunk {
  type: 'system';
  subtype?: string;
  [k: string]: unknown;
}

export type MockChunk =
  | MockAssistantChunk
  | MockUsageChunk
  | MockToolUseChunk
  | MockSystemChunk
  | Record<string, unknown>;

/** Build an assistant chunk. */
export function assistantChunk(opts: {
  stopReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  text?: string;
  toolUses?: Array<{ name: string; input: unknown }>;
  headers?: Record<string, string>;
}): MockAssistantChunk {
  const content: MockAssistantChunk['content'] = [];
  if (opts.text !== undefined) content.push({ type: 'text', text: opts.text });
  if (opts.toolUses !== undefined) {
    for (const t of opts.toolUses) {
      content.push({ type: 'tool_use', name: t.name, input: t.input });
    }
  }
  const chunk: MockAssistantChunk = { type: 'assistant' };
  if (opts.stopReason !== undefined) chunk.stop_reason = opts.stopReason;
  if (opts.model !== undefined) chunk.model = opts.model;
  if (opts.inputTokens !== undefined || opts.outputTokens !== undefined) {
    chunk.usage = {
      input_tokens: opts.inputTokens ?? 0,
      output_tokens: opts.outputTokens ?? 0,
    };
  }
  if (content.length > 0) chunk.content = content;
  if (opts.headers !== undefined) chunk.headers = opts.headers;
  return chunk;
}

/** Build a tool_use top-level chunk. */
export function toolUseChunk(name: string, input: unknown): MockToolUseChunk {
  return { type: 'tool_use', name, input };
}

/** Build a system chunk (e.g. init / result marker). */
export function systemChunk(extras: Record<string, unknown> = {}): MockSystemChunk {
  return { type: 'system', ...extras };
}

export interface MockQueryOptions {
  /**
   * If set, the iterator throws `throwAt.error` after yielding
   * `throwAt.afterChunks` chunks.
   */
  throwAt?: { afterChunks: number; error: unknown };
  /**
   * Override abort-signal handling. Defaults to true: mid-stream abort
   * stops iteration immediately.
   */
  honorAbort?: boolean;
}

/**
 * Build a `query()` replacement for session-runner tests. The returned
 * function has the same call shape as the real SDK's `query()` and
 * returns an async iterable.
 */
export function makeMockQuery(
  chunks: readonly MockChunk[],
  opts: MockQueryOptions = {},
): (args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) => AsyncIterable<unknown> {
  const honor = opts.honorAbort !== false;
  return function query(args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) {
    const signal: AbortSignal | undefined = args.options?.abortSignal;
    return (async function* () {
      let i = 0;
      for (const ch of chunks) {
        if (honor && signal?.aborted) return;
        if (opts.throwAt !== undefined && i === opts.throwAt.afterChunks) {
          throw opts.throwAt.error;
        }
        yield ch;
        i += 1;
      }
      if (opts.throwAt !== undefined && i === opts.throwAt.afterChunks) {
        throw opts.throwAt.error;
      }
    })();
  };
}

/** Record-style mock: a query that records the invocation args before yielding. */
export function makeRecordingMockQuery(
  chunks: readonly MockChunk[],
): {
  query: (args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) => AsyncIterable<unknown>;
  calls: Array<{ prompt: unknown; options: unknown }>;
} {
  const calls: Array<{ prompt: unknown; options: unknown }> = [];
  const query = (args: { prompt: unknown; options?: { abortSignal?: AbortSignal } }) => {
    calls.push({ prompt: args.prompt, options: args.options });
    const signal: AbortSignal | undefined = args.options?.abortSignal;
    return (async function* () {
      for (const ch of chunks) {
        if (signal?.aborted) return;
        yield ch;
      }
    })();
  };
  return { query, calls };
}
