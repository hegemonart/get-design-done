'use strict';

// Phase 31, Plan 04 — offline validation of figma-plugin/manifest.json.
//
// The single hard security invariant of Path C (decision D-06): the GDD Sync
// plugin may reach localhost:5179 and NOTHING else. networkAccess.allowedDomains
// is its only network surface. These tests pin that boundary so any future edit
// that widens it (a wildcard, an external host) trips CI. All tests are offline —
// they read manifest.json from disk as JSON; no Figma, no network.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'figma-plugin', 'manifest.json');

function readRaw(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

// The exact localhost pair the manifest must declare — and nothing else (D-06).
const EXPECTED_ALLOWED_DOMAINS = ['http://localhost:5179', 'http://127.0.0.1:5179'];
const LOCALHOST_5179 = /^https?:\/\/(localhost|127\.0\.0\.1):5179$/;

test('31-04: manifest.json parses as valid JSON', () => {
  const raw = readRaw('figma-plugin/manifest.json');
  assert.doesNotThrow(() => JSON.parse(raw), 'figma-plugin/manifest.json must be valid JSON');
});

test('31-04: networkAccess.allowedDomains is a non-empty array', () => {
  const m = JSON.parse(readRaw('figma-plugin/manifest.json'));
  assert.ok(m.networkAccess, 'manifest must declare a networkAccess block');
  assert.ok(
    Array.isArray(m.networkAccess.allowedDomains),
    'networkAccess.allowedDomains must be an array',
  );
  assert.ok(
    m.networkAccess.allowedDomains.length > 0,
    'networkAccess.allowedDomains must be non-empty',
  );
});

test('31-04: every allowedDomains entry matches localhost:5179 or 127.0.0.1:5179', () => {
  const m = JSON.parse(readRaw('figma-plugin/manifest.json'));
  for (const domain of m.networkAccess.allowedDomains) {
    assert.match(
      domain,
      LOCALHOST_5179,
      `allowedDomains entry "${domain}" must be localhost/127.0.0.1 on port 5179 (D-06)`,
    );
  }
});

test("31-04: no wildcard '*' and no external host in allowedDomains", () => {
  const m = JSON.parse(readRaw('figma-plugin/manifest.json'));
  const domains = m.networkAccess.allowedDomains;
  assert.ok(!domains.includes('*'), "allowedDomains must NOT contain the wildcard '*' (D-06)");
  for (const domain of domains) {
    assert.ok(
      !/api\.figma\.com/.test(domain),
      `allowedDomains must NOT reach the Figma REST API ("${domain}")`,
    );
    // No public/external host: anything that is not localhost/127.0.0.1:5179 is forbidden.
    assert.ok(
      LOCALHOST_5179.test(domain),
      `allowedDomains must NOT contain an external host ("${domain}") — localhost only (D-06)`,
    );
  }
});

test('31-04: required manifest fields present (name, id, api, main, ui, editorType)', () => {
  const m = JSON.parse(readRaw('figma-plugin/manifest.json'));
  for (const field of ['name', 'id', 'api', 'main', 'ui', 'editorType']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(m, field),
      `manifest must declare required field "${field}"`,
    );
  }
  assert.equal(typeof m.name, 'string');
  assert.ok(m.name.length > 0, 'manifest.name must be non-empty');
  assert.equal(typeof m.id, 'string');
  assert.ok(m.id.length > 0, 'manifest.id must be non-empty');
  assert.equal(typeof m.api, 'string');
  assert.ok(m.api.length > 0, 'manifest.api must be a pinned non-empty version string');
});

test('31-04: main points at code.js and ui points at ui.html', () => {
  const m = JSON.parse(readRaw('figma-plugin/manifest.json'));
  assert.equal(m.main, 'code.js', 'manifest.main must be code.js (the tsc output of code.ts)');
  assert.equal(m.ui, 'ui.html', 'manifest.ui must be ui.html');
});

test("31-04: editorType includes 'figma'", () => {
  const m = JSON.parse(readRaw('figma-plugin/manifest.json'));
  assert.ok(Array.isArray(m.editorType), 'manifest.editorType must be an array');
  assert.ok(m.editorType.includes('figma'), "manifest.editorType must include 'figma'");
});

test('31-04: allowedDomains snapshot equals the exact localhost pair', () => {
  const m = JSON.parse(readRaw('figma-plugin/manifest.json'));
  // deepEqual pins the D-06 invariant: a later edit that adds/changes a domain
  // (even another localhost variant) fails this snapshot and forces review.
  assert.deepEqual(
    m.networkAccess.allowedDomains,
    EXPECTED_ALLOWED_DOMAINS,
    'allowedDomains must be EXACTLY the localhost:5179 pair — no additions (D-06)',
  );
});

test('31-04: referenced sandbox + UI source files exist on disk', () => {
  // The manifest names code.js (build output) + ui.html. code.js is gitignored
  // (built via `npm run build`), so assert the TS source code.ts exists instead,
  // alongside ui.html. This keeps the manifest's main/ui pointers honest.
  assert.ok(
    fs.existsSync(path.join(REPO_ROOT, 'figma-plugin', 'code.ts')),
    'figma-plugin/code.ts (source for manifest.main=code.js) must exist',
  );
  assert.ok(
    fs.existsSync(path.join(REPO_ROOT, 'figma-plugin', 'ui.html')),
    'figma-plugin/ui.html (manifest.ui) must exist',
  );
});

// Reference MANIFEST_PATH so the resolved absolute path is part of the suite's
// surface (and a typo in the path constant fails fast rather than silently).
test('31-04: manifest resolves at figma-plugin/manifest.json', () => {
  assert.ok(fs.existsSync(MANIFEST_PATH), `expected manifest at ${MANIFEST_PATH}`);
});
