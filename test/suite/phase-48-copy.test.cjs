'use strict';
// Phase 48 - Copy pillar expansion. Static contract over the Copy-pillar unit:
//   - design-auditor doc bug fixed (no "6-Pillar" heading), scoring_contract_version marker present,
//     reserved 8th-pillar slot documented.
//   - reference/copy-quality.md exists and covers the microcopy categories.
//   - agents/copy-auditor.md frontmatter carries the 8 validator-required fields.
// Hermetic: file reads only, no live audit. Every test tagged `48-copy:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readFrontmatter } = require('./helpers.ts');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));

const AUDITOR = read('agents/design-auditor.md');

// Validator-required frontmatter fields (mirror scripts/validate-frontmatter.ts REQUIRED_FIELDS).
const REQUIRED_FIELDS = [
  'name',
  'description',
  'tools',
  'color',
  'parallel-safe',
  'typical-duration-seconds',
  'reads-only',
  'writes',
];

test('48-copy: design-auditor has no "6-Pillar" heading (doc bug fixed)', () => {
  // The heading and body are both 7 pillars now. No "6-Pillar"/"6 Pillar" text should survive
  // anywhere in the file (the line-71 heading and the line-462 "6-pillar audit" reference).
  assert.ok(
    !/6-?\s?[Pp]illar/.test(AUDITOR),
    'design-auditor still contains a "6-Pillar" reference - the 7-pillar doc bug is not fixed'
  );
  // Positive: the corrected heading exists.
  assert.match(AUDITOR, /##\s+7-Pillar Scoring System/, 'missing "## 7-Pillar Scoring System" heading');
});

test('48-copy: design-auditor carries a scoring_contract_version marker', () => {
  assert.match(
    AUDITOR,
    /scoring_contract_version/,
    'design-auditor missing a scoring_contract_version marker'
  );
  assert.match(
    AUDITOR,
    /Scoring contract:\s*v2/i,
    'design-auditor missing the v2 scoring-contract version label'
  );
});

test('48-copy: design-auditor documents a reserved, unscored 8th pillar', () => {
  assert.match(AUDITOR, /Pillar 8/, 'design-auditor missing a named 8th pillar slot');
  assert.match(
    AUDITOR,
    /reserved[^\n]*unscored|unscored[^\n]*reserved/i,
    'design-auditor 8th-pillar slot is not documented as reserved and unscored'
  );
  // The total must remain /28 - the reserved slot does not add to the score.
  assert.match(AUDITOR, /\/28/, 'design-auditor no longer states the /28 total');
});

test('48-copy: design-auditor Pillar 1 references copy-quality.md and copy-auditor', () => {
  assert.match(AUDITOR, /reference\/copy-quality\.md/, 'Pillar 1 does not reference reference/copy-quality.md');
  assert.match(AUDITOR, /copy-auditor/, 'Pillar 1 does not reference the copy-auditor agent');
});

test('48-copy: reference/copy-quality.md exists', () => {
  assert.ok(exists('reference/copy-quality.md'), 'reference/copy-quality.md was not created');
});

test('48-copy: copy-quality.md covers the microcopy categories', () => {
  const COPY = read('reference/copy-quality.md');
  const categories = [
    /button|CTA/i,        // button / CTA labels
    /error message/i,     // error messages
    /empty state/i,       // empty states
    /loading|skeleton/i,  // loading / skeleton copy
    /ARIA/,               // ARIA text quality
    /alt[- ]text/i,       // alt-text quality
    /form label|helper|validation/i, // form copy
  ];
  for (const re of categories) {
    assert.match(COPY, re, `copy-quality.md missing a microcopy category matching ${re}`);
  }
  // i18n lens: hardcoded-string probe + the +40% expansion-overflow check.
  assert.match(COPY, /\+40%/, 'copy-quality.md missing the +40% expansion-overflow lens');
  assert.match(COPY, /hardcoded/i, 'copy-quality.md missing the hardcoded user-facing string probe');
  // 1-4 scoring guide for the Copy pillar.
  assert.match(COPY, /Scoring Guide/i, 'copy-quality.md missing a Scoring Guide section');
});

test('48-copy: copy-auditor.md frontmatter has the 8 required fields', () => {
  assert.ok(exists('agents/copy-auditor.md'), 'agents/copy-auditor.md was not created');
  const fm = readFrontmatter(path.join(REPO_ROOT, 'agents/copy-auditor.md'));
  for (const field of REQUIRED_FIELDS) {
    assert.ok(
      field in fm && fm[field] !== '' && fm[field] !== null && fm[field] !== undefined,
      `copy-auditor.md frontmatter missing required field "${field}"`
    );
  }
  // name must match the filename stem (validator + agent-frontmatter contract).
  assert.equal(fm.name, 'copy-auditor', 'copy-auditor.md frontmatter name must be "copy-auditor"');
  // size_budget: M is required by the unit spec (cap 300 lines).
  assert.equal(String(fm.size_budget).toUpperCase(), 'M', 'copy-auditor.md must declare size_budget: M');
});
