// tests/bandit-status-skill.test.cjs — Plan 27.5-05
//
// Regression coverage for the Phase 27.5-05 UX surfaces:
//   1. skills/bandit-status/SKILL.md exists with the required frontmatter
//      contract (name, description, tools list — read-only).
//   2. Root SKILL.md registers bandit-status so the router can discover it.
//   3. skills/peers/SKILL.md uses the canonical posterior path
//      (.design/telemetry/posterior.json) and references bandit-router —
//      proving the stale .design/intel/bandit-posterior.json path fix landed.
//
// Pure file-read assertions — no I/O beyond fs.readFileSync, no fixtures.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BANDIT_STATUS_SKILL = path.join(ROOT, 'skills', 'bandit-status', 'SKILL.md');
const PEERS_SKILL = path.join(ROOT, 'skills', 'peers', 'SKILL.md');
const ROOT_SKILL = path.join(ROOT, 'SKILL.md');

// -------------------------------------------------------------------
// (a) skills/bandit-status/SKILL.md exists with read-only frontmatter
// -------------------------------------------------------------------

test('27.5-05: skills/bandit-status/SKILL.md exists', () => {
  assert.ok(fs.existsSync(BANDIT_STATUS_SKILL),
    `expected ${BANDIT_STATUS_SKILL} to exist`);
});

test('27.5-05: bandit-status skill frontmatter declares name=gdd-bandit-status', () => {
  const content = fs.readFileSync(BANDIT_STATUS_SKILL, 'utf8');
  assert.ok(content.startsWith('---\n'), 'expected frontmatter block to start file');
  assert.match(content, /^name: gdd-bandit-status$/m,
    'expected `name: gdd-bandit-status` in frontmatter');
});

test('27.5-05: bandit-status skill frontmatter has description', () => {
  const content = fs.readFileSync(BANDIT_STATUS_SKILL, 'utf8');
  assert.match(content, /^description:\s*".+"/m,
    'expected `description: "..."` in frontmatter');
});

test('27.5-05: bandit-status skill declares Read, Bash tools (read-only — no Write/Edit)', () => {
  const content = fs.readFileSync(BANDIT_STATUS_SKILL, 'utf8');
  // Extract the frontmatter block
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/m);
  assert.ok(frontmatterMatch, 'expected a frontmatter block');
  const frontmatter = frontmatterMatch[1];

  // Confirm tools line
  const toolsLine = frontmatter.split('\n').find((l) => /^tools:/.test(l));
  assert.ok(toolsLine, 'expected `tools:` line in frontmatter');
  assert.match(toolsLine, /Read/, 'expected `Read` in tools list');
  assert.match(toolsLine, /Bash/, 'expected `Bash` in tools list');

  // D-11 enforcement at the manifest level — no mutating tools.
  assert.doesNotMatch(toolsLine, /\bWrite\b/i,
    'read-only skill must NOT declare Write tool');
  assert.doesNotMatch(toolsLine, /\bEdit\b/i,
    'read-only skill must NOT declare Edit tool');
  assert.doesNotMatch(toolsLine, /\bMultiEdit\b/i,
    'read-only skill must NOT declare MultiEdit tool');
});

test('27.5-05: bandit-status skill references canonical posterior path', () => {
  const content = fs.readFileSync(BANDIT_STATUS_SKILL, 'utf8');
  assert.match(content, /\.design\/telemetry\/posterior\.json/,
    'expected canonical .design/telemetry/posterior.json reference');
  // Stale path must NOT appear.
  assert.doesNotMatch(content, /\.design\/intel\/bandit-posterior\.json/,
    'stale .design/intel/bandit-posterior.json must not be referenced');
});

test('27.5-05: bandit-status skill cross-references /gdd:bandit-reset (mutation surface)', () => {
  const content = fs.readFileSync(BANDIT_STATUS_SKILL, 'utf8');
  assert.match(content, /gdd:bandit-reset/,
    'expected cross-reference to /gdd:bandit-reset (the only mutation surface)');
});

test('27.5-05: bandit-status skill body asserts read-only discipline (D-11)', () => {
  const content = fs.readFileSync(BANDIT_STATUS_SKILL, 'utf8');
  // At least one mention of "read-only" (case-insensitive).
  assert.match(content, /read-only/i,
    'expected an explicit "read-only" marker in skill body (D-11)');
});

// -------------------------------------------------------------------
// (b) Root SKILL.md registers bandit-status
// -------------------------------------------------------------------

test('27.5-05: root SKILL.md registers bandit-status', () => {
  const content = fs.readFileSync(ROOT_SKILL, 'utf8');
  assert.match(content, /bandit-status/,
    'expected root SKILL.md to register the new bandit-status skill');
});

// -------------------------------------------------------------------
// (c) skills/peers/SKILL.md uses canonical posterior path + references bandit-router
// -------------------------------------------------------------------

test('27.5-05: skills/peers/SKILL.md no longer references stale posterior path', () => {
  const content = fs.readFileSync(PEERS_SKILL, 'utf8');
  assert.doesNotMatch(content, /\.design\/intel\/bandit-posterior\.json/,
    'peers skill must not reference the stale .design/intel/bandit-posterior.json path');
});

test('27.5-05: skills/peers/SKILL.md references canonical posterior path', () => {
  const content = fs.readFileSync(PEERS_SKILL, 'utf8');
  assert.match(content, /\.design\/telemetry\/posterior\.json/,
    'peers skill must reference canonical .design/telemetry/posterior.json');
});

test('27.5-05: skills/peers/SKILL.md references bandit-router module', () => {
  const content = fs.readFileSync(PEERS_SKILL, 'utf8');
  assert.match(content, /bandit-router/,
    'peers skill must reference bandit-router (so future path changes propagate)');
});

test('27.5-05: skills/peers/SKILL.md retains all 4 fallback messages', () => {
  const content = fs.readFileSync(PEERS_SKILL, 'utf8');
  assert.match(content, /\(not installed\)/, 'expected "(not installed)" fallback');
  assert.match(content, /\(opt-in disabled\)/, 'expected "(opt-in disabled)" fallback');
  assert.match(content, /\(no data yet\)/, 'expected "(no data yet)" fallback');
  // Computed-delta render — at least one of the three render cases must appear.
  assert.match(content, /% reward|~equal/,
    'expected the computed-delta render strings (+X% reward / -X% reward / ~equal)');
});
