'use strict';
// Phase 35.1 — Team Surfaces: PR Inline Integration regression baseline. Freezes the
// v1.35.1 release artifact: the pr-commenter agent + the PR-inline contract reference
// (registered), the ship wiring, and the 6-manifest lockstep. Version-AGNOSTIC (== live)
// so it needs no re-pinning each release (the 34.x precedent). Hermetic: file reads only;
// NO network, NO gh, NO child_process. Every test tagged `35.1-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-35-1');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

// ── 1. The PR-inline deliverables exist + the reference is registered ────────────────
test('35.1-02: pr-commenter agent + pr-review-integration reference exist + registered', () => {
  assert.ok(read('agents/pr-commenter.md').length > 800, 'agents/pr-commenter.md must be a real agent');
  assert.ok(read('reference/pr-review-integration.md').length > 800, 'reference/pr-review-integration.md must be a real spec');
  const reg = readJsonRel('reference/registry.json');
  const entries = reg.references || reg.entries || (Array.isArray(reg) ? reg : []);
  const hit = JSON.stringify(reg).includes('pr-review-integration');
  assert.ok(hit, 'reference/registry.json must register pr-review-integration (reference-registry round-trip)');
});

// ── 2. Ship wiring — pr-commenter spawned after PR create, degrade-to-noop ────────────
test('35.1-02: /hone:ship wires pr-commenter (post-create, degrade-to-noop)', () => {
  const ship = read('skills/ship/SKILL.md');
  assert.match(ship, /pr-commenter/, 'ship SKILL references pr-commenter');
  assert.match(ship, /degrade|noop/i, 'degrade-to-noop posture present');
});

// ── 3. 6-manifest version lockstep (version-agnostic) ────────────────────────────────
test('35.1-02: 6-manifest version lockstep', () => {
  const pkg = readJsonRel('package.json').version;
  assert.match(pkg, /^\d+\.\d+\.\d+$/, 'package.json version looks like semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkg, `${f} version != package.json version`);
  }
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkg, 'marketplace metadata.version != package version');
  assert.ok(mp.plugins && mp.plugins[0], 'marketplace plugins[0] exists');
  assert.equal(mp.plugins[0].version, pkg, 'marketplace plugins[0].version != package version');
  const lock = readJsonRel('package-lock.json');
  assert.equal(lock.version, pkg, 'package-lock.json root version != package version');
  if (lock.packages && lock.packages['']) {
    assert.equal(lock.packages[''].version, pkg, 'package-lock.json packages."" version != package version');
  }
});

// ── 4. phase-35-1 manifests-version baseline == live (forward-propped, D-09) ──────────
test('35.1-02: phase-35-1/manifests-version.txt baseline == live package version', () => {
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  const live = readJsonRel('package.json').version;
  assert.match(baseline, /^\d+\.\d+\.\d+$/, 'manifests-version.txt looks like semver');
  assert.equal(baseline, live, `phase-35-1 manifests-version.txt (${baseline}) != live package.json version (${live})`);
});

// ── 5. CHANGELOG carries the [1.35.1] release block (frozen lock on this release) ─────
test('35.1-02: CHANGELOG has a [1.35.1] block', () => {
  assert.match(read('CHANGELOG.md'), /## \[1\.35\.1\]/, 'CHANGELOG must carry a ## [1.35.1] entry');
});
