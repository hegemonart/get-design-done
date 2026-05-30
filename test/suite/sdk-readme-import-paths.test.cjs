'use strict';
// test/suite/sdk-readme-import-paths.test.cjs — Plan 31-5-04 Task 3 (SDK-01/02).
//
// 31-5-04: assert that every per-module "Public import" path documented in
// the sdk/README.md table maps to a real, resolvable file in the repo tree.
// This catches a documented path drifting away from the moved sdk/ layout
// (D-04 explicit per-module import contract). The packed-tarball variant of
// this assertion — that each path is importable from an installed tarball —
// is exercised by 31-5-09's headless E2E; repo-tree resolvability is
// sufficient here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const PKG_PREFIX = '@hegemonart/get-design-done/';

/**
 * Resolve a documented `@hegemonart/get-design-done/sdk/<sub>` import to the
 * repo-tree file it should point at. Directory modules resolve to their
 * `index.ts`; primitives resolve to the `.cjs` of the same basename; the
 * mcp/gdd-state server resolves to `server.ts`. Returns an absolute path or
 * null when the import is not a `/sdk/...` path.
 */
function resolveDocumentedPath(importSpec) {
  if (!importSpec.startsWith(PKG_PREFIX)) return null;
  const sub = importSpec.slice(PKG_PREFIX.length); // e.g. "sdk/state"
  if (!sub.startsWith('sdk/') && sub !== 'sdk') return null;

  const abs = path.join(REPO_ROOT, sub);

  // primitives/<name> → the .cjs primitive file.
  if (/^sdk\/primitives\/[^/]+$/.test(sub)) {
    return `${abs}.cjs`;
  }
  // mcp/gdd-state → the server entry.
  if (sub === 'sdk/mcp/gdd-state') {
    return path.join(abs, 'server.ts');
  }
  // bare root barrel.
  if (sub === 'sdk') {
    return path.join(abs, 'index.ts');
  }
  // Every other documented module is a directory with an index.ts.
  return path.join(abs, 'index.ts');
}

/** Extract the backtick-quoted import from the Public-import column of each
 *  data row. Returns the list of documented import specifiers. */
function parseDocumentedImports() {
  const md = fs.readFileSync(
    path.join(REPO_ROOT, 'sdk', 'README.md'),
    'utf8',
  );
  const imports = [];
  for (const line of md.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length !== 6) continue;
    if (cells[1] === 'Module' || /^-+$/.test(cells[1])) continue;
    const m = cells[2].match(/`([^`]+)`/);
    if (m && m[1].includes('/sdk/')) imports.push(m[1]);
  }
  return imports;
}

test('31-5-04: README documents >= 9 per-module /sdk/ import paths', () => {
  const imports = parseDocumentedImports();
  assert.ok(
    imports.length >= 9,
    `expected >= 9 documented /sdk/ import paths, parsed ${imports.length}`,
  );
});

test('31-5-04: every documented /sdk/ import path resolves to a repo-tree file', () => {
  const imports = parseDocumentedImports();
  const unresolved = [];
  for (const spec of imports) {
    const target = resolveDocumentedPath(spec);
    if (target === null) {
      unresolved.push(`${spec} (not a recognized /sdk/ path)`);
      continue;
    }
    if (!fs.existsSync(target)) {
      unresolved.push(`${spec} -> ${path.relative(REPO_ROOT, target)} (missing)`);
    }
  }
  assert.deepEqual(
    unresolved,
    [],
    `documented sdk import path(s) do not resolve in the repo tree:\n  - ${unresolved.join('\n  - ')}`,
  );
});

test('31-5-04: the six SDK subtrees are physically present under sdk/', () => {
  // Direct existence gate on the SC#2 layout, independent of the README
  // parse — proves the git mv landed all six subtrees.
  const required = [
    'sdk/cli/index.ts',
    'sdk/state/index.ts',
    'sdk/event-stream/index.ts',
    'sdk/errors/index.ts',
    'sdk/primitives/error-classifier.cjs',
    'sdk/primitives/iteration-budget.cjs',
    'sdk/primitives/jittered-backoff.cjs',
    'sdk/primitives/lockfile.cjs',
    'sdk/mcp/gdd-state/server.ts',
    'sdk/index.ts',
  ];
  const missing = required.filter(
    (rel) => !fs.existsSync(path.join(REPO_ROOT, rel)),
  );
  assert.deepEqual(missing, [], `missing SDK files: ${missing.join(', ')}`);
});
