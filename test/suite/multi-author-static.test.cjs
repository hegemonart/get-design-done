'use strict';
// Phase 40 — multi-author static contract. Verifies the contract doc (registered), the two agents,
// the two skills, the config-schema keys, and the reflector/pr-commenter team-mode notes. Plus the
// SC#10 permission CI-gate assertion (the gate calls permissions.can). Hermetic. Every test `40-05:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('40-05: multi-author-model.md has the required sections + is registered', () => {
  const body = read('reference/multi-author-model.md');
  assert.ok(body.length > 2500, 'substantive contract');
  for (const re of [/git-merge-driver/i, /[Aa]ttribution/, /review queue/i, /lock/i, /[Pp]ermission/, /sectional handoff/i, /sync/i]) {
    assert.match(body, re, `contract covers ${re}`);
  }
  const reg = JSON.parse(read('reference/registry.json'));
  const e = reg.entries.find((x) => x.name === 'multi-author-model');
  assert.ok(e, 'multi-author-model registered');
  assert.equal(e.path, 'reference/multi-author-model.md');
  assert.equal(e.phase, 40);
});

test('40-05: conflict-resolver + decision-journal-exporter agents wire the cores', () => {
  const cr = read('agents/conflict-resolver.md');
  assert.match(cr, /^name:\s*conflict-resolver/m);
  assert.match(cr, /section-merge\.cjs/, 'uses the merge core');
  assert.match(cr, /per[- ]section/i);
  assert.match(cr, /## Record/, 'record-contract');
  const je = read('agents/decision-journal-exporter.md');
  assert.match(je, /^name:\s*decision-journal-exporter/m);
  assert.match(je, /pseudonymize\.cjs/, 'redacts before publish');
  assert.match(je, /notion/i, 'write-only Notion');
  assert.match(je, /## Record/, 'record-contract');
});

test('40-05: /hone:review-decisions + /hone:unlock-decision skills exist with correct frontmatter', () => {
  const rd = read('skills/review-decisions/SKILL.md');
  assert.match(rd, /^name:\s*hone-review-decisions/m);
  assert.match(rd, /^user-invocable:\s*true/m);
  assert.match(rd, /review-queue\.cjs/);
  const ud = read('skills/unlock-decision/SKILL.md');
  assert.match(ud, /^name:\s*hone-unlock-decision/m);
  assert.match(ud, /approver/i, 'requires an approver');
  assert.match(ud, /audit/i, 'writes an audit entry');
});

test('40-05: config.schema gains gdd_cycle_mode + permissions + collab', () => {
  const schema = JSON.parse(read('reference/schemas/config.schema.json'));
  assert.deepEqual(schema.properties.gdd_cycle_mode.enum, ['designer', 'dev', 'full']);
  assert.ok(schema.properties.permissions, 'permissions defined');
  assert.ok(schema.properties.collab.properties.multi_writer_enabled, 'collab.multi_writer_enabled');
  assert.ok(schema.properties.collab.properties.sync_backend, 'collab.sync_backend');
});

test('40-05: reflector + pr-commenter carry the team-mode notes', () => {
  assert.match(read('agents/design-reflector.md'), /[Pp]er-author patterns/, 'reflector attribution note (SC#5)');
  assert.match(read('agents/pr-commenter.md'), /[Dd]ecision threading/, 'pr-commenter D-XX threading (SC#3)');
});

test('40-05: SC#10 permission gate — permissions.can() is the enforceable predicate', () => {
  // The CI gate enforces the permission model by calling can(); assert the contract holds so a PR
  // gate built on it behaves: a restricted action is denied for a non-privileged role.
  const { can } = require(path.resolve(REPO_ROOT, 'scripts/lib/collab/permissions.cjs'));
  const cfg = { permissions: { default: 'contributor', rules: [{ section: 'decisions', action: 'lock', roles: ['owner'] }] } };
  assert.equal(can(cfg, '@contributor', 'decisions', 'lock'), false, 'gate denies a contributor locking');
  assert.equal(can(cfg, '@owner-actor', 'status', 'write'), true, 'gate allows unrestricted writes');
});
