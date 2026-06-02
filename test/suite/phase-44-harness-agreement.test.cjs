'use strict';
// Phase 44 (SC#9) — the harness matrix (harnesses.json) and Phase 42's harness-configs.cjs are two views
// of one SoT; this gate fails CI on any disagreement in harness IDs or command syntax.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { readHarnesses } = require('../../scripts/lib/manifest/index.cjs');
const { CONFIGS } = require('../../scripts/lib/build/harness-configs.cjs');

const HARNESSES = readHarnesses().harnesses;

test('44-agreement-01: harness-matrix IDs match harness-configs CONFIGS IDs', () => {
  assert.deepEqual(
    HARNESSES.map((h) => h.id).sort(),
    CONFIGS.map((c) => c.id).sort(),
  );
});

test('44-agreement-02: every harness carries a capability_matrix with the required keys + valid status', () => {
  const STATUSES = new Set(['tested', 'experimental', 'untested', 'known-broken']);
  for (const h of HARNESSES) {
    const m = h.capability_matrix;
    assert.ok(m, `${h.id}: missing capability_matrix`);
    for (const k of ['command_syntax', 'install_path', 'status']) {
      assert.ok(m[k], `${h.id}.capability_matrix.${k} required`);
    }
    assert.ok(STATUSES.has(m.status), `${h.id}: invalid status ${m.status}`);
    assert.equal('last_verified' in h, true, `${h.id}: last_verified field required (may be null)`);
  }
});

test('44-agreement-03: command_syntax agrees with harness-configs command_prefix', () => {
  const byId = Object.fromEntries(CONFIGS.map((c) => [c.id, c]));
  for (const h of HARNESSES) {
    const expected = `${byId[h.id].command_prefix}<skill>`;
    assert.equal(h.capability_matrix.command_syntax, expected, `${h.id}: command_syntax drift`);
  }
});

test('44-agreement-04: install_path points at the Phase 42 bundle dir', () => {
  const byId = Object.fromEntries(CONFIGS.map((c) => [c.id, c]));
  for (const h of HARNESSES) {
    assert.equal(h.capability_matrix.install_path, `dist/${byId[h.id].bundleSlug}/${h.config_dir}/skills/`, `${h.id}: install_path drift`);
  }
});

test('44-agreement-05: status taxonomy is honest — exactly one tested (claude), 5 experimental peers', () => {
  const tested = HARNESSES.filter((h) => h.capability_matrix.status === 'tested').map((h) => h.id);
  const experimental = HARNESSES.filter((h) => h.capability_matrix.status === 'experimental').map((h) => h.id).sort();
  assert.deepEqual(tested, ['claude']);
  assert.deepEqual(experimental, ['codex', 'copilot', 'cursor', 'gemini', 'qwen']);
});
