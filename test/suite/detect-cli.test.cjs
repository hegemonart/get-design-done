'use strict';
// Phase 41 — CLI units. Exit codes (0 clean / 2 findings / 1 invocation error), --json, --rule,
// --fast, and the URL-without-puppeteer message — all driven through cli.main with injected io.
// Every test tagged `41-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const cli = require(path.join(REPO_ROOT, 'scripts/lib/detect/cli.cjs'));
const POS = path.join(REPO_ROOT, 'test/fixtures/detect/positive');
const NEG = path.join(REPO_ROOT, 'test/fixtures/detect/negative');

/** Run main with captured stdout/stderr and a requireFn that fails every optional dep. */
function runCli(argv) {
  const out = [];
  const err = [];
  const code = cli.main(argv, {
    cwd: REPO_ROOT,
    log: (s) => out.push(s),
    err: (s) => err.push(s),
    requireFn: (m) => { throw new Error('no ' + m); }, // jsdom + puppeteer absent
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

test('41-03: findings -> exit 2; clean -> exit 0', () => {
  assert.equal(runCli([POS]).code, 2);
  assert.equal(runCli([NEG]).code, 0);
});

test('41-03: --json emits a parseable report with mode + findings', () => {
  const r = runCli([POS, '--json']);
  assert.equal(r.code, 2);
  const doc = JSON.parse(r.out);
  assert.equal(doc.mode, 'regex-fast', 'jsdom absent -> regex-fast');
  assert.ok(Array.isArray(doc.findings) && doc.findings.length > 0);
  assert.ok(doc.filesScanned >= 3);
});

test('41-03: --json suppresses the jsdom-fallback stderr warning', () => {
  assert.equal(runCli([NEG, '--json']).err, '', 'no warning noise in --json mode');
  assert.match(runCli([NEG]).err, /jsdom not installed/, 'human mode warns');
});

test('41-03: --rule BAN-08 narrows; --fast forces regex-fast', () => {
  const r = runCli([POS, '--rule', 'BAN-08', '--json']);
  assert.equal(r.code, 2);
  const doc = JSON.parse(r.out);
  assert.ok(doc.findings.every((f) => f.ruleId === 'BAN-08'));
  assert.equal(runCli([NEG, '--fast', '--json']).err, '', '--fast does not even probe jsdom');
});

test('41-03: a URL without --puppeteer -> exit 1 + a clear install message (no stack)', () => {
  const r = runCli(['https://example.com']);
  assert.equal(r.code, 1);
  assert.match(r.err, /requires --puppeteer/);
  assert.doesNotMatch(r.err, /at Object\.|Error:/, 'no stack trace');
});

test('41-03: --puppeteer with puppeteer absent -> exit 1 install message', () => {
  const r = runCli(['https://example.com', '--puppeteer']);
  assert.equal(r.code, 1);
  assert.match(r.err, /puppeteer is not installed/);
});

test('41-03: invocation errors -> exit 1; --help -> exit 0', () => {
  assert.equal(runCli([]).code, 1, 'no args');
  assert.equal(runCli([POS, '--rule', 'NOPE']).code, 1, 'bad rule id');
  assert.equal(runCli(['--help']).code, 0);
});
