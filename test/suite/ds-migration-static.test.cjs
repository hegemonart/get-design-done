'use strict';
// Phase 39.1 — DS Migration static contract. Verifies the 4 rule libraries (sections + valid
// Kind enums + registered), the planner (package.json detection + impact scoring + proposal-only
// + codemod-gen), and the verifier migration note. Hermetic: file reads only. Every test `39.1-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const LIBS = ['shadcn-v2', 'tailwind-v4', 'mui-v6', 'material-3-to-4'];
const KINDS = ['rename-class', 'rename-prop', 'remove-component', 'token-rename', 'new-default'];

test('39.1-03: 4 migration rule libraries exist with the required sections', () => {
  for (const m of LIBS) {
    const body = read(`reference/migrations/${m}.md`);
    assert.ok(body.length > 800, `${m}.md substantive`);
    assert.match(body, /^## Detection/m, `${m} Detection`);
    assert.match(body, /^## Migration rules/m, `${m} Migration rules`);
    assert.match(body, /^## Impact/m, `${m} Impact`);
  }
});

test('39.1-03: every rule library Kind cell uses the codemod-gen enum', () => {
  for (const m of LIBS) {
    const body = read(`reference/migrations/${m}.md`);
    const cells = [...body.matchAll(/\|\s*(rename-class|rename-prop|remove-component|token-rename|new-default)\s*\|/g)];
    assert.ok(cells.length >= 8, `${m} has >=8 valid Kind cells (got ${cells.length})`);
    // no out-of-enum kind tokens in a Kind-looking cell
    const bad = [...body.matchAll(/\|\s*(rename-[a-z]+|[a-z]+-component|[a-z]+-rename|[a-z]+-default)\s*\|/g)]
      .map((x) => x[1]).filter((k) => !KINDS.includes(k));
    assert.deepEqual(bad, [], `${m} has no out-of-enum kinds: ${bad.join(',')}`);
  }
});

test('39.1-03: 4 libraries registered (type heuristic, phase 39.1)', () => {
  const reg = JSON.parse(read('reference/registry.json'));
  for (const m of LIBS) {
    const e = reg.entries.find((x) => x.name === m);
    assert.ok(e, `${m} registered`);
    assert.equal(e.path, `reference/migrations/${m}.md`, `${m} path`);
    assert.equal(e.phase, 39.1, `${m} phase`);
  }
});

test('39.1-03: ds-migration-planner — package.json detection + impact + proposal-only + codemod-gen', () => {
  const a = read('agents/ds-migration-planner.md');
  assert.match(a, /package\.json/, 'detects from package.json');
  assert.match(a, /impact/i, 'impact scoring');
  assert.match(a, /visual.?delta|usage|tests/i, 'the impact factors');
  assert.match(a, /proposal-only|never auto-?appl|review/i, 'proposal-only (D-01)');
  assert.match(a, /scripts\/lib\/migration\/codemod-gen\.cjs/, 'uses codemod-gen');
  assert.match(a, /reference\/migrations\//, 'consults the rule libraries');
});

test('39.1-03: design-verifier checks an in-flight migration', () => {
  assert.match(read('agents/design-verifier.md'), /migration/i, 'verifier has a migration-validation note');
});
