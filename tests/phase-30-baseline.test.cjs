'use strict';
/**
 * tests/phase-30-baseline.test.cjs — Phase 30-08 regression baseline.
 *
 * Locks the post-ship state of Phase 30 (Consent-First GitHub Issue Reporter):
 *   - 6-manifest lockstep (package.json + .claude-plugin/plugin.json +
 *     .claude-plugin/marketplace.json metadata.version + plugins[0].version +
 *     .cursor-plugin/plugin.json + .codex-plugin/plugin.json) per D-12.
 *   - OFF_CADENCE_VERSIONS.add(VERSION) in tests/semver-compare.test.cjs
 *     (Phase 29 precedent — existing contract requires register for any
 *     post-1.0.x release, even on-cadence minor).
 *   - CHANGELOG `## [<current-version>] - 2026-05-20` block at top.
 *   - phase-30/manifests-version.txt matches VERSION.
 *   - phase-29 / phase-28.8 / phase-28.7 / phase-28.6 / phase-28.5 / phase-28 /
 *     phase-27-7 manifests-version.txt all forward-propagated to VERSION.
 *   - scripts/lib/pseudonymize.cjs (Plan 30-01) exports the 9 expected
 *     pseudonymization helpers as functions + RULES manifest.
 *   - scripts/lib/issue-reporter/payload-assembly.cjs (Plan 30-02) exports
 *     assemble + computeFingerprint as functions.
 *   - Hardcoded destination URL constant immutable — appears EXACTLY ONCE
 *     under scripts/lib/issue-reporter/ in destination.cjs (the sole
 *     authorized carrier per D-02/D-03).
 *   - reference/pseudonymization-rules.md + reference/known-failure-modes.md
 *     exist + registered in reference/registry.json (Plan 30-01 / 30-03 / 30-07).
 *   - skills/report-issue/SKILL.md exists, ≤100 lines (Phase 28.5 compliance),
 *     frontmatter contains required `name` + `description` keys.
 *   - Static-analysis network isolation: ONLY destination.cjs may contain
 *     the destination URL literal under scripts/lib/issue-reporter/; no
 *     other file under that tree (or scripts/lib/pseudonymize.cjs) may
 *     contain `https://` / `fetch(` / `XMLHttpRequest`.
 *
 * Version-agnostic per D-08 lesson (Phases 25/26/27/27.5/27.6/27.7/28/
 * 28.5/28.6/28.7/28.8/29). Reads `package.json#version` dynamically; the
 * baseline files are pinned to the v1.30.0 snapshot at Phase 30 close
 * but the test does not encode the literal v1.30.0.
 *
 * Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28
 * lesson 5) on every user/version-derived dynamic regex.
 *
 * Tagged '30-08:' per closeout discipline.
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

const BASELINE_DIR_30 = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-30');
const PRIOR_PHASE_DIRS = [
  'phase-29',
  'phase-28.8',
  'phase-28.7',
  'phase-28.6',
  'phase-28.5',
  'phase-28',
  'phase-27-7', // HYPHEN naming — verified historical
];

const PSEUDONYMIZE_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'pseudonymize.cjs');
const PAYLOAD_ASSEMBLY_PATH = path.join(
  REPO_ROOT, 'scripts', 'lib', 'issue-reporter', 'payload-assembly.cjs'
);
const DESTINATION_PATH = path.join(
  REPO_ROOT, 'scripts', 'lib', 'issue-reporter', 'destination.cjs'
);
const ISSUE_REPORTER_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'issue-reporter');

const PSEUDONYM_RULES_PATH = path.join(REPO_ROOT, 'reference', 'pseudonymization-rules.md');
const KNOWN_FAILURE_MODES_PATH = path.join(REPO_ROOT, 'reference', 'known-failure-modes.md');
const REGISTRY_PATH = path.join(REPO_ROOT, 'reference', 'registry.json');

const SKILL_REPORT_ISSUE_PATH = path.join(
  REPO_ROOT, 'skills', 'report-issue', 'SKILL.md'
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

test('30-08 baseline: package.json version matches VERSION', () => {
  const pkg = readJson(PKG_PATH);
  assert.equal(pkg.version, VERSION,
    `package.json version ${pkg.version} != VERSION ${VERSION}`);
});

test('30-08 baseline: .claude-plugin/plugin.json version matches VERSION', () => {
  const plg = readJson(CLAUDE_PLUGIN_PATH);
  assert.equal(plg.version, VERSION,
    `.claude-plugin/plugin.json version ${plg.version} != VERSION ${VERSION}`);
});

test('30-08 baseline: .claude-plugin/marketplace.json metadata.version matches VERSION', () => {
  const mp = readJson(MARKETPLACE_PATH);
  assert.equal(mp.metadata && mp.metadata.version, VERSION,
    `marketplace.json metadata.version != VERSION ${VERSION}`);
});

test('30-08 baseline: .claude-plugin/marketplace.json plugins[0].version matches VERSION', () => {
  const mp = readJson(MARKETPLACE_PATH);
  assert.ok(Array.isArray(mp.plugins) && mp.plugins.length >= 1,
    'marketplace.json: plugins[] missing or empty');
  assert.equal(mp.plugins[0].version, VERSION,
    `marketplace.json plugins[0].version != VERSION ${VERSION}`);
});

test('30-08 baseline: .cursor-plugin/plugin.json version matches VERSION (D-12 Tier-2 lockstep)', () => {
  const cur = readJson(CURSOR_PLUGIN_PATH);
  assert.equal(cur.version, VERSION,
    `.cursor-plugin/plugin.json version ${cur.version} != VERSION ${VERSION}`);
});

test('30-08 baseline: .codex-plugin/plugin.json version matches VERSION (D-12 Tier-2 lockstep)', () => {
  const cod = readJson(CODEX_PLUGIN_PATH);
  assert.equal(cod.version, VERSION,
    `.codex-plugin/plugin.json version ${cod.version} != VERSION ${VERSION}`);
});

// ---------------------------------------------------------------------------
// Test 7: OFF_CADENCE_VERSIONS.add(VERSION) registered.

test('30-08 baseline: tests/semver-compare.test.cjs registers OFF_CADENCE_VERSIONS.add(VERSION)', () => {
  const txt = readText(SEMVER_TEST_PATH);
  // Full RegExp escape per CodeQL js/incomplete-sanitization.
  const pattern = new RegExp(
    'OFF_CADENCE_VERSIONS\\.add\\([\'\"]' + escapeRegExp(VERSION) + '[\'\"]\\)'
  );
  assert.match(txt, pattern,
    `semver-compare.test.cjs missing OFF_CADENCE_VERSIONS.add('${VERSION}') registration`);
});

// ---------------------------------------------------------------------------
// Test 8: CHANGELOG top entry is `## [VERSION] - 2026-05-20`.

test('30-08 baseline: CHANGELOG.md top entry is ## [VERSION] - 2026-05-20', () => {
  const chg = readText(CHANGELOG_PATH);
  const pattern = new RegExp(
    '##\\s+\\[' + escapeRegExp(VERSION) + '\\]\\s+-\\s+2026-05-20'
  );
  assert.match(chg, pattern,
    `CHANGELOG.md missing ## [${VERSION}] - 2026-05-20 entry`);
  // Must appear within the first 20 lines (i.e., at top, not buried).
  const top20 = chg.split('\n').slice(0, 20).join('\n');
  assert.match(top20, pattern,
    `CHANGELOG.md ## [${VERSION}] entry not in top 20 lines (must be top-of-file)`);
});

// ---------------------------------------------------------------------------
// Test 9: phase-30/manifests-version.txt matches VERSION.

test('30-08 baseline: phase-30/manifests-version.txt matches VERSION', () => {
  const got = readText(path.join(BASELINE_DIR_30, 'manifests-version.txt')).trim();
  assert.equal(got, VERSION,
    `phase-30/manifests-version.txt = ${got} != VERSION ${VERSION}`);
});

// ---------------------------------------------------------------------------
// Test 10: Prior-phase baseline lockstep — all 7 prior phases forward-propped.

test('30-08 baseline: prior-phase manifests-version.txt files all forward-propped to VERSION', () => {
  for (const dir of PRIOR_PHASE_DIRS) {
    const filePath = path.join(REPO_ROOT, 'test-fixture', 'baselines', dir, 'manifests-version.txt');
    assert.ok(fs.existsSync(filePath),
      `prior-phase baseline missing: test-fixture/baselines/${dir}/manifests-version.txt`);
    const got = readText(filePath).trim();
    assert.equal(got, VERSION,
      `test-fixture/baselines/${dir}/manifests-version.txt = ${got} != VERSION ${VERSION}`);
  }
});

// ---------------------------------------------------------------------------
// Test 11: scripts/lib/pseudonymize.cjs (Plan 30-01) exports + shape.

test('30-08 baseline: scripts/lib/pseudonymize.cjs exists + exports expected helpers (30-01)', () => {
  assert.ok(fs.existsSync(PSEUDONYMIZE_PATH),
    'scripts/lib/pseudonymize.cjs missing (30-01 deliverable)');
  // require()'s cleanly.
  const mod = require(PSEUDONYMIZE_PATH);
  assert.equal(typeof mod, 'object', 'pseudonymize.cjs export must be an object');
  // Required helpers per 30-01 module.exports manifest:
  for (const fn of [
    'pseudonymize',
    'replaceGitIdentity',
    'replacePaths',
    'replaceHostname',
    'replaceRepoOrigin',
    'dropEnvVars',
    'replaceEmails',
    'replaceIPs',
    'stablePseudonym',
  ]) {
    assert.equal(typeof mod[fn], 'function',
      `pseudonymize.cjs missing function export: ${fn}`);
  }
  // RULES manifest must be a frozen array-like.
  assert.ok(Array.isArray(mod.RULES),
    'pseudonymize.cjs missing RULES manifest array');
  assert.ok(mod.RULES.length >= 8,
    `pseudonymize.cjs RULES manifest has ${mod.RULES.length} entries; expected >= 8 (R1..R8)`);
});

// ---------------------------------------------------------------------------
// Test 12: scripts/lib/issue-reporter/payload-assembly.cjs (Plan 30-02) exports + shape.

test('30-08 baseline: scripts/lib/issue-reporter/payload-assembly.cjs exists + exports assemble (30-02)', () => {
  assert.ok(fs.existsSync(PAYLOAD_ASSEMBLY_PATH),
    'scripts/lib/issue-reporter/payload-assembly.cjs missing (30-02 deliverable)');
  const mod = require(PAYLOAD_ASSEMBLY_PATH);
  assert.equal(typeof mod, 'object', 'payload-assembly.cjs export must be an object');
  assert.equal(typeof mod.assemble, 'function',
    'payload-assembly.cjs missing assemble() function');
  assert.equal(typeof mod.computeFingerprint, 'function',
    'payload-assembly.cjs missing computeFingerprint() function');
});

// ---------------------------------------------------------------------------
// Test 13: Hardcoded destination URL constant immutable — exactly one carrier file.

test('30-08 baseline: destination URL literal appears EXACTLY ONCE under issue-reporter/ in destination.cjs (D-02/D-03)', () => {
  // Per CONTEXT.md D-02/D-03: destination.cjs is the SOLE FILE under
  // scripts/lib/issue-reporter/ allowed to carry the destination URL literal.
  // The literal `https?://github.com/hegemonart/get-design-done` must NOT
  // appear in any other file under that tree.
  assert.ok(fs.existsSync(DESTINATION_PATH),
    'scripts/lib/issue-reporter/destination.cjs missing (30-04 deliverable)');
  const destText = readText(DESTINATION_PATH);
  // Use full character-class escape per CodeQL js/incomplete-sanitization.
  const urlPattern = new RegExp(
    escapeRegExp('https://github.com/hegemonart/get-design-done'),
    'g'
  );
  const matches = destText.match(urlPattern) || [];
  assert.ok(matches.length >= 1,
    `destination.cjs must contain DESTINATION_URL literal at least once (found ${matches.length})`);

  // Scan every other file under scripts/lib/issue-reporter/ — none may carry
  // the literal repo URL.
  const otherFiles = fs.readdirSync(ISSUE_REPORTER_DIR)
    .filter((f) => f.endsWith('.cjs') && f !== 'destination.cjs');
  for (const f of otherFiles) {
    const txt = readText(path.join(ISSUE_REPORTER_DIR, f));
    const m = txt.match(urlPattern) || [];
    assert.equal(m.length, 0,
      `${f} must not contain the destination URL literal (found ${m.length}); only destination.cjs is authorized.`);
  }
});

// ---------------------------------------------------------------------------
// Test 14: Reference docs present + registered.

test('30-08 baseline: reference/pseudonymization-rules.md + known-failure-modes.md exist + registered (30-01/30-03)', () => {
  assert.ok(fs.existsSync(PSEUDONYM_RULES_PATH),
    'reference/pseudonymization-rules.md missing (30-01 deliverable)');
  assert.ok(fs.existsSync(KNOWN_FAILURE_MODES_PATH),
    'reference/known-failure-modes.md missing (30-03 deliverable)');
  // Both must be registered in reference/registry.json.
  const reg = readJson(REGISTRY_PATH);
  assert.ok(Array.isArray(reg.entries), 'registry.json entries[] missing');
  const paths = reg.entries.map((e) => e && e.path).filter(Boolean);
  assert.ok(paths.includes('reference/pseudonymization-rules.md'),
    'registry.json missing entry for reference/pseudonymization-rules.md');
  assert.ok(paths.includes('reference/known-failure-modes.md'),
    'registry.json missing entry for reference/known-failure-modes.md');
});

// ---------------------------------------------------------------------------
// Test 15: skills/report-issue/SKILL.md exists + Phase 28.5 compliant.

test('30-08 baseline: skills/report-issue/SKILL.md exists + Phase 28.5 compliant (30-04)', () => {
  assert.ok(fs.existsSync(SKILL_REPORT_ISSUE_PATH),
    'skills/report-issue/SKILL.md missing (30-04 deliverable)');
  const txt = readText(SKILL_REPORT_ISSUE_PATH);
  // Phase 28.5 SKILL.md size discipline: <=100 lines.
  const lineCount = txt.split('\n').length;
  assert.ok(lineCount <= 100,
    `skills/report-issue/SKILL.md line count ${lineCount} exceeds Phase 28.5 cap of 100`);
  // Frontmatter must contain `name` + `description` keys.
  const fm = txt.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fm, 'skills/report-issue/SKILL.md missing frontmatter block');
  assert.match(fm[1], /^name:\s*/m, 'SKILL.md frontmatter missing `name` key');
  assert.match(fm[1], /^description:\s*/m, 'SKILL.md frontmatter missing `description` key');
});

// ---------------------------------------------------------------------------
// Test 16: Static-analysis network isolation — no `https://` / `fetch(` /
// XMLHttpRequest references anywhere under scripts/lib/issue-reporter/ or
// scripts/lib/pseudonymize.cjs, EXCEPT destination.cjs (whitelisted).

test('30-08 baseline: static-analysis network isolation — no network strings outside destination.cjs (30-07)', () => {
  // Patterns scanned per Plan 30-07 / D-02 / D-03.
  // Full escape applied to literal `://` and `(` to satisfy CodeQL.
  const forbiddenPatterns = [
    /https?:\/\//,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
  ];

  // Collect target files.
  const targets = [];
  targets.push(PSEUDONYMIZE_PATH);
  for (const f of fs.readdirSync(ISSUE_REPORTER_DIR)) {
    if (!f.endsWith('.cjs')) continue;
    if (f === 'destination.cjs') continue; // whitelisted
    targets.push(path.join(ISSUE_REPORTER_DIR, f));
  }

  for (const filePath of targets) {
    const txt = readText(filePath);
    // Strip block + line comments so doc-strings don't false-positive.
    // Note: this is a coarse strip — it's fine for the static-analysis use
    // case here (we want to catch real code, not prose).
    const stripped = txt
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const pat of forbiddenPatterns) {
      const m = stripped.match(pat);
      assert.equal(m, null,
        `${path.relative(REPO_ROOT, filePath)} contains forbidden network pattern ${pat} (only destination.cjs is whitelisted)`);
    }
  }
});
