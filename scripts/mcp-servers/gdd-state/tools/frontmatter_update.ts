// scripts/mcp-servers/gdd-state/tools/frontmatter_update.ts
//
// Tool: gdd_state__frontmatter_update
// Purpose: Patch one or more frontmatter fields. Rejects two forbidden
// keys:
//   * `pipeline_state_version` — immutable version pin
//   * `stage`                  — must use transition_stage (which runs
//                                gates and emits state.transition)
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

export const name = 'gdd_state__frontmatter_update';
export const schemaPath = '../schemas/frontmatter_update.schema.json';

export interface FrontmatterUpdateInput {
  patch: Record<string, string | number | boolean>;
}

/** Keys that this tool explicitly refuses to modify. */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  'pipeline_state_version',
  'stage',
]);

/** Accept only scalar values (string / number / boolean). */
function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as FrontmatterUpdateInput;
    if (
      typed.patch === undefined ||
      typed.patch === null ||
      typeof typed.patch !== 'object'
    ) {
      throwValidation(
        'MISSING_FIELD',
        'frontmatter_update requires an object patch',
      );
    }
    const keys = Object.keys(typed.patch);
    if (keys.length === 0) {
      throwValidation('EMPTY_PATCH', 'patch must contain at least one key');
    }
    for (const k of keys) {
      if (FORBIDDEN_KEYS.has(k)) {
        throwValidation(
          'FORBIDDEN_KEY',
          `patching "${k}" is not allowed via frontmatter_update (stage must go through transition_stage)`,
          { key: k },
        );
      }
      const value = (typed.patch as Record<string, unknown>)[k];
      if (!isScalar(value)) {
        throwValidation(
          'NON_SCALAR_VALUE',
          `patch value for "${k}" must be a string, number, or boolean`,
          { key: k },
        );
      }
    }

    const path = resolveStatePath();
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    const after = await mutate(path, (s) => {
      for (const k of keys) {
        const before = s.frontmatter[k];
        const value = (typed.patch as Record<string, unknown>)[k];
        // We restored the scalar invariant above, so this narrow is safe.
        s.frontmatter[k] = value;
        diff[k] = { before, after: value };
      }
      return s;
    });
    emitStateMutation(name, { diff }, after);
    return okResponse({ frontmatter: after.frontmatter, keys });
  } catch (err) {
    return errorResponse(err);
  }
}
