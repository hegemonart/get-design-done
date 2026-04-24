'use strict';
/**
 * skill-brief-mcp-migration
 *
 * Static-analysis regression test for Plan 20-07: verifies that
 * `skills/brief/SKILL.md` routes STATE.md mutations through the
 * `gdd-state` MCP tools introduced in Plan 20-05, while preserving
 * user-facing interview prose byte-for-byte.
 *
 * Runtime invocation of the skill (confirming the actual MCP tool
 * calls fire in the right order) requires live Claude Code + MCP
 * server and is deferred to Plan 20-15's end-to-end suite.
 *
 * Baselines:
 *   - test-fixture/baselines/phase-20/brief-before.md — pre-migration
 *     snapshot used to anchor interview prose + line-count tolerance.
 *   - test-fixture/baselines/phase-20/brief-after.md — post-migration
 *     snapshot (human review aid; not asserted against runtime SKILL.md).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'brief', 'SKILL.md');
const BEFORE_PATH = path.join(
  REPO_ROOT,
  'test-fixture',
  'baselines',
  'phase-20',
  'brief-before.md',
);
const AFTER_PATH = path.join(
  REPO_ROOT,
  'test-fixture',
  'baselines',
  'phase-20',
  'brief-after.md',
);

// ±15% line-count tolerance per plan 20-07 success criterion.
const LINE_COUNT_TOLERANCE = 0.15;

// The five interview question prompts from Step 2 of the pre-migration
// skill. They must appear verbatim post-migration.
const INTERVIEW_PROMPTS = [
  'What design problem are we solving? (user-facing outcome)',
  'Who is the primary audience? (role, device, context)',
  'What constraints apply? (tech stack, brand, time, a11y requirements)',
  'How will we measure success? (specific metrics or outcomes)',
  'What is in/out of scope for this cycle?',
];

// Patterns that indicate direct STATE.md mutation paths the migration
// is supposed to have eliminated. Each pattern is evaluated against
// the body of the skill EXCLUDING the bootstrap exception block (the
// one intentional Write remaining after migration).
const FORBIDDEN_STATE_MUTATION_PATTERNS = [
  { name: 'Edit on .design/STATE.md', re: /Edit[^\n]*\.design\/STATE\.md/i },
  { name: 'Write on .design/STATE.md', re: /Write[^\n]*\.design\/STATE\.md/i },
  { name: 'sed -i on STATE.md', re: /sed\s+-i[^\n]*STATE\.md/i },
  { name: 'awk targeting STATE.md', re: /awk[^\n]*STATE\.md/i },
];

function readSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf8');
}

function frontmatter(body) {
  // Frontmatter is the first `---`-delimited block starting at line 1.
  return body.split('---')[1] || '';
}

/**
 * Strip the bootstrap exception paragraph (Step 4 heading + content up to
 * the next `##` heading). This is where the one permitted Write on
 * STATE.md lives; the rest of the skill must be free of direct-mutation
 * markers.
 */
function bodyWithoutBootstrap(body) {
  return body.replace(
    /## Step 4 — Bootstrap STATE\.md[\s\S]*?(?=\n## Step 5 —)/,
    '',
  );
}

test('skill-brief-mcp-migration: SKILL.md exists', () => {
  assert.ok(
    fs.existsSync(SKILL_PATH),
    `expected skill file at ${SKILL_PATH}`,
  );
});

test('skill-brief-mcp-migration: baseline fixtures exist', () => {
  assert.ok(
    fs.existsSync(BEFORE_PATH),
    `expected pre-migration baseline at ${BEFORE_PATH}`,
  );
  assert.ok(
    fs.existsSync(AFTER_PATH),
    `expected post-migration baseline at ${AFTER_PATH}`,
  );
});

test('skill-brief-mcp-migration: frontmatter tools lists MCP entries', () => {
  const fm = frontmatter(readSkill());
  const required = [
    'mcp__gdd_state__frontmatter_update',
    'mcp__gdd_state__set_status',
    'mcp__gdd_state__update_progress',
    'mcp__gdd_state__get',
  ];
  for (const tool of required) {
    assert.match(
      fm,
      new RegExp(tool.replace(/_/g, '_')),
      `frontmatter tools: should list "${tool}"`,
    );
  }
});

test('skill-brief-mcp-migration: bootstrap exception comment present', () => {
  const body = readSkill();
  assert.match(
    body,
    /BOOTSTRAP EXCEPTION/,
    'SKILL.md must document the STATE.md bootstrap exception inline',
  );
});

test('skill-brief-mcp-migration: no direct STATE.md mutation outside bootstrap', () => {
  const body = bodyWithoutBootstrap(readSkill());
  for (const { name, re } of FORBIDDEN_STATE_MUTATION_PATTERNS) {
    assert.doesNotMatch(
      body,
      re,
      `SKILL.md must not contain "${name}" outside the bootstrap exception block`,
    );
  }
});

test('skill-brief-mcp-migration: Step 5 calls mcp__gdd_state__update_progress', () => {
  const body = readSkill();
  // Extract Step 5 block (heading through end-of-file or next `##` at root).
  const match = body.match(/## Step 5 —[\s\S]*?(?=\n## |$)/);
  assert.ok(match, 'SKILL.md must have a "## Step 5 —" heading');
  assert.match(
    match[0],
    /mcp__gdd_state__update_progress/,
    'Step 5 must call mcp__gdd_state__update_progress at least once',
  );
});

test('skill-brief-mcp-migration: interview prompts preserved verbatim', () => {
  const body = readSkill();
  for (const prompt of INTERVIEW_PROMPTS) {
    // Escape regex metacharacters in the literal prompt.
    const escaped = prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      body,
      new RegExp(escaped),
      `interview prompt must appear verbatim: "${prompt}"`,
    );
  }
});

test('skill-brief-mcp-migration: interview prompts also present in pre-migration baseline', () => {
  // Sanity check: the baseline we anchored against actually contains the
  // prompts we're asserting. Guards against accidental baseline corruption.
  const before = fs.readFileSync(BEFORE_PATH, 'utf8');
  for (const prompt of INTERVIEW_PROMPTS) {
    const escaped = prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      before,
      new RegExp(escaped),
      `pre-migration baseline must contain prompt: "${prompt}"`,
    );
  }
});

test('skill-brief-mcp-migration: line count within ±15% of pre-migration', () => {
  const before = fs.readFileSync(BEFORE_PATH, 'utf8');
  const after = fs.readFileSync(SKILL_PATH, 'utf8');
  const beforeLines = before.split('\n').length;
  const afterLines = after.split('\n').length;
  const delta = Math.abs(afterLines - beforeLines) / beforeLines;
  assert.ok(
    delta <= LINE_COUNT_TOLERANCE,
    `SKILL.md line count drift ${(delta * 100).toFixed(1)}% exceeds ` +
      `±${(LINE_COUNT_TOLERANCE * 100).toFixed(0)}% tolerance ` +
      `(before=${beforeLines}, after=${afterLines})`,
  );
});

test('skill-brief-mcp-migration: post-migration baseline matches current SKILL.md', () => {
  // brief-after.md is a human-readable snapshot — it should match the
  // live file. If this fails, either the snapshot is stale (update the
  // fixture) or the live file drifted (intentional? run plan 20-07
  // again or document the delta).
  const after = fs.readFileSync(AFTER_PATH, 'utf8');
  const live = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.equal(
    live,
    after,
    'test-fixture/baselines/phase-20/brief-after.md must match ' +
      'skills/brief/SKILL.md byte-for-byte (regen the fixture if the ' +
      'skill intentionally changed).',
  );
});
