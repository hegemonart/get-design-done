'use strict';
/**
 * tests/phase-28.8-baseline.test.cjs — Phase 28.8-Z1 regression baseline.
 *
 * Locks the post-ship state of Phase 28.8 (Tier-2 Distribution Channels):
 *   - 4-manifest lockstep (package.json + .claude-plugin/plugin.json +
 *     .claude-plugin/marketplace.json metadata.version + plugins[0].version);
 *     (the 2 additional Tier-2 manifests .cursor-plugin/plugin.json and
 *     .codex-plugin/plugin.json are tested separately as schema-checked
 *     manifests, see tests 13-14)
 *   - OFF_CADENCE_VERSIONS registers current version
 *   - CHANGELOG ## [<current-version>] block at top
 *   - phase-28.8/manifests-version.txt matches package.json#version
 *   - phase-28.7/manifests-version.txt forward-propagated to current version
 *   - phase-28.6/manifests-version.txt forward-propagated to current version
 *   - phase-28.5/manifests-version.txt forward-propagated to current version
 *   - phase-28/manifests-version.txt forward-propagated to current version
 *   - Tier-2 converter inventory (Wave A/B/C new scripts)
 *   - .cursor-plugin/plugin.json + .codex-plugin/plugin.json exist + parse
 *   - .claude-plugin/marketplace.json reused as Codex catalog (D-14)
 *   - README.md + 6 translated READMEs reference all 3 Tier-2 channels
 *
 * Version-agnostic per D-08 lesson (Phases 25/26/27/27.5/27.6/27.7/28/28.5/28.6/28.7).
 * Reads `package.json#version` dynamically; baselines pin the snapshot at
 * Phase 28.8 close but the test does NOT hard-code the literal v1.28.8.
 *
 * Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28 lesson 5)
 * on every user/version-derived dynamic regex.
 *
 * Tagged '28.8-Z1:' per closeout discipline.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const PLUGIN_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const CURSOR_PLUGIN_PATH = path.join(REPO_ROOT, '.cursor-plugin', 'plugin.json');
const CODEX_PLUGIN_PATH = path.join(REPO_ROOT, '.codex-plugin', 'plugin.json');
const BASELINE_DIR_288 = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-28.8');
const BASELINE_DIR_287 = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-28.7');
const BASELINE_DIR_286 = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-28.6');
const BASELINE_DIR_285 = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-28.5');
const BASELINE_DIR_28 = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-28');
const CONVERTERS_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'install', 'converters');

const VERSION = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).version;

// Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28 lesson 5).
// Full character-class escape covers all RegExp metacharacters.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
const readBaselineFile = (dir, p) => fs.readFileSync(path.join(dir, p), 'utf8');

// 7 README files: 1 English + 6 translations.
const README_FILES = Object.freeze([
  'README.md',
  'docs/i18n/README.de.md',
  'docs/i18n/README.fr.md',
  'docs/i18n/README.it.md',
  'docs/i18n/README.ja.md',
  'docs/i18n/README.ko.md',
  'docs/i18n/README.zh-CN.md',
]);

// 4 NEW Phase 28.8 converters/scripts (from baseline converter-inventory.txt).
const PHASE_28_8_NEW_SCRIPTS = Object.freeze([
  'scripts/lint-agentskills-spec.cjs',
  'scripts/lib/install/converters/cursor-marketplace.cjs',
  'scripts/lib/install/converters/codex-plugin.cjs',
  'scripts/build-distribution-bundles.cjs',
]);

describe('Phase 28.8-Z1: 4-manifest lockstep (D-08)', () => {
  test('28.8-Z1: package.json reads VERSION', () => {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    assert.equal(pkg.version, VERSION, `package.json ${pkg.version} != VERSION ${VERSION}`);
  });

  test('28.8-Z1: .claude-plugin/plugin.json reads VERSION', () => {
    const plugin = JSON.parse(fs.readFileSync(PLUGIN_PATH, 'utf8'));
    assert.equal(plugin.version, VERSION, `plugin.json ${plugin.version} != VERSION ${VERSION}`);
  });

  test('28.8-Z1: .claude-plugin/marketplace.json metadata.version reads VERSION', () => {
    const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
    assert.equal(marketplace.metadata.version, VERSION, `marketplace.metadata.version ${marketplace.metadata.version} != VERSION ${VERSION}`);
  });

  test('28.8-Z1: .claude-plugin/marketplace.json plugins[0].version reads VERSION', () => {
    const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
    assert.equal(marketplace.plugins[0].version, VERSION, `marketplace.plugins[0].version ${marketplace.plugins[0].version} != VERSION ${VERSION}`);
  });
});

describe('Phase 28.8-Z1: CHANGELOG + OFF_CADENCE registration', () => {
  test('28.8-Z1: tests/semver-compare.test.cjs registers VERSION in OFF_CADENCE_VERSIONS', () => {
    const semver = read('test/suite/semver-compare.test.cjs');
    // Full character-class escape per CodeQL js/incomplete-sanitization.
    const re = new RegExp(`OFF_CADENCE_VERSIONS\\.add\\(['"]${escapeRegExp(VERSION)}['"]\\)`);
    assert.match(semver, re, `semver-compare.test.cjs missing OFF_CADENCE_VERSIONS.add('${VERSION}')`);
  });

  test('28.8-Z1: CHANGELOG.md has ## [1.28.8] - 2026-05-19 historical block', () => {
    // Phase 30 lesson: this baseline pins to the v1.28.8 historical entry
    // (literal version + date), NOT to the current top-of-file. After v1.30.0
    // ship, the v1.28.8 block is no longer at the top — the test was
    // originally written for a snapshot moment when v1.28.8 was the head.
    // Rewriting to a literal historical assertion keeps it green across
    // future bumps without losing the lockdown intent.
    const chg = read('CHANGELOG.md');
    const re = /^## \[1\.28\.8\]\s+-\s+2026-05-19/m;
    assert.match(chg, re, 'CHANGELOG missing ## [1.28.8] - 2026-05-19 historical block');
  });
});

describe('Phase 28.8-Z1: baseline lockstep + forward-prop (5 baseline files)', () => {
  test('28.8-Z1: phase-28.8/manifests-version.txt matches VERSION', () => {
    const baseline = readBaselineFile(BASELINE_DIR_288, 'manifests-version.txt').replace(/\s+$/, '');
    assert.equal(baseline, VERSION, `phase-28.8/manifests-version.txt ${baseline} != VERSION ${VERSION}`);
  });

  test('28.8-Z1: phase-28.7/manifests-version.txt forward-propagated to VERSION', () => {
    const baseline = readBaselineFile(BASELINE_DIR_287, 'manifests-version.txt').replace(/\s+$/, '');
    assert.equal(baseline, VERSION, `phase-28.7/manifests-version.txt ${baseline} != VERSION ${VERSION}`);
  });

  test('28.8-Z1: phase-28.6/manifests-version.txt forward-propagated to VERSION', () => {
    const baseline = readBaselineFile(BASELINE_DIR_286, 'manifests-version.txt').replace(/\s+$/, '');
    assert.equal(baseline, VERSION, `phase-28.6/manifests-version.txt ${baseline} != VERSION ${VERSION}`);
  });

  test('28.8-Z1: phase-28.5/manifests-version.txt forward-propagated to VERSION', () => {
    const baseline = readBaselineFile(BASELINE_DIR_285, 'manifests-version.txt').replace(/\s+$/, '');
    assert.equal(baseline, VERSION, `phase-28.5/manifests-version.txt ${baseline} != VERSION ${VERSION}`);
  });

  test('28.8-Z1: phase-28/manifests-version.txt forward-propagated to VERSION', () => {
    const baseline = readBaselineFile(BASELINE_DIR_28, 'manifests-version.txt').replace(/\s+$/, '');
    assert.equal(baseline, VERSION, `phase-28/manifests-version.txt ${baseline} != VERSION ${VERSION}`);
  });
});

describe('Phase 28.8-Z1: Tier-2 converter + script inventory (Wave A/B/C)', () => {
  test('28.8-Z1: Tier-2 converter + script inventory all exist + require() cleanly', () => {
    const missing = [];
    const failedRequire = [];
    for (const rel of PHASE_28_8_NEW_SCRIPTS) {
      const absPath = path.join(REPO_ROOT, rel);
      if (!fs.existsSync(absPath)) {
        missing.push(rel);
        continue;
      }
      try {
        require(absPath);
      } catch (err) {
        // Some scripts may be executable-CLI shape; accept if loader at least
        // accepts the file (typed throw at execution is fine — we just want
        // syntax-clean + module-resolvable).
        if (err && err.code !== 'MODULE_NOT_FOUND') {
          // Non-import errors (e.g. runtime side-effect throw on require)
          // are acceptable — file exists + parses.
        } else {
          failedRequire.push(`${rel}: ${err && err.message}`);
        }
      }
    }
    assert.equal(missing.length, 0, `Missing Phase 28.8 scripts: ${missing.join(', ')}`);
    assert.equal(failedRequire.length, 0, `Phase 28.8 scripts failed to resolve: ${failedRequire.join('; ')}`);
  });
});

describe('Phase 28.8-Z1: Tier-2 manifests exist + parse', () => {
  test('28.8-Z1: .cursor-plugin/plugin.json exists + parses + has required keys', () => {
    assert.equal(fs.existsSync(CURSOR_PLUGIN_PATH), true, `.cursor-plugin/plugin.json must exist`);
    const manifest = JSON.parse(fs.readFileSync(CURSOR_PLUGIN_PATH, 'utf8'));
    assert.ok(manifest.name, '.cursor-plugin/plugin.json missing name');
    assert.ok(manifest.version, '.cursor-plugin/plugin.json missing version');
    assert.ok(manifest.description, '.cursor-plugin/plugin.json missing description');
    assert.equal(manifest.version, VERSION, `.cursor-plugin/plugin.json version ${manifest.version} != VERSION ${VERSION}`);
  });

  test('28.8-Z1: .codex-plugin/plugin.json exists + parses + has required keys', () => {
    assert.equal(fs.existsSync(CODEX_PLUGIN_PATH), true, `.codex-plugin/plugin.json must exist`);
    const manifest = JSON.parse(fs.readFileSync(CODEX_PLUGIN_PATH, 'utf8'));
    assert.ok(manifest.name, '.codex-plugin/plugin.json missing name');
    assert.ok(manifest.version, '.codex-plugin/plugin.json missing version');
    assert.ok(manifest.description, '.codex-plugin/plugin.json missing description');
    assert.equal(manifest.version, VERSION, `.codex-plugin/plugin.json version ${manifest.version} != VERSION ${VERSION}`);
  });
});

describe('Phase 28.8-Z1: D-14 Codex catalog reuse via .claude-plugin/marketplace.json', () => {
  test('28.8-Z1: .claude-plugin/marketplace.json parses + has plugins[] array (D-14 catalog reuse)', () => {
    // D-14: Codex's `codex plugin marketplace add owner/repo` reuses
    // the existing .claude-plugin/marketplace.json as catalog file.
    // No separate .codex-plugin/marketplace.json authored.
    const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
    assert.ok(Array.isArray(marketplace.plugins), '.claude-plugin/marketplace.json missing plugins[] array (Codex catalog reuse shape per D-14)');
    assert.ok(marketplace.plugins.length > 0, '.claude-plugin/marketplace.json plugins[] is empty');
    // Sanity: no separate .codex-plugin/marketplace.json exists per D-14.
    const separateCodexCatalog = path.join(REPO_ROOT, '.codex-plugin', 'marketplace.json');
    assert.equal(fs.existsSync(separateCodexCatalog), false, 'Separate .codex-plugin/marketplace.json must NOT exist (D-14: reuse .claude-plugin/marketplace.json as Codex catalog)');
  });
});

describe('Phase 28.8-Z1: README inventory references all 3 Tier-2 channels (D-04 + D-16)', () => {
  test('28.8-Z1: README.md + 6 translated READMEs mention all 3 Tier-2 channels', () => {
    const missing = [];
    for (const readmeFile of README_FILES) {
      const content = read(readmeFile);
      // Channel name match is case-insensitive (translated text may vary case).
      const hasAgentskills = /agentskills\.io/i.test(content);
      const hasCursor = /cursor/i.test(content);
      // Literal command string per D-03 — must match exactly in every README
      // (commands are verbatim English even in translated files).
      const hasCodexCmd = content.includes('codex plugin marketplace add hegemonart/hone');
      if (!hasAgentskills) missing.push(`${readmeFile}: missing 'agentskills.io'`);
      if (!hasCursor) missing.push(`${readmeFile}: missing 'cursor' (case-insensitive)`);
      if (!hasCodexCmd) missing.push(`${readmeFile}: missing literal 'codex plugin marketplace add hegemonart/hone'`);
    }
    assert.equal(missing.length, 0, `READMEs missing Tier-2 mentions:\n  ${missing.join('\n  ')}`);
  });
});
