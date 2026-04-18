'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scaffoldDesignDir } = require('./helpers.cjs');

/**
 * Given an intel slice object and a fileExistsFn(path) predicate, remove
 * entries whose source file no longer exists. Handles three slice shapes:
 *   - { files: [{ path, ... }, ...] }       (e.g. files.json)
 *   - { nodes: [path, ...], edges: [{ from, to }, ...] }  (e.g. graph.json)
 * Returns the mutated slice (also mutates in place).
 */
function pruneIntelSlice(slice, fileExistsFn) {
  if (slice.files) slice.files = slice.files.filter(f => fileExistsFn(f.path));
  if (slice.nodes) slice.nodes = slice.nodes.filter(n => fileExistsFn(n));
  if (slice.edges) {
    slice.edges = slice.edges.filter(e =>
      fileExistsFn(e.from) && fileExistsFn(e.to)
    );
  }
  return slice;
}

test('intel-consistency: files.json removes entry after source file deletion', () => {
  const { dir, designDir, cleanup } = scaffoldDesignDir();
  try {
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'deleted.tsx'), '// deleted\n', 'utf8');
    fs.writeFileSync(path.join(srcDir, 'kept.tsx'), '// kept\n', 'utf8');

    const intelDir = path.join(designDir, 'intel');
    fs.mkdirSync(intelDir, { recursive: true });
    const slice = {
      generated: '2026-04-18T00:00:00Z',
      files: [
        { path: 'src/deleted.tsx', hash: 'a' },
        { path: 'src/kept.tsx',    hash: 'b' },
      ],
    };
    fs.writeFileSync(path.join(intelDir, 'files.json'),
      JSON.stringify(slice, null, 2), 'utf8');

    // Delete one source file on disk
    fs.unlinkSync(path.join(srcDir, 'deleted.tsx'));

    // Run the updater against the (still stale) slice
    const pruned = pruneIntelSlice(
      JSON.parse(fs.readFileSync(path.join(intelDir, 'files.json'), 'utf8')),
      (p) => fs.existsSync(path.join(dir, p))
    );
    fs.writeFileSync(path.join(intelDir, 'files.json'),
      JSON.stringify(pruned, null, 2), 'utf8');

    const result = JSON.parse(fs.readFileSync(path.join(intelDir, 'files.json'), 'utf8'));
    assert.equal(result.files.length, 1, 'exactly one entry should remain');
    assert.equal(result.files[0].path, 'src/kept.tsx',
      'the remaining entry must be src/kept.tsx');
  } finally {
    cleanup();
  }
});

test('intel-consistency: graph.json edges removed when source file deleted', () => {
  const { dir, designDir, cleanup } = scaffoldDesignDir();
  try {
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'A.tsx'), '// A\n', 'utf8');
    fs.writeFileSync(path.join(srcDir, 'B.tsx'), '// B\n', 'utf8');

    const slice = {
      nodes: ['src/A.tsx', 'src/B.tsx'],
      edges: [{ from: 'src/A.tsx', to: 'src/B.tsx' }],
    };

    fs.unlinkSync(path.join(srcDir, 'A.tsx'));

    const pruned = pruneIntelSlice(slice, (p) => fs.existsSync(path.join(dir, p)));
    assert.deepEqual(pruned.nodes, ['src/B.tsx'],
      'deleted node must be removed');
    assert.equal(pruned.edges.length, 0,
      'edges referencing removed nodes must be dropped');
  } finally {
    cleanup();
  }
});

test('intel-consistency: no orphan entries after bulk deletion', () => {
  const { dir, designDir, cleanup } = scaffoldDesignDir();
  try {
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const names = ['a.tsx', 'b.tsx', 'c.tsx', 'd.tsx', 'e.tsx'];
    for (const n of names) fs.writeFileSync(path.join(srcDir, n), `// ${n}\n`, 'utf8');

    const slice = {
      files: names.map((n, i) => ({ path: `src/${n}`, hash: String(i) })),
    };

    // Delete 3 of 5
    fs.unlinkSync(path.join(srcDir, 'a.tsx'));
    fs.unlinkSync(path.join(srcDir, 'c.tsx'));
    fs.unlinkSync(path.join(srcDir, 'e.tsx'));

    const pruned = pruneIntelSlice(slice, (p) => fs.existsSync(path.join(dir, p)));
    assert.equal(pruned.files.length, 2, 'exactly two entries must remain');
    const remainingPaths = pruned.files.map(f => f.path).sort();
    assert.deepEqual(remainingPaths, ['src/b.tsx', 'src/d.tsx'],
      'remaining entries must be b.tsx and d.tsx');
  } finally {
    cleanup();
  }
});

test('intel-consistency: updater is idempotent', () => {
  const { dir, designDir, cleanup } = scaffoldDesignDir();
  try {
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'kept.tsx'), '// kept\n', 'utf8');

    const originalSlice = {
      generated: '2026-04-18T00:00:00Z',
      files: [
        { path: 'src/deleted.tsx', hash: 'a' },
        { path: 'src/kept.tsx',    hash: 'b' },
      ],
      nodes: ['src/deleted.tsx', 'src/kept.tsx'],
      edges: [{ from: 'src/deleted.tsx', to: 'src/kept.tsx' }],
    };

    const first = pruneIntelSlice(
      JSON.parse(JSON.stringify(originalSlice)),
      (p) => fs.existsSync(path.join(dir, p))
    );
    const second = pruneIntelSlice(
      JSON.parse(JSON.stringify(first)),
      (p) => fs.existsSync(path.join(dir, p))
    );

    const firstJson = JSON.stringify(first);
    const secondJson = JSON.stringify(second);
    assert.equal(firstJson, secondJson,
      'running the updater twice against the same on-disk state must be idempotent (byte-identical output)');
  } finally {
    cleanup();
  }
});
