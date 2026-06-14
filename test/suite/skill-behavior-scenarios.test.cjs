// test/suite/skill-behavior-scenarios.test.cjs — Plan 33-03: pressure-scenario
// manifests + synthetic RED baselines conformance.
//
// Asserts the 8 pressure-scenario manifests at test/suite/skill-behavior/scenarios/
// (brief/explore/plan/design/verify/discuss/audit/using-gdd) are present and
// schema-valid against the 33-02 schema (reference/schemas/pressure-scenario.schema.json),
// that each manifest's `pressures` equals the chosen enum value(s) for that scenario
// per ROADMAP SC#3 (urgency->time, efficiency-temptation->scope-minimization), that
// each `expected_compliance`/`expected_violations` regex SOURCE compiles via the same
// `new RegExp(source)` the 33-01 runner uses, that each `target_skill` maps to a real
// skills/<name>/SKILL.md, that the 8 synthetic RED baselines at
// test/fixtures/skill-behavior-baseline/ are present, and that each baseline carries
// >=1 quotable rationalization line.
//
// Every test is prefixed `33-03:`. No test requires a live LLM (D-06). Validation
// reuses Ajv (a repo dep — scripts/validate-schemas.ts relies on it) when resolvable,
// else falls back to a structural required-key + pressures-enum-membership check
// (the 33-02 idiom).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCHEMA_PATH = join(REPO_ROOT, 'reference', 'schemas', 'pressure-scenario.schema.json');
const SCENARIOS_DIR = join(REPO_ROOT, 'test', 'suite', 'skill-behavior', 'scenarios');
const BASELINE_DIR = join(REPO_ROOT, 'test', 'fixtures', 'skill-behavior-baseline');
const SKILLS_DIR = join(REPO_ROOT, 'skills');

// The 8 scenarios (keys = manifest basenames = baseline basenames).
const SCENARIOS = [
  'brief',
  'explore',
  'plan',
  'design',
  'verify',
  'discuss',
  'audit',
  'using-gdd',
];

// ROADMAP SC#3 pressures, mapped onto the 5-value schema enum
// (urgency->time, efficiency-temptation->scope-minimization). The manifests in
// Task 1 MUST match this map exactly.
const EXPECTED_PRESSURES = {
  brief: ['time'],
  explore: ['authority', 'sunk-cost'],
  plan: ['scope-minimization'],
  design: ['time'],
  verify: ['sunk-cost'],
  discuss: ['scope-minimization'],
  audit: ['sunk-cost'],
  'using-gdd': ['scope-minimization'],
};

const REQUIRED_KEYS = [
  'name',
  'target_skill',
  'pressures',
  'setup_prompt',
  'expected_compliance',
  'expected_violations',
];
const PRESSURE_ENUM = ['time', 'sunk-cost', 'authority', 'exhaustion', 'scope-minimization'];

// A quotable "agent excuse" line — the RED rationalization the skill counters.
const EXCUSE_RE = /skip|jump|already|simple|too small|no need/i;

const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

/**
 * Build a manifest validator. Prefer Ajv (the 33-02 idiom); if Ajv is not
 * resolvable, fall back to a structural required-key + pressures-enum check so
 * the test stays runnable with no extra dep. Returns { validate(manifest)->bool, errors }.
 */
function makeValidator() {
  let Ajv;
  try {
    Ajv = require('ajv');
  } catch {
    Ajv = null;
  }
  if (Ajv) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const compiled = ajv.compile(SCHEMA);
    return {
      mode: 'ajv',
      validate: (m) => compiled(m),
      get errors() {
        return compiled.errors;
      },
    };
  }
  // Structural fallback.
  let lastErrors = null;
  return {
    mode: 'structural',
    validate(m) {
      lastErrors = [];
      if (!m || typeof m !== 'object') {
        lastErrors.push('manifest is not an object');
        return false;
      }
      for (const k of REQUIRED_KEYS) {
        if (!(k in m)) lastErrors.push(`missing required key: ${k}`);
      }
      if (!Array.isArray(m.pressures) || m.pressures.length < 1) {
        lastErrors.push('pressures must be a non-empty array');
      } else {
        for (const p of m.pressures) {
          if (!PRESSURE_ENUM.includes(p)) lastErrors.push(`bad pressures enum value: ${p}`);
        }
      }
      if (!Array.isArray(m.expected_compliance) || m.expected_compliance.length < 1) {
        lastErrors.push('expected_compliance must be a non-empty array');
      }
      if (!Array.isArray(m.expected_violations)) {
        lastErrors.push('expected_violations must be an array');
      }
      return lastErrors.length === 0;
    },
    get errors() {
      return lastErrors;
    },
  };
}

function loadManifest(scenario) {
  return JSON.parse(readFileSync(join(SCENARIOS_DIR, `${scenario}.json`), 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. All 8 scenario manifests present + schema-valid (reuse the 33-02 schema)
// ---------------------------------------------------------------------------
test('33-03: all 8 scenario manifests present + schema-valid', () => {
  // Exclude A/B variant manifests (e.g. using-hone-ab.json — a 33-04 artifact that
  // shares this directory) so this 33-03 count asserts the 8 CANONICAL scenarios,
  // not "this directory contains exactly 8 files".
  const files = readdirSync(SCENARIOS_DIR).filter(
    (f) => f.endsWith('.json') && !f.endsWith('-ab.json'),
  );
  assert.equal(files.length, SCENARIOS.length, 'expected exactly 8 canonical scenario manifests');

  const v = makeValidator();
  for (const scenario of SCENARIOS) {
    const file = `${scenario}.json`;
    assert.ok(files.includes(file), `missing scenario manifest: ${file}`);
    const manifest = loadManifest(scenario);
    const ok = v.validate(manifest);
    assert.ok(
      ok,
      `manifest ${file} must validate (${v.mode}) — errors: ${JSON.stringify(v.errors)}`,
    );
    assert.ok(
      Array.isArray(manifest.expected_compliance) && manifest.expected_compliance.length >= 1,
      `manifest ${file} must carry a non-empty expected_compliance[]`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Each scenario's pressures match SC#3 (the chosen enum mapping)
// ---------------------------------------------------------------------------
test('33-03: each scenario pressures match SC#3', () => {
  for (const scenario of SCENARIOS) {
    const manifest = loadManifest(scenario);
    const expected = EXPECTED_PRESSURES[scenario];
    assert.deepEqual(
      manifest.pressures,
      expected,
      `${scenario}.json pressures must equal ${JSON.stringify(expected)} (SC#3, enum-mapped) — got ${JSON.stringify(manifest.pressures)}`,
    );
    for (const p of manifest.pressures) {
      assert.ok(PRESSURE_ENUM.includes(p), `${scenario}.json pressure "${p}" not in the 5-value enum`);
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Every expected_compliance/expected_violations regex SOURCE compiles
//    (the 33-01 runner compiles each with new RegExp(source) — inline (?i)
//    flags are NOT supported, so this guards against runner-time throws).
// ---------------------------------------------------------------------------
test('33-03: every manifest regex source compiles via new RegExp', () => {
  for (const scenario of SCENARIOS) {
    const manifest = loadManifest(scenario);
    const sources = [
      ...(manifest.expected_compliance || []),
      ...(manifest.expected_violations || []),
    ];
    for (const src of sources) {
      assert.doesNotThrow(
        () => new RegExp(String(src)),
        `${scenario}.json regex source ${JSON.stringify(src)} must compile via new RegExp (no inline (?i))`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Each target_skill maps to a real skills/<name>/SKILL.md
// ---------------------------------------------------------------------------
test('33-03: each target_skill maps to a real skills/<name>/SKILL.md', () => {
  for (const scenario of SCENARIOS) {
    const manifest = loadManifest(scenario);
    const skillPath = join(SKILLS_DIR, manifest.target_skill, 'SKILL.md');
    assert.ok(
      existsSync(skillPath),
      `${scenario}.json target_skill "${manifest.target_skill}" must resolve to ${skillPath}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 5. All 8 RED baselines present
// ---------------------------------------------------------------------------
test('33-03: all 8 RED baselines present', () => {
  const files = readdirSync(BASELINE_DIR).filter((f) => f.endsWith('.md'));
  for (const scenario of SCENARIOS) {
    assert.ok(
      files.includes(`${scenario}.md`),
      `missing RED baseline: ${scenario}.md`,
    );
  }
  assert.ok(files.length >= SCENARIOS.length, 'expected at least 8 RED baseline files');
});

// ---------------------------------------------------------------------------
// 6. Each RED baseline carries >=1 quotable rationalization line
// ---------------------------------------------------------------------------
test('33-03: each RED baseline has >=1 rationalization line', () => {
  for (const scenario of SCENARIOS) {
    const text = readFileSync(join(BASELINE_DIR, `${scenario}.md`), 'utf8');
    assert.match(
      text,
      EXCUSE_RE,
      `${scenario}.md must contain a quotable rationalization line matching ${EXCUSE_RE}`,
    );
  }
});
