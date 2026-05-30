'use strict';

// Phase 31.5 — Repo Structure Consolidation regression baseline.
//
// Locks the union of Wave A–E deliverables as a single release artifact so
// future drift cannot silently regress the v1.31.5 contract. Asserts:
//   - 4-manifest version lockstep (package + .claude-plugin/plugin +
//     .cursor-plugin/plugin + .codex-plugin/plugin), VERSION-AGNOSTIC (reads
//     package.json#version, asserts the other three equal it) — D-08 lesson.
//   - 2 Tier-2 marketplace lockstep (metadata.version + plugins[0].version).
//   - CHANGELOG has a ## [1.31.5] block (and the phase block does NOT carry a
//     ## [1.28.0] heading — the stale ROADMAP version must not have propagated).
//   - phase-31-5/manifests-version.txt baseline matches the live version.
//   - phase-31-5/tarball-manifest.txt golden (31-5-08/9.5) exists + non-empty.
//
// Tagged `31-5-10:`. >= 5 tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test/fixtures/baselines/phase-31-5');

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJsonRel(rel) {
  return JSON.parse(read(rel));
}
function readBaseline(name) {
  return fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');
}

// ── manifest lockstep (version-agnostic) ──────────────────────────────────────

test('31-5-10: 4-manifest version lockstep (package + claude plugin + cursor plugin + codex plugin equal)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  assert.match(pkgVersion, /^\d+\.\d+\.\d+$/, 'package.json version looks like semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkgVersion, `${f} version != package.json version`);
  }
});

test('31-5-10: marketplace.json Tier-2 lockstep (metadata.version + plugins[0].version equal package version)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkgVersion, 'marketplace metadata.version != package version');
  assert.ok(mp.plugins && mp.plugins[0], 'marketplace plugins[0] exists');
  assert.equal(mp.plugins[0].version, pkgVersion, 'marketplace plugins[0].version != package version');
});

// ── CHANGELOG ─────────────────────────────────────────────────────────────────

test('31-5-10: CHANGELOG has a [1.31.5] block and no stale [1.28.0] phase heading', () => {
  const cl = read('CHANGELOG.md');
  assert.match(cl, /## \[1\.31\.5\]/, 'CHANGELOG must carry a ## [1.31.5] entry (D-01)');
  // The Phase 31.5 deliverable shipped at v1.31.5, NOT the stale ROADMAP
  // v1.28.0. Guard that the closeout did not mistakenly author a [1.28.0]
  // heading for THIS phase. (A historical ## [1.28.0] block for Phase 28 is
  // fine — it exists far below; we assert the v1.31.5 block heading is the
  // top-most release heading instead.)
  const firstHeading = cl.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(firstHeading, 'CHANGELOG has at least one release heading');
  assert.equal(firstHeading[1], '1.31.5', 'the top-most release heading is [1.31.5]');
});

// ── phase-31-5 baselines ──────────────────────────────────────────────────────

test('31-5-10: phase-31-5/manifests-version.txt baseline matches the live version', () => {
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  const live = readJsonRel('package.json').version;
  assert.equal(baseline, live, `phase-31-5 manifests-version.txt (${baseline}) != package.json version (${live})`);
});

test('31-5-10: phase-31-5/tarball-manifest.txt golden exists + non-empty (31-5-08/9.5)', () => {
  const p = path.join(BASELINE_DIR, 'tarball-manifest.txt');
  assert.ok(fs.existsSync(p), 'phase-31-5/tarball-manifest.txt golden must exist');
  const body = readBaseline('tarball-manifest.txt');
  const pathCount = body.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  assert.ok(pathCount > 0, 'tarball-manifest golden must be non-empty');
  // Sanity-pin the consolidation outcome: the golden records the corrected
  // allowlist tarball, which adds sdk/ and drops maintainer-only scripts.
  assert.match(body, /(^|\n)sdk\//, 'tarball golden includes the new sdk/ subtree');
});
