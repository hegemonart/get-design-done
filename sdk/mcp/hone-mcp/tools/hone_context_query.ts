// sdk/mcp/hone-mcp/tools/hone_context_query.ts
//
// Phase 52 (DesignContext graph keystone). Read-only query surface over the
// typed DesignContext graph at `.design/context-graph.json`. Thin tool: the
// fs read + every query lives in scripts/lib/design-context-query.cjs (sibling
// A); this file only dispatches `op`. Graceful: a missing/unreadable graph
// returns a structured `{ graph_present: false }` result rather than throwing
// (the same missing-data discipline the other read tools follow).

import {
  load, nodes, edges, path as findPath, consumersOf, unreachable, cycles, coverage,
} from '../../../../scripts/lib/design-context-query.cjs';
import { errorResponse, okResponse, resolveProjectRoot, type ToolResponse } from './shared.ts';

export const name = 'hone_context_query';
export const schemaPath = '../schemas/hone_context_query.schema.json';

interface CtxInput { op?: string; type?: string; tag?: string; from?: string; to?: string; id?: string; }

export async function handle(input: unknown): Promise<ToolResponse> {
  try {
    const t = (input ?? {}) as CtxInput;
    let graph: unknown = null;
    const ops: Record<string, () => unknown> = {
      nodes: () => nodes(graph, { type: t.type, tag: t.tag }), edges: () => edges(graph, { type: t.type }),
      path: () => findPath(graph, t.from, t.to), 'consumers-of': () => consumersOf(graph, t.id),
      unreachable: () => unreachable(graph), cycles: () => cycles(graph), coverage: () => coverage(graph),
    };
    const fn = t.op ? ops[t.op] : undefined;
    if (!fn) return errorResponse(new Error('op is required — one of: ' + Object.keys(ops).join(', ')));
    try { graph = load(resolveProjectRoot() + '/.design/context-graph.json'); } catch { graph = null; }
    if (!graph) return okResponse({ op: t.op, graph_present: false, result: null });
    return okResponse({ op: t.op, graph_present: true, result: fn() });
  } catch (err) { return errorResponse(err); }
}
