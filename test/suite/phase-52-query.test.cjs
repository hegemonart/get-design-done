// test/suite/phase-52-query.test.cjs — Phase 52 (Typed DesignContext Graph): query library
//
// Proves scripts/lib/design-context-query.cjs:
//   - nodes() filters by type and by tag,
//   - edges() filters by type,
//   - path() finds a direction-aware BFS path and returns null when unreachable,
//   - consumersOf() returns the nodes that consume a given node,
//   - unreachable() returns orphan node ids (no incident edge),
//   - cycles() detects a directed cycle in a synthetic graph,
//   - coverage() reports present/missing node types and an integer pct,
//   - load() round-trips a graph from disk.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const q = require('../../scripts/lib/design-context-query.cjs');

/**
 * Synthetic graph:
 *   tok      (token)        — a color token
 *   btn      (component)    — uses tok            (btn -> tok, forward)
 *   card     (component)    — composes btn        (card -> btn, forward)
 *   screenA  (screen)       — transitions-to screenB; screenB -> screenA too (cycle)
 *   screenB  (screen)
 *   orphan   (pattern)      — no edges
 * Cycle: screenA -> screenB -> screenA.
 */
function synthGraph() {
  return {
    schema_version: '52.0',
    nodes: [
      { id: 'tok', type: 'token', name: 'Color token', summary: 'A color token.', tags: ['color'], complexity: 'simple' },
      { id: 'btn', type: 'component', name: 'Button', summary: 'A button.', tags: ['interactive'], complexity: 'simple' },
      { id: 'card', type: 'component', name: 'Card', summary: 'A card.', tags: ['composite'], complexity: 'moderate' },
      { id: 'screenA', type: 'screen', name: 'Screen A', summary: 'First screen.', tags: ['layout'], complexity: 'moderate' },
      { id: 'screenB', type: 'screen', name: 'Screen B', summary: 'Second screen.', tags: ['layout'], complexity: 'moderate' },
      { id: 'orphan', type: 'pattern', name: 'Orphan pattern', summary: 'No edges touch this.', tags: ['utility'], complexity: 'simple' },
    ],
    edges: [
      { source: 'btn', target: 'tok', type: 'uses-token', direction: 'forward', weight: 1 },
      { source: 'card', target: 'btn', type: 'composes', direction: 'forward', weight: 0.8 },
      { source: 'screenA', target: 'screenB', type: 'transitions-to', direction: 'forward', weight: 0.5 },
      { source: 'screenB', target: 'screenA', type: 'transitions-to', direction: 'forward', weight: 0.5 },
    ],
  };
}

test('nodes() filters by type', () => {
  const components = q.nodes(synthGraph(), { type: 'component' }).map((n) => n.id).sort();
  assert.deepEqual(components, ['btn', 'card']);
});

test('nodes() filters by tag', () => {
  const tagged = q.nodes(synthGraph(), { tag: 'layout' }).map((n) => n.id).sort();
  assert.deepEqual(tagged, ['screenA', 'screenB']);
});

test('nodes() with no filter returns all', () => {
  assert.equal(q.nodes(synthGraph()).length, 6);
});

test('edges() filters by type', () => {
  const transitions = q.edges(synthGraph(), { type: 'transitions-to' });
  assert.equal(transitions.length, 2);
  const usesToken = q.edges(synthGraph(), { type: 'uses-token' });
  assert.equal(usesToken.length, 1);
  assert.equal(usesToken[0].source, 'btn');
});

test('path() finds a multi-hop BFS path honoring direction', () => {
  // card -> btn -> tok via two forward edges
  assert.deepEqual(q.path(synthGraph(), 'card', 'tok'), ['card', 'btn', 'tok']);
});

test('path() returns [from] when from === to', () => {
  assert.deepEqual(q.path(synthGraph(), 'btn', 'btn'), ['btn']);
});

test('path() returns null when unreachable', () => {
  // tok has no outgoing forward edge, so it cannot reach card
  assert.equal(q.path(synthGraph(), 'tok', 'card'), null);
  // orphan is reachable from nothing and reaches nothing
  assert.equal(q.path(synthGraph(), 'orphan', 'tok'), null);
});

test('consumersOf() returns nodes with an edge targeting the id', () => {
  // btn uses tok -> btn is a consumer of tok
  const tokConsumers = q.consumersOf(synthGraph(), 'tok').map((n) => n.id);
  assert.deepEqual(tokConsumers, ['btn']);
  // card composes btn -> card is a consumer of btn
  const btnConsumers = q.consumersOf(synthGraph(), 'btn').map((n) => n.id);
  assert.deepEqual(btnConsumers, ['card']);
  // nothing consumes card
  assert.deepEqual(q.consumersOf(synthGraph(), 'card'), []);
});

test('unreachable() returns orphan node ids', () => {
  assert.deepEqual(q.unreachable(synthGraph()), ['orphan']);
});

test('cycles() detects the screenA<->screenB directed cycle', () => {
  const found = q.cycles(synthGraph());
  assert.equal(found.length, 1, `expected exactly one cycle, got ${JSON.stringify(found)}`);
  assert.deepEqual([...found[0]].sort(), ['screenA', 'screenB']);
});

test('cycles() returns empty on an acyclic graph', () => {
  const g = synthGraph();
  g.edges = g.edges.filter((e) => !(e.source === 'screenB' && e.target === 'screenA'));
  assert.deepEqual(q.cycles(g), []);
});

test('coverage() reports present/missing types and an integer pct', () => {
  const c = q.coverage(synthGraph());
  // present: token, component, screen, pattern => 4 of 10
  assert.deepEqual(c.present_types.sort(), ['component', 'pattern', 'screen', 'token']);
  assert.equal(c.present_types.length + c.missing_types.length, q.EXPECTED_NODE_TYPES.length);
  assert.equal(c.pct, 40);
  assert.ok(Number.isInteger(c.pct));
});

test('load() round-trips a graph from disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p52q-'));
  const file = path.join(dir, 'context-graph.json');
  try {
    fs.writeFileSync(file, JSON.stringify(synthGraph()), 'utf8');
    const loaded = q.load(file);
    assert.equal(loaded.schema_version, '52.0');
    assert.equal(loaded.nodes.length, 6);
    assert.equal(q.nodes(loaded, { type: 'token' })[0].id, 'tok');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI main() coverage returns 0 and emits JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p52q-cli-'));
  const file = path.join(dir, 'context-graph.json');
  try {
    fs.writeFileSync(file, JSON.stringify(synthGraph()), 'utf8');
    const chunks = [];
    const io = { stdout: { write: (s) => chunks.push(s) }, stderr: { write: (s) => chunks.push(s) } };
    const code = q.main(['coverage', '--file', file, '--json'], io);
    assert.equal(code, 0);
    const parsed = JSON.parse(chunks.join(''));
    assert.equal(parsed.pct, 40);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI main() path prints the BFS chain', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p52q-cli2-'));
  const file = path.join(dir, 'context-graph.json');
  try {
    fs.writeFileSync(file, JSON.stringify(synthGraph()), 'utf8');
    const chunks = [];
    const io = { stdout: { write: (s) => chunks.push(s) }, stderr: { write: (s) => chunks.push(s) } };
    const code = q.main(['path', 'card', 'tok', '--file', file], io);
    assert.equal(code, 0);
    assert.match(chunks.join(''), /card -> btn -> tok/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI main() returns 1 on unknown command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-p52q-cli3-'));
  const file = path.join(dir, 'context-graph.json');
  try {
    fs.writeFileSync(file, JSON.stringify(synthGraph()), 'utf8');
    const code = q.main(['frobnicate', '--file', file], { stdout: { write() {} }, stderr: { write() {} } });
    assert.equal(code, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
