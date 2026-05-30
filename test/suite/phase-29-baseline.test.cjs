'use strict';
/**
 * tests/phase-29-baseline.test.cjs — Phase 29-07 regression baseline.
 *
 * Locks the post-ship state of Phase 29 (Capability-Gap Telemetry +
 * Self-Authoring of Agents/Skills):
 *   - 6-manifest lockstep (package.json + .claude-plugin/plugin.json +
 *     .claude-plugin/marketplace.json metadata.version + plugins[0].version +
 *     .cursor-plugin/plugin.json + .codex-plugin/plugin.json) per D-10
 *     6-manifest lockstep extending Phase 28.8's 4-manifest lockstep
 *     with the 2 Tier-2 manifests bumped in lockstep.
 *   - CHANGELOG `## [<current-version>] - 2026-05-19` block at top.
 *   - phase-29/manifests-version.txt matches package.json#version.
 *   - phase-28.8 / phase-28.7 / phase-28.6 manifests-version.txt
 *     forward-propagated to current version.
 *   - capability_gap event schema (Plan 29-01) is present in
 *     reference/schemas/events.schema.json with all 7 D-02 fields.
 *   - scripts/lib/incubator-author.cjs (Plan 29-04) exists, loads,
 *     and exports an object with at least one function-typed property.
 *   - skills/apply-reflections/SKILL.md (Plan 29-05) mentions the
 *     Incubator proposal class and all 4 actions (accept/reject/defer/edit).
 *   - scripts/lib/bandit-router.cjs (Plan 29-06) accepts a `prior_class`
 *     parameter referencing `promoted_incubator` and `Beta(2, 8)` /
 *     `2, 8` parameters (the conservative-prior parameter values).
 *   - reference/capability-gap-stage-gate.md (Plan 29-03) exists and
 *     contains the K/M/stddev/Beta/0.05 formula fragments.
 *
 * Version-agnostic per D-08 lesson (Phases 25/26/27/27.5/27.6/27.7/28/
 * 28.5/28.6/28.7/28.8). Reads `package.json#version` dynamically; the
 * baseline files are pinned to the v1.29.0 snapshot at Phase 29 close
 * but the test does not encode the literal v1.29.0.
 *
 * Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28
 * lesson 5) on every user/version-derived dynamic regex.
 *
 * Tagged '29-07:' per closeout discipline.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const CLAUDE_PLUGIN_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const CURSOR_PLUGIN_PATH = path.join(REPO_ROOT, '.cursor-plugin', 'plugin.json');
const CODEX_PLUGIN_PATH = path.join(REPO_ROOT, '.codex-plugin', 'plugin.json');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');
const BASELINE_DIR_29 = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-29');
const BASELINE_DIR_288 = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-28.8');
const BASELINE_DIR_287 = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-28.7');
const BASELINE_DIR_286 = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-28.6');
const EVENT_SCHEMA_PATH = path.join(REPO_ROOT, 'reference', 'schemas', 'events.schema.json');
const INCUBATOR_AUTHOR_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'incubator-author.cjs');
const APPLY_REFLECTIONS_PATH = path.join(REPO_ROOT, 'skills', 'apply-reflections', 'SKILL.md');
const BANDIT_ROUTER_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'bandit-router.cjs');
const STAGE_GATE_PATH = path.join(REPO_ROOT, 'reference', 'capability-gap-stage-gate.md');

const VERSION = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).version;

// Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28 lesson 5).
// Full character-class escape covers all RegExp metacharacters.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readText = (p) => fs.readFileSync(p, 'utf8');

// ---------------------------------------------------------------------------
// 6-manifest lockstep (Tests 1-6) — version-agnostic via VERSION constant.

test('29-07 baseline: package.json version matches VERSION', () => {
  const pkg = readJson(PKG_PATH);
  assert.equal(pkg.version, VERSION,
    `package.json version ${pkg.version} != VERSION ${VERSION}`);
});

test('29-07 baseline: .claude-plugin/plugin.json version matches VERSION', () => {
  const plg = readJson(CLAUDE_PLUGIN_PATH);
  assert.equal(plg.version, VERSION,
    `.claude-plugin/plugin.json version ${plg.version} != VERSION ${VERSION}`);
});

test('29-07 baseline: .claude-plugin/marketplace.json metadata.version matches VERSION', () => {
  const mp = readJson(MARKETPLACE_PATH);
  assert.equal(mp.metadata && mp.metadata.version, VERSION,
    `marketplace.json metadata.version != VERSION ${VERSION}`);
});

test('29-07 baseline: .claude-plugin/marketplace.json plugins[0].version matches VERSION', () => {
  const mp = readJson(MARKETPLACE_PATH);
  assert.ok(Array.isArray(mp.plugins) && mp.plugins.length >= 1,
    'marketplace.json plugins[] missing or empty');
  assert.equal(mp.plugins[0].version, VERSION,
    `marketplace.json plugins[0].version != VERSION ${VERSION}`);
});

test('29-07 baseline: .cursor-plugin/plugin.json version matches VERSION (D-10 Tier-2 lockstep)', () => {
  const cur = readJson(CURSOR_PLUGIN_PATH);
  assert.equal(cur.version, VERSION,
    `.cursor-plugin/plugin.json version ${cur.version} != VERSION ${VERSION}`);
});

test('29-07 baseline: .codex-plugin/plugin.json version matches VERSION (D-10 Tier-2 lockstep)', () => {
  const cod = readJson(CODEX_PLUGIN_PATH);
  assert.equal(cod.version, VERSION,
    `.codex-plugin/plugin.json version ${cod.version} != VERSION ${VERSION}`);
});

// ---------------------------------------------------------------------------
// CHANGELOG top entry (Test 7).

test('29-07 baseline: CHANGELOG.md has ## [1.29.0] - 2026-05-19 historical entry', () => {
  // Phase 30 lesson: this baseline pins to the v1.29.0 historical entry
  // (literal version + date), NOT to the current top entry. After v1.30.0
  // ship, the top of CHANGELOG is `## [1.30.0] - 2026-05-20` and the
  // v1.29.0 entry is the second-from-top block. The Phase 29 baseline's
  // job is to lock down that v1.29.0 historical entry shape, not to track
  // the current release date (which is the Phase 30+ baseline's job).
  const chg = readText(CHANGELOG_PATH);
  // Full RegExp escape per CodeQL js/incomplete-sanitization.
  const pattern = /##\s+\[1\.29\.0\]\s+-\s+2026-05-19/;
  assert.match(chg, pattern,
    'CHANGELOG.md missing ## [1.29.0] - 2026-05-19 historical entry');
});

// ---------------------------------------------------------------------------
// Phase 29 + forward-prop baselines (Tests 8-11).

test('29-07 baseline: phase-29/manifests-version.txt matches VERSION', () => {
  const got = readText(path.join(BASELINE_DIR_29, 'manifests-version.txt')).trim();
  assert.equal(got, VERSION,
    `phase-29/manifests-version.txt = "${got}" != VERSION "${VERSION}"`);
});

test('29-07 baseline: phase-28.8/manifests-version.txt forward-propped to VERSION', () => {
  const got = readText(path.join(BASELINE_DIR_288, 'manifests-version.txt')).trim();
  assert.equal(got, VERSION,
    `phase-28.8/manifests-version.txt = "${got}" != VERSION "${VERSION}"`);
});

test('29-07 baseline: phase-28.7/manifests-version.txt forward-propped to VERSION', () => {
  const got = readText(path.join(BASELINE_DIR_287, 'manifests-version.txt')).trim();
  assert.equal(got, VERSION,
    `phase-28.7/manifests-version.txt = "${got}" != VERSION "${VERSION}"`);
});

test('29-07 baseline: phase-28.6/manifests-version.txt forward-propped to VERSION', () => {
  const got = readText(path.join(BASELINE_DIR_286, 'manifests-version.txt')).trim();
  assert.equal(got, VERSION,
    `phase-28.6/manifests-version.txt = "${got}" != VERSION "${VERSION}"`);
});

// ---------------------------------------------------------------------------
// Phase 29 deliverable smoke tests (Tests 12-16) — text-presence assertions
// per the baseline-discipline rule that deep contract validation lives in
// each plan's own test suite.

test('29-07 baseline: capability_gap event schema present in events.schema.json (29-01)', () => {
  assert.ok(fs.existsSync(EVENT_SCHEMA_PATH),
    `missing ${EVENT_SCHEMA_PATH}`);
  const raw = readText(EVENT_SCHEMA_PATH);
  const schema = JSON.parse(raw);
  // Either capability_gap appears as a key, in a type enum, or inside the
  // serialised schema text — the test stays loose so 29-01 has flexibility
  // in placement (definitions vs properties vs anyOf vs enum).
  const flat = JSON.stringify(schema);
  assert.match(flat, /capability_gap/,
    'capability_gap missing from events.schema.json (Plan 29-01 deliverable)');
  // All 7 D-02 fields must appear as substrings in the JSON-stringified schema.
  const fields = [
    'event_id',
    'parent_event_id',
    'source',
    'context_hash',
    'intent_summary',
    'suggested_kind',
    'evidence_refs',
  ];
  for (const f of fields) {
    assert.ok(flat.includes(f),
      `events.schema.json missing D-02 field reference: ${f}`);
  }
});

test('29-07 baseline: scripts/lib/incubator-author.cjs exists and loads (29-04)', () => {
  assert.ok(fs.existsSync(INCUBATOR_AUTHOR_PATH),
    `missing ${INCUBATOR_AUTHOR_PATH}`);
  const mod = require(INCUBATOR_AUTHOR_PATH);
  assert.equal(typeof mod, 'object',
    'incubator-author.cjs does not export an object');
  const fnNames = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
  assert.ok(fnNames.length >= 1,
    `incubator-author.cjs exports no function-typed properties; keys: ${Object.keys(mod).join(',')}`);
});

test('29-07 baseline: skills/apply-reflections/SKILL.md mentions Incubator class + 4 actions (29-05)', () => {
  assert.ok(fs.existsSync(APPLY_REFLECTIONS_PATH),
    `missing ${APPLY_REFLECTIONS_PATH}`);
  const txt = readText(APPLY_REFLECTIONS_PATH);
  assert.match(txt, /Incubator/,
    'apply-reflections/SKILL.md missing literal string "Incubator" (29-05 deliverable)');
  // 4 actions per D-04 / 29-05.
  for (const action of ['accept', 'reject', 'defer', 'edit']) {
    assert.ok(txt.includes(action),
      `apply-reflections/SKILL.md missing action: ${action}`);
  }
});

test('29-07 baseline: scripts/lib/bandit-router.cjs accepts prior_class param (29-06)', () => {
  assert.ok(fs.existsSync(BANDIT_ROUTER_PATH),
    `missing ${BANDIT_ROUTER_PATH}`);
  const txt = readText(BANDIT_ROUTER_PATH);
  assert.match(txt, /prior_class/,
    'bandit-router.cjs missing literal string "prior_class" (29-06 deliverable)');
  assert.match(txt, /promoted_incubator/,
    'bandit-router.cjs missing literal string "promoted_incubator"');
  // Either "Beta(2, 8)" form or the bare "2, 8" parameters should appear.
  const hasBeta = /Beta\s*\(\s*2\s*,\s*8\s*\)/.test(txt) || /\b2\s*,\s*8\b/.test(txt);
  assert.ok(hasBeta,
    'bandit-router.cjs missing conservative prior parameters (Beta(2, 8) or "2, 8")');
});

test('29-07 baseline: reference/capability-gap-stage-gate.md exists with K/M/stddev formulas (29-03)', () => {
  assert.ok(fs.existsSync(STAGE_GATE_PATH),
    `missing ${STAGE_GATE_PATH}`);
  const txt = readText(STAGE_GATE_PATH);
  // Default thresholds (allow flexible whitespace per D-03 spec doc form).
  const hasK = /K\s*=\s*3/.test(txt);
  const hasM = /M\s*=\s*10/.test(txt);
  assert.ok(hasK, 'stage-gate doc missing K=3 default');
  assert.ok(hasM, 'stage-gate doc missing M=10 default');
  // Stability formula fragments per D-03: stddev(Beta(alpha, beta)) < 0.05.
  assert.match(txt, /stddev/i, 'stage-gate doc missing "stddev" fragment');
  assert.match(txt, /Beta/, 'stage-gate doc missing "Beta" fragment');
  assert.match(txt, /0\.05/, 'stage-gate doc missing 0.05 stability threshold');
});
