// tests/domain-primitives.test.cjs — Plan 23-09 NNG / anti-patterns / WCAG
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const nng = require('../scripts/lib/domain-primitives/nng.cjs');
const ap = require('../scripts/lib/domain-primitives/anti-patterns.cjs');
const wcag = require('../scripts/lib/domain-primitives/wcag.cjs');

const sampleRule = {
  id: 'nng-01',
  severity: 'P1',
  grep: /placeholder-as-label/,
  summary: 'Inputs use placeholder text as their only label',
};

test('23-09: NNG check returns hit when content matches grep', () => {
  const hits = nng.check({
    file: 'src/Form.tsx',
    content: '<input placeholder-as-label />',
    rules: [sampleRule],
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule_id, 'nng-01');
  assert.equal(hits[0].severity, 'P1');
  assert.equal(hits[0].file, 'src/Form.tsx');
  assert.equal(hits[0].line, 1);
  assert.match(hits[0].evidence, /placeholder-as-label/);
});

test('23-09: NNG check returns [] when no match', () => {
  const hits = nng.check({
    file: 'src/x.tsx',
    content: 'safe content',
    rules: [sampleRule],
  });
  assert.equal(hits.length, 0);
});

test('23-09: NNG check returns [] for malformed input', () => {
  assert.equal(nng.check(null).length, 0);
  assert.equal(nng.check({}).length, 0);
  assert.equal(nng.check({ file: 'a', content: 5 }).length, 0);
});

test('23-09: parseRulesFromMarkdown extracts every yaml block with required fields', () => {
  const md = [
    'Some intro prose.',
    '',
    '```yaml',
    "id: ok-rule",
    'severity: P1',
    "grep: 'pattern-1'",
    "summary: 'fires on pattern 1'",
    '```',
    '',
    '```yaml',
    'id: skip-no-grep',
    'severity: P2',
    'summary: missing grep field',
    '```',
    '',
    '```yaml',
    "id: bad-severity",
    'severity: P9',
    "grep: 'p2'",
    '```',
    '',
    '```yaml',
    'id: also-ok',
    'severity: P0',
    "grep: 'pattern-2'",
    '```',
    '',
  ].join('\n');
  const rules = nng.parseRulesFromMarkdown(md);
  // Two rules survive: ok-rule, also-ok.
  assert.equal(rules.length, 2);
  assert.deepEqual(rules.map((r) => r.id).sort(), ['also-ok', 'ok-rule']);
});

test('23-09: anti-patterns check matches grep and reports rule_id', () => {
  const hits = ap.check({
    file: 'src/Card.tsx',
    content: '<div className="border-l-4 border-blue-500">',
    rules: [
      {
        id: 'ban-01',
        severity: 'P2',
        grep: /border-l-\d/,
        summary: 'Side-stripe borders are an AI-slop tell',
      },
    ],
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule_id, 'ban-01');
});

test('23-09: WCAG contrast — black on white is ratio 21', () => {
  const r = wcag.contrastRatio('#000000', '#ffffff');
  assert.ok(r > 20.99 && r < 21.01, `expected ~21, got ${r}`);
});

test('23-09: WCAG contrast — same color is ratio 1', () => {
  assert.equal(wcag.contrastRatio('#777', '#777'), 1);
});

test('23-09: WCAG contrast — passing AA returns no hit', () => {
  const hits = wcag.checkContrast({ file: 'a.css', fg: '#000', bg: '#fff' });
  assert.equal(hits.length, 0);
});

test('23-09: WCAG contrast — failing AA emits P0/P1 with evidence', () => {
  const hits = wcag.checkContrast({ file: 'a.css', fg: '#aaa', bg: '#fff' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule_id, 'wcag/1.4.3');
  assert.ok(['P0', 'P1'].includes(hits[0].severity));
  assert.match(hits[0].evidence, /ratio=/);
});

test('23-09: WCAG contrast — unparseable color → P2 hit', () => {
  const hits = wcag.checkContrast({ file: 'a.css', fg: 'oklch(50% 0 0)', bg: '#fff' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].severity, 'P2');
  assert.match(hits[0].summary, /unparseable/);
});

test('23-09: WCAG contrast — AAA threshold stricter than AA', () => {
  // #767676 on white ≈ 4.54:1 — passes AA (≥4.5), fails AAA (<7).
  const hitsAA = wcag.checkContrast({ file: 'a.css', fg: '#767676', bg: '#fff', level: 'AA' });
  const hitsAAA = wcag.checkContrast({ file: 'a.css', fg: '#767676', bg: '#fff', level: 'AAA' });
  assert.equal(hitsAA.length, 0);
  assert.equal(hitsAAA.length, 1);
  assert.equal(hitsAAA[0].rule_id, 'wcag/1.4.6');
});

test('23-09: WCAG tap target — 24×24 passes AA', () => {
  const hits = wcag.checkTapTarget({ file: 'a.css', width: 24, height: 24 });
  assert.equal(hits.length, 0);
});

test('23-09: WCAG tap target — 16×40 fails AA on width axis', () => {
  const hits = wcag.checkTapTarget({ file: 'a.css', width: 16, height: 40 });
  assert.equal(hits.length, 1);
  assert.match(hits[0].summary, /below AA minimum 24×24/);
});

test('23-09: WCAG tap target — AAA threshold is 44×44', () => {
  const hits = wcag.checkTapTarget({ file: 'a.css', width: 24, height: 24, level: 'AAA' });
  assert.equal(hits.length, 1);
  assert.match(hits[0].summary, /below AAA minimum 44×44/);
});

test('23-09: WCAG aria-labels — interactive without name → hit', () => {
  const hits = wcag.checkAriaLabels({
    file: 'src/Btn.html',
    content: '<button></button>',
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule_id, 'wcag/4.1.2');
  assert.equal(hits[0].line, 1);
});

test('23-09: WCAG aria-labels — text content satisfies the check', () => {
  const hits = wcag.checkAriaLabels({
    file: 'src/Btn.html',
    content: '<button>Click me</button>',
  });
  assert.equal(hits.length, 0);
});

test('23-09: WCAG aria-labels — aria-label attribute satisfies', () => {
  const hits = wcag.checkAriaLabels({
    file: 'src/Btn.html',
    content: '<button aria-label="Submit"></button>',
  });
  assert.equal(hits.length, 0);
});

test('23-09: WCAG aria-labels — input with value passes', () => {
  const hits = wcag.checkAriaLabels({
    file: 'src/F.html',
    content: '<input type="submit" value="Go" />',
  });
  assert.equal(hits.length, 0);
});
