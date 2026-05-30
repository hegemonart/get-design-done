'use strict';
/**
 * test/suite/self-review-block.test.cjs — Phase 32 Plan 06 (Wave B.3)
 *
 * Locks the 4-line spec self-review inline-blocks added to the two spec-producing stage
 * skills (brief, plan). superpowers pairs its <HARD-GATE> + rationalization table with a
 * final self-review pass; this plan ports that pattern to the brief->explore and
 * plan->design transitions — a placeholder/consistency/scope/ambiguity checklist run as the
 * last spec-quality gate before the artifact is handed to the next stage.
 *
 * Per skill (brief, plan), this suite asserts:
 *   (a) a spec self-review heading is present (/self-review/i);
 *   (b) all four check lines are present — the lowercased body contains "placeholder",
 *       "consistency", "scope", and "ambiguity".
 *
 * It additionally re-asserts, as a SEQUENTIAL-EDIT regression guard (32-06 lands after
 * 32-04 + 32-05 over the same two files), that each file STILL carries:
 *   (c) its 32-04 `<HARD-GATE>` block; and
 *   (d) its 32-05 `| Thought | Reality |` rationalization table.
 *
 * Test names are prefixed `32-06:` so the plan's self-check
 * (`grep -c '32-06:' >= 4`) holds. Reads the REAL skills/ tree (not a fixture) because the
 * contract is that the shipped skill files carry the self-review blocks.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.resolve(__dirname, '../..', 'skills');

// The two spec-producing stages that gain a self-review block (brief->explore, plan->design).
const SELF_REVIEW_SKILLS = ['brief', 'plan'];

// The four canonical checks, asserted as case-insensitive substrings of the body.
const CHECKS = ['placeholder', 'consistency', 'scope', 'ambiguity'];

function readSkill(stage) {
  return fs.readFileSync(path.join(SKILLS_DIR, stage, 'SKILL.md'), 'utf8');
}

for (const stage of SELF_REVIEW_SKILLS) {
  test(`32-06: ${stage}/SKILL.md has a spec self-review heading`, () => {
    const content = readSkill(stage);
    assert.match(
      content,
      /self-review/i,
      `${stage}/SKILL.md is missing a spec self-review heading (/self-review/i)`
    );
  });

  test(`32-06: ${stage}/SKILL.md self-review has all 4 checks`, () => {
    const lc = readSkill(stage).toLowerCase();
    for (const check of CHECKS) {
      assert.ok(
        lc.includes(check),
        `${stage}/SKILL.md self-review block is missing the "${check}" check`
      );
    }
  });

  test(`32-06: ${stage}/SKILL.md still has <HARD-GATE> (32-04 regression)`, () => {
    assert.match(
      readSkill(stage),
      /<HARD-GATE>[\s\S]*?<\/HARD-GATE>/,
      `${stage}/SKILL.md lost its <HARD-GATE> block — 32-06's additive edit must preserve 32-04`
    );
  });

  test(`32-06: ${stage}/SKILL.md still has the rationalization table (32-05 regression)`, () => {
    assert.match(
      readSkill(stage),
      /^\s*\|\s*Thought\s*\|\s*Reality\s*\|\s*$/m,
      `${stage}/SKILL.md lost its "| Thought | Reality |" table — 32-06's additive edit must preserve 32-05`
    );
  });
}

// Sanity: exactly the two spec-producing stages are covered (guards against drift).
test('32-06: both spec-producing stage skills (brief, plan) carry a self-review block', () => {
  assert.equal(SELF_REVIEW_SKILLS.length, 2, 'expected exactly 2 self-review skills (brief, plan)');
  for (const stage of SELF_REVIEW_SKILLS) {
    assert.match(readSkill(stage), /self-review/i, `${stage} missing self-review block`);
  }
});
