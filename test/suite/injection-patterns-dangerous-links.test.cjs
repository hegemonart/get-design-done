'use strict';
/**
 * SEC-CI-03 (Phase 60-2-03) — dangerous-link injection patterns.
 *
 * Validates the four dangerous-markdown-link classes added to
 * scripts/injection-patterns.cjs:
 *   1. javascript: URIs
 *   2. data:text/html (and data: URIs carrying a <script> payload)
 *   3. userinfo-credential URLs (scheme://user:pass@host)
 *   4. secret-bearing query params (?...token= / api_key= / etc.)
 *
 * RED→GREEN: the positive fixtures fail before the patterns exist, pass
 * after. The negative fixtures guard against over-flagging — they filter
 * scan() hits to ONLY the new dangerous-link pattern names so a pre-existing
 * unrelated pattern cannot mask a false-positive regression.
 *
 * The negative set includes both synthetic safe cases AND the real repo-edge
 * lines the plan-checker flagged as highest false-positive risk:
 *   - a `data:image/jpeg;base64,…` line          (reference/image-optimization.md:203)
 *   - a prose line where `<script>` precedes `data:`   (reference/export-formats.md:27)
 *   - a bare `data: <word>` prose line            (agents/design-paper-writer.md:84)
 *
 * scan() is the authoritative check — it is the exact entry point both
 * consumers use (CI gate require()s it; the runtime hook createRequire-loads it).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const { scan, INJECTION_PATTERNS, _CONTEXT_INVISIBLE_CHARS } = require(
  path.join(REPO_ROOT, 'scripts', 'injection-patterns.cjs'),
);

// The pattern names added in Task 2. The negative-fixture test filters scan()
// hits down to ONLY these names so an unrelated pre-existing pattern firing on
// a fixture cannot hide a new-pattern false positive.
const NEW_DANGEROUS_LINK_NAMES = [
  'javascript: uri',
  'data:text/html uri',
  'data: script payload',
  'userinfo credentials url',
  'secret-bearing query param',
];

// ── Positive fixtures — MUST be flagged (scan() returns ≥1 hit) ──────────────
const POSITIVE_FIXTURES = [
  'See [click here](javascript:alert(document.cookie)) for details.',          // javascript: URI
  'Embedded payload: data:text/html;base64,PHNjcmlwdD4...',                    // data:text/html
  "data:text/html,<script>fetch('//evil')</script>",                           // data: + script payload
  'Mirror: https://user:hunter2@internal.example.com/repo',                    // userinfo credentials
  'Fetch https://api.example.com/v1?access_token=sk-ant-AAAAAAAAAAAAAAAAAAAA', // secret query param
  'https://x.example/cb?api_key=AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',     // api_key query param
  'https://x.example/?token=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',          // token query param
];

// ── Negative fixtures — MUST NOT be flagged by any NEW dangerous-link pattern ─
const NEGATIVE_FIXTURES = [
  // Synthetic safe cases.
  'Docs at https://example.com/page?lang=en&sort=desc',          // ordinary query string
  'Contact mailto:hello@example.com',                            // mailto (no //, no user:pass)
  'Repo: https://github.com/org/repo/blob/main/README.md',       // plain https, no creds/secret
  'Search ?q=hello+world&page=2',                                // benign query params
  // Real repo-edge lines the checker flagged (highest FP risk).
  '    src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD..."', // image-optimization.md:203
  "`build-html.cjs` emits no external `src=`/`<link>`/`<script>` - CSS is inline, images are base64 `data:` URIs. Content links (`<a href=\"https://…\">`) are preserved (they're references, not essential resources).", // export-formats.md:27 — <script> precedes data:
  'If DESIGN-CONTEXT.md has no applicable data: print "No operations to perform." STOP.', // design-paper-writer.md:84 — bare "data: <word>"
];

function newLinkHits(content) {
  return scan(content).filter((name) => NEW_DANGEROUS_LINK_NAMES.includes(name));
}

test('dangerous-link: every positive fixture is flagged by scan()', () => {
  for (const fixture of POSITIVE_FIXTURES) {
    const hits = scan(fixture);
    assert.ok(
      hits.length > 0,
      `expected scan() to flag dangerous link, got no hits for: ${fixture}`,
    );
  }
});

test('dangerous-link: each new-pattern class is represented in the positive set', () => {
  // Stronger than "≥1 hit total": assert each class actually fires somewhere,
  // so a single broad pattern can't be credited for all four classes.
  const allHits = new Set();
  for (const fixture of POSITIVE_FIXTURES) {
    for (const name of newLinkHits(fixture)) allHits.add(name);
  }
  for (const name of NEW_DANGEROUS_LINK_NAMES) {
    assert.ok(
      allHits.has(name),
      `expected at least one positive fixture to trip "${name}"; tripped: ${[...allHits].join(', ') || '(none)'}`,
    );
  }
});

test('dangerous-link: no negative fixture trips any NEW dangerous-link pattern', () => {
  for (const fixture of NEGATIVE_FIXTURES) {
    const hits = newLinkHits(fixture);
    assert.equal(
      hits.length,
      0,
      `false positive — new dangerous-link pattern(s) [${hits.join(', ')}] fired on legitimate content: ${fixture}`,
    );
  }
});

test('dangerous-link: module export contract is preserved (scan/INJECTION_PATTERNS/_CONTEXT_INVISIBLE_CHARS)', () => {
  assert.equal(typeof scan, 'function', 'scan must remain exported');
  assert.ok(Array.isArray(INJECTION_PATTERNS), 'INJECTION_PATTERNS must remain an array');
  assert.ok(_CONTEXT_INVISIBLE_CHARS instanceof RegExp, '_CONTEXT_INVISIBLE_CHARS must remain exported');
  // The existing read-injection-scanner test asserts >=15; our additions only grow it.
  assert.ok(
    INJECTION_PATTERNS.length >= 15,
    `expected ≥15 patterns, got ${INJECTION_PATTERNS.length}`,
  );
  // Every entry keeps the {name, re} shape.
  for (const entry of INJECTION_PATTERNS) {
    assert.equal(typeof entry.name, 'string', 'each pattern needs a string name');
    assert.ok(entry.re instanceof RegExp, `pattern "${entry.name}" needs a RegExp re`);
  }
});
