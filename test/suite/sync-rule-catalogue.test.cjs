'use strict';
// Phase 41 — bidirectional parity gate (SC#3/#4). The rule files and reference/anti-patterns.md must
// agree: every rule <-> a heading + bdId marker; every detectable non-exempt BAN has a rule; no
// orphans; exempt {BAN-04, BAN-10} are not ported. Every test tagged `41-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const { analyze } = require(path.join(REPO_ROOT, 'scripts/sync-rule-catalogue.cjs'));

test('41-03: rule files <-> catalogue are in parity (0 problems)', () => {
  const res = analyze();
  assert.deepEqual(res.problems, [], `parity problems:\n  ${res.problems.join('\n  ')}`);
  assert.equal(res.ruleCount, 11);
  assert.ok(res.headingCount >= 13, 'all BAN headings present');
  assert.deepEqual(res.exempt.sort(), ['BAN-04', 'BAN-10']);
});

test('41-03: every BAN heading carries a bdId marker', () => {
  const { parseCatalogue } = require(path.join(REPO_ROOT, 'scripts/sync-rule-catalogue.cjs'));
  const fs = require('node:fs');
  const md = fs.readFileSync(path.join(REPO_ROOT, 'reference/anti-patterns.md'), 'utf8');
  const cat = parseCatalogue(md);
  for (const id of cat.headings) {
    assert.ok(cat.markers.has(id), `${id} heading has no "bdId: ${id}" marker`);
  }
});
