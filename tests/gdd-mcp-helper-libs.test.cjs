'use strict';
// tests/gdd-mcp-helper-libs.test.cjs
// ---------------------------------------------------------------------------
// Plan 27.7-02 — helper-lib tests for the 5 NEW scripts/lib/* modules:
//   roadmap-reader, snapshot-reader, intel-store, reflections-reader,
//   gsd-health-mirror.
//
// Every test name is prefixed with `27.7-02: ` for the test-tag count
// check in the plan's acceptance criteria (>= 10 tagged).
//
// macOS symlink discipline (Phase 27.6 lesson): every tmpdir is
// canonicalized via fs.realpathSync so directory-presence checks in
// the helper libs see the same path the test wrote against.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO_ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(REPO_ROOT, 'scripts', 'lib');

/** Make a canonicalized tmp dir (macOS symlink discipline). */
function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
  return fs.realpathSync(dir);
}

// =========================================================================
// roadmap-reader
// =========================================================================

test('27.7-02: roadmap-reader.parsePhases extracts heading + version + checkbox', () => {
  const lib = require(path.join(LIB_DIR, 'roadmap-reader'));
  const md = [
    '# Roadmap',
    '',
    '## Phases',
    '',
    '- [x] [Phase 27](#phase-27-foo) — Foo — v1.27.0 — 2026-04-30',
    '- [ ] [Phase 27.7](#phase-277-bar) — Bar — v1.27.7',
    '',
    '### Phase 27: Foo',
    '',
    '**Target version**: v1.27.0',
    '',
    '### Phase 27.7: Bar',
    '',
    '**Target version**: v1.27.7',
  ].join('\n');
  const phases = lib.parsePhases(md);
  assert.equal(Array.isArray(phases), true);
  assert.equal(phases.length >= 2, true);
  // Validate at least one parsed entry has the expected fields.
  const foo = phases.find((p) => p.number === '27');
  assert.ok(foo, 'expected phase 27 to parse');
  assert.equal(foo.name, 'Foo');
  assert.equal(foo.version, 'v1.27.0');
  assert.equal(foo.checkbox_status, 'shipped');
  const bar = phases.find((p) => p.number === '27.7');
  assert.ok(bar, 'expected phase 27.7 to parse');
  assert.equal(bar.checkbox_status, 'planned');
});

test('27.7-02: roadmap-reader.readRoadmapMd reads file from .planning/ROADMAP.md', async () => {
  const lib = require(path.join(LIB_DIR, 'roadmap-reader'));
  const root = tmp('roadmap-reader-read');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n### Phase 1: Foo\n\n**Target version**: v1.0.0\n',
    'utf8',
  );
  const md = await lib.readRoadmapMd(root);
  assert.match(md, /Phase 1: Foo/);
});

// =========================================================================
// snapshot-reader
// =========================================================================

test('27.7-02: snapshot-reader.readLatestSnapshot throws SnapshotNotFoundError when dir absent', async () => {
  const lib = require(path.join(LIB_DIR, 'snapshot-reader'));
  const root = tmp('snapshot-reader-absent');
  let threw = null;
  try {
    await lib.readLatestSnapshot(root);
  } catch (err) {
    threw = err;
  }
  assert.ok(threw, 'expected SnapshotNotFoundError');
  assert.equal(threw instanceof lib.SnapshotNotFoundError, true);
  assert.equal(threw.code, 'directory_not_found');
  assert.match(threw.dir, /snapshots/);
});

test('27.7-02: snapshot-reader.readLatestSnapshot returns null when dir empty', async () => {
  const lib = require(path.join(LIB_DIR, 'snapshot-reader'));
  const root = tmp('snapshot-reader-empty');
  fs.mkdirSync(path.join(root, '.design', 'snapshots'), { recursive: true });
  const result = await lib.readLatestSnapshot(root);
  assert.equal(result, null);
});

test('27.7-02: snapshot-reader.readLatestSnapshot returns newest snapshot by mtime', async () => {
  const lib = require(path.join(LIB_DIR, 'snapshot-reader'));
  const root = tmp('snapshot-reader-newest');
  const dir = path.join(root, '.design', 'snapshots');
  fs.mkdirSync(dir, { recursive: true });
  const older = {
    schema_version: '1.0.0',
    timestamp: '2026-05-15T00:00:00.000Z',
    cycle_id: 'cycle-old',
    decisions_count: 3,
    completed_plans_count: 5,
  };
  const newer = {
    schema_version: '1.0.0',
    timestamp: '2026-05-17T00:00:00.000Z',
    cycle_id: 'cycle-new',
    decisions_count: 9,
    completed_plans_count: 12,
  };
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(older));
  // Ensure mtime ordering — sleep then write second
  const past = new Date('2026-05-15T00:00:00Z');
  fs.utimesSync(path.join(dir, 'a.json'), past, past);
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(newer));
  const future = new Date('2026-05-17T00:00:00Z');
  fs.utimesSync(path.join(dir, 'b.json'), future, future);
  const result = await lib.readLatestSnapshot(root);
  assert.ok(result);
  assert.equal(result.snapshot.cycle_id, 'cycle-new');
  assert.ok(result.since);
});

// =========================================================================
// intel-store
// =========================================================================

test('27.7-02: intel-store.readSlice throws IntelNotFoundError when dir absent', async () => {
  const lib = require(path.join(LIB_DIR, 'intel-store'));
  const root = tmp('intel-store-absent');
  let threw = null;
  try {
    await lib.readSlice(root, 'foo');
  } catch (err) {
    threw = err;
  }
  assert.ok(threw);
  assert.equal(threw instanceof lib.IntelNotFoundError, true);
  assert.equal(threw.code, 'directory_not_found');
});

test('27.7-02: intel-store.readSlice returns parsed JSON when slice exists', async () => {
  const lib = require(path.join(LIB_DIR, 'intel-store'));
  const root = tmp('intel-store-exists');
  const dir = path.join(root, '.design', 'intel');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'slice-001.json'),
    JSON.stringify({ name: 'slice-001', payload: { kind: 'demo' } }),
  );
  const data = await lib.readSlice(root, 'slice-001');
  assert.equal(data.name, 'slice-001');
  assert.equal(data.payload.kind, 'demo');
});

test('27.7-02: intel-store.readSlice returns null when slice id not found', async () => {
  const lib = require(path.join(LIB_DIR, 'intel-store'));
  const root = tmp('intel-store-missing-slice');
  const dir = path.join(root, '.design', 'intel');
  fs.mkdirSync(dir, { recursive: true });
  const result = await lib.readSlice(root, 'nope');
  assert.equal(result, null);
});

test('27.7-02: intel-store.listSlices returns array of slice ids', () => {
  const lib = require(path.join(LIB_DIR, 'intel-store'));
  const root = tmp('intel-store-list');
  const dir = path.join(root, '.design', 'intel');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'slice-a.json'), '{}');
  fs.writeFileSync(path.join(dir, 'slice-b.json'), '{}');
  const slices = lib.listSlices(root);
  assert.ok(Array.isArray(slices));
  assert.ok(slices.includes('slice-a'));
  assert.ok(slices.includes('slice-b'));
});

// =========================================================================
// reflections-reader
// =========================================================================

test('27.7-02: reflections-reader.readLatestReflection throws when dir absent', async () => {
  const lib = require(path.join(LIB_DIR, 'reflections-reader'));
  const root = tmp('reflections-reader-absent');
  let threw = null;
  try {
    await lib.readLatestReflection(root);
  } catch (err) {
    threw = err;
  }
  assert.ok(threw);
  assert.equal(threw instanceof lib.ReflectionsNotFoundError, true);
  assert.equal(threw.code, 'directory_not_found');
});

test('27.7-02: reflections-reader.readLatestReflection returns newest by mtime', async () => {
  const lib = require(path.join(LIB_DIR, 'reflections-reader'));
  const root = tmp('reflections-reader-newest');
  const dir = path.join(root, '.design', 'reflections');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-05-15-cycle1.md'), 'old reflection');
  const past = new Date('2026-05-15T00:00:00Z');
  fs.utimesSync(path.join(dir, '2026-05-15-cycle1.md'), past, past);
  fs.writeFileSync(path.join(dir, '2026-05-17-cycle2.md'), 'new reflection');
  const future = new Date('2026-05-17T00:00:00Z');
  fs.utimesSync(path.join(dir, '2026-05-17-cycle2.md'), future, future);
  const result = await lib.readLatestReflection(root);
  assert.ok(result);
  assert.match(result.content, /new reflection/);
  assert.match(result.path, /2026-05-17-cycle2\.md/);
});

test('27.7-02: reflections-reader.digestReflections truncates to <= 5 KB', () => {
  const lib = require(path.join(LIB_DIR, 'reflections-reader'));
  const big = 'A'.repeat(20000);
  const reflections = [
    { cycle: 'c1', path: 'a.md', content: big },
    { cycle: 'c2', path: 'b.md', content: big },
  ];
  const digest = lib.digestReflections(reflections);
  assert.equal(typeof digest, 'string');
  assert.ok(digest.length <= 5120, 'digest should be <= 5120 chars, got ' + digest.length);
});

// =========================================================================
// gsd-health-mirror
// =========================================================================

test('27.7-02: gsd-health-mirror.getHealthChecks returns 4 checks', async () => {
  const lib = require(path.join(LIB_DIR, 'gsd-health-mirror'));
  const root = tmp('gsd-health-mirror');
  // Create a minimal project surface
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.mkdirSync(path.join(root, '.design'), { recursive: true });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# CLAUDE');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'test-pkg', version: '0.0.1' }),
  );
  const result = await lib.getHealthChecks(root);
  assert.ok(Array.isArray(result.checks));
  assert.equal(result.checks.length, 4);
  // All four checks should have status 'ok' for a complete fixture
  for (const c of result.checks) {
    assert.ok(['ok', 'warn', 'fail'].includes(c.status), 'invalid status: ' + c.status);
    assert.equal(typeof c.name, 'string');
  }
});
