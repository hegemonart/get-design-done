'use strict';
// Phase 38 — Outcome-Driven Adaptation static contract. Verifies the 6 outcome connections,
// the 2 ingest agents, the design --variants mode, the brief <prior-research> block, and the
// verify cross-check are wired. Hermetic: file reads only. Every test tagged `38-04:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const AB = ['launchdarkly', 'statsig', 'growthbook'];
const RESEARCH = ['usertesting', 'maze', 'hotjar'];

test('38-04: 6 outcome connections exist with the standard sections', () => {
  for (const c of [...AB, ...RESEARCH]) {
    const body = read(`connections/${c}.md`);
    assert.ok(body.length > 700, `${c}.md substantive`);
    assert.match(body, /^## Setup/m, `${c} Setup`);
    assert.match(body, /^## Availability Probe/m, `${c} Probe`);
    assert.match(body, /^## Fallback Behavior/m, `${c} Fallback`);
  }
});

test('38-04: connections index gains 6 Active outcome rows + intro 33', () => {
  const c = read('connections/connections.md');
  assert.match(c, /probes all 33 connections/, 'intro → 33');
  for (const name of ['LaunchDarkly', 'Statsig', 'GrowthBook', 'UserTesting', 'Maze', 'Hotjar']) {
    assert.match(c, new RegExp(`\\| ${name} \\| Active \\|`), `${name} Active row`);
  }
  assert.match(c, /experiment-source/, 'experiment-source descriptor');
  assert.match(c, /user-research/, 'user-research descriptor');
});

test('38-04: experiment-result-ingester folds A/B outcomes into design_arms', () => {
  const a = read('agents/experiment-result-ingester.md');
  assert.match(a, /scripts\/lib\/ds-arms\/design-arms-store\.cjs/, 'uses the design_arms store');
  assert.match(a, /observe\(/, 'calls observe()');
  assert.match(a, /experiment_result/, 'emits experiment_result event');
  assert.match(a, /read-only|never (creates|runs)/i, 'read-only (D-04)');
  assert.match(a, /no-?significant|skip/i, 'no observation on a non-significant result');
});

test('38-04: design --variants mode + design_arms posterior are documented + registered', () => {
  assert.match(read('skills/design/SKILL.md'), /--variants/, 'design SKILL has --variants');
  assert.match(read('skills/design/SKILL.md'), /design-arms-store|design_arms|posterior/, 'consults the posterior');
  const reg = JSON.parse(read('reference/registry.json'));
  assert.ok(reg.entries.some((e) => e.name === 'design-variants' && e.phase === 38), 'design-variants registered (phase 38)');
  assert.match(read('reference/design-variants.md'), /advisory|never directive|user always wins/i, 'advisory posterior (D-03)');
});

test('38-04: brief <prior-research> block + verify cross-check are wired', () => {
  assert.match(read('skills/brief/SKILL.md'), /<prior-research>/, 'brief has the <prior-research> block');
  assert.match(read('agents/design-verifier.md'), /prior-research/, 'verifier cross-checks <prior-research>');
});
