// tests/phase-27-6-baseline.test.cjs — Phase 27.6 regression baseline.
//
// Version-agnostic per the Phase 26 lesson — reads package.json#version
// dynamically instead of hard-coding any version string. After v1.27.6
// ships, this test continues to pass when package.json bumps to v1.28.0+
// as long as the 4 manifests stay aligned and the phase-27-6 baseline
// file matches package.json#version at the time of the bump (subsequent
// phases will replace the baseline pinning during their own closeouts).

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const PLUGIN_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const BASELINE_DIR = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-27-6');

function readVersion() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).version;
}

test('27.6-baseline: 4 manifests aligned to package.json version', () => {
  const expected = readVersion();
  const plugin = JSON.parse(fs.readFileSync(PLUGIN_PATH, 'utf8'));
  const market = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
  assert.equal(plugin.version, expected, 'plugin.json version mismatch');
  assert.equal(market.metadata.version, expected, 'marketplace.json metadata version mismatch');
  assert.equal(market.plugins[0].version, expected, 'marketplace.json plugins[0] version mismatch');
});

test('27.6-baseline: phase-27-6/manifests-version.txt has valid semver shape', () => {
  const baselineVersion = fs.readFileSync(
    path.join(BASELINE_DIR, 'manifests-version.txt'),
    'utf8',
  ).trim();
  // Baseline is pinned to the version it shipped at. Subsequent
  // version bumps in later phases will not break this test until
  // a future closeout re-locks the baseline to a new value.
  assert.match(
    baselineVersion,
    /^\d+\.\d+\.\d+$/,
    'baseline manifests-version must look like a semver',
  );
});

test('27.6-baseline: perf-baseline.json has agents block with p50_usd numbers', () => {
  const b = JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, 'perf-baseline.json'), 'utf8'));
  assert.equal(b.schema_version, '1.0.0');
  assert.ok(b.agents && typeof b.agents === 'object', 'agents block required');
  assert.ok(Object.keys(b.agents).length >= 7, '>= 7 agents in baseline');
  assert.ok(b.agents['perf-analyzer'], 'perf-analyzer must be in baseline');
  for (const [agent, vals] of Object.entries(b.agents)) {
    assert.equal(typeof vals.p50_usd, 'number', `${agent} p50_usd must be number`);
    assert.equal(typeof vals.hit_rate, 'number', `${agent} hit_rate must be number`);
    assert.equal(typeof vals.p95_ms, 'number', `${agent} p95_ms must be number`);
  }
});

test('27.6-baseline: agents/perf-analyzer.md exists and is reflector-tier', () => {
  const p = path.join(REPO_ROOT, 'agents', 'perf-analyzer.md');
  assert.ok(fs.existsSync(p), 'perf-analyzer agent must exist');
  const body = fs.readFileSync(p, 'utf8');
  assert.match(body, /name:\s*perf-analyzer/, 'name field');
  assert.match(body, /default-tier:\s*opus/, 'default-tier opus (D-04)');
  assert.match(body, /parallel-safe:\s*never/, 'parallel-safe never (reflector tier)');
  assert.match(body, /size_budget:\s*XL/, 'size_budget XL');
});

test('27.6-baseline: both PreCompact + SessionStart hooks exist', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'hooks', 'gdd-precompact-snapshot.js')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'hooks', 'gdd-sessionstart-recap.js')));
});

test('27.6-baseline: hooks.json registers PreCompact + 4-entry SessionStart', () => {
  const h = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8'));
  assert.ok(Array.isArray(h.hooks.PreCompact), 'PreCompact array required');
  assert.ok(h.hooks.PreCompact.length >= 1, '>= 1 PreCompact entry');
  assert.ok(h.hooks.PreCompact[0].hooks[0].command.includes('gdd-precompact-snapshot'));
  assert.equal(h.hooks.SessionStart.length, 4, 'SessionStart has 4 entries after Phase 27.6');
  assert.ok(h.hooks.SessionStart[3].hooks[0].command.includes('gdd-sessionstart-recap'));
});

test('27.6-baseline: reference/perf-budget.md exists with phase 27.6 frontmatter', () => {
  const p = path.join(REPO_ROOT, 'reference', 'perf-budget.md');
  assert.ok(fs.existsSync(p));
  const body = fs.readFileSync(p, 'utf8');
  assert.match(body, /name:\s*perf-budget/);
  assert.match(body, /phase:\s*27\.6/);
});

test('27.6-baseline: reference/registry.json contains perf-budget entry', () => {
  const r = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'reference', 'registry.json'), 'utf8'));
  const entry = r.entries.find(e => e.name === 'perf-budget');
  assert.ok(entry, 'perf-budget entry required');
  assert.equal(entry.phase, 27.6);
  const perfAnalyzer = r.entries.find(e => e.name === 'perf-analyzer');
  assert.equal(perfAnalyzer, undefined, 'perf-analyzer is an agent, NOT a registry entry');
});

test('27.6-baseline: agent-list + hook-list baselines updated', () => {
  const agentsP20 = fs.readFileSync(
    path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-20', 'agent-list.txt'),
    'utf8',
  ).split(/\r?\n/).filter(Boolean);
  const hooksP20 = fs.readFileSync(
    path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-20', 'hook-list.txt'),
    'utf8',
  ).split(/\r?\n/).filter(Boolean);
  assert.ok(agentsP20.includes('perf-analyzer.md'), 'perf-analyzer.md must be in phase-20 agent-list');
  assert.ok(hooksP20.includes('gdd-precompact-snapshot.js'), 'gdd-precompact-snapshot.js must be in phase-20 hook-list');
  assert.ok(hooksP20.includes('gdd-sessionstart-recap.js'), 'gdd-sessionstart-recap.js must be in phase-20 hook-list');
});

test('27.6-baseline: 4 phase 27.6 libraries all exist (perf-analyzer + cache + parallelism-engine + prompt-dedup)', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts', 'lib', 'perf-analyzer', 'index.cjs')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts', 'lib', 'cache', 'gdd-cache-manager.cjs')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts', 'lib', 'parallelism-engine', 'concurrency-tuner.cjs')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts', 'lib', 'prompt-dedup', 'index.cjs')));
});

test('27.6-baseline: snapshot-shape.txt baseline has retention + atomic write metadata', () => {
  const s = fs.readFileSync(path.join(BASELINE_DIR, 'snapshot-shape.txt'), 'utf8');
  assert.ok(s.includes('schema_version: 1.0.0'), 'schema_version present');
  assert.ok(s.includes('retention_policy: last-10 LRU'), 'retention policy documented');
  assert.ok(s.includes('atomic_write_pattern'), 'atomic write pattern documented');
  assert.ok(s.includes('harness_fallback: codex no-op'), 'Codex fallback documented (D-10)');
});

test('27.6-baseline: docs/PERF-OPTIMIZATION.md operator guide ships', () => {
  const d = path.join(REPO_ROOT, 'docs', 'PERF-OPTIMIZATION.md');
  assert.ok(fs.existsSync(d), 'PERF-OPTIMIZATION operator guide must exist');
  const body = fs.readFileSync(d, 'utf8');
  assert.ok(body.includes('perf-budget'), 'covers perf-budget');
  assert.ok(body.includes('perf-analyzer'), 'covers perf-analyzer');
  assert.ok(body.includes('PreCompact'), 'covers PreCompact');
  assert.ok(body.includes('SessionStart'), 'covers SessionStart');
  assert.ok(body.includes('CLAUDE_HARNESS'), 'covers Codex fallback');
  assert.ok(body.includes('GDD_DEDUP_OPT_OUT'), 'covers prompt-dedup opt-out');
});

test('27.6-baseline: reference/retrieval-contract.md extended with Phase 27.6 dedup section', () => {
  const f = path.join(REPO_ROOT, 'reference', 'retrieval-contract.md');
  const body = fs.readFileSync(f, 'utf8');
  assert.ok(body.includes('Phase 27.6 — Shared-Context Dedup'), 'dedup section present');
  assert.ok(body.includes('D-11'), 'D-11 cited');
  assert.ok(body.includes('GDD_DEDUP_OPT_OUT'), 'opt-out env var cited');
});
