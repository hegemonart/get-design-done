'use strict';
// Phase 36.1 — Domain Packs (Knowledge Tier-3) static contract. Verifies the four
// industry packs exist with their two load-bearing sections (Detection signals + Audit
// checklist), are registered, and are wired into design-context-builder (Step 0F domain
// detection) + design-auditor (domain checklist addendum). Hermetic (D-08): file reads
// only — no live agent run. Every test tagged `36.1-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const DOMAINS = ['finance', 'healthcare', 'gaming', 'civic'];

test('36.1-03: all four domain packs exist with substantive content', () => {
  for (const d of DOMAINS) {
    const body = read(`reference/domains/${d}-patterns.md`);
    assert.ok(body.length > 1500, `${d}-patterns.md should be substantive`);
    assert.match(body, /^# .+Design Patterns/m, `${d} pack has an H1 title`);
  }
});

test('36.1-03: each pack carries the two load-bearing sections', () => {
  for (const d of DOMAINS) {
    const body = read(`reference/domains/${d}-patterns.md`);
    assert.match(body, /^## Detection signals$/m, `${d} pack has a Detection signals section`);
    assert.match(body, /^## Audit checklist$/m, `${d} pack has an Audit checklist section`);
  }
});

test('36.1-03: each pack names concrete package.json dependency signals', () => {
  // detection must be actionable — at least one real npm package name per pack.
  const dep = {
    finance: /stripe|plaid|ccxt|lightweight-charts/,
    healthcare: /fhir|medplum|hl7|redox/,
    gaming: /phaser|three|pixi\.js|babylonjs|colyseus/,
    civic: /uswds|govuk-frontend|@18f/,
  };
  for (const d of DOMAINS) {
    assert.match(read(`reference/domains/${d}-patterns.md`), dep[d], `${d} pack lists a real dependency signal`);
  }
});

test('36.1-03: all four packs are registered (type heuristic, phase 36.1)', () => {
  const reg = JSON.parse(read('reference/registry.json'));
  for (const d of DOMAINS) {
    const e = reg.entries.find((x) => x.name === d);
    assert.ok(e, `registry has an entry named "${d}"`);
    assert.equal(e.path, `reference/domains/${d}-patterns.md`, `${d} path`);
    assert.equal(e.type, 'heuristic', `${d} type`);
    assert.equal(e.phase, 36.1, `${d} phase`);
  }
});

test('36.1-03: design-context-builder has Step 0F domain detection wiring', () => {
  const cb = read('agents/design-context-builder.md');
  assert.match(cb, /Step 0F.*Domain Detection/i, 'has a Step 0F — Domain Detection');
  assert.match(cb, /<domain>/, 'records a <domain> line in DESIGN-CONTEXT.md');
  for (const d of DOMAINS) {
    assert.match(cb, new RegExp(`reference/domains/${d}-patterns\\.md`), `Step 0F dispatches to the ${d} pack`);
  }
  // the D-02 confidence rule must be present (auto-apply vs suggest vs skip).
  assert.match(cb, /auto-apply/i, 'states the auto-apply rule');
  assert.match(cb, /suggest/i, 'states the suggest rule');
});

test('36.1-03: design-auditor has the domain checklist addendum', () => {
  const au = read('agents/design-auditor.md');
  assert.match(au, /Domain checklist addendum/i, 'has a domain checklist addendum');
  for (const d of DOMAINS) {
    assert.match(au, new RegExp(`reference/domains/${d}-patterns\\.md`), `addendum references the ${d} pack`);
  }
  // additive, not a replacement of the pillar scoring.
  assert.match(au, /additive/i, 'addendum is additive, not a new score');
});
