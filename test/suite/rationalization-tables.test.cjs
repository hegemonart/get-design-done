'use strict';
/**
 * test/suite/rationalization-tables.test.cjs — Phase 32 Plan 05 (Wave B.2)
 *
 * Locks the rationalization tables ported from obra/superpowers (MIT) into the 7 GDD
 * stage-orchestrator skills. superpowers pairs each <HARD-GATE> forcing function with a
 * "Thought -> Reality" table that pre-closes the specific shortcut excuses an agent invents
 * under pressure. This plan adds a GDD-pipeline-specific table to:
 *   - the 5 stage-transition skills (brief, explore, plan, design, verify) — additive,
 *     SEQUENTIAL AFTER 32-04, must NOT disturb their <HARD-GATE> blocks; and
 *   - discuss + audit (no HARD-GATE) — fresh table additions.
 *
 * Per skill, this suite asserts:
 *   (a) a `| Thought | Reality |` heading row is present;
 *   (b) the table has >=6 data rows (excluding the heading + the |---|---| separator),
 *       counted as the contiguous run of table rows immediately following the heading so a
 *       second unrelated table in the file (e.g. audit's "Registered Audit Agents") is not
 *       miscounted; and
 *   (c) >=1 data row topically matches the skill's own domain (per-skill regex).
 *
 * It additionally re-asserts, for the 5 skills gated by 32-04, that the `<HARD-GATE>` tag is
 * STILL present — a regression guard proving 32-05's additive edit did not clobber 32-04.
 *
 * Test names are prefixed `32-05:` so the plan's self-check
 * (`grep -c '32-05:' >= 7`) holds. Reads the REAL skills/ tree (not a fixture) because the
 * contract is that the shipped skill files carry the tables.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.resolve(__dirname, '../..', 'skills');

// Per-skill topical-relevance regex (the test enforces >=1 data row matching its domain).
const TOPICS = {
  brief: /brief|requirement|problem/i,
  explore: /explore|codebase|connection|inventory/i,
  plan: /plan|scope/i,
  design: /design|implement|token/i,
  verify: /verify|check|verification/i,
  discuss: /discuss|question|decision/i,
  audit: /audit|cycle|review/i,
};

// The 5 skills that carry a <HARD-GATE> from 32-04 (regression guard set).
const GATED = ['brief', 'explore', 'plan', 'design', 'verify'];

function readSkill(stage) {
  return fs.readFileSync(path.join(SKILLS_DIR, stage, 'SKILL.md'), 'utf8');
}

// Return the array of DATA-row strings of the `| Thought | Reality |` table: the contiguous
// run of pipe-delimited lines beginning at the heading, with the heading row and the
// |---|---| separator row removed. Stops at the first non-table line so a later, unrelated
// table elsewhere in the file is never folded in.
function rationalizationRows(content) {
  const lines = content.split(/\r?\n/);
  const headIdx = lines.findIndex((l) => /^\s*\|\s*Thought\s*\|\s*Reality\s*\|\s*$/.test(l));
  if (headIdx < 0) return null; // no heading at all
  const rows = [];
  for (let i = headIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|.*\|\s*$/.test(line)) break; // end of the contiguous table block
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // separator row (|---|---|)
    rows.push(line);
  }
  return rows;
}

for (const [stage, topicRe] of Object.entries(TOPICS)) {
  test(`32-05: ${stage}/SKILL.md has a "| Thought | Reality |" rationalization table heading`, () => {
    const content = readSkill(stage);
    assert.match(
      content,
      /^\s*\|\s*Thought\s*\|\s*Reality\s*\|\s*$/m,
      `${stage}/SKILL.md is missing the "| Thought | Reality |" rationalization-table heading row`
    );
  });

  test(`32-05: ${stage}/SKILL.md rationalization table has >=6 data rows`, () => {
    const rows = rationalizationRows(readSkill(stage));
    assert.ok(rows !== null, `${stage}/SKILL.md: no "| Thought | Reality |" heading found`);
    assert.ok(
      rows.length >= 6,
      `${stage}/SKILL.md rationalization table has ${rows.length} data rows; require >=6`
    );
  });

  test(`32-05: ${stage}/SKILL.md has >=1 rationalization row topical to its stage (${topicRe})`, () => {
    const rows = rationalizationRows(readSkill(stage));
    assert.ok(rows !== null, `${stage}/SKILL.md: no "| Thought | Reality |" heading found`);
    assert.ok(
      rows.some((r) => topicRe.test(r)),
      `${stage}/SKILL.md: no rationalization row topically matches ${topicRe}`
    );
  });
}

// Regression guard: 32-05 is SEQUENTIAL AFTER 32-04 over overlapping files. The additive
// table insertion must NOT have removed the <HARD-GATE> block from any of the 5 gated skills.
for (const stage of GATED) {
  test(`32-05: ${stage}/SKILL.md still contains its 32-04 <HARD-GATE> block (not clobbered)`, () => {
    assert.match(
      readSkill(stage),
      /<HARD-GATE>[\s\S]*?<\/HARD-GATE>/,
      `${stage}/SKILL.md lost its <HARD-GATE> block — 32-05's additive edit must preserve 32-04`
    );
  });
}

// Sanity: all 7 stage-orchestrator skills are covered (guards against a future skill silently
// dropping out of the table set).
test('32-05: all seven stage-orchestrator skills carry a rationalization table', () => {
  const stages = Object.keys(TOPICS);
  assert.equal(stages.length, 7, 'expected exactly 7 stage-orchestrator skills');
  for (const stage of stages) {
    const rows = rationalizationRows(readSkill(stage));
    assert.ok(rows !== null && rows.length >= 6, `${stage} missing a >=6-row rationalization table`);
  }
});
