'use strict';
// Phase 41 — SC#10 network-isolation gate. gdd-detect is OFFLINE BY DEFAULT: its executable surface
// (bin/gdd-detect + scripts/lib/detect/**/*.cjs) must contain NO network primitives. The optional
// jsdom/puppeteer paths are soft try-require by NAME only (a string literal "puppeteer" is fine; an
// actual fetch/https/axios is not). Mirrors test/suite/issue-reporter-network-isolation.test.cjs.
//
// Scope = executable CODE (.cjs + the extensionless bin trampoline). JSON data files (e.g. the rule
// schema, whose `$id` is a standard non-dereferenced URI) are not code and are out of scope — the
// guarantee is "the CLI makes no network calls", not "no string ever contains a URL". Tag `41-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const FORBIDDEN = ['https://', 'http://', 'fetch(', 'node:https', "require('https')", 'require("https")', 'axios', 'node-fetch', 'XMLHttpRequest'];
const CODE_EXT = new Set(['.cjs', '.mjs', '.js']);

function walkCode(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const st = fs.statSync(root);
  if (st.isFile()) { out.push(root); return out; }
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...walkCode(full));
    else if (e.isFile() && CODE_EXT.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

test('41-03: gdd-detect executable surface contains no network primitives (offline by default)', () => {
  const roots = [
    path.join(REPO_ROOT, 'bin', 'gdd-detect'),       // the extensionless trampoline (scanned directly)
    path.join(REPO_ROOT, 'scripts', 'lib', 'detect'), // the engine + rules + cli (.cjs)
  ];
  const files = roots.flatMap(walkCode);
  assert.ok(files.length >= 14, `expected the detect tree (got ${files.length} files)`);
  const violations = [];
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    for (const tok of FORBIDDEN) {
      if (content.includes(tok)) {
        const rel = path.relative(REPO_ROOT, f).split(path.sep).join('/');
        violations.push(`${rel}: "${tok}"`);
      }
    }
  }
  assert.deepEqual(violations, [], `network primitives in the gdd-detect CLI surface:\n  ${violations.join('\n  ')}`);
});

test('41-03: the only optional-dependency references are name-only try-require (jsdom/puppeteer)', () => {
  const cli = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'lib', 'detect', 'cli.cjs'), 'utf8');
  // The optionals are referenced by bare name inside try{}; never imported at top level.
  assert.match(cli, /try \{ requireFn\('jsdom'\)/, 'jsdom is a guarded try-require');
  assert.match(cli, /requireFn\('puppeteer'\)/, 'puppeteer is a guarded try-require');
  assert.doesNotMatch(cli, /^const .*require\(['"](jsdom|puppeteer)['"]\)/m, 'no top-level import of an optional dep');
});
