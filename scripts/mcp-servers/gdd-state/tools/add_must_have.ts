// scripts/mcp-servers/gdd-state/tools/add_must_have.ts
//
// Tool: gdd_state__add_must_have
// Purpose: Insert-or-update one entry in <must_haves>. Auto-allocates
// M-N id by scanning existing must_haves when the caller doesn't
// supply one. When the caller supplies an `id` that already exists,
// the entry is updated in-place (same position in the block) — this
// is the canonical "flip a must-have status" idiom used by the verify
// skill (see skills/verify/SKILL.md "Flipping a must-have status").
// Emits state.mutation on success with `action: "insert" | "update"`.

import { mutate } from '../../../lib/gdd-state/index.ts';
import type { MustHave } from '../../../lib/gdd-state/types.ts';
import {
  emitStateMutation,
  errorResponse,
  okResponse,
  resolveStatePath,
  throwValidation,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_state__add_must_have';
export const schemaPath = '../schemas/add_must_have.schema.json';

export interface AddMustHaveInput {
  text: string;
  status?: 'pending' | 'pass' | 'fail';
  id?: string;
}

const ID_RE = /^M-([0-9]+)$/;

/** Max `M-N` suffix + 1, or `M-1` when the list is empty. */
function nextMustHaveId(existing: MustHave[]): string {
  let max = 0;
  for (const m of existing) {
    const match = m.id.match(ID_RE);
    if (match && match[1] !== undefined) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `M-${max + 1}`;
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as AddMustHaveInput;
    if (typeof typed.text !== 'string' || typed.text.length === 0) {
      throwValidation(
        'MISSING_FIELD',
        'add_must_have requires a non-empty text',
      );
    }
    if (
      typed.status !== undefined &&
      typed.status !== 'pending' &&
      typed.status !== 'pass' &&
      typed.status !== 'fail'
    ) {
      throwValidation(
        'STATUS_INVALID',
        `status "${String(typed.status)}" is not one of pending/pass/fail`,
      );
    }
    if (typed.id !== undefined && !ID_RE.test(typed.id)) {
      throwValidation('ID_FORMAT', `id "${typed.id}" must match M-<digits>`);
    }

    const path = resolveStatePath();
    let written: MustHave | null = null;
    let action: 'insert' | 'update' = 'insert';
    let countAfter = 0;
    const after = await mutate(path, (s) => {
      const mh: MustHave = {
        id: typed.id ?? nextMustHaveId(s.must_haves),
        text: typed.text,
        status: typed.status ?? 'pending',
      };
      // Update-in-place when the caller supplied an id that already
      // exists — preserves the entry's position in the <must_haves>
      // block. This is the canonical idiom the verify skill relies on
      // to flip `pending` → `pass`/`fail` without a dedicated
      // update_must_have_status tool.
      const existingIdx =
        typed.id !== undefined
          ? s.must_haves.findIndex((existing) => existing.id === mh.id)
          : -1;
      if (existingIdx >= 0) {
        s.must_haves[existingIdx] = mh;
        action = 'update';
      } else {
        s.must_haves.push(mh);
        action = 'insert';
      }
      written = mh;
      countAfter = s.must_haves.length;
      return s;
    });
    if (written === null) {
      throwValidation('INTERNAL', 'must_have was not written (unreachable)');
    }
    emitStateMutation(
      name,
      { must_have: written, action, count: countAfter },
      after,
    );
    return okResponse({ must_have: written, action, count: countAfter });
  } catch (err) {
    return errorResponse(err);
  }
}
