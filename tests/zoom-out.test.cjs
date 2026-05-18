'use strict';
/**
 * zoom-out skill tests (Phase 28.5-10)
 *
 * Validates the /gdd:zoom-out micro-skill (MIT port from mattpocock/skills):
 *   - skill file exists at skills/zoom-out/SKILL.md
 *   - frontmatter has required fields (name, description)
 *   - disable-model-invocation: true (D-09 whitelist member; user-invoked-only)
 *   - validator accepts the skill (clean, ≤99 lines)
 *   - body cross-references CONTEXT.md and architecture-vocabulary
 *   - MIT attribution per D-03
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'zoom-out', 'SKILL.md');
const VALIDATOR_PATH = path.join(REPO_ROOT, 'scripts', 'validate-skill-length.cjs');

test('zoom-out skill file exists', () => {
  assert.ok(
    fs.existsSync(SKILL_PATH),
    `expected skill file at ${SKILL_PATH}`
  );
});

test('zoom-out has correct frontmatter', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(content, /^---\r?\n/, 'must start with frontmatter');
  assert.match(content, /^name: zoom-out$/m, 'must have name: zoom-out');
  assert.match(content, /^description:/m, 'must have description field');
});

test('zoom-out has disable-model-invocation: true (D-09 whitelist)', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(
    content,
    /^disable-model-invocation: true$/m,
    'disable-model-invocation: true is REQUIRED — zoom-out is on D-09 whitelist; router must NOT auto-fire'
  );
});

test('zoom-out validates clean (whitelist applies, ≤99 lines)', () => {
  const { validateSkill } = require(VALIDATOR_PATH);
  const result = validateSkill('zoom-out', SKILL_PATH, { strict: false });
  assert.equal(
    result.errors.length, 0,
    `validator errors: ${JSON.stringify(result.errors)}`
  );
  assert.equal(
    result.warnings.length, 0,
    `validator warnings: ${JSON.stringify(result.warnings)}`
  );
  assert.equal(result.level, 'clean', `expected level=clean, got ${result.level}`);
  assert.ok(result.lines <= 99, `skill must be ≤99 lines (got ${result.lines})`);
});

test('zoom-out body references CONTEXT.md', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(
    content,
    /CONTEXT\.md/,
    'body must reference CONTEXT.md (the project domain glossary)'
  );
});

test('zoom-out body references architecture-vocabulary', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(
    content,
    /architecture-vocabulary/,
    'body must reference architecture-vocabulary.md (seam terminology source)'
  );
});

test('zoom-out has MIT attribution (D-03)', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(
    content,
    /Source: mattpocock\/skills \(MIT\)/,
    'MIT attribution line is REQUIRED per D-03'
  );
  assert.match(
    content,
    /NOTICE/,
    'attribution must reference the NOTICE file for full attribution block'
  );
});
