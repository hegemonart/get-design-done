// tests/phase-28-baseline.test.cjs — Phase 28-07 regression baseline.
// Version-agnostic (D-08 lesson — Phases 25/26/27/27.5/27.6/27.7) — reads
// package.json#version dynamically. After v1.28.0 ships, this test continues
// to pass when package.json bumps to v1.29.x+ as long as the 4 manifests
// stay aligned and the phase-28 baseline files match the version at the
// time of the bump (subsequent phases replace baseline pinning during
// their own closeouts).
//
// Tagged '28-07:' per closeout discipline.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const PLUGIN_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const BASELINE_DIR = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-28');

const VERSION = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).version;

const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');
const readBaseline = (p) => fs.readFileSync(path.join(BASELINE_DIR, p), 'utf8');

describe('Phase 28-07: 4-manifest lockstep', () => {
  test('28-07: package.json + plugin.json + marketplace.json all aligned to package.json#version', () => {
    const plugin = JSON.parse(fs.readFileSync(PLUGIN_PATH, 'utf8'));
    const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
    assert.equal(plugin.version, VERSION, `plugin.json version ${plugin.version} != package.json ${VERSION}`);
    assert.equal(marketplace.metadata.version, VERSION, `marketplace.metadata.version ${marketplace.metadata.version} != ${VERSION}`);
    assert.equal(marketplace.plugins[0].version, VERSION, `marketplace.plugins[0].version ${marketplace.plugins[0].version} != ${VERSION}`);
  });

  test('28-07: manifests-version.txt baseline matches package.json#version', () => {
    const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
    assert.equal(baseline, VERSION, `manifests-version.txt baseline ${baseline} != package.json ${VERSION}`);
  });
});

describe('Phase 28-07: reference files presence', () => {
  test('28-07: each of the 5 new reference files exists at its baseline-declared path', () => {
    const baseline = readBaseline('reference-files-presence.txt').trim().split(/\r?\n/);
    assert.equal(baseline.length, 5, `expected 5 files, got ${baseline.length}`);
    baseline.forEach(rel => {
      assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `missing: ${rel}`);
    });
  });
});

describe('Phase 28-07: registry round-trip', () => {
  test('28-07: registry contains exactly the 5 new entries from registry-diff.txt baseline', () => {
    const expectedNames = readBaseline('registry-diff.txt').trim().split(/\r?\n/);
    assert.equal(expectedNames.length, 5);
    const registry = JSON.parse(read('reference/registry.json'));
    expectedNames.forEach(name => {
      const entry = registry.entries.find(e => e.name === name);
      assert.ok(entry, `missing registry entry: ${name}`);
      assert.equal(entry.phase, 28, `entry ${name} phase != 28`);
    });
  });
});

describe('Phase 28-07: cross-link integrity', () => {
  test('28-07: each of the 10 baseline-listed files contains >=1 cross-link to a new ref file', () => {
    const targetFiles = readBaseline('cross-link-integrity.txt').trim().split(/\r?\n/);
    assert.equal(targetFiles.length, 10);
    const newRefBasenames = ['color-theory.md', 'composition.md', 'proportion-systems.md', 'i18n.md', 'contrast-advanced.md'];
    targetFiles.forEach(rel => {
      const content = read(rel);
      const hits = newRefBasenames.filter(n => content.includes(n)).length;
      assert.ok(hits >= 1, `${rel} contains no cross-link to any new Phase 28 ref file`);
    });
  });
});

describe('Phase 28-07: verifier + explore probe markers', () => {
  test('28-07: design-verifier.md contains verifier-probes-presence.txt marker exactly once', () => {
    const marker = readBaseline('verifier-probes-presence.txt').replace(/\s+$/, '');
    const verifier = read('agents/design-verifier.md');
    const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = verifier.match(new RegExp(escapedMarker, 'g')) || [];
    assert.equal(matches.length, 1, `verifier marker "${marker}" count = ${matches.length}, expected 1`);
  });

  test('28-07: explore/SKILL.md contains explore-probe-presence.txt marker', () => {
    const marker = readBaseline('explore-probe-presence.txt').replace(/\s+$/, '');
    const explore = read('skills/explore/SKILL.md');
    assert.ok(explore.includes(marker), `explore SKILL.md missing marker "${marker}"`);
  });
});

describe('Phase 28-07: CHANGELOG + OFF_CADENCE', () => {
  test('28-07: CHANGELOG has a current-version block at top (within first 50 lines)', () => {
    // Version-agnostic: look for the current VERSION's block, not hardcoded 1.28.0
    const head50 = read('CHANGELOG.md').split(/\r?\n/).slice(0, 50).join('\n');
    const escaped = VERSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(head50, new RegExp(`^## \\[${escaped}\\]`, 'm'));
  });

  test('28-07: tests/semver-compare.test.cjs contains OFF_CADENCE_VERSIONS.add for current version', () => {
    const semver = read('tests/semver-compare.test.cjs');
    const escaped = VERSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(semver, new RegExp(`OFF_CADENCE_VERSIONS\\.add\\(['"]${escaped}['"]\\)`));
  });
});
