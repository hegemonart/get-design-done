// tests/phase-27-5-baseline.test.cjs — Phase 27.5 regression baseline.
//
// Version-agnostic per the Phase 26 lesson — reads package.json#version
// dynamically instead of hard-coding any version string. Tests continue
// to pass on future patch bumps as long as the 4 manifests stay aligned
// and the phase-27-5 baseline file matches package.json#version.

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const PLUGIN_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const BASELINE_DIR = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-27-5');

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  return pkg.version;
}

test('27.5-baseline: 4 manifests aligned to package.json version', () => {
  const expectedVersion = readVersion();
  const plugin = JSON.parse(fs.readFileSync(PLUGIN_PATH, 'utf8'));
  const market = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
  assert.equal(plugin.version, expectedVersion, 'plugin.json version mismatch');
  assert.equal(market.metadata.version, expectedVersion, 'marketplace.json metadata version mismatch');
  assert.equal(market.plugins[0].version, expectedVersion, 'marketplace.json plugins[0] version mismatch');
});

test('27.5-baseline: phase-27-5/manifests-version.txt matches package.json version', () => {
  const expectedVersion = readVersion();
  const baselineVersion = fs.readFileSync(path.join(BASELINE_DIR, 'manifests-version.txt'), 'utf8').trim();
  assert.equal(baselineVersion, expectedVersion, 'phase-27-5 manifests baseline must match package.json#version');
});

test('27.5-baseline: scripts/lib/bandit-router/integration.cjs exports consultBandit + recordOutcome + DELEGATE_NONE', () => {
  const m = require(path.join(REPO_ROOT, 'scripts', 'lib', 'bandit-router', 'integration.cjs'));
  assert.equal(typeof m.consultBandit, 'function', 'consultBandit must be exported');
  assert.equal(typeof m.recordOutcome, 'function', 'recordOutcome must be exported');
  assert.equal(m.DELEGATE_NONE, 'none', 'DELEGATE_NONE must equal "none"');
});

test('27.5-baseline: skill-list baseline contains bandit-status', () => {
  const phase20 = fs.readFileSync(path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-20', 'skill-list.txt'), 'utf8')
    .split(/\r?\n/).filter(Boolean);
  const current = fs.readFileSync(path.join(REPO_ROOT, 'test-fixture', 'baselines', 'current', 'skill-list.txt'), 'utf8')
    .split(/\r?\n/).filter(Boolean);
  assert.ok(phase20.includes('bandit-status'), 'phase-20 skill-list must contain bandit-status');
  assert.ok(current.includes('bandit-status'), 'current skill-list must contain bandit-status');
});

test('27.5-baseline: skills/bandit-status/SKILL.md exists with frontmatter', () => {
  const skillPath = path.join(REPO_ROOT, 'skills', 'bandit-status', 'SKILL.md');
  assert.ok(fs.existsSync(skillPath), 'skills/bandit-status/SKILL.md must exist');
  const content = fs.readFileSync(skillPath, 'utf8');
  assert.ok(content.startsWith('---'), 'bandit-status SKILL.md must start with frontmatter delimiter');
  assert.ok(/name:\s*gdd-bandit-status/.test(content), 'bandit-status SKILL.md must have name: gdd-bandit-status');
});

test('27.5-baseline: docs/BANDIT-INTEGRATION.md and reference/bandit-integration.md exist', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'docs', 'BANDIT-INTEGRATION.md')), 'operator guide must exist');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'reference', 'bandit-integration.md')), 'developer reference must exist');
});

test('27.5-baseline: reference/registry.json contains bandit-integration entry', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'reference', 'registry.json'), 'utf8'));
  const entry = registry.entries.find((e) => e.name === 'bandit-integration');
  assert.ok(entry, 'registry.json must contain bandit-integration entry');
  assert.equal(entry.phase, 27.5, 'bandit-integration entry phase must be 27.5');
  assert.equal(entry.path, 'reference/bandit-integration.md', 'bandit-integration entry path must match');
});
