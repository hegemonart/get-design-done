// scripts/mcp-servers/gdd-mcp/tools/gdd_telemetry_query.ts
//
// Plan 27.7-02. Typed reader over .design/telemetry/*.jsonl via
// scripts/lib/event-stream/index.ts readEvents.

import { readEvents } from '../../../lib/event-stream/index.ts';
import { errorResponse, okResponse, resolveTelemetryDir, type ToolResponse } from './shared.ts';

export const name = 'gdd_telemetry_query';
export const schemaPath = '../schemas/gdd_telemetry_query.schema.json';

interface TelemetryInput { type?: string; since?: string; limit?: number; }

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as TelemetryInput;
    const limit = typeof typed.limit === 'number' && typed.limit > 0 ? typed.limit : 100;
    const events: unknown[] = [];
    const opts: { path: string; type?: string; since?: string } = { path: resolveTelemetryDir() + '/events.jsonl' };
    if (typeof typed.type === 'string' && typed.type.length > 0) opts.type = typed.type;
    if (typeof typed.since === 'string' && typed.since.length > 0) opts.since = typed.since;
    for await (const ev of readEvents(opts)) { events.push(ev); if (events.length >= limit) break; }
    return okResponse({ events });
  } catch (err) {
    return errorResponse(err);
  }
}
