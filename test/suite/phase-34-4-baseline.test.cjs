'use strict';
// Phase 34.4 — Lazyweb + Mobbin Research Connections regression baseline (recovered
// from a stranded Phase 30.5 worktree fork). Freezes the v1.34.4 release artifact:
// the two new discover-stage connection specs, the cost-aware D-01 tier order
// (Lazyweb free first, before paid Mobbin/Refero), the onboarded-14 snapshot, and
// the 6-manifest lockstep. Version-AGNOSTIC (== live) from the start so it does not
// need re-pinning every release (the 34.1/34.2 precedent). Hermetic: file reads only;
// NO network, NO MCP call, NO child_process. Every test tagged `34.4-04:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-34-4');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

// ── 1. Both connection specs exist + are real (Setup / Fallback / ToolSearch probe) ──
test('34.4-04: lazyweb + mobbin connection specs exist + carry Setup/Fallback/probe', () => {
  for (const name of ['lazyweb', 'mobbin']) {
    const body = read(`connections/${name}.md`);
    assert.ok(body.length > 800, `connections/${name}.md must be a real spec (got ${body.length} chars)`);
    assert.match(body, /##\s*Setup/i, `connections/${name}.md must document Setup`);
    assert.match(body, /Fallback chain/i, `connections/${name}.md must document the Fallback chain`);
    assert.match(body, /ToolSearch/, `connections/${name}.md must document the ToolSearch-only probe`);
  }
});

// ── 2. D-01 cost-aware tier order — Lazyweb (free) precedes paid Mobbin/Refero ───────
test('34.4-04: discover Area 5 puts Lazyweb (free) Tier 1 before paid Mobbin/Refero (D-01)', () => {
  const dcb = read('agents/design-context-builder.md');
  const t1 = dcb.indexOf('Tier 1 — Lazyweb');
  const t2 = dcb.indexOf('Tier 2 — Mobbin');
  assert.ok(t1 > 0, 'design-context-builder Area 5 must have a "Tier 1 — Lazyweb" block (free, tried first)');
  assert.ok(t2 > t1, 'Mobbin/Refero (Tier 2, paid) must come AFTER Lazyweb (Tier 1, free) — D-01 cost-aware order');
});

// ── 3. onboarded-connections snapshot == 14, each with a matching spec file ──────────
test('34.4-04: onboarded-connections snapshot is 14, each with a connections/<name>.md spec', () => {
  const names = readBaseline('onboarded-connections.txt').split('\n').map((l) => l.trim()).filter(Boolean);
  assert.equal(names.length, 14, 'phase-34-4 onboarded snapshot must list 14 connections');
  assert.ok(names.includes('lazyweb') && names.includes('mobbin'), 'snapshot must include lazyweb + mobbin');
  for (const n of names) {
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, 'connections', `${n}.md`)),
      `connections/${n}.md must exist for onboarded connection "${n}"`,
    );
  }
  assert.match(read('connections/connections.md'), /probes all 14 connections/, 'connections.md intro must say 14');
});

// ── 4. 6-manifest version lockstep (version-agnostic) ────────────────────────────────
test('34.4-04: 6-manifest version lockstep', () => {
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

// ── 5. phase-34-4 manifests-version baseline == live (forward-propped, D-09) ──────────
test('34.4-04: phase-34-4/manifests-version.txt baseline == live package version', () => {
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  const live = readJsonRel('package.json').version;
  assert.match(baseline, /^\d+\.\d+\.\d+$/, 'manifests-version.txt looks like semver');
  assert.equal(baseline, live, `phase-34-4 manifests-version.txt (${baseline}) != live package.json version (${live})`);
});

// ── 6. CHANGELOG carries the [1.34.4] release block (frozen lock on this release) ─────
test('34.4-04: CHANGELOG has a [1.34.4] block', () => {
  assert.match(read('CHANGELOG.md'), /## \[1\.34\.4\]/, 'CHANGELOG must carry a ## [1.34.4] entry');
});
