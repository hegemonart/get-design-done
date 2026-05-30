// tests/graph-upsert.test.cjs — Plan 30.6-03 Task 2
//
// 30.6-03: upsert.mjs — upsertNode + upsertEdge with schema validation,
// referential integrity (edges require both endpoints to exist),
// idempotency, atomic-write via the 30.6-02 seam, and best-effort
// concurrent-write resilience under the D-05 single-writer assumption.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  existsSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '../..');

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-graph-upsert-${prefix}-`));
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

// ────────────────────────── upsertNode ──────────────────────────

test('30.6-03: upsertNode on empty path creates graph + node', async () => {
  const dir = tmp('node-create');
  try {
    const { upsertNode } = await buildLib();
    const gp = join(dir, 'graph.json');
    const r = upsertNode({
      graphPath: gp,
      node: { id: 'component:Button', type: 'component', label: 'Button' },
    });
    assert.equal(r.ok, true);
    assert.equal(r.action, 'created');
    assert.equal(r.nodeCount, 1);
    assert.ok(existsSync(gp));
    const graph = JSON.parse(readFileSync(gp, 'utf8'));
    assert.equal(graph.schemaVersion, '1.0');
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'component:Button');
    // metadata counters updated for status reads
    assert.equal(graph.metadata.nodeCount, 1);
    assert.equal(graph.metadata.edgeCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertNode on existing graph appends without disturbing other nodes', async () => {
  const dir = tmp('node-append');
  try {
    const { upsertNode } = await buildLib();
    const gp = join(dir, 'graph.json');
    upsertNode({
      graphPath: gp,
      node: { id: 'a:1', type: 't', label: 'A' },
    });
    upsertNode({
      graphPath: gp,
      node: { id: 'b:1', type: 't', label: 'B' },
    });
    const graph = JSON.parse(readFileSync(gp, 'utf8'));
    assert.equal(graph.nodes.length, 2);
    assert.deepEqual(graph.nodes.map((n) => n.id).sort(), ['a:1', 'b:1']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertNode repeated on same id is idempotent (last-write-wins, no duplicates)', async () => {
  const dir = tmp('node-idempotent');
  try {
    const { upsertNode } = await buildLib();
    const gp = join(dir, 'graph.json');
    const r1 = upsertNode({
      graphPath: gp,
      node: { id: 'x:1', type: 't', label: 'Original' },
    });
    assert.equal(r1.action, 'created');
    const r2 = upsertNode({
      graphPath: gp,
      node: { id: 'x:1', type: 't', label: 'Updated' },
    });
    assert.equal(r2.action, 'updated');
    assert.equal(r2.nodeCount, 1);
    const graph = JSON.parse(readFileSync(gp, 'utf8'));
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].label, 'Updated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertNode missing id throws structured error', async () => {
  const dir = tmp('node-noid');
  try {
    const { upsertNode } = await buildLib();
    const gp = join(dir, 'graph.json');
    assert.throws(
      () => upsertNode({
        graphPath: gp,
        node: { type: 't', label: 'NoId' },
      }),
      (err) => err.code === 'GDD_GRAPH_INVALID_NODE',
    );
    // Failed validation must not produce a partially-written graph file.
    assert.equal(existsSync(gp), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertNode preserves existing nodes when one is updated', async () => {
  const dir = tmp('node-preserve');
  try {
    const { upsertNode } = await buildLib();
    const gp = join(dir, 'graph.json');
    upsertNode({ graphPath: gp, node: { id: 'a:1', type: 't', label: 'A' } });
    upsertNode({ graphPath: gp, node: { id: 'b:1', type: 't', label: 'B' } });
    upsertNode({ graphPath: gp, node: { id: 'b:1', type: 't', label: 'B-updated' } });
    const graph = JSON.parse(readFileSync(gp, 'utf8'));
    assert.equal(graph.nodes.length, 2);
    const a = graph.nodes.find((n) => n.id === 'a:1');
    const b = graph.nodes.find((n) => n.id === 'b:1');
    assert.equal(a.label, 'A');
    assert.equal(b.label, 'B-updated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertNode leaves no .tmp orphan files (atomic-write)', async () => {
  const dir = tmp('node-atomic');
  try {
    const { upsertNode } = await buildLib();
    const gp = join(dir, 'graph.json');
    upsertNode({
      graphPath: gp,
      node: { id: 'x:1', type: 't', label: 'X' },
    });
    const orphans = readdirSync(dir).filter((n) => n.includes('.tmp.'));
    assert.deepEqual(orphans, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ────────────────────────── upsertEdge ──────────────────────────

test('30.6-03: upsertEdge with both endpoints present succeeds', async () => {
  const dir = tmp('edge-ok');
  try {
    const { upsertNode, upsertEdge } = await buildLib();
    const gp = join(dir, 'graph.json');
    upsertNode({ graphPath: gp, node: { id: 'a:1', type: 't', label: 'A' } });
    upsertNode({ graphPath: gp, node: { id: 'b:1', type: 't', label: 'B' } });
    const r = upsertEdge({
      graphPath: gp,
      edge: { from: 'a:1', to: 'b:1', kind: 'uses' },
    });
    assert.equal(r.ok, true);
    assert.equal(r.action, 'created');
    assert.equal(r.edgeCount, 1);
    const graph = JSON.parse(readFileSync(gp, 'utf8'));
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.metadata.edgeCount, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertEdge with missing `from` rejects with GDD_GRAPH_MISSING_ENDPOINT', async () => {
  const dir = tmp('edge-no-from');
  try {
    const { upsertNode, upsertEdge } = await buildLib();
    const gp = join(dir, 'graph.json');
    upsertNode({ graphPath: gp, node: { id: 'b:1', type: 't', label: 'B' } });
    assert.throws(
      () => upsertEdge({
        graphPath: gp,
        edge: { from: 'ghost:nonexistent', to: 'b:1', kind: 'uses' },
      }),
      (err) => err.code === 'GDD_GRAPH_MISSING_ENDPOINT' &&
        Array.isArray(err.missingEndpoints) &&
        err.missingEndpoints.includes('ghost:nonexistent'),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertEdge with missing `to` rejects with GDD_GRAPH_MISSING_ENDPOINT', async () => {
  const dir = tmp('edge-no-to');
  try {
    const { upsertNode, upsertEdge } = await buildLib();
    const gp = join(dir, 'graph.json');
    upsertNode({ graphPath: gp, node: { id: 'a:1', type: 't', label: 'A' } });
    assert.throws(
      () => upsertEdge({
        graphPath: gp,
        edge: { from: 'a:1', to: 'ghost:nonexistent', kind: 'uses' },
      }),
      (err) => err.code === 'GDD_GRAPH_MISSING_ENDPOINT' &&
        err.missingEndpoints.includes('ghost:nonexistent'),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertEdge before any nodes exist (graph file missing) throws', async () => {
  const dir = tmp('edge-nofile');
  try {
    const { upsertEdge } = await buildLib();
    const gp = join(dir, 'graph.json');
    assert.throws(
      () => upsertEdge({
        graphPath: gp,
        edge: { from: 'a:1', to: 'b:1', kind: 'uses' },
      }),
      (err) => err.code === 'GDD_GRAPH_MISSING' || err.code === 'GDD_GRAPH_MISSING_ENDPOINT',
    );
    assert.equal(existsSync(gp), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertEdge idempotent on (from,to,kind) — same edge twice is one entry', async () => {
  const dir = tmp('edge-idempotent');
  try {
    const { upsertNode, upsertEdge } = await buildLib();
    const gp = join(dir, 'graph.json');
    upsertNode({ graphPath: gp, node: { id: 'a:1', type: 't', label: 'A' } });
    upsertNode({ graphPath: gp, node: { id: 'b:1', type: 't', label: 'B' } });
    upsertEdge({
      graphPath: gp,
      edge: { from: 'a:1', to: 'b:1', kind: 'uses', weight: 0.5 },
    });
    const r2 = upsertEdge({
      graphPath: gp,
      edge: { from: 'a:1', to: 'b:1', kind: 'uses', weight: 0.9 },
    });
    assert.equal(r2.action, 'updated');
    assert.equal(r2.edgeCount, 1);
    const graph = JSON.parse(readFileSync(gp, 'utf8'));
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].weight, 0.9); // last-write-wins
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertEdge missing `from` field on edge throws GDD_GRAPH_INVALID_EDGE', async () => {
  const dir = tmp('edge-invalid');
  try {
    const { upsertNode, upsertEdge } = await buildLib();
    const gp = join(dir, 'graph.json');
    upsertNode({ graphPath: gp, node: { id: 'a:1', type: 't', label: 'A' } });
    assert.throws(
      () => upsertEdge({
        graphPath: gp,
        edge: { to: 'a:1', kind: 'uses' /* from missing */ },
      }),
      (err) => err.code === 'GDD_GRAPH_INVALID_EDGE',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ────────────────────────── schema-invalid + concurrency ──────────────────────────

test('30.6-03: schema-invalid input (id=null) caught by validator; original file untouched', async () => {
  const dir = tmp('schema-invalid');
  try {
    const { upsertNode } = await buildLib();
    const gp = join(dir, 'graph.json');
    upsertNode({ graphPath: gp, node: { id: 'a:1', type: 't', label: 'A' } });
    const before = readFileSync(gp, 'utf8');
    // Force a schema violation: id must be string, not null.
    assert.throws(
      () => upsertNode({
        graphPath: gp,
        node: { id: null, type: 't', label: 'Broken' },
      }),
      (err) => err.code === 'GDD_GRAPH_INVALID_NODE' || err.code === 'GDD_GRAPH_SCHEMA_INVALID',
    );
    const after = readFileSync(gp, 'utf8');
    assert.equal(before, after, 'graph file must be unchanged after rejected upsert');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: concurrent upsertNode of 5 distinct ids produces schema-valid file (no torn writes)', async () => {
  const dir = tmp('concurrent');
  try {
    const { upsertNode, compileValidator } = await buildLib();
    const gp = join(dir, 'graph.json');
    // Single-writer D-05 assumption — concurrent writers race for the
    // rename; last-writer-wins is acceptable. Per the test contract,
    // the final file must be schema-valid (no torn writes).
    await Promise.all([
      Promise.resolve().then(() => upsertNode({ graphPath: gp, node: { id: 'c:1', type: 't', label: 'C1' } })),
      Promise.resolve().then(() => upsertNode({ graphPath: gp, node: { id: 'c:2', type: 't', label: 'C2' } })),
      Promise.resolve().then(() => upsertNode({ graphPath: gp, node: { id: 'c:3', type: 't', label: 'C3' } })),
      Promise.resolve().then(() => upsertNode({ graphPath: gp, node: { id: 'c:4', type: 't', label: 'C4' } })),
      Promise.resolve().then(() => upsertNode({ graphPath: gp, node: { id: 'c:5', type: 't', label: 'C5' } })),
    ]);
    // File MUST exist and be schema-valid (corruption is the only failure
    // mode this test rejects; partial node-set is acceptable per D-05).
    assert.ok(existsSync(gp));
    const graph = JSON.parse(readFileSync(gp, 'utf8'));
    const validate = compileValidator();
    assert.ok(
      validate(graph),
      `final graph must be schema-valid, errors: ${JSON.stringify(validate.errors)}`,
    );
    // 1..5 nodes must be present (last-writer-wins acceptable; corruption is not)
    assert.ok(graph.nodes.length >= 1 && graph.nodes.length <= 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-03: upsertNode + upsertEdge integration — build a 2-node 1-edge graph from scratch', async () => {
  const dir = tmp('integration');
  try {
    const { upsertNode, upsertEdge } = await buildLib();
    const gp = join(dir, 'graph.json');
    upsertNode({ graphPath: gp, node: { id: 'component:Button', type: 'component', label: 'Button' } });
    upsertNode({ graphPath: gp, node: { id: 'token:color/primary', type: 'token-color', label: 'primary' } });
    upsertEdge({
      graphPath: gp,
      edge: {
        from: 'component:Button',
        to: 'token:color/primary',
        kind: 'uses',
        weight: 0.9,
      },
    });
    const graph = JSON.parse(readFileSync(gp, 'utf8'));
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.metadata.nodeCount, 2);
    assert.equal(graph.metadata.edgeCount, 1);
    assert.equal(graph.edges[0].weight, 0.9);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
