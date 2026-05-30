'use strict';
/**
 * test/suite/hard-gate.test.cjs — Phase 32 Plan 04 (Wave B.1)
 *
 * Locks the <HARD-GATE> stage-transition forcing functions ported from obra/superpowers
 * (MIT) into the 5 GDD stage-transition skills. Each gate names the SPECIFIC committed
 * artifact that must precede the transition (D-05) and carries the custom-location clause
 * directing the agent to read the path from .design/STATE.md.
 *
 * Per skill, this suite asserts:
 *   (a) the literal `<HARD-GATE>` token is present, and
 *   (b) the correct artifact path(s) for that stage appear in the file:
 *         brief   -> .design/BRIEF.md
 *         explore -> BOTH .design/DESIGN.md and .design/DESIGN-CONTEXT.md
 *         plan    -> .design/DESIGN-PLAN.md
 *         design  -> .design/DESIGN-SUMMARY.md
 *         verify  -> .design/DESIGN-VERIFICATION.md
 *
 * It additionally asserts the D-05 custom-location STATE.md clause sits inside/adjacent to
 * each gate, and that the verify gate is review-shaped (contains a "review" verb) rather than
 * a commit-precedes-transition shape (verify closes the cycle).
 *
 * Test names are prefixed `32-04:` so the plan's self-check
 * (`grep -c '32-04:' >= 5`) holds. Reads the REAL skills/ tree (not a fixture) because the
 * contract is that the shipped skill files carry the gates.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.resolve(__dirname, '../..', 'skills');

// Per-stage contract: the artifact path(s) that MUST appear with the gate.
const GATES = {
  brief: ['.design/BRIEF.md'],
  explore: ['.design/DESIGN.md', '.design/DESIGN-CONTEXT.md'],
  plan: ['.design/DESIGN-PLAN.md'],
  design: ['.design/DESIGN-SUMMARY.md'],
  verify: ['.design/DESIGN-VERIFICATION.md'],
};

function readSkill(stage) {
  const p = path.join(SKILLS_DIR, stage, 'SKILL.md');
  return fs.readFileSync(p, 'utf8');
}

// Extract the text of the first <HARD-GATE> ... </HARD-GATE> block (gate-adjacent assertions
// run against this slice). Falls back to the whole-file tail from the opening tag if no
// close tag is found, so a delimiter variation never produces a false pass.
function gateBlock(content) {
  const open = content.indexOf('<HARD-GATE>');
  if (open < 0) return '';
  const close = content.indexOf('</HARD-GATE>', open);
  return close < 0 ? content.slice(open) : content.slice(open, close + '</HARD-GATE>'.length);
}

for (const [stage, artifacts] of Object.entries(GATES)) {
  test(`32-04: ${stage}/SKILL.md contains a <HARD-GATE> block`, () => {
    const content = readSkill(stage);
    assert.match(content, /<HARD-GATE>/, `${stage}/SKILL.md is missing the literal <HARD-GATE> tag`);
  });

  test(`32-04: ${stage}/SKILL.md gate references its artifact(s) [${artifacts.join(', ')}]`, () => {
    const content = readSkill(stage);
    for (const art of artifacts) {
      assert.ok(
        content.includes(art),
        `${stage}/SKILL.md gate must reference artifact ${art}`
      );
    }
  });

  test(`32-04: ${stage}/SKILL.md gate carries the D-05 custom-location STATE.md clause`, () => {
    const block = gateBlock(readSkill(stage));
    assert.match(
      block,
      /STATE\.md/,
      `${stage}/SKILL.md <HARD-GATE> block must direct the agent to read the path from .design/STATE.md (D-05)`
    );
  });
}

// The verify gate closes the cycle and is REVIEW-shaped (user reviews DESIGN-VERIFICATION.md),
// not a "committed before transition" shape.
test('32-04: verify/SKILL.md gate is user-review-shaped (contains a review verb)', () => {
  const block = gateBlock(readSkill('verify'));
  assert.match(block, /review/i, 'verify gate must require the user to REVIEW DESIGN-VERIFICATION.md');
});

// Sanity: all 5 stage skills are covered (guards against a future skill silently dropping).
test('32-04: all five stage-transition skills are gated', () => {
  const stages = Object.keys(GATES);
  assert.equal(stages.length, 5, 'expected exactly 5 gated stage skills');
  for (const stage of stages) {
    assert.match(readSkill(stage), /<HARD-GATE>/, `${stage} missing gate`);
  }
});
