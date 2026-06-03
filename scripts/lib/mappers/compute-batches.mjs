// scripts/lib/mappers/compute-batches.mjs — Phase 53 (Semantic Mapper Engine), executor A.
//
// Deterministic, dependency-free community batching over a DesignContext graph
// (Phase 52 shape). Groups graph nodes into mapper-sized batches so the explore
// runner can dispatch each community to a mapper instance (the batching extends
// explore-parallel-runner per CONTEXT R1; THIS file owns only the pure engine).
//
// Algorithm: a self-contained two-phase Louvain modularity maximization (NO
// graphology, NO new dependency — CONTEXT R5/D7). The graph it optimizes is an
// UNDIRECTED WEIGHTED graph over file-bearing nodes:
//   - component nodes are the primary anchors;
//   - a non-component node (variant/layer/token/...) that is OWNED by a component
//     (variant --extends--> component; token used by exactly one component; layer
//     attached to one component) FOLDS into that component — it is not its own
//     Louvain node, and it inherits the owner's community in the flat result;
//   - structural edges (composes/extends/depends-on/consumes-context/
//     provides-context) between two anchors contribute their edge weight;
//   - uses-token contributes an INVERSE-FREQUENCY-DAMPED token-cohesion weight:
//     each token shared by a pair of components adds 1/log(1+deg(token)) to that
//     component-pair's edge weight, so a globally-used token does not collapse
//     every component into one blob;
//   - non-component nodes that connect only to other non-component nodes (no
//     component owner) remain standalone anchors and cluster among themselves
//     into "semantic groups" (token/motion/a11y batches, mergeable:false).
//
// Determinism (hard contract, CONTEXT D6): nodes are iterated in a FIXED
// LEXICOGRAPHIC order (the only "seed" — NO Math.random); ties on a modularity
// move break to the smallest community id then the smallest node id; aggregation
// and unfolding sort before emitting. Identical batches on win32 + Linux + macOS.
//
// Safety nets:
//   - try/catch around the whole optimization → count-fallback (alphabetical
//     fallbackBatchSize-file batches) on ANY throw or fewer than 2 anchors;
//   - MAX_COMMUNITY_SIZE overflow → alphabetical sub-split (labels c7, c7-2, …);
//   - small-batch merger pools singleton code communities into <=miscCap "misc"
//     batches; non-code semantic groups are emitted with mergeable:false so the
//     merger never folds them.
//
// Public API:
//   computeBatches(graph, opts?) -> {
//     batches: Array<{ id, members:string[], mergeable:boolean,
//                      kind:'code'|'token'|'motion'|'a11y'|'misc',
//                      source:'louvain'|'fallback'|'subsplit'|'merge' }>,
//     modularity: number|null,
//     method: 'louvain'|'count-fallback'
//   }
//   Opts: resolution=1.0, maxCommunitySize=35, miscCap=25, fallbackBatchSize=12,
//         configCwd (override .design/config.json discovery root).

import fs from 'node:fs';
import path from 'node:path';
import { buildAdjacency, degreeIndex } from './graph-adjacency.mjs';

const STRUCTURAL_EDGE_TYPES = new Set([
  'composes',
  'extends',
  'depends-on',
  'consumes-context',
  'provides-context',
]);

// Node types that, when they DOMINATE a community, mark it a non-code semantic
// group (emitted mergeable:false). Mapped to the batch `kind`.
const NONCODE_KIND = new Map([
  ['token', 'token'],
  ['motion-fragment', 'motion'],
  ['a11y-pattern', 'a11y'],
]);

const DEFAULTS = {
  resolution: 1.0,
  maxCommunitySize: 35,
  miscCap: 25,
  fallbackBatchSize: 12,
};

// ---------------------------------------------------------------------------
// Config (mirrors blast-radius.cjs#loadConfig precedence; never throws).
// ---------------------------------------------------------------------------

function numberOr(...candidates) {
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  }
  return undefined;
}

/**
 * Resolve options. Precedence per dimension:
 *   explicit opts  >  .design/config.json#louvain.{...}  >  DEFAULTS.
 * resolution/maxCommunitySize live under `louvain`; miscCap/fallbackBatchSize
 * default unless an explicit opt overrides. Absent/garbage config never throws.
 */
function resolveOpts(opts) {
  const o = opts || {};
  let cfg = {};
  try {
    const root = o.configCwd || process.cwd();
    cfg = JSON.parse(fs.readFileSync(path.join(root, '.design', 'config.json'), 'utf8'));
  } catch { cfg = {}; }
  const lv = (cfg && typeof cfg === 'object' && cfg.louvain) || {};
  return {
    resolution: numberOr(o.resolution, lv.resolution, DEFAULTS.resolution),
    maxCommunitySize: numberOr(o.maxCommunitySize, lv.maxCommunitySize, DEFAULTS.maxCommunitySize),
    miscCap: numberOr(o.miscCap, lv.miscCap, DEFAULTS.miscCap),
    fallbackBatchSize: numberOr(o.fallbackBatchSize, lv.fallbackBatchSize, DEFAULTS.fallbackBatchSize),
  };
}

// ---------------------------------------------------------------------------
// Graph shaping: anchors, fold map, and the weighted undirected batch graph.
// ---------------------------------------------------------------------------

function nodeList(graph) {
  return Array.isArray(graph && graph.nodes) ? graph.nodes : [];
}
function edgeList(graph) {
  return Array.isArray(graph && graph.edges) ? graph.edges : [];
}

/**
 * Partition graph nodes into anchors (run Louvain over these) and a fold map
 * (folded node id -> owning anchor id). A non-component node folds into a
 * component when it is OWNED by exactly one component:
 *   - variant/state/layer/etc. with a structural edge to a single component;
 *   - token used by exactly one component (uses-token).
 * Everything else (every component; non-component nodes with zero or many
 * component owners) is an anchor. Components are always anchors. Tokens with >1
 * component owner stay anchors but contribute cohesion weight (below) and are
 * pulled toward code communities via that weight.
 *
 * Deterministic: when a node has multiple candidate single owners across edge
 * kinds we never reach here (multi-owner => anchor); single-owner is unambiguous.
 */
function shapeAnchors(graph) {
  const nodes = nodeList(graph);
  const byId = new Map();
  for (const n of nodes) if (n && typeof n.id === 'string') byId.set(n.id, n);

  const isComponent = (id) => byId.get(id)?.type === 'component';

  // Collect, per non-component node, the set of component ids it relates to via
  // a structural or uses-token edge (direction-agnostic — ownership is undirected).
  const ownersOf = new Map(); // nonCompId -> Set<componentId>
  const noteOwner = (nonComp, comp) => {
    if (!byId.has(nonComp) || !byId.has(comp)) return;
    if (isComponent(nonComp)) return;
    let s = ownersOf.get(nonComp);
    if (!s) { s = new Set(); ownersOf.set(nonComp, s); }
    s.add(comp);
  };

  for (const e of edgeList(graph)) {
    if (!e || typeof e.source !== 'string' || typeof e.target !== 'string') continue;
    const isOwning = STRUCTURAL_EDGE_TYPES.has(e.type) || e.type === 'uses-token';
    if (!isOwning) continue;
    const sComp = isComponent(e.source);
    const tComp = isComponent(e.target);
    // exactly one endpoint is a component, the other is the candidate folded node.
    if (sComp && !tComp) noteOwner(e.target, e.source);
    else if (tComp && !sComp) noteOwner(e.source, e.target);
  }

  const fold = new Map(); // foldedId -> ownerComponentId
  for (const [nonComp, owners] of ownersOf) {
    if (owners.size === 1) fold.set(nonComp, [...owners][0]);
  }

  // Anchors = all components + every non-component node NOT folded.
  const anchors = new Set();
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string') continue;
    if (n.type === 'component') { anchors.add(n.id); continue; }
    if (!fold.has(n.id)) anchors.add(n.id);
  }
  // A fold target must itself be an anchor; if an owner somehow isn't a node,
  // demote the folded node to an anchor (defensive, keeps the partition total).
  for (const [folded, owner] of [...fold]) {
    if (!anchors.has(owner)) { fold.delete(folded); anchors.add(folded); }
  }

  return { byId, anchors, fold, isComponent };
}

/**
 * Build the undirected weighted batch graph over anchors. Returns:
 *   { ids: string[] (sorted), weight: Map<id, Map<id, number>>, m: number }
 * where `weight` is symmetric (both directions populated) and `m` is the total
 * undirected edge weight (sum of one side). Cohesion: each token shared by a
 * pair of component anchors adds 1/log(1+deg(token)) to that pair.
 */
function buildBatchGraph(graph, shape) {
  const { byId, anchors, fold, isComponent } = shape;
  const deg = degreeIndex(graph);

  // Symmetric weighted adjacency among anchors only.
  const w = new Map();
  for (const id of anchors) w.set(id, new Map());
  const bump = (a, b, val) => {
    if (a === b || !w.has(a) || !w.has(b)) return;
    const ma = w.get(a); ma.set(b, (ma.get(b) || 0) + val);
    const mb = w.get(b); mb.set(a, (mb.get(a) || 0) + val);
  };
  // Resolve an endpoint to its anchor (folded node -> its owner component).
  const anchorOf = (id) => (anchors.has(id) ? id : fold.get(id));

  // 1) Structural edges between resolved anchors contribute their weight.
  for (const e of edgeList(graph)) {
    if (!e || typeof e.source !== 'string' || typeof e.target !== 'string') continue;
    if (!STRUCTURAL_EDGE_TYPES.has(e.type)) continue;
    const a = anchorOf(e.source);
    const b = anchorOf(e.target);
    if (a === undefined || b === undefined) continue;
    const val = typeof e.weight === 'number' && Number.isFinite(e.weight) && e.weight >= 0 ? e.weight : 1;
    bump(a, b, val);
  }

  // 2) uses-token cohesion. For each token, find the set of component anchors
  // that use it, then add a damped weight to every component pair sharing it.
  //   damp = 1 / log(1 + deg(token))  (deg via degreeIndex; guard log<=0 -> 1).
  const tokenUsers = new Map(); // tokenId -> Set<componentAnchorId>
  for (const e of edgeList(graph)) {
    if (!e || e.type !== 'uses-token') continue;
    // uses-token is component(source) -> token(target) in Phase 52, but tolerate
    // either orientation: the token endpoint is the non-component one.
    let tokenId; let compId;
    if (byId.get(e.target)?.type === 'token') { tokenId = e.target; compId = e.source; }
    else if (byId.get(e.source)?.type === 'token') { tokenId = e.source; compId = e.target; }
    else continue;
    const compAnchor = anchorOf(compId);
    if (compAnchor === undefined || !isComponent(compAnchor)) continue;
    let s = tokenUsers.get(tokenId);
    if (!s) { s = new Set(); tokenUsers.set(tokenId, s); }
    s.add(compAnchor);
  }
  for (const [tokenId, usersSet] of tokenUsers) {
    if (usersSet.size < 2) continue; // a token used by <2 components ties nothing
    const dlog = Math.log(1 + (deg.get(tokenId) || 0));
    const damp = dlog > 0 ? 1 / dlog : 1;
    const users = [...usersSet].sort(); // deterministic pair order
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        bump(users[i], users[j], damp);
      }
    }
  }

  // Total undirected edge weight m = half the sum of all directed entries.
  let two = 0;
  for (const m of w.values()) for (const v of m.values()) two += v;
  const m = two / 2;

  const ids = [...anchors].sort();
  return { ids, weight: w, m };
}

// ---------------------------------------------------------------------------
// Two-phase Louvain.
// ---------------------------------------------------------------------------

/**
 * One level of local modularity optimization over a weighted graph given as
 *   nodes: string[] (already sorted lexicographically — the determinism seed),
 *   adj:   Map<id, Map<id, number>> (symmetric),
 *   selfLoop: Map<id, number> (intra-node weight from aggregation; 0 at level 0),
 *   m: total undirected edge weight,
 *   gamma: resolution.
 * Returns Map<id, communityId> (community id is a representative node id string).
 *
 * ΔQ(i->c) = k_{i,in}/m − gamma * (Σ_tot[c] * k_i) / (2 m^2)
 * Move each node to the neighbor community of max positive gain; tie-break to the
 * smallest community id then smallest node id (handled by fixed iteration + the
 * comparison below). Stops when a pass improves total gain < 1e-7 or 20 passes.
 */
function louvainLevel(nodes, adj, selfLoop, m, gamma) {
  const community = new Map();          // node -> communityId
  const k = new Map();                  // node -> weighted degree (incident, incl self*2)
  const sigmaTot = new Map();           // communityId -> Σ degree of members

  for (const n of nodes) {
    community.set(n, n);
    const self = selfLoop.get(n) || 0;
    let deg = self * 2; // a self-loop contributes twice to weighted degree
    for (const v of (adj.get(n) || new Map()).values()) deg += v;
    k.set(n, deg);
    sigmaTot.set(n, deg);
  }

  if (m <= 0) return community; // no edges: every node its own community

  const twoM2 = 2 * m * m;

  for (let pass = 0; pass < 20; pass++) {
    let passGain = 0;
    for (const i of nodes) { // FIXED lexicographic order — the determinism seed
      const ci = community.get(i);
      const ki = k.get(i);

      // Sum of weights from i into each candidate community (excluding self-loop).
      const wTo = new Map();
      for (const [nb, wgt] of adj.get(i) || new Map()) {
        if (nb === i) continue;
        const cnb = community.get(nb);
        wTo.set(cnb, (wTo.get(cnb) || 0) + wgt);
      }

      // Remove i from its current community before evaluating moves.
      sigmaTot.set(ci, sigmaTot.get(ci) - ki);

      // Gain of placing i into community c: k_{i,in}/m − gamma*(Σ_tot[c]*k_i)/(2m²).
      // The shared 1/m and damped term make the absolute baseline (staying in ci,
      // now emptied of i) gain wTo(ci)/m − gamma*sigmaTot[ci]*ki/2m². We pick the
      // max; ties break to smallest community id then smallest node id.
      let bestC = ci;
      let bestGain = (wTo.get(ci) || 0) / m - (gamma * sigmaTot.get(ci) * ki) / twoM2;
      // Ensure the "stay" option is always considered with ci as the tie anchor.
      for (const [c, kin] of [...wTo].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
        const gain = kin / m - (gamma * sigmaTot.get(c) * ki) / twoM2;
        if (gain > bestGain + 1e-12 || (Math.abs(gain - bestGain) <= 1e-12 && c < bestC)) {
          bestGain = gain; bestC = c;
        }
      }

      // Place i into bestC.
      sigmaTot.set(bestC, sigmaTot.get(bestC) + ki);
      if (bestC !== ci) {
        community.set(i, bestC);
        const stayGain = (wTo.get(ci) || 0) / m - (gamma * (sigmaTot.get(ci)) * ki) / twoM2;
        passGain += Math.max(0, bestGain - stayGain);
      }
    }
    if (passGain < 1e-7) break;
  }

  return community;
}

/** Compute global modularity Q of a partition over the weighted graph. */
function modularityOf(nodes, adj, selfLoop, m, community) {
  if (m <= 0) return null;
  // Q = Σ_c [ Σ_in[c]/(2m) − (Σ_tot[c]/(2m))² ]
  const sigmaIn = new Map();  // community -> internal weight (2*intra incl self-loops counted once*2)
  const sigmaTot = new Map();
  const deg = new Map();
  for (const n of nodes) {
    const self = selfLoop.get(n) || 0;
    let d = self * 2;
    for (const v of (adj.get(n) || new Map()).values()) d += v;
    deg.set(n, d);
    const c = community.get(n);
    sigmaTot.set(c, (sigmaTot.get(c) || 0) + d);
    // self-loop is fully internal: contributes 2*self to Σ_in.
    sigmaIn.set(c, (sigmaIn.get(c) || 0) + 2 * self);
  }
  for (const n of nodes) {
    const c = community.get(n);
    for (const [nb, wgt] of adj.get(n) || new Map()) {
      if (nb === n) continue;
      if (community.get(nb) === c) sigmaIn.set(c, (sigmaIn.get(c) || 0) + wgt);
    }
  }
  let q = 0;
  const twoM = 2 * m;
  for (const c of new Set(community.values())) {
    const sin = sigmaIn.get(c) || 0;
    const stot = sigmaTot.get(c) || 0;
    q += sin / twoM - (stot / twoM) * (stot / twoM);
  }
  return q;
}

/**
 * Full two-phase Louvain. Returns { labels: Map<anchorId, communityLabel>,
 * modularity:number|null }. Iterates: local optimize -> aggregate communities
 * into super-nodes (summing inter/intra weights) -> repeat until the partition
 * stops changing (or no gain). Community labels are the lexicographically
 * smallest original anchor id in each community (stable, OS-independent).
 */
function runLouvain(batchGraph, gamma) {
  const { ids, weight, m } = batchGraph;
  if (m <= 0 || ids.length < 2) {
    // Degenerate: each anchor alone. Caller's <2 check handles the throw path;
    // here (no edges) we still return singletons labeled by themselves.
    const labels = new Map(ids.map((id) => [id, id]));
    return { labels, modularity: m <= 0 ? null : 0 };
  }

  // membership: original anchor id -> current super-node id (starts as itself).
  let nodes = ids.slice();
  let adj = weight;
  let selfLoop = new Map(nodes.map((n) => [n, 0]));
  // map from current super-node id -> set of original anchor ids it contains.
  let contains = new Map(nodes.map((n) => [n, new Set([n])]));

  for (let iter = 0; iter < 50; iter++) {
    const community = louvainLevel(nodes, adj, selfLoop, m, gamma);

    // Did anything merge? If every node is its own community, we're stable.
    const distinct = new Set(community.values());
    if (distinct.size === nodes.length) break;

    // Aggregate: new super-node id = lexicographically smallest member id.
    const repOf = new Map(); // oldCommunityId -> representative (smallest member)
    for (const n of nodes) {
      const c = community.get(n);
      const cur = repOf.get(c);
      if (cur === undefined || n < cur) repOf.set(c, n);
    }
    const newContains = new Map();
    for (const n of nodes) {
      const rep = repOf.get(community.get(n));
      let set = newContains.get(rep);
      if (!set) { set = new Set(); newContains.set(rep, set); }
      for (const orig of contains.get(n)) set.add(orig);
    }
    const newNodes = [...newContains.keys()].sort();
    const newAdj = new Map(newNodes.map((n) => [n, new Map()]));
    const newSelf = new Map(newNodes.map((n) => [n, 0]));
    for (const n of nodes) {
      const rn = repOf.get(community.get(n));
      // self-loop carries forward.
      newSelf.set(rn, (newSelf.get(rn) || 0) + (selfLoop.get(n) || 0));
      for (const [nb, wgt] of adj.get(n) || new Map()) {
        const rnb = repOf.get(community.get(nb));
        if (rn === rnb) {
          if (nb === n) continue; // self handled above
          // intra-community edge becomes part of the super-node self-loop (each
          // undirected edge appears twice across n/nb; add half here).
          newSelf.set(rn, (newSelf.get(rn) || 0) + wgt / 2);
        } else {
          const ma = newAdj.get(rn);
          ma.set(rnb, (ma.get(rnb) || 0) + wgt);
        }
      }
    }

    nodes = newNodes;
    adj = newAdj;
    selfLoop = newSelf;
    contains = newContains;
  }

  // Unfold: every original anchor id -> the super-node id (representative) it
  // ended in. `contains` maps current super-node -> original ids.
  const labels = new Map();
  for (const [rep, origSet] of contains) {
    for (const orig of origSet) labels.set(orig, rep);
  }

  // Final modularity is measured on the ORIGINAL graph with the final partition.
  const origCommunity = new Map(ids.map((id) => [id, labels.get(id)]));
  const modularity = modularityOf(ids, weight, new Map(ids.map((id) => [id, 0])), m, origCommunity);

  return { labels, modularity };
}

// ---------------------------------------------------------------------------
// Community -> batches (kind classification, sub-split, merge).
// ---------------------------------------------------------------------------

/**
 * Expand each Louvain community into full membership (anchors + their folded
 * children), then classify, sub-split oversize, and merge small code singletons.
 * Returns the final batches array.
 */
function communitiesToBatches(labels, shape, opts) {
  const { byId, fold } = shape;
  const { maxCommunitySize, miscCap } = opts;

  // community label -> member node ids (anchors + folded children).
  const members = new Map();
  const push = (label, id) => {
    let arr = members.get(label);
    if (!arr) { arr = []; members.set(label, arr); }
    arr.push(id);
  };
  for (const [anchor, label] of labels) push(label, anchor);
  for (const [folded, owner] of fold) {
    const label = labels.get(owner);
    if (label !== undefined) push(label, folded);
  }

  // Classify a community by node-type majority. Non-code (token/motion/a11y
  // dominant) -> that kind + mergeable:false. Code (component-bearing) -> 'code'.
  const classify = (ids) => {
    const counts = new Map();
    for (const id of ids) {
      const t = byId.get(id)?.type || 'unknown';
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    const componentCount = counts.get('component') || 0;
    if (componentCount > 0) return { kind: 'code', mergeable: true };
    // No components: pick the dominant non-code type (deterministic tie -> the
    // NONCODE_KIND order, then alpha).
    let bestType = null; let bestN = -1;
    for (const [t, n] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      if (n > bestN) { bestN = n; bestType = t; }
    }
    const kind = NONCODE_KIND.get(bestType) || 'misc';
    // token/motion/a11y semantic groups are non-mergeable; pure 'misc' (e.g. a
    // lone variant/layer/screen cluster) stays mergeable so the merger can pool it.
    const mergeable = !NONCODE_KIND.has(bestType);
    return { kind, mergeable };
  };

  // Stable community order: by smallest member id.
  const orderedLabels = [...members.keys()].sort();
  let counter = 0;
  const nextId = () => `batch-${String(++counter).padStart(2, '0')}`;

  const out = [];
  for (const label of orderedLabels) {
    const ids = members.get(label).slice().sort();
    const { kind, mergeable } = classify(ids);

    if (ids.length <= maxCommunitySize) {
      out.push({ id: nextId(), members: ids, mergeable, kind, source: 'louvain' });
      continue;
    }
    // Oversize -> alphabetical sub-split into <=maxCommunitySize chunks.
    const baseId = nextId();
    for (let i = 0, part = 0; i < ids.length; i += maxCommunitySize, part++) {
      const chunk = ids.slice(i, i + maxCommunitySize);
      const id = part === 0 ? baseId : `${baseId}-${part + 1}`;
      out.push({ id, members: chunk, mergeable, kind, source: 'subsplit' });
    }
  }

  return mergeSmall(out, miscCap, nextId);
}

/**
 * Pool small MERGEABLE code/misc batches (here: singletons and tiny leftovers)
 * into <=miscCap "misc" batches. Non-mergeable semantic groups pass through
 * untouched. Deterministic: merge candidates are sorted by their first member id
 * and packed greedily into misc bins of size <=miscCap.
 */
function mergeSmall(batches, miscCap, nextId) {
  const SMALL = 2; // a "small" mergeable batch is a singleton (1 member).
  const keep = [];
  const poolable = [];
  for (const b of batches) {
    if (b.mergeable && b.members.length < SMALL) poolable.push(b);
    else keep.push(b);
  }
  if (poolable.length < 2) return batches; // nothing worth pooling

  poolable.sort((a, b) => (a.members[0] < b.members[0] ? -1 : a.members[0] > b.members[0] ? 1 : 0));
  const merged = [];
  let bin = [];
  const flush = () => {
    if (!bin.length) return;
    // `nextId` continues the counter past the last assigned batch id so merge
    // bins get fresh, non-colliding ids; existing ids (incl. subsplit -N
    // suffixes like batch-07-2) are PRESERVED — never renumbered.
    merged.push({ id: nextId(), members: bin.slice().sort(), mergeable: true, kind: 'misc', source: 'merge' });
    bin = [];
  };
  for (const b of poolable) {
    if (bin.length + b.members.length > miscCap) flush();
    bin.push(...b.members);
  }
  flush();

  // Stable output order by first member id; ids are left untouched so the
  // documented label contract (subsplit base + -N suffix) survives merging.
  const all = keep.concat(merged);
  all.sort((a, b) => (a.members[0] < b.members[0] ? -1 : a.members[0] > b.members[0] ? 1 : 0));
  return all;
}

// ---------------------------------------------------------------------------
// count-fallback (alphabetical fixed-size batches).
// ---------------------------------------------------------------------------

/** Alphabetical fallback over ALL node ids in fixed-size chunks. */
function countFallback(graph, size) {
  const ids = nodeList(graph)
    .filter((n) => n && typeof n.id === 'string')
    .map((n) => n.id)
    .sort();
  const batches = [];
  let n = 0;
  for (let i = 0; i < ids.length; i += size) {
    batches.push({
      id: `batch-${String(++n).padStart(2, '0')}`,
      members: ids.slice(i, i + size),
      mergeable: true,
      kind: 'misc',
      source: 'fallback',
    });
  }
  return { batches, modularity: null, method: 'count-fallback' };
}

// ---------------------------------------------------------------------------
// Public entry.
// ---------------------------------------------------------------------------

/**
 * Group a DesignContext graph into mapper batches via deterministic two-phase
 * Louvain, with safety nets. See file header for the full contract.
 *
 * @param {object} graph  Phase-52 graph ({ nodes, edges }).
 * @param {object} [opts] resolution, maxCommunitySize, miscCap, fallbackBatchSize, configCwd.
 * @returns {{batches:Array, modularity:number|null, method:'louvain'|'count-fallback'}}
 */
export function computeBatches(graph, opts) {
  const resolved = resolveOpts(opts);
  try {
    const shape = shapeAnchors(graph);
    // <2 anchors => count-fallback (the contract's small-input guard).
    if (shape.anchors.size < 2) return countFallback(graph, resolved.fallbackBatchSize);

    const batchGraph = buildBatchGraph(graph, shape);
    const { labels, modularity } = runLouvain(batchGraph, resolved.resolution);
    const batches = communitiesToBatches(labels, shape, resolved);
    return { batches, modularity, method: 'louvain' };
  } catch {
    // ANY throw -> count-fallback (never crash the dispatcher).
    return countFallback(graph, resolved.fallbackBatchSize);
  }
}

export default { computeBatches };
