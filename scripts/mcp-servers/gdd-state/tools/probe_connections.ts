// scripts/mcp-servers/gdd-state/tools/probe_connections.ts
//
// Tool: gdd_state__probe_connections
// Purpose: Merge probe results into <connections>. Overwrites keys
// present in the input; DOES NOT delete keys not in the input (plan
// contract). Emits state.mutation on success.

import { mutate } from '../../../lib/gdd-state/index.ts';
import {
  isConnectionStatus,
  type ConnectionStatus,
} from '../../../lib/gdd-state/types.ts';
import {
  emitStateMutation,
  errorResponse,
  okResponse,
  resolveStatePath,
  throwValidation,
  type ToolResponse,
} from './shared.ts';

export const name = 'gdd_state__probe_connections';
export const schemaPath = '../schemas/probe_connections.schema.json';

export interface ProbeConnectionsInput {
  probe_results: Array<{ name: string; status: ConnectionStatus }>;
}

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const typed = (input ?? {}) as ProbeConnectionsInput;
    if (!Array.isArray(typed.probe_results) || typed.probe_results.length === 0) {
      throwValidation(
        'MISSING_FIELD',
        'probe_connections requires a non-empty probe_results array',
      );
    }
    for (const p of typed.probe_results) {
      if (!p || typeof p.name !== 'string' || p.name.length === 0) {
        throwValidation(
          'PROBE_RESULT_NAME',
          'each probe_result must have a non-empty name',
        );
      }
      if (!isConnectionStatus(p.status)) {
        throwValidation(
          'PROBE_RESULT_STATUS',
          `status "${String(p.status)}" is not one of available/unavailable/not_configured`,
        );
      }
    }

    const path = resolveStatePath();
    const updated: string[] = [];
    const diff: Record<string, { before: string | null; after: string }> = {};
    const after = await mutate(path, (s) => {
      for (const p of typed.probe_results) {
        const before: string | null =
          Object.prototype.hasOwnProperty.call(s.connections, p.name)
            ? (s.connections[p.name] as string)
            : null;
        s.connections[p.name] = p.status;
        updated.push(p.name);
        diff[p.name] = { before, after: p.status };
      }
      return s;
    });
    emitStateMutation(name, { diff }, after);
    return okResponse({ updated, connections: after.connections });
  } catch (err) {
    return errorResponse(err);
  }
}
