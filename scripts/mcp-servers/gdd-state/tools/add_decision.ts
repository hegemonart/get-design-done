// scripts/mcp-servers/gdd-state/tools/add_decision.ts
//
// Tool: gdd_state__add_decision
// Purpose: Append one entry to <decisions>. Auto-allocates D-N id by
// scanning existing decisions when the caller doesn't supply one.
// Emits state.mutation on success.

import { mutate } from '../../../lib/gdd-state/index.ts';
import type { Decision } from '../../../lib/gdd-state/types.ts';
import {
  emitStateMutation,
  errorResponse,
  okResponse,
  resolveStatePath,
  throwValidation,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_state__add_decision';
export const schemaPath = '../schemas/add_decision.schema.json';

export interface AddDecisionInput {
  text: string;
  status?: 'locked' | 'tentative';
  id?: string;
}

const ID_RE = /^D-([0-9]+)$/;

/**
 * Compute the next `D-N` id. The strategy mirrors the existing
 * reference template: take the max numeric suffix seen and add 1.
 * Falls back to `D-1` when the list is empty.
 */
function nextDecisionId(existing: Decision[]): string {
  let max = 0;
  for (const d of existing) {
    const m = d.id.match(ID_RE);
    if (m && m[1] !== undefined) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `D-${max + 1}`;
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as AddDecisionInput;
    if (typeof typed.text !== 'string' || typed.text.length === 0) {
      throwValidation('MISSING_FIELD', 'add_decision requires a non-empty text');
    }
    if (
      typed.status !== undefined &&
      typed.status !== 'locked' &&
      typed.status !== 'tentative'
    ) {
      throwValidation(
        'STATUS_INVALID',
        `status "${String(typed.status)}" is not one of locked/tentative`,
      );
    }
    if (typed.id !== undefined && !ID_RE.test(typed.id)) {
      throwValidation('ID_FORMAT', `id "${typed.id}" must match D-<digits>`);
    }

    const path = resolveStatePath();
    let appended: Decision | null = null;
    let countAfter = 0;
    const after = await mutate(path, (s) => {
      const decision: Decision = {
        id: typed.id ?? nextDecisionId(s.decisions),
        text: typed.text,
        status: typed.status ?? 'tentative',
      };
      s.decisions.push(decision);
      appended = decision;
      countAfter = s.decisions.length;
      return s;
    });
    if (appended === null) {
      throwValidation('INTERNAL', 'decision was not appended (unreachable)');
    }
    emitStateMutation(name, { appended, count: countAfter }, after);
    return okResponse({ decision: appended, count: countAfter });
  } catch (err) {
    return errorResponse(err);
  }
}
