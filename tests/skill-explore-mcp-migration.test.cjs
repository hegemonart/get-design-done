'use strict';
/**
 * skill-explore-mcp-migration
 *
 * Plan 20-08 regression check: `skills/explore/SKILL.md` routes every
 * STATE.md mutation through `gdd-state` MCP tools. Prose, synthesizer
 * contracts, connections-probe outputs, and the handoff to plan are
 * preserved verbatim — only the mutation surface changes.
 *
 * Assertions (static-analysis only; no MCP server is booted):
 *   - Frontmatter `tools:` lists all 7 required MCP tool names.
 *   - Exactly ONE `mcp__gdd_state__transition_stage` invocation in the body
 *     (Stage entry). The frontmatter listing is excluded from the count.
 *   - At most ONE `mcp__gdd_state__probe_connections` invocation in the body
 *     — the batch-commit pattern must not be re-expanded to N calls.
 *   - No prose directs an `Edit`, `Write`, or "update" action at STATE.md
 *     — every STATE.md mutation goes through an MCP tool.
 *   - Mapper/synthesizer prose is preserved: the DESIGN-CONTEXT.md token
 *     count matches the pre-migration baseline.
 *   - Line count is within ±15% of the pre-migration baseline.
 *   - Pre- and post-migration fixtures exist under
 *     `test-fixture/baselines/phase-20/`.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, readFrontmatter } = require('./helpers.ts');

const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'explore', 'SKILL.md');
const FIXTURE_DIR = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-20');
const BEFORE_FIXTURE = path.join(FIXTURE_DIR, 'explore-before.md');
const AFTER_FIXTURE = path.join(FIXTURE_DIR, 'explore-after.md');

const REQUIRED_MCP_TOOLS = [
  'mcp__gdd_state__get',
  'mcp__gdd_state__transition_stage',
  'mcp__gdd_state__probe_connections',
  'mcp__gdd_state__update_progress',
  'mcp__gdd_state__set_status',
  'mcp__gdd_state__add_blocker',
  'mcp__gdd_state__checkpoint',
];

function readBody() {
  return fs.readFileSync(SKILL_PATH, 'utf8');
}

/**
 * Strip the leading YAML frontmatter block so invocation counts reflect the
 * body only. The frontmatter is a declarative listing, not an invocation.
 */
function stripFrontmatter(body) {
  const match = body.match(/^---\n[\s\S]*?\n---\n/);
  return match ? body.slice(match[0].length) : body;
}

function countOccurrences(text, needle) {
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

function countLinesOf(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

test('skill-explore-mcp-migration: SKILL.md exists', () => {
  assert.ok(fs.existsSync(SKILL_PATH), `expected skill file at ${SKILL_PATH}`);
});

test('skill-explore-mcp-migration: frontmatter tools lists all 7 required MCP tool names', () => {
  const fm = readFrontmatter(SKILL_PATH);
  assert.ok(fm.tools, 'frontmatter should declare a `tools` field');
  const toolsRaw = Array.isArray(fm.tools) ? fm.tools.join(',') : String(fm.tools);
  for (const tool of REQUIRED_MCP_TOOLS) {
    assert.ok(
      toolsRaw.includes(tool),
      `frontmatter tools must declare "${tool}" (got: ${toolsRaw})`
    );
  }
});

test('skill-explore-mcp-migration: exactly one transition_stage invocation in body (Stage entry)', () => {
  const body = stripFrontmatter(readBody());
  const count = countOccurrences(body, 'mcp__gdd_state__transition_stage');
  assert.equal(
    count,
    1,
    `expected exactly 1 transition_stage invocation in body, got ${count}`
  );
});

test('skill-explore-mcp-migration: at most one probe_connections invocation in body (batch commit)', () => {
  const body = stripFrontmatter(readBody());
  const count = countOccurrences(body, 'mcp__gdd_state__probe_connections');
  assert.ok(
    count >= 1 && count <= 1,
    `expected exactly 1 probe_connections invocation in body (batch pattern), got ${count}`
  );
});

test('skill-explore-mcp-migration: no prose directs direct Edit/Write/update of STATE.md', () => {
  const body = stripFrontmatter(readBody());
  const forbiddenPatterns = [
    /Edit\s+[`.]*\.design\/STATE\.md/i,
    /Write\s+[`.]*\.design\/STATE\.md/i,
    /Update\s+[`.]*\.design\/STATE\.md/i,
    /Save\s+STATE\.md/i,
  ];
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(
      body,
      pattern,
      `body must not match ${pattern} — STATE.md mutations must go through MCP tools`
    );
  }
});

test('skill-explore-mcp-migration: mapper/synthesizer prose preserved (DESIGN-CONTEXT.md count)', () => {
  assert.ok(
    fs.existsSync(BEFORE_FIXTURE),
    `pre-migration baseline must exist at ${BEFORE_FIXTURE}`
  );
  const beforeBody = fs.readFileSync(BEFORE_FIXTURE, 'utf8');
  const afterBody = readBody();
  const needle = 'DESIGN-CONTEXT.md';
  const beforeCount = countOccurrences(beforeBody, needle);
  const afterCount = countOccurrences(afterBody, needle);
  assert.ok(beforeCount > 0, 'pre-migration baseline should mention DESIGN-CONTEXT.md');
  assert.equal(
    afterCount,
    beforeCount,
    `DESIGN-CONTEXT.md count drifted — mapper/synthesizer prose was altered (before=${beforeCount}, after=${afterCount})`
  );
});

test('skill-explore-mcp-migration: line count within ±15% of pre-migration', () => {
  assert.ok(
    fs.existsSync(BEFORE_FIXTURE),
    `pre-migration baseline must exist at ${BEFORE_FIXTURE}`
  );
  const before = fs.readFileSync(BEFORE_FIXTURE, 'utf8');
  const after = readBody();
  const beforeLines = countLinesOf(before);
  const afterLines = countLinesOf(after);
  const low = Math.floor(beforeLines * 0.85);
  const high = Math.ceil(beforeLines * 1.15);
  assert.ok(
    afterLines >= low && afterLines <= high,
    `line count drift: before=${beforeLines}, after=${afterLines}, allowed ${low}..${high}`
  );
});

test('skill-explore-mcp-migration: regression fixtures exist (before + after)', () => {
  assert.ok(fs.existsSync(BEFORE_FIXTURE), `missing fixture ${BEFORE_FIXTURE}`);
  assert.ok(fs.existsSync(AFTER_FIXTURE), `missing fixture ${AFTER_FIXTURE}`);
});

test('skill-explore-mcp-migration: after.md fixture matches current SKILL.md (normalized)', () => {
  const afterFixture = fs.readFileSync(AFTER_FIXTURE, 'utf8').replace(/\r\n/g, '\n');
  const currentSkill = readBody().replace(/\r\n/g, '\n');
  assert.equal(
    currentSkill,
    afterFixture,
    'post-migration fixture must stay in sync with skills/explore/SKILL.md'
  );
});
