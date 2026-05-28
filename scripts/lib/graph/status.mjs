// scripts/lib/graph/status.mjs — Plan 30.6-02 Task 2
//
// statusGraph: read .design/graph/graph.json, return structured status JSON.
// Gracefully degrades when graph file is missing — returns
// {configured:false, exists:false} without throwing (the 6 status callsites
// probe before issuing other commands).

import { readFileSync, existsSync, statSync } from 'node:fs';
import { compileValidator } from './schema.mjs';

const DEFAULT_GRAPH = '.design/graph/graph.json';
const DEFAULT_INTEL = '.design/intel/graph.json';

/**
 * Report status of the native graph store.
 *
 * @param {object} opts
 * @param {string} [opts.graphPath] - default '.design/graph/graph.json'
 * @param {string} [opts.intelPath] - default '.design/intel/graph.json' (used for staleness)
 * @returns {object} structured status — see RESEARCH.md §Subcommand inventory
 */
export function statusGraph({
  graphPath = DEFAULT_GRAPH,
  intelPath = DEFAULT_INTEL,
} = {}) {
  if (!existsSync(graphPath)) {
    return { configured: false, exists: false };
  }

  let raw;
  try {
    raw = readFileSync(graphPath, 'utf8');
  } catch (e) {
    return {
      configured: true,
      exists: true,
      schemaInvalid: true,
      errors: [{ message: `read failed: ${e.message}` }],
    };
  }

  let graph;
  try {
    graph = JSON.parse(raw);
  } catch (e) {
    return {
      configured: true,
      exists: true,
      schemaInvalid: true,
      errors: [{ message: `parse failed: ${e.message}` }],
    };
  }

  const validate = compileValidator();
  if (!validate(graph)) {
    return {
      configured: true,
      exists: true,
      schemaInvalid: true,
      errors: validate.errors,
    };
  }

  const lastBuiltAt = graph.metadata?.generatedAt ?? null;

  let stale = false;
  if (existsSync(intelPath) && lastBuiltAt) {
    try {
      const intelMtime = statSync(intelPath).mtimeMs;
      const builtMs = Date.parse(lastBuiltAt);
      if (Number.isFinite(builtMs) && intelMtime > builtMs) {
        stale = true;
      }
    } catch {
      // Stat failed — leave stale=false; not a hard error.
    }
  }

  return {
    configured: true,
    exists: true,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    schemaVersion: graph.schemaVersion,
    lastBuiltAt,
    stale,
  };
}
