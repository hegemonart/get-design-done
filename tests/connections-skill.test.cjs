'use strict';
/**
 * connections-skill
 *
 * Validates the /gdd:connections onboarding skill:
 *   - skill file exists at skills/connections/SKILL.md
 *   - frontmatter declares the required tools
 *   - handles all 12 known connections by name (per connections/connections.md)
 *   - documents the three-value status schema
 *   - documents the four-option per-connection setup prompt
 *   - documents the resumability / pending_verification mechanism
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'connections', 'SKILL.md');

// The 12 connections the onboarding wizard must handle. Hyphenated names kept as-is
// here (they match `connections/<name>.md`); STATE.md key normalization (e.g.
// 21st-dev → twenty_first) is a separate concern covered by the merge-logic checks.
const ONBOARDED_CONNECTIONS = [
  'figma',
  'refero',
  'preview',
  'storybook',
  'chromatic',
  'graphify',
  'pinterest',
  'claude-design',
  'paper-design',
  'pencil-dev',
  '21st-dev',
  'magic-patterns',
];

test('connections-skill: SKILL.md exists', () => {
  assert.ok(
    fs.existsSync(SKILL_PATH),
    `expected skill file at ${SKILL_PATH}`
  );
});

test('connections-skill: frontmatter declares required tools', () => {
  const body = fs.readFileSync(SKILL_PATH, 'utf8');
  // Frontmatter block starts at line 1 and ends at the second `---`.
  const fm = body.split('---')[1] || '';
  for (const tool of ['Read', 'Write', 'Bash', 'Glob', 'AskUserQuestion', 'ToolSearch']) {
    assert.match(
      fm,
      new RegExp(`\\b${tool}\\b`),
      `frontmatter should list "${tool}" in tools`
    );
  }
});

test('connections-skill: marked user-invocable', () => {
  const body = fs.readFileSync(SKILL_PATH, 'utf8');
  const fm = body.split('---')[1] || '';
  assert.match(fm, /user-invocable:\s*true/, 'skill must be user-invocable');
});

test('connections-skill: references all 12 known connections by name', () => {
  const body = fs.readFileSync(SKILL_PATH, 'utf8');
  for (const name of ONBOARDED_CONNECTIONS) {
    assert.match(
      body,
      new RegExp(name.replace(/-/g, '[-_ ]?'), 'i'),
      `SKILL.md should reference connection "${name}"`
    );
  }
});

test('connections-skill: documents three-value status schema', () => {
  const body = fs.readFileSync(SKILL_PATH, 'utf8');
  for (const verdict of ['available', 'unavailable', 'not_configured']) {
    assert.match(
      body,
      new RegExp(verdict, 'i'),
      `SKILL.md should reference status "${verdict}"`
    );
  }
});

test('connections-skill: documents four-option setup prompt', () => {
  const body = fs.readFileSync(SKILL_PATH, 'utf8');
  // All four options must appear somewhere in the setup screen spec.
  const options = [
    /Run install command/i,
    /Copy command/i,
    /Skip for now/i,
    /Never ask again/i,
  ];
  for (const opt of options) {
    assert.match(body, opt, `SKILL.md should contain option matching ${opt}`);
  }
});

test('connections-skill: documents resumability via pending_verification', () => {
  const body = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(body, /pending_verification/, 'SKILL.md should reference pending_verification');
  assert.match(body, /connections_onboarding/, 'SKILL.md should reference connections_onboarding block');
});

test('connections-skill: refuses global npm installs and shell-rc edits', () => {
  const body = fs.readFileSync(SKILL_PATH, 'utf8');
  // These are the explicit "Do Not" anchors — if someone removes them, auto-run
  // eligibility loses its safety net.
  assert.match(body, /npm install -g|install -g/i, 'SKILL.md should forbid global npm installs');
  assert.match(body, /bashrc|zshrc|shell[- ]?rc/i, 'SKILL.md should forbid shell-rc edits');
});

test('connections-skill: emits CONNECTIONS COMPLETE terminator', () => {
  const body = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(body, /##\s*CONNECTIONS\s*COMPLETE/, 'SKILL.md must end with ## CONNECTIONS COMPLETE');
});

test('connections-skill: each referenced connection has a matching spec file', () => {
  for (const name of ONBOARDED_CONNECTIONS) {
    const specPath = path.join(REPO_ROOT, 'connections', `${name}.md`);
    assert.ok(
      fs.existsSync(specPath),
      `connections/${name}.md must exist for the onboarding skill to read its setup block`
    );
  }
});
