// scripts/mcp-servers/gdd-mcp/tools/gdd_events_tail.ts
//
// Plan 27.7-02. Last-N events from .design/telemetry/events.jsonl with
// optional type filter. Uses scripts/lib/event-stream readEvents.

import { readEvents } from '../../../lib/event-stream/index.ts';
import { errorResponse, okResponse, resolveTelemetryDir, type ToolResponse } from './shared.ts';

export const name = 'gdd_events_tail';
export const schemaPath = '../schemas/gdd_events_tail.schema.json';

interface TailInput { type?: string; limit?: number; }

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as TailInput;
    const limit = typeof typed.limit === 'number' && typed.limit > 0 ? typed.limit : 50;
    const ring: unknown[] = [];
    const opts: { path: string; type?: string } = { path: resolveTelemetryDir() + '/events.jsonl' };
    if (typeof typed.type === 'string' && typed.type.length > 0) opts.type = typed.type;
    for await (const ev of readEvents(opts)) { ring.push(ev); if (ring.length > limit) ring.shift(); }
    return okResponse({ events: ring });
  } catch (err) {
    return errorResponse(err);
  }
}
