'use strict';
// Phase 55 (GDD Dashboard, dep-free) — graph-HTML emitter unit test. Verifies the pure,
// dep-free emitter (scripts/lib/dashboard/graph-html.cjs) produces a SELF-CONTAINED document:
// inline <style>, inline <svg> node-link diagram, inline <script> with the graph serialized as
// a JS object + interaction logic, ZERO external resource references. Output is DETERMINISTIC
// (byte-identical across calls — the layered layout uses stable id ordering + barycenter sweeps,
// NO Date.now / Math.random). Hermetic: no I/O, no live render, no DOM. Tagged `55-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MOD = path.resolve(__dirname, '../../scripts/lib/dashboard/graph-html.cjs');
const { buildGraphHtml, layoutGraph, bandOf, esc, LAYER_ORDER } = require(MOD);

// A fixed synthetic graph: 6 nodes across 3 layers (Atomic/Molecular/Organism) + 5 edges.
const FIXTURE = {
  schema_version: '55.0',
  nodes: [
    { id: 'tok.color.primary', type: 'token', name: 'Primary Color', summary: 'Brand primary.', tags: ['color', 'brand'], complexity: 'simple', layer: 'Atomic' },
    { id: 'tok.space.md', type: 'token', name: 'Spacing MD', summary: 'Medium spacing step.', tags: ['spacing'], complexity: 'simple', layer: 'Atomic' },
    { id: 'cmp.button', type: 'component', name: 'Button', summary: 'Primary action button.', tags: ['action', 'interactive'], complexity: 'moderate', layer: 'Molecular' },
    { id: 'cmp.input', type: 'component', name: 'Text Input', summary: 'Single-line text field.', tags: ['form'], complexity: 'moderate', layer: 'Molecular' },
    { id: 'scr.checkout', type: 'screen', name: 'Checkout', summary: 'Checkout flow screen.', tags: ['flow'], complexity: 'complex', layer: 'Organism' },
    { id: 'scr.orphan', type: 'screen', name: 'Detached Screen', summary: 'No edges yet.', tags: [], complexity: 'simple', layer: 'Organism' },
  ],
  edges: [
    { source: 'cmp.button', target: 'tok.color.primary', type: 'uses-token', direction: 'forward', weight: 0.9 },
    { source: 'cmp.button', target: 'tok.space.md', type: 'uses-token', direction: 'forward', weight: 0.5 },
    { source: 'cmp.input', target: 'tok.space.md', type: 'uses-token', direction: 'forward', weight: 0.5 },
    { source: 'scr.checkout', target: 'cmp.button', type: 'composes', direction: 'forward', weight: 1 },
    { source: 'scr.checkout', target: 'cmp.input', type: 'composes', direction: 'forward', weight: 1 },
  ],
};

const NODE_COUNT = FIXTURE.nodes.length; // 6
const EDGE_COUNT = FIXTURE.edges.length; // 5

function countMatches(str, re) {
  const m = str.match(re);
  return m ? m.length : 0;
}

test('55-02: buildGraphHtml returns a complete HTML document string', () => {
  const html = buildGraphHtml(FIXTURE, { title: 'Test Graph' });
  assert.equal(typeof html, 'string');
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<html lang="en">[\s\S]*<\/html>\s*$/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<title>Test Graph<\/title>/);
});

test('55-02: output is DETERMINISTIC — byte-identical across two calls', () => {
  const a = buildGraphHtml(FIXTURE, { title: 'Test Graph' });
  const b = buildGraphHtml(FIXTURE, { title: 'Test Graph' });
  assert.equal(a, b, 'same input -> same bytes (no Date.now/Math.random; stable ordering)');
});

test('55-02: determinism is order-independent (shuffled input -> identical bytes)', () => {
  const shuffled = {
    schema_version: FIXTURE.schema_version,
    nodes: FIXTURE.nodes.slice().reverse(),
    edges: FIXTURE.edges.slice().reverse(),
  };
  assert.equal(
    buildGraphHtml(FIXTURE, { title: 'Test Graph' }),
    buildGraphHtml(shuffled, { title: 'Test Graph' }),
    'node/edge input order must not affect output (stable sort by id)'
  );
});

test('55-02: emits an inline <svg> diagram', () => {
  const html = buildGraphHtml(FIXTURE);
  assert.match(html, /<svg id="graph"[^>]*viewBox=/, 'inline svg with a viewBox');
});

test('55-02: one <g data-id> group per node (count == node count)', () => {
  const html = buildGraphHtml(FIXTURE);
  const groups = countMatches(html, /<g class="node[^"]*" data-id="/g);
  assert.equal(groups, NODE_COUNT, `${NODE_COUNT} node groups`);
  // each group also carries data-type + data-tags for the filter interactions
  assert.equal(countMatches(html, /data-type="/g) >= NODE_COUNT, true, 'data-type on every node');
  assert.match(html, /data-tags="color,brand"/, 'tags serialized into the node group');
});

test('55-02: one edge element per edge (count == edge count)', () => {
  const html = buildGraphHtml(FIXTURE);
  const edgePaths = countMatches(html, /<path class="edge"/g);
  assert.equal(edgePaths, EDGE_COUNT, `${EDGE_COUNT} edge paths`);
  assert.match(html, /data-source="cmp\.button" data-target="tok\.color\.primary"/, 'edge endpoints preserved');
});

test('55-02: each layer band label is present (Atomic/Molecular/Organism)', () => {
  const html = buildGraphHtml(FIXTURE);
  assert.match(html, /class="band-label"[^>]*>Atomic \(/, 'Atomic band label + count');
  assert.match(html, /class="band-label"[^>]*>Molecular \(/, 'Molecular band label + count');
  assert.match(html, /class="band-label"[^>]*>Organism \(/, 'Organism band label + count');
  // Template has no nodes in this fixture -> empty band dropped (not rendered).
  assert.doesNotMatch(html, /class="band-label"[^>]*>Template \(/, 'empty Template band omitted');
});

test('55-02: an inline <script> is present (graph object + interaction logic)', () => {
  const html = buildGraphHtml(FIXTURE);
  assert.match(html, /<script>window\.__GDD_GRAPH__=/, 'serialized graph object in a script');
  assert.match(html, /<script>\(function\(\)\{/, 'inline interaction IIFE');
  // the serialized object carries the nodes + edges the script reads
  assert.match(html, /"id":"tok\.color\.primary"/, 'node serialized into the inline data');
  assert.match(html, /"source":"scr\.checkout"/, 'edge serialized into the inline data');
});

test('55-02: PNG-export + filter + find-consumers + unreachable handlers present', () => {
  const html = buildGraphHtml(FIXTURE);
  assert.match(html, /id="btn-png"/, 'PNG export button');
  assert.match(html, /toBlob\(/, 'client-side canvas toBlob (PNG export)');
  assert.match(html, /id="f-type"/, 'filter-by-type control');
  assert.match(html, /id="f-tag"/, 'filter-by-tag control');
  assert.match(html, /id="btn-consumers"/, 'find-consumers button');
  assert.match(html, /id="btn-orphan"/, 'unreachable toggle button');
  // interaction logic hooks
  assert.match(html, /addEventListener\("wheel"/, 'wheel zoom handler');
  assert.match(html, /function findConsumers\(\)/, 'BFS consumers function');
});

test('55-02: a minimap landed (second scaled SVG)', () => {
  const html = buildGraphHtml(FIXTURE);
  assert.match(html, /<svg id="minimap"/, 'minimap svg element');
  assert.match(html, /function drawMinimap\(\)/, 'minimap draw routine');
});

test('55-02: document is SELF-CONTAINED — ZERO external resource references', () => {
  const html = buildGraphHtml(FIXTURE);
  assert.doesNotMatch(html, /<link\b/i, 'no <link> stylesheet');
  assert.doesNotMatch(html, /\bsrc\s*=\s*["']?https?:/i, 'no src pointing at a remote URL');
  assert.doesNotMatch(html, /@import\b/i, 'no CSS @import');
  assert.doesNotMatch(html, /url\(\s*["']?https?:/i, 'no CSS url(http...)');
  // NO http(s):// anywhere except the SVG/HTML namespace URIs (which are identifiers, not fetches).
  const offenders = (html.match(/https?:\/\/[^\s"'<>)]+/g) || []).filter(
    (u) => !u.startsWith('http://www.w3.org/')
  );
  assert.deepEqual(offenders, [], 'only the w3.org XML namespace URIs may appear');
});

test('55-02: node text is HTML-escaped (no injection via name/summary/tags)', () => {
  // Short name (<=18 chars) so the assertion targets escaping, not label truncation.
  const evil = buildGraphHtml({
    nodes: [
      { id: 'x', type: 'token', name: '<b>hi</b>', summary: 'a & b </script>', tags: ['"><b>'], complexity: 'simple', layer: 'Atomic' },
    ],
    edges: [],
  });
  // The rendered SVG <text> label must carry the escaped name, never raw tags.
  const label = evil.match(/<text class="node-label"[^>]*>([^<]*(?:<[^/][^<]*)*)<\/text>/);
  assert.match(evil, /<text class="node-label"[^>]*>&lt;b&gt;hi&lt;\/b&gt;<\/text>/, 'name HTML-escaped in the SVG label');
  assert.doesNotMatch(evil, /<text class="node-label"[^>]*><b>hi<\/b>/i, 'no raw tag breakout in the label');
  void label;
  // the inline-script JSON must not contain a literal </script> that closes the element early
  assert.doesNotMatch(evil, /<\/script>a/i, 'no premature script close from summary text');
  assert.match(evil, /\\u003c\/script>/i, 'literal < neutralized in the JSON payload');
});

test('55-02: empty graph -> valid HTML, no throw', () => {
  let html;
  assert.doesNotThrow(() => {
    html = buildGraphHtml({ nodes: [], edges: [] }, { title: 'Empty' });
  });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /Empty graph/, 'empty-state message rendered');
  assert.equal(countMatches(html, /<g class="node/g), 0, 'no node groups');
  assert.equal(countMatches(html, /<path class="edge"/g), 0, 'no edge paths');
  // still self-contained + still has the inline script scaffolding
  assert.match(html, /<script>window\.__GDD_GRAPH__=/, 'inline data object even when empty');
});

test('55-02: missing/garbage graph -> no throw (defensive)', () => {
  assert.doesNotThrow(() => buildGraphHtml(undefined));
  assert.doesNotThrow(() => buildGraphHtml({}));
  assert.doesNotThrow(() => buildGraphHtml({ nodes: 'nope', edges: 42 }));
  const html = buildGraphHtml({ nodes: [{ id: 'a' }], edges: [{ source: 'a', target: 'missing' }] });
  assert.match(html, /^<!DOCTYPE html>/, 'still a document');
  assert.equal(countMatches(html, /<path class="edge"/g), 0, 'edge to a missing node is dropped');
});

test('55-02: bandOf maps layer first, then type heuristic, then Other', () => {
  assert.equal(bandOf({ type: 'token', layer: 'Organism' }), 'Organism', 'explicit layer wins');
  assert.equal(bandOf({ type: 'token', layer: 'atomic' }), 'Atomic', 'layer match is case-insensitive');
  assert.equal(bandOf({ type: 'screen', subtype: 'Template' }), 'Template', 'subtype layer recognized');
  assert.equal(bandOf({ type: 'token' }), 'Atomic', 'token -> Atomic by type heuristic');
  assert.equal(bandOf({ type: 'component' }), 'Molecular', 'component -> Molecular by type heuristic');
  assert.equal(bandOf({ type: 'mystery' }), 'Other', 'unknown type -> Other band');
});

test('55-02: layout is deterministic + assigns coordinates in bands', () => {
  const l1 = layoutGraph(FIXTURE);
  const l2 = layoutGraph(FIXTURE);
  assert.deepEqual(l1.byId, l2.byId, 'coordinate map is stable across calls');
  assert.equal(l1.nodes.length, NODE_COUNT);
  assert.equal(l1.edges.length, EDGE_COUNT);
  // band x increases in LAYER_ORDER; atomic nodes left of molecular left of organism
  const x = (id) => l1.byId[id].x;
  assert.ok(x('tok.color.primary') < x('cmp.button'), 'Atomic left of Molecular');
  assert.ok(x('cmp.button') < x('scr.checkout'), 'Molecular left of Organism');
  // bands reported in canonical order
  const bandNames = l1.bands.map((b) => b.name);
  assert.deepEqual(bandNames, ['Atomic', 'Molecular', 'Organism'], 'active bands in LAYER_ORDER');
  void LAYER_ORDER;
});

test('55-02: emitter is pure + dep-free (requires nothing)', () => {
  const src = require('node:fs').readFileSync(MOD, 'utf8');
  assert.doesNotMatch(src, /require\(/, 'graph-html.cjs must not require any module');
  // no nondeterminism sources in the source itself
  assert.doesNotMatch(src, /Date\.now\(/, 'no Date.now in the emitter');
  assert.doesNotMatch(src, /Math\.random\(/, 'no Math.random in the emitter');
});

test('55-02: esc escapes the five HTML-significant characters', () => {
  assert.equal(esc('a<b>&c'), 'a&lt;b&gt;&amp;c');
  assert.equal(esc('"q" & \'a\''), '&quot;q&quot; &amp; &#39;a&#39;');
  assert.equal(esc(null), '', 'null -> empty string (no throw)');
});
