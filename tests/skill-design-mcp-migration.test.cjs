'use strict';
/**
 * skill-design-mcp-migration
 *
 * Static-analysis regression test for Plan 20-10: verifies that
 * `skills/design/SKILL.md` routes STATE.md mutations through the
 * `gdd-state` MCP tools introduced in Plan 20-05, while preserving
 * the worktree-isolation orchestration and design-executor spawn
 * discipline byte-for-byte.
 *
 * Design is the stage most affected by Phase 10.1 parallelism —
 * multiple executors run concurrently in worktrees and each needs to
 * update `<position>` `task_progress` as they complete their batch.
 * The lockfile (Plan 20-01) + MCP serialization + event stream
 * (Plan 20-06) are what make concurrent executor reports safe; the
 * executor-spawn prompt inside this skill propagates the MCP contract
 * to sub-agents so they never `Read` + `Write` STATE.md directly.
 *
 * Runtime validation of the actual tool-call sequence under parallel
 * load is deferred to Plan 20-15's race-condition + end-to-end test.
 *
 * Baselines:
 *   - test-fixture/baselines/phase-20/design-before.md — pre-migration
 *     snapshot (anchors line-count tolerance + worktree-count parity).
 *   - test-fixture/baselines/phase-20/design-after.md — post-migration
 *     snapshot (human review aid; asserted byte-identical to live file).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'design', 'SKILL.md');
const BEFORE_PATH = path.join(
  REPO_ROOT,
  'test-fixture',
  'baselines',
  'phase-20',
  'design-before.md',
);
const AFTER_PATH = path.join(
  REPO_ROOT,
  'test-fixture',
  'baselines',
  'phase-20',
  'design-after.md',
);

// ±15% line-count tolerance per plan 20-10 success criterion.
const LINE_COUNT_TOLERANCE = 0.15;

// The 7 MCP tool names required in the frontmatter per the plan spec.
const REQUIRED_TOOLS = [
  'mcp__gdd_state__get',
  'mcp__gdd_state__transition_stage',
  'mcp__gdd_state__update_progress',
  'mcp__gdd_state__set_status',
  'mcp__gdd_state__add_blocker',
  'mcp__gdd_state__resolve_blocker',
  'mcp__gdd_state__checkpoint',
];

// Patterns that indicate direct STATE.md mutation paths the migration
// is supposed to have eliminated. Evaluated against the body of the
// skill EXCLUDING quoted prose inside the STATE.md mutation protocol
// block (the protocol quote INSTRUCTS executors to not do these things;
// it is the one intentional mention). Also excluded: `@.design/STATE.md`
// required_reading references in Task() prompts (reads, not writes).
const FORBIDDEN_STATE_MUTATION_PATTERNS = [
  { name: 'Edit on .design/STATE.md', re: /Edit[^\n]*\.design\/STATE\.md/i },
  // Phase 28.5 closeout: line-scoped to avoid false-positive matches
  // across paragraph boundaries (e.g., "## Figma Write Dispatch\n...if
  // STATE.md..."). The narrative `Write` we want to forbid is a same-line
  // imperative directing a write to STATE.md; an unrelated heading that
  // happens to contain "Write" must not trip the guard.
  { name: 'Write to STATE.md (narrative)', re: /Write[^\n`]*STATE\.md(?!`)/ },
  { name: 'sed -i on STATE.md', re: /sed\s+-i[^\n]*STATE\.md/i },
  { name: 'awk targeting STATE.md', re: /awk[^\n]*STATE\.md/i },
];

function readSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf8');
}

/**
 * Phase 28.5 closeout (Plan 28.5-12): the Bucket 1 pipeline-stage rework
 * (Plan 28.5-04) moved the verbatim executor-prompt blocks (parallel
 * batch + sequential tail + STATE.md mutation protocol + worktree merge
 * orchestration) out of skills/design/SKILL.md and into
 * reference/design-procedure.md per the progressive-disclosure rule
 * (SKILL.md must stay <=100 lines). The SKILL.md keeps a 1-line summary
 * + a "See: reference/design-procedure.md" link.
 *
 * For content-preservation assertions (worktree count, is_parallel
 * forwarding, design-executor spawn-site count, STATE.md mutation
 * protocol block presence), the test now reads SKILL.md AND
 * reference/design-procedure.md together as the canonical surface.
 * This preserves the spirit of "content stable across the migration"
 * while accommodating the Phase 28.5 extraction.
 */
const PROCEDURE_PATH = path.join(
  REPO_ROOT,
  'reference',
  'design-procedure.md',
);

function readSkillSurface() {
  const skill = fs.readFileSync(SKILL_PATH, 'utf8');
  const procedure = fs.existsSync(PROCEDURE_PATH)
    ? fs.readFileSync(PROCEDURE_PATH, 'utf8')
    : '';
  return skill + '\n\n' + procedure;
}

function frontmatter(body) {
  // Frontmatter is the first `---`-delimited block starting at line 1.
  return body.split('---')[1] || '';
}

/**
 * Remove the STATE.md mutation protocol block (the blockquote that
 * INSTRUCTS executors not to mutate STATE.md directly — it mentions
 * `Read` + `Write` as forbidden patterns, which would otherwise trip
 * the forbidden-pattern assertions). This is the one legitimate
 * mention of those patterns in the post-migration skill.
 */
function bodyWithoutProtocolBlock(body) {
  return body.replace(
    /> \*\*STATE\.md mutation protocol\*\*[\s\S]*?Direct writes corrupt parallel state\./,
    '',
  );
}

/**
 * Body of the skill with frontmatter removed — used when we want to
 * count occurrences in the prose only (excludes the `tools:` list,
 * which legitimately contains every MCP tool name).
 */
function bodyWithoutFrontmatter(body) {
  return body.replace(/^---\n[\s\S]*?\n---\n/, '');
}

test('skill-design-mcp-migration: SKILL.md exists', () => {
  assert.ok(
    fs.existsSync(SKILL_PATH),
    `expected skill file at ${SKILL_PATH}`,
  );
});

test('skill-design-mcp-migration: baseline fixtures exist', () => {
  assert.ok(
    fs.existsSync(BEFORE_PATH),
    `expected pre-migration baseline at ${BEFORE_PATH}`,
  );
  assert.ok(
    fs.existsSync(AFTER_PATH),
    `expected post-migration baseline at ${AFTER_PATH}`,
  );
});

test('skill-design-mcp-migration: frontmatter tools lists all 7 required MCP entries', () => {
  const fm = frontmatter(readSkill());
  for (const tool of REQUIRED_TOOLS) {
    assert.match(
      fm,
      new RegExp(tool),
      `frontmatter tools: should list "${tool}"`,
    );
  }
});

test('skill-design-mcp-migration: exactly one transition_stage call in prose', () => {
  // Exclude the frontmatter `tools:` declaration — it's a capability
  // declaration, not a call. The prose must contain exactly one
  // invocation of `mcp__gdd_state__transition_stage` (Stage entry).
  const prose = bodyWithoutFrontmatter(readSkill());
  const matches = prose.match(/mcp__gdd_state__transition_stage/g) || [];
  assert.equal(
    matches.length,
    1,
    `expected exactly 1 transition_stage call in prose, found ${matches.length}`,
  );
});

test('skill-design-mcp-migration: executor-spawn prompt contains STATE.md mutation protocol block', () => {
  // Phase 28.5-04 moved the verbatim executor-prompt blocks (including
  // the STATE.md mutation protocol) to reference/design-procedure.md per
  // the <=100-line SKILL.md authoring contract. The assertion now checks
  // the SKILL + reference graph (readSkillSurface) so content presence
  // is preserved across the extraction.
  const body = readSkillSurface();
  // The block starts with a unique phrase the plan specifies verbatim.
  assert.match(
    body,
    /STATE\.md mutation protocol/,
    'SKILL.md (or its linked reference) must embed the "STATE.md mutation protocol" block for spawned executors',
  );
  // And must explicitly tell executors to funnel mutations through MCP tools.
  assert.match(
    body,
    /update STATE\.md ONLY via the `gdd-state` MCP tools/,
    'STATE.md mutation protocol must direct executors to use gdd-state MCP tools exclusively',
  );
  // And must forbid direct Read + Write on STATE.md.
  assert.match(
    body,
    /Do NOT `Read` \+ `Write` `\.design\/STATE\.md` directly/,
    'STATE.md mutation protocol must forbid direct Read+Write on STATE.md',
  );
});

test('skill-design-mcp-migration: no direct STATE.md mutation outside the protocol block', () => {
  // Scope to skills/design/SKILL.md only — the SKILL must not contain
  // direct STATE.md mutation language (the protocol-block prose lives in
  // reference/design-procedure.md after Plan 28.5-04). Strip any
  // protocol-block prose still inline (defensive) before asserting.
  const body = bodyWithoutProtocolBlock(readSkill());
  for (const { name, re } of FORBIDDEN_STATE_MUTATION_PATTERNS) {
    assert.doesNotMatch(
      body,
      re,
      `SKILL.md must not contain "${name}" outside the STATE.md mutation protocol block`,
    );
  }
});

test('skill-design-mcp-migration: worktree isolation orchestration preserved', () => {
  // The plan's hard constraint: the `worktree` / `Worktree` reference
  // count must be unchanged pre/post migration. This guards the core
  // Phase 10.1 parallelism prose (isolation flag, merge pattern,
  // is_parallel forwarding) against accidental rewrites.
  //
  // Phase 28.5-04 moved the verbatim executor-prompt blocks (where most
  // worktree references live) to reference/design-procedure.md per the
  // <=100-line authoring contract. The assertion now reads SKILL +
  // linked reference (readSkillSurface) so the count is preserved
  // across the extraction.
  const before = fs.readFileSync(BEFORE_PATH, 'utf8');
  const after = readSkillSurface();
  const beforeCount = (before.match(/worktree|Worktree/g) || []).length;
  const afterCount = (after.match(/worktree|Worktree/g) || []).length;
  assert.ok(
    afterCount >= beforeCount,
    `worktree reference count regressed: before=${beforeCount}, after=${afterCount} ` +
      '— the worktree-isolation prose must remain (post-Phase-28.5 the canonical ' +
      'count lives in SKILL + reference/design-procedure.md combined; mentions may ' +
      'increase as the procedure ref adds context but must not drop below the baseline).',
  );
  // Sanity check: the baseline we anchored against actually references
  // worktrees (we're not silently passing on a broken baseline).
  assert.ok(
    beforeCount >= 5,
    `pre-migration baseline unexpectedly light on worktree mentions (${beforeCount})`,
  );
});

test('skill-design-mcp-migration: is_parallel forwarding prose preserved', () => {
  // Phase 28.5-04 extraction: is_parallel forwarding prose now lives in
  // reference/design-procedure.md alongside the verbatim executor blocks.
  // Read SKILL + reference graph to assert preservation across the
  // extraction.
  const before = fs.readFileSync(BEFORE_PATH, 'utf8');
  const after = readSkillSurface();
  const beforeParallel = (before.match(/is_parallel/g) || []).length;
  const afterParallel = (after.match(/is_parallel/g) || []).length;
  assert.ok(
    afterParallel >= beforeParallel,
    `is_parallel mention count regressed: before=${beforeParallel}, after=${afterParallel} ` +
      '(post-Phase-28.5 surface = SKILL + reference/design-procedure.md)',
  );
});

test('skill-design-mcp-migration: design-executor spawn prose preserved', () => {
  // Spawning design-executor via `Task("design-executor", ...)` calls
  // is the beating heart of this skill. Both the parallel-batch and
  // sequential-tail variants must survive the migration intact.
  //
  // Phase 28.5-04 extraction: verbatim spawn-site prompts moved to
  // reference/design-procedure.md per <=100-line authoring contract.
  // Read SKILL + reference graph to assert preservation.
  const before = fs.readFileSync(BEFORE_PATH, 'utf8');
  const after = readSkillSurface();
  const beforeCount = (before.match(/Task\("design-executor"/g) || []).length;
  const afterCount = (after.match(/Task\("design-executor"/g) || []).length;
  assert.ok(
    afterCount >= beforeCount,
    `Task("design-executor", ...) spawn-site count regressed: ` +
      `before=${beforeCount}, after=${afterCount} ` +
      '(post-Phase-28.5 surface = SKILL + reference/design-procedure.md)',
  );
});

test('skill-design-mcp-migration: line count within ±15% of pre-migration', () => {
  // Phase 28.5 closeout (Plan 28.5-12) re-anchored line-count tolerance
  // from BEFORE_PATH (pre-Plan-20-10) to AFTER_PATH (post-Plan-20-10,
  // post-Phase-28.5) because Plan 28.5-04 intentionally trimmed
  // skills/design/SKILL.md to the <=100-line authoring contract by
  // extracting executor-prompt + procedure detail to
  // reference/design-procedure.md. Drift is now measured against the
  // regenerated post-migration baseline.
  const baseline = fs.readFileSync(AFTER_PATH, 'utf8');
  const live = readSkill();
  const baselineLines = baseline.split('\n').length;
  const liveLines = live.split('\n').length;
  const delta = Math.abs(liveLines - baselineLines) / baselineLines;
  assert.ok(
    delta <= LINE_COUNT_TOLERANCE,
    `SKILL.md line count drift ${(delta * 100).toFixed(1)}% exceeds ` +
      `±${(LINE_COUNT_TOLERANCE * 100).toFixed(0)}% tolerance ` +
      `(after-baseline=${baselineLines}, live=${liveLines})`,
  );
});

test('skill-design-mcp-migration: post-migration baseline matches current SKILL.md', () => {
  // design-after.md is a human-readable snapshot — it should match the
  // live file. If this fails, either the snapshot is stale (update the
  // fixture) or the live file drifted (intentional? rerun plan 20-10
  // or document the delta in a follow-on summary).
  const after = fs.readFileSync(AFTER_PATH, 'utf8');
  const live = readSkill();
  assert.equal(
    live,
    after,
    'test-fixture/baselines/phase-20/design-after.md must match ' +
      'skills/design/SKILL.md byte-for-byte (regen the fixture if the ' +
      'skill intentionally changed).',
  );
});
