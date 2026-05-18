'use strict';
/**
 * tests/phase-28.5-ci-integration.test.cjs — Phase 28.5-11 RED phase.
 *
 * Asserts the CI workflow at .github/workflows/ci.yml has been extended to
 * invoke scripts/validate-skill-length.cjs in the lint job per D-11/D-12.
 *
 * Behavior covered (per plan 28.5-11 Task 1):
 *   1. CI yaml references the validator script name.
 *   2. CI yaml uses the `--quiet` flag (suppresses per-skill noise).
 *   3. New step lives inside the `lint:` job (consistent with other lint steps).
 *   4. yaml is parseable (js-yaml load succeeds).
 *   5. New step does NOT use `continue-on-error: true` (block exit must fail).
 *   6. New step does NOT enable STRICT_DESCRIPTION (per D-02, off until Phase 33).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const REPO_ROOT = path.resolve(__dirname, '..');
const CI_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml');

function loadCiDoc() {
  return yaml.load(fs.readFileSync(CI_PATH, 'utf8'));
}

test('28.5-11 CI: yaml references validate-skill-length script', () => {
  const text = fs.readFileSync(CI_PATH, 'utf8');
  assert.match(text, /validate-skill-length/, 'ci.yml does not reference validate-skill-length');
});

test('28.5-11 CI: yaml uses --quiet flag on validator invocation', () => {
  const text = fs.readFileSync(CI_PATH, 'utf8');
  assert.match(text, /validate-skill-length\.cjs[^\n]*--quiet/, 'validator step missing --quiet flag');
});

test('28.5-11 CI: yaml is parseable (no syntax errors)', () => {
  const doc = loadCiDoc();
  assert.ok(doc, 'js-yaml.load returned falsy');
  assert.ok(doc.jobs, 'no jobs section');
  assert.ok(doc.jobs.lint, 'no lint job');
});

test('28.5-11 CI: validate-skill-length step is in the lint job', () => {
  const doc = loadCiDoc();
  const lintSteps = doc.jobs.lint.steps || [];
  const found = lintSteps.find(s => {
    if (typeof s.run === 'string' && /validate-skill-length/.test(s.run)) return true;
    if (typeof s.name === 'string' && /skill-authoring|skill-length/i.test(s.name)) return true;
    return false;
  });
  assert.ok(found, 'no step in lint job invokes validate-skill-length');
});

test('28.5-11 CI: new step has no continue-on-error: true', () => {
  const doc = loadCiDoc();
  const lintSteps = doc.jobs.lint.steps || [];
  const validatorStep = lintSteps.find(s =>
    (typeof s.run === 'string' && /validate-skill-length/.test(s.run)) ||
    (typeof s.name === 'string' && /skill-authoring|skill-length/i.test(s.name))
  );
  assert.ok(validatorStep, 'validator step not found');
  assert.notStrictEqual(
    validatorStep['continue-on-error'],
    true,
    'validator step must not use continue-on-error: true (blockers must fail build)'
  );
});

test('28.5-11 CI: validator step does not enable STRICT_DESCRIPTION (D-02)', () => {
  const doc = loadCiDoc();
  const lintSteps = doc.jobs.lint.steps || [];
  const validatorStep = lintSteps.find(s =>
    (typeof s.run === 'string' && /validate-skill-length/.test(s.run)) ||
    (typeof s.name === 'string' && /skill-authoring|skill-length/i.test(s.name))
  );
  assert.ok(validatorStep, 'validator step not found');
  // No STRICT_DESCRIPTION in env or shell — D-02 keeps strict-form regex OFF
  const env = validatorStep.env || {};
  assert.notStrictEqual(env.STRICT_DESCRIPTION, '1', 'STRICT_DESCRIPTION must remain unset per D-02');
  if (typeof validatorStep.run === 'string') {
    assert.doesNotMatch(
      validatorStep.run,
      /STRICT_DESCRIPTION\s*=\s*1/,
      'STRICT_DESCRIPTION=1 must not appear in run script per D-02'
    );
    assert.doesNotMatch(
      validatorStep.run,
      /--strict-description/,
      '--strict-description must not be passed per D-02'
    );
  }
});
