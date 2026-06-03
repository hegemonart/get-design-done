'use strict';
/**
 * scripts/lib/mappers/incremental-discover.cjs — Phase 53 (Semantic Mapper Engine), DISC-01 (executor E).
 *
 * The COMPOSITION layer that turns a DesignContext graph (Phase 52 shape) + a
 * prior fingerprint snapshot into a concrete "what to re-map this cycle" plan.
 * It glues together the three Round-1 subsystems behind ONE pure-ish entry so
 * the explore-parallel-runner edit stays a thin call:
 *
 *   A — scripts/lib/mappers/compute-batches.mjs  (computeBatches, Louvain communities)
 *       scripts/lib/mappers/neighbor-map.mjs     (buildNeighborMap, 1-hop sidecar)
 *   B — sdk/fingerprint/index.ts                 (fingerprint, compareFingerprints)
 *   C — sdk/fingerprint/classify.cjs             (classify, the 4-action matrix)
 *
 * Flow (planIncremental):
 *   1. computeBatches(graph) → community batches (always, so the dispatcher has
 *      a complete batch set regardless of the classifier decision).
 *   2. Per fingerprintable node, derive the fingerprint INPUT projection from the
 *      node's graph context (its edges/children — NOT source text), hash it via
 *      fingerprint(), and compareFingerprints() against prevFingerprints[id].
 *      Nodes absent from prev compare as add (STRUCTURAL); prev nodes absent from
 *      the current graph compare as remove (STRUCTURAL).
 *   3. Derive projectStats dir-shape from node-id provenance (the component:/token:/
 *      variant:/layer: prefix + a token subtype segment + the node.layer field) —
 *      never an FS re-walk (CONTEXT R2 / classify's contract).
 *   4. classify(compareResults, projectStats) → action + affectedBatchHints.
 *   5. Select batchesToMap by action:
 *        SKIP                → []                 (0 mappers)
 *        FULL_UPDATE         → all batches        (bootstrap / large change)
 *        PARTIAL/ARCHITECTURE→ only batches whose members intersect the hints
 *      `opts.forceFull` (the `--full` opt-out) overrides the decision to all batches.
 *   6. Attach a neighborMap sidecar per SELECTED batch (buildNeighborMap).
 *
 * Determinism (CONTEXT D6): no Math.random / Date.now; every list is sorted
 * before it is emitted; fingerprints are sha256 of canonicalized projections;
 * compareResults are built in batch-then-member order then handed to classify
 * which re-sorts the hints. Identical (graph, prevFingerprints) ⇒ identical plan
 * on win32 / Linux / macOS.
 *
 * IMPORT STRATEGY: this is a `.cjs` module so a `.cjs` CLI / skill can require()
 * it. classify.cjs is plain require(). The ESM .mjs (A) and the .ts engine (B)
 * cannot be statically require()d from CJS, so they load via dynamic import()
 * (the same mechanism concurrency-tuner.cjs uses for the .ts event-stream, and
 * the phase-53-louvain suite uses for the .mjs batchers). The loaded modules are
 * MEMOIZED so a multi-batch run pays the import once. planIncremental is async.
 *
 * Dep-free except the A/C/B sibling modules — no new npm dependency (CONTEXT D7).
 *
 * ---------------------------------------------------------------------------
 * PUBLIC CONTRACT
 * ---------------------------------------------------------------------------
 *   await planIncremental({ graph, prevFingerprints, opts }) → {
 *     action: 'SKIP'|'PARTIAL_UPDATE'|'ARCHITECTURE_UPDATE'|'FULL_UPDATE',
 *     batches:        Batch[],                 // the full community batch set (A's shape)
 *     batchesToMap:   Batch[],                 // the subset to dispatch this cycle
 *     neighborMaps:   Record<batchId, NeighborMap>, // sidecar for SELECTED batches only
 *     fingerprints:   Record<nodeId, {full,structural,type}>, // current per-node fps (to persist)
 *     compareResults: Array<{id,type,change}>, // the per-node change set fed to classify
 *     classification: <full classify() result>,// structuralCount, pct, dirChanged, hints, reason, thresholds
 *     method:         'louvain'|'count-fallback',
 *     modularity:     number|null
 *   }
 *
 *   Inputs:
 *     graph            Phase-52 graph ({ nodes, edges }). Required; a missing /
 *                      malformed graph yields an empty SKIP plan (no nodes ⇒
 *                      classify's totalFiles===0 SKIP).
 *     prevFingerprints Record<nodeId, {full,structural}|string> from the store's
 *                      readCurrent().fingerprints. Absent / empty ⇒ bootstrap
 *                      (no prevDirShape) ⇒ classify returns FULL_UPDATE.
 *     opts             { forceFull?: boolean,  // the --full opt-out: map everything
 *                        computeBatchesOpts?,  // forwarded to computeBatches (resolution, maxCommunitySize, configCwd, …)
 *                        neighborCap?: number, // buildNeighborMap cap (default 50)
 *                        thresholds?,          // forwarded into classify's projectStats
 *                        hadPriorBaseline?: boolean } // force the bootstrap signal off when the
 *                                                     // store had a snapshot but it was empty
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MAPPERS_DIR = __dirname;
const SDK_FP_DIR = path.resolve(__dirname, '..', '..', '..', 'sdk', 'fingerprint');

// classify.cjs is CJS — require directly.
const { classify } = require(path.join(SDK_FP_DIR, 'classify.cjs'));

// ---------------------------------------------------------------------------
// Lazy + memoized ESM/TS module loading. CJS cannot statically require() an
// .mjs or a .ts; dynamic import() handles both (the .ts under
// --experimental-strip-types). Memoize so a multi-batch run imports once.
// ---------------------------------------------------------------------------

let _batchMod = null;
let _neighborMod = null;
let _fpMod = null;

async function loadBatchMod() {
  if (!_batchMod) {
    _batchMod = await import(pathToFileURL(path.join(MAPPERS_DIR, 'compute-batches.mjs')).href);
  }
  return _batchMod;
}
async function loadNeighborMod() {
  if (!_neighborMod) {
    _neighborMod = await import(pathToFileURL(path.join(MAPPERS_DIR, 'neighbor-map.mjs')).href);
  }
  return _neighborMod;
}
async function loadFingerprintMod() {
  if (!_fpMod) {
    _fpMod = await import(pathToFileURL(path.join(SDK_FP_DIR, 'index.ts')).href);
  }
  return _fpMod;
}

// ---------------------------------------------------------------------------
// Graph accessors (tolerant of a malformed graph — mirror the A/C modules).
// ---------------------------------------------------------------------------

function nodeList(graph) {
  return Array.isArray(graph && graph.nodes) ? graph.nodes : [];
}
function edgeList(graph) {
  return Array.isArray(graph && graph.edges) ? graph.edges : [];
}

const STRUCTURAL_EDGE_TYPES = new Set([
  'composes',
  'extends',
  'depends-on',
  'consumes-context',
  'provides-context',
]);

/**
 * The graph node `type` values we can fingerprint, mapped to the fingerprint
 * engine's FingerprintType. Everything else (variant/layer/state/a11y-pattern/…)
 * is NOT independently fingerprinted — those nodes ride along in their owning
 * component's batch and are re-mapped when that component is.
 */
const FINGERPRINTABLE = new Map([
  ['component', 'component'],
  ['token', 'token'],
  ['motion-fragment', 'motion'],
]);

// ---------------------------------------------------------------------------
// Per-node fingerprint INPUT projection, harvested from graph context.
//   The fingerprint engine (B) accepts rich per-type inputs; a Phase-52 graph
//   node does not always carry props/members/used_tokens directly, so we harvest
//   what the graph DOES encode (edges to tokens/variants, node fields) and leave
//   the rest empty. This is graph-only (CONTEXT R2) — no source-file reads.
// ---------------------------------------------------------------------------

/**
 * Build a once-per-graph index of the relationships we need to project a node:
 *   tokensOf[componentId]   = Set<tokenId>     (uses-token targets)
 *   variantsOf[componentId] = Set<variantName> (variant/state children via extends/structural)
 *
 * @param {object} graph
 * @returns {{ byId: Map, tokensOf: Map, variantsOf: Map }}
 */
function indexForProjection(graph) {
  const byId = new Map();
  for (const n of nodeList(graph)) {
    if (n && typeof n.id === 'string') byId.set(n.id, n);
  }

  const tokensOf = new Map();
  const variantsOf = new Map();
  const ensure = (map, id) => {
    let s = map.get(id);
    if (!s) { s = new Set(); map.set(id, s); }
    return s;
  };
  const typeOf = (id) => byId.get(id) && byId.get(id).type;
  const nameOf = (id) => {
    const node = byId.get(id);
    return node && typeof node.name === 'string' ? node.name : id;
  };

  for (const e of edgeList(graph)) {
    if (!e || typeof e.source !== 'string' || typeof e.target !== 'string') continue;
    const sType = typeOf(e.source);
    const tType = typeOf(e.target);

    if (e.type === 'uses-token') {
      if (sType === 'component' && tType === 'token') ensure(tokensOf, e.source).add(e.target);
      else if (tType === 'component' && sType === 'token') ensure(tokensOf, e.target).add(e.source);
    } else if (e.type === 'extends') {
      // variant/state EXTENDS component (Phase-52 orientation: variant -> component).
      if (tType === 'component' && (sType === 'variant' || sType === 'state')) {
        ensure(variantsOf, e.target).add(nameOf(e.source));
      } else if (sType === 'component' && (tType === 'variant' || tType === 'state')) {
        ensure(variantsOf, e.source).add(nameOf(e.target));
      }
    } else if (STRUCTURAL_EDGE_TYPES.has(e.type)) {
      if (sType === 'component' && tType === 'state') ensure(variantsOf, e.source).add(nameOf(e.target));
      else if (tType === 'component' && sType === 'state') ensure(variantsOf, e.target).add(nameOf(e.source));
    }
  }

  return { byId, tokensOf, variantsOf };
}

/** Coerce an arbitrary node-field value into a sorted, deduped string[]. */
function strArray(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const x of v) {
    const s = typeof x === 'string' ? x : (x && typeof x.name === 'string' ? x.name : null);
    if (s != null && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  out.sort();
  return out;
}

/**
 * Build the prop-shape array the component fingerprint expects. A Phase-52 node
 * may carry `props` as either string[] (names only) or [{name,type,optional}].
 * We normalize to the {name,type,optional} entry shape; bare strings get an
 * empty type so a later type-annotation gain reads STRUCTURAL.
 *
 * @param {unknown} props
 * @returns {Array<{name:string,type:string,optional?:boolean}>}
 */
function propShape(props) {
  if (!Array.isArray(props)) return [];
  const out = [];
  for (const p of props) {
    if (typeof p === 'string') {
      out.push({ name: p, type: '' });
    } else if (p && typeof p === 'object' && typeof p.name === 'string') {
      out.push({
        name: p.name,
        type: typeof p.type === 'string' ? p.type : '',
        ...(typeof p.optional === 'boolean' ? { optional: p.optional } : {}),
      });
    }
  }
  return out;
}

/**
 * Project ONE fingerprintable node into the input shape its fingerprint type
 * expects, harvesting from graph context where the node itself is thin.
 *
 * @param {object} node    the graph node
 * @param {string} fpType  'component'|'token'|'motion'
 * @param {{ byId, tokensOf, variantsOf }} idx
 * @returns {object} the per-type fingerprint input
 */
function projectNode(node, fpType, idx) {
  if (fpType === 'component') {
    const usedTokens = idx.tokensOf.has(node.id) ? [...idx.tokensOf.get(node.id)].sort() : [];
    const variantsFromGraph = idx.variantsOf.has(node.id) ? [...idx.variantsOf.get(node.id)] : [];
    const variantsFromNode = strArray(node.exported_variants || node.variants);
    const exportedVariants = [...new Set([...variantsFromGraph, ...variantsFromNode])].sort();
    return {
      component_signature: {
        name: typeof node.name === 'string' ? node.name : node.id,
        members: strArray(node.members),
      },
      props_shape: propShape(node.props),
      used_tokens: usedTokens,
      exported_variants: exportedVariants,
    };
  }
  if (fpType === 'token') {
    return {
      token_name: typeof node.name === 'string' ? node.name : node.id,
      token_value:
        node.value === undefined ? null
        : (typeof node.value === 'object' ? JSON.stringify(node.value) : node.value),
      token_type: typeof node.subtype === 'string' ? node.subtype : (typeof node.token_type === 'string' ? node.token_type : ''),
      ...(typeof node.subtype === 'string' ? { subtype: node.subtype } : {}),
      ...(typeof node.theme_scope === 'string' ? { theme_scope: node.theme_scope } : {}),
    };
  }
  // motion
  return {
    animation_target: typeof node.name === 'string' ? node.name : node.id,
    ...(Number.isFinite(node.duration_ms) ? { duration_ms: node.duration_ms } : {}),
    ...(typeof node.easing === 'string' ? { easing: node.easing } : {}),
  };
}

// ---------------------------------------------------------------------------
// Directory-shape derivation from node-id provenance (NO FS walk).
//   classify needs { totalFiles, prevDirShape, currDirShape } where a DirShape
//   is { dirs, counts, layerHist }. Phase-52 node ids encode provenance via a
//   `<type>:<...>` prefix (component:/token:/variant:/layer:) and tokens add a
//   subtype segment (token:<subtype>:<name>); the Atomic layer is on node.layer.
//   We treat the top-level id namespace + token subtype as the "dirs", count
//   file-bearing nodes per namespace, and histogram the component layer field.
// ---------------------------------------------------------------------------

/** The id-prefix (namespace) of a node id, e.g. 'component' from 'component:button'. */
function idNamespace(id) {
  if (typeof id !== 'string') return 'unknown';
  const i = id.indexOf(':');
  return i > 0 ? id.slice(0, i) : id;
}

/**
 * A node counts as a "file-bearing" node for the dir-shape / totalFiles count
 * when it is a first-class design entity (component, token, motion-fragment).
 * Variants/layers/states are sub-entities that ride along; counting them would
 * inflate `totalFiles` and dilute `pct`. This matches classify's "file-nodes"
 * notion (the denominator of the structural fraction).
 */
function isFileNode(node) {
  return !!node && FINGERPRINTABLE.has(node.type);
}

/**
 * Derive a DirShape from a graph's nodes. `dirs` = the sorted set of top-level
 * namespaces present among file-nodes, with tokens broken out by subtype so a
 * new token category surfaces as a "dir" add. `counts` = file-node count per
 * dir. `layerHist` = histogram by node-id NAMESPACE (component/token/motion-fragment).
 *
 * NOTE on layerHist: the Atomic `layer` field (Atomic/Molecular/Organism) lives
 * on the component node but is NOT carried in the stored per-node fingerprint,
 * so a prior layerHist reconstructed from `prevFingerprints` (see
 * `derivePrevDirShape`) could never see it. To keep the prev↔curr histograms
 * COMPARABLE across a cycle (otherwise every re-run would falsely trip
 * classify's `layerHistMajorShift` → majorRestructure → FULL), both functions
 * histogram by the id namespace, the one provenance signal present on both sides.
 *
 * @param {object} graph
 * @returns {{ dirs: string[], counts: Record<string,number>, layerHist: Record<string,number>, totalFiles: number }}
 */
function deriveDirShape(graph) {
  const counts = {};
  const layerHist = {};
  let totalFiles = 0;
  for (const n of nodeList(graph)) {
    if (!isFileNode(n)) continue;
    totalFiles += 1;
    const ns = idNamespace(n.id);
    // Dir key: namespace, plus the token subtype as a sub-namespace so a new
    // token category (e.g. token:shadow:*) registers as a dir change.
    let dir = ns;
    if (n.type === 'token' && typeof n.subtype === 'string' && n.subtype.length) {
      dir = `token:${n.subtype}`;
    }
    counts[dir] = (counts[dir] || 0) + 1;
    // Histogram by namespace (NOT the Atomic layer — see the NOTE above) so it
    // is reconstructable from the store on the prior side.
    layerHist[ns] = (layerHist[ns] || 0) + 1;
  }
  const dirs = Object.keys(counts).sort();
  return { dirs, counts, layerHist, totalFiles };
}

/**
 * Reconstruct a PRIOR DirShape from the prevFingerprints map. The store keeps
 * per-node `{full,structural,type}` keyed by node id, so the id namespaces +
 * the stored `type` give us the same dir/count/layer derivation without the
 * prior graph. Components don't carry a layer in the stored fp, so the prior
 * layerHist is approximate (namespace-level) — adequate for the relative-shift
 * heuristic, and the bootstrap path doesn't rely on it at all.
 *
 * Returns null when prevFingerprints is empty (the bootstrap signal).
 *
 * @param {object} prevFingerprints  Record<nodeId, {type?}|string>
 * @returns {{ dirs:string[], counts:Record<string,number>, layerHist:Record<string,number> }|null}
 */
function derivePrevDirShape(prevFingerprints) {
  const fps = prevFingerprints && typeof prevFingerprints === 'object' ? prevFingerprints : {};
  const ids = Object.keys(fps);
  if (ids.length === 0) return null;
  const counts = {};
  const layerHist = {};
  for (const id of ids) {
    const ns = idNamespace(id);
    // token:<subtype>:<name> ⇒ dir 'token:<subtype>'.
    let dir = ns;
    if (ns === 'token') {
      const parts = id.split(':');
      if (parts.length >= 3 && parts[1]) dir = `token:${parts[1]}`;
    }
    counts[dir] = (counts[dir] || 0) + 1;
    // Histogram by namespace for EVERY file-node namespace, matching
    // deriveDirShape so the prev↔curr layerHist comparison is apples-to-apples.
    layerHist[ns] = (layerHist[ns] || 0) + 1;
  }
  return { dirs: Object.keys(counts).sort(), counts, layerHist };
}

// ---------------------------------------------------------------------------
// compareResults — per-node change set fed to classify.
// ---------------------------------------------------------------------------

/**
 * Read a stored fingerprint value into the {full,structural} shape compare
 * expects. The store may hold either the object or a bare hash string (treated
 * as `full` only — a bare string has no structural projection, so a structural-
 * only change against a bare-string baseline reads STRUCTURAL, which is the safe
 * default).
 *
 * @param {unknown} v
 * @returns {{full:string,structural:string}|null}
 */
function asFingerprint(v) {
  if (v == null) return null;
  if (typeof v === 'string') return { full: v, structural: v };
  if (typeof v === 'object' && typeof v.full === 'string') {
    return { full: v.full, structural: typeof v.structural === 'string' ? v.structural : v.full };
  }
  return null;
}

/**
 * Compute current fingerprints + the compareResults change set.
 *
 * @param {object} graph
 * @param {object} prevFingerprints
 * @param {Function} fingerprint        from sdk/fingerprint
 * @param {Function} compareFingerprints from sdk/fingerprint
 * @returns {{ fingerprints: object, compareResults: Array }}
 */
function buildCompareResults(graph, prevFingerprints, fingerprint, compareFingerprints) {
  const idx = indexForProjection(graph);
  const prev = prevFingerprints && typeof prevFingerprints === 'object' ? prevFingerprints : {};

  const fingerprints = {};
  const compareResults = [];

  // Current nodes: add or compare.
  const currentIds = new Set();
  for (const node of nodeList(graph)) {
    if (!node || typeof node.id !== 'string') continue;
    const fpType = FINGERPRINTABLE.get(node.type);
    if (!fpType) continue;
    currentIds.add(node.id);

    let fp;
    try {
      fp = fingerprint(projectNode(node, fpType, idx), fpType);
    } catch {
      // A malformed node never crashes the plan; treat it as structurally changed
      // so its batch is conservatively re-mapped.
      compareResults.push({ id: node.id, type: node.type, change: 'STRUCTURAL' });
      continue;
    }
    fingerprints[node.id] = { full: fp.full, structural: fp.structural, type: node.type };

    const before = asFingerprint(prev[node.id]);
    const change = compareFingerprints(before, { full: fp.full, structural: fp.structural });
    compareResults.push({ id: node.id, type: node.type, change });
  }

  // Removed nodes: present in prev, absent now ⇒ STRUCTURAL (compareFingerprints(prev, null)).
  for (const id of Object.keys(prev)) {
    if (currentIds.has(id)) continue;
    const before = asFingerprint(prev[id]);
    const change = compareFingerprints(before, null); // STRUCTURAL
    const t = prev[id] && typeof prev[id] === 'object' && typeof prev[id].type === 'string'
      ? prev[id].type : idNamespace(id);
    compareResults.push({ id, type: t, change });
  }

  return { fingerprints, compareResults };
}

// ---------------------------------------------------------------------------
// Batch selection.
// ---------------------------------------------------------------------------

/**
 * Select the batches to re-map for an action + hint set.
 *   SKIP                 → []
 *   FULL_UPDATE          → all batches
 *   PARTIAL/ARCHITECTURE → batches whose members intersect the hint set
 * forceFull (the --full opt-out) is applied by the caller BEFORE this by passing
 * action='FULL_UPDATE'. Returns a NEW array (does not mutate `batches`).
 *
 * @param {Array} batches
 * @param {string} action
 * @param {string[]} affectedBatchHints  STRUCTURAL-changed node ids
 * @returns {Array}
 */
function selectBatches(batches, action, affectedBatchHints) {
  const all = Array.isArray(batches) ? batches : [];
  if (action === 'SKIP') return [];
  if (action === 'FULL_UPDATE') return all.slice();

  // PARTIAL / ARCHITECTURE: intersect members with the hint set.
  const hints = new Set(Array.isArray(affectedBatchHints) ? affectedBatchHints : []);
  if (hints.size === 0) return [];
  const out = [];
  for (const b of all) {
    const members = Array.isArray(b && b.members) ? b.members : [];
    if (members.some((m) => hints.has(m))) out.push(b);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry.
// ---------------------------------------------------------------------------

/**
 * Plan an incremental discover/explore cycle. See the file header for the full
 * contract. Async (it dynamic-import()s the .mjs batchers + the .ts engine).
 *
 * @param {{ graph: object, prevFingerprints?: object, opts?: object }} args
 * @returns {Promise<object>} the plan
 */
async function planIncremental(args) {
  const { graph, prevFingerprints, opts } = args && typeof args === 'object' ? args : {};
  const o = opts && typeof opts === 'object' ? opts : {};
  const prev = prevFingerprints && typeof prevFingerprints === 'object' ? prevFingerprints : {};

  // 1. Batches — always compute the full set (A).
  const { computeBatches } = await loadBatchMod();
  const { batches, modularity, method } = computeBatches(graph, o.computeBatchesOpts);

  // 2. Per-node fingerprints + compareResults (B).
  const { fingerprint, compareFingerprints } = await loadFingerprintMod();
  const { fingerprints, compareResults } = buildCompareResults(
    graph,
    prev,
    fingerprint,
    compareFingerprints,
  );

  // 3. projectStats dir-shape from node-id provenance (no FS walk).
  const currDirShape = deriveDirShape(graph);
  let prevDirShape = derivePrevDirShape(prev);
  // A caller that KNOWS a prior baseline existed (the store had a snapshot) but
  // whose prev map is empty can force the bootstrap signal off via
  // hadPriorBaseline:false-vs-true — but the canonical signal is the prev map
  // itself. We only honor an explicit `hadPriorBaseline:false` to FORCE bootstrap.
  if (o.hadPriorBaseline === false) prevDirShape = null;

  const projectStats = {
    totalFiles: currDirShape.totalFiles,
    prevDirShape,
    currDirShape: { dirs: currDirShape.dirs, counts: currDirShape.counts, layerHist: currDirShape.layerHist },
    ...(o.thresholds && typeof o.thresholds === 'object' ? { thresholds: o.thresholds } : {}),
  };

  // 4. Classify (C).
  const classification = classify(compareResults, projectStats);

  // 5. Select batches. The --full opt-out forces FULL regardless of the verdict.
  const effectiveAction = o.forceFull ? 'FULL_UPDATE' : classification.action;
  const batchesToMap = selectBatches(batches, effectiveAction, classification.affectedBatchHints);

  // 6. neighborMap sidecar for SELECTED batches only.
  const neighborMaps = {};
  if (batchesToMap.length > 0) {
    const { buildNeighborMap } = await loadNeighborMod();
    const cap = Number.isInteger(o.neighborCap) && o.neighborCap >= 0 ? o.neighborCap : 50;
    for (const b of batchesToMap) {
      if (b && typeof b.id === 'string') {
        neighborMaps[b.id] = buildNeighborMap(b, graph, { cap });
      }
    }
  }

  return {
    action: effectiveAction,
    batches,
    batchesToMap,
    neighborMaps,
    fingerprints,
    compareResults,
    classification,
    method,
    modularity,
  };
}

module.exports = {
  planIncremental,
  // exported for the wiring layer + tests (pure helpers, no side effects).
  selectBatches,
  deriveDirShape,
  derivePrevDirShape,
  buildCompareResults,
  projectNode,
  indexForProjection,
  FINGERPRINTABLE,
};
