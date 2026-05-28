// scripts/lib/graph/upsert.mjs — Plan 30.6-03 Task 2
//
// upsertNode + upsertEdge: read existing graph.json (bootstrap empty
// schemaVersion-1.0 envelope if missing), apply mutation, schema-validate
// the full graph BEFORE atomic write (per D-03 + D-05). Referential
// integrity is enforced at the upsert layer (NOT in the JSON schema) per
// 30.6-02's schema design: edges must reference nodes that already exist.
//
// Idempotency contract: same (id) for nodes / same (from,to,kind) for
// edges → last-write-wins, no duplicate rows, action='updated'.

import { readFileSync, existsSync } from 'node:fs';
import { compileValidator, SCHEMA_VERSION } from './schema.mjs';
import { atomicWriteJson } from './atomic-write.mjs';

const DEFAULT_GRAPH = '.design/graph/graph.json';

/**
 * Upsert a node into the graph (create if missing, replace by id if present).
 *
 * @param {object} opts
 * @param {string} [opts.graphPath] - default '.design/graph/graph.json'
 * @param {object} opts.node        - { id, type, label?, attrs?, source? }
 * @returns {{ok: true, action: 'created'|'updated', nodeCount: number}}
 * @throws GDD_GRAPH_INVALID_NODE on missing/invalid id
 * @throws GDD_GRAPH_SCHEMA_INVALID on schema-violating input
 */
export function upsertNode({ graphPath = DEFAULT_GRAPH, node } = {}) {
  if (!node || typeof node !== 'object') {
    const err = new Error('upsertNode: node parameter is required and must be an object');
    err.code = 'GDD_GRAPH_INVALID_NODE';
    throw err;
  }
  if (typeof node.id !== 'string' || node.id.length === 0) {
    const err = new Error('upsertNode: node.id is required and must be a non-empty string');
    err.code = 'GDD_GRAPH_INVALID_NODE';
    throw err;
  }
  if (typeof node.type !== 'string' || node.type.length === 0) {
    const err = new Error('upsertNode: node.type is required and must be a non-empty string');
    err.code = 'GDD_GRAPH_INVALID_NODE';
    throw err;
  }

  const graph = loadOrBootstrap(graphPath);

  const idx = graph.nodes.findIndex((n) => n.id === node.id);
  let action;
  if (idx === -1) {
    graph.nodes.push(node);
    action = 'created';
  } else {
    graph.nodes[idx] = node;
    action = 'updated';
  }

  graph.metadata.nodeCount = graph.nodes.length;
  graph.metadata.edgeCount = graph.edges.length;

  validateOrThrow(graph, 'upsertNode');
  atomicWriteJson(graphPath, graph);

  return { ok: true, action, nodeCount: graph.nodes.length };
}

/**
 * Upsert an edge into the graph. Identity = `${from}::${to}::${kind}`.
 *
 * Referential integrity: both `from` and `to` must reference existing nodes.
 * Schema enforces only field-shape; the existence check is an upsert-layer
 * concern (per 30.6-02 schema design + RESEARCH.md §upsert-edge contract).
 *
 * @param {object} opts
 * @param {string} [opts.graphPath]
 * @param {object} opts.edge - { from, to, kind, weight?, attrs?, source? }
 * @returns {{ok: true, action: 'created'|'updated', edgeCount: number}}
 * @throws GDD_GRAPH_INVALID_EDGE on missing required fields
 * @throws GDD_GRAPH_MISSING when graph file does not exist (edges can't
 *         precede nodes; create at least one node first via upsertNode)
 * @throws GDD_GRAPH_MISSING_ENDPOINT with missingEndpoints[] when from/to
 *         do not reference existing nodes
 * @throws GDD_GRAPH_SCHEMA_INVALID when the mutated graph violates schema
 */
export function upsertEdge({ graphPath = DEFAULT_GRAPH, edge } = {}) {
  if (!edge || typeof edge !== 'object') {
    const err = new Error('upsertEdge: edge parameter is required and must be an object');
    err.code = 'GDD_GRAPH_INVALID_EDGE';
    throw err;
  }
  for (const field of ['from', 'to', 'kind']) {
    if (typeof edge[field] !== 'string' || edge[field].length === 0) {
      const err = new Error(
        `upsertEdge: edge.${field} is required and must be a non-empty string`,
      );
      err.code = 'GDD_GRAPH_INVALID_EDGE';
      throw err;
    }
  }

  // Edges cannot exist before nodes — file-missing is a hard error.
  if (!existsSync(graphPath)) {
    const err = new Error(
      `upsertEdge: graph file not found at ${graphPath} — create at least one node first via upsertNode`,
    );
    err.code = 'GDD_GRAPH_MISSING';
    throw err;
  }

  const graph = loadOrBootstrap(graphPath);

  // Referential integrity check.
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const missingEndpoints = [];
  if (!nodeIds.has(edge.from)) missingEndpoints.push(edge.from);
  if (!nodeIds.has(edge.to)) missingEndpoints.push(edge.to);
  if (missingEndpoints.length) {
    const err = new Error(
      `upsertEdge: missing endpoint node(s): ${missingEndpoints.join(', ')}`,
    );
    err.code = 'GDD_GRAPH_MISSING_ENDPOINT';
    err.missingEndpoints = missingEndpoints;
    throw err;
  }

  // Edge identity per D-03.b + upstream diff formula: from::to::kind.
  const idx = graph.edges.findIndex(
    (e) => e.from === edge.from && e.to === edge.to && e.kind === edge.kind,
  );
  let action;
  if (idx === -1) {
    graph.edges.push(edge);
    action = 'created';
  } else {
    graph.edges[idx] = edge;
    action = 'updated';
  }

  graph.metadata.nodeCount = graph.nodes.length;
  graph.metadata.edgeCount = graph.edges.length;

  validateOrThrow(graph, 'upsertEdge');
  atomicWriteJson(graphPath, graph);

  return { ok: true, action, edgeCount: graph.edges.length };
}

// ────────────────────────── helpers ──────────────────────────

/**
 * Load graph from disk, or bootstrap a schema-1.0 envelope if missing.
 * Throws GDD_GRAPH_PARSE_FAILED on JSON parse error (manual edit broke it).
 */
function loadOrBootstrap(graphPath) {
  if (!existsSync(graphPath)) {
    return {
      schemaVersion: SCHEMA_VERSION,
      metadata: {
        generatedAt: new Date().toISOString(),
        nodeCount: 0,
        edgeCount: 0,
        builderVersion: '1.30.6',
      },
      nodes: [],
      edges: [],
    };
  }

  try {
    const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
    // Defensive: ensure metadata/nodes/edges containers exist (a hand-edited
    // file may have shed them — upsert should not crash before the
    // validator can flag the corruption).
    if (!graph.metadata) graph.metadata = { generatedAt: new Date().toISOString(), nodeCount: 0, edgeCount: 0 };
    if (!Array.isArray(graph.nodes)) graph.nodes = [];
    if (!Array.isArray(graph.edges)) graph.edges = [];
    return graph;
  } catch (e) {
    const err = new Error(
      `upsert: failed to parse graph JSON at ${graphPath}: ${e.message}`,
    );
    err.code = 'GDD_GRAPH_PARSE_FAILED';
    err.cause = e;
    throw err;
  }
}

/**
 * Validate full graph against schema 1.0 before write.
 * Distinguish input-shape errors (caller passed a bad node/edge) from
 * GDD_GRAPH_INVALID_{NODE,EDGE} (which are pre-write field-presence checks).
 */
function validateOrThrow(graph, op) {
  const validate = compileValidator();
  if (!validate(graph)) {
    // Map Ajv path errors back to actionable codes when possible.
    const hasNodeError = (validate.errors || []).some((e) =>
      String(e.instancePath || '').startsWith('/nodes'),
    );
    const hasEdgeError = (validate.errors || []).some((e) =>
      String(e.instancePath || '').startsWith('/edges'),
    );
    let code = 'GDD_GRAPH_SCHEMA_INVALID';
    if (op === 'upsertNode' && hasNodeError) code = 'GDD_GRAPH_INVALID_NODE';
    if (op === 'upsertEdge' && hasEdgeError) code = 'GDD_GRAPH_INVALID_EDGE';
    const err = new Error(`${op}: graph failed schema validation`);
    err.code = code;
    err.schemaErrors = validate.errors;
    throw err;
  }
}
