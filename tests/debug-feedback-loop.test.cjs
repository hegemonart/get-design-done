'use strict';
/**
 * tests/debug-feedback-loop.test.cjs — Phase 28.5-09.
 *
 * Verifies the debug Phase 1 feedback-loop gate landed correctly:
 *   - reference/debug-feedback-loops.md filled with 10 priority-ordered paths,
 *     iterate-on-loop section, non-determinism branch, MIT attribution.
 *   - skills/debug/SKILL.md has an explicit Phase 1 step BEFORE the hypothesis
 *     step, gate text present, cross-link preserved.
 *
 * Linear-order check uses anchored step-header regexes (not loose substring
 * matching) so that surrounding prose containing the word "investigation" or
 * "hypothesis" does not produce spurious passes/fails.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REF = path.join(ROOT, 'reference', 'debug-feedback-loops.md');
const SKILL = path.join(ROOT, 'skills', 'debug', 'SKILL.md');

function readLines(p) {
  const c = fs.readFileSync(p, 'utf8');
  const lines = c.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return { content: c, lines };
}

test('reference/debug-feedback-loops.md exists and is 100-200 lines', () => {
  const { lines } = readLines(REF);
  assert.ok(lines.length >= 100, `expected >=100 lines, got ${lines.length}`);
  assert.ok(lines.length <= 200, `expected <=200 lines, got ${lines.length}`);
});

test('reference/debug-feedback-loops.md contains all 10 construction paths', () => {
  const { content } = readLines(REF);
  const required = [
    /failing test/i,
    /\bcurl\b/i,
    /CLI fixture/i,
    /headless browser/i,
    /trace replay/i,
    /throwaway harness/i,
    /\bfuzz\b/i,
    /\bbisect\b/i,
    /differential/i,
    /HITL bash/i,
  ];
  for (const re of required) {
    assert.ok(re.test(content), `missing path: ${re}`);
  }
});

test('reference/debug-feedback-loops.md has 10 ### path sub-headings', () => {
  const { content } = readLines(REF);
  const subheads = content.match(/^### /gm) || [];
  assert.ok(subheads.length >= 10, `expected >=10 ### sub-headings, got ${subheads.length}`);
});

test('reference/debug-feedback-loops.md has Iterate on the loop itself section', () => {
  const { content } = readLines(REF);
  assert.ok(/iterate on the loop itself/i.test(content), 'missing "Iterate on the loop itself"');
});

test('reference/debug-feedback-loops.md has non-determinism / reproduction-rate section', () => {
  const { content } = readLines(REF);
  assert.ok(
    /non-deterministic/i.test(content) || /reproduction rate/i.test(content),
    'missing non-determinism / reproduction-rate guidance'
  );
});

test('reference/debug-feedback-loops.md preserves MIT attribution', () => {
  const { content } = readLines(REF);
  assert.ok(
    /Source: mattpocock\/skills \(MIT\)/.test(content),
    'missing MIT attribution line'
  );
});

test('reference/debug-feedback-loops.md frontmatter intact', () => {
  const { lines } = readLines(REF);
  assert.equal(lines[0], '---', 'first line must be frontmatter delimiter');
  // Find closing delimiter
  let closeAt = -1;
  for (let i = 1; i < Math.min(lines.length, 30); i++) {
    if (lines[i] === '---') { closeAt = i; break; }
  }
  assert.ok(closeAt > 0, 'frontmatter missing closing ---');
});

test('skills/debug/SKILL.md has explicit Phase 1 step with feedback-loop terminology', () => {
  const { content } = readLines(SKILL);
  assert.ok(/Phase 1/i.test(content), 'missing "Phase 1" label');
  assert.ok(/feedback loop/i.test(content), 'missing "feedback loop" terminology');
});

test('skills/debug/SKILL.md has do-not-proceed gate phrasing', () => {
  const { content } = readLines(SKILL);
  assert.ok(
    /do not proceed/i.test(content),
    'missing gate phrasing (e.g. "Do not proceed to Phase 2 until you have a loop you believe in")'
  );
});

test('skills/debug/SKILL.md cross-links to debug-feedback-loops.md', () => {
  const { content } = readLines(SKILL);
  assert.ok(/debug-feedback-loops/.test(content), 'missing cross-link to debug-feedback-loops');
});

test('skills/debug/SKILL.md name is gdd-debug (unchanged)', () => {
  const { content } = readLines(SKILL);
  assert.ok(/^name: gdd-debug$/m.test(content), 'frontmatter name must remain "gdd-debug"');
});

test('skills/debug/SKILL.md is at most 99 lines', () => {
  const { lines } = readLines(SKILL);
  assert.ok(lines.length <= 99, `expected <=99 lines, got ${lines.length}`);
});

test('Phase 1 step header appears before Phase 2 / Investigation step header', () => {
  // Strict step-header check: matches numbered-bold-step headers only.
  // Avoids false positives from prose mentions of "investigation" or "hypothesis".
  const { lines } = readLines(SKILL);
  const STEP_RE = /^\d+\.\s+\*\*([^*]+)\*\*/;
  let phase1At = -1;
  let phase2At = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(STEP_RE);
    if (!m) continue;
    const label = m[1];
    if (/Phase 1|feedback loop/i.test(label) && phase1At < 0) phase1At = i;
    if (
      (/Phase 2|Investigation loop|Hypothesis/i.test(label)) &&
      phase2At < 0 &&
      i !== phase1At
    ) {
      phase2At = i;
    }
  }
  assert.ok(phase1At >= 0, 'Phase 1 step header not found');
  assert.ok(phase2At >= 0, 'Phase 2 / Investigation step header not found');
  assert.ok(
    phase1At < phase2At,
    `Phase 1 (line ${phase1At + 1}) must come before Phase 2 (line ${phase2At + 1})`
  );
});
