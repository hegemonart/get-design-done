// sdk/mcp/hone-state/tools/get.ts
//
// Tool: hone_state__get
// Purpose: Read current STATE.md (parsed). Read-only; does NOT emit an
// event. Optionally projects a subset of fields when `input.fields` is
// provided; unknown field names are silently ignored so callers can pass
// a broad list without pre-flight knowledge of ParsedState shape.
//
// Phase 57 (Round 3-E): this tool already benefits from the SQLite read
// path transparently. `sdk/state/index.ts` `read()` delegates through the
// migration-active gate: when BACKEND==='sqlite' and a sibling state.sqlite
// exists the dual-write path keeps STATE.md byte-equal with SQLite state,
// so reading the on-disk STATE.md returns the canonical view regardless of
// which backend is active. No behavioral change is required here and the
// tool input/output SCHEMA IS UNCHANGED (no mcp-tools-manifest hash drift).

import { read } from '../../../state/index.ts';
import type { ParsedState } from '../../../state/types.ts';
import {
  assertInputWithinLimits,
  errorResponse,
  okResponse,
  resolveStatePath,
  type ToolResponse,
} from './shared.ts';

export const name = 'hone_state__get';
export const schemaPath = '../schemas/get.schema.json';

export interface GetInput {
  fields?: string[];
}

/**
 * Project a subset of top-level keys from `state`. Unknown keys are
 * omitted from the output but not treated as an error — the caller may
 * pass a broad list without knowing ParsedState's shape.
 */
function project(state: ParsedState, fields: string[]): Record<string, unknown> {
  const allowed = new Set(fields);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    assertInputWithinLimits(input);
    const typed = (input ?? {}) as GetInput;
    const path = resolveStatePath();
    const state = await read(path);
    const fields = Array.isArray(typed.fields) ? typed.fields : null;
    const stateOut =
      fields === null || fields.length === 0 ? state : project(state, fields);
    return okResponse({ state: stateOut, path });
  } catch (err) {
    return errorResponse(err);
  }
}
