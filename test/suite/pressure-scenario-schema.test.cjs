// test/suite/pressure-scenario-schema.test.cjs — Plan 33-02: pressure-scenario schema conformance
//
// Proves reference/schemas/pressure-scenario.schema.json is a valid Draft-07
// schema with the 6 required keys + the 5-value `pressures` enum, that the 3
// sample manifests at test/fixtures/skill-behavior/samples/ conform, that an
// invalid manifest (missing required field / bad pressures enum) is rejected,
// and that the schema is registered in scripts/validate-schemas.ts PAIRS.
//
// Every test is prefixed `33-02:`. Uses Ajv (a repo dep — scripts/validate-schemas.ts
// already relies on it). The schema is Draft-07; Ajv 8 auto-detects the dialect
// from $schema, so no extra meta-schema wiring is needed.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

let Ajv;
try {
  Ajv = require('ajv');
} catch (err) {
  throw new Error('ajv missing — scripts/validate-schemas.ts already imports it; run `npm install`.');
}

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCHEMA_PATH = join(REPO_ROOT, 'reference', 'schemas', 'pressure-scenario.schema.json');
const SAMPLES_DIR = join(REPO_ROOT, 'test', 'fixtures', 'skill-behavior', 'samples');
const VALIDATE_SCHEMAS_PATH = join(REPO_ROOT, 'scripts', 'validate-schemas.ts');

const REQUIRED_KEYS = [
  'name',
  'target_skill',
  'pressures',
  'setup_prompt',
  'expected_compliance',
  'expected_violations',
];
const PRESSURE_ENUM = ['time', 'sunk-cost', 'authority', 'exhaustion', 'scope-minimization'];

const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

/**
 * Compile the pressure-scenario schema. strict:false because Ajv 8.x emits
 * strict-mode warnings for some valid Draft-07 constructs; allErrors:true so
 * every violation is surfaced for diagnosable failures.
 */
function makeValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(SCHEMA);
}

function loadSample(file) {
  return JSON.parse(readFileSync(join(SAMPLES_DIR, file), 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. Schema is a valid Draft-07 schema with the 6 required keys + pressures enum
// ---------------------------------------------------------------------------
test('33-02: schema is valid Draft-07 with 6 required keys + pressures enum', () => {
  assert.match(
    String(SCHEMA.$schema || ''),
    /draft-07/,
    '$schema must declare Draft-07',
  );
  assert.equal(SCHEMA.type, 'object', 'schema type must be object');
  assert.equal(
    SCHEMA.additionalProperties,
    false,
    'additionalProperties must be false to keep manifests tight',
  );

  // Required keys: exactly the 6 from ROADMAP SC#2.
  const required = SCHEMA.required || [];
  for (const key of REQUIRED_KEYS) {
    assert.ok(required.includes(key), `required must include "${key}"`);
  }
  assert.equal(required.length, REQUIRED_KEYS.length, 'required must have exactly 6 keys');

  // pressures enum: exactly the 5 sanctioned values.
  const enumValues = ((SCHEMA.properties.pressures.items || {}).enum) || [];
  for (const value of PRESSURE_ENUM) {
    assert.ok(enumValues.includes(value), `pressures enum must include "${value}"`);
  }
  assert.equal(enumValues.length, PRESSURE_ENUM.length, 'pressures enum must have exactly 5 values');
  assert.equal(SCHEMA.properties.pressures.minItems, 1, 'pressures must require minItems 1');

  // The 4 optional A/B keys (33-04) must be present as properties so the A/B
  // manifest validates with additionalProperties:false.
  for (const optKey of ['description', 'variant', 'variants', 'body_probe']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(SCHEMA.properties, optKey),
      `optional property "${optKey}" must be declared (33-04 A/B manifest)`,
    );
    assert.ok(!required.includes(optKey), `"${optKey}" must stay optional`);
  }

  // Compiling proves it is a usable Draft-07 schema.
  assert.doesNotThrow(() => makeValidator(), 'schema must compile under Ajv');
});

// ---------------------------------------------------------------------------
// 2. The 3 sample manifests validate
// ---------------------------------------------------------------------------
test('33-02: 3 sample manifests validate', () => {
  const sampleFiles = readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.json'));
  assert.equal(sampleFiles.length, 3, 'expected exactly 3 sample manifests');

  const validate = makeValidator();
  const coveredPressures = new Set();

  for (const file of sampleFiles) {
    const manifest = loadSample(file);
    const ok = validate(manifest);
    assert.ok(
      ok,
      `sample ${file} must validate — errors: ${JSON.stringify(validate.errors)}`,
    );
    assert.ok(
      Array.isArray(manifest.expected_compliance) && manifest.expected_compliance.length >= 1,
      `sample ${file} must carry a non-empty expected_compliance[]`,
    );
    for (const p of manifest.pressures) coveredPressures.add(p);
  }

  // Collectively the samples must exercise >=3 distinct pressure-enum values.
  assert.ok(
    coveredPressures.size >= 3,
    `samples must cover >=3 distinct pressures, got ${[...coveredPressures].join(',')}`,
  );
  for (const expected of ['time', 'authority', 'scope-minimization']) {
    assert.ok(coveredPressures.has(expected), `samples must collectively cover "${expected}"`);
  }
});

// ---------------------------------------------------------------------------
// 3. A manifest missing a required field is rejected
// ---------------------------------------------------------------------------
test('33-02: missing required field is rejected', () => {
  const validate = makeValidator();
  const manifest = loadSample('sample-pass.json');
  delete manifest.expected_compliance;
  const ok = validate(manifest);
  assert.equal(ok, false, 'manifest without expected_compliance must be rejected');
});

// ---------------------------------------------------------------------------
// 4. A manifest with a bad pressures enum value is rejected
// ---------------------------------------------------------------------------
test('33-02: bad pressures enum value is rejected', () => {
  const validate = makeValidator();
  const manifest = loadSample('sample-pass.json');
  manifest.pressures = ['deadline'];
  const ok = validate(manifest);
  assert.equal(ok, false, 'manifest with pressures:["deadline"] must be rejected');
});

// ---------------------------------------------------------------------------
// 5. The pressure-scenario pair is registered in validate-schemas.ts PAIRS
//
// validate-schemas.ts runs main() (which calls process.exit) at module load,
// so we cannot require() it here. The plan sanctions a source-read fallback:
// assert the registration entry is present in the PAIRS array source.
// ---------------------------------------------------------------------------
test('33-02: pressure-scenario is registered in validate-schemas PAIRS', () => {
  const source = readFileSync(VALIDATE_SCHEMAS_PATH, 'utf8');
  assert.match(
    source,
    /name:\s*'pressure-scenario'/,
    "PAIRS must contain an entry named 'pressure-scenario'",
  );
  assert.match(
    source,
    /schema:\s*'reference\/schemas\/pressure-scenario\.schema\.json'/,
    'PAIRS entry must point at reference/schemas/pressure-scenario.schema.json',
  );
  // Compile-only (data:null) because scenarios are a directory (D-05). Assert the
  // entry's data:null sits in the same object as the schema path.
  const entryMatch = source.match(
    /name:\s*'pressure-scenario'[\s\S]{0,200}?data:\s*null[\s\S]{0,80}?required:\s*false/,
  );
  assert.ok(
    entryMatch,
    'pressure-scenario PAIRS entry must be compile-only (data: null, required: false)',
  );
});
