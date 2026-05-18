// scripts/mcp-servers/gdd-mcp/tools/gdd_status.ts
//
// Plan 27.7-02. Thin wrapper over scripts/lib/gdd-state. NO fs/path
// imports here — all I/O via gdd-state.read() + shared.ts helpers.

import { read } from '../../../lib/gdd-state/index.ts';
import {
  errorResponse,
  okResponse,
  resolveStatePath,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_status';
export const schemaPath = '../schemas/gdd_status.schema.json';

export async function handle(_input: unknown): Promise<ToolResponse> {
  try {
    const state = await read(resolveStatePath());
    const completed = (state.must_haves ?? []).filter((m) => m.status === 'pass');
    return okResponse({
      phase: state.frontmatter.cycle ?? null,
      branch: process.env['GIT_BRANCH'] ?? null,
      last_decisions: (state.decisions ?? []).slice(-3),
      last_completed_plans: completed.slice(-3),
      blocker_count: (state.blockers ?? []).length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
