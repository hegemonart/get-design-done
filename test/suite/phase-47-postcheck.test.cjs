// test/suite/phase-47-postcheck.test.cjs — Phase 47 (Live Mode) variant post-check.
// Exercises scripts/lib/live/postcheck.cjs: a clean variant produces 0 findings; a variant
// carrying a known anti-pattern surfaces a finding; an ERROR-severity finding is FLAGGED but
// NOT auto-rejected (autoReject is always false); summarizeForCard returns a compact string.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  postCheckVariant,
  summarizeForCard,
} = require('../../scripts/lib/live/postcheck.cjs');

// ---------------------------------------------------------------------------
// (a) A clean variant → zero findings, both counts zero, autoReject false.

test('47-postcheck: clean variant yields 0 findings', () => {
  const content = `.btn {
  color: #333;
  padding: 8px 12px;
  border-radius: 4px;
}`;
  const res = postCheckVariant({ projectRoot: process.cwd(), content });
  assert.equal(res.findings.length, 0, 'clean variant has no findings');
  assert.equal(res.errorCount, 0);
  assert.equal(res.warnCount, 0);
  assert.equal(res.autoReject, false, 'autoReject is always false');
});

test('47-postcheck: clean variant summarizes as a non-empty string', () => {
  const res = postCheckVariant({ content: '.ok { color: #222; }' });
  const summary = summarizeForCard(res.findings);
  assert.equal(typeof summary, 'string');
  assert.ok(summary.length > 0, 'summary is a non-empty string');
  assert.match(summary, /clean/i, 'clean variant summary mentions clean');
});

// ---------------------------------------------------------------------------
// (b) A warn-severity anti-pattern (BAN-01 thick side-stripe) is surfaced.

test('47-postcheck: warn anti-pattern (BAN-01 side-stripe) is surfaced', () => {
  // border-left: 4px ... triggers BAN-01 (severity: warn).
  const content = `.card {
  border-left: 4px solid #07f;
  padding: 12px;
}`;
  const res = postCheckVariant({ content });
  assert.ok(res.findings.length >= 1, 'side-stripe finding is surfaced');
  const ban01 = res.findings.find((f) => f.ruleId === 'BAN-01');
  assert.ok(ban01, 'BAN-01 finding present');
  assert.equal(ban01.severity, 'warn');
  assert.equal(res.warnCount >= 1, true, 'warnCount counts the warn finding');
  assert.equal(res.autoReject, false, 'autoReject stays false on warn');
});

// ---------------------------------------------------------------------------
// (c) An ERROR-severity anti-pattern (BAN-06 disabling zoom) is FLAGGED but NOT auto-rejected.

test('47-postcheck: error anti-pattern (BAN-06) is flagged, autoReject still false', () => {
  // user-scalable=no triggers BAN-06 (severity: error) — a WCAG 1.4.4 failure.
  const content =
    '<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">';
  const res = postCheckVariant({ files: [{ path: 'variant.html', content }] });

  const ban06 = res.findings.find((f) => f.ruleId === 'BAN-06');
  assert.ok(ban06, 'BAN-06 error finding present');
  assert.equal(ban06.severity, 'error', 'finding is error severity');
  assert.equal(res.errorCount >= 1, true, 'errorCount counts the error finding');

  // The core Live-Mode contract: error severity is flagged, NEVER auto-rejected.
  assert.equal(res.autoReject, false, 'autoReject is false even on an error-severity finding');
});

test('47-postcheck: summarizeForCard returns a compact string listing the rule id', () => {
  const content =
    '<meta name="viewport" content="width=device-width, user-scalable=no">';
  const res = postCheckVariant({ files: [{ path: 'v.html', content }] });
  const summary = summarizeForCard(res.findings);
  assert.equal(typeof summary, 'string');
  assert.ok(summary.length > 0);
  assert.match(summary, /BAN-06/, 'summary names the triggered rule id');
  assert.match(summary, /error/, 'summary reflects the error count');
});

// ---------------------------------------------------------------------------
// (d) Multiple files in one variant are all scanned; findings carry their file path.

test('47-postcheck: scans multiple variant files and tags findings by file', () => {
  const res = postCheckVariant({
    files: {
      'a.css': '.x { border-left: 5px solid red; }',
      'b.html': '<meta content="user-scalable=no">',
    },
  });
  assert.ok(res.findings.length >= 2, 'findings from both files surfaced');
  const files = new Set(res.findings.map((f) => f.file));
  assert.ok(files.has('a.css'), 'finding tagged with a.css');
  assert.ok(files.has('b.html'), 'finding tagged with b.html');
  assert.equal(res.autoReject, false);
});
