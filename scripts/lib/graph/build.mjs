// scripts/lib/graph/build.mjs — Plan 30.6-02 Task 2
//
// buildGraph: read .design/intel/graph.json, transform per RESEARCH.md
// intel→graph mapping, validate against schema 1.0, atomic-write to
// .design/graph/graph.json. Deterministic when `now` is passed (test seam).

import { readFileSync, existsSync } from 'node:fs';
import { compileValidator, SCHEMA_VERSION } from './schema.mjs';
import { atomicWriteJson } from './atomic-write.mjs';

const DEFAULT_INTEL = '.design/intel/graph.json';
const DEFAULT_OUT = '.design/graph/graph.json';
const DEFAULT_BUILDER_VERSION = '1.30.6';
const DEFAULT_SOURCE_MARKER = 'hone-intel-store';

/**
 * Build .design/graph/graph.json from a .design/intel/graph.json slice.
 *
 * @param {object} opts
 * @param {string} [opts.intelPath]      - default '.design/intel/graph.json'
 * @param {string} [opts.outPath]        - default '.design/graph/graph.json'
 * @param {string} [opts.builderVersion] - default '1.30.6'
 * @param {string} [opts.now]            - ISO timestamp override (deterministic tests)
 * @returns {{ok: true, nodeCount: number, edgeCount: number, outPath: string}}
 * @throws on missing intel, parse failure, schema-invalid output
 */
export function buildGraph({
  intelPath = DEFAULT_INTEL,
  outPath = DEFAULT_OUT,
  builderVersion = DEFAULT_BUILDER_VERSION,
  now = undefined,
} = {}) {
  if (!existsSync(intelPath)) {
    const err = new Error(`buildGraph: intel file not found at ${intelPath}`);
    err.code = 'INTEL_MISSING';
    throw err;
  }

  let intel;
  try {
    intel = JSON.parse(readFileSync(intelPath, 'utf8'));
  } catch (e) {
    const err = new Error(
      `buildGraph: failed to parse intel JSON at ${intelPath}: ${e.message}`,
    );
    err.code = 'INTEL_PARSE_FAILED';
    err.cause = e;
    throw err;
  }

  const nodes = (Array.isArray(intel.nodes) ? intel.nodes : []).map(
    (n) => transformNode(n),
  );
  const edges = (Array.isArray(intel.edges) ? intel.edges : []).map(
    (e) => transformEdge(e),
  );

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    metadata: {
      generatedAt: now ?? new Date().toISOString(),
      intelSource: intelPath,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      builderVersion,
    },
    nodes,
    edges,
  };

  const validate = compileValidator();
  if (!validate(payload)) {
    const err = new Error('buildGraph: payload failed schema validation');
    err.code = 'SCHEMA_INVALID';
    err.schemaErrors = validate.errors;
    throw err;
  }

  atomicWriteJson(outPath, payload);
  return {
    ok: true,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    outPath,
  };
}

/**
 * Intel → graph node transform per RESEARCH.md §Intel → graph transformation.
 * intel.name → graph.label; any extra fields land in attrs blob.
 */
function transformNode(n) {
  if (!n || typeof n !== 'object') return n;
  // Pull off named intel fields; spread rest into attrs (lenient passthrough).
  const { id, type, name, label, attrs, source, ...rest } = n;
  const out = { id, type };
  // Honor explicit label first; fall back to intel.name; otherwise omit.
  const labelOut = label ?? name;
  if (labelOut !== undefined) out.label = labelOut;
  // Merge intel-extra fields into attrs (existing attrs win).
  const restKeys = Object.keys(rest);
  if (attrs || restKeys.length) {
    out.attrs = { ...rest, ...(attrs || {}) };
  }
  out.source = source ?? DEFAULT_SOURCE_MARKER;
  return out;
}

/**
 * Intel → graph edge transform. Edges already use {from,to,kind} verbatim
 * per D-03.b — pure passthrough plus attrs absorption.
 */
function transformEdge(e) {
  if (!e || typeof e !== 'object') return e;
  const { from, to, kind, weight, attrs, source, ...rest } = e;
  const out = { from, to, kind };
  if (typeof weight === 'number') out.weight = weight;
  const restKeys = Object.keys(rest);
  if (attrs || restKeys.length) {
    out.attrs = { ...rest, ...(attrs || {}) };
  }
  out.source = source ?? DEFAULT_SOURCE_MARKER;
  return out;
}
