'use strict';
// Phase 35.5 — /hone:export skill static contract. Structural assertions on
// skills/export/SKILL.md (NO live render, NO Notion call — D-07): the skill routes the
// three formats (html|pdf|notion), reads the design source set, redacts always +
// pseudonymizes on opt-in, hands HTML to pr-commenter on --pr, and forbids a PDF/markdown
// runtime (D-02). Hermetic: file reads only. Every test tagged `35.5-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SKILL = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'export', 'SKILL.md'), 'utf8');
const fm = SKILL.split('---')[1] || '';

test('35.5-02: export SKILL frontmatter — name, user-invocable, tools', () => {
  assert.match(fm, /name:\s*hone-export/, 'name: hone-export');
  assert.match(fm, /user-invocable:\s*true/, 'user-invocable');
  for (const tool of ['Read', 'Write', 'Bash', 'Glob', 'ToolSearch', 'Task']) {
    assert.match(fm, new RegExp(`\\b${tool}\\b`), `tools includes ${tool}`);
  }
});

test('35.5-02: argument-hint declares the 3 formats + the two flags', () => {
  assert.match(fm, /--format\s+html\|pdf\|notion/, 'argument-hint: --format html|pdf|notion');
  assert.match(fm, /--pseudonymize/, 'argument-hint: --pseudonymize');
  assert.match(fm, /--pr\b/, 'argument-hint: --pr');
});

test('35.5-02: skill routes all three formats', () => {
  assert.match(SKILL, /`html`/, 'html format');
  assert.match(SKILL, /`pdf`/, 'pdf format');
  assert.match(SKILL, /`notion`/, 'notion format');
});

test('35.5-02: html/pdf go through the pure build-html assembler', () => {
  assert.match(SKILL, /scripts\/lib\/export\/build-html\.cjs/, 'references build-html.cjs');
  assert.match(SKILL, /buildHtml\(/, 'calls buildHtml');
  assert.match(SKILL, /print:\s*true/, 'pdf uses the print variant');
  assert.match(SKILL, /self-contained/i, 'states the self-contained guarantee');
});

test('35.5-02: notion format probes the MCP + degrades to html', () => {
  assert.match(SKILL, /ToolSearch\(\{[^}]*notion/i, 'probes the Notion MCP via ToolSearch');
  assert.match(SKILL, /degrade/i, 'degrades when notion unavailable');
  assert.match(SKILL, /GDD_DISABLE_NOTION/, 'honors the kill-switch');
});

test('35.5-02: redact mandatory + pseudonymize opt-in', () => {
  assert.match(SKILL, /scripts\/lib\/redact\.cjs/, 'uses redact.cjs');
  assert.match(SKILL, /scripts\/lib\/pseudonymize\.cjs/, 'uses pseudonymize.cjs');
  assert.match(SKILL, /Redact\s*\(always\)/i, 'redact is always-on');
  assert.match(SKILL, /un-?redacted/i, 'forbids emitting an un-redacted artifact');
});

test('35.5-02: --pr hands the HTML to pr-commenter', () => {
  assert.match(SKILL, /pr-commenter/, 'references the pr-commenter agent');
  assert.match(SKILL, /--pr\b/, 'has the --pr flow');
});

test('35.5-02: reads the design source set', () => {
  // Literal filename match — substring, not a built-from-string regex (avoids
  // js/incomplete-sanitization: a partial `.`-only escape leaves `\` unescaped).
  for (const src of ['EXPERIENCE.md', 'DESIGN.md', 'DESIGN-VERIFICATION.md']) {
    assert.ok(SKILL.includes(src), `source set includes ${src}`);
  }
});

test('35.5-02: forbids a bundled PDF/markdown runtime (D-02)', () => {
  assert.match(SKILL, /Do Not/i, 'has a Do Not section');
  assert.match(SKILL, /puppeteer|pdfkit|paged/i, 'names the forbidden runtimes');
});

test('35.5-02: emits the EXPORT COMPLETE terminator', () => {
  assert.match(SKILL, /##\s*EXPORT COMPLETE/, 'ends with ## EXPORT COMPLETE');
});
