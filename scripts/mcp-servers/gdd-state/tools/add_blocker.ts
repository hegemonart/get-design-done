// scripts/mcp-servers/gdd-state/tools/add_blocker.ts
//
// Tool: gdd_state__add_blocker
// Purpose: Append one entry to <blockers>. Defaults the stage to the
// current <position>.stage and the date to today (UTC) when omitted.
// Emits state.mutation on success.

import { mutate } from '../../../lib/gdd-state/index.ts';
import type { Blocker } from '../../../lib/gdd-state/types.ts';
import {
  emitStateMutation,
  errorResponse,
  okResponse,
  resolveStatePath,
  throwValidation,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_state__add_blocker';
export const schemaPath = '../schemas/add_blocker.schema.json';

export interface AddBlockerInput {
  text: string;
  stage?: string;
  date?: string;
}

const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** Return today's date in YYYY-MM-DD (UTC). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as AddBlockerInput;
    if (typeof typed.text !== 'string' || typed.text.length === 0) {
      throwValidation('MISSING_FIELD', 'add_blocker requires a non-empty text');
    }
    if (typed.date !== undefined && !DATE_RE.test(typed.date)) {
      throwValidation(
        'DATE_FORMAT',
        `date "${typed.date}" must be YYYY-MM-DD`,
      );
    }

    const path = resolveStatePath();
    let appended: Blocker | null = null;
    let countAfter = 0;
    const after = await mutate(path, (s) => {
      const blocker: Blocker = {
        stage: typed.stage ?? s.position.stage ?? '',
        date: typed.date ?? today(),
        text: typed.text,
      };
      s.blockers.push(blocker);
      appended = blocker;
      countAfter = s.blockers.length;
      return s;
    });
    // appended is definitely set because mutate() ran fn(); but TS cannot
    // reason about that — narrow by asserting.
    if (appended === null) {
      throwValidation('INTERNAL', 'blocker was not appended (unreachable)');
    }
    emitStateMutation(name, { appended, count: countAfter }, after);
    return okResponse({ blocker: appended, count: countAfter });
  } catch (err) {
    return errorResponse(err);
  }
}
