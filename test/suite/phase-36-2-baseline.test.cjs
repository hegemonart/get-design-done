'use strict';
// Phase 36.2 — Motion-Tool Verification regression baseline. Second sub-phase of the split
// Phase 36. Freezes the v1.36.2 artifact: the pure validate-motion helper, the lottie/rive
// connections, the motion-verifier agent + its design-verifier Phase 4E hook, and the
// 6-manifest lockstep. Version-AGNOSTIC. Hermetic: file reads only. Every test tagged `36.2-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-36-2');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

test('36.2-03: motion deliverables exist + validator is pure', () => {
  const v = read('scripts/lib/motion/validate-motion.cjs');
  assert.ok(v.includes('module.exports'), 'validate-motion.cjs');
  assert.doesNotMatch(v, /\brequire\s*\(/, 'validate-motion.cjs is dep-free');
  assert.ok(read('connections/lottie.md').length > 600, 'connections/lottie.md');
  assert.ok(read('connections/rive.md').length > 600, 'connections/rive.md');
  assert.ok(read('agents/motion-verifier.md').length > 800, 'agents/motion-verifier.md');
});

test('36.2-03: connections.md gains lottie/rive rows (count-agnostic intro)', () => {
  const c = read('connections/connections.md');
  // count-agnostic: later phases grow the onboarded count — freeze the lottie/rive rows, not the number.
  assert.match(c, /probes all \d+ connections/, 'intro probes all N connections');
  assert.match(c, /\| Lottie \| Active \|/, 'Lottie Active row');
  assert.match(c, /\| Rive \| Active \|/, 'Rive Active row');
});

test('36.2-03: design-verifier delegates motion (Phase 4E) + WARN-never-block', () => {
  const v = read('agents/design-verifier.md');
  assert.match(v, /motion-verifier/, 'verifier delegates to motion-verifier');
  const a = read('agents/motion-verifier.md');
  assert.match(a, /never block/i, 'motion-verifier WARNs, never blocks');
});

test('36.2-03: 6-manifest version lockstep', () => {
  const pkg = readJsonRel('package.json').version;
  assert.match(pkg, /^\d+\.\d+\.\d+$/, 'semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkg, `${f}`);
  }
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkg, 'marketplace metadata.version');
  assert.equal(mp.plugins[0].version, pkg, 'marketplace plugins[0].version');
  const lock = readJsonRel('package-lock.json');
  assert.equal(lock.version, pkg, 'package-lock root');
  if (lock.packages && lock.packages['']) assert.equal(lock.packages[''].version, pkg, 'package-lock packages.""');
});

test('36.2-03: phase-36-2/manifests-version.txt == live + CHANGELOG [1.36.2]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.36\.2\]/, 'CHANGELOG [1.36.2]');
});
