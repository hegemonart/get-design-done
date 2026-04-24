'use strict';
/**
 * utility-skills-mcp-migration (Plan 20-12)
 *
 * Static-analysis regression suite for the six utility-skill migrations
 * (pause, resume, progress, health, todo, settings). After Plan 20-12
 * migration, every STATE.md read/mutation in these skills goes through
 * `gdd-state` MCP tools introduced in Plan 20-05. The user-facing prose
 * is preserved byte-for-byte modulo the MCP-call substitutions; the
 * before/after baseline pair at `test-fixture/baselines/phase-20/utility-skills/<skill>-{before,after}.md`
 * anchors line-count drift and the `after.md` twin matches the live file.
 *
 * Pattern mirrors tests/skill-*-mcp-migration.test.cjs (Waves B + C) —
 * a single file with one `describe()` per skill, multiple `test()` each.
 *
 * Runtime invocation (confirming the MCP tools actually fire) is covered
 * by tests/mcp-gdd-state.test.ts (Plan 20-05) and the Plan 20-15 end-to-end
 * suite. This suite is a structural drift guard, not a runtime validator.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

// ±20% line-count tolerance per Plan 20-12 success criterion.
const LINE_COUNT_TOLERANCE = 0.20;

const BASELINE_DIR = path.join(
  REPO_ROOT,
  'test-fixture',
  'baselines',
  'phase-20',
  'utility-skills',
);

/**
 * Per-skill test spec. `mutationTools` is the complete set of MCP mutators
 * the skill must reference in its body (beyond `get`). `readOnly` skills
 * may only reference `mcp__gdd_state__get` — any mutator reference fails.
 */
const SKILLS = [
  {
    name: 'pause',
    skillPath: path.join(REPO_ROOT, 'skills', 'pause', 'SKILL.md'),
    requiredTools: [
      'mcp__gdd_state__get',
      'mcp__gdd_state__set_status',
      'mcp__gdd_state__add_blocker',
      'mcp__gdd_state__checkpoint',
    ],
    readOnly: false,
    mutationTools: [
      'mcp__gdd_state__set_status',
      'mcp__gdd_state__checkpoint',
    ],
  },
  {
    name: 'resume',
    skillPath: path.join(REPO_ROOT, 'skills', 'resume', 'SKILL.md'),
    requiredTools: [
      'mcp__gdd_state__get',
      'mcp__gdd_state__set_status',
      'mcp__gdd_state__resolve_blocker',
      'mcp__gdd_state__checkpoint',
    ],
    readOnly: false,
    mutationTools: [
      'mcp__gdd_state__set_status',
      'mcp__gdd_state__checkpoint',
    ],
  },
  {
    name: 'progress',
    skillPath: path.join(REPO_ROOT, 'skills', 'progress', 'SKILL.md'),
    requiredTools: ['mcp__gdd_state__get'],
    readOnly: true,
    mutationTools: [],
  },
  {
    name: 'health',
    skillPath: path.join(REPO_ROOT, 'skills', 'health', 'SKILL.md'),
    requiredTools: ['mcp__gdd_state__get'],
    readOnly: true,
    mutationTools: [],
  },
  {
    name: 'todo',
    skillPath: path.join(REPO_ROOT, 'skills', 'todo', 'SKILL.md'),
    requiredTools: [
      'mcp__gdd_state__get',
      'mcp__gdd_state__add_decision',
      'mcp__gdd_state__add_must_have',
    ],
    readOnly: false,
    mutationTools: [
      'mcp__gdd_state__add_decision',
      'mcp__gdd_state__add_must_have',
    ],
  },
  {
    name: 'settings',
    skillPath: path.join(REPO_ROOT, 'skills', 'settings', 'SKILL.md'),
    requiredTools: [
      'mcp__gdd_state__get',
      'mcp__gdd_state__frontmatter_update',
    ],
    readOnly: false,
    mutationTools: ['mcp__gdd_state__frontmatter_update'],
  },
];

// Every mutator in the 11-tool catalog that a read-only skill must not
// reference. `probe_connections` is also a mutator (writes <connections>)
// but is not used by any utility skill.
const ALL_MUTATORS = [
  'mcp__gdd_state__update_progress',
  'mcp__gdd_state__transition_stage',
  'mcp__gdd_state__add_blocker',
  'mcp__gdd_state__resolve_blocker',
  'mcp__gdd_state__add_decision',
  'mcp__gdd_state__add_must_have',
  'mcp__gdd_state__set_status',
  'mcp__gdd_state__checkpoint',
  'mcp__gdd_state__probe_connections',
  'mcp__gdd_state__frontmatter_update',
];

// Utility skills must never issue a stage transition — that discipline
// belongs to the five stage skills only (brief/explore/plan/design/verify).
const FORBIDDEN_UTILITY_TOOLS = ['mcp__gdd_state__transition_stage'];

// Patterns that indicate direct STATE.md mutation paths the migration
// should have eliminated. These are checked against every utility skill
// body without exception — unlike `brief`, utility skills have no
// bootstrap exception (the brief skill owns STATE.md seeding).
const FORBIDDEN_STATE_MUTATION_PATTERNS = [
  { name: 'Edit on .design/STATE.md', re: /Edit\s+[^\n]*\.design\/STATE\.md/i },
  { name: 'Write on .design/STATE.md', re: /Write\s+[^\n]*\.design\/STATE\.md/i },
  { name: 'sed -i on STATE.md', re: /sed\s+-i[^\n]*STATE\.md/i },
  { name: 'awk targeting STATE.md', re: /awk[^\n]*STATE\.md/i },
];

function readSkill(skillPath) {
  return fs.readFileSync(skillPath, 'utf8');
}

function frontmatter(body) {
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

function bodyOnly(body) {
  // Strip the frontmatter block so "tools:" references don't count as
  // "mutation tool calls in body" for the readOnly and mutation-presence
  // assertions.
  return body.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const spec of SKILLS) {
  const {
    name,
    skillPath,
    requiredTools,
    readOnly,
    mutationTools,
  } = spec;

  const beforePath = path.join(BASELINE_DIR, `${name}-before.md`);
  const afterPath = path.join(BASELINE_DIR, `${name}-after.md`);

  describe(`utility-skill ${name}: Plan 20-12 migration`, () => {
    test('SKILL.md and baseline fixtures exist', () => {
      assert.ok(
        fs.existsSync(skillPath),
        `expected skill file at ${skillPath}`,
      );
      assert.ok(
        fs.existsSync(beforePath),
        `expected pre-migration baseline at ${beforePath}`,
      );
      assert.ok(
        fs.existsSync(afterPath),
        `expected post-migration baseline at ${afterPath}`,
      );
    });

    test('frontmatter tools lists all required MCP entries', () => {
      const fm = frontmatter(readSkill(skillPath));
      for (const tool of requiredTools) {
        assert.match(
          fm,
          new RegExp(escapeRegex(tool)),
          `frontmatter tools: should list "${tool}"`,
        );
      }
    });

    test('no direct STATE.md mutation phrasings in body', () => {
      const body = bodyOnly(readSkill(skillPath));
      for (const { name: patternName, re } of FORBIDDEN_STATE_MUTATION_PATTERNS) {
        assert.doesNotMatch(
          body,
          re,
          `SKILL.md body must not contain "${patternName}" — STATE.md mutations belong to MCP`,
        );
      }
    });

    test('does not call forbidden utility tools (e.g. transition_stage)', () => {
      const body = bodyOnly(readSkill(skillPath));
      for (const tool of FORBIDDEN_UTILITY_TOOLS) {
        // Match INVOCATIONS, not prose mentions. An invocation is the tool
        // name in backticks followed by `with` or `call` / `Call` — mirrors
        // the verify-migration test (tests/skill-verify-mcp-migration.test.cjs).
        // This lets skills explicitly document "do not call X" without
        // tripping the guard.
        const invocationRe = new RegExp(
          `(?:[Cc]all\\s+)?\`${escapeRegex(tool)}\`\\s+with\\b`,
        );
        assert.doesNotMatch(
          body,
          invocationRe,
          `utility skill must not invoke "${tool}" — stage transitions belong to stage skills only`,
        );
      }
    });

    if (readOnly) {
      test('read-only skill references only mcp__gdd_state__get (no mutators)', () => {
        const body = bodyOnly(readSkill(skillPath));
        for (const tool of ALL_MUTATORS) {
          assert.doesNotMatch(
            body,
            new RegExp(escapeRegex(tool)),
            `read-only skill "${name}" must not reference mutator "${tool}"`,
          );
        }
        // And it MUST reference get at least once.
        assert.match(
          body,
          /mcp__gdd_state__get/,
          `read-only skill "${name}" must reference mcp__gdd_state__get`,
        );
      });
    } else {
      test('mutation skill calls its declared MCP mutators in body', () => {
        const body = bodyOnly(readSkill(skillPath));
        for (const tool of mutationTools) {
          assert.match(
            body,
            new RegExp(escapeRegex(tool)),
            `mutation skill "${name}" must call mutator "${tool}" in body`,
          );
        }
      });
    }

    test('line count within ±20% of pre-migration baseline', () => {
      const before = fs.readFileSync(beforePath, 'utf8').split('\n').length;
      const after = readSkill(skillPath).split('\n').length;
      const delta = Math.abs(after - before) / before;
      assert.ok(
        delta <= LINE_COUNT_TOLERANCE,
        `line count drift ${(delta * 100).toFixed(1)}% exceeds ±${(LINE_COUNT_TOLERANCE * 100).toFixed(0)}% ` +
          `(before=${before}, after=${after})`,
      );
    });

    test('post-migration baseline matches current SKILL.md byte-for-byte', () => {
      const afterFixture = fs.readFileSync(afterPath, 'utf8');
      const live = readSkill(skillPath);
      assert.equal(
        live,
        afterFixture,
        `${afterPath} must match ${skillPath} byte-for-byte ` +
          `(regen the fixture if the skill intentionally changed)`,
      );
    });
  });
}

// Skill-specific assertions that don't fit the shared per-skill loop.

describe('utility-skill settings: stage-patch guard prose', () => {
  const skillPath = path.join(REPO_ROOT, 'skills', 'settings', 'SKILL.md');

  test('body contains the "cannot patch stage" guard phrase', () => {
    const body = readSkill(skillPath);
    // Plan 20-12 Task 6 locks the exact rejection message; this test
    // enforces the load-bearing phrase so future edits don't silently
    // drop the user-facing guard.
    assert.match(
      body,
      /cannot patch\s+`?stage`?/i,
      'settings skill must document the stage-patch guard ("cannot patch stage")',
    );
    assert.match(
      body,
      /Use \/gdd:brief, \/gdd:explore/,
      'settings skill must route stage transitions to the stage skills in its rejection message',
    );
  });
});

describe('utility-skill progress: snapshot reuse', () => {
  const skillPath = path.join(REPO_ROOT, 'skills', 'progress', 'SKILL.md');

  test('<connections> check sources the MCP get snapshot, not direct STATE.md', () => {
    const body = readSkill(skillPath);
    // The first-run nudge and forensic Check 6 both reference
    // <connections> — after migration, both must source the MCP snapshot
    // rather than a fresh STATE.md read.
    assert.match(
      body,
      /`<connections>`[^\n]*(?:mcp__gdd_state__get|snapshot)/,
      'progress skill must source <connections> from the MCP get snapshot',
    );
  });
});

describe('utility-skill pause/resume: status-prefix contract', () => {
  const pausePath = path.join(REPO_ROOT, 'skills', 'pause', 'SKILL.md');
  const resumePath = path.join(REPO_ROOT, 'skills', 'resume', 'SKILL.md');

  test('pause writes paused:<prior> prefix via set_status', () => {
    const body = readSkill(pausePath);
    assert.match(
      body,
      /paused:<prior-status>/,
      'pause skill must document the `paused:<prior-status>` prefix contract',
    );
  });

  test('resume parses paused:<prior> prefix to restore prior status', () => {
    const body = readSkill(resumePath);
    assert.match(
      body,
      /paused:<prior>/,
      'resume skill must parse the `paused:<prior>` prefix to restore prior status',
    );
  });
});
