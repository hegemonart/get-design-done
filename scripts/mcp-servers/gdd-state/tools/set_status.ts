// scripts/mcp-servers/gdd-state/tools/set_status.ts
//
// Tool: gdd_state__set_status
// Purpose: Update <position>.status. Thin convenience wrapper over
// update_progress — kept separate so skill prose can call the narrowest
// tool possible (reduces mis-writes to task_progress). Emits state.mutation.

import { mutate } from '../../../lib/gdd-state/index.ts';
import {
  emitStateMutation,
  errorResponse,
  okResponse,
  resolveStatePath,
  throwValidation,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_state__set_status';
export const schemaPath = '../schemas/set_status.schema.json';

export interface SetStatusInput {
  status: 'initialized' | 'in_progress' | 'completed' | 'blocked';
}

const STATUSES = new Set([
  'initialized',
  'in_progress',
  'completed',
  'blocked',
]);

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as SetStatusInput;
    if (typeof typed.status !== 'string' || !STATUSES.has(typed.status)) {
      throwValidation(
        'STATUS_INVALID',
        `status "${String(typed.status)}" is not one of initialized/in_progress/completed/blocked`,
      );
    }

    const path = resolveStatePath();
    const diff: Record<string, unknown> = {};
    const after = await mutate(path, (s) => {
      diff['status'] = { before: s.position.status, after: typed.status };
      s.position.status = typed.status;
      return s;
    });
    emitStateMutation(name, diff, after);
    return okResponse({ status: after.position.status });
  } catch (err) {
    return errorResponse(err);
  }
}
