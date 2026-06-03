'use strict';
// Phase 50 — Anti-slop verb-axis rubric (ORTHOGONAL lens, not a new pillar).
//
// Asserts:
//   1. reference/anti-slop-rubric.md defines the five named verb axes, the 35/50
//      threshold, the aesthetic-slop routing, and states it is orthogonal (no new
//      pillar, no change to the /28 or 0-100 math).
//   2. reference/visual-tells.md is v2: keeps the eight Phase-49 categories, adds the
//      five new ones, and every new category names a primary axis. 13 total.
//   3. reference/audit-scoring.md registers the verb_axes lens-tag in the Lens-Tags
//      (Orthogonal) section with verb_axes_scored and no weight change.
//   4. agents/design-auditor.md has a ## Anti-slop scoring section emitting
//      verb_axes_scored and the sum<35 routing, and does NOT add an eighth SCORED
//      pillar (the reserved Pillar 8 stays unscored, total stays /28).
//   5. agents/design-debt-crawler.md and reference/debt-categories.md define the
//      aesthetic-slop debt class.
//
// Read + substring/regex asserts only — no execution.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

const RUBRIC = path.join(REPO_ROOT, 'reference', 'anti-slop-rubric.md');
const TELLS = path.join(REPO_ROOT, 'reference', 'visual-tells.md');
const SCORING = path.join(REPO_ROOT, 'reference', 'audit-scoring.md');
const AUDITOR = path.join(REPO_ROOT, 'agents', 'design-auditor.md');
const CRAWLER = path.join(REPO_ROOT, 'agents', 'design-debt-crawler.md');
const CATEGORIES = path.join(REPO_ROOT, 'reference', 'debt-categories.md');

const VERB_AXES = ['Directness', 'Distinctness', 'Hierarchy', 'Authenticity', 'Density'];

const TELLS_V1 = [
  'default-AI-hero',
  'gradient-spam',
  'isometric-illustration-fallback',
  'centered-everything-syndrome',
  'inter-everything',
  'purple-violet-default',
  'glassmorphism-spam',
  'decorative-motion-without-intent',
];

const TELLS_V2_NEW = [
  'stock-photo-people',
  'badge-spam',
  'oversized-single-word',
  'motion-without-content-intent',
  'narrator-from-a-distance-UI',
];

const read = (p) => fs.readFileSync(p, 'utf8');

// ── 1. anti-slop-rubric.md ──────────────────────────────────────────────────
test('phase-50-rubric: anti-slop-rubric.md exists', () => {
  assert.ok(fs.existsSync(RUBRIC), `expected rubric at ${RUBRIC}`);
});

test('phase-50-rubric: rubric defines the five named verb axes', () => {
  const text = read(RUBRIC);
  for (const axis of VERB_AXES) {
    // Each axis is a top-level "## Axis N: <Name>" heading.
    assert.match(
      text,
      new RegExp(`##\\s+Axis\\s+\\d+:\\s+${axis}\\b`),
      `rubric must define an "## Axis N: ${axis}" section`,
    );
  }
});

test('phase-50-rubric: each axis carries a 1-10 scale and a diagnostic question', () => {
  const text = read(RUBRIC);
  // Diagnostic question per axis (five), and 1-10 / "1-10" scale language present.
  const diagnostics = text.match(/\*\*Diagnostic question:\*\*/g) || [];
  assert.ok(
    diagnostics.length >= 5,
    `rubric must carry a diagnostic question per axis (>=5, got ${diagnostics.length})`,
  );
  assert.match(text, /\b1-10\b/, 'rubric must state a 1-10 score scale');
});

test('phase-50-rubric: rubric defines the 35/50 threshold and the sum formula', () => {
  const text = read(RUBRIC);
  // Threshold sum < 35 out of 50.
  assert.match(text, /<\s*35/, 'rubric must state the sum < 35 threshold');
  assert.match(text, /\b50\b/, 'rubric must state the 50-point maximum (5 axes x 10)');
  // The sum is the five axes added.
  assert.match(
    text,
    /directness\s*\+\s*distinctness\s*\+\s*hierarchy\s*\+\s*authenticity\s*\+\s*density/i,
    'rubric must define verb_axes_sum as the five axes added',
  );
});

test('phase-50-rubric: sub-35 routes to the design-debt-crawler with aesthetic-slop', () => {
  const text = read(RUBRIC);
  assert.ok(
    text.includes('design-debt-crawler'),
    'rubric must route the failing sum to design-debt-crawler',
  );
  assert.ok(
    /category:\s*aesthetic-slop/.test(text),
    'rubric must route with category: aesthetic-slop',
  );
});

test('phase-50-rubric: rubric states it is an ORTHOGONAL lens, not a new pillar', () => {
  const text = read(RUBRIC);
  assert.match(text, /orthogonal/i, 'rubric must declare itself orthogonal');
  // Explicitly: no new pillar, and no change to /28 or 0-100 math.
  assert.ok(
    /(not a new pillar|no(t)? (an )?eighth scored pillar|does NOT.*add.*pillar)/i.test(text),
    'rubric must state it adds no new pillar',
  );
  assert.ok(
    /\/28/.test(text) && /0-100/.test(text),
    'rubric must state it changes neither the /28 nor the 0-100 math',
  );
});

// ── 2. visual-tells.md v2 — 13 categories, new ones name a primary axis ──────
test('phase-50-rubric: visual-tells.md keeps all eight Phase-49 categories', () => {
  const text = read(TELLS);
  for (const cat of TELLS_V1) {
    assert.match(text, new RegExp(`##\\s+${cat}\\b`), `v2 catalog must keep "## ${cat}"`);
  }
});

test('phase-50-rubric: visual-tells.md adds the five new categories', () => {
  const text = read(TELLS);
  for (const cat of TELLS_V2_NEW) {
    assert.match(text, new RegExp(`##\\s+${cat}\\b`), `v2 catalog must add "## ${cat}"`);
  }
});

test('phase-50-rubric: visual-tells.md has 13 tell categories total (8 + 5)', () => {
  const text = read(TELLS);
  const all = [...TELLS_V1, ...TELLS_V2_NEW];
  assert.equal(all.length, 13, 'expected exactly 13 named categories (8 v1 + 5 v2)');
  for (const cat of all) {
    assert.match(text, new RegExp(`##\\s+${cat}\\b`), `catalog must name "## ${cat}"`);
  }
});

test('phase-50-rubric: each new category names a primary axis from the rubric', () => {
  const text = read(TELLS);
  // Split into sections by "## " headings; for each new category section, assert a
  // "Primary axis: <one of the five>" line is present in that section.
  const sections = text.split(/\n(?=##\s+)/);
  for (const cat of TELLS_V2_NEW) {
    const section = sections.find((s) => new RegExp(`^##\\s+${cat}\\b`).test(s.trim()));
    assert.ok(section, `could not isolate the "${cat}" section`);
    const axisLine = section.match(/Primary axis:\s*([A-Za-z]+)/);
    assert.ok(axisLine, `"${cat}" must carry a "Primary axis: <axis>" cross-link line`);
    assert.ok(
      VERB_AXES.includes(axisLine[1]),
      `"${cat}" primary axis "${axisLine[1]}" must be one of the five rubric axes`,
    );
  }
});

test('phase-50-rubric: visual-tells.md is marked v2 and notes commit-by-commit growth', () => {
  const text = read(TELLS);
  assert.match(text, /Visual Tells Catalog \(v2\)/, 'catalog title must read v2');
  assert.match(
    text,
    /grows commit by commit/i,
    'catalog must note it grows commit by commit (hands-on usage)',
  );
});

// ── 3. audit-scoring.md registers the verb_axes lens-tag ─────────────────────
test('phase-50-rubric: audit-scoring.md registers the verb_axes lens-tag', () => {
  const text = read(SCORING);
  // It lives under the Lens-Tags (Orthogonal) section.
  assert.match(text, /##\s+Lens-Tags \(Orthogonal\)/, 'scoring must have the Lens-Tags section');
  assert.match(text, /###\s+`verb_axes`/, 'scoring must register a `verb_axes` lens-tag entry');
  // It attaches verb_axes_scored with the five axes and does not change weights.
  assert.ok(
    /verb_axes_scored:\s*\{directness,\s*distinctness,\s*hierarchy,\s*authenticity,\s*density\}/.test(text),
    'verb_axes tag must attach verb_axes_scored with the five axes',
  );
  assert.ok(
    /does NOT.*change pillar weights/i.test(text),
    'verb_axes tag must state it changes no pillar weights',
  );
});

// ── 4. design-auditor.md — Anti-slop scoring, additive, no 8th scored pillar ─
test('phase-50-rubric: design-auditor.md has an ## Anti-slop scoring section', () => {
  const text = read(AUDITOR);
  assert.match(text, /##\s+Anti-slop scoring/, 'auditor must add an "## Anti-slop scoring" section');
});

test('phase-50-rubric: auditor emits verb_axes_scored and the sum<35 routing', () => {
  const text = read(AUDITOR);
  assert.ok(text.includes('verb_axes_scored'), 'auditor must emit verb_axes_scored as a lens-tag');
  assert.match(text, /<\s*35/, 'auditor must apply the sum < 35 routing');
  assert.ok(text.includes('aesthetic-slop'), 'auditor must flag aesthetic-slop for the debt crawler');
  // Cites the rubric rather than inlining its scales.
  assert.ok(
    text.includes('reference/anti-slop-rubric.md'),
    'auditor must cite reference/anti-slop-rubric.md',
  );
});

test('phase-50-rubric: anti-slop scoring is v2-compatible additive (no contract break)', () => {
  const text = read(AUDITOR);
  // It must call itself orthogonal / additive and keep the v2 contract + /28 total.
  assert.ok(
    /orthogonal/i.test(text) && /additive/i.test(text),
    'auditor must describe the anti-slop lens as orthogonal and additive',
  );
  assert.match(text, /scoring_contract_version/, 'auditor must reference the scoring contract version');
});

test('phase-50-rubric: auditor does NOT add an eighth SCORED pillar (Pillar 8 stays reserved)', () => {
  const text = read(AUDITOR);
  // The reserved Pillar 8 must still be present and explicitly unscored.
  assert.match(
    text,
    /###\s+Pillar 8:[^\n]*\(reserved, unscored\)/,
    'Pillar 8 must remain the reserved, unscored slot',
  );
  assert.ok(
    /reserved slot - do NOT score/i.test(text),
    'Pillar 8 must keep its "do NOT score" reservation',
  );
  // The audit total stays /28 (7 scored pillars x 4). The anti-slop lens must NOT
  // introduce a "Pillar 9" or renumber to an eighth scored pillar.
  assert.ok(!/###\s+Pillar 9\b/.test(text), 'auditor must not introduce a Pillar 9');
  assert.match(text, /\/28 \(7 pillars × 4\)/, 'audit total must stay /28 (7 pillars × 4)');
});

// ── 5. crawler + debt-categories define aesthetic-slop ───────────────────────
test('phase-50-rubric: debt-categories.md defines the aesthetic-slop debt class', () => {
  const text = read(CATEGORIES);
  assert.match(text, /###\s+aesthetic-slop/, 'debt-categories must define an "### aesthetic-slop" class');
  // Detection signal = verb-axes sum < 35 of 50, corroborated by visual-tells.
  assert.ok(
    /<\s*35/.test(text) && /verb_axes_scored/.test(text),
    'aesthetic-slop class must cite the sum<35 verb-axes signal and verb_axes_scored',
  );
  assert.ok(
    text.includes('reference/anti-slop-rubric.md') && text.includes('reference/visual-tells.md'),
    'aesthetic-slop class must reference the rubric and the visual-tells catalog',
  );
});

test('phase-50-rubric: design-debt-crawler.md scans for aesthetic-slop', () => {
  const text = read(CRAWLER);
  assert.ok(text.includes('aesthetic-slop'), 'crawler must name the aesthetic-slop class');
  assert.ok(
    text.includes('reference/anti-slop-rubric.md'),
    'crawler must reference the anti-slop rubric',
  );
  // It carries the class in its Summary-by-Class output table.
  assert.match(
    text,
    /\|\s*aesthetic-slop\s*\|/,
    'crawler output table must include an aesthetic-slop row',
  );
});
