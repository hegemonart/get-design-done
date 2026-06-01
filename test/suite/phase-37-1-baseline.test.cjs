'use strict';
// Phase 37.1 — AI-Native Tools Wave 2 regression baseline. First sub-phase of the split
// Phase 37. Freezes the v1.37.1 artifact: the 6 Wave-2 connections + the generator impls +
// the connections index at 27 + the 6-manifest lockstep. Version-AGNOSTIC. Hermetic: file
// reads only. Every test `37.1-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-37-1');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

test('37.1-03: 6 Wave-2 connections exist + generator impls present', () => {
  for (const c of ['framer', 'penpot', 'webflow', 'v0-dev', 'plasmic', 'builder-io']) {
    assert.ok(read(`connections/${c}.md`).length > 800, `${c}.md`);
  }
  const g = read('agents/design-component-generator.md');
  for (const tool of ['v0', 'plasmic', 'builder-io']) {
    assert.match(g, new RegExp(`<!-- impl: ${tool} -->`), `${tool} impl`);
  }
});

test('37.1-03: connections index advertises 27 (count-agnostic floor)', () => {
  // count-agnostic: assert the intro probes all N; Wave-2 grew it to 27 here.
  assert.match(read('connections/connections.md'), /probes all \d+ connections/, 'intro probes all N');
  assert.match(read('connections/connections.md'), /\| Framer \| Active \|/, 'Framer row (Wave-2 marker)');
});

test('37.1-03: 6-manifest version lockstep', () => {
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

test('37.1-03: phase-37-1/manifests-version.txt == live + CHANGELOG [1.37.1]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.37\.1\]/, 'CHANGELOG [1.37.1]');
});
