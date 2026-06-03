// test/suite/phase-56-override.test.cjs — Phase 56 (Risk-Scoring + Fact-Forcing
// Gate), executor D: routing + the /gdd:override skill.
//
// Proves:
//   * the confidence x risk routing matrix on SYNTHETIC gaps, composing A's two
//     pure primitives exactly as design-fixer Step 2.5 does:
//         route(gap.confidence, computeRisk('Edit', input).suggested_action)
//     - high confidence + low-risk file        -> 'auto'
//     - high confidence + require_confirmation  -> 'confirm'
//     - low confidence (< 0.5), non-block       -> 'skip'
//     - block-risk write (STATE.md large diff)  -> 'override' (any confidence)
//   * source/skills/override/SKILL.md exists, documents BOTH modes
//     (finding-id + factforce <path>), has valid v3 frontmatter, em-dash-free.
//   * the scriptable override helper (scripts/lib/risk/override.cjs):
//     - overrideDecisionEntry shapes an `override`-tagged, approver-audited,
//       `locked` decision entry; missing approver throws (audit invariant).
//     - setFactForceChecked sets checked[path] purely (factforce mode);
//       isFactForceChecked reads it back.
//
// Hermetic + deterministic: no network, no Date.now/Math.random, no tmp files
// (the helper is pure; the SKILL.md is read from the repo tree).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { route } = require('../../scripts/lib/risk/route.cjs');
const { computeRisk } = require('../../scripts/lib/risk/compute-risk.cjs');
const override = require('../../scripts/lib/risk/override.cjs');
const { overrideDecisionEntry, setFactForceChecked, isFactForceChecked, OVERRIDE_TAG } = override;
const { REPO_ROOT, readFrontmatter } = require('./helpers.ts');

const bigDiff = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n');
const SKILL_PATH = path.join(REPO_ROOT, 'source', 'skills', 'override', 'SKILL.md');

// ── The confidence x risk routing matrix (design-fixer Step 2.5) ─────────────

// Each synthetic gap pairs an agent confidence with a write that computeRisk
// will score into a known action tier. We route exactly as Step 2.5 does and
// assert the end-to-end decision.
const GAPS = [
  {
    name: 'high-conf + low-risk file (README write) -> auto',
    confidence: 0.95,
    tool: 'Write',
    input: { file_path: 'README.md', content: 'a\nb\nc\nd\ne' },
    expectAction: 'allow',
    expectDecision: 'auto',
  },
  {
    name: 'high-conf + require_confirmation (small STATE.md edit) -> confirm',
    confidence: 0.9,
    tool: 'Edit',
    input: { file_path: '.planning/STATE.md', new_string: 'one small line' },
    expectAction: 'require_confirmation',
    expectDecision: 'confirm',
  },
  {
    name: 'low-conf (< 0.5) + non-block (review-tier) -> skip',
    confidence: 0.3,
    tool: 'Edit',
    input: { file_path: 'src/components/Button.tsx', new_string: 'const x = 1;' },
    // A plain component edit scores 'review' (non-block); confidence < 0.5 -> skip.
    expectAction: 'review',
    expectDecision: 'skip',
  },
  {
    name: 'block-risk write (STATE.md + 300-line diff) -> override at high conf',
    confidence: 0.95,
    tool: 'Edit',
    input: { file_path: '.planning/STATE.md', new_string: bigDiff(300) },
    expectAction: 'block',
    expectDecision: 'override',
  },
  {
    name: 'block-risk write -> override even at LOW conf (block short-circuits)',
    confidence: 0.1,
    tool: 'Edit',
    input: { file_path: '.planning/STATE.md', new_string: bigDiff(300) },
    expectAction: 'block',
    expectDecision: 'override',
  },
];

for (const g of GAPS) {
  test(`56-04: routing — ${g.name}`, () => {
    const risk = computeRisk(g.tool, g.input);
    if (g.expectAction) {
      assert.equal(risk.suggested_action, g.expectAction, `action: got ${risk.suggested_action} @ ${risk.score}`);
    }
    const decision = route(g.confidence, risk.suggested_action);
    assert.equal(decision, g.expectDecision, `decision: got ${decision} (conf ${g.confidence}, action ${risk.suggested_action})`);
  });
}

test('56-04: routing — a missing confidence field is treated as the lowest tier', () => {
  // A non-block action with no confidence -> skip; a block action -> override.
  const reviewRisk = computeRisk('Edit', { file_path: 'src/components/Button.tsx', new_string: 'const x = 1;' });
  assert.notEqual(reviewRisk.suggested_action, 'block', 'precondition: a plain component edit is non-block');
  assert.equal(route(undefined, reviewRisk.suggested_action), 'skip');
  const blockRisk = computeRisk('Edit', { file_path: '.planning/STATE.md', new_string: bigDiff(300) });
  assert.equal(blockRisk.suggested_action, 'block');
  assert.equal(route(undefined, blockRisk.suggested_action), 'override');
});

test('56-04: routing — the four named matrix cells produce auto/confirm/skip/override', () => {
  const seen = new Set();
  for (const g of GAPS) {
    seen.add(route(g.confidence, computeRisk(g.tool, g.input).suggested_action));
  }
  for (const d of ['auto', 'confirm', 'skip', 'override']) {
    assert.ok(seen.has(d), `matrix covers '${d}'`);
  }
});

// ── The /gdd:override skill SKILL.md ─────────────────────────────────────────

test('56-04: override SKILL.md exists', () => {
  assert.ok(fs.existsSync(SKILL_PATH), `expected ${SKILL_PATH}`);
});

test('56-04: override SKILL.md has valid v3 frontmatter (mirrors unlock-decision)', () => {
  const fm = readFrontmatter(SKILL_PATH);
  assert.equal(fm.name, 'gdd-override', 'name is gdd-override');
  assert.equal(typeof fm.description, 'string');
  assert.ok(fm.description.length > 40, 'description is substantive');
  // v3 description grammar: a "Use when ..." trigger + an "Activates for ..." clause.
  assert.match(fm.description, /Use when/, 'description has a "Use when" trigger');
  assert.match(fm.description, /Activates for/i, 'description has an "Activates for" clause');
  assert.equal(typeof fm['argument-hint'], 'string');
  assert.match(fm['argument-hint'], /finding-id/, 'argument-hint documents finding-id');
  assert.match(fm['argument-hint'], /factforce/, 'argument-hint documents factforce');
  assert.match(fm['argument-hint'], /--approver/, 'argument-hint documents --approver');
  assert.equal(fm['user-invocable'], true, 'user-invocable');
  assert.equal(typeof fm.tools, 'string');
});

test('56-04: override SKILL.md documents BOTH modes (finding + factforce)', () => {
  const body = fs.readFileSync(SKILL_PATH, 'utf8');
  // Finding mode: records a D-XX override-tagged decision via the STATE writer.
  assert.match(body, /add_decision/, 'cites the add_decision STATE writer');
  assert.match(body, /D-XX|D-N\b|D-\d/, 'mentions the D-XX decision id');
  assert.match(body, new RegExp(OVERRIDE_TAG), 'mentions the override tag');
  // Factforce mode: sets checked[path] in the session state file.
  assert.match(body, /factforce/, 'documents factforce mode');
  assert.match(body, /checked\[path\]|checked\[/, 'mentions checked[path]');
  assert.match(body, /\.design\/locks\/factforce-/, 'cites the session state file path');
  // Audit invariant: always asks for a rationale; previews before writing.
  assert.match(body, /--approver/, 'requires --approver');
  assert.match(body, /Preview/i, 'preview-first (mirrors unlock-decision)');
  // Cites A's pure primitives it consumes.
  assert.match(body, /scripts\/lib\/risk\/(route|override)\.cjs/, 'cites the risk libs');
});

test('56-04: override SKILL.md is em-dash-free and free of the -- prose token', () => {
  const body = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.equal(body.includes('—'), false, 'no em-dash (U+2014)');
  // No double-hyphen in body PROSE. CLI flags (--approver, --reason) live inside
  // backtick code spans / the args table cells (which are masked by the prose
  // linter), so we scan only lines outside fenced code blocks for a `--` that is
  // not part of a longer flag token and not a structural --- run.
  const lines = body.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[ \t]*(`{3,}|~{3,})/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    // strip inline code spans + the frontmatter region is above the first body line anyway
    const stripped = line.replace(/`[^`]*`/g, '');
    // an exactly-two-hyphen token that is NOT immediately followed by a word char
    // (so `--approver` is fine) and not a structural --- delimiter row.
    assert.equal(/(?<![-\w])--(?![-\w])/.test(stripped), false, `bare -- token on line ${i + 1}: ${line}`);
  }
});

// ── The scriptable override helper (scripts/lib/risk/override.cjs) ───────────

test('56-04: overrideDecisionEntry — shapes an override-tagged, audited, locked entry', () => {
  const entry = overrideDecisionEntry('G-12', { approver: 'alice', reason: 'later constraint invalidated the block' });
  assert.equal(entry.status, 'locked', 'override is a recorded, locked audit entry');
  assert.equal(entry.tag, OVERRIDE_TAG);
  assert.match(entry.text, new RegExp(`\\[${OVERRIDE_TAG}\\]`), 'tag is embedded in text (greppable)');
  assert.match(entry.text, /G-12/, 'finding id recorded');
  assert.match(entry.text, /alice/, 'approver recorded');
  assert.match(entry.text, /later constraint invalidated the block/, 'reason recorded verbatim');
});

test('56-04: overrideDecisionEntry — records the approver even when reason is omitted', () => {
  const entry = overrideDecisionEntry('G-3', { approver: 'bob' });
  assert.match(entry.text, /bob/);
  assert.ok(!/Reason:/.test(entry.text), 'no dangling Reason: when omitted');
});

test('56-04: overrideDecisionEntry — missing approver throws (override is never silent)', () => {
  assert.throws(() => overrideDecisionEntry('G-1', {}), /approver/);
  assert.throws(() => overrideDecisionEntry('G-1', { approver: '   ' }), /approver/);
  assert.throws(() => overrideDecisionEntry('', { approver: 'alice' }), /finding id/);
});

test('56-04: setFactForceChecked — sets checked[path] purely (factforce mode)', () => {
  const before = { reads: { 'src/a.ts': true }, checked: {} };
  const after = setFactForceChecked(before, 'src/Button.tsx');
  assert.equal(after.checked['src/Button.tsx'], true, 'path is checked');
  assert.equal(after.reads['src/a.ts'], true, 'existing reads preserved');
  // purity: the input object is not mutated.
  assert.deepEqual(before.checked, {}, 'input checked map untouched');
  assert.notEqual(after, before, 'returns a new object');
});

test('56-04: setFactForceChecked — seeds a fresh state on a greenfield session', () => {
  const after = setFactForceChecked(undefined, './src/Card.tsx');
  // path is normalized (leading ./ stripped, backslashes -> forward).
  assert.equal(after.checked['src/Card.tsx'], true);
  assert.deepEqual(after.reads, {});
});

test('56-04: setFactForceChecked — requires a path', () => {
  assert.throws(() => setFactForceChecked({}, ''), /path/);
});

test('56-04: isFactForceChecked — round-trips with setFactForceChecked', () => {
  const state = setFactForceChecked({}, 'src/x.ts');
  assert.equal(isFactForceChecked(state, 'src/x.ts'), true);
  assert.equal(isFactForceChecked(state, './src/x.ts'), true, 'reads through path normalization');
  assert.equal(isFactForceChecked(state, 'src/other.ts'), false);
  assert.equal(isFactForceChecked(null, 'src/x.ts'), false);
});
