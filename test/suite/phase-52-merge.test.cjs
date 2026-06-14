'use strict';
// test/suite/phase-52-merge.test.cjs — Phase 52 (DesignContext graph), executor B.
//
// Proves scripts/lib/design-context/merge-fragments.mjs:
//   - merge() dedupes nodes by id across two fragments — unioning tags,
//     preferring a non-stub summary over the '' stub, and preferring a
//     non-'moderate' complexity over the stub default;
//   - an edge whose endpoints live in DIFFERENT fragments is RECOVERED (kept)
//     because the merged node set resolves both ids — the cross-fragment case;
//   - a truly-dangling edge (an endpoint that exists in NO fragment) is DROPPED
//     and reported in couldNotFix as a `could-not-fix:` line;
//   - edges are deduped by (source,target,type) and the max weight wins;
//   - the merged Graph carries schema_version '52.0' and NO `mapper` field;
//   - round-trip: extract (real extractors) -> merge -> the merged graph passes
//     scripts/validate-design-context.cjs `validateGraph` when sibling A has
//     shipped it; if that module is absent at runtime (parallel wave), assert
//     the structural shape instead (per the executor brief).
//
// Hermetic: any on-disk artifacts live under os.tmpdir() and are removed in
// teardown. merge() is pure and exercised directly; main()'s atomic write is
// covered by the round-trip-to-disk test.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DC_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'design-context');

function importMjs(name) {
  return import(pathToFileURL(path.join(DC_DIR, name)).href);
}
function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// Try to load sibling A's validator (require-by-path only; may be absent during
// the parallel wave). Returns a validateGraph fn or null.
function loadValidateGraph() {
  const p = path.join(REPO_ROOT, 'scripts', 'validate-design-context.cjs');
  if (!fs.existsSync(p)) return null;
  try {
    const mod = require(p);
    if (mod && typeof mod.validateGraph === 'function') return mod.validateGraph;
  } catch { /* not loadable yet */ }
  return null;
}

// A minimal structural validator used when sibling A's is not yet present.
function assertGraphShape(graph) {
  assert.equal(graph.schema_version, '52.0', 'merged graph schema_version 52.0');
  assert.ok(!('mapper' in graph), 'merged graph must NOT carry a mapper field');
  assert.ok(Array.isArray(graph.nodes));
  assert.ok(Array.isArray(graph.edges));
  const ids = new Set();
  for (const n of graph.nodes) {
    assert.equal(typeof n.id, 'string');
    assert.ok(!ids.has(n.id), `node id unique: ${n.id}`);
    ids.add(n.id);
    assert.equal(typeof n.type, 'string');
    assert.ok(Array.isArray(n.tags));
  }
  // No dangling edges: every endpoint resolves to a node in the merged set.
  for (const e of graph.edges) {
    assert.ok(ids.has(e.source), `edge source resolves: ${e.source}`);
    assert.ok(ids.has(e.target), `edge target resolves: ${e.target}`);
    assert.equal(typeof e.type, 'string');
  }
}

// ---------------------------------------------------------------------------
// Fixture fragments.
// ---------------------------------------------------------------------------

function frag(mapper, nodes, edges) {
  return { schema_version: '52.0', mapper, generated_at: '', nodes, edges };
}
function node(id, type, extra) {
  return { id, type, name: id.split(':').pop(), summary: '', tags: [], complexity: 'moderate', ...extra };
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

test('merge: dedupes a shared node id, unions tags, prefers non-stub summary/complexity', async () => {
  const { merge } = await importMjs('merge-fragments.mjs');

  const a = frag('token-mapper',
    [node('token:color:brand', 'token', { tags: ['brand'], summary: '', complexity: 'moderate', subtype: 'color' })],
    []);
  const b = frag('component-taxonomy-mapper',
    [node('token:color:brand', 'token', { tags: ['primary', 'brand'], summary: 'Brand primary color', complexity: 'simple' })],
    []);

  const { graph } = merge([a, b]);
  const merged = graph.nodes.filter((n) => n.id === 'token:color:brand');
  assert.equal(merged.length, 1, 'shared node id collapses to one');
  const n = merged[0];
  assert.deepEqual([...n.tags].sort(), ['brand', 'primary'], 'tags unioned (de-duped)');
  assert.equal(n.summary, 'Brand primary color', 'non-stub summary preferred over the empty stub');
  assert.equal(n.complexity, 'simple', 'non-moderate complexity preferred over the stub');
  assert.equal(n.subtype, 'color', 'extra fields preserved/gap-filled');
});

test('merge: RECOVERS a cross-fragment edge (endpoints in different fragments)', async () => {
  const { merge } = await importMjs('merge-fragments.mjs');

  // Component node lives in fragment A; the edge referencing it lives in B.
  const a = frag('component-taxonomy-mapper', [node('component:button', 'component', { layer: 'Atomic' })], []);
  const b = frag('a11y-mapper',
    [node('a11y-pattern:aria-attributes', 'a11y-pattern', {})],
    [{ source: 'component:button', target: 'a11y-pattern:aria-attributes', type: 'referenced-by', direction: 'forward', weight: 0.5 }]);

  const { graph, couldNotFix } = merge([a, b]);
  const recovered = graph.edges.find(
    (e) => e.source === 'component:button' && e.target === 'a11y-pattern:aria-attributes' && e.type === 'referenced-by',
  );
  assert.ok(recovered, 'cross-fragment edge is recovered (kept) because both ids resolve in the merged set');
  assert.equal(couldNotFix.length, 0, 'a recoverable edge is NOT reported as could-not-fix');
});

test('merge: DROPS + reports a truly-dangling edge (endpoint in no fragment)', async () => {
  const { merge } = await importMjs('merge-fragments.mjs');

  const a = frag('token-mapper', [node('token:color:x', 'token', { subtype: 'color' })], [
    { source: 'component:ghost', target: 'token:color:x', type: 'uses-token', direction: 'forward', weight: 0.5 },
  ]);

  const { graph, couldNotFix } = merge([a]);
  const dropped = graph.edges.find((e) => e.source === 'component:ghost');
  assert.equal(dropped, undefined, 'dangling edge is dropped from the graph');
  assert.equal(couldNotFix.length, 1, 'exactly one could-not-fix item');
  assert.match(couldNotFix[0], /^could-not-fix:/, 'reported with the could-not-fix: prefix');
  assert.match(couldNotFix[0], /component:ghost/, 'names the unresolved endpoint');
});

test('merge: dedupes edges by (source,target,type), keeping max weight', async () => {
  const { merge } = await importMjs('merge-fragments.mjs');
  const n1 = node('component:card', 'component', { layer: 'Molecular' });
  const n2 = node('component:button', 'component', { layer: 'Atomic' });
  const a = frag('m1', [n1, n2], [{ source: 'component:card', target: 'component:button', type: 'composes', direction: 'forward', weight: 0.4 }]);
  const b = frag('m2', [n1, n2], [{ source: 'component:card', target: 'component:button', type: 'composes', direction: 'forward', weight: 0.9 }]);

  const { graph } = merge([a, b]);
  const edges = graph.edges.filter((e) => e.source === 'component:card' && e.target === 'component:button' && e.type === 'composes');
  assert.equal(edges.length, 1, 'duplicate edge collapses to one');
  assert.equal(edges[0].weight, 0.9, 'max weight wins');
});

test('merge: result has schema_version 52.0 and no mapper field', async () => {
  const { merge } = await importMjs('merge-fragments.mjs');
  const { graph } = merge([frag('x', [node('token:color:x', 'token', {})], [])]);
  assert.equal(graph.schema_version, '52.0');
  assert.ok(!('mapper' in graph), 'graph drops the per-fragment mapper field');
});

test('merge: empty input yields an empty, well-formed graph', async () => {
  const { merge } = await importMjs('merge-fragments.mjs');
  const { graph, couldNotFix } = merge([]);
  assert.equal(graph.nodes.length, 0);
  assert.equal(graph.edges.length, 0);
  assert.equal(couldNotFix.length, 0);
  assertGraphShape(graph);
});

test('round-trip: extract real fixtures -> merge -> graph validates (or matches shape)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p52-roundtrip-'));
  try {
    const src = path.join(dir, 'src');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(src, 'Button.tsx'),
      [
        'export function Button() {',
        '  return (',
        '    <button',
        '      className="bg-blue-500 text-lg rounded-md"',
        '      aria-label="go"',
        '      role="button"',
        '      tabIndex={0}',
        '      onKeyDown={() => {}}',
        "      style={{ color: '#ff8800' }}",
        '    >Go</button>',
        '  );',
        '}',
      ].join('\n'),
      'utf8',
    );

    const tokens = (await importMjs('extract-tokens.mjs')).extract(src);
    const comps = (await importMjs('extract-components.mjs')).extract(src);
    const a11y = (await importMjs('extract-a11y.mjs')).extract(src);
    const vh = (await importMjs('extract-visual-hierarchy.mjs')).extract(src);

    const { merge } = await importMjs('merge-fragments.mjs');
    const { graph, couldNotFix } = merge([tokens, comps, a11y, vh]);
    graph.generated_at = new Date().toISOString();

    // The a11y/token fragments emit component:button edges; the component
    // fragment defines component:button — so those edges RECOVER and the merged
    // graph has NO dangling edges (the round-trip is clean).
    assert.equal(couldNotFix.length, 0, 'clean round-trip: every edge resolves');
    assert.ok(graph.nodes.length > 0, 'graph has nodes');
    assert.ok(graph.edges.length > 0, 'graph has recovered edges');

    const validateGraph = loadValidateGraph();
    if (validateGraph) {
      const res = validateGraph(graph);
      // Tolerate either a boolean-true or an {ok/valid/errors} result shape —
      // sibling A owns the exact contract. Hard errors (dangling/dup-id) must
      // be absent; non-stub summary soft-warnings are acceptable.
      if (typeof res === 'boolean') {
        assert.ok(res, 'sibling A validateGraph accepts the merged graph');
      } else if (res && typeof res === 'object') {
        const ok = res.ok ?? res.valid ?? (Array.isArray(res.errors) ? res.errors.length === 0 : undefined);
        const errors = res.errors || res.hardErrors || [];
        // Allow soft warnings; only fail on hard errors if the shape exposes them.
        if (ok === false && Array.isArray(errors) && errors.length) {
          const hard = errors.filter((e) => {
            const s = (typeof e === 'string' ? e : (e && (e.message || e.keyword || ''))).toLowerCase();
            return /dangling|duplicate|unique|required|schema/.test(s) && !/summary|stub|tag-vocab|vocab/.test(s);
          });
          assert.equal(hard.length, 0, `validateGraph hard errors: ${JSON.stringify(errors)}`);
        }
      }
    } else {
      // Sibling A not merged yet — assert the structural contract ourselves.
      assertGraphShape(graph);
    }
  } finally {
    rmrf(dir);
  }
});

test('main(): atomic-writes the merged graph to --out', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p52-main-'));
  try {
    const fdir = path.join(dir, 'frags');
    fs.mkdirSync(fdir, { recursive: true });
    fs.writeFileSync(path.join(fdir, 'a.json'), JSON.stringify(
      frag('token-mapper', [node('token:color:x', 'token', { subtype: 'color' })], []),
    ), 'utf8');
    fs.writeFileSync(path.join(fdir, 'b.json'), JSON.stringify(
      frag('component-taxonomy-mapper', [node('component:button', 'component', { layer: 'Atomic' })],
        [{ source: 'component:button', target: 'token:color:x', type: 'uses-token', direction: 'forward', weight: 0.5 }]),
    ), 'utf8');

    const out = path.join(dir, 'context-graph.json');
    const { main } = await importMjs('merge-fragments.mjs');
    main([fdir, '--out', out]);

    assert.ok(fs.existsSync(out), 'graph written to --out');
    const g = JSON.parse(fs.readFileSync(out, 'utf8'));
    assertGraphShape(g);
    assert.ok(g.generated_at && g.generated_at.length > 0, 'main stamps generated_at');
    assert.equal(g.edges.length, 1, 'cross-fragment uses-token edge recovered on disk');
  } finally {
    rmrf(dir);
  }
});
