// scripts/mcp-servers/gdd-mcp/tools/gdd_health.ts
//
// Plan 27.7-02. Read-only mirror of skills/health/SKILL.md output via
// scripts/lib/gsd-health-mirror/. No subprocess spawn — pure inspection.

import { getHealthChecks } from '../../../lib/gsd-health-mirror/index.cjs';
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
