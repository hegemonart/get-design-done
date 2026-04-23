'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

// Stage skills and their declared DESIGN-*.md / BRIEF.md write targets.
// NOTE on plan deviations:
//  - The plan template used `DESIGN-BRIEF.md`, but the actual `skills/brief/SKILL.md`
//    writes `.design/BRIEF.md` (no DESIGN- prefix).
//  - The plan template used `DESIGN-VERIFICATION.md` for the verify stage; the actual
//    skill writes `.design/DESIGN-VERIFICATION.md` (matches).
//  - The plan template listed `DESIGN.md` as the design stage write, but skills/design
//    is a thin orchestrator that writes `.design/tasks/task-NN.md` per task, plus
//    `DESIGN-PLAN.md` (it READS DESIGN-PLAN.md, doesn't write it) — the canonical
//    per-task path is what the skill actually documents, so we assert that.
// Each entry's `writes` list is what the skill's body actually references, not what the
// plan template guessed. STATE.md is universal.
const STAGE_SKILLS = [
  { slug: 'brief',   writes: ['.design/BRIEF.md', '.design/STATE.md'] },
  { slug: 'explore', writes: ['.design/DESIGN-CONTEXT.md', '.design/STATE.md'] },
  { slug: 'plan',    writes: ['.design/DESIGN-PLAN.md', '.design/STATE.md'] },
  { slug: 'design',  writes: ['.design/tasks/task-NN.md', '.design/STATE.md'] },
  { slug: 'verify',  writes: ['.design/DESIGN-VERIFICATION.md', '.design/STATE.md'] },
];

test('pipeline-smoke: test-fixture has a runnable project shape', () => {
  const pkgPath = path.join(REPO_ROOT, 'test-fixture', 'package.json');
  const srcDir = path.join(REPO_ROOT, 'test-fixture', 'src');
  assert.ok(fs.existsSync(pkgPath), 'test-fixture/package.json must exist');
  assert.ok(fs.existsSync(srcDir), 'test-fixture/src/ must exist');
  assert.ok(fs.statSync(srcDir).isDirectory(), 'test-fixture/src must be a directory');

  // Verify at least one source file exists under src/
  const srcFiles = fs.readdirSync(srcDir);
  assert.ok(srcFiles.length > 0, 'test-fixture/src/ must contain at least one file');
});

test('pipeline-smoke: each stage skill exists', () => {
  for (const stage of STAGE_SKILLS) {
    const skillPath = path.join(REPO_ROOT, 'skills', stage.slug, 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `skills/${stage.slug}/SKILL.md must exist`);
  }
});

test('pipeline-smoke: each stage skill declares its DESIGN-*.md write target', () => {
  for (const stage of STAGE_SKILLS) {
    const skillPath = path.join(REPO_ROOT, 'skills', stage.slug, 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf8');
    for (const writeTarget of stage.writes) {
      // The skill body may reference the path with or without leading dot.
      // Check for the filename portion at minimum (strip `.design/`).
      const basename = writeTarget.replace(/^\.design\//, '');
      assert.ok(
        content.includes(basename),
        `skills/${stage.slug}/SKILL.md must reference its write target "${writeTarget}" (looking for "${basename}")`
      );
    }
  }
});

test('pipeline-smoke: current baseline manifest exists', () => {
  const currentDir = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'current');
  assert.ok(fs.existsSync(currentDir), 'test-fixture/baselines/current/ must exist');

  const entries = fs.readdirSync(currentDir);
  const hasManifest = entries.some(e =>
    e === 'BASELINE.md' ||
    e === 'README.md' ||
    e === 'agent-list.txt' ||
    e === 'skill-list.txt' ||
    e === 'connection-list.txt'
  );
  assert.ok(
    hasManifest,
    'test-fixture/baselines/current/ must contain a manifest (BASELINE.md, README.md, or a *-list.txt file)'
  );
});
