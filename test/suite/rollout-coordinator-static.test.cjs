'use strict';
// Phase 38.5 — rollout-coordinator + /gdd:rollout-status static contract. Hermetic (D-07):
// file reads only, no live flag-service call. Every test tagged `38.5-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const AGENT = read('agents/rollout-coordinator.md');
const SKILL = read('skills/rollout-status/SKILL.md');

test('38.5-02: coordinator uses the pure classifier + reads the flag service read-only', () => {
  assert.match(AGENT, /scripts\/lib\/rollout\/rollout-status\.cjs/, 'uses rollout-status.cjs');
  assert.match(AGENT, /classifyRollout|deployedPct|isStuck/, 'calls the classifier');
  assert.match(AGENT, /read-only|never drive/i, 'read-only (D-02)');
  assert.match(AGENT, /reads-only:\s*false/, 'writes STATE/design-arms (frontmatter reads-only:false)');
});

test('38.5-02: coordinator feeds design_arms with deployed_pct weighting + verify_outcome', () => {
  assert.match(AGENT, /design-arms-store\.cjs/, 'uses the design_arms store');
  assert.match(AGENT, /deployedWeight/, 'weights by deployed %');
  assert.match(AGENT, /verify_outcome/, 'emits verify_outcome');
  assert.match(AGENT, /<rollout_status>/, 'writes the STATE block');
});

test('38.5-02: verify_outcome + rollout_* registered in the events schema seed list', () => {
  const s = read('reference/schemas/events.schema.json');
  for (const t of ['verify_outcome', 'rollout_started', 'rollout_advanced', 'rollout_stuck']) {
    assert.match(s, new RegExp(t), `events schema seeds include ${t}`);
  }
});

test('38.5-02: /gdd:rollout-status skill surfaces state + stuck, read-only', () => {
  const lines = SKILL.split('\n').length;
  assert.ok(lines <= 100, `skill ${lines} lines (<=100)`);
  assert.match(SKILL, /name:\s*gdd-rollout-status/, 'name');
  assert.match(SKILL, /--stuck/, '--stuck flag');
  assert.match(SKILL, /rollout-coordinator/, 'delegates to the coordinator');
  assert.match(SKILL, /never (advance|drive|roll back)|read-only/i, 'read-only');
  assert.match(SKILL, /##\s*ROLLOUT-STATUS COMPLETE/, 'terminator');
});

test('38.5-02: rollout-coordination reference is registered', () => {
  const reg = JSON.parse(read('reference/registry.json'));
  assert.ok(reg.entries.some((e) => e.name === 'rollout-coordination' && e.phase === 38.5), 'rollout-coordination registered (phase 38.5)');
});
