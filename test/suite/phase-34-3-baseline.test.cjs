'use strict';

// Phase 34.3 — Non-Web Output Layer: Print/PDF regression baseline (SC#10-print,
// D-01, D-05, D-08, D-10). The THIRD and FINAL sub-phase of the split Phase 34 —
// completing it completes the parent Phase 34 (native 34.1 + email 34.2 + print 34.3).
//
// Freezes the Wave A–B print deliverable (the print-constraint catalogue + the
// static print-CSS validator + the pdf-executor + the print-renderer connection)
// as a single release artifact so future drift cannot silently regress the
// v1.34.3 contract. Asserts (every test tagged `34.3-04:`):
//   1. Print validator golden matches — validatePrintCss() over the recorded
//      print-good fixture deep-equals validator-golden.good (ok:true), AND over
//      the recorded bad fixture deep-equals validator-golden.bad (ok:false) —
//      the determinism + regression lock on the validator's rule-output SHAPE.
//   2. 6-manifest version lockstep — package.json == .claude-plugin/plugin.json
//      == marketplace.metadata.version == marketplace.plugins[0].version ==
//      .cursor-plugin == .codex-plugin == package-lock (root + packages."").
//   3. phase-34-3/manifests-version.txt == live package version == 1.34.3.
//   4. CHANGELOG has a [1.34.3] block at the top.
//
// Hermetic (D-10): file reads + require the static validator + the recorded
// fixtures. NO network, NO pdfkit/paged/puppeteer/playwright runtime, NO
// print-render, NO child_process. The validator is a pure string→verdict
// function; the pdf-executor/LLM produces the real print HTML/CSS. Runs in the
// default `npm test`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-34-3');

const { validatePrintCss } = require(
  path.join(REPO_ROOT, 'scripts/lib/print/validate-print-css.cjs'),
);

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJsonRel(rel) {
  return JSON.parse(read(rel));
}
function readBaseline(name) {
  return fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');
}

// ── 1. Print validator golden matches (determinism + rule-output-shape lock) ────

test('34.3-04: print validator golden matches (good passes, bad fails — output shape frozen)', () => {
  const golden = JSON.parse(readBaseline('validator-golden.json'));
  assert.ok(golden && golden.good && golden.bad, 'validator-golden.json must record { good, bad }');

  // The good fixture lives alongside the golden; the bad input is the shipped
  // 34.3-01 test fixture the golden was recorded against (hermetic — both tracked).
  const goodCss = readBaseline('print-good.css');
  const badCss = read('test/fixtures/print/bad-no-page.css');

  const freshGood = validatePrintCss(goodCss);
  const freshBad = validatePrintCss(badCss);

  // Regression lock: a change to the validator or to the fixture trips this.
  assert.deepEqual(
    freshGood,
    golden.good,
    'validatePrintCss(print-good) drifted from validator-golden.good. If the validator changed ' +
      'intentionally, re-record the golden (run validatePrintCss -> test/fixtures/baselines/phase-34-3/validator-golden.json).',
  );
  assert.deepEqual(
    freshBad,
    golden.bad,
    'validatePrintCss(bad-no-page) drifted from validator-golden.bad. Re-record the golden if intentional.',
  );

  // The golden must encode a PASS and a FAIL so the shape (ok + violations[])
  // is frozen on both branches.
  assert.equal(golden.good.ok, true, 'validator-golden.good must be a passing verdict (ok:true)');
  assert.deepEqual(golden.good.violations, [], 'validator-golden.good must have no violations');
  assert.equal(golden.bad.ok, false, 'validator-golden.bad must be a failing verdict (ok:false)');
  assert.ok(
    Array.isArray(golden.bad.violations) && golden.bad.violations.length > 0,
    'validator-golden.bad must record at least one violation { rule, detail }',
  );
  for (const v of golden.bad.violations) {
    assert.ok(
      typeof v.rule === 'string' && typeof v.detail === 'string',
      'each recorded violation must carry a { rule, detail } string pair',
    );
  }

  // Determinism: the validator is a pure function of its input.
  assert.deepEqual(validatePrintCss(goodCss), freshGood, 'validatePrintCss must be deterministic on the good input');
  assert.deepEqual(validatePrintCss(badCss), freshBad, 'validatePrintCss must be deterministic on the bad input');
});

// ── 2. 6-manifest version lockstep (version-agnostic equality) ──────────────────

test('34.3-04: 6-manifest version lockstep (package + claude plugin + marketplace x2 + cursor + codex + lock)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  assert.match(pkgVersion, /^\d+\.\d+\.\d+$/, 'package.json version looks like semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkgVersion, `${f} version != package.json version`);
  }
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkgVersion, 'marketplace metadata.version != package version');
  assert.ok(mp.plugins && mp.plugins[0], 'marketplace plugins[0] exists');
  assert.equal(mp.plugins[0].version, pkgVersion, 'marketplace plugins[0].version != package version');
  const lock = readJsonRel('package-lock.json');
  assert.equal(lock.version, pkgVersion, 'package-lock.json root version != package version');
  if (lock.packages && lock.packages['']) {
    assert.equal(lock.packages[''].version, pkgVersion, 'package-lock.json packages."" version != package version');
  }
});

// ── 3. phase-34-3 manifests-version baseline == live == 1.34.3 ──────────────────

test('34.3-04: phase-34-3/manifests-version.txt baseline == 1.34.3 == live package version', () => {
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  const live = readJsonRel('package.json').version;
  assert.equal(baseline, '1.34.3', 'phase-34-3 manifests-version.txt must be 1.34.3 (D-09 forward-prop target)');
  assert.equal(baseline, live, `phase-34-3 manifests-version.txt (${baseline}) != package.json version (${live})`);
});

// ── 4. CHANGELOG [1.34.3] at the top ────────────────────────────────────────────

test('34.3-04: CHANGELOG has a [1.34.3] block at the top (D-01)', () => {
  const cl = read('CHANGELOG.md');
  assert.match(cl, /## \[1\.34\.3\]/, 'CHANGELOG must carry a ## [1.34.3] entry (D-01)');
  const firstHeading = cl.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(firstHeading, 'CHANGELOG has at least one release heading');
  assert.equal(firstHeading[1], '1.34.3', 'the top-most release heading must be [1.34.3]');
});
