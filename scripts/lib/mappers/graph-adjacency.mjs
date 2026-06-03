// scripts/lib/mappers/graph-adjacency.mjs — Phase 53 (Semantic Mapper Engine), executor A.
//
// Shared adjacency substrate factored from design-context-query.cjs#_adjacency
// (Phase 52). Pure, dependency-free ESM. Where design-context-query builds an
// unweighted direction-aware Map<id, Set<id>> for traversal/path/cycle work,
// this builder additionally ACCUMULATES edge weights into a weighted adjacency
// (Map<id, Map<neighborId, weight>>) so the Louvain batcher and the neighborMap
// can rank/score on tie strength. Direction handling is identical to Phase 52:
//   forward       -> source reaches target
//   backward      -> target reaches source
//   bidirectional -> both
//
// Determinism: no Math.random, no Date.now, no iteration over insertion-order
// that leaks into output (callers sort before emitting). Self-loops are dropped
// (a node is never its own neighbor) since communities/neighbors are external by
// definition.
//
// Public API:
//   buildAdjacency(graph, {undirected=false})
//     -> Map<id, Map<neighborId, weight>>   (weights summed across parallel edges)
//   degreeIndex(graph)
//     -> Map<id, number>                     (total incident edge count, undirected)

/** Node array accessor tolerant of a malformed graph. */
function nodeList(graph) {
  return Array.isArray(graph && graph.nodes) ? graph.nodes : [];
}

/** Edge array accessor tolerant of a malformed graph. */
function edgeList(graph) {
  return Array.isArray(graph && graph.edges) ? graph.edges : [];
}

/** A finite, non-negative numeric weight; defaults to 1 when absent/invalid. */
function edgeWeight(e) {
  const w = e && e.weight;
  return typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : 1;
}

/**
 * Build a weighted adjacency map honoring edge direction (Phase-52 semantics),
 * accumulating weights across parallel edges between the same pair.
 *
 * Directed mode (default): a `forward` edge adds source->target; `backward`
 * adds target->source; `bidirectional` adds both. Each entry's weight is the
 * SUM of all qualifying edge weights for that ordered (from,to) pair.
 *
 * Undirected mode ({undirected:true}): direction is folded away — every edge
 * (regardless of `direction`) contributes its weight to BOTH from->to and
 * to->from, exactly once per edge. A `bidirectional` edge is therefore counted
 * once (not twice) in each direction, matching the intuition that an undirected
 * tie has a single strength. Parallel edges still sum.
 *
 * Self-loops (source === target) are dropped in both modes.
 *
 * Every node id present in graph.nodes is seeded with an (possibly empty) entry
 * so callers can iterate the full node set; edge endpoints not present as nodes
 * are also indexed (callers needing strict membership intersect with the id set).
 *
 * @param {object} graph
 * @param {{undirected?: boolean}} [opts]
 * @returns {Map<string, Map<string, number>>}
 */
export function buildAdjacency(graph, opts = {}) {
  const undirected = opts.undirected === true;
  const adj = new Map();

  const ensure = (id) => {
    let m = adj.get(id);
    if (!m) { m = new Map(); adj.set(id, m); }
    return m;
  };
  const addDirected = (from, to, w) => {
    if (from === to) return; // drop self-loops
    const m = ensure(from);
    m.set(to, (m.get(to) || 0) + w);
  };

  for (const n of nodeList(graph)) {
    if (n && typeof n.id === 'string') ensure(n.id);
  }

  for (const e of edgeList(graph)) {
    if (!e || typeof e.source !== 'string' || typeof e.target !== 'string') continue;
    const w = edgeWeight(e);
    if (undirected) {
      // Fold direction away: one undirected tie of strength w, both ways once.
      addDirected(e.source, e.target, w);
      addDirected(e.target, e.source, w);
      continue;
    }
    const dir = e.direction;
    if (dir === 'forward' || dir === 'bidirectional') addDirected(e.source, e.target, w);
    if (dir === 'backward' || dir === 'bidirectional') addDirected(e.target, e.source, w);
  }

  return adj;
}

/**
 * Total incident edge count per node (undirected degree), counting every edge
 * once per endpoint regardless of direction. Parallel edges each count. A node
 * with no incident edge maps to 0 (it is still present in the index). Self-loops
 * are excluded (consistent with buildAdjacency dropping them).
 *
 * This is a structural count (number of edges touching the node), independent of
 * edge weights — distinct from the weighted-degree (Σ weights) a modularity pass
 * computes from buildAdjacency. Used to rank neighbors by connectedness.
 *
 * @param {object} graph
 * @returns {Map<string, number>}
 */
export function degreeIndex(graph) {
  const deg = new Map();
  const bump = (id, by) => deg.set(id, (deg.get(id) || 0) + by);

  for (const n of nodeList(graph)) {
    if (n && typeof n.id === 'string' && !deg.has(n.id)) deg.set(n.id, 0);
  }

  for (const e of edgeList(graph)) {
    if (!e || typeof e.source !== 'string' || typeof e.target !== 'string') continue;
    if (e.source === e.target) continue; // self-loop excluded
    bump(e.source, 1);
    bump(e.target, 1);
  }

  return deg;
}
