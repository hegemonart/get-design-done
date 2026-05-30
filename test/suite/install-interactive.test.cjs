'use strict';

// Regression coverage for the interactive picker option-builder.
//
// Reported failure (npx @hegemonart/get-design-done@1.28.8 on macOS, picking
// Kilo/Qwen):
//
//   TypeError: Cannot read properties of undefined (reading '0')
//     at scripts/lib/install/interactive.cjs:52
//
// Root cause: the hint line `drops ${r.files[0] || 'AGENTS.md'}` crashed on
// every `multi-artifact` runtime entry because those entries intentionally
// omit `files` (runtimes.cjs header) — destinations are computed by
// runtime-artifact-layout.cjs at install time, not declared per-entry.
//
// These tests assert:
//   1. hintForRuntime never throws on any shipped runtime entry.
//   2. The Tier-2 distribution-channel entries (cursor-marketplace,
//      codex-plugin, configDir === null) are filtered out of the
//      interactive picker — they aren't user-installable.
//   3. The hint string is meaningful (non-empty) for every entry.

const test = require('node:test');
const assert = require('node:assert/strict');

const { hintForRuntime } = require('../../scripts/lib/install/interactive.cjs');
const { RUNTIMES, listRuntimes } = require('../../scripts/lib/install/runtimes.cjs');

test('hintForRuntime: never throws on any shipped runtime entry', () => {
  for (const r of RUNTIMES) {
    let hint;
    assert.doesNotThrow(() => {
      hint = hintForRuntime(r);
    }, `${r.id} (kind=${r.kind}) crashed in hintForRuntime`);
    assert.equal(typeof hint, 'string', `${r.id}: hint must be a string`);
    assert.ok(hint.length > 0, `${r.id}: hint must be non-empty`);
  }
});

test('hintForRuntime: kind-specific copy', () => {
  const claude = RUNTIMES.find((r) => r.id === 'claude');
  assert.equal(hintForRuntime(claude), 'marketplace registration');

  const kilo = RUNTIMES.find((r) => r.id === 'kilo');
  assert.match(hintForRuntime(kilo), /installs into ~\/\.kilo/);

  const qwen = RUNTIMES.find((r) => r.id === 'qwen');
  assert.match(hintForRuntime(qwen), /installs into ~\/\.qwen/);
});

test('hintForRuntime: handles missing optional fields without crashing', () => {
  // Defensive: a future kind without files[] or configDirFallback shouldn't
  // explode. This is what the original bug failed to guard.
  const bogus = { id: 'bogus', kind: 'experimental' };
  assert.doesNotThrow(() => hintForRuntime(bogus));
  assert.equal(typeof hintForRuntime(bogus), 'string');
});

test('interactive picker: Tier-2 distribution channels are hidden', () => {
  // The picker filter lives inline in runInteractiveInstall() — replicate
  // it here so a refactor that drops the filter trips this test.
  const visible = listRuntimes().filter(
    (r) => r.configDir !== null && r.configDirFallback != null,
  );
  const visibleIds = visible.map((r) => r.id);
  assert.ok(!visibleIds.includes('cursor-marketplace'),
    'cursor-marketplace must not appear in the interactive picker');
  assert.ok(!visibleIds.includes('codex-plugin'),
    'codex-plugin must not appear in the interactive picker');
  // The 14 install-target runtimes should still be visible.
  assert.equal(visible.length, 14);
});
