'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const lp = require('../../scripts/lint-prose.cjs');
const gs = require('../../scripts/generate-style-md.cjs');
const { readProseDenylist } = require('../../scripts/lib/manifest/index.cjs');

const DENY = readProseDenylist().tells;

test('43-prose-01: detects an em dash in prose', () => {
  const f = lp.scan('A clause — another clause.', DENY);
  assert.ok(f.some((x) => x.match === '—'), 'em dash should be flagged');
});

test('43-prose-02: detects a prose double hyphen but NOT structural --- (HR / table / frontmatter)', () => {
  assert.ok(lp.scan('a -- b', DENY).some((x) => x.match === '--'), 'prose -- flagged');
  assert.equal(lp.scan('---', DENY).some((x) => x.kind === 'token' && x.match === '--'), false, 'HR --- not flagged');
  assert.equal(lp.scan('| --- | --- |', DENY).some((x) => x.match === '--'), false, 'table delim not flagged');
});

test('43-prose-03: detects AI-prose tells (case-insensitive, word-boundary)', () => {
  assert.ok(lp.scan('We leverage the cache.', DENY).some((x) => /leverage/i.test(x.pattern)));
  assert.ok(lp.scan('A robust system.', DENY).some((x) => /robust/i.test(x.pattern)));
  assert.equal(lp.scan('clever', DENY).some((x) => /leverage/i.test(x.pattern)), false, 'substring must not match');
});

test('43-prose-04: skips fenced code (incl. indented + nested) and inline code', () => {
  assert.equal(lp.scan('```\na — b --x\n```', DENY).length, 0, 'fenced skipped');
  assert.equal(lp.scan('   b. Run:\n      ```bash\n      git log --oneline -- .x\n      ```\n', DENY).length, 0, 'indented fence skipped');
  assert.equal(lp.scan('Use `--json` here.', DENY).length, 0, 'inline code skipped');
});

test('43-prose-05: skips disable-blocks and HTML comments', () => {
  assert.equal(lp.scan('<!-- prose-lint-disable -->\nbest — worst\n<!-- prose-lint-enable -->', DENY).length, 0);
  assert.equal(lp.scan('<!-- impl: v0 -->', DENY).length, 0, 'HTML comment delimiters not flagged');
});

test('43-prose-06: a stray unbalanced backtick does not cascade (per-line inline masking)', () => {
  // line 1 closes a span that never opened; line 2 has a real inline flag that must still be masked
  const text = 'orphan ` here\nthen `--json` runs';
  assert.equal(lp.scan(text, DENY).some((x) => x.match === '--'), false, '--json stays masked despite stray tick');
});

test('43-prose-07: Cyrillic-majority text is detected for locale skip', () => {
  assert.equal(lp.isCyrillicMajority('Это полностью русский текст про дизайн и качество.'), true);
  assert.equal(lp.isCyrillicMajority('This is fully English prose about design quality.'), false);
});

test('43-prose-08: line:column are 1-based and accurate', () => {
  const f = lp.scan('ok line\nbad — here', DENY).find((x) => x.match === '—');
  assert.equal(f.line, 2);
  assert.equal(f.col, 5); // "bad " = b(1) a(2) d(3) space(4), em dash at col 5
});

test('43-prose-09: em-dash token decodes from the \\u2014 SoT representation', () => {
  const m = lp.buildMatcher({ pattern: '\\u2014', kind: 'token' });
  assert.ok(m.test('x — y'), 'decoded matcher hits the real em dash char');
});

test('43-prose-10: full repo scope is CLEAN (the green gate)', () => {
  const code = lp.main([]);
  assert.equal(code, 0, 'lint:prose must be 0 across the project after the Phase 43 corpus purge');
});

test('43-prose-12: scanDescription flags em-dash + tells but EXEMPTS the -- flag token (SC#7)', () => {
  const emFm = '---\nname: x\ndescription: A clause — another.\n---\nbody';
  const flagFm = '---\nname: x\ndescription: Accepts --dry-run and --confirm-shared.\n---\nbody';
  const tellFm = '---\nname: x\ndescription: A robust pipeline.\n---\nbody';
  assert.ok(lp.scanDescription(emFm, DENY).some((f) => f.match === '—'), 'em dash in description flagged');
  assert.equal(lp.scanDescription(flagFm, DENY).length, 0, '-- flag token exempt in descriptions');
  assert.ok(lp.scanDescription(tellFm, DENY).some((f) => /robust/i.test(f.pattern)), 'tell in description flagged');
  assert.equal(lp.extractDescription(emFm), 'A clause — another.');
});

test('43-prose-11: STYLE.md is generated from the denylist and is current (drift gate)', () => {
  assert.equal(gs.main(['--check']), 0, 'STYLE.md must equal `npm run build:style` output');
  const md = gs.render();
  assert.match(md, /GENERATED FILE/);
  for (const t of DENY.filter((d) => d.kind === 'phrase')) assert.ok(md.includes('`' + t.pattern + '`'), `STYLE.md documents ${t.pattern}`);
});
