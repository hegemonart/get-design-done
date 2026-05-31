// test/suite/email-html-validator.test.cjs — Phase 34.2 Plan 01
//
// Hermetic suite for the static email-HTML constraint validator (SC#9-email).
// The validator (scripts/lib/email/validate-email-html.cjs) checks the
// statically-verifiable subset of reference/email-design.md §8:
//   - EM-LAYOUT-01: no flexbox/grid/position primitives
//   - EM-STYLE-01 : no <style> block as the primary styling mechanism
//   - EM-MSO-01   : an MSO conditional comment is present in a full email
//   - EM-DARK-01  : a color-scheme signal is present
//
// D-10: hermetic — node builtins + the validator + the four static fixtures
// only. NO network, NO mjml, NO child_process. The validator is pure and
// deterministic: same HTML string -> identical { ok, violations }.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateEmailHtml } = require('../../scripts/lib/email/validate-email-html.cjs');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'email');
const SPEC_PATH = path.join(__dirname, '..', '..', 'reference', 'email-design.md');

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, `${name}.html`), 'utf8');
}

// The statically-checkable rule-ids the validator can emit (mirror §8).
const STATIC_RULE_IDS = ['EM-LAYOUT-01', 'EM-STYLE-01', 'EM-MSO-01', 'EM-DARK-01'];

test('34.2-01: GOOD fixture passes (ok:true, no violations)', () => {
  const r = validateEmailHtml(fixture('good'));
  assert.equal(r.ok, true, `GOOD should pass, got violations: ${JSON.stringify(r.violations)}`);
  assert.deepEqual(r.violations, []);
});

test('34.2-01: bad-flexbox flags the no-flexbox/grid/position rule (EM-LAYOUT-01)', () => {
  const r = validateEmailHtml(fixture('bad-flexbox'));
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.rule === 'EM-LAYOUT-01'),
    `expected EM-LAYOUT-01, got: ${JSON.stringify(r.violations)}`,
  );
  // exactly one class violated — no MSO/STYLE/DARK false positives
  assert.ok(!r.violations.some((v) => v.rule === 'EM-MSO-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'EM-STYLE-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'EM-DARK-01'));
});

test('34.2-01: bad-style-block flags the inline-styles / no-<style>-block rule (EM-STYLE-01)', () => {
  const r = validateEmailHtml(fixture('bad-style-block'));
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.rule === 'EM-STYLE-01'),
    `expected EM-STYLE-01, got: ${JSON.stringify(r.violations)}`,
  );
  assert.ok(!r.violations.some((v) => v.rule === 'EM-LAYOUT-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'EM-MSO-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'EM-DARK-01'));
});

test('34.2-01: bad-no-mso flags the missing MSO conditional comments rule (EM-MSO-01)', () => {
  const r = validateEmailHtml(fixture('bad-no-mso'));
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.rule === 'EM-MSO-01'),
    `expected EM-MSO-01, got: ${JSON.stringify(r.violations)}`,
  );
  assert.ok(!r.violations.some((v) => v.rule === 'EM-LAYOUT-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'EM-STYLE-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'EM-DARK-01'));
});

test('34.2-01: every violation is shaped { rule, detail } and ok === (violations.length === 0)', () => {
  for (const name of ['good', 'bad-flexbox', 'bad-style-block', 'bad-no-mso']) {
    const r = validateEmailHtml(fixture(name));
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(Array.isArray(r.violations));
    assert.equal(r.ok, r.violations.length === 0);
    for (const v of r.violations) {
      assert.equal(typeof v.rule, 'string');
      assert.equal(typeof v.detail, 'string');
      assert.ok(v.rule.length > 0 && v.detail.length > 0);
    }
  }
});

test('34.2-01: validateEmailHtml is deterministic (same input -> deep-equal output)', () => {
  for (const name of ['good', 'bad-flexbox', 'bad-style-block', 'bad-no-mso']) {
    const html = fixture(name);
    assert.deepEqual(validateEmailHtml(html), validateEmailHtml(html));
  }
});

test('34.2-01: every emitted rule-id is documented in reference/email-design.md', () => {
  const spec = fs.readFileSync(SPEC_PATH, 'utf8');
  // Collect every rule-id the validator actually emits across the fixtures...
  const emitted = new Set();
  for (const name of ['good', 'bad-flexbox', 'bad-style-block', 'bad-no-mso']) {
    for (const v of validateEmailHtml(fixture(name)).violations) emitted.add(v.rule);
  }
  // ...plus the full static set the validator is capable of emitting.
  for (const id of STATIC_RULE_IDS) emitted.add(id);
  for (const id of emitted) {
    assert.ok(spec.includes(id), `validator rule-id ${id} must be documented in reference/email-design.md`);
  }
});
