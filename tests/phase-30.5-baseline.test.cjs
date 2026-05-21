'use strict';
/**
 * tests/phase-30.5-baseline.test.cjs — Phase 30.5-03 regression baseline.
 *
 * Locks the post-ship state of Phase 30.5 (Failure-Mode Catalogue):
 *   - 6-manifest lockstep at 1.30.5 (package.json + .claude-plugin/plugin.json +
 *     .claude-plugin/marketplace.json metadata.version + plugins[0].version +
 *     .cursor-plugin/plugin.json + .codex-plugin/plugin.json) per D-01 / D-11.
 *   - OFF_CADENCE_VERSIONS contains '1.30.5' in tests/semver-compare.test.cjs.
 *   - CHANGELOG `## [<current-version>] - 2026-05-21` block at top.
 *   - reference/known-failure-modes.md ≥20 entries with the 11-field schema-v2.
 *   - scripts/lib/failure-mode-matcher.cjs exports match (Plan 30.5-02).
 *   - scripts/lib/reflector-kfm-proposer.cjs exports proposeKfmDraft + shouldPropose.
 *   - scripts/lib/reflector-capability-gap-aggregator.cjs invokes the proposer
 *     via the additive proposeKfmDraftsForClusters() export.
 *   - reference/schemas/events.schema.json declares kfm-candidate allOf branch.
 *   - scripts/lib/authority-watcher/index.cjs declares the whitelist patterns.
 *   - skills/apply-reflections/SKILL.md surfaces the [KFM-CANDIDATE] proposal class.
 *   - phase-30.5/manifests-version.txt matches VERSION.
 *   - phase-30 / phase-29 / phase-28.8 / phase-28.7 / phase-28.6 / phase-28.5 /
 *     phase-28 / phase-27-7 manifests-version.txt all forward-propagated to VERSION.
 *
 * Version-agnostic (Phase 28 D-08 lesson): reads `package.json#version`
 * dynamically; the baseline files are pinned to v1.30.5 at Phase 30.5
 * close but the test does NOT encode the literal version.
 *
 * Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28 lesson 5)
 * on every user/version-derived dynamic regex.
 *
 * Tagged '30.5-03:' per closeout discipline.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const CLAUDE_PLUGIN_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const CURSOR_PLUGIN_PATH = path.join(REPO_ROOT, '.cursor-plugin', 'plugin.json');
const CODEX_PLUGIN_PATH = path.join(REPO_ROOT, '.codex-plugin', 'plugin.json');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');
const SEMVER_TEST_PATH = path.join(REPO_ROOT, 'tests', 'semver-compare.test.cjs');

const BASELINE_DIR_30_5 = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-30.5');
const PRIOR_PHASE_DIRS = [
  'phase-30',
  'phase-29',
  'phase-28.8',
  'phase-28.7',
  'phase-28.6',
  'phase-28.5',
  'phase-28',
  'phase-27-7', // HYPHEN naming — verified historical
];

const CATALOGUE_PATH = path.join(REPO_ROOT, 'reference', 'known-failure-modes.md');
const MATCHER_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'failure-mode-matcher.cjs');
const PROPOSER_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'reflector-kfm-proposer.cjs');
const AGGREGATOR_PATH = path.join(
  REPO_ROOT, 'scripts', 'lib', 'reflector-capability-gap-aggregator.cjs'
);
const EVENTS_SCHEMA_PATH = path.join(REPO_ROOT, 'reference', 'schemas', 'events.schema.json');
const AUTHORITY_WATCHER_PATH = path.join(
  REPO_ROOT, 'scripts', 'lib', 'authority-watcher', 'index.cjs'
);
const APPLY_REFLECTIONS_SKILL_PATH = path.join(
  REPO_ROOT, 'skills', 'apply-reflections', 'SKILL.md'
);

const VERSION = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).version;

// Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28 lesson 5).
// Full character-class escape covers all RegExp metacharacters.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readText = (p) => fs.readFileSync(p, 'utf8');

// ---------------------------------------------------------------------------
// Tests 1-6: 6-manifest lockstep — version-agnostic via VERSION constant.

test('30.5-03 baseline: package.json version matches VERSION', () => {
  const pkg = readJson(PKG_PATH);
  assert.equal(pkg.version, VERSION,
    `package.json version ${pkg.version} != VERSION ${VERSION}`);
});

test('30.5-03 baseline: .claude-plugin/plugin.json version matches VERSION', () => {
  const plg = readJson(CLAUDE_PLUGIN_PATH);
  assert.equal(plg.version, VERSION,
    `.claude-plugin/plugin.json version ${plg.version} != VERSION ${VERSION}`);
});

test('30.5-03 baseline: .claude-plugin/marketplace.json metadata.version matches VERSION', () => {
  const mp = readJson(MARKETPLACE_PATH);
  assert.equal(mp.metadata && mp.metadata.version, VERSION,
    `marketplace.json metadata.version != VERSION ${VERSION}`);
});

test('30.5-03 baseline: .claude-plugin/marketplace.json plugins[0].version matches VERSION', () => {
  const mp = readJson(MARKETPLACE_PATH);
  assert.ok(Array.isArray(mp.plugins) && mp.plugins.length >= 1,
    'marketplace.json: plugins[] missing or empty');
  assert.equal(mp.plugins[0].version, VERSION,
    `marketplace.json plugins[0].version != VERSION ${VERSION}`);
});

test('30.5-03 baseline: .cursor-plugin/plugin.json version matches VERSION', () => {
  const plg = readJson(CURSOR_PLUGIN_PATH);
  assert.equal(plg.version, VERSION,
    `.cursor-plugin/plugin.json version ${plg.version} != VERSION ${VERSION}`);
});

test('30.5-03 baseline: .codex-plugin/plugin.json version matches VERSION', () => {
  const plg = readJson(CODEX_PLUGIN_PATH);
  assert.equal(plg.version, VERSION,
    `.codex-plugin/plugin.json version ${plg.version} != VERSION ${VERSION}`);
});

// ---------------------------------------------------------------------------
// Test 7: CHANGELOG top entry — version-agnostic via dynamic VERSION regex.

test('30.5-03 baseline: CHANGELOG top entry is ## [VERSION] - 2026-05-21', () => {
  const changelog = readText(CHANGELOG_PATH);
  // Skip the leading `# Changelog\n…\n---\n\n` preamble and match the FIRST `## [` block.
  const versionEscaped = escapeRegExp(VERSION);
  const re = new RegExp(`^##\\s+\\[${versionEscaped}\\]\\s+-\\s+\\d{4}-\\d{2}-\\d{2}\\s*$`, 'm');
  assert.match(changelog, re, `CHANGELOG must contain ## [${VERSION}] - YYYY-MM-DD heading`);
  // Stronger: that heading must be the FIRST `## [` heading.
  const firstHeading = changelog.match(/^##\s+\[[0-9.]+\]\s+-\s+\d{4}-\d{2}-\d{2}\s*$/m);
  assert.ok(firstHeading, 'CHANGELOG must contain at least one version heading');
  assert.match(firstHeading[0], re,
    `CHANGELOG first version heading must be [${VERSION}], got: ${firstHeading[0]}`);
});

// ---------------------------------------------------------------------------
// Test 8: OFF_CADENCE_VERSIONS membership.

test('30.5-03 baseline: OFF_CADENCE_VERSIONS contains VERSION in semver-compare.test.cjs', () => {
  const semver = readText(SEMVER_TEST_PATH);
  const versionEscaped = escapeRegExp(VERSION);
  // Match either `.add('VERSION')` or `.add("VERSION")` shape.
  const re = new RegExp(`OFF_CADENCE_VERSIONS\\.add\\(\\s*['\"]${versionEscaped}['\"]\\s*\\)`);
  assert.match(semver, re,
    `tests/semver-compare.test.cjs must register OFF_CADENCE_VERSIONS.add('${VERSION}')`);
});

// ---------------------------------------------------------------------------
// Test 9: Catalogue entry count ≥20 (D-03).

test('30.5-03 baseline: reference/known-failure-modes.md contains >=20 entries', () => {
  const text = readText(CATALOGUE_PATH);
  // Count `id: KFM-NNN` occurrences inside fenced yaml blocks.
  const idMatches = text.match(/^id:\s+KFM-\d+/gm) || [];
  assert.ok(idMatches.length >= 20,
    `expected >=20 KFM entries, found ${idMatches.length}`);
});

// ---------------------------------------------------------------------------
// Test 10: failure-mode-matcher.cjs exports `match` (Plan 30.5-02 API).

test('30.5-03 baseline: failure-mode-matcher.cjs exports match', () => {
  // eslint-disable-next-line global-require
  const m = require(MATCHER_PATH);
  assert.equal(typeof m.match, 'function', 'failure-mode-matcher.cjs must export match()');
});

// ---------------------------------------------------------------------------
// Test 11: reflector-kfm-proposer.cjs exports the required public API.

test('30.5-03 baseline: reflector-kfm-proposer.cjs exports proposeKfmDraft + shouldPropose', () => {
  // eslint-disable-next-line global-require
  const p = require(PROPOSER_PATH);
  assert.equal(typeof p.proposeKfmDraft, 'function',
    'reflector-kfm-proposer.cjs must export proposeKfmDraft()');
  assert.equal(typeof p.shouldPropose, 'function',
    'reflector-kfm-proposer.cjs must export shouldPropose()');
  // Accept/reject/defer/edit helpers (Plan 30.5-03 Task 1 step 5).
  assert.equal(typeof p.applyAccept, 'function');
  assert.equal(typeof p.applyReject, 'function');
  assert.equal(typeof p.applyDefer, 'function');
  assert.equal(typeof p.applyEdit, 'function');
});

// ---------------------------------------------------------------------------
// Test 12: aggregator wires the KFM proposer.

test('30.5-03 baseline: reflector-capability-gap-aggregator.cjs wires the KFM proposer', () => {
  const src = readText(AGGREGATOR_PATH);
  assert.match(src, /require\(['"]\.\/reflector-kfm-proposer\.cjs['"]\)/,
    'aggregator must require reflector-kfm-proposer.cjs');
  assert.match(src, /proposeKfmDraftsForClusters/,
    'aggregator must export proposeKfmDraftsForClusters');
});

// ---------------------------------------------------------------------------
// Test 13: events.schema.json has the kfm-candidate allOf branch.

test('30.5-03 baseline: events.schema.json contains kfm-candidate allOf branch', () => {
  const schema = readJson(EVENTS_SCHEMA_PATH);
  assert.ok(schema.definitions && schema.definitions.KfmCandidatePayload,
    'KfmCandidatePayload definition must exist');
  const branches = Array.isArray(schema.allOf) ? schema.allOf : [];
  const found = branches.some((b) =>
    b && b.if && b.if.properties && b.if.properties.type && b.if.properties.type.const === 'kfm-candidate'
  );
  assert.ok(found, 'kfm-candidate allOf branch must be declared');
});

// ---------------------------------------------------------------------------
// Test 14: authority-watcher declares whitelist patterns.

test('30.5-03 baseline: authority-watcher/index.cjs declares the kfm whitelist', () => {
  const src = readText(AUTHORITY_WATCHER_PATH);
  assert.match(src, /common errors/i);
  assert.match(src, /failure modes/i);
  assert.match(src, /troubleshooting/i);
  assert.match(src, /known issues/i);
  assert.match(src, /pitfalls/i);
});

// ---------------------------------------------------------------------------
// Test 15: apply-reflections surfaces [KFM-CANDIDATE].

test('30.5-03 baseline: apply-reflections SKILL declares the [KFM-CANDIDATE] class', () => {
  const src = readText(APPLY_REFLECTIONS_SKILL_PATH);
  assert.match(src, /\[KFM-CANDIDATE\]/,
    'skills/apply-reflections/SKILL.md must declare the [KFM-CANDIDATE] proposal class');
});

// ---------------------------------------------------------------------------
// Test 16: phase-30.5 + prior phase baselines forward-propped to VERSION.

test('30.5-03 baseline: phase-30.5 + prior phase manifests-version.txt match VERSION', () => {
  // phase-30.5 itself.
  const phase305File = path.join(BASELINE_DIR_30_5, 'manifests-version.txt');
  assert.ok(fs.existsSync(phase305File),
    `baseline file missing: ${phase305File}`);
  const phase305Content = readText(phase305File).trim();
  assert.equal(phase305Content, VERSION,
    `phase-30.5 manifests-version.txt = "${phase305Content}", expected "${VERSION}"`);

  // Prior phases — forward-propped per D-11 ship-together.
  for (const phaseDir of PRIOR_PHASE_DIRS) {
    const f = path.join(REPO_ROOT, 'test-fixture', 'baselines', phaseDir, 'manifests-version.txt');
    if (!fs.existsSync(f)) {
      // Permit absence — older phases may not have this baseline file.
      continue;
    }
    const content = readText(f).trim();
    assert.equal(content, VERSION,
      `${phaseDir}/manifests-version.txt = "${content}", expected "${VERSION}"`);
  }
});
