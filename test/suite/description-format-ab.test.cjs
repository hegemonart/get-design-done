// test/suite/description-format-ab.test.cjs — Plan 33-04: description-format A/B (SC#5)
//
// Structural (NO live LLM — D-06) assertions for the description-format A/B harness:
//   1. test/suite/skill-behavior/scenarios/using-hone-ab.json is present and
//      schema-valid against reference/schemas/pressure-scenario.schema.json
//      (reuses the Ajv idiom from test/suite/pressure-scenario-schema.test.cjs).
//   1b. every regex source in the A/B manifest compiles via `new RegExp(source)`
//       with no inline-flag group — the 33-01 runner's exact (flagless) compile
//       path (mirrors the guard in pressure-scenario-schema.test.cjs).
//   2. the A/B references BOTH description variants (trigger-only AND <what>-clause)
//      and carries a body-only probe marker.
//   3. the TRACKED evidence doc docs/research/description-format-ab.md is present
//      (under docs/, NOT .design/ which is gitignored — D-05) and contains a
//      Methodology heading + the 7/10 threshold (D-08) + the pending-keyed-run
//      status marker (D-02).
//
// Every test is prefixed `33-04:`. The empirical A/B run is the opt-in keyed
// follow-up (D-02 / 33-06); nothing here invokes a model.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

let Ajv;
try {
  Ajv = require('ajv');
} catch (err) {
  throw new Error('ajv missing — scripts/validate-schemas.ts already imports it; run `npm install`.');
}

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCHEMA_PATH = join(REPO_ROOT, 'reference', 'schemas', 'pressure-scenario.schema.json');
const AB_SCENARIO_PATH = join(
  REPO_ROOT,
  'test',
  'suite',
  'skill-behavior',
  'scenarios',
  'using-hone-ab.json',
);
const EVIDENCE_DOC_PATH = join(REPO_ROOT, 'docs', 'research', 'description-format-ab.md');
const GITIGNORED_DOC_PATH = join(REPO_ROOT, '.design', 'research', 'description-format-ab.md');

// The two description variants under A/B (verbatim from the using-gdd skill +
// superpowers' <what>-clause counterpart).
const TRIGGER_ONLY = 'Use when starting any GDD session — establishes how to find and apply GDD skills.';
const WHAT_CLAUSE = 'Bootstraps GDD skill discipline. Use when starting any GDD session.';

function makeValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  return ajv.compile(schema);
}

function loadAbScenario() {
  return JSON.parse(readFileSync(AB_SCENARIO_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. using-hone-ab scenario is present + schema-valid against the 33-02 schema
// ---------------------------------------------------------------------------
test('33-04: using-hone-ab scenario present + schema-valid', () => {
  assert.ok(
    existsSync(AB_SCENARIO_PATH),
    'test/suite/skill-behavior/scenarios/using-hone-ab.json must exist',
  );

  const manifest = loadAbScenario();
  const validate = makeValidator();
  const ok = validate(manifest);
  assert.ok(
    ok,
    `using-hone-ab.json must validate against pressure-scenario.schema.json — errors: ${JSON.stringify(validate.errors)}`,
  );

  // It targets using-gdd (the skill the A/B extends) and carries the base keys.
  assert.equal(manifest.target_skill, 'using-gdd', 'A/B scenario must target the using-gdd skill');
  assert.ok(
    Array.isArray(manifest.expected_compliance) && manifest.expected_compliance.length >= 1,
    'A/B scenario must carry a non-empty expected_compliance[] (the body-read signal)',
  );
  assert.ok(
    Array.isArray(manifest.expected_violations) && manifest.expected_violations.length >= 1,
    'A/B scenario must carry a non-empty expected_violations[] (the body-skip signal)',
  );
});

// ---------------------------------------------------------------------------
// 1b. Every regex source compiles via `new RegExp(src)` — the runner's exact
//     (flagless) compile path. A manifest can be schema-valid yet carry a regex
//     the runner cannot compile (e.g. inline `(?i)`, which JS rejects). Mirrors
//     the guard in pressure-scenario-schema.test.cjs.
// ---------------------------------------------------------------------------
test('33-04: every A/B regex source compiles via new RegExp (runner compile path)', () => {
  const manifest = loadAbScenario();
  const sources = [
    ...(manifest.expected_compliance || []),
    ...(manifest.expected_violations || []),
  ];
  assert.ok(sources.length >= 1, 'A/B scenario must carry at least one regex source');

  for (const src of sources) {
    assert.doesNotThrow(
      () => new RegExp(src),
      `regex source ${JSON.stringify(src)} must compile via new RegExp(source) — ` +
        'the 33-01 runner uses exactly this (flagless) path. Inline (?i) is unsupported; use [Aa]-style classes.',
    );
    assert.ok(
      !/\(\?[a-z]+\)/.test(src),
      `regex source ${JSON.stringify(src)} contains an inline-flag group — ` +
        'unsupported by JS new RegExp(); use character classes for case-tolerance.',
    );
  }
});

// ---------------------------------------------------------------------------
// 2. The A/B references BOTH description variants + a body-only probe marker
// ---------------------------------------------------------------------------
test('33-04: A/B references both description variants + a body-only probe', () => {
  const manifest = loadAbScenario();
  const blob = JSON.stringify(manifest);

  assert.ok(
    blob.includes(TRIGGER_ONLY),
    'A/B scenario must include the trigger-only description variant verbatim',
  );
  assert.ok(
    blob.includes(WHAT_CLAUSE),
    'A/B scenario must include the <what>-clause description variant verbatim',
  );

  // The single-manifest-with-variants shape (option i): an optional variants[]
  // array carrying both labelled descriptions.
  assert.ok(Array.isArray(manifest.variants), 'A/B scenario must use the optional variants[] array');
  assert.equal(manifest.variants.length, 2, 'A/B must carry exactly two description variants');
  const variantDescs = manifest.variants.map((v) => v.description);
  assert.ok(variantDescs.includes(TRIGGER_ONLY), 'variants[] must contain the trigger-only description');
  assert.ok(variantDescs.includes(WHAT_CLAUSE), 'variants[] must contain the <what>-clause description');

  // A body-only probe marker: the optional body_probe key OR a setup_prompt that
  // asks for the body-only `## Skill priority order` content.
  const probe = `${manifest.body_probe || ''} ${manifest.setup_prompt || ''}`;
  assert.match(
    probe,
    /priority order/i,
    'A/B must carry a body-only probe (the using-gdd body `## Skill priority order` section)',
  );
});

// ---------------------------------------------------------------------------
// 3. The TRACKED evidence doc is present (docs/, NOT .design/) with the required
//    sections: Methodology heading + 7/10 threshold + pending-keyed-run status.
// ---------------------------------------------------------------------------
test('33-04: evidence doc present with methodology + 7/10 threshold + pending-keyed-run status', () => {
  assert.ok(
    existsSync(EVIDENCE_DOC_PATH),
    'docs/research/description-format-ab.md must exist (TRACKED — D-05)',
  );
  // Belt-and-suspenders: the doc must NOT live under the gitignored .design/ path.
  assert.ok(
    !existsSync(GITIGNORED_DOC_PATH),
    'evidence doc must NOT live under .design/research/ (gitignored — would never ship; D-05)',
  );

  const doc = readFileSync(EVIDENCE_DOC_PATH, 'utf8');
  assert.match(doc, /##\s*Methodology/i, 'evidence doc must contain a ## Methodology heading');
  assert.match(
    doc,
    /7\s*\/\s*10|7 of 10/,
    'evidence doc must record the 7/10 threshold (D-08)',
  );
  assert.match(
    doc,
    /pending keyed run/i,
    'evidence doc must carry the `pending keyed run` status marker (D-02)',
  );
  // The doc states it does NOT change Phase 28.5's validator (evidence only).
  assert.match(
    doc,
    /28\.5/,
    'evidence doc must reference Phase 28.5 (the validator this evidence will later inform)',
  );
});
