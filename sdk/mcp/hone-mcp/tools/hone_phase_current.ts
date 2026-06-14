// sdk/mcp/hone-mcp/tools/hone_phase_current.ts
//
// Plan 27.7-02. Returns the <position> block from STATE.md.

import { read } from '../../../state/index.ts';
import {
  errorResponse,
  okResponse,
  resolveStatePath,
  type ToolResponse,
} from './shared.ts';

export const name = 'hone_phase_current';
export const schemaPath = '../schemas/hone_phase_current.schema.json';

export async function handle(_input: unknown): Promise<ToolResponse> {
  try {
    const state = await read(resolveStatePath());
    const p = state.position;
    return okResponse({
      phase: state.frontmatter.cycle ?? null,
      stage: p?.stage ?? null,
      task_progress: p?.task_progress ?? null,
      status: p?.status ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
