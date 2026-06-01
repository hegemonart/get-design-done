'use strict';
// Phase 38 — PII guard (D-05). Static-analysis assertion that EVERY user-research payload routes
// through scripts/lib/pseudonymize.cjs BEFORE any agent context: the user-research-synthesizer
// must pseudonymize first, and each user-research connection (UserTesting/Maze/Hotjar) must
// mandate it. Mirrors the 33.5 outbound-allowlist gate discipline. Every test tagged `38-04:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('38-04: pseudonymize.cjs exists (the PII transform)', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts/lib/pseudonymize.cjs')), 'pseudonymize.cjs present');
});

test('38-04: user-research-synthesizer pseudonymizes BEFORE any agent context', () => {
  const a = read('agents/user-research-synthesizer.md');
  assert.match(a, /pseudonymize\.cjs/, 'references pseudonymize.cjs');
  // ordering: read → pseudonymize → reason (the transform precedes reasoning/context)
  assert.match(a, /before .* (agent )?context|pseudonymize.* first|read .*→.* pseudonymize/i, 'pseudonymize-before-context ordering stated');
  assert.match(a, /never .* raw|no path where a raw/i, 'no raw payload reaches the model');
});

test('38-04: every user-research connection mandates pseudonymize-first', () => {
  for (const c of ['usertesting', 'maze', 'hotjar']) {
    const body = read(`connections/${c}.md`);
    assert.match(body, /pseudonymize/i, `${c}.md mandates pseudonymize`);
    assert.match(body, /PII|privacy/i, `${c}.md has a PII/privacy section`);
  }
});

test('38-04: user-research connections read indexed insights, not raw recordings', () => {
  // hotjar especially — no raw session-replay video storage (D-04)
  assert.match(read('connections/hotjar.md'), /indexed|aggregat|no raw|not raw/i, 'hotjar: indexed insights, not raw video');
});
