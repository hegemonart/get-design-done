// scripts/mcp-servers/gdd-state/tools/resolve_blocker.ts
//
// Tool: gdd_state__resolve_blocker
// Purpose: Remove one entry from <blockers> by 0-based index OR by
// exact text match (first match). Returns operation_failed when no row
// matches — input is well-formed, but the operation cannot complete in
// the current state. Emits state.mutation on successful removal.

import { mutate } from '../../../lib/gdd-state/index.ts';
import type { Blocker } from '../../../lib/gdd-state/types.ts';
import {
  emitStateMutation,
  errorResponse,
  okResponse,
  operationFailed,
  resolveStatePath,
  throwValidation,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_state__resolve_blocker';
export const schemaPath = '../schemas/resolve_blocker.schema.json';

export interface ResolveBlockerInput {
  index?: number;
  text?: string;
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as ResolveBlockerInput;
    const hasIndex = typeof typed.index === 'number';
    const hasText = typeof typed.text === 'string' && typed.text.length > 0;
    if (hasIndex === hasText) {
      throwValidation(
        'ONEOF_REQUIRED',
        'resolve_blocker requires exactly one of: index OR text',
      );
    }
    if (hasIndex && (typed.index as number) < 0) {
      throwValidation('INDEX_NEGATIVE', 'index must be >= 0');
    }

    const path = resolveStatePath();
    let removed: Blocker | null = null;
    let countAfter = 0;
    const after = await mutate(path, (s) => {
      if (hasIndex) {
        const idx = typed.index as number;
        if (idx >= s.blockers.length) {
          operationFailed(
            'BLOCKER_NOT_FOUND',
            `no blocker at index ${idx} (length=${s.blockers.length})`,
            { index: idx, length: s.blockers.length },
          );
        }
        const [deleted] = s.blockers.splice(idx, 1);
        removed = deleted ?? null;
      } else {
        const target = typed.text as string;
        const idx = s.blockers.findIndex((b) => b.text === target);
        if (idx === -1) {
          operationFailed(
            'BLOCKER_NOT_FOUND',
            `no blocker matches text "${target}"`,
            { text: target },
          );
        }
        const [deleted] = s.blockers.splice(idx, 1);
        removed = deleted ?? null;
      }
      countAfter = s.blockers.length;
      return s;
    });
    if (removed === null) {
      // Unreachable — mutate's fn either removed a row or threw.
      operationFailed('BLOCKER_NOT_FOUND', 'no blocker was removed (unreachable)');
    }
    emitStateMutation(name, { removed, count: countAfter }, after);
    return okResponse({ removed, count: countAfter });
  } catch (err) {
    return errorResponse(err);
  }
}
