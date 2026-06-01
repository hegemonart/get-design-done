'use strict';
// Phase 38 — design_arms posterior store unit test. Verifies the isolated Beta-posterior store
// (scripts/lib/ds-arms/design-arms-store.cjs): conservative Beta(2,8) prior, observe → posterior
// shift, deterministic variantKey, atomic persistence, advisory semantics. Distinct from the
// routing bandit. Hermetic: in-memory `_store` + a temp-file round trip. Every test `38-04:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MOD = path.resolve(__dirname, '../../scripts/lib/ds-arms/design-arms-store.cjs');
const S = require(MOD);

test('38-04: variantKey is deterministic, 8-hex, and component-sensitive', () => {
  const k = S.variantKey('primary-cta', 'cta-bold-filled');
  assert.equal(k, S.variantKey('primary-cta', 'cta-bold-filled'), 'deterministic');
  assert.match(k, /^[0-9a-f]{8}$/, '8-char hex');
  assert.notEqual(k, S.variantKey('pricing-card', 'cta-bold-filled'), 'component changes the key');
  // object patterns are canonicalized (key order independent)
  assert.equal(S.variantKey('x', { a: 1, b: 2 }), S.variantKey('x', { b: 2, a: 1 }), 'object pattern canonical');
});

test('38-04: unseen arm returns the conservative Beta(2,8) prior (mean 0.2)', () => {
  const store = { arms: [] };
  const p = S.pull('primary-cta', 'deadbeef', { _store: store });
  assert.equal(p.alpha, 2);
  assert.equal(p.beta, 8);
  assert.equal(p.mean, 0.2);
  assert.equal(p.seen, false);
});

test('38-04: observe shifts the posterior — wins raise alpha, losses raise beta', () => {
  const store = { arms: [] };
  const k = S.variantKey('primary-cta', 'cta-bold');
  S.observe('primary-cta', k, { won: true, source: 'ab' }, { _store: store });
  S.observe('primary-cta', k, { won: true }, { _store: store });
  S.observe('primary-cta', k, { won: true }, { _store: store });
  S.observe('primary-cta', k, { won: false }, { _store: store });
  const p = S.pull('primary-cta', k, { _store: store });
  assert.equal(p.alpha, 5, '2 + 3 wins');
  assert.equal(p.beta, 9, '8 + 1 loss');
  assert.equal(p.count, 4);
  assert.ok(p.mean > 0.2, 'mean rose above the prior on net wins');
  assert.equal(p.seen, true);
  assert.equal(p.last_source, 'ab');
});

test('38-04: weight scales the update; source is recorded', () => {
  const store = { arms: [] };
  const k = S.variantKey('c', 'p');
  S.observe('c', k, { won: true, weight: 0.5, source: 'research' }, { _store: store });
  const p = S.pull('c', k, { _store: store });
  assert.equal(p.alpha, 2.5, 'weighted win (2 + 0.5)');
  assert.equal(p.last_source, 'research');
});

test('38-04: persists atomically + round-trips from disk', () => {
  const tmp = path.join(os.tmpdir(), `gdd-design-arms-${process.pid}.json`);
  try {
    const k = S.variantKey('input', 'floating-label');
    S.observe('input', k, { won: true }, { armsPath: tmp });
    S.observe('input', k, { won: true }, { armsPath: tmp });
    const p = S.pull('input', k, { armsPath: tmp });
    assert.equal(p.alpha, 4, 'persisted across calls (2 + 2 wins)');
    assert.equal(p.seen, true);
    assert.ok(JSON.parse(fs.readFileSync(tmp, 'utf8')).arms.length === 1, 'one arm on disk');
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});

test('38-04: all() lists arms with posterior means', () => {
  const store = { arms: [] };
  S.observe('a', S.variantKey('a', '1'), { won: true }, { _store: store });
  S.observe('b', S.variantKey('b', '2'), { won: false }, { _store: store });
  const all = S.all({ _store: store });
  assert.equal(all.length, 2);
  assert.ok(all.every((a) => typeof a.mean === 'number'));
});

test('38-04: depends only on node: builtins (no npm dependency, no egress)', () => {
  const src = fs.readFileSync(MOD, 'utf8');
  const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  for (const r of requires) {
    assert.ok(r.startsWith('node:'), `require("${r}") must be a node: builtin (got a non-builtin dependency)`);
  }
});
