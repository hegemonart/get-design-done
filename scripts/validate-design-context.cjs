'use strict';
/**
 * validate-design-context.cjs — Phase 52 (Typed DesignContext Graph) validator.
 *
 * Validates a design-context graph file (canonical at .design/context-graph.json)
 * on five axes:
 *
 *   (a) schema/structural — required fields present, enums respected, weight in 0..1.
 *       A hand-rolled structural check is the default (dep-free); if `ajv` is
 *       resolvable it is layered on top for a fuller Draft-07 pass via the schema
 *       at reference/schemas/design-context.schema.json.
 *   (b) referential integrity — every edge source/target resolves to a node id
 *       (a dangling reference is a hard ERROR).
 *   (c) uniqueness — no two nodes share an id (a duplicate is a hard ERROR).
 *   (d) completeness — every node summary is non-empty and differs from name
 *       (a stub summary is a soft WARN).
 *   (e) tag vocabulary — every tag is in the controlled vocab below (an unknown
 *       tag is a soft WARN).
 *
 * SOURCE OF TRUTH: the controlled tag vocabulary (TAG_VOCAB) lives in this file.
 * reference/design-context-tag-vocab.md mirrors it for human readers; this array
 * is what the validator enforces. Keep the doc in sync by hand when editing here.
 *
 * Public API:
 *   validateGraph(graph) -> { errors: string[], warnings: string[] }
 *   main(argv)           -> exit code (0 clean / 1 warnings only / 2 errors)
 *
 * CLI:
 *   node scripts/validate-design-context.cjs [path] [--json]
 *   (path defaults to .design/context-graph.json under cwd)
 *
 * Exit: 0 clean · 1 warnings only · 2 errors (or usage/IO failure).
 */

const fs = require('fs');
const path = require('path');
const { probeOptional } = require('./lib/probe-optional.cjs');

// ---------------------------------------------------------------------------
// Controlled vocabularies (source of truth)
// ---------------------------------------------------------------------------

const NODE_TYPES = [
  'token',
  'component',
  'variant',
  'state',
  'motion-fragment',
  'a11y-pattern',
  'screen',
  'layer',
  'pattern',
  'anti-pattern',
];

const EDGE_TYPES = [
  'uses-token',
  'composes',
  'extends',
  'transitions-to',
  'depends-on',
  'mirrors',
  'conflicts-with',
  'referenced-by',
  'tested-by',
  'documented-by',
  'consumes-context',
  'provides-context',
];

const DIRECTIONS = ['forward', 'backward', 'bidirectional'];
const COMPLEXITY = ['simple', 'moderate', 'complex'];

/**
 * The controlled tags[] vocabulary the validator checks node tags against.
 * Grouped by concern in the comments; the flat Set is what gets enforced.
 * Mirror of reference/design-context-tag-vocab.md (this is the source of truth).
 */
const TAG_VOCAB = new Set([
  // color
  'color', 'palette', 'theme', 'dark-mode', 'light-mode', 'contrast', 'gradient', 'surface', 'brand',
  // spacing / sizing
  'spacing', 'sizing', 'density', 'gap', 'inset', 'stack',
  // typography
  'typography', 'font', 'type-scale', 'heading', 'body-text', 'label', 'numeric',
  // radius / shape / elevation
  'radius', 'shape', 'border', 'shadow', 'elevation', 'depth',
  // motion
  'motion', 'transition', 'animation', 'easing', 'duration', 'enter', 'exit', 'loop', 'gesture',
  // accessibility
  'a11y', 'aria', 'focus', 'keyboard', 'screen-reader', 'reduced-motion', 'contrast-safe', 'touch-target',
  // layout / structure
  'layout', 'grid', 'flex', 'responsive', 'breakpoint', 'container', 'overflow', 'position', 'z-index',
  // interaction state
  'state', 'hover', 'active', 'disabled', 'loading', 'error', 'success', 'selected', 'pressed', 'dragging',
  // component taxonomy
  'atom', 'molecule', 'organism', 'template', 'primitive', 'composite', 'layout-primitive',
  // forms / inputs
  'form', 'input', 'control', 'validation', 'field',
  // navigation / structure
  'navigation', 'overlay', 'modal', 'menu', 'tabs', 'data-display', 'feedback', 'media',
  // semantic role
  'interactive', 'static', 'decorative', 'destructive', 'utility',
  // quality flags
  'deprecated', 'experimental', 'stable', 'anti-pattern', 'review-needed',
]);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Hand-rolled structural pass over a graph. Pushes hard errors into `errors`.
 * Mirrors the required fields + enums of design-context.schema.json so the
 * validator works with zero dependencies.
 */
function structuralCheck(graph, errors) {
  if (!isPlainObject(graph)) {
    errors.push('graph: root must be an object');
    return { nodes: [], edges: [] };
  }
  if (typeof graph.schema_version !== 'string' || graph.schema_version.length === 0) {
    errors.push('graph.schema_version: required non-empty string');
  }
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : (errors.push('graph.nodes: required array'), []);
  const edges = Array.isArray(graph.edges) ? graph.edges : (errors.push('graph.edges: required array'), []);

  nodes.forEach((n, i) => {
    const at = `nodes[${i}]`;
    if (!isPlainObject(n)) { errors.push(`${at}: must be an object`); return; }
    if (typeof n.id !== 'string' || n.id.length === 0) errors.push(`${at}.id: required non-empty string`);
    if (typeof n.name !== 'string' || n.name.length === 0) errors.push(`${at}.name: required non-empty string`);
    if (typeof n.summary !== 'string') errors.push(`${at}.summary: required string`);
    if (!NODE_TYPES.includes(n.type)) errors.push(`${at}.type: "${n.type}" not in {${NODE_TYPES.join(', ')}}`);
    if (!COMPLEXITY.includes(n.complexity)) errors.push(`${at}.complexity: "${n.complexity}" not in {${COMPLEXITY.join(', ')}}`);
    if (n.tags !== undefined && !(Array.isArray(n.tags) && n.tags.every((t) => typeof t === 'string'))) {
      errors.push(`${at}.tags: must be an array of strings`);
    }
  });

  edges.forEach((e, i) => {
    const at = `edges[${i}]`;
    if (!isPlainObject(e)) { errors.push(`${at}: must be an object`); return; }
    if (typeof e.source !== 'string' || e.source.length === 0) errors.push(`${at}.source: required non-empty string`);
    if (typeof e.target !== 'string' || e.target.length === 0) errors.push(`${at}.target: required non-empty string`);
    if (!EDGE_TYPES.includes(e.type)) errors.push(`${at}.type: "${e.type}" not in {${EDGE_TYPES.join(', ')}}`);
    if (!DIRECTIONS.includes(e.direction)) errors.push(`${at}.direction: "${e.direction}" not in {${DIRECTIONS.join(', ')}}`);
    if (typeof e.weight !== 'number' || Number.isNaN(e.weight) || e.weight < 0 || e.weight > 1) {
      errors.push(`${at}.weight: must be a number in 0..1`);
    }
  });

  return { nodes, edges };
}

/**
 * Optional Ajv upgrade. If `ajv` resolves, compile the on-disk Draft-07 schema
 * and fold any messages into `errors`. Silently skipped when ajv is absent so
 * the validator stays dep-free. Never throws on a missing schema file.
 */
function ajvCheck(graph, errors) {
  const Ajv = probeOptional('ajv');
  if (!Ajv) return false;
  const schemaPath = path.join(__dirname, '..', 'reference', 'schemas', 'design-context.schema.json');
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch {
    return false;
  }
  let validate;
  try {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const addFormats = probeOptional('ajv-formats');
    if (addFormats) addFormats(ajv);
    validate = ajv.compile(schema);
  } catch {
    return false;
  }
  if (!validate(graph)) {
    for (const err of validate.errors || []) {
      const where = err.instancePath || '(root)';
      const msg = `schema ${where} ${err.message}`;
      if (!errors.includes(msg)) errors.push(msg);
    }
  }
  return true;
}

/**
 * Validate a parsed graph object.
 * @param {unknown} graph
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateGraph(graph) {
  const errors = [];
  const warnings = [];

  // (a) structural — hand-rolled (always) + Ajv (when available).
  const { nodes, edges } = structuralCheck(graph, errors);
  ajvCheck(graph, errors);

  // (c) uniqueness — duplicate node ids are hard errors.
  const idCounts = new Map();
  for (const n of nodes) {
    if (isPlainObject(n) && typeof n.id === 'string') {
      idCounts.set(n.id, (idCounts.get(n.id) || 0) + 1);
    }
  }
  const idSet = new Set();
  for (const [id, count] of idCounts) {
    idSet.add(id);
    if (count > 1) errors.push(`duplicate node id: "${id}" appears ${count} times`);
  }

  // (b) referential integrity — dangling edge endpoints are hard errors.
  edges.forEach((e, i) => {
    if (!isPlainObject(e)) return;
    if (typeof e.source === 'string' && e.source && !idSet.has(e.source)) {
      errors.push(`edges[${i}].source: "${e.source}" does not resolve to a node id (dangling)`);
    }
    if (typeof e.target === 'string' && e.target && !idSet.has(e.target)) {
      errors.push(`edges[${i}].target: "${e.target}" does not resolve to a node id (dangling)`);
    }
  });

  // (d) completeness — stub summaries are soft warnings.
  nodes.forEach((n, i) => {
    if (!isPlainObject(n) || typeof n.summary !== 'string') return;
    const summary = n.summary.trim();
    if (summary.length === 0) {
      warnings.push(`nodes[${i}] (${n.id || '?'}): empty summary (stub)`);
    } else if (typeof n.name === 'string' && summary === n.name.trim()) {
      warnings.push(`nodes[${i}] (${n.id || '?'}): summary equals name (stub)`);
    }
  });

  // (e) tag vocabulary — unknown tags are soft warnings.
  nodes.forEach((n, i) => {
    if (!isPlainObject(n) || !Array.isArray(n.tags)) return;
    for (const tag of n.tags) {
      if (typeof tag === 'string' && !TAG_VOCAB.has(tag)) {
        warnings.push(`nodes[${i}] (${n.id || '?'}): unknown tag "${tag}" (not in controlled vocab)`);
      }
    }
  });

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const json = argv.includes('--json');
  const positional = argv.filter((a) => !a.startsWith('--'));
  const explicit = positional.length > 0;
  const target = positional[0] || path.join(process.cwd(), '.design', 'context-graph.json');

  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (e) {
    // A missing DEFAULT graph is a clean no-op (exit 0): the DesignContext
    // graph is a per-project artifact authored by the mapper agents, never
    // shipped in this repo, so a clean checkout has nothing to validate. This
    // keeps the `validate:design-context` CI gate green. An EXPLICITLY-passed
    // path that is missing still fails loudly (exit 2) — a typo'd argument or a
    // project that expects a graph at a named location must not silently pass.
    if (!explicit && e.code === 'ENOENT') {
      if (json) {
        process.stdout.write(
          JSON.stringify({ file: target, present: false, errors: [], warnings: [] }, null, 2) + '\n',
        );
      } else {
        process.stdout.write(`validate-design-context: no graph at ${target} — nothing to validate\n`);
      }
      return 0;
    }
    process.stderr.write(`validate-design-context: cannot read ${target}: ${e.message}\n`);
    return 2;
  }

  let graph;
  try {
    graph = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`validate-design-context: ${target} is not valid JSON: ${e.message}\n`);
    return 2;
  }

  const { errors, warnings } = validateGraph(graph);

  if (json) {
    process.stdout.write(JSON.stringify({ file: target, errors, warnings }, null, 2) + '\n');
  } else {
    for (const err of errors) process.stdout.write(`ERROR  ${err}\n`);
    for (const w of warnings) process.stdout.write(`WARN   ${w}\n`);
    process.stdout.write(
      `validate-design-context: ${target} — ${errors.length} error(s), ${warnings.length} warning(s)\n`,
    );
  }

  if (errors.length) return 2;
  if (warnings.length) return 1;
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  validateGraph,
  main,
  NODE_TYPES,
  EDGE_TYPES,
  DIRECTIONS,
  COMPLEXITY,
  TAG_VOCAB,
};
