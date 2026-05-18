// scripts/mcp-servers/gdd-mcp/tools/gdd_learnings_digest.ts
//
// Plan 27.7-02. Aggregates last N reflections into a <= 5 KB digest
// via scripts/lib/reflections-reader/.

import { readNReflections, digestReflections } from '../../../lib/reflections-reader/index.cjs';
import { errorResponse, okResponse, resolveProjectRoot, type ToolResponse } from './shared.ts';

export const name = 'gdd_learnings_digest';
export const schemaPath = '../schemas/gdd_learnings_digest.schema.json';

interface DigestInput { cycles?: number; }

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as DigestInput;
    const n = typeof typed.cycles === 'number' && typed.cycles > 0 ? typed.cycles : 5;
    const refls = await readNReflections(resolveProjectRoot(), n);
    return okResponse({ digest: digestReflections(refls), cycles_included: refls.length });
  } catch (err) {
    return errorResponse(err);
  }
}
