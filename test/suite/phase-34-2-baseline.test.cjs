'use strict';

// Phase 34.2 — Non-Web Output Layer: Email regression baseline (SC#10-email,
// D-01, D-05, D-08, D-10).
//
// Freezes the Wave A–B email deliverable (the email-constraint catalogue + the
// static email-HTML validator + the email-executor + the litmus connection) as
// a single release artifact so future drift cannot silently regress the v1.34.2
// contract. Asserts (every test tagged `34.2-04:`):
//   1. Email validator golden matches — validateEmailHtml() over the recorded
//      email-good fixture deep-equals validator-golden.good (ok:true), AND over
//      the recorded bad fixture deep-equals validator-golden.bad (ok:false) —
//      the determinism + regression lock on the validator's rule-output SHAPE.
//   2. 6-manifest version lockstep — package.json == .claude-plugin/plugin.json
//      == marketplace.metadata.version == marketplace.plugins[0].version ==
//      .cursor-plugin == .codex-plugin == package-lock (root + packages."").
//   3. phase-34-2/manifests-version.txt == live package version == 1.34.2.
//   4. CHANGELOG has a [1.34.2] block at the top.
//
// Hermetic (D-10): file reads + require the static validator + the recorded
// fixtures. NO network, NO mjml runtime, NO Litmus, NO child_process. The
// validator is a pure string→verdict function; the email-executor/LLM produces
// the real email. Runs in the default `npm test`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-34-2');

const { validateEmailHtml } = require(
  path.join(REPO_ROOT, 'scripts/lib/email/validate-email-html.cjs'),
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

// ── 1. Email validator golden matches (determinism + rule-output-shape lock) ────

test('34.2-04: email validator golden matches (good passes, bad fails — output shape frozen)', () => {
  const golden = JSON.parse(readBaseline('validator-golden.json'));
  assert.ok(golden && golden.good && golden.bad, 'validator-golden.json must record { good, bad }');

  // The good fixture lives alongside the golden; the bad input is the shipped
  // test fixture the golden was recorded against (hermetic — both are tracked).
  const goodHtml = readBaseline('email-good.html');
  const badHtml = read('test/fixtures/email/bad-flexbox.html');

  const freshGood = validateEmailHtml(goodHtml);
  const freshBad = validateEmailHtml(badHtml);

  // Regression lock: a change to the validator or to the fixture trips this.
  assert.deepEqual(
    freshGood,
    golden.good,
    'validateEmailHtml(email-good) drifted from validator-golden.good. If the validator changed ' +
      'intentionally, re-record the golden (run validateEmailHtml -> test/fixtures/baselines/phase-34-2/validator-golden.json).',
  );
  assert.deepEqual(
    freshBad,
    golden.bad,
    'validateEmailHtml(bad-flexbox) drifted from validator-golden.bad. Re-record the golden if intentional.',
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
  assert.deepEqual(validateEmailHtml(goodHtml), freshGood, 'validateEmailHtml must be deterministic on the good input');
  assert.deepEqual(validateEmailHtml(badHtml), freshBad, 'validateEmailHtml must be deterministic on the bad input');
});

// ── 2. 6-manifest version lockstep (version-agnostic equality) ──────────────────

test('34.2-04: 6-manifest version lockstep (package + claude plugin + marketplace x2 + cursor + codex + lock)', () => {
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

// ── 3. phase-34-2 manifests-version baseline == live (version-agnostic) ─────────
// The phase-34-2 baseline is a D-09 FORWARD-PROP target: each later closeout
// bumps it to the new live version (Phase 34.3 forward-propped it 1.34.2 ->
// 1.34.3 as the prior closeout's own baseline now trailing live — the exact
// way Phase 34.2 forward-propped phase-34-1), so this asserts == live (the same
// phase-32/33/33.5/33.6/34-1 idiom — a hard-coded literal here is a latent
// defect that breaks on every subsequent decimal release) and >= 1.34.2 (it
// must never regress below the version this baseline froze).

test('34.2-04: phase-34-2/manifests-version.txt baseline == live package version (>= 1.34.2)', () => {
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  const live = readJsonRel('package.json').version;
  assert.equal(baseline, live, `phase-34-2 manifests-version.txt (${baseline}) != package.json version (${live})`);
  const [maj, min, pat] = baseline.split('.').map(Number);
  const gteBaseline =
    maj > 1 || (maj === 1 && min > 34) || (maj === 1 && min === 34 && pat >= 2);
  assert.ok(gteBaseline, `phase-34-2 manifests-version.txt (${baseline}) must be >= 1.34.2 (D-09 forward-prop target; must not regress)`);
});

// ── 4. CHANGELOG [1.34.2] block present + not regressed below 1.34.2 ─────────────
// Version-agnostic (the phase-32/33/33.5/33.6/34-1 idiom): a later decimal
// release (e.g. 1.34.3 from Phase 34.3) legitimately sits ABOVE [1.34.2], so
// this asserts the [1.34.2] entry still EXISTS (the 34.2 regression lock) and
// that the top-most heading has not REGRESSED below 1.34.2 — not that 1.34.2
// is top.

test('34.2-04: CHANGELOG has a [1.34.2] block and the top heading has not regressed (D-01)', () => {
  const cl = read('CHANGELOG.md');
  assert.match(cl, /## \[1\.34\.2\]/, 'CHANGELOG must carry a ## [1.34.2] entry (D-01)');
  const firstHeading = cl.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(firstHeading, 'CHANGELOG has at least one release heading');
  const [maj, min, pat] = firstHeading[1].split('.').map(Number);
  const topGteBaseline =
    maj > 1 ||
    (maj === 1 && min > 34) ||
    (maj === 1 && min === 34 && pat >= 2);
  assert.ok(
    topGteBaseline,
    `the top-most CHANGELOG release heading (${firstHeading[1]}) must be >= 1.34.2 (must not regress below the 34.2 baseline)`,
  );
});
