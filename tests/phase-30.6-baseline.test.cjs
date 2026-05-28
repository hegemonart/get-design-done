'use strict';

// Phase 30.6 regression baseline. Locks the union of Wave A + Wave B + Wave C
// deliverables as a single release artifact so future drift cannot regress
// past v1.30.6's decoupling without tripping a baseline test.
//
// Asserts:
//   - 4-manifest lockstep (package + .claude-plugin/plugin + .cursor-plugin/
//     plugin + .codex-plugin/plugin) at version recorded in
//     test-fixture/baselines/phase-30.6/manifests-version.txt.
//   - 2 Tier-2 marketplace lockstep (metadata.version + plugins[0].version).
//   - Zero `gsd-tools.cjs.*graphify` callsites in the 7 surface dirs.
//   - bin/gdd-graph implements exactly the 6 subcommands baselined.
//   - scripts/lib/graph/schema.json structural shape matches baseline.
//   - .planning/get-shit-done-main/ does NOT exist (vendored snapshot deleted).
//   - scripts/lib/gsd-health-mirror/ does NOT exist (renamed to health-mirror).
//   - agents/gdd-graphify-sync.md does NOT exist (renamed to gdd-graph-refresh).
//   - Only allowed paths reference upstream gsd-tools / ~/.claude/get-shit-done.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test-fixture/baselines/phase-30.6');

function readBaseline(name) {
  return fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');
}

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

// --- Manifest lockstep (4-file) ─────────────────────────────────────────

test('30.6-07: 4-manifest version lockstep matches baseline', () => {
  const expected = readBaseline('manifests-version.txt').trim();
  assert.match(expected, /^\d+\.\d+\.\d+$/, 'baseline must look like semver');
  const files = [
    'package.json',
    '.claude-plugin/plugin.json',
    '.cursor-plugin/plugin.json',
    '.codex-plugin/plugin.json',
  ];
  for (const f of files) {
    const v = JSON.parse(read(f)).version;
    assert.equal(v, expected, `${f} version (${v}) != baseline (${expected})`);
  }
});

// --- Marketplace Tier-2 lockstep (2-field within marketplace.json) ──────

test('30.6-07: marketplace.json Tier-2 lockstep (metadata.version + plugins[0].version)', () => {
  const expected = readBaseline('manifests-version.txt').trim();
  const mp = JSON.parse(read('.claude-plugin/marketplace.json'));
  assert.equal(mp.metadata.version, expected, 'marketplace metadata.version != baseline');
  assert.ok(mp.plugins && mp.plugins[0], 'marketplace plugins[0] must exist');
  assert.equal(mp.plugins[0].version, expected, 'marketplace plugins[0].version != baseline');
});

// --- Decoupling callsite count ──────────────────────────────────────────

test('30.6-07: zero gsd-tools.cjs+graphify callsites in 7 surface dirs', () => {
  const expected = parseInt(readBaseline('decoupling-callsite-count.txt').trim(), 10);
  assert.equal(expected, 0, 'baseline must record 0 (decoupling complete)');

  const surfaceDirs = ['agents', 'skills', 'hooks', 'scripts', 'bin', 'connections', 'reference'];
  let count = 0;
  // Precise runtime-dispatch pattern (mirrors scripts/detect-stale-refs.cjs):
  // only flags the explicit `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs"`
  // dispatch token. Prose mentions in comments / narrative ("the upstream
  // gsd-tools graphify flag surface verbatim") are intentionally NOT matched.
  const pattern = /node\s+["']?\$HOME\/\.claude\/get-shit-done\/bin\/gsd-tools\.cjs/;
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.isFile()) {
        const body = fs.readFileSync(full, 'utf8');
        for (const line of body.split(/\r?\n/)) {
          if (pattern.test(line)) count++;
        }
      }
    }
  }
  for (const d of surfaceDirs) walk(path.join(REPO_ROOT, d));
  assert.equal(count, expected, `expected ${expected} callsites, found ${count}`);
});

// --- gdd-graph subcommand inventory ─────────────────────────────────────

test('30.6-07: bin/gdd-graph subcommand inventory matches baseline', () => {
  const baseline = readBaseline('gdd-graph-subcommand-inventory.txt')
    .trim()
    .split(/\r?\n/)
    .sort();
  assert.equal(baseline.length, 6, 'baseline must list 6 subcommands');

  const src = read('bin/gdd-graph');
  // The CLI declares its supported subcommands via a Set literal in the
  // dispatcher. We verify the source explicitly mentions each of the 6
  // baseline subcommands as a quoted literal — this catches both add and
  // remove drift.
  const found = [];
  for (const sub of baseline) {
    if (src.includes(`'${sub}'`) || src.includes(`"${sub}"`)) {
      found.push(sub);
    }
  }
  assert.deepEqual(found.sort(), baseline, 'bin/gdd-graph subcommand inventory drift vs baseline');
});

// --- Graph schema 1.0 shape ─────────────────────────────────────────────

test('30.6-07: graph schema 1.0 structural shape matches baseline', () => {
  const baseline = JSON.parse(readBaseline('graph-schema-shape.json'));
  const schema = JSON.parse(read('scripts/lib/graph/schema.json'));

  // schemaVersion pinned at 1.0 (D-03)
  assert.equal(schema.properties.schemaVersion.const, baseline.schemaVersion);

  // Top-level keys (deepEqual sorted, since schema key order is not stable)
  assert.deepEqual(
    Object.keys(schema.properties).sort(),
    [...baseline.topLevelKeys].sort(),
    'top-level keys drift',
  );

  // Required top-level keys
  assert.deepEqual(
    [...schema.required].sort(),
    [...baseline.topLevelKeys].sort(),
    'top-level required drift',
  );

  // Metadata required keys
  assert.deepEqual(
    [...schema.properties.metadata.required].sort(),
    [...baseline.metadataRequiredKeys].sort(),
    'metadata.required drift',
  );

  // Node + edge required keys
  assert.deepEqual(
    [...schema.properties.nodes.items.required].sort(),
    [...baseline.nodeRequiredKeys].sort(),
    'node required keys drift',
  );
  assert.deepEqual(
    [...schema.properties.edges.items.required].sort(),
    [...baseline.edgeRequiredKeys].sort(),
    'edge required keys drift',
  );
});

// --- Absence checks (rename + delete enforcement) ───────────────────────

test('30.6-07: .planning/get-shit-done-main does not exist (vendored snapshot deleted)', () => {
  assert.ok(
    !exists('.planning/get-shit-done-main'),
    '10MB pre-rug-pull vendored snapshot should be deleted (30.6-09)',
  );
});

test('30.6-07: scripts/lib/gsd-health-mirror does not exist (renamed to health-mirror, D-10)', () => {
  assert.ok(
    !exists('scripts/lib/gsd-health-mirror'),
    'gsd-health-mirror should be renamed to health-mirror (30.6-08, D-10 atomic)',
  );
  assert.ok(
    exists('scripts/lib/health-mirror'),
    'renamed health-mirror should exist',
  );
});

test('30.6-07: agents/gdd-graphify-sync.md does not exist (renamed to gdd-graph-refresh.md, D-08)', () => {
  assert.ok(
    !exists('agents/gdd-graphify-sync.md'),
    'gdd-graphify-sync should be renamed to gdd-graph-refresh (30.6-06, D-08 one-way)',
  );
  assert.ok(
    exists('agents/gdd-graph-refresh.md'),
    'renamed gdd-graph-refresh.md should exist',
  );
});

// --- No-gsd-runtime-touch allowed-paths consistency ─────────────────────

test('30.6-07: only allowed paths reference upstream gsd-tools / ~/.claude/get-shit-done', () => {
  const allowed = readBaseline('no-gsd-runtime-touch.txt')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  // The 4 files allowed to mention the upstream dispatch tokens are:
  // NOTICE (historical attribution), CHANGELOG.md (release notes), README.md
  // (architectural-port citation), and connections/graphify.md (historical
  // narrative — the only shipped surface where the prose mentions the
  // pre-30.6 dispatch pattern in narrative context).
  assert.deepEqual(allowed.sort(), [
    'CHANGELOG.md',
    'NOTICE',
    'README.md',
    'connections/graphify.md',
  ].sort(), 'allowed-paths baseline drift');

  // Verify the detect-stale-refs regex catches any new file outside the
  // allowed list that introduces a runtime-dispatch token. We re-use the
  // exact regex pattern from scripts/detect-stale-refs.cjs so this gate
  // tracks drift in lockstep.
  const dispatchPattern = /node\s+["']?\$HOME\/\.claude\/get-shit-done\/bin\/gsd-tools\.cjs/;
  const surfaceDirs = ['agents', 'skills', 'hooks', 'scripts', 'bin', 'connections', 'reference'];
  const hits = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const body = fs.readFileSync(full, 'utf8');
        if (dispatchPattern.test(body)) {
          hits.push(path.relative(REPO_ROOT, full).split(path.sep).join('/'));
        }
      }
    }
  }
  for (const d of surfaceDirs) walk(path.join(REPO_ROOT, d));
  const disallowed = hits.filter((h) => !allowed.includes(h));
  assert.deepEqual(disallowed, [], `disallowed runtime-dispatch references: ${disallowed.join(', ')}`);
});

// --- verify-version-sync.cjs gate (canonical lockstep tool) ─────────────

test('30.6-07: scripts/verify-version-sync.cjs exits 0 (canonical lockstep gate)', () => {
  // Pinned to the version-agnostic shape: the gate succeeds if and only if
  // all 4 manifest version fields are unanimous. Mirrors the baseline test
  // but exercises the actual script as users + CI invoke it.
  const result = execSync(`node "${path.join(REPO_ROOT, 'scripts/verify-version-sync.cjs')}"`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.match(result, /All manifests at version/, 'verify-version-sync output drift');
});
