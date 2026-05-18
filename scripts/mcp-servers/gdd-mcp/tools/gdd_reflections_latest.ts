// scripts/mcp-servers/gdd-mcp/tools/gdd_reflections_latest.ts
//
// Plan 27.7-02. Reads newest reflection under .design/reflections/.
// ReflectionsNotFoundError surfaces as mcp_code='directory_not_found'
// via errorResponse (Warning #5).

import { readLatestReflection } from '../../../lib/reflections-reader/index.cjs';
import { errorResponse, okResponse, resolveProjectRoot, type ToolResponse } from './shared.ts';

export const name = 'gdd_reflections_latest';
export const schemaPath = '../schemas/gdd_reflections_latest.schema.json';

export async function handle(_input: unknown): Promise<ToolResponse> {
  try {
    const r = await readLatestReflection(resolveProjectRoot());
    if (r === null) return okResponse({ cycle: null, path: null, content_excerpt: '' });
    return okResponse({
      cycle: r.cycle,
      path: r.path,
      content_excerpt: r.content.slice(0, 4096),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
