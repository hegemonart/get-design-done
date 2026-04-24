'use strict';
/**
 * skill-verify-mcp-migration (Plan 20-11)
 *
 * Static-analysis migration checks for skills/verify/SKILL.md.
 *
 * After Plan 20-11 migration, every STATE.md mutation in skills/verify/SKILL.md
 * goes through `gdd-state` MCP tools. The full auditor / verifier /
 * integration-checker / re-verify orchestration prose is preserved
 * byte-for-byte; only the STATE.md mutation surface changes. This test suite
 * is a structural guard against drift, not a runtime validator — the MCP
 * tools themselves are exercised by tests/mcp-gdd-state.test.ts (Plan 20-05)
 * and the update-in-place idiom is covered by tests/gdd-state-mutator.test.ts.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'verify', 'SKILL.md');
const BEFORE_PATH = path.join(
  REPO_ROOT,
  'test-fixture',
  'baselines',
  'phase-20',
  'verify-before.md',
);

function readSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf8');
}

function readBefore() {
  return fs.readFileSync(BEFORE_PATH, 'utf8');
}

function readFrontmatter(body) {
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

function countMatches(text, pattern) {
  const matches = text.match(pattern) || [];
  return matches.length;
}

// Required MCP tools per Plan 20-11 contract. The plan enumerates 8 core
// tools; Rule 2 auto-added `probe_connections` because verify has three
// connection probes (preview, storybook, chromatic) that need to write
// `<connections>` without direct STATE.md writes.
const REQUIRED_MCP_TOOLS = [
  'mcp__gdd_state__get',
  'mcp__gdd_state__transition_stage',
  'mcp__gdd_state__add_must_have',
  'mcp__gdd_state__add_blocker',
  'mcp__gdd_state__resolve_blocker',
  'mcp__gdd_state__update_progress',
  'mcp__gdd_state__set_status',
  'mcp__gdd_state__checkpoint',
];

test('verify-migration: SKILL.md and before-snapshot both exist', () => {
  assert.ok(fs.existsSync(SKILL_PATH), `expected skill file at ${SKILL_PATH}`);
  assert.ok(
    fs.existsSync(BEFORE_PATH),
    `expected pre-migration snapshot at ${BEFORE_PATH}`,
  );
});

test('verify-migration: frontmatter tools line contains all 8 required MCP tools', () => {
  const fm = readFrontmatter(readSkill());
  for (const tool of REQUIRED_MCP_TOOLS) {
    assert.match(
      fm,
      new RegExp(tool.replace(/[_$]/g, (c) => `\\${c}`)),
      `frontmatter should list "${tool}" in tools`,
    );
  }
});

test('verify-migration: exactly one transition_stage call at stage entry', () => {
  const body = readSkill();
  // A real CALL takes the form `...transition_stage` with `to: "..."`. The
  // frontmatter tools line references the tool name but does not invoke it,
  // and we explicitly exclude such mentions from the count.
  const calls = body.match(/`mcp__gdd_state__transition_stage`\s+with\b/g) || [];
  assert.equal(
    calls.length,
    1,
    `expected exactly 1 transition_stage call (stage entry), got ${calls.length}`,
  );
  // And the one call must target the "verify" stage.
  assert.match(
    body,
    /`mcp__gdd_state__transition_stage`\s+with\s+`to:\s+"verify"`/,
    'the single transition_stage call must set to: "verify"',
  );
});

test('verify-migration: update-in-place idiom is documented', () => {
  const body = readSkill();
  // The idiom phrase is load-bearing — it documents to future readers why
  // there is no dedicated `update_must_have_status` tool. Absence here
  // means the idiom was silently dropped; fail loudly.
  assert.match(
    body,
    /update-in-place/,
    'skill must document the "update-in-place" idiom inline (see "Flipping a must-have status")',
  );
  // Also sanity-check the canonical heading for the idiom section.
  assert.match(
    body,
    /##\s+Flipping a must-have status/,
    'skill must contain a "Flipping a must-have status" section',
  );
});

test('verify-migration: no direct Edit/Write phrasings against STATE.md', () => {
  const body = readSkill();
  assert.doesNotMatch(
    body,
    /Edit\s+\.design\/STATE\.md/,
    'skill must not instruct a direct Edit on .design/STATE.md (use MCP tools)',
  );
  assert.doesNotMatch(
    body,
    /Write\s+\.design\/STATE\.md/,
    'skill must not instruct a direct Write on .design/STATE.md (use MCP tools)',
  );
  // Also catch the parallelism_decision direct-write pattern. We allow
  // the phrase inside an explicit "Do not write STATE.md directly"
  // instruction, so we only fail on the imperative form.
  assert.doesNotMatch(
    body,
    /Write\s+`?<parallelism_decision>`?\s+to\s+STATE\.md(?!\s+directly)/,
    'parallelism_decision must route through an MCP tool, not direct STATE.md write',
  );
});

test('verify-migration: add_blocker and resolve_blocker are wired up', () => {
  const body = readSkill();
  assert.match(
    body,
    /mcp__gdd_state__add_blocker/,
    'gap-response / save-and-exit paths must call add_blocker via MCP',
  );
  // resolve_blocker is in the tools list for the re-verify fix loop; the
  // actual call is inside the design-fixer Task() prompt — it's enough
  // that the tool name appears in the skill body.
  assert.match(
    body,
    /mcp__gdd_state__resolve_blocker|resolve_blocker/,
    'resolve_blocker must be referenced (tools list or fix-loop prose)',
  );
});

test('verify-migration: stage-exit calls update_progress + set_status + checkpoint', () => {
  const body = readSkill();
  assert.match(
    body,
    /mcp__gdd_state__update_progress/,
    'stage exit must call update_progress',
  );
  assert.match(
    body,
    /mcp__gdd_state__set_status/,
    'stage exit must call set_status (pipeline_complete or verify_failed_requires_loop)',
  );
  assert.match(
    body,
    /mcp__gdd_state__checkpoint/,
    'stage exit must call checkpoint to stamp last_checkpoint via MCP',
  );
});

test('verify-migration: orchestration prose (auditor/verifier/integration-checker) unchanged in count', () => {
  const before = readBefore();
  const after = readSkill();
  for (const agent of [
    'design-auditor',
    'design-verifier',
    'design-integration-checker',
  ]) {
    const re = new RegExp(agent, 'g');
    const beforeCount = countMatches(before, re);
    const afterCount = countMatches(after, re);
    assert.equal(
      afterCount,
      beforeCount,
      `count of "${agent}" references must be identical pre/post (before=${beforeCount}, after=${afterCount})`,
    );
  }
});

test('verify-migration: line count within ±15% of pre-migration baseline', () => {
  const before = readBefore().split('\n').length;
  const after = readSkill().split('\n').length;
  const min = Math.floor(before * 0.85);
  const max = Math.ceil(before * 1.15);
  assert.ok(
    after >= min && after <= max,
    `line count drift: before=${before}, after=${after}, allowed [${min}, ${max}]`,
  );
});

test('verify-migration: update_progress fires at every stage checkpoint (0/3, 1/3, 2/3, 3/3)', () => {
  const body = readSkill();
  // Stage-entry open + auditor-done + verifier-done + integration-check-done
  // = at least 4 distinct update_progress calls. The exit call adds a 5th.
  const matches = body.match(/mcp__gdd_state__update_progress/g) || [];
  assert.ok(
    matches.length >= 4,
    `expected ≥4 update_progress calls, got ${matches.length}`,
  );
});

test('verify-migration: connections probes route through probe_connections (no direct write)', () => {
  const body = readSkill();
  assert.match(
    body,
    /mcp__gdd_state__probe_connections/,
    'connection probes must write via probe_connections MCP tool',
  );
  // Probe sections must NOT instruct a direct .design/STATE.md `<connections>` write.
  assert.doesNotMatch(
    body,
    /Write\s+(?:preview|storybook|chromatic)\s+status\s+to\s+\.?design\/STATE\.md/,
    'probe sections must not issue direct STATE.md <connections> writes',
  );
});
