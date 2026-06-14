'use strict';
// Phase 35.1 — /hone:ship wires pr-commenter after PR creation, degrade-to-noop (D-06).
// Hermetic: file reads only. Tagged `35.1-01:`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SHIP = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'ship', 'SKILL.md'), 'utf8');

test('35.1-01: ship SKILL spawns pr-commenter after PR creation', () => {
  assert.match(SHIP, /pr-commenter/, 'ship SKILL references pr-commenter');
  assert.match(SHIP, /Task/, 'ship SKILL uses the Task tool to spawn it');
  // it must run AFTER PR creation, not before
  const createIdx = SHIP.search(/gh pr create/);
  const commenterIdx = SHIP.search(/pr-commenter/);
  assert.ok(createIdx > 0 && commenterIdx > createIdx, 'pr-commenter step comes after the gh pr create step');
});

test('35.1-01: ship pr-commenter step is degrade-to-noop (must not fail the ship)', () => {
  // the section mentioning pr-commenter must also state the degrade/never-fail posture
  const section = SHIP.slice(SHIP.search(/pr-commenter/), SHIP.search(/pr-commenter/) + 800);
  assert.match(section, /degrade|noop/i, 'degrade-to-noop stated near the pr-commenter step');
  assert.match(section, /MUST NOT fail the ship|still succeeds|never\b.*fail/i, 'ship still succeeds if pr-commenter fails');
  assert.match(section, /GDD_DISABLE_PR_COMMENTER/, 'kill-switch surfaced in the ship step');
});
