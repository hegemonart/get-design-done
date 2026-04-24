// scripts/mcp-servers/gdd-state/tools/checkpoint.ts
//
// Tool: gdd_state__checkpoint
// Purpose: Update frontmatter.last_checkpoint and append an entry in
// <timestamps>. The timestamp key is `<label>_at` when `input.label` is
// supplied, otherwise `<stage>_checkpoint_at` falling back to
// `checkpoint_at` if the position.stage is empty. Emits state.mutation.

import { mutate } from '../../../lib/gdd-state/index.ts';
import {
  emitStateMutation,
  errorResponse,
  okResponse,
  resolveStatePath,
  throwValidation,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_state__checkpoint';
export const schemaPath = '../schemas/checkpoint.schema.json';

export interface CheckpointInput {
  label?: string;
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as CheckpointInput;
    if (
      typed.label !== undefined &&
      (typeof typed.label !== 'string' || typed.label.length === 0)
    ) {
      throwValidation('LABEL_FORMAT', 'label must be a non-empty string');
    }

    const path = resolveStatePath();
    const nowIso = new Date().toISOString();
    let timestampKey = '';
    const after = await mutate(path, (s) => {
      s.frontmatter.last_checkpoint = nowIso;
      const stage = typeof s.position.stage === 'string' ? s.position.stage : '';
      timestampKey =
        typed.label !== undefined
          ? `${typed.label}_at`
          : stage.length > 0
            ? `${stage}_checkpoint_at`
            : 'checkpoint_at';
      s.timestamps[timestampKey] = nowIso;
      return s;
    });
    emitStateMutation(
      name,
      { last_checkpoint: nowIso, timestamp_key: timestampKey },
      after,
    );
    return okResponse({ last_checkpoint: nowIso, timestamp_key: timestampKey });
  } catch (err) {
    return errorResponse(err);
  }
}
