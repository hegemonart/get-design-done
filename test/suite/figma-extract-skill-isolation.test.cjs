'use strict';

// Plan 31-07 (Wave C.1) — STATIC isolation suite for skills/figma-extract/SKILL.md.
//
// Enforces the off-context guarantee (decision D-12): the orchestration skill
// must NEVER instruct the model to read the raw/*.json cache. The spike proved
// 0 Claude tokens during extraction; that property only holds if the skill
// surfaces the compact digest outputs and never `cat`s / `Read`s the raw cache.
// These tests are pure file-content scans (no network, no execution of the
// skill) so the guarantee is asserted in CI and cannot silently regress.
//
// Subtlety: the SKILL's `## Do Not` section NAMES `raw/*.json` in order to
// FORBID reading it. A naive "does the file mention raw/*.json?" scan would
// self-trip on that prohibition. So before scanning for read INSTRUCTIONS we
// strip lines that are clearly prohibitions (Do NOT / never / defeats /
// tool-internal). The remaining (instruction-context) text must be raw-read
// free.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const SKILL_REL = 'skills/figma-extract/SKILL.md';
const SKILL_PATH = path.join(REPO_ROOT, SKILL_REL);

const SKILL = fs.readFileSync(SKILL_PATH, 'utf8');
const LINES = SKILL.split(/\r?\n/);

// A line is a prohibition (allowed to NAME raw/*.json) if it forbids/denies.
// Stripping these before the raw-read scan lets the Do-Not bullet name the
// raw cache to forbid it without tripping the instruction-context scan.
const PROHIBITION_RE = /\bdo not\b|\bdon't\b|\bnever\b|\bdefeats\b|\btool-internal\b|\bforbid/i;

function nonProhibitionText() {
  return LINES.filter((l) => !PROHIBITION_RE.test(l)).join('\n');
}

// Forbidden raw-read INSTRUCTION patterns (scanned over non-prohibition text).
// Each represents an imperative to surface the raw cache into context.
const FORBIDDEN_READ_PATTERNS = [
  /cat\s+[^\n]*raw\/[^\n]*\.json/i, // `cat .../raw/x.json`
  /\bRead\b[^\n]*raw\/[^\n]*\.json/i, // Read tool on a raw json file
  /\bopen\b[^\n]*\braw\b[^\n]*\.json/i, // "open the raw .../x.json"
  /\b(read|inspect|view|load|parse|examine|dump)\b[^\n]*\braw\b[^\n]*(cache|json)/i, // "read the raw cache"
];

test('31-07: SKILL.md has no raw/*.json READ instruction (prohibition lines excluded)', () => {
  const scanText = nonProhibitionText();
  for (const re of FORBIDDEN_READ_PATTERNS) {
    assert.ok(
      !re.test(scanText),
      `D-12 violation: instruction-context text matches forbidden raw-read pattern ${re}`
    );
  }
  // Sanity: the stripping actually removed the Do-Not bullet that NAMES raw json,
  // so we are not vacuously passing because the file never mentions raw at all.
  assert.match(
    SKILL,
    /raw\/\*\.json|raw\/<file-key>/i,
    'SKILL should still mention raw/*.json inside a prohibition (Do Not) — otherwise the strip test is vacuous'
  );
});

test('31-07: SKILL.md invokes pull.cjs and digest.cjs (orchestrates tools, not prose reimplementation)', () => {
  assert.match(SKILL, /node\s+scripts\/lib\/figma-extract\/pull\.cjs/, 'must invoke pull.cjs via node');
  assert.match(SKILL, /node\s+scripts\/lib\/figma-extract\/digest\.cjs/, 'must invoke digest.cjs via node');
  // Path C optional plugin-sync wait starts the receiver.
  assert.match(SKILL, /node\s+scripts\/lib\/figma-extract\/receiver\.cjs/, 'must reference receiver.cjs for Path C');
});

test('31-07: SKILL.md is <=100 lines (Phase 28.5 warn threshold)', () => {
  // Trailing-newline-insensitive count (mirrors validate-skill-length.cjs).
  const trimmed = SKILL.replace(/\n+$/, '');
  const count = trimmed.split(/\r?\n/).length;
  assert.ok(count <= 100, `SKILL.md is ${count} lines; Phase 28.5 warn threshold is 100`);
});

test('31-07: SKILL.md frontmatter has name: gdd-figma-extract + description', () => {
  const fmMatch = SKILL.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(fmMatch, 'SKILL.md must open with a YAML frontmatter block');
  const fm = fmMatch[1];
  assert.match(fm, /^name:\s*gdd-figma-extract\s*$/m, 'frontmatter name must be exactly gdd-figma-extract');
  assert.match(fm, /^description:\s*\S+/m, 'frontmatter must include a non-empty description');
});

test('31-07: SKILL.md contains an explicit Do-Not against reading the raw cache (D-12 is documented)', () => {
  assert.match(SKILL, /##\s*Do Not/i, 'SKILL.md must have a Do Not section');
  // The prohibition must name the raw cache AND reference D-12.
  const hasRawProhibition = LINES.some(
    (l) => PROHIBITION_RE.test(l) && /\braw\b/i.test(l)
  );
  assert.ok(hasRawProhibition, 'Do Not section must explicitly forbid reading the raw cache');
  assert.match(SKILL, /D-12/, 'the off-context guarantee (D-12) must be cited');
});

test('31-07: SKILL.md does not instruct printing/persisting FIGMA_TOKEN (D-10)', () => {
  // Build the scan over non-prohibition text so the Do-Not bullet that forbids
  // printing the token does not itself trip the scan.
  const scanText = nonProhibitionText();
  const TOKEN_LEAK_PATTERNS = [
    /\b(echo|print|console\.log|cat|write)\b[^\n]*FIGMA_TOKEN/i, // print/echo the token
    /FIGMA_TOKEN[^\n]*>>?\s*\S+/i, // redirect token into a file
    /(save|persist|store|write)\b[^\n]*FIGMA_TOKEN/i, // persist the token
  ];
  for (const re of TOKEN_LEAK_PATTERNS) {
    assert.ok(!re.test(scanText), `D-10 violation: instruction-context text leaks FIGMA_TOKEN via ${re}`);
  }
  // And the SKILL must POSITIVELY document the env-only + no-print rule (D-10).
  assert.match(SKILL, /D-10/, 'SKILL.md must cite D-10 (token from env only, never persisted/printed)');
});
