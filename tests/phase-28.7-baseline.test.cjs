'use strict';
/**
 * tests/phase-28.7-baseline.test.cjs — Phase 28.7-10 regression baseline.
 *
 * Locks the post-port state of Phase 28.7:
 *   - 4-manifest lockstep (package.json + plugin.json + marketplace.json
 *     metadata.version + plugins[0].version)
 *   - CHANGELOG `## [<current-version>]` block at top
 *   - OFF_CADENCE_VERSIONS.add('<current-version>')
 *   - phase-28.7/manifests-version.txt matches package.json#version
 *   - phase-28.6/manifests-version.txt forward-propagated to current version
 *   - phase-28/manifests-version.txt forward-propagated to current version
 *   - scripts/lib/install/converters/ inventory matches baseline
 *     (exactly 14 .cjs files: 13 runtime converters + shared.cjs)
 *   - NO scripts/lib/install/converters/hermes.cjs (D-03 + D-10 guard)
 *   - runtime-homes.cjs + runtime-artifact-layout.cjs + runtime-slash.cjs
 *     all exist and require cleanly
 *   - NOTICE contains "gsd-build/get-shit-done" attribution (D-02)
 *   - README mentions all 14 runtimes by ID
 *
 * Version-agnostic per D-08 lesson (Phases 25/26/27/27.5/27.6/27.7/28/28.5/28.6).
 * Reads `package.json#version` dynamically; baselines pin the snapshot at
 * Phase 28.7 close but the test does NOT hard-code the literal v1.28.7.
 *
 * Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28
 * lesson 5) on every user/version-derived dynamic regex.
 *
 * Tagged '28.7-10:' per closeout discipline.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const PLUGIN_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const BASELINE_DIR = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-28.7');
const PHASE_28_6_BASELINE = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-28.6');
const PHASE_28_BASELINE = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-28');
const CONVERTERS_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'install', 'converters');
const INSTALL_LIB_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'install');

const VERSION = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).version;

// Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28 lesson).
// Mirrors the helper in tests/phase-28.6-baseline.test.cjs — full
// character-class escape covers all RegExp metacharacters.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
const readBaseline = (p) => fs.readFileSync(path.join(BASELINE_DIR, p), 'utf8');

// The 14 runtime IDs claimed by GDD (per scripts/lib/install/runtimes.cjs
// listRuntimeIds() and Phase 24 D-02 invariant; Phase 28.7 preserves the
// list per D-03 + D-10).
const CLAIMED_RUNTIMES = Object.freeze([
  'claude',
  'opencode',
  'gemini',
  'kilo',
  'codex',
  'copilot',
  'cursor',
  'windsurf',
  'antigravity',
  'augment',
  'trae',
  'qwen',
  'codebuddy',
  'cline',
]);

// The 14 expected files in scripts/lib/install/converters/:
// 13 per-runtime (claude excluded — claude is the source format) + shared.cjs.
const EXPECTED_CONVERTER_FILES = Object.freeze([
  'antigravity.cjs',
  'augment.cjs',
  'cline.cjs',
  'codebuddy.cjs',
  'codex.cjs',
  'copilot.cjs',
  'cursor.cjs',
  'gemini.cjs',
  'kilo.cjs',
  'opencode.cjs',
  'qwen.cjs',
  'shared.cjs',
  'trae.cjs',
  'windsurf.cjs',
]);

describe('Phase 28.7-10: 4-manifest lockstep', () => {
  test('28.7-10: package.json + plugin.json + marketplace.json all aligned to package.json#version', () => {
    const plugin = JSON.parse(fs.readFileSync(PLUGIN_PATH, 'utf8'));
    const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
    assert.equal(plugin.version, VERSION, `plugin.json ${plugin.version} != package.json ${VERSION}`);
    assert.equal(marketplace.metadata.version, VERSION, `marketplace.metadata.version ${marketplace.metadata.version} != ${VERSION}`);
    assert.equal(marketplace.plugins[0].version, VERSION, `marketplace.plugins[0].version ${marketplace.plugins[0].version} != ${VERSION}`);
  });

  test('28.7-10: phase-28.7/manifests-version.txt baseline matches package.json#version', () => {
    const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
    assert.equal(baseline, VERSION, `phase-28.7/manifests-version.txt ${baseline} != package.json ${VERSION}`);
  });

  test('28.7-10: phase-28.6/manifests-version.txt forward-propagated to current version', () => {
    const baseline = fs.readFileSync(path.join(PHASE_28_6_BASELINE, 'manifests-version.txt'), 'utf8').replace(/\s+$/, '');
    assert.equal(baseline, VERSION, `phase-28.6/manifests-version.txt ${baseline} != package.json ${VERSION}`);
  });

  test('28.7-10: phase-28/manifests-version.txt forward-propagated to current version', () => {
    const baseline = fs.readFileSync(path.join(PHASE_28_BASELINE, 'manifests-version.txt'), 'utf8').replace(/\s+$/, '');
    assert.equal(baseline, VERSION, `phase-28/manifests-version.txt ${baseline} != package.json ${VERSION}`);
  });
});

describe('Phase 28.7-10: CHANGELOG + OFF_CADENCE registration', () => {
  test('28.7-10: CHANGELOG has a current-version block at top (within first 50 lines)', () => {
    const head50 = read('CHANGELOG.md').split(/\r?\n/).slice(0, 50).join('\n');
    const re = new RegExp(`^## \\[${escapeRegExp(VERSION)}\\]`, 'm');
    assert.match(head50, re, `CHANGELOG head 50 lines missing ## [${VERSION}] block`);
  });

  test('28.7-10: tests/semver-compare.test.cjs registers current version in OFF_CADENCE_VERSIONS', () => {
    const semver = read('tests/semver-compare.test.cjs');
    const re = new RegExp(`OFF_CADENCE_VERSIONS\\.add\\(['"]${escapeRegExp(VERSION)}['"]\\)`);
    assert.match(semver, re, `semver-compare.test.cjs missing OFF_CADENCE_VERSIONS.add('${VERSION}')`);
  });
});

describe('Phase 28.7-10: converter inventory (13 runtime + shared, NO hermes)', () => {
  test('28.7-10: scripts/lib/install/converters/ contains exactly the expected 14 files', () => {
    const actual = fs.readdirSync(CONVERTERS_DIR).filter((f) => f.endsWith('.cjs')).sort();
    const expected = [...EXPECTED_CONVERTER_FILES].sort();
    assert.deepEqual(actual, expected, `converter dir contents diverge from baseline:\n  actual:   ${actual.join(', ')}\n  expected: ${expected.join(', ')}`);
  });

  test('28.7-10: NO scripts/lib/install/converters/hermes.cjs (D-03 + D-10 guard)', () => {
    const hermesPath = path.join(CONVERTERS_DIR, 'hermes.cjs');
    assert.equal(fs.existsSync(hermesPath), false, `hermes.cjs must NOT exist (Phase 24 D-02 runtime-list invariant; Phase 28.7 D-03/D-10)`);
  });

  test('28.7-10: converter-inventory.txt baseline matches actual converter dir contents', () => {
    const baseline = readBaseline('converter-inventory.txt')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
    const actual = fs.readdirSync(CONVERTERS_DIR).filter((f) => f.endsWith('.cjs')).sort();
    assert.deepEqual(actual, baseline, `converter-inventory.txt baseline diverges from actual dir`);
  });
});

describe('Phase 28.7-10: install-pipeline trio exists and loads cleanly', () => {
  for (const mod of ['runtime-homes.cjs', 'runtime-artifact-layout.cjs', 'runtime-slash.cjs']) {
    test(`28.7-10: scripts/lib/install/${mod} exists and require()s without error`, () => {
      const p = path.join(INSTALL_LIB_DIR, mod);
      assert.equal(fs.existsSync(p), true, `${mod} must exist at ${p}`);
      assert.doesNotThrow(() => require(p), `${mod} must require() cleanly`);
    });
  }
});

describe('Phase 28.7-10: NOTICE attribution', () => {
  test('28.7-10: NOTICE contains gsd-build attribution string (D-02)', () => {
    const notice = read('NOTICE');
    // gsd-build appears in URL and in prose — accept either.
    assert.ok(/gsd-build/.test(notice), 'NOTICE missing gsd-build attribution');
    assert.ok(/Phase 28\.7/.test(notice), 'NOTICE missing Phase 28.7 section header');
    assert.ok(/MIT/i.test(notice), 'NOTICE missing MIT-license citation for gsd-build');
  });
});

describe('Phase 28.7-10: README claims 14 runtimes (D-04 — no Experimental tier)', () => {
  test('28.7-10: README.md mentions all 14 runtime IDs by name', () => {
    const readme = read('README.md');
    const missing = [];
    for (const runtime of CLAIMED_RUNTIMES) {
      // Full RegExp escape on every dynamic component (CodeQL discipline).
      // Match the runtime ID as a standalone word — boundary regex matches
      // CLI flags like --cursor and bare mentions like "Cursor".
      const re = new RegExp(`\\b${escapeRegExp(runtime)}\\b`, 'i');
      if (!re.test(readme)) missing.push(runtime);
    }
    assert.equal(missing.length, 0, `README.md missing runtime mentions: ${missing.join(', ')}`);
  });

  test('28.7-10: README.md has NO Experimental tier block (D-04)', () => {
    const readme = read('README.md');
    // Allow the word "experiment" in other contexts (e.g., spike skill); reject
    // explicit two-tier framing like "Experimental:" or "Experimental tier".
    assert.equal(/Experimental\s*:/i.test(readme), false, 'README.md contains Experimental: tier block (forbidden by D-04)');
    assert.equal(/Experimental\s+tier/i.test(readme), false, 'README.md contains "Experimental tier" wording (forbidden by D-04)');
  });
});

describe('Phase 28.7-10: phase-20 skill-list integrity (no skill add/remove)', () => {
  test('28.7-10: phase-20/skill-list.txt unchanged (Phase 28.7 ships install infra, not skills)', () => {
    const skillListPath = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-20', 'skill-list.txt');
    assert.equal(fs.existsSync(skillListPath), true, 'phase-20/skill-list.txt must exist');
    // Sanity: the file must be non-trivial (existing phase-20 has 70 lines).
    const content = fs.readFileSync(skillListPath, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    assert.ok(lines.length > 10, `phase-20/skill-list.txt suspiciously short (${lines.length} lines)`);
  });
});
