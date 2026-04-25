'use strict';

// Phase 24 regression baseline. Asserts:
//   - All 14 runtimes shipped.
//   - install lib modules export their advertised surface.
//   - 3 manifests + semver-compare expected sequence agree on 1.24.1.
//   - The runtimes baseline file at test-fixture/baselines/phase-24/runtimes.txt
//     matches the runtimes module exactly.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

test('phase-24 baseline: package.json is at 1.24.1', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '1.24.1');
});

test('phase-24 baseline: plugin.json is at 1.24.1', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(plugin.version, '1.24.1');
});

test('phase-24 baseline: marketplace.json is at 1.24.1 in both slots', () => {
  const market = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(market.metadata.version, '1.24.1');
  assert.equal(market.plugins[0].version, '1.24.1');
});

test('phase-24 baseline: @clack/prompts is a runtime dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@clack/prompts'], '@clack/prompts must be in dependencies');
});

test('phase-24 baseline: install lib exports stable surface', () => {
  const runtimes = require('../scripts/lib/install/runtimes.cjs');
  const configDir = require('../scripts/lib/install/config-dir.cjs');
  const merge = require('../scripts/lib/install/merge.cjs');
  const installer = require('../scripts/lib/install/installer.cjs');

  const expectRuntimes = ['RUNTIMES', 'REPO', 'MARKETPLACE_NAME', 'PLUGIN_NAME', 'getRuntime', 'listRuntimes', 'listRuntimeIds'];
  for (const k of expectRuntimes) assert.ok(k in runtimes, `runtimes export missing: ${k}`);

  const expectConfigDir = ['resolveConfigDir', 'resolveAllConfigDirs'];
  for (const k of expectConfigDir) assert.ok(k in configDir, `config-dir export missing: ${k}`);

  const expectMerge = ['mergeClaudeSettings', 'removeClaudeSettings', 'agentsFileFingerprint', 'buildAgentsFileContent', 'isPluginOwned', 'PLUGIN_FINGERPRINT'];
  for (const k of expectMerge) assert.ok(k in merge, `merge export missing: ${k}`);

  const expectInstaller = ['installRuntime', 'uninstallRuntime', 'detectInstalled'];
  for (const k of expectInstaller) assert.ok(k in installer, `installer export missing: ${k}`);
});

test('phase-24 baseline: 14 runtimes shipped', () => {
  const { RUNTIMES } = require('../scripts/lib/install/runtimes.cjs');
  assert.equal(RUNTIMES.length, 14);
});

test('phase-24 baseline: runtimes.txt baseline matches module exactly', () => {
  const { listRuntimeIds } = require('../scripts/lib/install/runtimes.cjs');
  const baselinePath = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-24', 'runtimes.txt');
  const baseline = fs.readFileSync(baselinePath, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const sorted = [...listRuntimeIds()].sort();
  assert.deepEqual(sorted, baseline);
});

test('phase-24 baseline: scripts/install.cjs is the entrypoint and exists', () => {
  const target = path.join(REPO_ROOT, 'scripts', 'install.cjs');
  assert.ok(fs.existsSync(target));
  const content = fs.readFileSync(target, 'utf8');
  // Strict check that the rewrite landed (not the v1.23.5 shape).
  assert.ok(content.includes('lib/install/installer.cjs'), 'install.cjs must route via lib/install/installer.cjs');
  assert.ok(content.includes('Multi-runtime installer'), 'install.cjs must announce itself as multi-runtime');
});
