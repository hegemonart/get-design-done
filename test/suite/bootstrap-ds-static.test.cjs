'use strict';
// Phase 37.2 — Greenfield DS Bootstrap static contract. Structural assertions on the skill,
// the ds-generator agent, and the rubric (no live generation, D-06). Hermetic: file reads only.
// Every test tagged `37.2-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const SKILL = read('skills/bootstrap-ds/SKILL.md');
const AGENT = read('agents/ds-generator.md');
const RUBRIC = read('reference/ds-bootstrap-rubric.md');

test('37.2-02: bootstrap-ds skill — frontmatter, <=100 lines, brand-input, routes to ds-generator', () => {
  const lines = SKILL.split('\n').length;
  assert.ok(lines <= 100, `skill is ${lines} lines (<= 100 Phase-28.5 contract)`);
  const fm = SKILL.split('---')[1] || '';
  assert.match(fm, /name:\s*gdd-bootstrap-ds/, 'name');
  assert.match(fm, /user-invocable:\s*true/, 'user-invocable');
  assert.match(fm, /\bTask\b/, 'tools includes Task (delegates to ds-generator)');
  assert.match(SKILL, /--primary/, 'brand-input: primary');
  assert.match(SKILL, /tone/, 'brand-input: tone tags');
  assert.match(SKILL, /ds-generator/, 'routes to ds-generator');
  assert.match(SKILL, /##\s*BOOTSTRAP-DS COMPLETE/, 'terminator');
});

test('37.2-02: skill refuses to invent a brand or overwrite an existing DS', () => {
  assert.match(SKILL, /Do Not/i, 'has a Do Not section');
  assert.match(SKILL, /invent a brand/i, 'no inventing a brand');
  assert.match(SKILL, /overwrite an existing design system|defer to .*design-context-builder/i, 'no overwriting an existing DS');
});

test('37.2-02: ds-generator uses the pure token-scale + emits 3 variants + scaffolds', () => {
  assert.match(AGENT, /scripts\/lib\/ds\/token-scale\.cjs/, 'uses token-scale.cjs');
  assert.match(AGENT, /oklchScale|typeScale|spacingScale/, 'calls the generators');
  assert.match(AGENT, /conservative.*balanced.*bold|3 variants|three variants/is, '3 variants');
  assert.match(AGENT, /button.*input.*card|button \/ input \/ card/i, 'scaffolds button/input/card');
  assert.match(AGENT, /reference\/ds-bootstrap-rubric\.md/, 'obeys the rubric');
  assert.match(AGENT, /reference\/color-theory\.md/, 'consumes color-theory');
  assert.match(AGENT, /##\s*DS BOOTSTRAP COMPLETE/, 'completion marker');
});

test('37.2-02: rubric registered + enforces the <=2-brand-colors rule + native oklch()', () => {
  const reg = JSON.parse(read('reference/registry.json'));
  const e = reg.entries.find((x) => x.name === 'ds-bootstrap-rubric');
  assert.ok(e && e.phase === 37.2 && e.type === 'heuristic', 'ds-bootstrap-rubric registered (heuristic, 37.2)');
  assert.match(RUBRIC, /never .* more than 2 brand colors|<=\s*2 brand colors|≤\s*2 brand colors|2 brand colors/i, '<=2 brand colors rule');
  assert.match(RUBRIC, /oklch\(/, 'emits native oklch()');
  assert.match(RUBRIC, /conservative/i, 'documents the 3 variants');
});
