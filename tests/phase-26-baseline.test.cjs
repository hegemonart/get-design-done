'use strict';

// tests/phase-26-baseline.test.cjs — Phase 26 regression baseline.
//
// Same shape as tests/phase-25-baseline.test.cjs. Asserts the nine plans
// that ship in Phase 26 (per CONTEXT.md) all landed:
//
//   1. Per-runtime tier→model adapter (Plan 26-01)
//   2. tier-resolver + runtime-detect            (Plan 26-02)
//   3. Installer models.json emission            (Plan 26-03)
//   4. Router resolved_models field              (Plan 26-04)
//   5. Budget-enforcer + per-runtime prices      (Plan 26-05)
//   6. Reflector cross-runtime cost-arbitrage    (Plan 26-06)
//   7. reasoning-class frontmatter alias         (Plan 26-07)
//   8. Frontmatter validator + intel-updater     (Plan 26-08)
//   9. Closeout (this commit)                    (Plan 26-09)
//
// Plus the manifest alignment + CHANGELOG block that bookends the phase
// (D-12).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

// --- Manifest alignment (D-12) -----------------------------------------

test('phase-26 baseline: all 4 manifests aligned on current version (Phase 27 D-12 — version-agnostic)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const v = pkg.version;
  assert.match(v, /^\d+\.\d+\.\d+/, 'package.json version must be a valid semver');
  assert.equal(plugin.version, v, 'plugin.json must agree with package.json');
  assert.equal(market.metadata.version, v, 'marketplace.json metadata.version must agree with package.json');
  assert.equal(market.plugins[0].version, v, 'marketplace.json plugins[0].version must agree with package.json');
});

test('phase-26 baseline: CHANGELOG.md has a [1.26.0] block', () => {
  const changelog = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(
    changelog,
    /## \[1\.26\.0\]/,
    'CHANGELOG.md must contain a "## [1.26.0]" version block',
  );
});

// --- Sub-feature 1: Per-runtime tier→model adapter (Plan 26-01) --------

test('phase-26 baseline: reference/runtime-models.md exists', () => {
  const target = path.join(REPO_ROOT, 'reference', 'runtime-models.md');
  assert.ok(fs.existsSync(target), 'Plan 26-01 must ship reference/runtime-models.md');
});

test('phase-26 baseline: reference/prices/ has the 14 sub-tables (D-08)', () => {
  const dir = path.join(REPO_ROOT, 'reference', 'prices');
  assert.ok(fs.existsSync(dir), 'reference/prices/ directory must exist');
  // Cross-check against runtimes.cjs canonical list.
  const { RUNTIMES } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'install', 'runtimes.cjs'));
  for (const r of RUNTIMES) {
    const target = path.join(dir, `${r.id}.md`);
    assert.ok(fs.existsSync(target), `reference/prices/${r.id}.md must exist (D-08)`);
  }
});

// --- Sub-feature 2: tier-resolver + runtime-detect (Plan 26-02) --------

test('phase-26 baseline: scripts/lib/tier-resolver.cjs exposes resolve()', () => {
  const mod = require(path.join(REPO_ROOT, 'scripts', 'lib', 'tier-resolver.cjs'));
  assert.equal(typeof mod.resolve, 'function', 'tier-resolver.cjs must export resolve()');
});

test('phase-26 baseline: scripts/lib/runtime-detect.cjs exposes detect()', () => {
  const mod = require(path.join(REPO_ROOT, 'scripts', 'lib', 'runtime-detect.cjs'));
  assert.equal(typeof mod.detect, 'function', 'runtime-detect.cjs must export detect()');
});

// --- Sub-feature 5: Budget-enforcer (Plan 26-05) -----------------------

test('phase-26 baseline: scripts/lib/budget-enforcer.cjs exists', () => {
  const target = path.join(REPO_ROOT, 'scripts', 'lib', 'budget-enforcer.cjs');
  assert.ok(fs.existsSync(target), 'Plan 26-05 must ship scripts/lib/budget-enforcer.cjs');
  const mod = require(target);
  assert.equal(typeof mod.computeCost, 'function', 'budget-enforcer.cjs must export computeCost()');
});

// --- Sub-feature 6: Reflector cross-runtime cost-arbitrage (Plan 26-06) -

test('phase-26 baseline: scripts/lib/cost-arbitrage.cjs exists', () => {
  const target = path.join(REPO_ROOT, 'scripts', 'lib', 'cost-arbitrage.cjs');
  assert.ok(fs.existsSync(target), 'Plan 26-06 must ship scripts/lib/cost-arbitrage.cjs');
});

// --- Sub-feature 4: Router resolved_models (Plan 26-04) ----------------

test('phase-26 baseline: skills/router/SKILL.md mentions resolved_models', () => {
  const skill = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'router', 'SKILL.md'), 'utf8');
  assert.match(skill, /resolved_models/, 'router must document resolved_models (Plan 26-04)');
});

// --- Sub-feature 7: reasoning-class alias (Plan 26-07) -----------------

test('phase-26 baseline: agents/README.md documents reasoning-class', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'agents', 'README.md'), 'utf8');
  assert.match(
    readme,
    /reasoning-class/,
    'agents/README.md must document reasoning-class (Plan 26-07)',
  );
});

// --- Sub-feature 8: Frontmatter validator + intel-updater (Plan 26-08) -

test('phase-26 baseline: scripts/validate-frontmatter.ts knows about reasoning-class', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'validate-frontmatter.ts'),
    'utf8',
  );
  assert.match(
    src,
    /reasoning-class/,
    'validate-frontmatter.ts must reference reasoning-class (Plan 26-08)',
  );
});
