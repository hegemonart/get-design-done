'use strict';
// Phase 39.5 — SC#4 deprecation-completeness gate. Every machine-readable entry in
// reference/DEPRECATIONS.md must be HONEST against the codebase at the installed version:
//   - a `removed` entry (current >= removedIn) → its Old path must NOT exist on disk,
//   - a `deprecated` entry (since <= current < removedIn) → a shim must still exist at the Old path.
// No orphan entries. Every test tagged `39.5-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const { parseDeprecations, classify } = require(path.resolve(REPO_ROOT, 'scripts/lib/deprecation-registry.cjs'));
const DEPRECATIONS = fs.readFileSync(path.join(REPO_ROOT, 'reference/DEPRECATIONS.md'), 'utf8');
const VERSION = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;

const entries = parseDeprecations(DEPRECATIONS);

/** A path "exists" if the file/dir is present, or (for an extensionless module path) any index/.ts/.cjs is. */
function pathExists(rel) {
  const abs = path.join(REPO_ROOT, rel);
  if (fs.existsSync(abs)) return true;
  // extensionless module dir/barrel forms
  for (const cand of [abs + '.ts', abs + '.cjs', abs + '.js', path.join(abs, 'index.ts'), path.join(abs, 'index.cjs')]) {
    if (fs.existsSync(cand)) return true;
  }
  return false;
}

test('39.5-03: the registry parses to a non-empty set of well-formed entries', () => {
  assert.ok(entries.length >= 10, `expected >=10 path migrations, got ${entries.length}`);
  for (const e of entries) {
    assert.ok(e.old && e.new, 'old + new present');
    assert.match(e.since, /^\d+\.\d+/, 'since version');
  }
});

test('39.5-03: every `removed` entry — its Old path is gone from the tree', () => {
  const removed = entries.filter((e) => classify(e, VERSION) === 'removed');
  assert.ok(removed.length >= 10, 'the 31.5→sdk backfill is all removed at the current version');
  const orphans = removed.filter((e) => pathExists(e.old));
  assert.deepEqual(orphans.map((e) => e.old), [], `removed entries whose Old path still exists (stale registry): ${orphans.map((e) => e.old).join(', ')}`);
});

test('39.5-03: every `deprecated` entry — a shim still exists at the Old path', () => {
  const deprecated = entries.filter((e) => classify(e, VERSION) === 'deprecated');
  const missingShim = deprecated.filter((e) => !pathExists(e.old));
  assert.deepEqual(missingShim.map((e) => e.old), [], `deprecated entries missing their shim (should still resolve until removedIn): ${missingShim.map((e) => e.old).join(', ')}`);
});

test('39.5-03: every `removed` entry — its New replacement path exists', () => {
  const removed = entries.filter((e) => classify(e, VERSION) === 'removed');
  const missingNew = removed.filter((e) => !pathExists(e.new));
  assert.deepEqual(missingNew.map((e) => e.new), [], `removed entries whose New path is absent (broken replacement): ${missingNew.map((e) => e.new).join(', ')}`);
});
