'use strict';
/**
 * tests/phase-28.6-baseline.test.cjs — Phase 28.6-04 regression baseline.
 *
 * Locks the post-co-location state of Phase 28.6:
 *   - 4-manifest lockstep (package.json + plugin.json + marketplace.json
 *     metadata.version + plugins[0].version)
 *   - CHANGELOG `## [<current-version>]` block at top
 *   - OFF_CADENCE_VERSIONS.add('<current-version>')
 *   - 20 skill-private procedure refs at `skills/<owner>/<topic>.md`
 *   - 0 of those 20 still at `reference/<topic>.md`
 *   - 0 stale `reference/<moved>.md` cross-links in `skills/`
 *
 * Version-agnostic per D-08 lesson (Phases 25/26/27/27.5/27.6/27.7/28/28.5).
 * Reads `package.json#version` dynamically; baselines pin the snapshot at
 * Phase 28.6 close but the test does NOT hard-code the literal v1.28.6.
 *
 * Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28
 * lesson 5) on every user/version-derived dynamic regex.
 *
 * Tagged '28.6-04:' per closeout discipline.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const PLUGIN_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const BASELINE_DIR = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-28.6');

const VERSION = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).version;

// Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28 lesson).
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
const readBaseline = (p) => fs.readFileSync(path.join(BASELINE_DIR, p), 'utf8');

// D-08 canonical migration table — 20 refs moved from reference/<topic>.md
// to skills/<owner>/<topic>.md. Order is stable for deterministic test
// output. Two entries are 2-consumer (cache-policy primary cache-manager,
// peer-cli-protocol primary peer-cli-add); secondaries cross-link via
// ./../<primary>/<file>.md from their own folder.
const MIGRATED = Object.freeze({
  'apply-reflections-procedure.md': 'apply-reflections',
  'cache-policy.md': 'cache-manager',
  'compare-rubric.md': 'compare',
  'connections-onboarding.md': 'connections',
  'darkmode-audit-procedure.md': 'darkmode',
  'debug-feedback-loops.md': 'debug',
  'design-procedure.md': 'design',
  'discover-procedure.md': 'discover',
  'explore-procedure.md': 'explore',
  'health-mcp-detection.md': 'health',
  'health-skill-length-report.md': 'health',
  'milestone-completeness-rubric.md': 'new-cycle',
  'peer-cli-protocol.md': 'peer-cli-add',
  'plan-procedure.md': 'plan',
  'router-rules.md': 'router',
  'scan-procedure.md': 'scan',
  'start-procedure.md': 'start',
  'style-doc-procedure.md': 'style',
  'threat-modeling.md': 'quality-gate',
  'verify-procedure.md': 'verify',
});

function walkMarkdown(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkMarkdown(p, files);
    else if (e.name.endsWith('.md')) files.push(p);
  }
  return files;
}

describe('Phase 28.6-04: 4-manifest lockstep', () => {
  test('28.6-04: package.json + plugin.json + marketplace.json all aligned to package.json#version', () => {
    const plugin = JSON.parse(fs.readFileSync(PLUGIN_PATH, 'utf8'));
    const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
    assert.equal(plugin.version, VERSION, `plugin.json ${plugin.version} != package.json ${VERSION}`);
    assert.equal(marketplace.metadata.version, VERSION, `marketplace.metadata.version ${marketplace.metadata.version} != ${VERSION}`);
    assert.equal(marketplace.plugins[0].version, VERSION, `marketplace.plugins[0].version ${marketplace.plugins[0].version} != ${VERSION}`);
  });

  test('28.6-04: phase-28.6/manifests-version.txt baseline matches package.json#version', () => {
    const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
    assert.equal(baseline, VERSION, `phase-28.6/manifests-version.txt ${baseline} != package.json ${VERSION}`);
  });
});

describe('Phase 28.6-04: CHANGELOG + OFF_CADENCE registration', () => {
  test('28.6-04: CHANGELOG has a current-version block at top (within first 50 lines)', () => {
    const head50 = read('CHANGELOG.md').split(/\r?\n/).slice(0, 50).join('\n');
    const re = new RegExp(`^## \\[${escapeRegExp(VERSION)}\\]`, 'm');
    assert.match(head50, re, `CHANGELOG head 50 lines missing ## [${VERSION}] block`);
  });

  test('28.6-04: tests/semver-compare.test.cjs registers current version in OFF_CADENCE_VERSIONS', () => {
    const semver = read('tests/semver-compare.test.cjs');
    const re = new RegExp(`OFF_CADENCE_VERSIONS\\.add\\(['"]${escapeRegExp(VERSION)}['"]\\)`);
    assert.match(semver, re, `semver-compare.test.cjs missing OFF_CADENCE_VERSIONS.add('${VERSION}')`);
  });
});

describe('Phase 28.6-04: skill-private refs co-located at per-skill folders', () => {
  test('28.6-04: all 20 migrated refs exist at skills/<owner>/<topic>.md', () => {
    const missing = [];
    for (const [file, owner] of Object.entries(MIGRATED)) {
      const dest = path.join(REPO_ROOT, 'skills', owner, file);
      if (!fs.existsSync(dest)) missing.push(`skills/${owner}/${file}`);
    }
    assert.equal(missing.length, 0, `Missing migrated refs at destination:\n  ${missing.join('\n  ')}`);
  });

  test('28.6-04: none of the 20 migrated refs remain at reference/<topic>.md', () => {
    const stillThere = [];
    for (const file of Object.keys(MIGRATED)) {
      const src = path.join(REPO_ROOT, 'reference', file);
      if (fs.existsSync(src)) stillThere.push(`reference/${file}`);
    }
    assert.equal(stillThere.length, 0, `Migrated refs still present at reference/:\n  ${stillThere.join('\n  ')}`);
  });
});

describe('Phase 28.6-04: cross-link integrity (no stale reference/ links)', () => {
  test('28.6-04: no skills/**/*.md contains a stale reference/<moved>.md link', () => {
    const movedFiles = Object.keys(MIGRATED);
    const skillsRoot = path.join(REPO_ROOT, 'skills');
    const skillFiles = walkMarkdown(skillsRoot);
    const stale = [];
    for (const f of skillFiles) {
      const content = fs.readFileSync(f, 'utf8');
      for (const m of movedFiles) {
        // Full RegExp escape on every dynamic component (CodeQL discipline).
        const re = new RegExp(`reference/${escapeRegExp(m)}\\b`);
        if (re.test(content)) {
          stale.push(`${path.relative(REPO_ROOT, f)} -> reference/${m}`);
        }
      }
    }
    assert.equal(stale.length, 0, `Stale reference/ cross-links in skills/:\n  ${stale.join('\n  ')}`);
  });

  test('28.6-04: cross-link-integrity.txt baseline records 0 MISSING and 0 STALE entries', () => {
    const text = readBaseline('cross-link-integrity.txt');
    const missing = (text.match(/ : MISSING$/gm) || []).length;
    const stale = (text.match(/ : STALE$/gm) || []).length;
    assert.equal(missing, 0, `baseline has ${missing} MISSING entries; expected 0`);
    assert.equal(stale, 0, `baseline has ${stale} STALE entries; expected 0`);
  });
});

describe('Phase 28.6-04: registry purge', () => {
  test('28.6-04: registry.json does NOT contain any of the 20 migrated entry names', () => {
    const registry = JSON.parse(read('reference/registry.json'));
    const names = new Set(registry.entries.map((e) => e.name));
    const movedNames = Object.keys(MIGRATED).map((f) => f.replace(/\.md$/, ''));
    const stillRegistered = movedNames.filter((n) => names.has(n));
    assert.equal(stillRegistered.length, 0, `Migrated refs still in registry.json:\n  ${stillRegistered.join('\n  ')}`);
  });

  test('28.6-04: phase-28.6/registry-diff.txt baseline lists current registry entries (post-purge)', () => {
    const baseline = readBaseline('registry-diff.txt').trim().split(/\r?\n/);
    const registry = JSON.parse(read('reference/registry.json'));
    // Baseline lines are `<name>: <path>`; ensure baseline count matches registry size.
    assert.equal(baseline.length, registry.entries.length, `baseline lists ${baseline.length} entries; registry has ${registry.entries.length}`);
  });
});
