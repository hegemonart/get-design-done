'use strict';

// Phase 33.5-02 — Static security audit + canonical outbound-network allowlist.
//
// Locks the data dependency 33.5-04's scan-outbound-network.cjs gate consumes:
//   1. the human-readable audit report exists (reference/hone-runtime-audit.md, D-05 path),
//   2. the canonical allowlist parses as valid JSON with a non-empty entries array,
//   3. every entry has a non-empty string `glob` AND a non-empty string `justification`,
//   4. every `glob` resolves to >=1 real file on disk (the no-stale-globs guarantee — a stale
//      glob that matches nothing would silently defeat the 33.5-04 gate),
//   5. the COMPLETE known-egress set is covered (figma-extract / issue-reporter /
//      authority-watcher / peer-cli / scripts/e2e / transports/ws).
//
// Hermetic (D-10): fs + glob only, NO network, NO live peer. Runs in the default `npm test`.
// All tests carry the `33.5-02:` tag (mirrors the house idiom in phase-33-baseline.test.cjs).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_REL = 'reference/hone-runtime-audit.md';
const ALLOWLIST_REL = 'scripts/security/outbound-allowlist.json';

// The COMPLETE active-egress set per CONTEXT D-06 (verified by the Wave-A real-tree sweep).
// Each token must appear in the stringified allowlist so no legitimate site is missed.
const KNOWN_EGRESS = [
  'figma-extract',
  'issue-reporter',
  'authority-watcher',
  'peer-cli',
  'scripts/e2e',
  'transports/ws',
];

function abs(rel) {
  return path.join(REPO_ROOT, rel);
}

function loadAllowlist() {
  const raw = fs.readFileSync(abs(ALLOWLIST_REL), 'utf8');
  return JSON.parse(raw);
}

function entriesOf(allowlist) {
  return Array.isArray(allowlist) ? allowlist : allowlist.entries;
}

// Resolve a forward-slash glob against the repo root and return the matching files.
// Prefer node:fs globSync (present on the Node 22/24 CI floor); fall back to a tiny
// prefix+readdir matcher so the test stays hermetic and robust if globSync is absent.
function resolveGlob(glob) {
  if (typeof fs.globSync === 'function') {
    return fs.globSync(glob, { cwd: REPO_ROOT });
  }
  // Fallback: treat the segment before the first wildcard as a directory prefix and
  // walk it; a glob with no wildcard is an exact path check.
  const wildcardAt = glob.search(/[*?[]/);
  if (wildcardAt === -1) {
    return fs.existsSync(abs(glob)) ? [glob] : [];
  }
  const prefix = glob.slice(0, wildcardAt).replace(/\/+$/, '');
  const dir = abs(prefix);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile()) out.push(full);
    }
  }
  return out;
}

// ── 1. report present ───────────────────────────────────────────────────────────

test('33.5-02: audit report exists (reference/hone-runtime-audit.md, D-05 path)', () => {
  assert.ok(fs.existsSync(abs(REPORT_REL)), `${REPORT_REL} must exist (D-05 tracked report)`);
  const body = fs.readFileSync(abs(REPORT_REL), 'utf8');
  assert.match(body, /outbound/i, 'report must enumerate outbound-network call sites');
});

// ── 2. allowlist valid JSON with entries ─────────────────────────────────────────

test('33.5-02: allowlist is valid JSON with a non-empty entries array', () => {
  let allowlist;
  assert.doesNotThrow(() => {
    allowlist = loadAllowlist();
  }, `${ALLOWLIST_REL} must be valid JSON (JSON.parse) — the 33.5-04 gate loads it`);
  const entries = entriesOf(allowlist);
  assert.ok(Array.isArray(entries), 'allowlist must expose an array (top-level or .entries)');
  assert.ok(entries.length > 0, 'allowlist entries array must be non-empty');
});

// ── 3. entries well-formed ───────────────────────────────────────────────────────

test('33.5-02: each entry has a non-empty glob + justification', () => {
  const entries = entriesOf(loadAllowlist());
  for (const e of entries) {
    assert.equal(typeof e.glob, 'string', `entry.glob must be a string: ${JSON.stringify(e)}`);
    assert.ok(e.glob.trim().length > 0, `entry.glob must be non-empty: ${JSON.stringify(e)}`);
    assert.equal(
      typeof e.justification,
      'string',
      `entry.justification must be a string: ${JSON.stringify(e)}`,
    );
    assert.ok(
      e.justification.trim().length > 0,
      `entry.justification must be non-empty: ${JSON.stringify(e)}`,
    );
    // Forward-slash, repo-relative paths (cross-platform); reject backslash + absolute.
    assert.doesNotMatch(e.glob, /\\/, `entry.glob must use forward slashes: ${e.glob}`);
    assert.doesNotMatch(e.glob, /^([A-Za-z]:|\/)/, `entry.glob must be repo-relative: ${e.glob}`);
  }
});

// ── 4. every glob resolves to >=1 real file (the no-stale-globs guarantee) ────────

test('33.5-02: every glob resolves to >=1 real file (no stale globs)', () => {
  const entries = entriesOf(loadAllowlist());
  for (const e of entries) {
    const matches = resolveGlob(e.glob);
    assert.ok(
      Array.isArray(matches) && matches.length > 0,
      `allowlist glob "${e.glob}" resolved to 0 files — a stale glob would defeat the 33.5-04 gate`,
    );
  }
});

// ── 5. known egress set is covered ───────────────────────────────────────────────

test('33.5-02: known egress set is covered (figma-extract / issue-reporter / authority-watcher / peer-cli / scripts/e2e / transports/ws)', () => {
  const blob = JSON.stringify(loadAllowlist());
  for (const token of KNOWN_EGRESS) {
    assert.ok(blob.includes(token), `allowlist must cover the known-egress site: ${token}`);
  }
});
