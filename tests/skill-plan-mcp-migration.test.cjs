'use strict';
/**
 * skill-plan-mcp-migration (Plan 20-09)
 *
 * Static-analysis migration checks for skills/plan/SKILL.md.
 *
 * After Plan 20-09 migration, every STATE.md mutation in skills/plan/SKILL.md
 * goes through `gdd-state` MCP tools. Prose (research orchestration,
 * planner-checker loop, DESIGN-PLAN.md write instructions) is preserved
 * byte-identical from the pre-migration snapshot. This test suite is a
 * structural guard against drift, not a runtime validator — the MCP tools
 * themselves are exercised by tests/mcp-gdd-state.test.ts (Plan 20-05).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'plan', 'SKILL.md');
const BEFORE_PATH = path.join(
  REPO_ROOT,
  'test-fixture',
  'baselines',
  'phase-20',
  'plan-before.md'
);

function readSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf8');
}

function readFrontmatter(body) {
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

// Required MCP tools per Plan 20-09 contract (8 total).
const REQUIRED_MCP_TOOLS = [
  'mcp__gdd_state__get',
  'mcp__gdd_state__transition_stage',
  'mcp__gdd_state__add_decision',
  'mcp__gdd_state__add_must_have',
  'mcp__gdd_state__update_progress',
  'mcp__gdd_state__set_status',
  'mcp__gdd_state__add_blocker',
  'mcp__gdd_state__checkpoint',
];

test('plan-migration: SKILL.md exists', () => {
  assert.ok(fs.existsSync(SKILL_PATH), `expected skill file at ${SKILL_PATH}`);
});

test('plan-migration: frontmatter tools line contains all 8 required MCP tools', () => {
  const fm = readFrontmatter(readSkill());
  for (const tool of REQUIRED_MCP_TOOLS) {
    assert.match(
      fm,
      new RegExp(tool.replace(/[_$]/g, (c) => `\\${c}`)),
      `frontmatter should list "${tool}" in tools`
    );
  }
});

test('plan-migration: exactly one transition_stage call at stage entry', () => {
  const body = readSkill();
  // An actual CALL takes the form `...transition_stage` with `to: "..."`. The
  // frontmatter `tools:` line and the stage-exit documentation prose reference
  // the tool name without invoking it; we explicitly exclude those.
  const calls = body.match(/`mcp__gdd_state__transition_stage`\s+with\b/g) || [];
  assert.equal(
    calls.length,
    1,
    `expected exactly 1 transition_stage call (stage entry), got ${calls.length}`
  );
  // And the one call must target the "plan" stage.
  assert.match(
    body,
    /`mcp__gdd_state__transition_stage`\s+with\s+`to:\s+"plan"`/,
    'the single transition_stage call must set to: "plan"'
  );
});

test('plan-migration: add_decision appears (per-D-XX sequential calls)', () => {
  const body = readSkill();
  assert.match(
    body,
    /mcp__gdd_state__add_decision/,
    'research-synthesis block must call add_decision per D-XX'
  );
});

test('plan-migration: add_must_have appears (per-M-XX sequential calls)', () => {
  const body = readSkill();
  assert.match(
    body,
    /mcp__gdd_state__add_must_have/,
    'research-synthesis block must call add_must_have per M-XX'
  );
});

test('plan-migration: parallelism-decision workaround comment is present', () => {
  const body = readSkill();
  // Per Plan 20-09, parallelism decision is carried via update_progress status
  // string until a dedicated tool ships. The comment is load-bearing — it
  // documents the deliberate workaround so future readers do not file a bug.
  assert.match(
    body,
    /status string of an update_progress/,
    'parallelism-decision documentation comment must reference the update_progress status-string carrier'
  );
});

test('plan-migration: no direct Edit/Write phrasings against STATE.md', () => {
  const body = readSkill();
  assert.doesNotMatch(
    body,
    /Edit \.design\/STATE\.md/,
    'skill must not instruct a direct Edit on .design/STATE.md (use MCP tools)'
  );
  assert.doesNotMatch(
    body,
    /Write \.design\/STATE\.md/,
    'skill must not instruct a direct Write on .design/STATE.md (use MCP tools)'
  );
});

test('plan-migration: line count within ±15% of pre-migration baseline', () => {
  const before = fs.readFileSync(BEFORE_PATH, 'utf8').split('\n').length;
  const after = fs.readFileSync(SKILL_PATH, 'utf8').split('\n').length;
  const min = Math.floor(before * 0.85);
  const max = Math.ceil(before * 1.15);
  assert.ok(
    after >= min && after <= max,
    `line count drift: before=${before}, after=${after}, allowed [${min}, ${max}]`
  );
});

test('plan-migration: update_progress is invoked (progress ticks + parallelism)', () => {
  const body = readSkill();
  const matches = body.match(/mcp__gdd_state__update_progress/g) || [];
  // At least: parallelism status + three task_progress ticks (1/3, 1/3 after map, 2/3, 3/3)
  assert.ok(
    matches.length >= 4,
    `expected ≥4 update_progress calls, got ${matches.length}`
  );
});

test('plan-migration: stage-exit calls checkpoint (no direct last_checkpoint write)', () => {
  const body = readSkill();
  assert.match(
    body,
    /mcp__gdd_state__checkpoint/,
    'stage exit must call checkpoint to stamp last_checkpoint via MCP'
  );
});
