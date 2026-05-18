'use strict';

/**
 * skill-mcp-adoption (Phase 27.7-05)
 *
 * Static-analysis regression test for Plan 27.7-05: verifies that the
 * three utility skills (`/gdd:progress`, `/gdd:resume`, `/gdd:next`)
 * have adopted the `## MCP path (preferred)` + `## File-read path
 * (fallback)` fork pattern that lets harnesses with the `gdd-mcp`
 * server (Phase 27.7+) prime cycle context in 1–3 MCP calls instead
 * of 5–10 file reads.
 *
 * D-10 scope discipline: only the 3 utility skills (progress, resume,
 * next) are in scope. Stage skills (brief, explore, plan, design,
 * verify) remain Phase 32 territory and MUST NOT carry the MCP-path
 * block yet — a negative test enforces that.
 *
 * Asserts (per skill):
 *   - `## MCP path (preferred)` header present
 *   - `## File-read path (fallback)` header present
 *   - MCP block appears BEFORE the file-read block
 *   - MCP block references at least one `mcp__gdd_<tool>` token
 *
 * See plan 27.7-05 `must_haves.truths` and `<verify>` block for
 * the canonical contract this test enforces.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function loadSkill(name) {
  return fs.readFileSync(
    path.join(REPO_ROOT, 'skills', name, 'SKILL.md'),
    'utf8',
  );
}

function assertSkillCompliance(name) {
  const s = loadSkill(name);
  const mcpIdx = s.indexOf('## MCP path (preferred)');
  const fileIdx = s.indexOf('## File-read path (fallback)');
  assert.notEqual(
    mcpIdx,
    -1,
    `${name}: missing "## MCP path (preferred)" header`,
  );
  assert.notEqual(
    fileIdx,
    -1,
    `${name}: missing "## File-read path (fallback)" header`,
  );
  assert.ok(
    mcpIdx < fileIdx,
    `${name}: "## MCP path (preferred)" must come before "## File-read path (fallback)" ` +
      `(got mcp=${mcpIdx}, file=${fileIdx})`,
  );
  // Extract the MCP block (between the two headers) and assert it
  // references at least one `mcp__gdd_<tool>` token. This guards
  // against the headers being added without any actual tool wiring.
  const mcpBlock = s.substring(mcpIdx, fileIdx);
  assert.match(
    mcpBlock,
    /mcp__gdd_\w+/,
    `${name}: MCP block must reference at least one mcp__gdd_ tool`,
  );
}

describe('27.7-05: skill MCP adoption', () => {
  test('27.7-05: progress/SKILL.md — MCP path + File-read path compliance', () => {
    assertSkillCompliance('progress');
  });

  test('27.7-05: resume/SKILL.md — MCP path + File-read path compliance', () => {
    assertSkillCompliance('resume');
  });

  test('27.7-05: next/SKILL.md — MCP path + File-read path compliance', () => {
    assertSkillCompliance('next');
  });

  test('27.7-05: each MCP block references >= 1 mcp__gdd_ tool (explicit count check)', () => {
    for (const name of ['progress', 'resume', 'next']) {
      const s = loadSkill(name);
      const mcpIdx = s.indexOf('## MCP path (preferred)');
      const fileIdx = s.indexOf('## File-read path (fallback)');
      const mcpBlock = s.substring(mcpIdx, fileIdx);
      const matches = mcpBlock.match(/mcp__gdd_\w+/g) || [];
      assert.ok(
        matches.length >= 1,
        `${name}: MCP block must reference at least one mcp__gdd_ tool, found ${matches.length}`,
      );
    }
  });

  test('27.7-05: stage skills untouched — brief/explore/plan/design/verify do NOT have MCP path block (D-10)', () => {
    // D-10 scope discipline: stage skills remain in Phase 32 territory.
    // If any stage skill picks up the MCP-path block prematurely, fail
    // loudly so the scope creep gets caught in CI.
    const stageSkills = ['brief', 'explore', 'plan', 'design', 'verify'];
    for (const name of stageSkills) {
      let s;
      try {
        s = loadSkill(name);
      } catch (err) {
        // Skill may not exist in this repo — skip rather than fail,
        // since stage skill presence isn't this test's concern.
        continue;
      }
      assert.equal(
        s.indexOf('## MCP path (preferred)'),
        -1,
        `${name}: stage skill must NOT have "## MCP path (preferred)" block ` +
          '(D-10 scope discipline; Phase 32 territory)',
      );
    }
  });
});
