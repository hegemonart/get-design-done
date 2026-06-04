'use strict';
/**
 * test/suite/state-store-backup-rotation-cap.test.cjs - H5 rotation-cap guard.
 *
 * Companion to state-store-backup-guard.test.cjs (which covers the
 * _safeBackup non-empty / refuse-to-unlink branches). That suite never
 * exercises rotateBak()'s CAP, so a regression that let .bak files grow
 * unbounded would slip through. These tests pin the cap.
 *
 * The backup machinery for the SQLite state store lives in
 * scripts/lib/state/query-surface.cjs:
 *   - rotateBak(dbPath)  shifts .bak.0..9 up by one (cap at 10 slots, 0..9)
 *   - _safeBackup(src, bak)  copies + verifies the backup is non-empty
 *   - backupCycle(opts)  rotate-then-copy the current sqlite to .bak.0
 *
 * H5 asks for two guarantees, both verified here against the existing
 * public API (no production file is modified by this test):
 *   (a) corruption detection - a zero-byte (truncated) backup is NOT trusted,
 *       so a caller never promotes/keeps an empty file as if it were data.
 *   (b) a rotation CAP - repeated backup cycles never let .bak files grow
 *       beyond 10 slots; the oldest is evicted, the newest lands at .bak.0.
 *
 * Always-on: the rotation + _safeBackup helpers are pure-fs and need no
 * better-sqlite3 binding. All writes go to an isolated mkdtemp dir so a
 * concurrent scanner of the real repo never sees these synthetic .bak files.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Repo-root walk-up (same pattern as sibling state-store tests).
// ---------------------------------------------------------------------------

function findRepoRoot() {
  let dir = path.resolve(__dirname);
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === '@hegemonart/get-design-done') return dir;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const querySurfacePath = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'query-surface.cjs');
const qs = require(querySurfacePath);

// ---------------------------------------------------------------------------
// Isolated tmpdir helpers (NEVER write into the real repo .design/).
// ---------------------------------------------------------------------------

function mkTmp(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `gdd-bak-rotcap-${label}-`));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** Enumerate the .bak.N siblings of dbPath in `dir`; return sorted numeric indices. */
function bakIndices(dir, baseName) {
  const prefix = `${baseName}.bak.`;
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith(prefix))
    .map((f) => Number.parseInt(f.slice(prefix.length), 10))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
}

/** One backup cycle: write a marker into the db, rotate, copy db -> .bak.0. */
function backupCycleOnce(dbPath, marker) {
  fs.writeFileSync(dbPath, marker);
  qs.rotateBak(dbPath);
  fs.copyFileSync(dbPath, `${dbPath}.bak.0`);
}

// ---------------------------------------------------------------------------
// Test 1: rotation cap - many cycles never exceed 10 slots (indices 0..9).
// This is the "cheap win" H5 names: backups must not grow unbounded.
// ---------------------------------------------------------------------------

test('H5: rotateBak caps backups at 10 slots no matter how many cycles run', () => {
  const dir = mkTmp('cap');
  try {
    const dbPath = path.join(dir, 'state.sqlite');
    const baseName = path.basename(dbPath);

    // Run far more cycles than the cap to prove unbounded growth is impossible.
    for (let n = 1; n <= 25; n++) backupCycleOnce(dbPath, `GEN${n}`);

    const idxs = bakIndices(dir, baseName);
    assert.equal(idxs.length, 10, `expected exactly 10 backup slots, got ${idxs.length}: ${idxs}`);
    assert.deepEqual(idxs, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'backup indices must be a contiguous 0..9');
    assert.equal(Math.max(...idxs), 9, 'no backup index may exceed 9 (cap = 10 slots)');
    assert.equal(fs.existsSync(`${dbPath}.bak.10`), false, '.bak.10 must never be created');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 2: eviction ordering - newest backup is .bak.0, oldest retained is
// .bak.9, and backups older than the cap are evicted (not silently kept).
// ---------------------------------------------------------------------------

test('H5: rotation evicts the oldest backup and keeps newest at .bak.0', () => {
  const dir = mkTmp('evict');
  try {
    const dbPath = path.join(dir, 'state.sqlite');

    // 12 cycles: GEN1..GEN12. After the cap, GEN1 and GEN2 must be gone.
    for (let n = 1; n <= 12; n++) backupCycleOnce(dbPath, `GEN${n}`);

    // Newest write (GEN12) is the freshly-copied .bak.0.
    assert.equal(fs.readFileSync(`${dbPath}.bak.0`, 'utf8'), 'GEN12', 'newest backup must be .bak.0');
    // .bak.9 is the oldest retained: GEN12 at slot0 ... GEN3 at slot9.
    assert.equal(fs.readFileSync(`${dbPath}.bak.9`, 'utf8'), 'GEN3', 'oldest retained backup must be .bak.9');

    // GEN1 / GEN2 content must not survive anywhere among the .bak slots.
    const baseName = path.basename(dbPath);
    const surviving = bakIndices(dir, baseName)
      .map((i) => fs.readFileSync(`${dbPath}.bak.${i}`, 'utf8'));
    assert.ok(!surviving.includes('GEN1'), 'evicted backup GEN1 must not survive');
    assert.ok(!surviving.includes('GEN2'), 'evicted backup GEN2 must not survive');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 3: corruption detection - a zero-byte (truncated-to-empty) backup is
// not trusted by _safeBackup, so a caller never promotes an empty file as if
// it held data. Pairs the corruption-detection branch with the rotation cap.
// ---------------------------------------------------------------------------

test('H5: _safeBackup rejects a truncated (zero-byte) backup as corrupt', () => {
  const dir = mkTmp('corrupt');
  try {
    const dbPath = path.join(dir, 'state.sqlite');
    fs.writeFileSync(dbPath, 'PRECIOUS_DB_BYTES'); // healthy non-empty source
    const bak0 = `${dbPath}.bak.0`;

    // Force copyFileSync to "succeed" but write a 0-byte (truncated) backup -
    // the corruption mode where the destination exists yet holds no data.
    const origCopy = fs.copyFileSync;
    fs.copyFileSync = function patchedCopy(_src, dst) { fs.writeFileSync(dst, ''); };
    try {
      const ok = qs._safeBackup(dbPath, bak0);
      assert.equal(ok, false, '_safeBackup must reject a zero-byte (truncated) backup');
    } finally {
      fs.copyFileSync = origCopy;
    }

    // A healthy copy of the same source is trusted (proves the guard is not
    // simply always-false - it discriminates corrupt from intact).
    const okHealthy = qs._safeBackup(dbPath, bak0);
    assert.equal(okHealthy, true, '_safeBackup must trust a faithful non-empty backup');
    assert.equal(fs.readFileSync(bak0, 'utf8'), 'PRECIOUS_DB_BYTES', 'backup must mirror source bytes');
  } finally {
    cleanup(dir);
  }
});
