// scripts/lib/graph/query.mjs — Plan 30.6-03 Task 1
//
// queryGraph: read .design/graph/graph.json, tokenize the query, score
// nodes per D-04.a (+100 exact-id / +50 exact-label / +20 seed / +10
// token-in-label / +5 token-in-type / +1 token-in-attrs), walk 1-hop
// outbound edges to attach neighbors, then enforce a token budget
// (D-04 chars/4 heuristic via token-estimate.mjs) by dropping
// lowest-scored matches until the payload fits.
//
// Deterministic: identical (graph, query, budget) inputs produce
// byte-identical JSON output. Ties broken by lexicographic id.

import { readFileSync, existsSync } from 'node:fs';
import { compileValidator } from './schema.mjs';
import { estimateTokens } from './token-estimate.mjs';

const DEFAULT_GRAPH = '.design/graph/graph.json';
const DEFAULT_BUDGET = 8000;
const DEFAULT_TOP_K = 10;

/**
 * Query the native graph.
 *
 * @param {object} opts
 * @param {string} [opts.graphPath] - default '.design/graph/graph.json'
 * @param {string} opts.query       - search term (lowercased, tokenized)
 * @param {number} [opts.budget]    - max estimated tokens for return payload
 * @returns {{query:string, matches:Array<{node:object, score:number, neighbors:object[]}>, truncated:boolean}}
 * @throws GRAPH_MISSING when graphPath does not exist
 * @throws GRAPH_PARSE_FAILED when graph JSON cannot be parsed
 * @throws GRAPH_SCHEMA_INVALID when graph fails schema validation
 */
export function queryGraph({
  graphPath = DEFAULT_GRAPH,
  query = '',
  budget = DEFAULT_BUDGET,
} = {}) {
  if (!existsSync(graphPath)) {
    const err = new Error(`queryGraph: graph file not found at ${graphPath}`);
    err.code = 'GRAPH_MISSING';
    throw err;
  }

  let graph;
  try {
    graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  } catch (e) {
    const err = new Error(
      `queryGraph: failed to parse graph JSON at ${graphPath}: ${e.message}`,
    );
    err.code = 'GRAPH_PARSE_FAILED';
    err.cause = e;
    throw err;
  }

  const validate = compileValidator();
  if (!validate(graph)) {
    const err = new Error('queryGraph: graph failed schema validation');
    err.code = 'GRAPH_SCHEMA_INVALID';
    err.schemaErrors = validate.errors;
    throw err;
  }

  // ── Tokenize ────────────────────────────────────────────────────────
  const lowerQuery = String(query).toLowerCase().trim();
  const tokens = lowerQuery
    .split(/[^a-z0-9:_\-/.]+/)
    .filter((t) => t.length > 0);

  // ── Empty / no-token query short-circuit ────────────────────────────
  if (tokens.length === 0) {
    return { query, matches: [], truncated: false };
  }

  // ── Score each node ─────────────────────────────────────────────────
  // Identify seed nodes (label or id contains the full lowercase query) for the
  // +20 seed bonus before per-token scoring.
  const seedIds = new Set();
  for (const n of graph.nodes) {
    const idLower = String(n.id || '').toLowerCase();
    const labelLower = String(n.label || '').toLowerCase();
    if (
      lowerQuery.length > 0 &&
      (idLower.includes(lowerQuery) || labelLower.includes(lowerQuery))
    ) {
      seedIds.add(n.id);
    }
  }

  const scored = graph.nodes
    .map((node) => ({ node, score: scoreNode(node, tokens, lowerQuery, seedIds) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));

  // ── Build adjacency for 1-hop outbound walk ─────────────────────────
  const outbound = new Map();
  for (const e of graph.edges) {
    if (!outbound.has(e.from)) outbound.set(e.from, []);
    outbound.get(e.from).push(e);
  }
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  // ── Assemble matches with neighbors ─────────────────────────────────
  const candidates = scored.slice(0, DEFAULT_TOP_K).map(({ node, score }) => {
    const outs = outbound.get(node.id) || [];
    const neighbors = outs
      .map((e) => nodeById.get(e.to))
      .filter((n) => n !== undefined);
    return { node, score, neighbors };
  });

  // ── Budget-truncation loop ──────────────────────────────────────────
  let payload = { query, matches: candidates.slice(), truncated: false };
  while (
    estimateTokens(payload) > budget &&
    payload.matches.length > 0
  ) {
    payload.matches.pop(); // drop lowest-score (sorted desc → tail = lowest)
  }
  if (estimateTokens(payload) > budget) {
    payload = { query, matches: [], truncated: true };
  } else if (payload.matches.length < candidates.length) {
    payload.truncated = true;
  }

  return payload;
}

/**
 * Score a node per D-04.a:
 *   +100 exact-id match (case-insensitive)
 *   +50  exact-label match
 *   +20  seed bonus (node contained the full query as substring)
 *   +10  per token substring-match in label
 *   +5   per token substring-match in type
 *   +1   per token substring-match in attrs (JSON-stringified, lowercased)
 */
function scoreNode(node, tokens, lowerQuery, seedIds) {
  let score = 0;
  const idLower = String(node.id || '').toLowerCase();
  const labelLower = String(node.label || '').toLowerCase();
  const typeLower = String(node.type || '').toLowerCase();
  const attrsLower = JSON.stringify(node.attrs || {}).toLowerCase();

  if (lowerQuery && idLower === lowerQuery) score += 100;
  if (lowerQuery && labelLower === lowerQuery) score += 50;
  if (seedIds.has(node.id)) score += 20;

  for (const t of tokens) {
    if (labelLower.includes(t)) score += 10;
    if (typeLower.includes(t)) score += 5;
    if (attrsLower.includes(t)) score += 1;
  }
  return score;
}
