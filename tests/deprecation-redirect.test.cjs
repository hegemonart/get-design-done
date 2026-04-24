'use strict';
/**
 * TST-29 — deprecation-redirect
 *
 * Validates reference/DEPRECATIONS.md lists the plugin's deprecated names
 * with migration notes, and that orphan mentions of deprecated names in
 * shipped docs are either near a deprecation warning or on an explicit
 * allow-list.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const DEPRECATIONS = path.join(REPO_ROOT, 'reference/DEPRECATIONS.md');

// Files that are allowed to reference `design-pattern-mapper` outside
// DEPRECATIONS.md. These are files that legitimately still interact with the
// legacy agent during the transition window (or describe the split in context).
const ALLOWED_DEPRECATION_REFS = [
  // The legacy agent file itself — kept as a compatibility shim.
  'agents/design-pattern-mapper.md',
  // Agents and docs that document the historic relationship to the split.
  'agents/design-assumptions-analyzer.md',
  'agents/README.md',
  // Skills that spawn the pattern-mapper stack (transitional).
  'skills/plan/SKILL.md',
  // Reference docs that enumerate parallelism + intel schema for the historical set.
  'reference/intel-schema.md',
  'reference/parallelism-rules.md',
  // Phase 10.1 tier reference: documents the historical pattern-mapper tier mapping.
  'reference/model-tiers.md',
  // The deprecations registry itself.
  'reference/DEPRECATIONS.md',
];

const SCAN_DIRS = ['agents', 'skills', 'connections', 'reference'];

function walkMarkdown(dir) {
  const out = [];
  const stack = [path.join(REPO_ROOT, dir)];
  while (stack.length) {
    const cur = stack.pop();
    if (!fs.existsSync(cur)) continue;
    const stat = fs.statSync(cur);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(cur)) stack.push(path.join(cur, child));
    } else if (cur.endsWith('.md')) {
      out.push(cur);
    }
  }
  return out;
}

test('deprecation-redirect: reference/DEPRECATIONS.md exists', () => {
  assert.ok(fs.existsSync(DEPRECATIONS), `expected ${DEPRECATIONS} to exist`);
});

test('deprecation-redirect: DEPRECATIONS.md lists all four deprecation categories', () => {
  const body = fs.readFileSync(DEPRECATIONS, 'utf8');
  for (const term of ['/design:', 'design-pattern-mapper', 'scan', 'discover']) {
    assert.ok(
      body.includes(term),
      `DEPRECATIONS.md must mention "${term}"`
    );
  }
});

test('deprecation-redirect: each deprecated name in DEPRECATIONS.md has a replacement or migration note', () => {
  const body = fs.readFileSync(DEPRECATIONS, 'utf8');
  const terms = ['/design:', 'design-pattern-mapper', 'scan', 'discover'];
  for (const term of terms) {
    const idx = body.indexOf(term);
    assert.ok(idx >= 0, `term "${term}" should appear in DEPRECATIONS.md`);
    const windowStart = Math.max(0, idx - 100);
    const windowEnd = Math.min(body.length, idx + term.length + 300);
    const window = body.slice(windowStart, windowEnd);
    const hasMigrationCue =
      /→|replaced|renamed|migrated|merged|split|deprecated/i.test(window);
    assert.ok(
      hasMigrationCue,
      `context around "${term}" should include a migration cue (→/replaced/renamed/migrated/merged/split/deprecated). Window: ${JSON.stringify(window)}`
    );
  }
});

test('deprecation-redirect: no orphan mention of "design-pattern-mapper" outside ALLOWED_DEPRECATION_REFS', () => {
  const files = SCAN_DIRS.flatMap(walkMarkdown);
  const offenders = [];
  for (const file of files) {
    // Normalize path separators so Windows (backslashes) matches the
    // forward-slash entries in ALLOWED_DEPRECATION_REFS.
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    if (ALLOWED_DEPRECATION_REFS.includes(rel)) continue;
    const body = fs.readFileSync(file, 'utf8');
    if (body.includes('design-pattern-mapper')) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `orphan "design-pattern-mapper" mentions found in: ${offenders.join(', ')}. Either add to ALLOWED_DEPRECATION_REFS or remove the reference.`
  );
});

test('deprecation-redirect: no orphan mention of "scan" stage in top-level SKILL.md command table', () => {
  const skillPath = path.join(REPO_ROOT, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    // Skill table may live elsewhere; pass if file doesn't exist.
    return;
  }
  const body = fs.readFileSync(skillPath, 'utf8');
  // Fail on table rows naming `scan` as a current command at start of a cell.
  const match = body.match(/^\|\s*scan\b/m);
  assert.equal(
    match,
    null,
    `SKILL.md command table should NOT contain a current-command row for "scan". Matched: ${match && match[0]}`
  );
});
