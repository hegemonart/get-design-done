'use strict';
// Phase 39.5 — deprecation-registry.cjs unit test. Verifies the pure registry reader: version
// compare, markdown-table parse of the real DEPRECATIONS.md backfill, status classification
// boundaries, reference lookup, and purity. Every test tagged `39.5-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const MOD = path.resolve(REPO_ROOT, 'scripts/lib/deprecation-registry.cjs');
const { compareVersions, parseDeprecations, classify, checkReference } = require(MOD);
const DEPRECATIONS = fs.readFileSync(path.join(REPO_ROOT, 'reference/DEPRECATIONS.md'), 'utf8');

test('39.5-03: compareVersions handles decimals + missing components', () => {
  assert.equal(compareVersions('1.39.5', '1.39.0'), 1);
  assert.equal(compareVersions('1.33.0', '1.33.0'), 0);
  assert.equal(compareVersions('1.31.5', '1.33.0'), -1);
  assert.equal(compareVersions('1.39', '1.39.0'), 0, 'missing patch = 0');
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
});

test('39.5-03: parseDeprecations reads the 10 backfilled 31.5→sdk rows', () => {
  const entries = parseDeprecations(DEPRECATIONS);
  assert.equal(entries.length, 10, 'exactly the 10 path migrations');
  const cli = entries.find((e) => e.old === 'scripts/lib/cli');
  assert.ok(cli, 'scripts/lib/cli present');
  assert.equal(cli.new, 'sdk/cli');
  assert.equal(cli.since, '1.31.5');
  assert.equal(cli.removedIn, '1.33.0');
  // every row is well-formed
  for (const e of entries) {
    assert.match(e.since, /^\d+\.\d+/, 'since is a version');
    assert.match(e.removedIn, /^\d+\.\d+/, 'removedIn is a version');
    assert.ok(e.old && e.new && e.hint, 'old/new/hint non-empty');
  }
});

test('39.5-03: classify boundaries — pending / deprecated / removed', () => {
  const e = { since: '1.31.5', removedIn: '1.33.0', old: 'x', new: 'y', hint: '' };
  assert.equal(classify(e, '1.31.0'), 'pending', 'before since');
  assert.equal(classify(e, '1.31.5'), 'deprecated', 'at since');
  assert.equal(classify(e, '1.32.0'), 'deprecated', 'between');
  assert.equal(classify(e, '1.33.0'), 'removed', 'at removedIn');
  assert.equal(classify(e, '1.39.5'), 'removed', 'after removedIn');
  // blank removedIn ⇒ never removed
  assert.equal(classify({ since: '1.40.0', removedIn: '', old: 'a', new: 'b', hint: '' }, '2.0.0'), 'deprecated');
  assert.throws(() => classify({}, '1.0.0'), /since/);
});

test('39.5-03: checkReference resolves a known old path + returns null for unknown', () => {
  const entries = parseDeprecations(DEPRECATIONS);
  const hit = checkReference(entries, 'scripts/mcp-servers/gdd-mcp/server.ts', '1.39.5');
  assert.ok(hit, 'known path resolves');
  assert.equal(hit.status, 'removed');
  assert.equal(hit.entry.new, 'sdk/mcp/gdd-mcp/server.ts');
  assert.match(hit.message, /removed in v1\.33\.0/);
  assert.equal(checkReference(entries, 'totally/made/up', '1.39.5'), null);
  assert.throws(() => checkReference('nope', 'x', '1.0.0'), /must be an array/);
});

test('39.5-03: pure + dep-free (zero require)', () => {
  assert.doesNotMatch(fs.readFileSync(MOD, 'utf8'), /\brequire\s*\(/, 'deprecation-registry.cjs must not require anything');
});
