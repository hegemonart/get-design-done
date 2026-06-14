// sdk/mcp/hone-mcp/tools/hone_phases_list.ts
//
// Plan 27.7-02. Parses .planning/ROADMAP.md via scripts/lib/roadmap-reader.

import {
  readRoadmapMd,
  parsePhases,
} from '../../../../scripts/lib/roadmap-reader/index.cjs';
import {
  errorResponse,
  okResponse,
  resolveProjectRoot,
  type ToolResponse,
} from './shared.ts';

export const name = 'hone_phases_list';
export const schemaPath = '../schemas/hone_phases_list.schema.json';

export async function handle(_input: unknown): Promise<ToolResponse> {
  try {
    const md = await readRoadmapMd(resolveProjectRoot());
    return okResponse({ phases: parsePhases(md) });
  } catch (err) {
    return errorResponse(err);
  }
}
