'use strict';
// Phase 45 — regression baseline: the 7 domain-index entry-points exist + are within the length cap, the
// registry registers exactly them as domain-index, cross-links resolve, no large copy-paste, and the
// token-load baseline records a real reduction.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const REF = path.join(ROOT, 'reference');
const DOMAINS = ['typography', 'color', 'spatial', 'motion', 'interaction', 'responsive', 'ux-writing'];
const crossLinks = require('../../scripts/check-domain-cross-links.cjs');
const noDup = require('../../scripts/check-no-duplication.cjs');

test('45-baseline-entries: the 7 domain-index entry-points exist and are <=300 lines', () => {
  for (const d of DOMAINS) {
    const p = path.join(REF, `${d}.md`);
    assert.ok(fs.existsSync(p), `reference/${d}.md missing`);
    const lines = fs.readFileSync(p, 'utf8').split('\n').length;
    assert.ok(lines <= 300, `reference/${d}.md is ${lines} lines (cap 300)`);
  }
});

test('45-baseline-registry: exactly the 7 entry-points are registered as type domain-index', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(REF, 'registry.json'), 'utf8'));
  const di = reg.entries.filter((e) => e.type === 'domain-index').map((e) => e.name).sort();
  assert.deepEqual(di, [...DOMAINS].sort());
});

test('45-baseline-crosslinks: every domain-index link resolves (file + anchor)', () => {
  assert.equal(crossLinks.main(), 0);
});

test('45-baseline-noduplication: index entries link, never copy', () => {
  assert.equal(noDup.main(), 0);
});

test('45-baseline-tokenload: recorded reduction is real (after < before)', () => {
  const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'baselines', 'phase-45', 'token-load.json'), 'utf8'));
  for (const [name, c] of Object.entries(tl.consumers)) {
    const before = c.before_tokens;
    const after = c.after_tokens;
    assert.ok(after < before, `${name}: after ${after} should be < before ${before}`);
    assert.ok(c.reduction_pct >= 20, `${name}: reduction ${c.reduction_pct}% should be >= 20% (SC#8)`);
  }
});
