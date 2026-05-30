'use strict';
// test/suite/discipline-block-presence.test.cjs — Phase 32 Plan 03 (Wave A.3)
//
// Contract tests for the ported skill-discipline block in the two non-Claude-Code
// load-time harness prompts: AGENTS.md (Codex) and GEMINI.md (Gemini).
//
// Asserts, per file:
//   (a) the verbatim 1%-rule sentence is present,
//   (b) a "| Thought | Reality |" red-flags table with >=10 data rows is present,
//   (c) the discipline block (1%-rule) appears BEFORE the "Before invoking any GDD
//       skill, consult these two references" tool-mapping instruction (string-index
//       ordering — the block must sit above the consult line),
//   (d) the discipline region carries NO <SUBAGENT-STOP> tag (D-06 boundary — these
//       files load per-session for their harness, NOT per-subagent, so the cascade
//       guard that belongs to the SessionStart-injected using-gdd does not apply).
//
// Content parity (same superpowers mechanism as skills/using-gdd/SKILL.md, 32-01)
// minus the SUBAGENT-STOP tag.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

const FILES = ['AGENTS.md', 'GEMINI.md'];

const VERBATIM_1PCT =
  'If you think there is even a 1% chance a skill might apply, you ABSOLUTELY MUST invoke the skill.';
const ANCHOR = 'Before invoking any GDD skill, consult these two references';
const TABLE_HEAD = /^\s*\|\s*Thought\s*\|\s*Reality\s*\|\s*$/;
const SEPARATOR = /^\s*\|[\s:-]+\|[\s:-]+\|\s*$/;
const TABLE_ROW = /^\s*\|.*\|.*\|\s*$/;

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8').replace(/\r\n/g, '\n');
}

// Count data rows of the "| Thought | Reality |" table (excludes heading +
// separator), mirroring the 32-01 idiom (using-gdd-skill.test.cjs).
function redFlagRowCount(src) {
  const lines = src.split('\n');
  const headIdx = lines.findIndex((l) => TABLE_HEAD.test(l));
  if (headIdx < 0) return -1;
  let rows = 0;
  for (let i = headIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!TABLE_ROW.test(l)) break; // table ended
    if (SEPARATOR.test(l)) continue; // separator row
    rows++;
  }
  return rows;
}

for (const file of FILES) {
  test(`32-03: ${file} has the verbatim 1%-rule sentence`, () => {
    const src = read(file);
    assert.ok(
      src.includes(VERBATIM_1PCT),
      `${file} must port the verbatim 1%-rule sentence`,
    );
  });

  test(`32-03: ${file} has a | Thought | Reality | table with >=10 rows`, () => {
    const src = read(file);
    const rows = redFlagRowCount(src);
    assert.ok(rows >= 0, `${file} missing the "| Thought | Reality |" table heading row`);
    assert.ok(rows >= 10, `${file} red-flags table must have >=10 data rows, found ${rows}`);
  });

  test(`32-03: ${file} discipline block is ABOVE the consult line`, () => {
    const src = read(file);
    const ruleIdx = src.indexOf('1% chance a skill');
    const anchorIdx = src.indexOf(ANCHOR);
    assert.ok(ruleIdx >= 0, `${file} missing the 1%-rule sentence`);
    assert.ok(anchorIdx >= 0, `${file} missing the "${ANCHOR}" anchor line`);
    assert.ok(
      ruleIdx < anchorIdx,
      `${file} discipline block must precede the "consult these two references" line`,
    );
  });

  test(`32-03: ${file} discipline region has NO <SUBAGENT-STOP> (D-06)`, () => {
    const src = read(file);
    const ruleIdx = src.indexOf('1% chance a skill');
    const anchorIdx = src.indexOf(ANCHOR);
    assert.ok(ruleIdx >= 0 && anchorIdx > ruleIdx, `${file} discipline region not found`);
    const region = src.slice(ruleIdx, anchorIdx);
    assert.ok(
      !region.includes('<SUBAGENT-STOP>'),
      `${file} discipline region must NOT contain <SUBAGENT-STOP> (per-session load file, not per-subagent inject)`,
    );
  });
}
