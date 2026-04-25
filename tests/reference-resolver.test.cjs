// tests/reference-resolver.test.cjs — Plan 23-05 reference resolver
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const { resolve, resolveAll, excerptOf, DEFAULT_MAX_CHARS } =
  require('../scripts/lib/reference-resolver.cjs');

test('23-05: exact name match returns the entry', () => {
  const r = resolve('form-patterns', { cwd: REPO_ROOT });
  assert.ok(r, 'expected a hit for form-patterns');
  assert.equal(r.name, 'form-patterns');
  assert.equal(r.path, 'reference/form-patterns.md');
  assert.equal(r.type, 'heuristic');
});

test('23-05: type: prefix is stripped', () => {
  const a = resolve('form-patterns', { cwd: REPO_ROOT });
  const b = resolve('type:form-patterns', { cwd: REPO_ROOT });
  assert.deepEqual(a, b);
});

test('23-05: singularize matches forms → form-patterns', () => {
  const r = resolve('forms', { cwd: REPO_ROOT });
  assert.ok(r, 'forms should singularize to form-patterns');
  assert.equal(r.name, 'form-patterns');
});

test('23-05: missing key returns null', () => {
  const r = resolve('totally-bogus-key-xyzzy', { cwd: REPO_ROOT });
  assert.equal(r, null);
});

test('23-05: empty input returns null', () => {
  assert.equal(resolve('', { cwd: REPO_ROOT }), null);
  assert.equal(resolve('type:', { cwd: REPO_ROOT }), null);
});

test('23-05: ambiguous type-only match throws RangeError', () => {
  // The registry has many heuristic-typed entries — 'heuristic' is by-type
  // ambiguous, so resolving 'heuristic' must throw.
  assert.throws(
    () => resolve('heuristic', { cwd: REPO_ROOT }),
    /ambiguous/,
  );
});

test('23-05: excerpt is non-empty, ≤ 200 chars, no newlines, no headers', () => {
  const r = resolve('form-patterns', { cwd: REPO_ROOT });
  assert.ok(r);
  assert.ok(r.excerpt.length > 0);
  assert.ok(r.excerpt.length <= DEFAULT_MAX_CHARS);
  assert.doesNotMatch(r.excerpt, /\n/);
  assert.doesNotMatch(r.excerpt, /^#\s/m);
});

test('23-05: resolveAll returns hits in input order, ignoreMissing skips bogus', () => {
  const hits = resolveAll(['form-patterns', 'gestalt', 'totally-bogus-xyzzy'], {
    cwd: REPO_ROOT,
    ignoreMissing: true,
  });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].name, 'form-patterns');
  assert.equal(hits[1].name, 'gestalt');
});

test('23-05: resolveAll without ignoreMissing throws on first miss', () => {
  assert.throws(
    () => resolveAll(['form-patterns', 'totally-bogus-xyzzy'], { cwd: REPO_ROOT }),
    /unresolved keys/,
  );
});

test('23-05: resolveAll throws on non-array input', () => {
  assert.throws(() => resolveAll('not-an-array', { cwd: REPO_ROOT }), /array/);
});

test('23-05: excerptOf truncates with ellipsis when over maxChars', () => {
  // Synthesize a temp markdown file inline.
  const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const dir = mkdtempSync(path.join(tmpdir(), 'gdd-excerpt-'));
  try {
    const file = path.join(dir, 'big.md');
    const para = 'word '.repeat(100); // 500 chars
    writeFileSync(file, '---\nfm: yes\n---\n\n# Heading\n\n' + para + '\n');
    const ex = excerptOf(file, { maxChars: 50 });
    assert.ok(ex.length <= 50);
    assert.match(ex, /…$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-05: excerptOf returns empty string on missing file', () => {
  assert.equal(excerptOf('/nope/no/such/file.md'), '');
});
