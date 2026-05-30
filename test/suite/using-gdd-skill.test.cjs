'use strict';
// test/suite/using-gdd-skill.test.cjs — Phase 32 Plan 01 (Wave A.1)
//
// Contract tests for skills/using-gdd/SKILL.md — the SessionStart-injected
// discipline bootstrap. Asserts: ≤120-line cap, leading <SUBAGENT-STOP> tag,
// the five required body sections, a ≥10-row "| Thought | Reality |" table,
// and a PURE-TRIGGER description.
//
// The description-format assertion is a TEMPORARY rule LOCAL to this test
// (Phase 32 D-03), pending Phase 33's A/B evidence. It does NOT touch Phase
// 28.5's global description-format validator (scripts/validate-skill-length.cjs),
// whose strict regex stays OPEN until that evidence lands.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'using-gdd', 'SKILL.md');

// --- Parse the file once: split frontmatter (between the first two `---`
// lines) from the body. We split on the leading `---` LINES rather than the
// raw substring "---" because the red-flags table separator row ("| --- |")
// also contains the dash run.
const RAW = fs.readFileSync(SKILL_PATH, 'utf8').replace(/\r\n/g, '\n');
const LINES = RAW.split('\n');

function splitFrontmatter(lines) {
  assert.equal(lines[0], '---', 'file must open with a --- frontmatter fence');
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { end = i; break; }
  }
  assert.ok(end > 0, 'frontmatter must close with a --- fence');
  return {
    frontmatter: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n'),
  };
}

const { frontmatter: FM, body: BODY } = splitFrontmatter(LINES);

// Extract the description field value (handles the quoted single-line form).
function descriptionField(fm) {
  const m = fm.match(/^description:\s*(.*)$/m);
  if (!m) return '';
  let v = m[1].trim();
  if (v.length >= 2 &&
      ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1);
  }
  return v;
}

// Total line count, wc -l semantics (drop a single trailing empty entry).
function totalLines() {
  const l = RAW.split('\n');
  if (l[l.length - 1] === '') l.pop();
  return l.length;
}

test('32-01: using-gdd is <=120 lines', () => {
  const n = totalLines();
  assert.ok(n <= 120, `using-gdd/SKILL.md must be <=120 lines (Phase 28.5 contract), got ${n}`);
});

test('32-01: body leads with <SUBAGENT-STOP>', () => {
  const firstNonEmpty = BODY.split('\n').find((l) => l.trim() !== '');
  assert.equal(
    (firstNonEmpty || '').trim(),
    '<SUBAGENT-STOP>',
    'first non-empty body line must be the literal <SUBAGENT-STOP> cascade-guard tag (D-06)',
  );
});

test('32-01: has all five sections', () => {
  // (1) 1%-rule paragraph — assert the verbatim superpowers sentence.
  assert.ok(
    BODY.includes(
      'If you think there is even a 1% chance a skill might apply, you ABSOLUTELY MUST invoke the skill',
    ),
    'body must port the verbatim 1%-rule sentence',
  );
  // (2) red-flags section heading (table asserted separately below).
  assert.match(BODY, /^##\s+Red flags/m, 'missing "## Red flags" section');
  // (3) skill-priority order.
  assert.match(BODY, /^##\s+Skill priority order/m, 'missing "## Skill priority order" section');
  // (4) instruction-priority.
  assert.match(BODY, /^##\s+Instruction priority/m, 'missing "## Instruction priority" section');
  // (5) GDD pipeline-flow section naming all five stages.
  assert.match(BODY, /^##\s+GDD pipeline flow/m, 'missing "## GDD pipeline flow" section');
  for (const stage of ['Brief', 'Explore', 'Plan', 'Design', 'Verify']) {
    assert.ok(
      new RegExp(`\\b${stage}\\b`).test(BODY),
      `pipeline-flow section must name the ${stage} stage`,
    );
  }
});

test('32-01: red-flags table has >=10 rows under | Thought | Reality |', () => {
  const bodyLines = BODY.split('\n');
  const headIdx = bodyLines.findIndex((l) => /^\s*\|\s*Thought\s*\|\s*Reality\s*\|\s*$/.test(l));
  assert.ok(headIdx >= 0, 'missing the exact "| Thought | Reality |" table heading row');
  let rows = 0;
  for (let i = headIdx + 1; i < bodyLines.length; i++) {
    const l = bodyLines[i];
    if (!/^\s*\|.*\|.*\|\s*$/.test(l)) break; // table ended
    if (/^\s*\|[\s:-]+\|[\s:-]+\|\s*$/.test(l)) continue; // separator row
    rows++;
  }
  assert.ok(rows >= 10, `red-flags table must have >=10 data rows, found ${rows}`);
});

test('32-01: description is pure-trigger (TEMPORARY local D-03 rule)', () => {
  // TEMPORARY Phase-32-local rule pending Phase 33 A/B — does NOT touch Phase
  // 28.5's global validator (D-03). Blocks workflow-summary verbs + a <what>
  // clause in the description field.
  const desc = descriptionField(FM);
  assert.ok(desc.length > 0, 'description field must be present');
  assert.doesNotMatch(
    desc,
    /wraps |spawns |reads |writes |Stage \d of \d/,
    `description must be pure-trigger — no workflow-summary verbs (got: "${desc}")`,
  );
  assert.ok(!desc.includes('<what>'), 'description must not contain a <what> clause');
});
