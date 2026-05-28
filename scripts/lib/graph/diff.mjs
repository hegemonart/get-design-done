// scripts/lib/graph/diff.mjs — Plan 30.6-02 Task 2
//
// diffGraph: compare two graph.json files, emit {addedNodes, removedNodes,
// changedNodes, addedEdges, removedEdges}. Node identity = .id; edge
// identity = `${from}::${to}::${kind}` per upstream-key formula.

import { readFileSync, existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { compileValidator } from './schema.mjs';

/**
 * Diff two graphs by file path.
 *
 * @param {object} opts
 * @param {string} opts.fromPath - baseline graph path
 * @param {string} opts.toPath   - current graph path
 * @returns {{addedNodes: any[], removedNodes: any[], changedNodes: Array<{id:string, before:any, after:any}>, addedEdges: any[], removedEdges: any[]}}
 */
export function diffGraph({ fromPath, toPath } = {}) {
  if (!fromPath || !toPath) {
    const err = new Error('diffGraph: fromPath and toPath are required');
    err.code = 'DIFF_ARGS_MISSING';
    throw err;
  }
  const from = readAndValidate(fromPath, 'fromPath');
  const to = readAndValidate(toPath, 'toPath');

  const fromNodeMap = new Map(from.nodes.map((n) => [n.id, n]));
  const toNodeMap = new Map(to.nodes.map((n) => [n.id, n]));

  const addedNodes = [];
  const removedNodes = [];
  const changedNodes = [];

  for (const [id, after] of toNodeMap) {
    if (!fromNodeMap.has(id)) {
      addedNodes.push(after);
    } else {
      const before = fromNodeMap.get(id);
      if (!isDeepStrictEqual(before, after)) {
        changedNodes.push({ id, before, after });
      }
    }
  }
  for (const [id, before] of fromNodeMap) {
    if (!toNodeMap.has(id)) removedNodes.push(before);
  }

  const edgeKey = (e) => `${e.from}::${e.to}::${e.kind}`;
  const fromEdgeMap = new Map(from.edges.map((e) => [edgeKey(e), e]));
  const toEdgeMap = new Map(to.edges.map((e) => [edgeKey(e), e]));

  const addedEdges = [];
  const removedEdges = [];
  for (const [k, e] of toEdgeMap) if (!fromEdgeMap.has(k)) addedEdges.push(e);
  for (const [k, e] of fromEdgeMap) if (!toEdgeMap.has(k)) removedEdges.push(e);

  return {
    addedNodes,
    removedNodes,
    changedNodes,
    addedEdges,
    removedEdges,
  };
}

function readAndValidate(path, label) {
  if (!existsSync(path)) {
    const err = new Error(`diffGraph: ${label} not found at ${path}`);
    err.code = 'DIFF_FILE_MISSING';
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    const err = new Error(`diffGraph: ${label} parse failed: ${e.message}`);
    err.code = 'DIFF_PARSE_FAILED';
    err.cause = e;
    throw err;
  }
  const validate = compileValidator();
  if (!validate(parsed)) {
    const err = new Error(`diffGraph: ${label} failed schema validation`);
    err.code = 'DIFF_SCHEMA_INVALID';
    err.schemaErrors = validate.errors;
    throw err;
  }
  return parsed;
}
