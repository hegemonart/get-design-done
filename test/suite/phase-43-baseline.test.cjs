'use strict';
// Phase 43 C2 — regression baseline: positive (clean) + negative (violations) + locale-fallback fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { scan, isCyrillicMajority } = require('../../scripts/lint-prose.cjs');
const { readProseDenylist } = require('../../scripts/lib/manifest/index.cjs');

const DIR = path.resolve(__dirname, '..', 'fixtures', 'baselines', 'phase-43');
const DENY = readProseDenylist().tells;
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

test('43-baseline-clean: clean fixture has zero violations (code/flags/spaced-hyphen all ok)', () => {
  assert.equal(scan(read('clean.md'), DENY).length, 0);
});

test('43-baseline-violations: negative fixture flags exactly the expected token + tell set', () => {
  const f = scan(read('violations.md'), DENY);
  const kinds = f.map((x) => (x.kind === 'token' ? (x.match === '—' ? 'em-dash' : x.match) : `tell:${x.pattern}`)).sort();
  assert.deepEqual(kinds, ['--', 'em-dash', 'tell:leverage', 'tell:robust', 'tell:seamless']);
});

test('43-baseline-cyrillic: Cyrillic-majority fixture is locale-skipped (despite an em dash)', () => {
  const text = read('cyrillic.md');
  assert.equal(isCyrillicMajority(text), true, 'fixture must be detected as Cyrillic-majority');
  assert.ok(scan(text, DENY).some((x) => x.match === '—'), 'raw scan still sees the em dash (skip happens at the file layer)');
});
