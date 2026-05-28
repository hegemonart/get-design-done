// tests/graph-status.test.cjs — Plan 30.6-02 Task 3
//
// 30.6-02: status.mjs missing/present/stale/invalid coverage + custom
// --graph path override.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  writeFileSync,
  rmSync,
  utimesSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '..');

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

function validGraph(extras = {}) {
  return {
    schemaVersion: '1.0',
    metadata: {
      generatedAt: '2026-05-28T19:00:00.000Z',
      intelSource: '.design/intel/graph.json',
      nodeCount: 1,
      edgeCount: 0,
      builderVersion: '1.30.6',
      ...extras,
    },
    nodes: [
      { id: 'component:X', type: 'component', label: 'X', source: 'test' },
    ],
    edges: [],
  };
}

test('30.6-02: status returns {configured:false,exists:false} when graph file missing', async () => {
  const { statusGraph } = await lib();
  const dir = tmp('status-missing');
  try {
    const r = statusGraph({ graphPath: join(dir, 'graph.json') });
    assert.deepEqual(r, { configured: false, exists: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: status returns full shape when graph present and valid', async () => {
  const { statusGraph } = await lib();
  const dir = tmp('status-present');
  try {
    const g = join(dir, 'graph.json');
    writeFileSync(g, JSON.stringify(validGraph()));
    const r = statusGraph({ graphPath: g });
    assert.equal(r.configured, true);
    assert.equal(r.exists, true);
    assert.equal(r.nodeCount, 1);
    assert.equal(r.edgeCount, 0);
    assert.equal(r.schemaVersion, '1.0');
    assert.equal(r.lastBuiltAt, '2026-05-28T19:00:00.000Z');
    assert.equal(r.stale, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: status marks stale=true when intel mtime > graph.metadata.generatedAt', async () => {
  const { statusGraph } = await lib();
  const dir = tmp('status-stale');
  try {
    const g = join(dir, 'graph.json');
    const i = join(dir, 'intel.json');
    // Graph generatedAt is in the past.
    writeFileSync(
      g,
      JSON.stringify(validGraph({ generatedAt: '2020-01-01T00:00:00.000Z' })),
    );
    writeFileSync(i, '{}');
    // Touch intel to now — guaranteed newer than 2020.
    const now = Date.now() / 1000;
    utimesSync(i, now, now);
    const r = statusGraph({ graphPath: g, intelPath: i });
    assert.equal(r.stale, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: status reports schemaInvalid:true on schema-invalid graph', async () => {
  const { statusGraph } = await lib();
  const dir = tmp('status-invalid');
  try {
    const g = join(dir, 'graph.json');
    writeFileSync(g, JSON.stringify({ schemaVersion: '0.9' }));
    const r = statusGraph({ graphPath: g });
    assert.equal(r.configured, true);
    assert.equal(r.exists, true);
    assert.equal(r.schemaInvalid, true);
    assert.ok(Array.isArray(r.errors) && r.errors.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: status reports schemaInvalid:true on unparseable JSON', async () => {
  const { statusGraph } = await lib();
  const dir = tmp('status-parse');
  try {
    const g = join(dir, 'graph.json');
    writeFileSync(g, 'NOT JSON{{{');
    const r = statusGraph({ graphPath: g });
    assert.equal(r.schemaInvalid, true);
    assert.match(r.errors[0].message, /parse failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('30.6-02: status honors custom --graph path override', async () => {
  const { statusGraph } = await lib();
  const dir = tmp('status-custom');
  try {
    const g = join(dir, 'custom-name.json');
    writeFileSync(g, JSON.stringify(validGraph()));
    const r = statusGraph({ graphPath: g });
    assert.equal(r.configured, true);
    assert.equal(r.exists, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
