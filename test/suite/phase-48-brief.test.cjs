'use strict';
// Phase 48 (BRIEF-CRITIC) — brief-auditor agent + brief-quality-rubric + the non-blocking
// brief-skill wiring. Asserts the advisory critic exists, carries valid frontmatter, the rubric
// names all five anti-patterns, and the brief skill tail offers /gdd:discuss brief WITHOUT blocking
// the brief-to-explore transition.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, readFrontmatter } = require('./helpers.ts');

const BRIEF_AUDITOR = path.join(REPO_ROOT, 'agents', 'brief-auditor.md');
const RUBRIC = path.join(REPO_ROOT, 'reference', 'brief-quality-rubric.md');
const BRIEF_SKILL = path.join(REPO_ROOT, 'scripts', 'skill-templates', 'brief', 'SKILL.md');

// The 8 required agent frontmatter fields (validate:frontmatter contract).
const REQUIRED_FRONTMATTER = [
  'name',
  'description',
  'tools',
  'color',
  'parallel-safe',
  'typical-duration-seconds',
  'reads-only',
  'writes',
];

test('phase-48-brief: brief-auditor agent file exists', () => {
  assert.ok(fs.existsSync(BRIEF_AUDITOR), 'agents/brief-auditor.md must exist');
});

test('phase-48-brief: brief-auditor frontmatter has all 8 required fields + name=brief-auditor', () => {
  const fm = readFrontmatter(BRIEF_AUDITOR);
  for (const field of REQUIRED_FRONTMATTER) {
    assert.ok(
      field in fm && fm[field] !== '' && fm[field] !== undefined,
      `brief-auditor frontmatter missing required field: ${field}`
    );
  }
  assert.equal(fm.name, 'brief-auditor', 'name field must be brief-auditor (matches filename)');
});

test('phase-48-brief: brief-auditor carries size_budget: M (under 300-line worker budget)', () => {
  const fm = readFrontmatter(BRIEF_AUDITOR);
  assert.equal(String(fm.size_budget).toUpperCase(), 'M', 'size_budget must be M');
});

test('phase-48-brief: brief-auditor body imports shared-preamble first and has Record + completion marker', () => {
  const body = fs.readFileSync(BRIEF_AUDITOR, 'utf8');
  const afterFm = body.replace(/^---\n[\s\S]*?\n---\n/, '');
  const firstNonBlank = afterFm.split('\n').find((l) => l.trim() !== '');
  assert.equal(
    firstNonBlank.trim(),
    '@reference/shared-preamble.md',
    'first body line must import shared-preamble (cache-aligned ordering)'
  );
  assert.match(body, /## Record/, 'must carry the mandatory ## Record section');
  assert.match(body, /## AUDIT COMPLETE\s*$/, 'must end with the AUDIT COMPLETE marker');
});

test('phase-48-brief: brief-auditor is advisory and writes BRIEF-AUDIT.md', () => {
  const fm = readFrontmatter(BRIEF_AUDITOR);
  const writes = Array.isArray(fm.writes) ? fm.writes : [fm.writes];
  assert.ok(
    writes.some((w) => String(w).includes('.design/BRIEF-AUDIT.md')),
    'writes must include .design/BRIEF-AUDIT.md'
  );
  const body = fs.readFileSync(BRIEF_AUDITOR, 'utf8');
  assert.match(
    body,
    /non-blocking|MUST NOT block|advisory/i,
    'body must state the audit is advisory / non-blocking'
  );
});

test('phase-48-brief: rubric file exists and is within the 70-140 line band', () => {
  assert.ok(fs.existsSync(RUBRIC), 'reference/brief-quality-rubric.md must exist');
  const lines = fs.readFileSync(RUBRIC, 'utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  assert.ok(
    lines.length >= 70 && lines.length <= 140,
    `rubric is ${lines.length} lines; expected 70-140`
  );
});

test('phase-48-brief: rubric names all five anti-patterns (AP-1..AP-5)', () => {
  const rubric = fs.readFileSync(RUBRIC, 'utf8');
  for (const id of ['AP-1', 'AP-2', 'AP-3', 'AP-4', 'AP-5']) {
    assert.match(rubric, new RegExp(id), `rubric must define ${id}`);
  }
});

test('phase-48-brief: rubric covers the five concrete anti-pattern concepts', () => {
  const rubric = fs.readFileSync(RUBRIC, 'utf8').toLowerCase();
  const concepts = [
    /vague verb/, // AP-1
    /missing audience|audience/, // AP-2
    /immeasurable|success criteria/, // AP-3
    /scope creep/, // AP-4
    /anti-goal/, // AP-5
  ];
  for (const re of concepts) {
    assert.match(rubric, re, `rubric must cover concept ${re}`);
  }
});

test('phase-48-brief: each anti-pattern carries a detection signal and a severity', () => {
  const rubric = fs.readFileSync(RUBRIC, 'utf8');
  const detectionCount = (rubric.match(/Detection signal:/g) || []).length;
  const severityCount = (rubric.match(/Severity:/g) || []).length;
  assert.ok(detectionCount >= 5, `expected >=5 "Detection signal:" entries, found ${detectionCount}`);
  assert.ok(severityCount >= 5, `expected >=5 "Severity:" entries, found ${severityCount}`);
});

test('phase-48-brief: rubric has a good and bad example per anti-pattern', () => {
  const rubric = fs.readFileSync(RUBRIC, 'utf8');
  const goodCount = (rubric.match(/\*\*Good:\*\*/g) || []).length;
  const badCount = (rubric.match(/\*\*Bad:\*\*/g) || []).length;
  assert.ok(goodCount >= 5, `expected >=5 Good examples, found ${goodCount}`);
  assert.ok(badCount >= 5, `expected >=5 Bad examples, found ${badCount}`);
});

test('phase-48-brief: brief skill tail offers /gdd:discuss brief, non-blocking, before the HARD-GATE', () => {
  const skill = fs.readFileSync(BRIEF_SKILL, 'utf8');

  // Offers the discuss-brief pointer (placeholder-tokenized command prefix preserved).
  assert.match(
    skill,
    /\{\{command_prefix\}\}discuss brief/,
    'brief skill must offer {{command_prefix}}discuss brief'
  );

  // Names the brief-auditor as an optional spawn.
  assert.match(skill, /brief-auditor/, 'brief skill must reference the brief-auditor agent');

  // The audit step is non-blocking.
  assert.match(
    skill,
    /MUST NOT block|non-blocking/i,
    'brief skill audit step must be explicitly non-blocking'
  );

  // The discuss-brief offer sits BEFORE the HARD-GATE (so it cannot gate the transition).
  const auditIdx = skill.indexOf('discuss brief');
  const gateIdx = skill.indexOf('<HARD-GATE>');
  assert.ok(auditIdx !== -1 && gateIdx !== -1, 'both the audit pointer and HARD-GATE must be present');
  assert.ok(auditIdx < gateIdx, 'the discuss-brief pointer must appear before the HARD-GATE block');
});

test('phase-48-brief: brief skill still preserves the placeholder tokens it shipped with', () => {
  const skill = fs.readFileSync(BRIEF_SKILL, 'utf8');
  // The edit must not have stripped the templating tokens the build step relies on.
  assert.match(skill, /\{\{command_prefix\}\}explore/, '{{command_prefix}}explore token must survive');
});
