// scripts/lib/event-stream/reader.ts — typed JSONL reader + aggregator
// (Plan 22-05).
//
// `readEvents()` is a streaming async iterator over the persisted event
// log. It uses `readline` over a `fs.createReadStream`, so the entire
// file is never held in memory — events.jsonl can grow to gigabytes
// without OOM-ing a tail consumer.
//
// `aggregate()` collects an event iterable into a structured rollup
// (counts by type / stage / cycle / agent + totals). Aggregation
// always materialises the iterator, so callers that already have very
// large logs should pre-filter via `readEvents({filter: …})` before
// aggregating.

import { createReadStream, existsSync, type ReadStream } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import type { BaseEvent } from './types.ts';
import { DEFAULT_EVENTS_PATH } from './writer.ts';

/** Options for {@link readEvents}. */
export interface ReadEventsOptions {
  /** Source file path. Default: `.design/telemetry/events.jsonl` (resolved against cwd). */
  path?: string;
  /** Resolution base for relative `path`. Default: `process.cwd()`. */
  baseDir?: string;
  /** Match by event type — string is exact-equal, RegExp is `.test(type)`. */
  type?: string | RegExp;
  /** Custom predicate; runs after `type` filter if both are supplied. */
  predicate?: (ev: BaseEvent) => boolean;
  /** Inclusive lower bound on `timestamp` (ISO-8601 string). */
  since?: string;
  /** Inclusive upper bound on `timestamp` (ISO-8601 string). */
  until?: string;
}

/** Result shape from {@link aggregate}. */
export interface AggregateResult {
  byType: Record<string, number>;
  byStage: Record<string, number>;
  byCycle: Record<string, number>;
  byAgent: Record<string, number>;
  totals: {
    count: number;
    error_count: number;
    truncated_count: number;
  };
}

/**
 * Resolve the read path the same way the writer does: absolute paths
 * win; relative paths resolve against `baseDir` (defaults to cwd).
 */
function resolveReadPath(opts: ReadEventsOptions): string {
  const raw = opts.path ?? DEFAULT_EVENTS_PATH;
  if (isAbsolute(raw)) return raw;
  return resolve(opts.baseDir ?? process.cwd(), raw);
}

/**
 * Stream events from the JSONL log line-by-line. Invalid JSON lines
 * are skipped silently — the writer guarantees well-formed output, so
 * a malformed line is a data-corruption signal that should not crash
 * a tail consumer.
 *
 * Filters apply in this order: type → predicate → since/until. The
 * type filter is the cheapest, so it short-circuits first.
 */
export async function* readEvents(
  opts: ReadEventsOptions = {},
): AsyncIterable<BaseEvent> {
  const path = resolveReadPath(opts);
  if (!existsSync(path)) return;

  const stream: ReadStream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  const typeRe = opts.type instanceof RegExp ? opts.type : null;
  const typeStr = typeof opts.type === 'string' ? opts.type : null;

  try {
    for await (const line of rl) {
      if (line.trim() === '') continue;
      let ev: BaseEvent;
      try {
        ev = JSON.parse(line) as BaseEvent;
      } catch {
        continue;
      }
      if (typeStr !== null && ev.type !== typeStr) continue;
      if (typeRe !== null && !typeRe.test(ev.type)) continue;
      if (opts.predicate && !opts.predicate(ev)) continue;
      if (opts.since !== undefined && ev.timestamp < opts.since) continue;
      if (opts.until !== undefined && ev.timestamp > opts.until) continue;
      yield ev;
    }
  } finally {
    rl.close();
    stream.close();
  }
}

/**
 * Synchronous aggregator that drains an iterable of events and rolls
 * them up by type / stage / cycle / agent. `agent` is read from
 * `payload.agent` (the trajectory + cost-update + agent.spawn shapes
 * all expose it there).
 */
export async function aggregate(
  events: AsyncIterable<BaseEvent> | Iterable<BaseEvent>,
): Promise<AggregateResult> {
  const result: AggregateResult = {
    byType: {},
    byStage: {},
    byCycle: {},
    byAgent: {},
    totals: { count: 0, error_count: 0, truncated_count: 0 },
  };

  /** @param {Record<string, number>} bucket @param {string} key */
  const inc = (bucket: Record<string, number>, key: string) => {
    bucket[key] = (bucket[key] ?? 0) + 1;
  };

  for await (const ev of events as AsyncIterable<BaseEvent>) {
    result.totals.count += 1;
    inc(result.byType, ev.type);
    if (ev.type === 'error') result.totals.error_count += 1;
    if (ev._truncated === true) result.totals.truncated_count += 1;
    if (ev.stage) inc(result.byStage, String(ev.stage));
    if (ev.cycle) inc(result.byCycle, ev.cycle);
    const payload = ev.payload as Record<string, unknown> | undefined;
    if (payload && typeof payload['agent'] === 'string') {
      inc(result.byAgent, payload['agent'] as string);
    }
  }
  return result;
}
