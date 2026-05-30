// tests/graph-diff.test.cjs — Plan 30.6-02 Task 3
//
// 30.6-02: diff.mjs identical/added/removed/changed coverage for both
// nodes + edges + the mixed-scenario integration case.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '../..');

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-graph-${prefix}-`));
}

async function lib() {
  return import(
    'file://' +
      resolve(REPO_ROOT, 'scripts', 'lib', 'graph', 'index.mjs').replace(
        /\\/g,
        '/',
      )
  );
}

function graph({ nodes = [], edges = [] } = {}) {
  return {
    schemaVersion: '1.0',
    metadata: {
      generatedAt: '2026-05-28T19:00:00.000Z',
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    nodes,
    edges,
  };
}

function writeBoth(dir, from, to) {
  const a = join(dir, 'a.json');
  const b = join(dir, 'b.json');
  writeFileSync(a, JSON.stringify(from));
  writeFileSync(b, JSON.stringify(to));
  return { a, b };
}

test('30.6-02: diff identical graphs yields all-empty arrays', async () => {
  const { diffGraph } = await lib();
  const dir = tmp('diff-id');
  try {
    const g = graph({
      nodes: [{ id: 'a', type: 'component', label: 'A' }],
      edges: [{ from: 'a', to: 'a', kind: 'self' }],
    });
    const { a, b } = writeBoth(dir, g, g);
    const r = diffGraph({ fromPath: a, toPath: b });
    assert.deepEqual(r.addedNodes, []);
    assert.deepEqual(r.removedNodes, []);
    assert.deepEqual(r.changedNodes, []);
    assert.deepEqual(r.addedEdges, []);
    assert.deepEqual(r.removedEdges, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: diff detects node added (B has extra node)', async () => {
  const { diffGraph } = await lib();
  const dir = tmp('diff-na');
  try {
    const from = graph({ nodes: [{ id: 'a', type: 'component', label: 'A' }] });
    const to = graph({
      nodes: [
        { id: 'a', type: 'component', label: 'A' },
        { id: 'b', type: 'component', label: 'B' },
      ],
    });
    const { a, b } = writeBoth(dir, from, to);
    const r = diffGraph({ fromPath: a, toPath: b });
    assert.equal(r.addedNodes.length, 1);
    assert.equal(r.addedNodes[0].id, 'b');
    assert.equal(r.removedNodes.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: diff detects node removed (A had a node B does not)', async () => {
  const { diffGraph } = await lib();
  const dir = tmp('diff-nr');
  try {
    const from = graph({
      nodes: [
        { id: 'a', type: 'component', label: 'A' },
        { id: 'b', type: 'component', label: 'B' },
      ],
    });
    const to = graph({ nodes: [{ id: 'a', type: 'component', label: 'A' }] });
    const { a, b } = writeBoth(dir, from, to);
    const r = diffGraph({ fromPath: a, toPath: b });
    assert.equal(r.removedNodes.length, 1);
    assert.equal(r.removedNodes[0].id, 'b');
    assert.equal(r.addedNodes.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: diff detects node changed (same id, different label)', async () => {
  const { diffGraph } = await lib();
  const dir = tmp('diff-nc');
  try {
    const from = graph({ nodes: [{ id: 'a', type: 'component', label: 'A' }] });
    const to = graph({
      nodes: [{ id: 'a', type: 'component', label: 'A-renamed' }],
    });
    const { a, b } = writeBoth(dir, from, to);
    const r = diffGraph({ fromPath: a, toPath: b });
    assert.equal(r.changedNodes.length, 1);
    assert.equal(r.changedNodes[0].id, 'a');
    assert.equal(r.changedNodes[0].before.label, 'A');
    assert.equal(r.changedNodes[0].after.label, 'A-renamed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: diff detects edge added', async () => {
  const { diffGraph } = await lib();
  const dir = tmp('diff-ea');
  try {
    const nodes = [
      { id: 'a', type: 'component', label: 'A' },
      { id: 'b', type: 'component', label: 'B' },
    ];
    const from = graph({ nodes });
    const to = graph({
      nodes,
      edges: [{ from: 'a', to: 'b', kind: 'uses' }],
    });
    const { a, b } = writeBoth(dir, from, to);
    const r = diffGraph({ fromPath: a, toPath: b });
    assert.equal(r.addedEdges.length, 1);
    assert.equal(r.addedEdges[0].kind, 'uses');
    assert.equal(r.removedEdges.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: diff detects edge removed', async () => {
  const { diffGraph } = await lib();
  const dir = tmp('diff-er');
  try {
    const nodes = [
      { id: 'a', type: 'component', label: 'A' },
      { id: 'b', type: 'component', label: 'B' },
    ];
    const from = graph({
      nodes,
      edges: [{ from: 'a', to: 'b', kind: 'uses' }],
    });
    const to = graph({ nodes });
    const { a, b } = writeBoth(dir, from, to);
    const r = diffGraph({ fromPath: a, toPath: b });
    assert.equal(r.removedEdges.length, 1);
    assert.equal(r.addedEdges.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: diff handles mixed scenario — add + remove + change simultaneously', async () => {
  const { diffGraph } = await lib();
  const dir = tmp('diff-mix');
  try {
    const from = graph({
      nodes: [
        { id: 'keep', type: 'component', label: 'Keep' },
        { id: 'remove', type: 'component', label: 'Remove' },
        { id: 'change', type: 'component', label: 'Change' },
      ],
      edges: [
        { from: 'keep', to: 'remove', kind: 'uses' },
        { from: 'change', to: 'remove', kind: 'uses' },
      ],
    });
    const to = graph({
      nodes: [
        { id: 'keep', type: 'component', label: 'Keep' },
        { id: 'add', type: 'component', label: 'Add' },
        { id: 'change', type: 'component', label: 'Changed-Label' },
      ],
      edges: [
        { from: 'keep', to: 'add', kind: 'uses' },
        { from: 'change', to: 'add', kind: 'uses' },
      ],
    });
    const { a, b } = writeBoth(dir, from, to);
    const r = diffGraph({ fromPath: a, toPath: b });
    assert.equal(r.addedNodes.length, 1);
    assert.equal(r.addedNodes[0].id, 'add');
    assert.equal(r.removedNodes.length, 1);
    assert.equal(r.removedNodes[0].id, 'remove');
    assert.equal(r.changedNodes.length, 1);
    assert.equal(r.changedNodes[0].id, 'change');
    assert.equal(r.addedEdges.length, 2);
    assert.equal(r.removedEdges.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: diff is symmetric — diff(A,B) addedNodes == diff(B,A) removedNodes', async () => {
  const { diffGraph } = await lib();
  const dir = tmp('diff-sym');
  try {
    const from = graph({ nodes: [{ id: 'a', type: 'component', label: 'A' }] });
    const to = graph({
      nodes: [
        { id: 'a', type: 'component', label: 'A' },
        { id: 'b', type: 'component', label: 'B' },
      ],
    });
    const { a, b } = writeBoth(dir, from, to);
    const r1 = diffGraph({ fromPath: a, toPath: b });
    const r2 = diffGraph({ fromPath: b, toPath: a });
    assert.deepEqual(r1.addedNodes, r2.removedNodes);
    assert.deepEqual(r1.removedNodes, r2.addedNodes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
