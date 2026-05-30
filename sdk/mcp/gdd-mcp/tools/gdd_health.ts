// sdk/mcp/gdd-mcp/tools/gdd_health.ts
//
// Plan 27.7-02 (lib renamed to health-mirror in Phase 30.6-08 per D-10).
// Read-only mirror of skills/health/SKILL.md output. No subprocess spawn — pure inspection.

import { getHealthChecks } from '../../../../scripts/lib/health-mirror/index.cjs';
import { errorResponse, okResponse, resolveProjectRoot, type ToolResponse } from './shared.ts';

export const name = 'gdd_health';
export const schemaPath = '../schemas/gdd_health.schema.json';

export async function handle(_input: unknown): Promise<ToolResponse> {
  try {
    const result = await getHealthChecks(resolveProjectRoot());
    return okResponse({ checks: result.checks });
  } catch (err) {
    return errorResponse(err);
  }
}
