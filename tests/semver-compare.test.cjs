'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.cjs');

function parseSemver(v) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function isExactPatchBump(from, to) {
  const a = parseSemver(from);
  const b = parseSemver(to);
  return a.major === b.major &&
         a.minor === b.minor &&
         b.patch === a.patch + 1;
}

// Version sequence per roadmap: v1.0.0 → v1.0.1 → ... → v1.0.7
// Phase 12 did not ship a manifest bump in this worktree; 1.0.6 included for
// sequence continuity but the tree jumps 1.0.5 → 1.0.7 at Phase 13 closeout.
const EXPECTED_SEQUENCE = [
  '1.0.0', '1.0.1', '1.0.2', '1.0.3', '1.0.4', '1.0.5', '1.0.6', '1.0.7'
];

// Off-cadence decimal patches (CONTEXT.md D-29): four-segment versions that
// attach a sub-patch to an already-shipped 3-segment release without
// disturbing the parent cadence. These are accepted for plugin.json / marketplace.json
// but do NOT participate in the exact-patch-bump sequence check above.
//   - 1.0.7.2 → Phase 13.2 (external-authority-watcher); skips 1.0.7.1 which
//     was reserved for Phase 13.1 (Figma MCP consolidation) per ROADMAP.
//   - 1.13.3 → Phase 13.3 (plugin-update-checker); Phase 13.3 changed the
//     versioning scheme from sequential patch (1.0.x) to milestone.phase.patch
//     (1.MM.P). Off-cadence from the old 1.0.x sequence.
//   - 1.14.0 → Phase 14 (AI-native design tool connections); first mainline
//     release under the new milestone.phase.patch scheme.
//   - 1.14.1 → Security hardening patch (shell injection, CI pinning, prompt
//     injection consolidation, spend aggregation fixes).
//   - 1.14.2 → Multi-format Claude Design handoff ingestion (URL fetch, ZIP,
//     PDF, PPTX entry points; format-dispatch in synthesizer).
//   - 1.14.3 → Plugin manifest fix: drop `"./"` from skills (loader rejects
//     it as path escape) and drop redundant `hooks` pointer (auto-detected).
//   - 1.14.4 → Figma MCP: variant-agnostic probe, current canonical URL
//     (mcp.figma.com/mcp), plugin-install path, desktop-variant auto-detect.
//   - 1.14.5 → Safety + Recall Floor scaffolding (Phase 14.5 CI/test hygiene).
//   - 1.14.6 → Phase 14.5 Safety + Recall Floor (shipped on main).
//   - 1.14.7 → Phase 14.6 Test Coverage Completion closeout (shipped on main).
//   - 1.14.8 → Phase 14.7 First-Run Proof Path (/gdd:start skill, nudge hook,
//     design-start-writer agent, detect-ui-root + findings-engine helpers).
const OFF_CADENCE_VERSIONS = new Set([
  '1.0.7.2',
  '1.13.3',
  '1.14.0',
  '1.14.1',
  '1.14.2',
  '1.14.3',
  '1.14.4',
  '1.14.5',
  '1.14.6',
  '1.14.7',
  '1.14.8',
]);

test('semver-compare: consecutive versions in sequence are exact patch bumps', () => {
  for (let i = 1; i < EXPECTED_SEQUENCE.length; i++) {
    const from = EXPECTED_SEQUENCE[i - 1];
    const to = EXPECTED_SEQUENCE[i];
    assert.ok(
      isExactPatchBump(from, to),
      `Version jump from ${from} to ${to} is not an exact patch bump (+0.0.1)`
    );
  }
});

test('semver-compare: plugin.json version is in expected sequence', () => {
  const pluginJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  const accepted = EXPECTED_SEQUENCE.includes(pluginJson.version)
    || OFF_CADENCE_VERSIONS.has(pluginJson.version);
  assert.ok(
    accepted,
    `plugin.json version "${pluginJson.version}" is not in expected sequence ${EXPECTED_SEQUENCE.join(' → ')} ` +
      `and is not a recognized off-cadence version (${[...OFF_CADENCE_VERSIONS].join(', ')})`
  );
});

test('semver-compare: plugin.json and marketplace.json versions match', () => {
  const pluginJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  const marketplaceJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')
  );
  // marketplace.json stores version under metadata.version
  const marketplaceVersion = marketplaceJson.metadata
    ? marketplaceJson.metadata.version
    : marketplaceJson.version;
  assert.equal(
    pluginJson.version,
    marketplaceVersion,
    `plugin.json (${pluginJson.version}) and marketplace.json (${marketplaceVersion}) versions must match`
  );
});
