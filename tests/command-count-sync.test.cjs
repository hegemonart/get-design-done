'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.cjs');

test('command-count-sync: every skills/ subdirectory has a SKILL.md', () => {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();

  const missing = [];
  for (const dir of skillDirs) {
    const skillMd = path.join(skillsDir, dir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      missing.push(`skills/${dir}/SKILL.md`);
    }
  }
  assert.deepEqual(missing, [],
    `Missing SKILL.md in skill directories:\n${missing.join('\n')}`
  );
});

test('command-count-sync: root SKILL.md references all skill directories', () => {
  const rootSkill = path.join(REPO_ROOT, 'SKILL.md');
  assert.ok(fs.existsSync(rootSkill), 'Root SKILL.md must exist');

  const content = fs.readFileSync(rootSkill, 'utf8');
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  const missing = [];
  for (const dir of skillDirs) {
    if (!content.includes(dir)) {
      missing.push(dir);
    }
  }
  assert.deepEqual(missing, [],
    `Root SKILL.md does not mention these skill directories:\n${missing.join('\n')}`
  );
});
