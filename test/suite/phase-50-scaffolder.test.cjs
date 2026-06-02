'use strict';
/**
 * test/suite/phase-50-scaffolder.test.cjs — Phase 50 (Authoring Contract v3).
 *
 * Covers the pure scaffolder behind /gdd:new-skill plus the surfacing edits:
 *   1. buildSkillRecord rejects an invalid name slug.
 *   2. buildSkillRecord rejects an over-1024-char description.
 *   3. buildSkillRecord accepts a valid v3 record (canonical shape + keys).
 *   4. renderSkillMd produces frontmatter with name + description + the
 *      standard body sections, and is generate-skill-frontmatter-compatible
 *      (description quoted, canonical key order, byte-for-byte round trip).
 *   5. suggestComposesWith returns plausible same-stage matches and excludes
 *      self + unrelated skills.
 *   6. source/skills/new-skill/SKILL.md exists with valid frontmatter.
 *   7. source/skills/health/SKILL.md mentions "v3 description form".
 *
 * Reads source/skills/ (the authored copy) so the suite is green BEFORE
 * `npm run build:skills` (which the orchestrator runs after adding the
 * new-skill manifest record).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCAFFOLDER = path.join(REPO_ROOT, 'scripts', 'lib', 'manifest', 'scaffolder.cjs');
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'generate-skill-frontmatter.cjs');
const SRC_SKILLS = path.join(REPO_ROOT, 'source', 'skills');

const { buildSkillRecord, renderSkillMd, suggestComposesWith } = require(SCAFFOLDER);
const { splitFrontmatter, recordFromFrontmatter, frontmatterFromRecord } = require(GENERATOR);

// A valid v3-form description (>=20, <=1024 chars).
const V3_DESC =
  'Renders a contrast report for a token set. Use when the user asks to check WCAG ratios. ' +
  'Activates for requests involving contrast, accessibility, WCAG, color tokens.';

function readSrc(name) {
  return fs.readFileSync(path.join(SRC_SKILLS, name, 'SKILL.md'), 'utf8');
}

// ---------------------------------------------------------------------------
// buildSkillRecord — validation
// ---------------------------------------------------------------------------

test('50: buildSkillRecord rejects an invalid name slug', () => {
  assert.throws(
    () => buildSkillRecord({ name: 'Bad Name!', description: V3_DESC }),
    /name/i,
    'uppercase + spaces + punctuation must throw',
  );
  assert.throws(
    () => buildSkillRecord({ name: '-leading-dash', description: V3_DESC }),
    /name/i,
    'a leading dash is not a valid slug start',
  );
  assert.throws(
    () => buildSkillRecord({ name: '', description: V3_DESC }),
    /name/i,
    'an empty name must throw',
  );
});

test('50: buildSkillRecord rejects an over-1024-char description', () => {
  const tooLong = 'x'.repeat(1025);
  assert.throws(
    () => buildSkillRecord({ name: 'demo', description: tooLong }),
    /1024/,
    'a 1025-char description must throw',
  );
  // And an under-20-char description is also rejected (lower budget bound).
  assert.throws(
    () => buildSkillRecord({ name: 'demo', description: 'too short' }),
    /20/,
    'an under-20-char description must throw',
  );
});

test('50: buildSkillRecord accepts a valid v3 record (canonical shape)', () => {
  const rec = buildSkillRecord({
    name: 'contrast-report',
    description: V3_DESC,
    argumentHint: '[--token <name>]',
    tools: 'Read, Bash',
    userInvocable: true,
    composesWith: ['audit', 'health'],
  });
  assert.equal(rec.name, 'contrast-report');
  assert.equal(rec.description, V3_DESC);
  assert.equal(rec.argument_hint, '[--token <name>]');
  assert.equal(rec.tools, 'Read, Bash');
  assert.equal(rec.user_invocable, true);
  assert.deepEqual(rec.composes_with, ['audit', 'health']);
  // Canonical key order: name leads, description second.
  const keys = Object.keys(rec);
  assert.equal(keys[0], 'name');
  assert.equal(keys[1], 'description');
  assert.ok(keys.indexOf('tools') > keys.indexOf('argument_hint'), 'tools follows argument_hint');
});

test('50: buildSkillRecord normalizes a tools array and de-dupes composes_with', () => {
  const rec = buildSkillRecord({
    name: 'demo',
    description: V3_DESC,
    tools: ['Read', ' Write ', 'Bash'],
    composesWith: 'audit, audit, health',
  });
  assert.equal(rec.tools, 'Read, Write, Bash', 'array tools join to a clean comma-list');
  assert.deepEqual(rec.composes_with, ['audit', 'health'], 'composes_with de-dupes, order preserved');
});

// ---------------------------------------------------------------------------
// renderSkillMd — template + generate-skill-frontmatter compatibility
// ---------------------------------------------------------------------------

test('50: renderSkillMd produces frontmatter name + description + standard sections', () => {
  const rec = buildSkillRecord({
    name: 'contrast-report',
    description: V3_DESC,
    argumentHint: '[--token <name>]',
    tools: 'Read, Bash',
    userInvocable: true,
    composesWith: ['audit', 'health'],
  });
  const md = renderSkillMd(rec);

  assert.ok(md.startsWith('---\n'), 'starts with a frontmatter fence');
  assert.match(md, /^name: gdd-contrast-report$/m, 'name line present (gdd- prefixed)');
  // Description is quoted (generate-skill-frontmatter qstr convention).
  assert.match(md, /^description: "/m, 'description is double-quoted');
  assert.ok(md.includes(V3_DESC), 'full description body present');
  assert.match(md, /^argument-hint: "\[--token <name>\]"$/m, 'argument-hint emitted + quoted');
  assert.match(md, /^tools: Read, Bash$/m, 'tools emitted bare');
  assert.match(md, /^user-invocable: true$/m, 'user-invocable boolean emitted');
  assert.match(md, /^composes_with: \[audit, health\]$/m, 'composes_with line emitted');

  // Standard body sections.
  assert.match(md, /^# \{\{command_prefix\}\}contrast-report$/m, 'title uses the command_prefix token');
  assert.match(md, /\*\*Role:\*\*/, 'Role line present');
  assert.match(md, /^## Steps$/m, 'Steps section present');
  assert.match(md, /^## Output$/m, 'Output section present');
  assert.match(md, /^## Do Not$/m, 'Do Not section present');
  assert.match(md, /^## CONTRAST-REPORT COMPLETE$/m, 'COMPLETE sentinel present');
});

test('50: renderSkillMd frontmatter is a generate-skill-frontmatter fixed point', () => {
  const rec = buildSkillRecord({
    name: 'contrast-report',
    description: V3_DESC,
    argumentHint: '[--token <name>]',
    tools: 'Read, Bash',
    userInvocable: true,
    composesWith: ['audit', 'health'],
  });
  const md = renderSkillMd(rec);

  // Parse the rendered frontmatter back the way --extract does, then re-emit;
  // it must reproduce the same frontmatter byte-for-byte (round-trip stable).
  const { fmLines } = splitFrontmatter(md, 'contrast-report');
  const parsed = recordFromFrontmatter('contrast-report', fmLines);

  assert.equal(parsed.description, V3_DESC, 'description survives round-trip unquoted');
  assert.equal(parsed.tools, 'Read, Bash');
  assert.equal(parsed.user_invocable, true);
  // composes_with is a Phase 50 (non-managed) key -> carried in extra_frontmatter.
  assert.ok(
    Array.isArray(parsed.extra_frontmatter) &&
      parsed.extra_frontmatter.includes('composes_with: [audit, health]'),
    'composes_with round-trips into extra_frontmatter',
  );

  const reEmitted = frontmatterFromRecord(parsed);
  assert.equal(reEmitted, fmLines.join('\n'), 'frontmatter is a re-emit fixed point');
});

// ---------------------------------------------------------------------------
// suggestComposesWith — heuristic
// ---------------------------------------------------------------------------

test('50: suggestComposesWith returns plausible same-stage matches', () => {
  const all = ['audit', 'review', 'quality-gate', 'brief', 'export', 'health'];
  const out = suggestComposesWith('verify-tokens', all);
  // verify/audit/review/quality-gate/check share the verify lifecycle group.
  assert.ok(out.includes('audit'), 'audit is a verify-stage neighbour');
  assert.ok(out.includes('review'), 'review is a verify-stage neighbour');
  assert.ok(out.includes('quality-gate'), 'quality-gate is a verify-stage neighbour');
  assert.ok(!out.includes('brief'), 'brief (intake stage) is not suggested');
  assert.ok(!out.includes('export'), 'export (figma stage) is not suggested');
});

test('50: suggestComposesWith excludes self and accepts record objects', () => {
  const records = [{ name: 'audit' }, { name: 'figma-extract' }, { name: 'export' }];
  const out = suggestComposesWith('figma-extract', records);
  assert.ok(!out.includes('figma-extract'), 'never suggests the skill itself');
  assert.ok(out.includes('export'), 'export shares the figma/extract stage group');
});

test('50: suggestComposesWith returns [] for an unknown-stage name', () => {
  const out = suggestComposesWith('zzz-nonsense', ['audit', 'brief', 'export']);
  assert.deepEqual(out, [], 'no stage keyword match yields no suggestions');
});

// ---------------------------------------------------------------------------
// Source artifacts — new-skill SKILL.md + health surfacing
// ---------------------------------------------------------------------------

test('50: source/skills/new-skill/SKILL.md exists with valid frontmatter', () => {
  const abs = path.join(SRC_SKILLS, 'new-skill', 'SKILL.md');
  assert.ok(fs.existsSync(abs), 'new-skill SKILL.md must exist');
  const text = readSrc('new-skill');
  const { fmLines } = splitFrontmatter(text, 'new-skill');
  const fm = fmLines.join('\n');
  assert.match(fm, /^name: gdd-new-skill$/m, 'name: gdd-new-skill');
  assert.match(fm, /^description: ".{20,1024}"$/m, 'quoted 20..1024 description');
  assert.match(fm, /Activates for requests involving/i, 'v3 "Activates for" description form');
  assert.match(fm, /^argument-hint: "<skill-name>"$/m, 'argument-hint present');
  assert.match(fm, /^tools: Read, Write, Bash, AskUserQuestion$/m, 'tools list present');
  // It points the user at the pure generator and the two follow-up commands.
  assert.match(text, /scripts\/lib\/manifest\/scaffolder\.cjs/, 'references the scaffolder');
  assert.match(text, /generate:skill-frontmatter/, 'mentions the generate step');
  assert.match(text, /build:skills/, 'mentions the build step');
});

test('50: health SKILL.md mentions "v3 description form"', () => {
  const text = readSrc('health');
  assert.match(text, /v3 description form/, 'health surfaces v3-description adoption');
  assert.match(text, /Composition:/, 'health surfaces a composition-graph stat');
});

test('50: progress SKILL.md surfaces composition-graph readiness', () => {
  const text = readSrc('progress');
  assert.match(text, /Composition graph:/, 'progress surfaces a composition-graph readiness line');
  assert.match(text, /validate-composition-graph\.cjs/, 'progress cites the DAG validator');
});
