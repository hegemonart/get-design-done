'use strict';
// test/suite/npm-tarball-contents.test.cjs
// ---------------------------------------------------------------------------
// Plan 31-5-08 (TARBALL-01 / SC#6 / SC#7 / D-07 / D-09 / D-10 / D-14 / D-15)
// Golden tarball-contents diff test.
//
// Runs `npm pack --dry-run --json`, normalizes the result to a sorted list of
// file PATHS ONLY (no sizes/checksums — D-07), and diffs that against the
// golden manifest at test/fixtures/baselines/phase-31-5/tarball-manifest.txt.
// FAILS on ANY addition or removal (SC#7) so layout drift can never slip into
// a published package unnoticed.
//
// Additionally pins the D-09 keep-runtime-subtrees guarantee explicitly (not
// just via the golden snapshot):
//   - MUST-SHIP: scripts/lib/graph/, scripts/lib/figma-extract/, sdk/,
//                recipes/.gitkeep, docs/i18n/, NOTICE
//   - MUST-NOT-SHIP: scripts/release-smoke-test.cjs, scripts/verify-version-sync.cjs,
//                    scripts/e2e/*, scripts/tests/*
//
// All tests carry the `31-5-08:` tag.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
// `npm pack --dry-run` still runs prepack/postpack (build:sdk + --clean), so this
// test both mutates AND reads the shared sdk/cli/index.js artifact. Serialize it
// against the other parallel pack tests. See test/helpers/sdk-pack-lock.cjs.
const { withPackLock } = require('../helpers/sdk-pack-lock.cjs');

const REPO_ROOT = path.resolve(__dirname, '../..');
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  'test',
  'fixtures',
  'baselines',
  'phase-31-5',
  'tarball-manifest.txt',
);

// npm pack can take a few seconds (it walks the tree + computes a tarball).
const PACK_TIMEOUT_MS = 120000;

/**
 * Run `npm pack --dry-run --json` and return the sorted list of file paths
 * (forward-slashed, paths only). npm prints progress/notice to stderr; the
 * JSON document is on stdout. The document is an array of pack results; we use
 * the first (this repo publishes a single package).
 */
function packPaths() {
  const stdout = withPackLock(() =>
    execSync('npm pack --dry-run --json', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: PACK_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  const parsed = JSON.parse(stdout);
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  assert.ok(
    result && Array.isArray(result.files),
    '31-5-08: npm pack --dry-run --json did not return a files[] array',
  );
  return result.files
    .map((f) => String(f.path).replace(/\\/g, '/'))
    .sort();
}

/** Read the golden manifest as a sorted list of paths (LF, trailing-newline tolerant). */
function goldenPaths() {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return raw
    .split('\n')
    .map((l) => l.replace(/\r$/, '').trim())
    .filter(Boolean)
    .sort();
}

test('31-5-08: tarball contents match the golden manifest (fail on any add/remove)', () => {
  const actual = packPaths();
  const golden = goldenPaths();

  const goldenSet = new Set(golden);
  const actualSet = new Set(actual);
  const added = actual.filter((p) => !goldenSet.has(p));
  const removed = golden.filter((p) => !actualSet.has(p));

  const detail = [];
  if (added.length) {
    detail.push(`ADDED (in tarball, not in golden):\n  ${added.join('\n  ')}`);
  }
  if (removed.length) {
    detail.push(`REMOVED (in golden, not in tarball):\n  ${removed.join('\n  ')}`);
  }

  assert.deepEqual(
    actual,
    golden,
    `31-5-08: npm tarball contents drifted from the golden manifest.\n` +
      `If this change is intentional, regenerate the golden:\n` +
      `  npm pack --dry-run --json -> sort paths -> ${path.relative(REPO_ROOT, MANIFEST_PATH)}\n\n` +
      detail.join('\n\n'),
  );
});

test('31-5-08: must-ship runtime subtrees are present (D-09/D-14/D-15)', () => {
  const actual = packPaths();
  const hasPrefix = (prefix) => actual.some((p) => p.startsWith(prefix));
  const hasExact = (p) => actual.includes(p);

  // D-14: hone-graph runtime.
  assert.ok(
    hasPrefix('scripts/lib/graph/'),
    '31-5-08: tarball must include scripts/lib/graph/** (hone-graph runtime, D-14)',
  );
  // D-15: figma-extract SKILL runtime.
  assert.ok(
    hasPrefix('scripts/lib/figma-extract/'),
    '31-5-08: tarball must include scripts/lib/figma-extract/** (figma-extract SKILL, D-15)',
  );
  // The 31.5 deprecation shims (scripts/mcp-servers/ + the scripts/lib/ shims)
  // were REMOVED in v1.33.0 (Phase 33, D-04 — grace window 1.31.5 -> 1.32.0
  // elapsed). They must NO LONGER ship; their absence is asserted by
  // test/suite/phase-33-shims-removed.test.cjs.
  assert.ok(
    !hasPrefix('scripts/mcp-servers/'),
    '31-5-08: tarball must NOT include scripts/mcp-servers/** (31.5 shims removed in v1.33.0, D-04)',
  );
  // The new SDK.
  assert.ok(
    hasPrefix('sdk/'),
    '31-5-08: tarball must include sdk/** (the new SDK)',
  );
  assert.ok(
    hasExact('sdk/index.ts'),
    '31-5-08: tarball must include sdk/index.ts (the SDK barrel)',
  );
  // 31-5-9.5 (D-16): the 3 esbuild-compiled SDK-bin entry .js MUST ship so a
  // fresh `npm install` has runnable bins (raw .ts cannot run under
  // --experimental-strip-types from inside node_modules). prepack compiles them
  // before pack; this asserts they actually land in the tarball.
  for (const compiledEntry of [
    'sdk/cli/index.js',
    'sdk/mcp/hone-state/server.js',
    'sdk/mcp/hone-mcp/server.js',
  ]) {
    assert.ok(
      hasExact(compiledEntry),
      `31-5-08: tarball must include ${compiledEntry} (compiled SDK bin, 31-5-9.5/D-16 — prepack output)`,
    );
  }
  // recipes/ scaffold ships (empty of recipes, .gitkeep present).
  assert.ok(
    hasExact('recipes/.gitkeep'),
    '31-5-08: tarball must include recipes/.gitkeep (scaffold)',
  );
  // README translations relocated to docs/i18n/ (D-11).
  assert.ok(
    hasPrefix('docs/i18n/'),
    '31-5-08: tarball must include docs/i18n/** (README translations, D-11)',
  );
  // NOTICE attributions (newly added to files).
  assert.ok(
    hasExact('NOTICE'),
    '31-5-08: tarball must include NOTICE (third-party attributions)',
  );
  // bin trampolines.
  assert.ok(
    hasPrefix('bin/'),
    '31-5-08: tarball must include bin/** (bin trampolines)',
  );
});

test('31-5-08: must-NOT-ship maintainer-only files are absent (D-09)', () => {
  const actual = packPaths();
  const startsWithAny = (prefix) => actual.filter((p) => p.startsWith(prefix));

  assert.ok(
    !actual.includes('scripts/release-smoke-test.cjs'),
    '31-5-08: tarball must NOT include scripts/release-smoke-test.cjs (maintainer-only)',
  );
  assert.ok(
    !actual.includes('scripts/verify-version-sync.cjs'),
    '31-5-08: tarball must NOT include scripts/verify-version-sync.cjs (maintainer-only)',
  );
  // scripts/bootstrap.sh was replaced by scripts/bootstrap.cjs in the Windows
  // hooks port — the .cjs is a runtime artifact and MUST ship; the .sh is gone.
  assert.ok(
    actual.includes('scripts/bootstrap.cjs'),
    'tarball MUST include scripts/bootstrap.cjs (called from hooks/hooks.json SessionStart)',
  );
  const e2e = startsWithAny('scripts/e2e/');
  assert.equal(
    e2e.length,
    0,
    `31-5-08: tarball must NOT include scripts/e2e/** (maintainer harness); found: ${e2e.join(', ')}`,
  );
  const scriptTests = startsWithAny('scripts/tests/');
  assert.equal(
    scriptTests.length,
    0,
    `31-5-08: tarball must NOT include scripts/tests/** (maintainer harness); found: ${scriptTests.join(', ')}`,
  );
  // Repo/dev/private content that never belonged in the tarball.
  const testTree = startsWithAny('test/');
  assert.equal(
    testTree.length,
    0,
    `31-5-08: tarball must NOT include test/** (test suite + fixtures); found: ${testTree.slice(0, 5).join(', ')}`,
  );
  const planning = startsWithAny('.planning/');
  assert.equal(
    planning.length,
    0,
    `31-5-08: tarball must NOT include .planning/** (private planning); found: ${planning.slice(0, 5).join(', ')}`,
  );
  // No maintainer .ts tooling sitting directly under scripts/.
  const topLevelTs = actual.filter((p) => /^scripts\/[^/]+\.ts$/.test(p));
  assert.equal(
    topLevelTs.length,
    0,
    `31-5-08: tarball must NOT include top-level scripts/*.ts maintainer tooling; found: ${topLevelTs.join(', ')}`,
  );
});
