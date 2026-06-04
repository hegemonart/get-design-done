'use strict';
/**
 * tests/skill-surface-sync.test.cjs
 *
 * Phase 28.8 / Batch E3 — manifest-driven command-surface contract test.
 *
 * Locks consistency across four surfaces of the root SKILL.md and the on-disk
 * skills/ tree. Each user-invocable skill should appear in at least one of the
 * three documented surfaces of root SKILL.md:
 *
 *   1. Root SKILL.md `argument-hint` frontmatter alternatives — the
 *      "[brief|explore|plan|...]" string that drives shell completion.
 *   2. Root SKILL.md "## Command Reference" markdown table — the human-facing
 *      catalogue (first column cleaned of trailing arg syntax).
 *   3. Root SKILL.md "## Jump Mode" `/gdd:foo  →  Skill("get-design-done:bar")`
 *      lines — the routing map.
 *
 *   4. skills/ filesystem directories — the ground truth set.
 *
 * Rationale: drift between these surfaces is a recurring failure mode (a skill
 * dir lands without a Jump Mode line, or the frontmatter hint goes stale after a
 * skill rename). This test fails fast on that drift so the docs cannot rot
 * silently away from the code.
 *
 * Exception list — skills that are intentionally NOT user-invocable and
 * therefore never reach a documented surface:
 *   - scan, discover  (deprecated aliases — only present in the table row that
 *     marks them deprecated; treated as intentionally surfaced there)
 *   - connections     (gdd-connections internal wizard skill name)
 *   - router          (deterministic internal routing skill, no model call)
 *   - synthesize      (internal Haiku synthesizer, `user-invocable: false`)
 *   - using-gdd       (bootstrap discipline, `disable-model-invocation: true`)
 *
 * If a new internal skill is added the exception list must be extended
 * deliberately. That is the point — silent additions to skills/ that ship no
 * user surface should be a conscious choice, not an oversight.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

// ---------------------------------------------------------------------------
// Exception list — see header comment for rationale.
// Each entry MUST come with a reason so deletions/additions remain auditable.
// ---------------------------------------------------------------------------
const EXCEPTIONS = new Map([
  ['scan', 'deprecated alias — routed via Jump Mode to gdd-explore'],
  ['discover', 'deprecated alias — routed via Jump Mode to gdd-explore'],
  ['connections', 'internal onboarding wizard (gdd-connections)'],
  ['router', 'internal deterministic router, no user surface'],
  ['synthesize', 'internal Haiku synthesizer (user-invocable: false)'],
  ['using-gdd', 'bootstrap discipline (disable-model-invocation: true)'],
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readRootSkill() {
  const p = path.join(REPO_ROOT, 'SKILL.md');
  assert.ok(fs.existsSync(p), `Root SKILL.md not found at ${p}`);
  return fs.readFileSync(p, 'utf8');
}

/**
 * Parse the YAML frontmatter `argument-hint` value and split its
 * "[alt1|alt2|...]" bracket-list into a Set of tokens.
 */
function parseArgumentHintTokens(content) {
  const fmMatch = content.match(/^---\n([\s\S]+?)\n---/);
  assert.ok(fmMatch, 'Root SKILL.md missing YAML frontmatter');
  const fm = fmMatch[1];

  const hintMatch = fm.match(/^argument-hint:\s*"([^"]+)"/m);
  assert.ok(hintMatch, 'Root SKILL.md frontmatter missing argument-hint');

  const raw = hintMatch[1].trim();
  // Strip leading [ and trailing ]
  const inner = raw.replace(/^\[/, '').replace(/\]$/, '');
  const tokens = new Set(
    inner.split('|').map(s => s.trim()).filter(Boolean)
  );
  return tokens;
}

/**
 * Parse the "## Command Reference" markdown table. Returns the set of
 * first-column command names with arg-syntax stripped (e.g. `figma-write
 * <mode>` → `figma-write`). Skips bold section-header rows like
 * `| **Audit & Session** | | |`.
 */
function parseCommandTableTokens(content) {
  // The table runs from the "## Command Reference" header to the next "## "
  // header. Slice that range so we don't accidentally pick up tables from
  // later sections.
  const startIdx = content.indexOf('## Command Reference');
  assert.ok(startIdx !== -1, 'Root SKILL.md missing "## Command Reference" section');
  const afterStart = content.indexOf('\n## ', startIdx + 1);
  const slice = afterStart === -1 ? content.slice(startIdx) : content.slice(startIdx, afterStart);

  const tokens = new Set();
  const rowRegex = /^\|\s*`([^`]+)`/gm;
  let m;
  while ((m = rowRegex.exec(slice)) !== null) {
    // Take the first whitespace-delimited word from the backticked first cell.
    // e.g. "figma-write <mode>" → "figma-write"
    const cmd = m[1].trim().split(/\s+/)[0];
    if (cmd) tokens.add(cmd);
  }
  // Empty result would mean a parser regression — guard against it.
  assert.ok(tokens.size > 0, 'Command Reference table parsed zero rows');
  return tokens;
}

/**
 * Parse the "## Jump Mode" section's `/gdd:<cmd>  →  Skill("get-design-done:<target>")`
 * lines. Returns two sets:
 *   - cmdTokens: the user-typed command names after `/gdd:`
 *   - skillTokens: the Skill() target names with the `get-design-done:` prefix
 *     stripped (and with both bare and `gdd-`-stripped forms included so a
 *     disk dir `foo` matches a target `gdd-foo`).
 */
function parseJumpModeTokens(content) {
  const startIdx = content.indexOf('## Jump Mode');
  assert.ok(startIdx !== -1, 'Root SKILL.md missing "## Jump Mode" section');
  const afterStart = content.indexOf('\n## ', startIdx + 1);
  const slice = afterStart === -1 ? content.slice(startIdx) : content.slice(startIdx, afterStart);

  const cmdTokens = new Set();
  const skillTokens = new Set();
  // Lines look like:
  //   /gdd:brief     → Skill("get-design-done:gdd-brief")
  //   /gdd:scan      → Skill("get-design-done:gdd-explore")   # deprecated alias → explore
  const lineRegex = /\/gdd:([\w-]+)\s*→\s*Skill\("([^"]+)"/g;
  let m;
  while ((m = lineRegex.exec(slice)) !== null) {
    cmdTokens.add(m[1]);
    const target = m[2].replace(/^get-design-done:/, '');
    skillTokens.add(target);
    if (target.startsWith('gdd-')) skillTokens.add(target.slice(4));
  }
  assert.ok(cmdTokens.size > 0, 'Jump Mode section parsed zero entries');
  return { cmdTokens, skillTokens };
}

/**
 * List all skill subdirectories on disk (sorted, for deterministic failure
 * output).
 */
function listSkillDirs() {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('skill-surface-sync: every skills/ dir appears in at least one root SKILL.md surface (modulo exceptions)', () => {
  const content = readRootSkill();
  const fmTokens = parseArgumentHintTokens(content);
  const tableTokens = parseCommandTableTokens(content);
  const { cmdTokens: jumpCmdTokens, skillTokens: jumpSkillTokens } = parseJumpModeTokens(content);

  const dirs = listSkillDirs();
  const orphans = [];
  for (const dir of dirs) {
    if (EXCEPTIONS.has(dir)) continue;
    const inFm = fmTokens.has(dir);
    const inTable = tableTokens.has(dir);
    const inJump =
      jumpCmdTokens.has(dir) ||
      jumpSkillTokens.has(dir) ||
      jumpSkillTokens.has(`gdd-${dir}`);
    if (!inFm && !inTable && !inJump) {
      orphans.push(dir);
    }
  }

  assert.deepEqual(
    orphans,
    [],
    'Skill directories missing from all three root SKILL.md surfaces ' +
      '(argument-hint frontmatter, Command Reference table, Jump Mode):\n' +
      orphans.map(d => `  - skills/${d}`).join('\n') +
      '\n\nEither (a) document the skill in at least one surface, or ' +
      '(b) add it to EXCEPTIONS in test/suite/skill-surface-sync.test.cjs ' +
      'with a reason it is intentionally undocumented.'
  );
});

test('skill-surface-sync: exception list is not stale (every exception still exists on disk)', () => {
  const dirs = new Set(listSkillDirs());
  const stale = [];
  for (const [name] of EXCEPTIONS) {
    if (!dirs.has(name)) stale.push(name);
  }
  assert.deepEqual(
    stale,
    [],
    'EXCEPTIONS entries reference skills/ dirs that no longer exist:\n' +
      stale.map(d => `  - ${d}`).join('\n') +
      '\nRemove the stale entry from EXCEPTIONS in test/suite/skill-surface-sync.test.cjs.'
  );
});

test('skill-surface-sync: Jump Mode targets do not reference deleted skills', () => {
  const content = readRootSkill();
  const { skillTokens } = parseJumpModeTokens(content);
  const dirs = new Set(listSkillDirs());

  const dangling = [];
  for (const target of skillTokens) {
    // Skip the de-prefixed bare-name forms we synthesized — they're not the
    // verbatim Skill() target. Only test full targets (those that did NOT
    // come from a `gdd-` strip), which means: a target is verbatim iff there
    // is no `gdd-${target}` also in the set.
    // Simpler heuristic: check both `target` and `gdd-target` against dirs —
    // at least one form must exist on disk. (skills/ dir names do not carry
    // the `gdd-` prefix today; the prefix lives only inside the SKILL.md
    // `name:` field.)
    const bare = target.startsWith('gdd-') ? target.slice(4) : target;
    if (!dirs.has(bare) && !dirs.has(target)) {
      dangling.push(target);
    }
  }

  assert.deepEqual(
    dangling,
    [],
    'Jump Mode lines route to Skill() targets that have no skills/ directory:\n' +
      dangling.map(t => `  - ${t}`).join('\n')
  );
});

test('skill-surface-sync: deprecated entries (scan, discover) remain explicitly tagged in the table', () => {
  // Defensive: if someone "cleans up" the deprecated row format, the EXCEPTIONS
  // entry for scan/discover loses its justification. Lock the marker presence
  // so the deprecation is visible to humans reading the table.
  const content = readRootSkill();
  for (const dep of ['scan', 'discover']) {
    const re = new RegExp(`\\|\\s*\`${dep}\`\\s+\\*\\(deprecated\\)\\*`);
    assert.match(
      content,
      re,
      `Expected "${dep}" row in Command Reference to retain "*(deprecated)*" marker`
    );
  }
});
