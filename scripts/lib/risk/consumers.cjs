'use strict';
/**
 * scripts/lib/risk/consumers.cjs — Phase 56 importer/consumer resolver for the
 * fact-forcing gate (hooks/gdd-fact-force.js).
 *
 * Wraps the Phase 52 typed DesignContext graph query (design-context-query.cjs
 * `load` + `consumersOf`) with a BEST-EFFORT file→node mapping and a
 * SOFTEN-IF-ABSENT contract: when `.design/context-graph.json` is missing,
 * unbuilt, or malformed, this returns `{ available:false, importers:[] }` and
 * NEVER throws — so the gate degrades to a warning on greenfield projects
 * rather than over-blocking (CONTEXT.md R3 / D3).
 *
 * Why a wrapper and not a direct consumersOf call: the graph indexes NODES
 * (ids like `component:Button`, `token:color/primary/500`), not file paths. A
 * writer action mutates a FILE (`src/components/Button.tsx`). We map the file
 * to its node id by lowercased basename/slug match against the node set, then
 * ask the Phase 52 query for that node's consumers, and finally surface the
 * consumer NAMES so the gate can check whether their files were Read.
 *
 * Dependency-free. The only I/O is the graph file read (delegated to the
 * Phase 52 `load`), and it is fully guarded.
 *
 * Public API:
 *   consumersOfFile(filePath, { root?, graph? })
 *     -> { available:boolean, importers:string[], targets:string[], nodeId?:string }
 *
 *   `available`  — true only when a graph loaded AND the file mapped to a node.
 *   `importers`  — consumer node names/slugs (lowercased), best-effort file
 *                  identifiers the gate matches against state.reads.
 *   `targets`    — the consumer node ids (raw, for diagnostics).
 *   `nodeId`     — the resolved node id for `filePath`, when one matched.
 */

const path = require('path');

// Phase 52 query — sibling under scripts/lib/. Resolved by package-root walk-up
// (Phase 53/54 lesson) so the require survives regardless of this module's
// install location. Loaded lazily + guarded so an absent sibling SOFTENS.
let _query = null;
let _queryResolved = false;

/**
 * Walk up from a start dir to the package root (the dir whose package.json
 * `name` is this package), returning that root or null. Used to resolve the
 * Phase 52 sibling robustly even when cwd differs from the install dir.
 */
function findPackageRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    try {
      const pkg = require(path.join(dir, 'package.json'));
      if (pkg && pkg.name === '@hegemonart/hone') return dir;
    } catch { /* not this level */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function getQuery() {
  if (_queryResolved) return _query;
  _queryResolved = true;
  // 1. Adjacent sibling (this file lives in scripts/lib/risk/, query in scripts/lib/).
  const candidates = [path.join(__dirname, '..', 'design-context-query.cjs')];
  // 2. Package-root walk-up fallback (robust to relocated installs).
  const root = findPackageRoot(__dirname);
  if (root) candidates.push(path.join(root, 'scripts', 'lib', 'design-context-query.cjs'));
  for (const c of candidates) {
    try {
      _query = require(c);
      if (_query && typeof _query.consumersOf === 'function' && typeof _query.load === 'function') {
        return _query;
      }
    } catch { /* try next candidate */ }
  }
  _query = null;
  return _query;
}

/**
 * Lowercase + tokenize a file basename or a node id/name into comparable slug
 * tokens. Splits on path separators, hyphens, underscores, dots, and colons
 * (node ids are `<type>:<name>` with `/`-segmented names). Drops the file
 * extension and short no-signal tokens.
 */
function slugTokens(s) {
  if (!s) return [];
  const lc = String(s).toLowerCase();
  // Drop a trailing file extension (`.tsx`, `.css.ts` -> keep `css`+`ts` out).
  const noExt = lc.replace(/\.[a-z0-9]+$/i, '');
  return noExt
    .split(/[\\/\-_.:]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

/** The most specific basename slug for a file (its basename, sans extension). */
function fileSlug(filePath) {
  const base = path.basename(String(filePath || ''));
  return base.replace(/\.[a-z0-9.]+$/i, '').toLowerCase();
}

/**
 * Best-effort: map a file path to a graph node id by matching the file's
 * basename slug against each node's id/name tokens. Prefers an exact basename
 * == node-name(slug) match; falls back to any shared token. Returns the matched
 * node id, or null when nothing matches.
 */
function fileToNodeId(filePath, graph) {
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  if (!nodes.length) return null;
  const fSlug = fileSlug(filePath);
  const fTokens = new Set(slugTokens(path.basename(String(filePath || ''))));
  if (!fSlug && fTokens.size === 0) return null;

  let exact = null;
  let partial = null;
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string') continue;
    const nameTokens = slugTokens(n.name != null ? n.name : '');
    const idTokens = slugTokens(n.id);
    // The node's "leaf" identifier: last segment of name, else last of id.
    const nameLeaf = nameTokens.length ? nameTokens[nameTokens.length - 1] : '';
    const idLeaf = idTokens.length ? idTokens[idTokens.length - 1] : '';
    if (fSlug && (fSlug === nameLeaf || fSlug === idLeaf)) {
      exact = n.id;
      break;
    }
    if (!partial) {
      for (const t of fTokens) {
        if (nameTokens.includes(t) || idTokens.includes(t)) { partial = n.id; break; }
      }
    }
  }
  return exact || partial;
}

/**
 * Resolve the consumer/importer identifiers for a file via the Phase 52 graph.
 *
 * @param {string} filePath               the file being mutated
 * @param {{root?:string, graph?:object}} [opts]
 *        root  — project root holding `.design/context-graph.json`
 *        graph — pre-loaded graph object (test injection; bypasses disk read)
 * @returns {{available:boolean, importers:string[], targets:string[], nodeId?:string}}
 */
function consumersOfFile(filePath, opts = {}) {
  const SOFT = { available: false, importers: [], targets: [] };
  try {
    const q = getQuery();
    if (!q) return SOFT;

    // Obtain the graph: injected (tests) or loaded from disk (guarded).
    let graph = opts && opts.graph;
    if (!graph) {
      const root = (opts && opts.root) || process.cwd();
      const graphPath = path.join(root, '.design', 'context-graph.json');
      try {
        graph = q.load(graphPath);
      } catch {
        // Absent / unbuilt / malformed -> SOFTEN to a warning, never throw.
        return SOFT;
      }
    }
    if (!graph || !Array.isArray(graph.nodes)) return SOFT;

    const nodeId = fileToNodeId(filePath, graph);
    if (!nodeId) {
      // Graph exists but this file maps to no node — treat as "no known
      // consumers" but mark available so the gate doesn't soften purely on a
      // mapping miss (an unmapped file genuinely has no importer prerequisite).
      return { available: true, importers: [], targets: [], nodeId: undefined };
    }

    const consumerNodes = q.consumersOf(graph, nodeId) || [];
    const targets = consumerNodes
      .map((n) => (n && typeof n.id === 'string' ? n.id : null))
      .filter(Boolean);
    // Importer identifiers the gate matches against state.reads: the consumer
    // node's leaf name (lowercased), which is the strongest signal for the
    // consumer's source-file basename.
    const importers = [];
    for (const n of consumerNodes) {
      if (!n) continue;
      const nameTokens = slugTokens(n.name != null ? n.name : '');
      const idTokens = slugTokens(n.id);
      const leaf = nameTokens.length ? nameTokens[nameTokens.length - 1]
        : (idTokens.length ? idTokens[idTokens.length - 1] : null);
      if (leaf) importers.push(leaf);
    }
    return {
      available: true,
      importers: Array.from(new Set(importers)),
      targets,
      nodeId,
    };
  } catch {
    // Any unexpected failure SOFTENS — the gate must never hard-fail on graph I/O.
    return SOFT;
  }
}

module.exports = {
  consumersOfFile,
  // exported for tests / reuse
  fileToNodeId,
  fileSlug,
  slugTokens,
  findPackageRoot,
};
