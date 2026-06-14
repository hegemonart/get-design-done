'use strict';
/**
 * test/suite/phase-57-recall-fts5.test.cjs  —  dbg-A: FTS5 dotted-path recall fix.
 *
 * Regression test for the bug where _searchFts5() passed raw query strings
 * (e.g. "heuristics.md OR reference/heuristics.md") directly to the FTS5
 * MATCH expression. The trigram tokenizer treats '.' and '/' as illegal in
 * bare terms, causing SQLite to throw `fts5: syntax error near "."`, which
 * was swallowed by the caller — returning EMPTY results for every .md filename
 * query on every better-sqlite3-capable installation.
 *
 * Fix: _quoteFts5Query() wraps each term in double-quotes with internal '"'
 * escaped as '""', matching the pattern in instinct-store.cjs line ~420.
 *
 * Always-on assertions (run on CI without better-sqlite3):
 *   - backendName() returns a string
 *   - _quoteFts5Query is a pure function with correct output for known inputs
 *
 * better-sqlite3-gated assertions (skip on CI):
 *   - reindex + search("heuristics.md OR reference/heuristics.md") returns >=1 hit
 *   - search with a bare space-separated query also works
 *   - previously empty results are now non-empty
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Module under test

function findRepoRoot() {
  let dir = path.resolve(__dirname);
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === '@hegemonart/hone') return dir;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const designSearch = require(path.join(REPO_ROOT, 'scripts', 'lib', 'design-search.cjs'));
const { probeOptional } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'probe-optional.cjs'));

const hasBetterSqlite3 = !!probeOptional('better-sqlite3');

// ---------------------------------------------------------------------------
// Always-on: backendName() returns a string (exercises module load on CI)

test('dbg-A: backendName() returns a string', () => {
  const name = designSearch.backendName();
  assert.equal(typeof name, 'string', 'backendName() must return a string');
  assert.ok(name.length > 0, 'backendName() must not be empty');
});

// ---------------------------------------------------------------------------
// Always-on: _quoteFts5Query is a pure function

test('dbg-A: _quoteFts5Query wraps dotted filenames in double-quotes', () => {
  const q = designSearch._quoteFts5Query;
  assert.equal(typeof q, 'function', '_quoteFts5Query must be exported');

  // Single term with dot
  assert.equal(q('heuristics.md'), '"heuristics.md"');

  // OR-separated dotted paths — the canonical caller pattern
  assert.equal(
    q('heuristics.md OR reference/heuristics.md'),
    '"heuristics.md" OR "reference/heuristics.md"'
  );

  // Space-separated terms (no OR) also become quoted
  assert.equal(q('color tokens'), '"color" OR "tokens"');

  // Internal double-quotes are escaped as "" per FTS5 spec
  assert.equal(q('say "hello"'), '"say" OR """hello"""');

  // Single plain token stays quoted
  assert.equal(q('heuristics'), '"heuristics"');

  // Extra whitespace around OR is normalised
  assert.equal(
    q('foo.md  OR  bar/baz.md'),
    '"foo.md" OR "bar/baz.md"'
  );
});

// ---------------------------------------------------------------------------
// better-sqlite3-gated: end-to-end reindex + search with dotted path query

test('dbg-A: FTS5 search returns hits for dotted-path OR query (regression)', { skip: hasBetterSqlite3 ? false : 'better-sqlite3 not installed — skip FTS5 path' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-fts5-'));
  try {
    // Seed a tiny corpus: .design/archive/cycle-1/reference/heuristics.md
    // with content that mentions a recognisable token.
    const archiveDir = path.join(dir, '.design', 'archive', 'cycle-1', 'reference');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(
      path.join(archiveDir, 'heuristics.md'),
      [
        '# Nielsen heuristics reference',
        'This file lists the ten usability heuristics used during audits.',
        'Always reach for heuristics.md when scoring contrast decisions.',
      ].join('\n'),
      'utf8'
    );

    // Also seed LEARNINGS and STATE so reindex() has something in all three paths.
    const designDir = path.join(dir, '.design');
    fs.mkdirSync(path.join(designDir, 'learnings'), { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'learnings', 'LEARNINGS.md'),
      'L-01: reference/heuristics.md is the canonical NNG rubric.\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(designDir, 'STATE.md'),
      'D-12: reference/heuristics.md is tier L2.\n',
      'utf8'
    );

    // Build the index.
    designSearch.reindex(dir);

    // This is the exact query shape produced by gdd-decision-injector.js:
    //   terms = ['heuristics.md', 'reference/heuristics.md']
    //   query = terms.join(' OR ')
    const query = 'heuristics.md OR reference/heuristics.md';
    const hits = designSearch.search(query, dir, { limit: 5 });

    assert.ok(Array.isArray(hits), 'search() must return an array');
    assert.ok(hits.length >= 1, `Expected >=1 hit for "${query}", got ${hits.length} — FTS5 syntax-error regression`);

    // Each hit has the required shape.
    for (const hit of hits) {
      assert.equal(typeof hit.file, 'string', 'hit.file must be a string');
      assert.equal(typeof hit.line, 'number', 'hit.line must be a number');
      assert.equal(typeof hit.text, 'string', 'hit.text must be a string');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dbg-A: FTS5 search with space-separated query also works after fix', { skip: hasBetterSqlite3 ? false : 'better-sqlite3 not installed — skip FTS5 path' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-fts5b-'));
  try {
    const archiveDir = path.join(dir, '.design', 'archive', 'cycle-1');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(
      path.join(archiveDir, 'color-tokens.md'),
      'Design tokens drive theming. Never use raw color values.\n',
      'utf8'
    );

    designSearch.reindex(dir);

    // Space-separated query (no OR) must not throw and must find the token.
    const hits = designSearch.search('color tokens', dir, { limit: 5 });
    assert.ok(Array.isArray(hits), 'search() must return an array');
    assert.ok(hits.length >= 1, `Expected >=1 hit for "color tokens", got ${hits.length}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
