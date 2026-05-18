// scripts/mcp-servers/gdd-mcp/tools/gdd_plans_list.ts
//
// Plan 27.7-02. STATE.md does not have a dedicated <plans> block — we
// surface must_haves as the closest analog (the per-plan acceptance
// criteria the pipeline tracks). Input.phase is reserved for future
// multi-phase indexing.

import { read } from '../../../lib/gdd-state/index.ts';
import {
  errorResponse,
  okResponse,
  resolveStatePath,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_plans_list';
export const schemaPath = '../schemas/gdd_plans_list.schema.json';

interface PlansInput {
  phase?: string;
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as PlansInput;
    const state = await read(resolveStatePath());
    const plans = (state.must_haves ?? []).map((m) => ({
      id: m.id,
      name: m.text,
      status: m.status,
    }));
    return okResponse({
      phase: typed.phase ?? state.frontmatter.cycle ?? null,
      plans,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
