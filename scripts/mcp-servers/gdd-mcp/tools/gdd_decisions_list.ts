// scripts/mcp-servers/gdd-mcp/tools/gdd_decisions_list.ts
//
// Plan 27.7-02. Reads <decisions> block from STATE.md. Optional
// input.status filter narrows the list to one DecisionStatus.

import { read } from '../../../lib/gdd-state/index.ts';
import {
  errorResponse,
  okResponse,
  resolveStatePath,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_decisions_list';
export const schemaPath = '../schemas/gdd_decisions_list.schema.json';

interface DecisionsInput {
  status?: string;
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as DecisionsInput;
    const state = await read(resolveStatePath());
    let decisions = state.decisions ?? [];
    if (typeof typed.status === 'string' && typed.status.length > 0) {
      decisions = decisions.filter((d) => d.status === typed.status);
    }
    return okResponse({ decisions });
  } catch (err) {
    return errorResponse(err);
  }
}
