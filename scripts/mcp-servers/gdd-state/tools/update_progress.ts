// scripts/mcp-servers/gdd-state/tools/update_progress.ts
//
// Tool: gdd_state__update_progress
// Purpose: Update <position>.task_progress and/or <position>.status.
// Emits state.mutation on success.

import { mutate } from '../../../lib/gdd-state/index.ts';
import {
  emitStateMutation,
  errorResponse,
  okResponse,
  resolveStatePath,
  throwValidation,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_state__update_progress';
export const schemaPath = '../schemas/update_progress.schema.json';

export interface UpdateProgressInput {
  task_progress?: string;
  status?: 'initialized' | 'in_progress' | 'completed' | 'blocked';
}

/** Accept the same regex the JSON Schema enforces — double-check for
 *  defense in depth against a caller that somehow routes around schema
 *  validation (e.g. when we run the handler directly in a test). */
const TASK_PROGRESS_RE = /^[0-9]+\/[0-9]+$/;
const STATUSES = new Set([
  'initialized',
  'in_progress',
  'completed',
  'blocked',
]);

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as UpdateProgressInput;
    if (typed.task_progress === undefined && typed.status === undefined) {
      throwValidation(
        'MISSING_FIELD',
        'update_progress requires at least one of task_progress / status',
      );
    }
    if (typed.task_progress !== undefined) {
      if (!TASK_PROGRESS_RE.test(typed.task_progress)) {
        throwValidation(
          'TASK_PROGRESS_FORMAT',
          `task_progress "${typed.task_progress}" must match N/M (digits)`,
        );
      }
    }
    if (typed.status !== undefined && !STATUSES.has(typed.status)) {
      throwValidation(
        'STATUS_INVALID',
        `status "${typed.status}" is not one of initialized/in_progress/completed/blocked`,
      );
    }

    const path = resolveStatePath();
    const diff: Record<string, unknown> = {};
    const after = await mutate(path, (s) => {
      if (typed.task_progress !== undefined) {
        diff['task_progress'] = {
          before: s.position.task_progress,
          after: typed.task_progress,
        };
        s.position.task_progress = typed.task_progress;
      }
      if (typed.status !== undefined) {
        diff['status'] = { before: s.position.status, after: typed.status };
        s.position.status = typed.status;
      }
      return s;
    });
    emitStateMutation(name, diff, after);
    return okResponse({ position: after.position });
  } catch (err) {
    return errorResponse(err);
  }
}
