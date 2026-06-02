'use strict';
// Phase 41.5 — manifest loader + index units. Present -> data; missing/parse-error -> empty fallback
// (NEVER throws) + warning; file-mtime cache; typed readers; dep-free loader. Every test `41.5-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const loader = require(path.join(REPO_ROOT, 'scripts/lib/manifest/loader.cjs'));
const index = require(path.join(REPO_ROOT, 'scripts/lib/manifest/index.cjs'));

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-manifest-')); }

test('41.5-02: load() returns parsed data for a present manifest', () => {
  loader.reset();
  const h = loader.load('harnesses');
  assert.ok(h && Array.isArray(h.harnesses) && h.harnesses.length === 14);
});

test('41.5-02: missing manifest -> fallback, NEVER throws', () => {
  loader.reset();
  let r;
  assert.doesNotThrow(() => { r = loader.load('nope-missing', { fallback: { tells: [] }, quiet: true }); });
  assert.deepEqual(r, { tells: [] });
});

test('41.5-02: parse error -> fallback (quiet), never throws', () => {
  const dir = tmpdir();
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ not: valid json,,');
  loader.reset();
  let r;
  assert.doesNotThrow(() => { r = loader.load('broken', { dir, fallback: { ok: false }, quiet: true }); });
  assert.deepEqual(r, { ok: false });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('41.5-02: file-mtime cache — same ref until the file changes', () => {
  const dir = tmpdir();
  const p = path.join(dir, 'cache.json');
  fs.writeFileSync(p, JSON.stringify({ v: 1 }));
  loader.reset();
  const a = loader.load('cache', { dir });
  const b = loader.load('cache', { dir });
  assert.strictEqual(a, b, 'cached read returns the same object');
  // change mtime + content -> a fresh object with new data
  fs.writeFileSync(p, JSON.stringify({ v: 2 }));
  const futureMs = Date.now() + 5000;
  fs.utimesSync(p, futureMs / 1000, futureMs / 1000);
  const c = loader.load('cache', { dir });
  assert.equal(c.v, 2, 'cache invalidated on mtime change');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('41.5-02: typed readers return well-shaped objects', () => {
  loader.reset();
  assert.ok(Array.isArray(index.readHarnesses().harnesses));
  assert.ok(Array.isArray(index.readSkills().skills));
  assert.ok(Array.isArray(index.readProseDenylist().tells));
});

test('41.5-02: loader is dep-free (only node: builtins)', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/manifest/loader.cjs'), 'utf8');
  const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  for (const r of requires) {
    assert.ok(r.startsWith('node:'), `loader.cjs may only require node: builtins (got "${r}")`);
  }
});
