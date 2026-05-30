'use strict';

// tests/router-resolved-models.test.cjs — Phase 26 (Plan 26-09 closeout).
//
// Content-level assertions on skills/router/SKILL.md confirming the
// `resolved_models` field landed (D-07 / Plan 26-04) without breaking
// the prior-phase additive contracts (`complexity_class` from Phase 25,
// `model_tier_overrides` from earlier).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const ROUTER_PATH = path.join(REPO_ROOT, 'skills', 'router', 'SKILL.md');

function readSkill() {
  return fs.readFileSync(ROUTER_PATH, 'utf8');
}

test('router: SKILL.md exists', () => {
  assert.ok(fs.existsSync(ROUTER_PATH), 'skills/router/SKILL.md must exist');
});

test('router: resolved_models appears in the JSON example', () => {
  const skill = readSkill();
  // The JSON example carries the field as a key, which surfaces in the
  // doc as `"resolved_models":` followed by a brace. We accept either
  // direct or whitespace-tolerant forms.
  assert.match(
    skill,
    /"resolved_models"\s*:/,
    'JSON example must include a "resolved_models" key',
  );
});

test('router: resolved_models field has a docstring', () => {
  const skill = readSkill();
  // We expect a sentence-level mention — not just the JSON example —
  // explaining what `resolved_models` is. Look for `resolved_models`
  // outside a code-fence-like context (the field-doc paragraph).
  const occurrences = skill.match(/resolved_models/g) || [];
  assert.ok(
    occurrences.length >= 3,
    `resolved_models should appear ≥3 times (JSON example + field doc + schema table). Found ${occurrences.length}.`,
  );
});

test('router: Output schema versioning table includes resolved_models @ v1.26.0', () => {
  const skill = readSkill();
  // The schema table row for resolved_models lands at v1.26.0 / 26-04.
  // Assert the conjunction, not just the presence of the version string.
  assert.match(
    skill,
    /resolved_models[\s\S]*v1\.26\.0/,
    'Output schema versioning table must list resolved_models at v1.26.0',
  );
});

test('router: complexity_class (Phase 25) still mentioned — no regression', () => {
  const skill = readSkill();
  assert.match(
    skill,
    /complexity_class/,
    'complexity_class must still be documented (Phase 25 contract preserved)',
  );
});

test('router: model_tier_overrides (legacy) still mentioned — back-compat', () => {
  const skill = readSkill();
  assert.match(
    skill,
    /model_tier_overrides/,
    'model_tier_overrides must remain documented for back-compat (D-07 strict superset)',
  );
});
