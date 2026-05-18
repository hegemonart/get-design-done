// scripts/mcp-servers/gdd-mcp/tools/gdd_intel_get.ts
//
// Plan 27.7-02. Reads a .design/intel/ slice via scripts/lib/intel-store/
// (Warning #7: NOT design-search.cjs). IntelNotFoundError surfaces
// gracefully via errorResponse's mcp_code projection (Warning #5).

import { readSlice } from '../../../lib/intel-store/index.cjs';
import { errorResponse, okResponse, resolveProjectRoot, type ToolResponse } from './shared.ts';

export const name = 'gdd_intel_get';
export const schemaPath = '../schemas/gdd_intel_get.schema.json';

interface IntelInput { slice_id: string; shape?: string[]; }

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as IntelInput;
    if (typeof typed.slice_id !== 'string' || typed.slice_id.length === 0) {
      return errorResponse(new Error('slice_id is required'));
    }
    const data = await readSlice(resolveProjectRoot(), typed.slice_id);
    if (data === null) return errorResponse(new Error('slice not found: ' + typed.slice_id));
    if (Array.isArray(typed.shape) && typed.shape.length > 0 && typeof data === 'object' && data !== null) {
      const projected: Record<string, unknown> = {};
      for (const k of typed.shape) if (k in (data as Record<string, unknown>)) projected[k] = (data as Record<string, unknown>)[k];
      return okResponse({ slice_id: typed.slice_id, data: projected });
    }
    return okResponse({ slice_id: typed.slice_id, data: data as Record<string, unknown> });
  } catch (err) {
    return errorResponse(err);
  }
}
