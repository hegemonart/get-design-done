'use strict';
/**
 * test/suite/skill-dispatch-syntax.test.cjs
 *
 * Catches the v1.27.1 audit's most embarrassing finding: skills/figma-write
 * shipped a Dispatch section using `<agent>design-figma-writer</agent>` —
 * a syntax that does not exist anywhere in Claude Code. The entire
 * figma-write skill silently no-op'd because nothing parses that tag.
 *
 * The canonical dispatch syntax is `Task("<agent-name>", "...")` (or a
 * fenced code block containing it). Any skill that contains
 * `<agent>X</agent>` is broken.
 *
 * Scope: skills/*\/SKILL.md and scripts/skill-templates/*\/SKILL.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function listSkillMds(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(root, d.name, 'SKILL.md'))
    .filter(p => fs.existsSync(p));
}

const SKILL_PATHS = [
  ...listSkillMds(path.join(REPO_ROOT, 'skills')),
  ...listSkillMds(path.join(REPO_ROOT, 'scripts', 'skill-templates')),
];

test('skill-dispatch: no skill uses the invented `<agent>X</agent>` dispatch syntax', () => {
  const offenders = [];
  // Match `<agent>X</agent>` — never legal as a dispatch directive.
  const BAD_RE = /<agent>[a-z0-9_-]+<\/agent>/i;
  for (const p of SKILL_PATHS) {
    const body = fs.readFileSync(p, 'utf8');
    if (BAD_RE.test(body)) {
      offenders.push(path.relative(REPO_ROOT, p).replace(/\\/g, '/'));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Skills using the invented <agent>X</agent> dispatch syntax (use \`Task("<name>", "…")\` instead):\n  ${offenders.join('\n  ')}`,
  );
});
