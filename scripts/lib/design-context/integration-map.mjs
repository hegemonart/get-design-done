#!/usr/bin/env node
// scripts/lib/design-context/integration-map.mjs - Phase 52 (DesignContext graph), executor D.
//
// Renders an Atomic-Design integration map (mermaid) from the canonical
// DesignContext graph at .design/context-graph.json. The map groups nodes into
// the four Atomic-Design tiers (Atomic, Molecular, Organism, Template) using the
// `layer` node subtype as the tier authority, then draws the `composes` and
// `extends` edges between entities so a reader sees how the system assembles.
//
// Tier assignment
// ---------------
// A `layer` node carries a subtype of Atomic / Molecular / Organism / Template
// and a set of `composes`/`extends` edges to the entities that sit in that tier.
// Every entity reachable from a layer node by a composes/extends edge is placed
// in that layer's tier. An entity with no layer membership lands in an
// "Unlayered" bucket so nothing is silently dropped. When the graph has NO layer
// nodes at all (a pre-taxonomy graph), every composes/extends participant falls
// into "Unlayered" and the map still renders.
//
// Pure render seam
// ----------------
// render(graph) -> mermaid markdown string. No I/O, no Date.now(), no deps. The
// CLI main() reads .design/context-graph.json and atomic-writes
// .design/INTEGRATION-MAP.md via the sibling graph/atomic-write helper. main() is
// non-fatal when the graph is absent or unreadable: it prints a notice to stderr
// and returns 0, so a pipeline step that always runs it never breaks a build.
//
// No network, no optional deps, no top-level Date.now() (stamped only in main()).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, renameSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';

const DEFAULT_GRAPH = path.join('.design', 'context-graph.json');
const DEFAULT_OUT = path.join('.design', 'INTEGRATION-MAP.md');

// The four Atomic-Design tiers, in render order (broad to composed).
const TIERS = ['Atomic', 'Molecular', 'Organism', 'Template'];
const UNLAYERED = 'Unlayered';

// Edges that express assembly. composes = whole -> part; extends = special -> base.
const ASSEMBLY_EDGE_TYPES = new Set(['composes', 'extends']);

function nodeList(graph) {
  return Array.isArray(graph && graph.nodes) ? graph.nodes : [];
}
function edgeList(graph) {
  return Array.isArray(graph && graph.edges) ? graph.edges : [];
}

/**
 * Map every node id to its Atomic-Design tier. A `layer` node's subtype names a
 * tier; the entities it composes/extends inherit that tier. Ids not reached from
 * any layer land in UNLAYERED. A node id may appear under at most one tier (first
 * layer membership wins, layers walked in TIERS order then by id for stability).
 */
function tierByNodeId(graph) {
  const nodes = nodeList(graph);
  const edges = edgeList(graph);
  const byId = new Map(nodes.filter((n) => n && typeof n.id === 'string').map((n) => [n.id, n]));

  // Layer nodes grouped by their tier subtype.
  const layerNodes = nodes.filter((n) => n && n.type === 'layer' && typeof n.id === 'string');
  const tierOfLayer = new Map();
  for (const ln of layerNodes) {
    const sub = TIERS.includes(ln.subtype) ? ln.subtype : UNLAYERED;
    tierOfLayer.set(ln.id, sub);
  }

  // For each layer, the entities it reaches via a composes/extends edge.
  const assignment = new Map(); // nodeId -> tier
  const orderedLayers = [...layerNodes].sort((a, b) => {
    const ta = TIERS.indexOf(tierOfLayer.get(a.id));
    const tb = TIERS.indexOf(tierOfLayer.get(b.id));
    if (ta !== tb) return (ta === -1 ? TIERS.length : ta) - (tb === -1 ? TIERS.length : tb);
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  for (const ln of orderedLayers) {
    const tier = tierOfLayer.get(ln.id) || UNLAYERED;
    for (const e of edges) {
      if (!e || !ASSEMBLY_EDGE_TYPES.has(e.type)) continue;
      // A layer "owns" the member regardless of edge direction: the member is the
      // non-layer endpoint of an assembly edge that touches this layer.
      let member = null;
      if (e.source === ln.id) member = e.target;
      else if (e.target === ln.id) member = e.source;
      if (member && byId.has(member) && !assignment.has(member)) assignment.set(member, tier);
    }
    // The layer node itself sits in its own tier.
    if (!assignment.has(ln.id)) assignment.set(ln.id, tier);
  }

  return { assignment, byId };
}

/** Sanitize a node id into a mermaid-safe node key (alnum + underscore). */
function mermaidKey(id) {
  return 'n_' + String(id).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Escape a label for a mermaid quoted node label. */
function mermaidLabel(node) {
  const name = (node && (node.name || node.id)) || '';
  const type = (node && node.type) || '';
  const text = type ? `${name} (${type})` : `${name}`;
  return text.replace(/"/g, "'").replace(/[\r\n]+/g, ' ');
}

/**
 * Pure render: build the Atomic-Design integration map as mermaid markdown.
 * @param {object} graph  a DesignContext graph ({nodes[], edges[]}) or empty/absent.
 * @returns {string} markdown with a fenced mermaid flowchart, always non-empty.
 */
export function render(graph) {
  const nodes = nodeList(graph);
  const edges = edgeList(graph);
  const { assignment, byId } = tierByNodeId(graph);

  // Bucket every assembly participant by tier (so the diagram only draws nodes
  // that actually take part in composition, plus their layer nodes).
  const buckets = new Map([...TIERS, UNLAYERED].map((t) => [t, []]));
  const drawn = new Set();
  const place = (id) => {
    if (!byId.has(id) || drawn.has(id)) return;
    const tier = assignment.get(id) || UNLAYERED;
    buckets.get(tier).push(id);
    drawn.add(id);
  };
  for (const e of edges) {
    if (!e || !ASSEMBLY_EDGE_TYPES.has(e.type)) continue;
    place(e.source);
    place(e.target);
  }
  // Always show layer nodes even if they have no assembly edge yet.
  for (const n of nodes) if (n && n.type === 'layer') place(n.id);

  const lines = [];
  lines.push('# Integration Map');
  lines.push('');
  lines.push(
    'Atomic-Design composition map derived from `.design/context-graph.json`. Nodes are grouped ' +
      'by Atomic-Design tier (from `layer` node subtype); edges show `composes` and `extends` ' +
      'relationships. Regenerate with `node scripts/lib/design-context/integration-map.mjs`.',
  );
  lines.push('');

  const totalDrawn = [...buckets.values()].reduce((acc, ids) => acc + ids.length, 0);
  if (totalDrawn === 0) {
    lines.push('_No `composes`/`extends` relationships in the graph yet, so there is nothing to map._');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('```mermaid');
  lines.push('flowchart TD');

  // Subgraphs per tier (only non-empty ones), in TIERS order then Unlayered.
  for (const tier of [...TIERS, UNLAYERED]) {
    const ids = buckets.get(tier);
    if (!ids.length) continue;
    lines.push(`  subgraph ${tier}`);
    for (const id of ids.sort()) {
      const node = byId.get(id);
      lines.push(`    ${mermaidKey(id)}["${mermaidLabel(node)}"]`);
    }
    lines.push('  end');
  }

  // Assembly edges (composes = solid arrow; extends = thick "extends" arrow).
  const seenEdge = new Set();
  for (const e of edges) {
    if (!e || !ASSEMBLY_EDGE_TYPES.has(e.type)) continue;
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const key = `${e.source}--${e.type}-->${e.target}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    const a = mermaidKey(e.source);
    const b = mermaidKey(e.target);
    if (e.type === 'extends') lines.push(`  ${a} -. extends .-> ${b}`);
    else lines.push(`  ${a} --> ${b}`);
  }

  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Atomic write (inlined twin of scripts/lib/graph/atomic-write.mjs for a text
// payload; that helper is JSON-only and the map is markdown). Same tmp+rename
// invariant: tmp lives in the SAME dir as target (Windows-atomic rename).
// ---------------------------------------------------------------------------

function atomicWriteText(target, body) {
  const parent = dirname(target);
  const base = basename(target);
  const tmp = join(
    parent,
    `.${base}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
  );
  if (resolve(dirname(tmp)) !== resolve(parent)) {
    throw new Error(`atomicWriteText invariant: tmp not in same dir as target (tmp=${tmp}, target=${target})`);
  }
  mkdirSync(parent, { recursive: true });
  try {
    writeFileSync(tmp, body, 'utf8');
    renameSync(tmp, target);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* swallow cleanup error; original throw wins */ }
    }
    throw err;
  }
}

/**
 * CLI entry. Reads the graph (argv[0] or the default path), renders the map, and
 * atomic-writes it (argv[1] or the default out). Non-fatal when the graph is
 * absent or unreadable: prints a notice and returns 0.
 * @returns {number} process exit code (0 always, by design; this is advisory).
 */
export function main(argv = process.argv.slice(2)) {
  const graphPath = argv[0] || DEFAULT_GRAPH;
  const outPath = argv[1] || DEFAULT_OUT;

  if (!fs.existsSync(graphPath)) {
    process.stderr.write(`integration-map: no graph at ${graphPath} (skipping, non-fatal)\n`);
    return 0;
  }
  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`integration-map: unreadable graph ${graphPath} (${err.message}) (skipping, non-fatal)\n`);
    return 0;
  }

  const md = render(graph);
  const stamp = `<!-- generated ${new Date().toISOString()} by scripts/lib/design-context/integration-map.mjs -->\n`;
  atomicWriteText(outPath, stamp + md);
  process.stderr.write(`integration-map: wrote ${outPath}\n`);
  return 0;
}

// ESM "run as script" guard (Windows + POSIX safe via pathToFileURL).
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exit(main());
