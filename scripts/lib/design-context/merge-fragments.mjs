#!/usr/bin/env node
// scripts/lib/design-context/merge-fragments.mjs — Phase 52 (DesignContext graph), executor B.
//
// Deterministic, dependency-free fragment merger. Reads N mapper Fragments
// (schema_version 52.0) and produces the single merged Graph
// (schema_version 52.0, NO `mapper` field) written atomically to disk.
//
// Merge rules
// -----------
// NODES — deduped by `id`:
//   - tags          : union (order-stable, de-duplicated)
//   - summary       : prefer the first NON-STUB summary (non-empty) seen; an
//                     empty-string summary is a stub the LLM phase fills later
//   - complexity    : prefer the first non-'moderate' value (the stub default)
//   - other fields  : first-writer-wins, but later non-empty values fill gaps
//                     left empty/absent by the first writer (e.g. value, layer,
//                     subtype). type/name keep the first non-empty.
//
// EDGES — deduped by (source,target,type); for each edge we verify BOTH
// endpoints resolve to a node id that exists in SOME fragment (the merged node
// set):
//   - both endpoints resolve  -> keep the edge (this is cross-fragment
//                                "recovery": the a11y fragment can reference a
//                                component:* node defined only in the component
//                                fragment, and the edge survives the merge);
//   - an endpoint is missing  -> DROP the edge and report it. A missing
//                                endpoint cannot be recovered (no node with that
//                                id exists in any fragment), so the edge is
//                                truly dangling.
//
// "Could not fix" items (dropped dangling edges; any unresolved id) are written
// to stderr, one per line, prefixed `could-not-fix:`.
//
// Public API:
//   merge(fragments) -> { graph, couldNotFix: string[] }   (pure)
//   main()           -> reads argv globs / .design/fragments/*.json, atomic-writes graph
//
// No network, no deps beyond the sibling atomic-write helper, no top-level
// Date.now() (stamped in main()).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { atomicWriteJson } from '../graph/atomic-write.mjs';

const SCHEMA_VERSION = '52.0';
const DEFAULT_OUT = path.join('.design', 'context-graph.json');
const DEFAULT_FRAGMENT_DIR = path.join('.design', 'fragments');

const STUB_COMPLEXITY = 'moderate';
const NODE_RESERVED = new Set(['id', 'type', 'name', 'summary', 'tags', 'complexity']);

function isNonStubSummary(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

/** Merge one node into the accumulator map (dedupe by id). */
function mergeNode(map, node) {
  if (!node || typeof node.id !== 'string') return;
  const existing = map.get(node.id);
  if (!existing) {
    // Clone so we never mutate the caller's input objects.
    map.set(node.id, {
      id: node.id,
      type: node.type,
      name: node.name,
      summary: isNonStubSummary(node.summary) ? node.summary : '',
      tags: Array.isArray(node.tags) ? [...new Set(node.tags)] : [],
      complexity: node.complexity || STUB_COMPLEXITY,
      ...copyExtras({}, node),
    });
    return;
  }

  // tags: union, order-stable.
  if (Array.isArray(node.tags) && node.tags.length) {
    const seen = new Set(existing.tags);
    for (const t of node.tags) if (!seen.has(t)) { existing.tags.push(t); seen.add(t); }
  }
  // summary: first non-stub wins.
  if (!isNonStubSummary(existing.summary) && isNonStubSummary(node.summary)) {
    existing.summary = node.summary;
  }
  // complexity: first non-default ('moderate' is the stub) wins.
  if (existing.complexity === STUB_COMPLEXITY && node.complexity && node.complexity !== STUB_COMPLEXITY) {
    existing.complexity = node.complexity;
  }
  // type/name: fill if the first writer left them empty.
  if (!existing.type && node.type) existing.type = node.type;
  if (!existing.name && node.name) existing.name = node.name;
  // extras: fill gaps the first writer did not set.
  copyExtras(existing, node, /* fillOnly */ true);
}

/** Copy non-reserved fields from `node` onto `target`. */
function copyExtras(target, node, fillOnly = false) {
  for (const k of Object.keys(node)) {
    if (NODE_RESERVED.has(k)) continue;
    if (fillOnly && target[k] !== undefined && target[k] !== '' && target[k] !== null) continue;
    target[k] = node[k];
  }
  return target;
}

/**
 * Pure merge.
 * @param {object[]} fragments  array of Fragment objects (each {nodes[], edges[]})
 * @returns {{graph: object, couldNotFix: string[]}}
 */
export function merge(fragments) {
  const list = Array.isArray(fragments) ? fragments : [fragments];
  const nodeMap = new Map();
  const couldNotFix = [];

  // Pass 1: union all nodes (so edge recovery can see ids from any fragment).
  for (const frag of list) {
    if (!frag || !Array.isArray(frag.nodes)) continue;
    for (const n of frag.nodes) mergeNode(nodeMap, n);
  }

  // Pass 2: dedupe + validate edges against the merged node set.
  const edgeMap = new Map();
  for (const frag of list) {
    if (!frag || !Array.isArray(frag.edges)) continue;
    for (const e of frag.edges) {
      if (!e || typeof e.source !== 'string' || typeof e.target !== 'string' || !e.type) {
        couldNotFix.push(`could-not-fix: malformed edge ${JSON.stringify(e)}`);
        continue;
      }
      const srcOk = nodeMap.has(e.source);
      const dstOk = nodeMap.has(e.target);
      if (!srcOk || !dstOk) {
        // Truly dangling — no node with that id exists in ANY fragment.
        const missing = [!srcOk ? `source=${e.source}` : null, !dstOk ? `target=${e.target}` : null]
          .filter(Boolean).join(' ');
        couldNotFix.push(`could-not-fix: dropped dangling edge (${e.type}) ${missing}`);
        continue;
      }
      // Recovered (or always-resolved) — keep, deduped by (source,target,type).
      const key = `${e.source}--${e.type}-->${e.target}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          source: e.source,
          target: e.target,
          type: e.type,
          direction: e.direction || 'forward',
          weight: typeof e.weight === 'number' ? e.weight : 0.5,
        });
      } else if (typeof e.weight === 'number') {
        // Keep the max weight when the same edge appears in two fragments.
        const cur = edgeMap.get(key);
        if (e.weight > cur.weight) cur.weight = e.weight;
      }
    }
  }

  const graph = {
    schema_version: SCHEMA_VERSION,
    generated_at: '',
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
  };
  return { graph, couldNotFix };
}

// ---------------------------------------------------------------------------
// CLI helpers.
// ---------------------------------------------------------------------------

/** Resolve argv into a concrete list of fragment file paths. */
function resolveInputs(argv) {
  // argv shape: [...inputs?] [--out <path>]
  const args = [...argv];
  let out = DEFAULT_OUT;
  const inputs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' || args[i] === '-o') { out = args[++i] || out; continue; }
    inputs.push(args[i]);
  }

  let files = [];
  if (inputs.length) {
    for (const inp of inputs) {
      let st;
      try { st = fs.statSync(inp); } catch { continue; }
      if (st.isDirectory()) {
        for (const f of fs.readdirSync(inp)) if (f.endsWith('.json')) files.push(path.join(inp, f));
      } else if (st.isFile()) {
        files.push(inp);
      }
    }
  } else if (fs.existsSync(DEFAULT_FRAGMENT_DIR)) {
    for (const f of fs.readdirSync(DEFAULT_FRAGMENT_DIR)) {
      if (f.endsWith('.json')) files.push(path.join(DEFAULT_FRAGMENT_DIR, f));
    }
  }
  files = [...new Set(files)].sort(); // deterministic order
  return { files, out };
}

function readFragment(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    process.stderr.write(`could-not-fix: unreadable fragment ${file} (${err.message})\n`);
    return null;
  }
}

/** CLI entry: read fragments, merge, stamp generated_at, atomic-write graph. */
export function main(argv = process.argv.slice(2)) {
  const { files, out } = resolveInputs(argv);
  const fragments = files.map(readFragment).filter(Boolean);
  const { graph, couldNotFix } = merge(fragments);
  graph.generated_at = new Date().toISOString();

  for (const line of couldNotFix) process.stderr.write(line + '\n');

  atomicWriteJson(out, graph);
  process.stderr.write(
    `merged ${fragments.length} fragment(s) -> ${out} (${graph.nodes.length} nodes, ${graph.edges.length} edges, ${couldNotFix.length} could-not-fix)\n`,
  );
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
