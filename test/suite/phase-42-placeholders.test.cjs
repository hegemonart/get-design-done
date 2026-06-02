'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'source', 'skills');
const SKILLS = path.join(ROOT, 'skills');
const CATALOGUE = path.join(ROOT, 'reference', 'skill-placeholders.md');
const { placeholdersUsed, PLACEHOLDERS } = require('../../scripts/lib/build/factory.cjs');

function walkMd(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
function skillDirs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

test('42-ph-01: source/skills mirrors the skills/ skill set', () => {
  assert.deepEqual(skillDirs(SRC), skillDirs(SKILLS));
  assert.equal(walkMd(SRC).length, walkMd(SKILLS).length);
});

test('42-ph-02: every placeholder USED in source/skills is documented in the catalogue', () => {
  const doc = fs.readFileSync(CATALOGUE, 'utf8');
  const used = new Set();
  for (const f of walkMd(SRC)) for (const p of placeholdersUsed(fs.readFileSync(f, 'utf8'))) used.add(p);
  assert.ok(used.size > 0, 'expected at least one placeholder in source');
  for (const p of used) {
    assert.ok(used.has('command_prefix'), 'command_prefix is the migrated placeholder');
    assert.ok(doc.includes('{{' + p + '}}'), `placeholder {{${p}}} must be documented in skill-placeholders.md`);
    assert.ok(PLACEHOLDERS.includes(p), `placeholder ${p} must be a known factory placeholder`);
  }
});

test('42-ph-03: catalogue documents all four canonical placeholders + escape + harness-only', () => {
  const doc = fs.readFileSync(CATALOGUE, 'utf8');
  for (const p of PLACEHOLDERS) assert.ok(doc.includes('{{' + p + '}}'), `missing ${p}`);
  assert.ok(doc.includes('\\{{'), 'escape rule must be documented');
  assert.ok(doc.includes('harness-only'), 'harness-only block must be documented');
});

test('42-ph-04: no stray /gdd: survived the migration in source/skills (all templatized)', () => {
  const stray = walkMd(SRC).filter((f) => fs.readFileSync(f, 'utf8').includes('/gdd:'));
  assert.deepEqual(stray, [], 'every /gdd: must have become {{command_prefix}}');
});
