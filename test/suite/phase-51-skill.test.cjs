'use strict';
/**
 * test/suite/phase-51-skill.test.cjs — Phase 51 (Instinct-Based Learnings).
 *
 * Covers the SKILL + REFLECTOR + APPLY/EXTRACT surface for atomic instincts:
 *   1. scripts/skill-templates/instinct/SKILL.md frontmatter is valid (v3 description
 *      form, required managed fields) and the body documents the three
 *      subcommands list / query / promote (incl. the K=2 / M=2 gate).
 *   2. agents/design-reflector.md carries both a `## Atomic instincts` section
 *      and a `## Narrative reflection` subsection (the dual-emit contract), and
 *      cites scripts/lib/instinct-store.cjs add().
 *   3. scripts/skill-templates/apply-reflections/SKILL.md documents the [INSTINCT]
 *      proposal class with the accept / reject / defer / edit flow.
 *   4. scripts/skill-templates/extract-learnings/SKILL.md dual-emits atomic instinct
 *      units (instinct-candidate patterns) and notes the prose path is kept
 *      read-only for one minor version.
 *
 * Reads scripts/skill-templates/ (the authored copy) so the suite is green BEFORE
 * `npm run build:skills` + the skills.json manifest record (both owned by the
 * orchestrator). Structural / prose asserts only — no engine execution.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SRC_SKILLS = path.join(REPO_ROOT, 'scripts', 'skill-templates');
const AGENTS = path.join(REPO_ROOT, 'agents');

const INSTINCT_SKILL = path.join(SRC_SKILLS, 'instinct', 'SKILL.md');
const REFLECTOR = path.join(AGENTS, 'design-reflector.md');
const APPLY = path.join(SRC_SKILLS, 'apply-reflections', 'SKILL.md');
const EXTRACT = path.join(SRC_SKILLS, 'extract-learnings', 'SKILL.md');

function read(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

/** Return the frontmatter block (between the first two --- fences), fences excluded. */
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}

// ---------------------------------------------------------------------------
// 1. instinct SKILL.md — frontmatter + body
// ---------------------------------------------------------------------------

test('51: instinct SKILL.md exists', () => {
  assert.ok(fs.existsSync(INSTINCT_SKILL), `expected ${INSTINCT_SKILL}`);
});

test('51: instinct frontmatter is valid v3 form with required fields', () => {
  const fm = frontmatter(read(INSTINCT_SKILL));
  assert.match(fm, /^name: hone-instinct$/m, 'name: hone-instinct');
  // Quoted description, 20..1024 chars, single physical line (no folded form here).
  assert.match(fm, /^description: ".{20,1024}"$/m, 'quoted 20..1024 description');
  assert.match(fm, /Use when /i, 'v3 "Use when" trigger sentence');
  assert.match(fm, /Activates for requests involving/i, 'v3 "Activates for" sentence');
  // argument-hint advertises the three subcommands + the two flags.
  assert.match(fm, /^argument-hint: ".*list.*query.*promote.*"$/m, 'argument-hint lists subcommands');
  assert.match(fm, /--scope/, 'argument-hint documents --scope');
  assert.match(fm, /--domain/, 'argument-hint documents --domain');
  // tools restricted to Read + Bash per the phase brief.
  assert.match(fm, /^tools: Read, Bash$/m, 'tools: Read, Bash');
});

test('51: instinct description stays within the 20..1024 budget', () => {
  const fm = frontmatter(read(INSTINCT_SKILL));
  const m = fm.match(/^description: "([\s\S]*?)"$/m);
  assert.ok(m, 'description present and quoted');
  const len = m[1].length;
  assert.ok(len >= 20 && len <= 1024, `description length ${len} must be within 20..1024`);
});

test('51: instinct body documents the three subcommands', () => {
  const text = read(INSTINCT_SKILL);
  assert.match(text, /^## list$/m, 'documents the list subcommand');
  assert.match(text, /^## query$/m, 'documents the query subcommand');
  assert.match(text, /^## promote$/m, 'documents the promote subcommand');
  // Invocation table enumerates all three for the user.
  assert.match(text, /instinct list/, 'invocation table shows list');
  assert.match(text, /instinct query/, 'invocation table shows query');
  assert.match(text, /instinct promote/, 'invocation table shows promote');
});

test('51: instinct body cites the store engine and the gated promotion', () => {
  const text = read(INSTINCT_SKILL);
  assert.match(text, /scripts\/lib\/instinct-store\.cjs/, 'cites the store engine by path');
  // The list / query / promote engine calls are named so authors call the
  // shipped API rather than reimplementing it.
  assert.match(text, /\.list\(/, 'names the list() store call');
  assert.match(text, /\.query\(/, 'names the query() store call');
  assert.match(text, /\.promote\(/, 'names the promote() store call');
  // Promotion gate: K=2 cycles across M=2 project ids.
  assert.match(text, /K\s*=\s*2/, 'documents the K=2 cycle gate');
  assert.match(text, /M\s*=\s*2/, 'documents the M=2 project gate');
  // clack-with-fallback confirm before the write.
  assert.match(text, /@clack\/prompts/, 'uses @clack/prompts for the confirm');
  assert.match(text, /AskUserQuestion/, 'falls back to AskUserQuestion');
});

test('51: instinct SKILL.md emits the COMPLETE terminator', () => {
  assert.match(read(INSTINCT_SKILL), /##\s*INSTINCT\s*COMPLETE/, 'ends with ## INSTINCT COMPLETE');
});

// ---------------------------------------------------------------------------
// 2. design-reflector — Atomic instincts + Narrative reflection (dual-emit)
// ---------------------------------------------------------------------------

test('51: design-reflector has an Atomic instincts section', () => {
  const text = read(REFLECTOR);
  assert.match(text, /^## Atomic instincts$/m, 'reflector emits a ## Atomic instincts section');
});

test('51: design-reflector keeps a Narrative reflection subsection (dual-emit)', () => {
  const text = read(REFLECTOR);
  assert.match(text, /^### Narrative reflection$/m, 'reflector keeps ### Narrative reflection for humans');
  // The section must reference the format spec and the store add() landing point.
  assert.match(text, /reference\/instinct-format\.md/, 'cites the instinct-format reference');
  assert.match(text, /scripts\/lib\/instinct-store\.cjs/, 'cites the store engine');
  assert.match(text, /add\(/, 'names add() as where accepted units land');
});

test('51: design-reflector instinct section is ordered before Proposals', () => {
  const text = read(REFLECTOR);
  const instinctIdx = text.indexOf('## Atomic instincts');
  const proposalsIdx = text.indexOf('## Proposals');
  assert.ok(instinctIdx !== -1 && proposalsIdx !== -1, 'both sections present');
  assert.ok(instinctIdx < proposalsIdx, 'Atomic instincts precedes Proposals');
});

// ---------------------------------------------------------------------------
// 3. apply-reflections — [INSTINCT] proposal class
// ---------------------------------------------------------------------------

test('51: apply-reflections documents the [INSTINCT] proposal class', () => {
  const text = read(APPLY);
  assert.match(text, /^## \[INSTINCT\]$/m, 'declares an [INSTINCT] proposal class heading');
  // Mirrors the incubator accept / reject / defer / edit flow.
  for (const action of ['accept', 'reject', 'defer', 'edit']) {
    assert.match(
      text,
      new RegExp(`\\*\\*${action}\\*\\*`, 'i'),
      `[INSTINCT] flow documents the "${action}" action`,
    );
  }
  // Accept routes through the store add() at the emitted confidence.
  assert.match(text, /scripts\/lib\/instinct-store\.cjs/, 'cites the store engine');
  assert.match(text, /add\(/, 'accept calls add()');
  assert.match(text, /confidence/i, 'stores at the emitted confidence');
});

test('51: apply-reflections [INSTINCT] sits alongside the existing classes', () => {
  const text = read(APPLY);
  // The new class joins [INCUBATOR] + [KFM-CANDIDATE] rather than replacing them.
  assert.match(text, /^## \[INCUBATOR\]$/m, '[INCUBATOR] class retained');
  assert.match(text, /^## \[KFM-CANDIDATE\]$/m, '[KFM-CANDIDATE] class retained');
});

// ---------------------------------------------------------------------------
// 4. extract-learnings — dual-emit instinct units
// ---------------------------------------------------------------------------

test('51: extract-learnings dual-emits atomic instinct units', () => {
  const text = read(EXTRACT);
  assert.match(text, /instinct-candidate/, 'tags instinct-candidate patterns');
  assert.match(text, /scripts\/lib\/instinct-store\.cjs/, 'writes units through the store engine');
  assert.match(text, /instinct/i, 'mentions instinct units');
  // The prose LEARNINGS.md path is retained read-only for one minor version.
  assert.match(text, /LEARNINGS\.md/, 'still writes the prose LEARNINGS.md');
  assert.match(text, /read-only for one minor version/i, 'notes prose is retained read-only for one minor version');
});

test('51: extract-learnings preserves the command_prefix placeholder', () => {
  const text = read(EXTRACT);
  assert.match(text, /\{\{command_prefix\}\}/, '{{command_prefix}} placeholder intact');
});
