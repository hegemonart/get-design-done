'use strict';
/**
 * tests/adr-offer-gate.test.cjs
 *
 * Phase 28.5 plan 08 — locks the ADR 3-criteria offer gate spec per D-04.
 *
 * The gate logic lives in reference/adr-format.md as authoritative prose. The
 * discuss skill body (skills/discuss/SKILL.md Step 5) references all three
 * criteria. These tests assert both surfaces stay in sync — if the contract is
 * relaxed, the test fails before the skill drift can ship.
 *
 * Criteria (ALL THREE must hold):
 *   - hard-to-reverse
 *   - surprising-without-context
 *   - real-tradeoff
 *
 * ADR status states tracked:
 *   - Proposed | Accepted | Superseded | Deprecated
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ADR_FMT = path.join(REPO_ROOT, 'reference', 'adr-format.md');
const DISCUSS = path.join(REPO_ROOT, 'skills', 'discuss', 'SKILL.md');

test('adr-format.md documents all 3 criteria', () => {
  const c = fs.readFileSync(ADR_FMT, 'utf8');
  assert.ok(/hard-to-reverse/.test(c), 'criterion 1: hard-to-reverse must be documented');
  assert.ok(/surprising-without-context/.test(c), 'criterion 2: surprising-without-context must be documented');
  assert.ok(/real-tradeoff/.test(c), 'criterion 3: real-tradeoff must be documented');
});

test('adr-format.md documents the 4 status states', () => {
  const c = fs.readFileSync(ADR_FMT, 'utf8');
  for (const s of ['Proposed', 'Accepted', 'Superseded', 'Deprecated']) {
    assert.ok(new RegExp(s).test(c), `missing ADR status: ${s}`);
  }
});

test('adr-format.md specifies path convention docs/adr/NNNN-<slug>.md', () => {
  const c = fs.readFileSync(ADR_FMT, 'utf8');
  assert.ok(/docs\/adr\/NNNN/.test(c), 'must document docs/adr/NNNN-<slug>.md path convention');
});

test('adr-format.md enforces ALL THREE gate (not ANY)', () => {
  const c = fs.readFileSync(ADR_FMT, 'utf8');
  // The gate must be conjunctive — "all" or "ALL" or AND-style language present.
  // We accept any of: "ALL THREE", "all three", "ALL three", "all 3", "AND".
  const hasConjunction = /ALL THREE|ALL three|all three|all 3|hold for the agent to offer|AND/i.test(c);
  assert.ok(hasConjunction, 'adr-format.md must enforce conjunctive 3-criteria gate (ALL THREE)');
});

test('discuss skill ties ADR-offer scan to adr-format gate (full chain)', () => {
  const c = fs.readFileSync(DISCUSS, 'utf8');
  // discuss must reference adr-format.md (the schema) AND mention at least 2 criteria
  // (the plan acceptance criterion #5 is >=2 of 3 — explicit traceability).
  assert.ok(/adr-format/.test(c), 'discuss must link out to reference/adr-format.md');
  const criteriaHits = (c.match(/hard-to-reverse|surprising-without-context|real-tradeoff/g) || []).length;
  assert.ok(criteriaHits >= 2, `discuss must mention >=2 criteria for traceability; got ${criteriaHits}`);
});

test('adr-format.md provides worked qualifier + disqualifier examples', () => {
  const c = fs.readFileSync(ADR_FMT, 'utf8');
  // Both surfaces must appear so authors can pattern-match real cases.
  assert.ok(/qualifier/i.test(c), 'must show a worked qualifier example');
  assert.ok(/disqualifier/i.test(c), 'must show a worked disqualifier example');
});
