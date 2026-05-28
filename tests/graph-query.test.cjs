// tests/graph-query.test.cjs — Plan 30.6-03 Task 1
//
// 30.6-03: query.mjs + token-estimate.mjs — golden queries × budgets,
// deterministic ranking per D-04.a, GDD_GRAPH_TOKEN_FACTOR env override.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  writeFileSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '..');
const FIXTURE_ROOT = join(REPO_ROOT, 'test-fixture', 'graph', 'sample-intel');

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-graph-query-${prefix}-`));
}

async function buildLib() {
  return import(
    'file://' +
      resolve(REPO_ROOT, 'scripts', 'lib', 'graph', 'index.mjs').replace(
        /\\/g,
        '/',
      )
  );
}

// Build the canonical 3-node sample graph from RESEARCH.md §Query algorithm
// for the golden-query rows.
function writeSampleGraph(path) {
  const graph = {
    schemaVersion: '1.0',
    metadata: {
      generatedAt: '2026-01-01T00:00:00.000Z',
      intelSource: '.design/intel/graph.json',
      nodeCount: 3,
      edgeCount: 2,
      builderVersion: '1.30.6',
    },
    nodes: [
      { id: 'component:Button', type: 'component', label: 'Button', source: 'gdd-intel-store' },
      { id: 'token:color/primary', type: 'token-color', label: 'primary', source: 'gdd-intel-store' },
      { id: 'decision:D-01', type: 'decision', label: 'Use brand primary', source: 'gdd-intel-store' },
    ],
    edges: [
      { from: 'component:Button', to: 'token:color/primary', kind: 'uses', weight: 0.9, source: 'gdd-intel-store' },
      { from: 'decision:D-01', to: 'token:color/primary', kind: 'specifies', weight: 0.8, source: 'gdd-intel-store' },
    ],
  };
  writeFileSync(path, JSON.stringify(graph, null, 2));
  return graph;
}

// Build a graph from the dense intel fixture for richer queries.
async function writeDenseGraph(graphPath) {
  const { buildGraph } = await buildLib();
  buildGraph({
    intelPath: join(FIXTURE_ROOT, 'dense.json'),
    outPath: graphPath,
    now: '2026-05-28T19:00:00.000Z',
  });
}

// ──────────────────────────── token-estimate ────────────────────────────

test('30.6-03: estimateTokens on string uses chars/4 default', async () => {
  const { estimateTokens } = await buildLib();
  // 16-char string → ceil(16/4) = 4
  assert.equal(estimateTokens('1234567890123456'), 4);
});

test('30.6-03: estimateTokens on object stringifies before estimating', async () => {
  const { estimateTokens } = await buildLib();
  // JSON.stringify({"a":1}) = 7 chars → ceil(7/4) = 2
  assert.equal(estimateTokens({ a: 1 }), 2);
});

test('30.6-03: GDD_GRAPH_TOKEN_FACTOR=2 doubles apparent payload size', async () => {
  const { estimateTokens } = await buildLib();
  const before = process.env.GDD_GRAPH_TOKEN_FACTOR;
  try {
    process.env.GDD_GRAPH_TOKEN_FACTOR = '2';
    // 16-char string → ceil(16/2) = 8 (vs default 4 → 4)
    assert.equal(estimateTokens('1234567890123456'), 8);
  } finally {
    if (before === undefined) delete process.env.GDD_GRAPH_TOKEN_FACTOR;
    else process.env.GDD_GRAPH_TOKEN_FACTOR = before;
  }
});

test('30.6-03: invalid GDD_GRAPH_TOKEN_FACTOR falls back to 4', async () => {
  const { estimateTokens } = await buildLib();
  const before = process.env.GDD_GRAPH_TOKEN_FACTOR;
  try {
    process.env.GDD_GRAPH_TOKEN_FACTOR = 'not-a-number';
    assert.equal(estimateTokens('1234567890123456'), 4);
    process.env.GDD_GRAPH_TOKEN_FACTOR = '0';
    assert.equal(estimateTokens('1234567890123456'), 4);
    process.env.GDD_GRAPH_TOKEN_FACTOR = '-1';
    assert.equal(estimateTokens('1234567890123456'), 4);
  } finally {
    if (before === undefined) delete process.env.GDD_GRAPH_TOKEN_FACTOR;
    else process.env.GDD_GRAPH_TOKEN_FACTOR = before;
  }
});

// ──────────────────────────── golden queries × budgets ────────────────────────────

test('30.6-03: query "Button" with large budget (8000) returns Button at top', async () => {
  const dir = tmp('q1');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'Button', budget: 8000 });
    assert.equal(r.query, 'Button');
    assert.equal(r.truncated, false);
    assert.ok(r.matches.length >= 1);
    // Top-ranked = exact-label match
    assert.equal(r.matches[0].node.id, 'component:Button');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query "Button" with medium budget (1000) still fits all matches', async () => {
  const dir = tmp('q2');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'Button', budget: 1000 });
    assert.equal(r.truncated, false);
    assert.equal(r.matches[0].node.id, 'component:Button');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query "Button" with tiny budget (200) survives or truncates gracefully', async () => {
  const dir = tmp('q3');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'Button', budget: 200 });
    // Either some matches fit, or fully truncated — but never returns
    // a payload larger than the budget.
    const { estimateTokens } = await buildLib();
    assert.ok(estimateTokens(r) <= 200);
    if (r.matches.length === 0) {
      assert.equal(r.truncated, true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query "primary" ranks token:color/primary at top (exact-label score 50)', async () => {
  const dir = tmp('q4');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'primary', budget: 8000 });
    assert.equal(r.matches[0].node.id, 'token:color/primary');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query "primary" with medium budget keeps top match', async () => {
  const dir = tmp('q5');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'primary', budget: 1000 });
    assert.equal(r.matches[0].node.id, 'token:color/primary');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query "primary" with small budget truncates without corruption', async () => {
  const dir = tmp('q6');
  try {
    const { queryGraph, estimateTokens } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'primary', budget: 200 });
    assert.ok(estimateTokens(r) <= 200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query "decision:D-01" with budget 8000 returns exact-id match at top (score 100)', async () => {
  const dir = tmp('q7');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'decision:D-01', budget: 8000 });
    assert.equal(r.matches[0].node.id, 'decision:D-01');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query "decision:D-01" with medium budget keeps top match', async () => {
  const dir = tmp('q8');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'decision:D-01', budget: 1000 });
    assert.equal(r.matches[0].node.id, 'decision:D-01');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query "decision:D-01" with budget 200 still finds top match or truncates', async () => {
  const dir = tmp('q9');
  try {
    const { queryGraph, estimateTokens } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'decision:D-01', budget: 200 });
    assert.ok(estimateTokens(r) <= 200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ──────────────────────────── edge cases ────────────────────────────

test('30.6-03: empty query string returns no matches (no tokens to score)', async () => {
  const dir = tmp('q-empty');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: '', budget: 8000 });
    assert.deepEqual(r.matches, []);
    assert.equal(r.truncated, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query with no matching tokens returns empty matches, truncated:false', async () => {
  const dir = tmp('q-nomatch');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'xyz-no-match-zzz', budget: 8000 });
    assert.deepEqual(r.matches, []);
    assert.equal(r.truncated, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: identical (graph, query, budget) inputs produce byte-identical output (determinism)', async () => {
  const dir = tmp('q-det');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeSampleGraph(gp);
    const r1 = queryGraph({ graphPath: gp, query: 'primary', budget: 1000 });
    const r2 = queryGraph({ graphPath: gp, query: 'primary', budget: 1000 });
    assert.equal(JSON.stringify(r1), JSON.stringify(r2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query throws when graph file is missing', async () => {
  const { queryGraph } = await buildLib();
  assert.throws(
    () => queryGraph({
      graphPath: join(tmpdir(), 'definitely-not-a-real-graph-xyz.json'),
      query: 'anything',
      budget: 8000,
    }),
    (err) => err.code === 'GRAPH_MISSING',
  );
});

test('30.6-03: query throws SCHEMA_INVALID when graph fails validation', async () => {
  const dir = tmp('q-bad');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    writeFileSync(gp, JSON.stringify({ schemaVersion: '999.0' /* missing required */ }));
    assert.throws(
      () => queryGraph({ graphPath: gp, query: 'anything', budget: 8000 }),
      (err) => err.code === 'GRAPH_SCHEMA_INVALID',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: ties broken by lexicographic id (deterministic ordering)', async () => {
  const dir = tmp('q-tie');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    // Two nodes with identical score (both contain "x" in label)
    const graph = {
      schemaVersion: '1.0',
      metadata: { generatedAt: '2026-01-01T00:00:00.000Z', nodeCount: 2, edgeCount: 0 },
      nodes: [
        { id: 'node:bbb', type: 'thing', label: 'has-x-in-label', source: 's' },
        { id: 'node:aaa', type: 'thing', label: 'has-x-in-label', source: 's' },
      ],
      edges: [],
    };
    writeFileSync(gp, JSON.stringify(graph, null, 2));
    const r = queryGraph({ graphPath: gp, query: 'x', budget: 8000 });
    // aaa comes before bbb by lexicographic id
    assert.equal(r.matches[0].node.id, 'node:aaa');
    assert.equal(r.matches[1].node.id, 'node:bbb');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: query on dense fixture finds Button with neighbors', async () => {
  const dir = tmp('q-dense');
  try {
    const { queryGraph } = await buildLib();
    const gp = join(dir, 'graph.json');
    await writeDenseGraph(gp);
    const r = queryGraph({ graphPath: gp, query: 'Button', budget: 8000 });
    const top = r.matches[0];
    assert.equal(top.node.id, 'component:Button');
    // Button has 2 outbound edges in the dense fixture
    assert.ok(Array.isArray(top.neighbors));
    assert.ok(top.neighbors.length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
