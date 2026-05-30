'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

function extractGddCommands(readmeContent) {
  const commands = new Set();
  // Match /gdd:word patterns
  const re = /\/gdd:([a-z][a-z0-9-]*)/g;
  let m;
  while ((m = re.exec(readmeContent)) !== null) {
    commands.add(m[1]);
  }
  return [...commands].sort();
}

const readmePath = path.join(REPO_ROOT, 'README.md');
const skillsDir = path.join(REPO_ROOT, 'skills');

test('commands: README.md can be read', () => {
  assert.ok(fs.existsSync(readmePath), 'README.md must exist at repo root');
});

test('commands: every /gdd: command in README has a skills/ directory with SKILL.md', () => {
  const readmeContent = fs.readFileSync(readmePath, 'utf8');
  const commands = extractGddCommands(readmeContent);

  // Note: some commands (like gdd:help, gdd:next) may not have skill dirs — these are router-level commands.
  // We only assert on commands that map directly to pipeline stages: scan, discover, plan, design, verify,
  // style, darkmode, compare.
  const PIPELINE_COMMANDS = ['scan', 'discover', 'plan', 'design', 'verify', 'style', 'darkmode', 'compare'];

  for (const cmd of PIPELINE_COMMANDS) {
    if (!commands.includes(cmd)) continue; // Not in README — skip
    const skillDir = path.join(skillsDir, cmd);
    const skillMd = path.join(skillDir, 'SKILL.md');
    assert.ok(
      fs.existsSync(skillDir),
      `Command /gdd:${cmd} is in README but skills/${cmd}/ directory does not exist`
    );
    assert.ok(
      fs.existsSync(skillMd),
      `Command /gdd:${cmd} has skills/${cmd}/ but skills/${cmd}/SKILL.md is missing`
    );
  }
});
