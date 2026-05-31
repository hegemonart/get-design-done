// test/suite/print-css-validator.test.cjs — Phase 34.3 Plan 01
//
// Hermetic suite for the static print-CSS constraint validator (SC#9-print).
// The validator (scripts/lib/print/validate-print-css.cjs) checks the
// statically-verifiable subset of reference/print-design.md §8:
//   - PR-PAGE-01 : an @page rule is present (the print box model)
//   - PR-BLEED-01: a bleed box / crop-marks signal is present
//   - PR-CMYK-01 : a CMYK-awareness signal is present
//   - PR-FONT-01 : a font-embed signal is present
//   - PR-DPI-01  : a 300dpi raster-fallback signal is present
//
// D-10: hermetic — node builtins + the validator + the four static fixtures
// only. NO network, NO pdfkit/paged/puppeteer/playwright, NO child_process. The
// validator is pure and deterministic: same CSS string -> identical { ok,
// violations }.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validatePrintCss } = require('../../scripts/lib/print/validate-print-css.cjs');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'print');
const SPEC_PATH = path.join(__dirname, '..', '..', 'reference', 'print-design.md');

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, `${name}.css`), 'utf8');
}

// The statically-checkable rule-ids the validator can emit (mirror §8).
const STATIC_RULE_IDS = ['PR-PAGE-01', 'PR-BLEED-01', 'PR-CMYK-01', 'PR-FONT-01', 'PR-DPI-01'];

const FIXTURE_NAMES = ['good', 'bad-no-page', 'bad-no-bleed', 'bad-no-font'];

test('34.3-01: GOOD fixture passes (ok:true, no violations)', () => {
  const r = validatePrintCss(fixture('good'));
  assert.equal(r.ok, true, `GOOD should pass, got violations: ${JSON.stringify(r.violations)}`);
  assert.deepEqual(r.violations, []);
});

test('34.3-01: bad-no-page flags the missing-@page rule (PR-PAGE-01)', () => {
  const r = validatePrintCss(fixture('bad-no-page'));
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.rule === 'PR-PAGE-01'),
    `expected PR-PAGE-01, got: ${JSON.stringify(r.violations)}`,
  );
  // exactly one class violated — no bleed/cmyk/font/dpi false positives
  assert.ok(!r.violations.some((v) => v.rule === 'PR-BLEED-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'PR-CMYK-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'PR-FONT-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'PR-DPI-01'));
  assert.equal(r.violations.length, 1);
});

test('34.3-01: bad-no-bleed flags the missing-bleed/crop-marks rule (PR-BLEED-01)', () => {
  const r = validatePrintCss(fixture('bad-no-bleed'));
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.rule === 'PR-BLEED-01'),
    `expected PR-BLEED-01, got: ${JSON.stringify(r.violations)}`,
  );
  assert.ok(!r.violations.some((v) => v.rule === 'PR-PAGE-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'PR-CMYK-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'PR-FONT-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'PR-DPI-01'));
  assert.equal(r.violations.length, 1);
});

test('34.3-01: bad-no-font flags the missing-font-embed rule (PR-FONT-01)', () => {
  const r = validatePrintCss(fixture('bad-no-font'));
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.rule === 'PR-FONT-01'),
    `expected PR-FONT-01, got: ${JSON.stringify(r.violations)}`,
  );
  assert.ok(!r.violations.some((v) => v.rule === 'PR-PAGE-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'PR-BLEED-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'PR-CMYK-01'));
  assert.ok(!r.violations.some((v) => v.rule === 'PR-DPI-01'));
  assert.equal(r.violations.length, 1);
});

test('34.3-01: every violation is shaped { rule, detail } and ok === (violations.length === 0)', () => {
  for (const name of FIXTURE_NAMES) {
    const r = validatePrintCss(fixture(name));
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

test('34.3-01: validatePrintCss is deterministic (same input -> deep-equal output)', () => {
  for (const name of FIXTURE_NAMES) {
    const css = fixture(name);
    assert.deepEqual(validatePrintCss(css), validatePrintCss(css));
  }
});

test('34.3-01: every emitted rule-id is documented in reference/print-design.md', () => {
  const spec = fs.readFileSync(SPEC_PATH, 'utf8');
  // Collect every rule-id the validator actually emits across the fixtures...
  const emitted = new Set();
  for (const name of FIXTURE_NAMES) {
    for (const v of validatePrintCss(fixture(name)).violations) emitted.add(v.rule);
  }
  // ...plus the full static set the validator is capable of emitting.
  for (const id of STATIC_RULE_IDS) emitted.add(id);
  for (const id of emitted) {
    assert.ok(spec.includes(id), `validator rule-id ${id} must be documented in reference/print-design.md`);
  }
});
