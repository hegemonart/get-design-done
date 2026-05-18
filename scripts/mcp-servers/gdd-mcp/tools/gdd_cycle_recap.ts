// scripts/mcp-servers/gdd-mcp/tools/gdd_cycle_recap.ts
//
// Plan 27.7-02. Diffs current STATE.md against the latest .design/snapshots/
// snapshot. SnapshotNotFoundError → directory_not_found via errorResponse.

import { read } from '../../../lib/gdd-state/index.ts';
import { readLatestSnapshot } from '../../../lib/snapshot-reader/index.cjs';
import { errorResponse, okResponse, resolveProjectRoot, resolveStatePath, type ToolResponse } from './shared.ts';

export const name = 'gdd_cycle_recap';
export const schemaPath = '../schemas/gdd_cycle_recap.schema.json';

function snapCount(snap: Record<string, unknown>, key: string, fallback: string): number {
  if (typeof snap[key] === 'number') return snap[key] as number;
  const arr = snap[fallback];
  return Array.isArray(arr) ? arr.length : 0;
}

export async function handle(_input: unknown): Promise<ToolResponse> {
  try {
    const snap = await readLatestSnapshot(resolveProjectRoot());
    const state = await read(resolveStatePath());
    if (snap === null) return okResponse({ since: null, diff: { state_sections: [], decisions_delta: 0, completed_plans_delta: 0 } });
    const decisionsNow = (state.decisions ?? []).length;
    const completedNow = (state.must_haves ?? []).filter((m) => m.status === 'pass').length;
    return okResponse({
      since: snap.since,
      diff: {
        state_sections: Object.keys(state),
        decisions_delta: decisionsNow - snapCount(snap.snapshot, 'decisions_count', 'last_n_decisions'),
        completed_plans_delta: completedNow - snapCount(snap.snapshot, 'completed_plans_count', '_unused'),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
