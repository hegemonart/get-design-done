'use strict';
/**
 * tests/context-md-maintenance.test.cjs
 *
 * Phase 28.5 plan 08 — assert that skills/discuss/SKILL.md and skills/brief/SKILL.md
 * carry the inline CONTEXT.md write trigger + ADR pointer per D-04. These are
 * documentation-level assertions; the skills themselves are markdown bodies that the
 * agent follows during interviews, so the test surface is grep-on-content.
 *
 * Per D-05 skills MUST NOT be renamed; the canonical frontmatter names stay
 * `gdd-discuss` and `gdd-brief`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DISCUSS = path.join(REPO_ROOT, 'skills', 'discuss', 'SKILL.md');
const BRIEF = path.join(REPO_ROOT, 'skills', 'brief', 'SKILL.md');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function lineCount(content) {
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

test('discuss skill mentions CONTEXT.md write trigger', () => {
  const c = read(DISCUSS);
  assert.ok(/CONTEXT\.md/.test(c), 'discuss must mention CONTEXT.md');
  assert.ok(/context-md-format/.test(c), 'discuss must link to schema reference');
});

test('discuss skill mentions ADR offer gate with criteria', () => {
  const c = read(DISCUSS);
  assert.ok(/adr-format/.test(c), 'discuss must link to ADR format reference');
  const criteriaHits = (c.match(/hard-to-reverse|surprising-without-context|real-tradeoff/g) || []).length;
  assert.ok(criteriaHits >= 2, `expected >=2 ADR criteria mentions, got ${criteriaHits}`);
});

test('discuss skill stays under 99-line warn threshold', () => {
  const c = read(DISCUSS);
  const n = lineCount(c);
  assert.ok(n <= 99, `discuss SKILL.md is ${n} lines; must be <=99 (D-01 warn threshold)`);
});

test('discuss skill name unchanged (D-05 no renames)', () => {
  const c = read(DISCUSS);
  // D-05: no renames. The canonical name set by Phase 28.5-04 stays gdd-discuss.
  const nameMatch = c.match(/^name:\s*(\S+)$/m);
  assert.ok(nameMatch, 'discuss must have a name: frontmatter field');
  assert.equal(nameMatch[1], 'gdd-discuss', 'D-05: discuss skill name must remain gdd-discuss');
});

test('brief skill mentions CONTEXT.md write trigger', () => {
  const c = read(BRIEF);
  assert.ok(/CONTEXT\.md/.test(c), 'brief must mention CONTEXT.md');
  assert.ok(/context-md-format/.test(c), 'brief must link to schema reference');
});

test('brief skill mentions ADR pointer', () => {
  const c = read(BRIEF);
  assert.ok(/adr-format/.test(c), 'brief must link to ADR format reference');
});

test('brief skill stays under 99-line warn threshold', () => {
  const c = read(BRIEF);
  const n = lineCount(c);
  assert.ok(n <= 99, `brief SKILL.md is ${n} lines; must be <=99 (D-01 warn threshold)`);
});

test('brief skill name unchanged (D-05 no renames)', () => {
  const c = read(BRIEF);
  const nameMatch = c.match(/^name:\s*(\S+)$/m);
  assert.ok(nameMatch, 'brief must have a name: frontmatter field');
  assert.equal(nameMatch[1], 'gdd-brief', 'D-05: brief skill name must remain gdd-brief');
});
