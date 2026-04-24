'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

/**
 * Extract the top-level JSON keys from the fenced ```json block under a
 * `### <sliceName>` heading in reference/intel-schema.md.
 * Returns an array of keys or null if the heading / block / JSON is unparseable.
 */
function extractSchemaKeys(intelSchemaContent, sliceName) {
  // Escape dots in sliceName for the regex
  const safeName = sliceName.replace(/\./g, '\\.');
  const section = intelSchemaContent.split(new RegExp(`###\\s+${safeName}`, 'i'))[1];
  if (!section) return null;
  const jsonMatch = section.match(/```json\n([\s\S]*?)\n```/);
  if (!jsonMatch) return null;
  try {
    return Object.keys(JSON.parse(jsonMatch[1]));
  } catch {
    return null;
  }
}

/**
 * Mapper coverage table. Each mapper agent writes a *.md file to .design/map/
 * in the real pipeline, but the intel-schema.md documents the JSON shape each
 * slice conforms to. The test validates the *fixture* JSON files under
 * test-fixture/mapper-outputs/ against the schema slice where it exists, or
 * falls back to a declared top-level-key check where the intel-schema.md does
 * not document the slice (a11y, motion, hierarchy are gdd-specific extensions
 * not yet in the intel-schema.md contract — the fixture is the ground truth).
 */
const MAPPERS = [
  {
    name: 'token-mapper',
    fixture: 'tokens.json',
    slice: 'tokens.json',
    topLevelKey: 'tokens',
  },
  {
    name: 'component-taxonomy-mapper',
    fixture: 'components.json',
    slice: 'components.json',
    topLevelKey: 'components',
  },
  {
    name: 'a11y-mapper',
    fixture: 'a11y.json',
    slice: 'a11y.json',
    topLevelKey: 'a11y',
  },
  {
    name: 'motion-mapper',
    fixture: 'motion.json',
    slice: 'motion.json',
    topLevelKey: 'motion',
  },
  {
    name: 'visual-hierarchy-mapper',
    fixture: 'hierarchy.json',
    slice: 'hierarchy.json',
    topLevelKey: 'hierarchy',
  },
];

const intelSchemaPath = path.join(REPO_ROOT, 'reference', 'intel-schema.md');
const intelSchemaContent = fs.readFileSync(intelSchemaPath, 'utf8');

test('mapper-schema: reference/intel-schema.md exists and is readable', () => {
  assert.ok(fs.existsSync(intelSchemaPath), 'reference/intel-schema.md must exist');
  assert.ok(intelSchemaContent.length > 0, 'intel-schema.md must not be empty');
});

for (const mapper of MAPPERS) {
  test(`mapper-schema: ${mapper.name} fixture exists and parses as valid JSON`, () => {
    const fixturePath = path.join(REPO_ROOT, 'test-fixture', 'mapper-outputs', mapper.fixture);
    assert.ok(
      fs.existsSync(fixturePath),
      `test-fixture/mapper-outputs/${mapper.fixture} must exist as schema ground truth for ${mapper.name}`
    );
    const raw = fs.readFileSync(fixturePath, 'utf8');
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(raw); },
      `${mapper.fixture} must be valid JSON`);
    assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed),
      `${mapper.fixture} root must be a JSON object`);
  });

  test(`mapper-schema: ${mapper.name} fixture declares required top-level key "${mapper.topLevelKey}"`, () => {
    const fixturePath = path.join(REPO_ROOT, 'test-fixture', 'mapper-outputs', mapper.fixture);
    const parsed = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const fixtureKeys = Object.keys(parsed);
    assert.ok(
      fixtureKeys.includes(mapper.topLevelKey),
      `${mapper.fixture} must have top-level key "${mapper.topLevelKey}" (has: ${fixtureKeys.join(', ')})`
    );
    assert.ok(
      Array.isArray(parsed[mapper.topLevelKey]),
      `${mapper.fixture}: "${mapper.topLevelKey}" must be an array`
    );

    // Additionally: if reference/intel-schema.md documents this slice, assert
    // that every schema-required top-level key is present in the fixture. This
    // only catches MISSING keys — mappers may legitimately add project-specific
    // keys, which is allowed.
    const schemaKeys = extractSchemaKeys(intelSchemaContent, mapper.slice);
    if (schemaKeys) {
      for (const k of schemaKeys) {
        assert.ok(
          fixtureKeys.includes(k),
          `${mapper.fixture}: schema key "${k}" (from intel-schema.md ### ${mapper.slice}) is missing (has: ${fixtureKeys.join(', ')})`
        );
      }
    }
  });
}

test('mapper-schema: extractSchemaKeys returns null for unknown slice names', () => {
  const result = extractSchemaKeys(intelSchemaContent, 'does-not-exist.json');
  assert.equal(result, null, 'extractSchemaKeys must return null for unknown slice');
});

test('mapper-schema: extractSchemaKeys returns keys for known slice (tokens.json)', () => {
  const result = extractSchemaKeys(intelSchemaContent, 'tokens.json');
  assert.ok(Array.isArray(result), 'result must be an array for known slice');
  assert.ok(result.includes('tokens'),
    `expected 'tokens' in extracted keys; got: ${result ? result.join(', ') : 'null'}`);
});
