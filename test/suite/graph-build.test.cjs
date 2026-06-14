// tests/graph-build.test.cjs — Plan 30.6-02 Task 3
//
// 30.6-02: build.mjs determinism + 3 fixture coverage + atomic-write
// hygiene (no .tmp orphans) + schema-invalid intel rejection.

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
const FIXTURE_ROOT = join(REPO_ROOT, 'test', 'fixtures', 'graph', 'sample-intel');

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `hone-graph-${prefix}-`));
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

test('30.6-02: build from empty intel produces 0 nodes, 0 edges, schemaVersion 1.0', async () => {
  const dir = tmp('build-empty');
  try {
    const { buildGraph } = await buildLib();
    const out = join(dir, 'graph.json');
    const r = buildGraph({
      intelPath: join(FIXTURE_ROOT, 'empty.json'),
      outPath: out,
      now: '2026-05-28T19:00:00.000Z',
    });
    assert.equal(r.ok, true);
    assert.equal(r.nodeCount, 0);
    assert.equal(r.edgeCount, 0);
    const graph = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(graph.schemaVersion, '1.0');
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: build from single-node intel renames name->label and stamps source', async () => {
  const dir = tmp('build-single');
  try {
    const { buildGraph } = await buildLib();
    const out = join(dir, 'graph.json');
    buildGraph({
      intelPath: join(FIXTURE_ROOT, 'single.json'),
      outPath: out,
      now: '2026-05-28T19:00:00.000Z',
    });
    const graph = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'component:Button');
    assert.equal(graph.nodes[0].label, 'Button');
    assert.equal(graph.nodes[0].source, 'hone-intel-store');
    // 'name' field should NOT appear in graph node — it became 'label'.
    assert.equal(graph.nodes[0].name, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: build from dense intel preserves all edges with from/to/kind', async () => {
  const dir = tmp('build-dense');
  try {
    const { buildGraph } = await buildLib();
    const out = join(dir, 'graph.json');
    const r = buildGraph({
      intelPath: join(FIXTURE_ROOT, 'dense.json'),
      outPath: out,
      now: '2026-05-28T19:00:00.000Z',
    });
    assert.equal(r.nodeCount, 5);
    assert.equal(r.edgeCount, 8);
    const graph = JSON.parse(readFileSync(out, 'utf8'));
    for (const e of graph.edges) {
      assert.ok(e.from, 'from required');
      assert.ok(e.to, 'to required');
      assert.ok(e.kind, 'kind required');
      assert.equal(e.source, 'hone-intel-store');
    }
    // Extra intel field (hex on primary-500) should land in attrs.
    const t = graph.nodes.find((n) => n.id === 'token:color/primary/500');
    assert.equal(t.attrs.hex, '#3b82f6');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: build is deterministic — same intel + same now produces byte-identical graph.json', async () => {
  const dir = tmp('build-det');
  try {
    const { buildGraph } = await buildLib();
    const a = join(dir, 'a.json');
    const b = join(dir, 'b.json');
    const now = '2026-05-28T19:00:00.000Z';
    buildGraph({
      intelPath: join(FIXTURE_ROOT, 'dense.json'),
      outPath: a,
      now,
    });
    buildGraph({
      intelPath: join(FIXTURE_ROOT, 'dense.json'),
      outPath: b,
      now,
    });
    assert.equal(readFileSync(a, 'utf8'), readFileSync(b, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: build leaves no .tmp orphan files in target dir', async () => {
  const dir = tmp('build-atomic');
  try {
    const { buildGraph } = await buildLib();
    const out = join(dir, 'graph.json');
    buildGraph({
      intelPath: join(FIXTURE_ROOT, 'dense.json'),
      outPath: out,
      now: '2026-05-28T19:00:00.000Z',
    });
    const orphans = readdirSync(dir).filter((n) => n.includes('.tmp.'));
    assert.deepEqual(orphans, []);
    assert.ok(existsSync(out));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: build throws INTEL_MISSING when intel file absent', async () => {
  const { buildGraph } = await buildLib();
  await assert.rejects(
    async () =>
      buildGraph({
        intelPath: join(tmpdir(), 'definitely-not-a-real-path-xyz.json'),
        outPath: join(tmpdir(), 'unused.json'),
        now: '2026-05-28T19:00:00.000Z',
      }),
    (err) => err.code === 'INTEL_MISSING',
  );
});

test('30.6-02: build throws SCHEMA_INVALID when intel produces invalid graph (id missing)', async () => {
  const dir = tmp('build-bad');
  try {
    const { buildGraph } = await buildLib();
    const intelBad = join(dir, 'bad.json');
    // Intel node with no id — transform passes it through; schema rejects.
    writeFileSync(
      intelBad,
      JSON.stringify({ nodes: [{ type: 'component', name: 'NoId' }], edges: [] }),
    );
    assert.throws(
      () =>
        buildGraph({
          intelPath: intelBad,
          outPath: join(dir, 'unused.json'),
          now: '2026-05-28T19:00:00.000Z',
        }),
      (err) => err.code === 'SCHEMA_INVALID',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
