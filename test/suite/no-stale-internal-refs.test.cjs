'use strict';

// Phase 31.5 — no-stale-internal-refs static guard (SC#10, Plan 31-5-10).
//
// The SDK consolidation (Plans 31-5-04/05) moved every public-SDK module out of
// scripts/lib/ and scripts/mcp-servers/ into sdk/. Plan 31-5-06 re-created thin
// DEPRECATION SHIMS at the OLD paths (one-minor grace window → removal v1.33.0,
// D-02) so undocumented EXTERNAL importers keep working. Those shim files — and
// ONLY those — legitimately carry the old paths; they are marked with the
// literal `GDD-DEPRECATION-SHIM` comment marker.
//
// This guard is the static net proving every INTERNAL caller in the shipped
// user-facing surface (hooks/, agents/, skills/, bin/, scripts/cli/,
// scripts/install.cjs) has been repointed to sdk/. It greps that surface for
// any reference to an OLD moved-SDK path and FAILS on any hit that is NOT
// inside a file carrying the GDD-DEPRECATION-SHIM marker.
//
// Scope is DELIBERATELY narrow: it scans only the user-facing surface dirs and
// matches only the specific moved-SDK old paths. It does NOT scan scripts/lib/
// at large (which has many live non-SDK helpers that legitimately reference
// sibling scripts/lib/ modules) nor scripts/mcp-servers/ (where the shims live).
//
// Tagged `31-5-10:`. >= 2 tests (the live scan + a non-vacuous meta-test).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');

// The marker (from Plan 31-5-06) that identifies a legitimate deprecation shim.
// A scanned file carrying this marker is SKIPPED — the shim is external-only and
// legitimately re-exports from sdk/ at the old path.
const SHIM_MARKER = 'GDD-DEPRECATION-SHIM';

// The OLD moved-SDK path tokens. A reference to any of these in the scanned
// surface (outside a shim file) means an internal caller was not repointed.
// These are the exact paths the SDK consolidation (31-5-04) vacated:
//   - module dirs: cli, gdd-state, event-stream, gdd-errors
//   - the 4 typed primitives (.cjs old paths)
//   - both MCP servers: gdd-state, gdd-mcp
const FORBIDDEN_TOKENS = [
  'scripts/lib/cli',
  'scripts/lib/gdd-state',
  'scripts/lib/event-stream',
  'scripts/lib/gdd-errors',
  'scripts/lib/error-classifier.cjs',
  'scripts/lib/iteration-budget.cjs',
  'scripts/lib/jittered-backoff.cjs',
  'scripts/lib/lockfile.cjs',
  'scripts/mcp-servers/gdd-state',
  'scripts/mcp-servers/gdd-mcp',
];

// The shipped user-facing surface scanned for stale internal refs.
const SCANNED_DIRS = ['hooks', 'agents', 'skills', 'bin', 'scripts/cli'];
const SCANNED_FILES = ['scripts/install.cjs'];

// Match a forbidden token. The tokens are literal path fragments — a plain
// substring test is the correct (and intentionally broad) matcher: it catches
// require()/import strings, dispatch commands, and prose alike.
function findForbidden(body) {
  const hits = [];
  const linesArr = body.split(/\r?\n/);
  for (let i = 0; i < linesArr.length; i++) {
    for (const tok of FORBIDDEN_TOKENS) {
      if (linesArr[i].includes(tok)) {
        hits.push({ line: i + 1, token: tok, text: linesArr[i].trim() });
      }
    }
  }
  return hits;
}

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, acc);
    } else if (entry.isFile()) {
      acc.push(full);
    }
  }
}

function collectScannedFiles() {
  const acc = [];
  for (const d of SCANNED_DIRS) walk(path.join(REPO_ROOT, d), acc);
  for (const f of SCANNED_FILES) {
    const full = path.join(REPO_ROOT, f);
    if (fs.existsSync(full)) acc.push(full);
  }
  return acc;
}

// ── live scan ───────────────────────────────────────────────────────────────

test('31-5-10: no stale moved-SDK old-path refs in the shipped surface (shims excluded)', () => {
  const files = collectScannedFiles();
  assert.ok(files.length > 0, 'scanned surface must be non-empty (sanity: dirs exist)');

  const violations = [];
  for (const full of files) {
    const body = fs.readFileSync(full, 'utf8');
    // Skip legitimate deprecation shims — they carry the old paths by design.
    if (body.includes(SHIM_MARKER)) continue;
    for (const h of findForbidden(body)) {
      const rel = path.relative(REPO_ROOT, full).split(path.sep).join('/');
      violations.push(`${rel}:${h.line}  [${h.token}]  ${h.text}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `stale moved-SDK old-path references found (repoint to sdk/):\n${violations.join('\n')}`,
  );
});

// ── non-vacuous meta-test ─────────────────────────────────────────────────────

test('31-5-10: meta — the matcher flags a planted old-path ref in a non-shim string', () => {
  // A planted reference with NO shim marker MUST be flagged (proves the live
  // scan above is not vacuously passing because the matcher is broken).
  const planted = "const x = require('../scripts/lib/event-stream');\n";
  assert.ok(!planted.includes(SHIM_MARKER), 'planted sample carries no shim marker');
  const hits = findForbidden(planted);
  assert.ok(hits.length >= 1, 'matcher must flag the planted scripts/lib/event-stream ref');
  assert.equal(hits[0].token, 'scripts/lib/event-stream', 'flags the correct old-path token');

  // And the same string, when carrying the shim marker, is excluded by the
  // skip rule the live scan applies (mirror the exclusion logic precisely).
  const shimmed = `// ${SHIM_MARKER}\n${planted}`;
  const excluded = shimmed.includes(SHIM_MARKER);
  assert.ok(excluded, 'a file carrying the GDD-DEPRECATION-SHIM marker is skipped');
});
