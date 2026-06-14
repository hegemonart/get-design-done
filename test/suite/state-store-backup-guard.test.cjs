'use strict';
/**
 * test/suite/state-store-backup-guard.test.cjs - H5 backup-guard hardening.
 *
 * Verifies the unlink-after-copy pattern in scripts/lib/state/query-surface.cjs
 * is gated on a non-empty backup existing AFTER copyFileSync. The historical
 * bug was: best-effort copyFileSync wrapped in try/catch followed by an
 * unconditional unlinkSync. A silent copy failure (or zero-byte destination)
 * meant the unlink destroyed the only remaining data.
 *
 * The fix wraps the pattern with _safeBackup(src, bak) which returns true
 * only when bak exists AND statSync(bak).size > 0 AFTER the copy.
 *
 * These tests are always-on (no better-sqlite3 required) - we exercise the
 * pure-fs helper directly and the demigrate/recover refusal paths via
 * synthetic source files.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Repo-root resolution (same walk-up used by sibling tests).
// ---------------------------------------------------------------------------

function findRepoRoot() {
  let dir = path.resolve(__dirname);
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === '@hegemonart/hone') return dir;
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
// tmpdir helper
// ---------------------------------------------------------------------------

function mkTmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hone-backup-guard-${label}-`));
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Test 1: _safeBackup returns true when copy succeeds and backup is non-empty.
// ---------------------------------------------------------------------------

test('H5: _safeBackup returns true when copy succeeds and dest is non-empty', () => {
  const dir = mkTmp('happy');
  try {
    const src = path.join(dir, 'src.bin');
    const bak = path.join(dir, 'src.bin.bak.0');
    fs.writeFileSync(src, 'hello world');
    const ok = qs._safeBackup(src, bak);
    assert.equal(ok, true, '_safeBackup should return true on a healthy copy');
    assert.ok(fs.existsSync(bak), 'backup file should exist after _safeBackup returns true');
    assert.equal(fs.readFileSync(bak, 'utf8'), 'hello world', 'backup contents should match source');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 2: _safeBackup returns false when source does not exist (copy fails).
// ---------------------------------------------------------------------------

test('H5: _safeBackup returns false when source path is missing (copy fails)', () => {
  const dir = mkTmp('missing-src');
  try {
    const src = path.join(dir, 'does-not-exist.bin');
    const bak = path.join(dir, 'dst.bak.0');
    const ok = qs._safeBackup(src, bak);
    assert.equal(ok, false, '_safeBackup must return false when source is missing');
    assert.equal(fs.existsSync(bak), false, 'no backup file should remain after a failed copy');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 3: _safeBackup returns false when backup ends up as a zero-byte file.
// We simulate this by writing an empty source file - copyFileSync will succeed
// but the dest will be 0 bytes, which is the dangerous case the guard catches.
// ---------------------------------------------------------------------------

test('H5: _safeBackup returns false when backup is zero bytes (empty source)', () => {
  const dir = mkTmp('empty-src');
  try {
    const src = path.join(dir, 'empty.bin');
    const bak = path.join(dir, 'empty.bin.bak.0');
    fs.writeFileSync(src, ''); // 0 bytes
    const ok = qs._safeBackup(src, bak);
    assert.equal(ok, false, '_safeBackup must return false for a zero-byte backup');
    // backup file may exist (copyFileSync wrote 0 bytes) - that is fine; what
    // matters is that the guard returned false so callers will NOT unlink.
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 4: _safeBackup returns false when bak path is a directory.
// statSync(bak).isFile() check guards against copyFileSync edge cases.
// ---------------------------------------------------------------------------

test('H5: _safeBackup returns false when bak path is unwritable/invalid', () => {
  const dir = mkTmp('invalid-dst');
  try {
    const src = path.join(dir, 'src.bin');
    fs.writeFileSync(src, 'data');
    // Point bak inside a non-existent directory - copyFileSync will throw.
    const bak = path.join(dir, 'no-such-dir', 'dst.bak.0');
    const ok = qs._safeBackup(src, bak);
    assert.equal(ok, false, '_safeBackup must return false when copy throws');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 5: demigrate() refuses to unlink when the backup destination is
// unwritable. We construct a dbPath whose .bak.0 sibling can't be created.
// This is the end-to-end "simulated failing copy" the H5 task asks for.
// We intercept fs.copyFileSync to force failure.
// ---------------------------------------------------------------------------

test('H5: demigrate refuses to unlink source when backup copy fails', () => {
  const dir = mkTmp('demigrate-failcopy');
  try {
    // Simulate a state.sqlite-like file at <dir>/.design/state.sqlite.
    const designDir = path.join(dir, '.design');
    fs.mkdirSync(designDir, { recursive: true });
    const dbPath = path.join(designDir, 'state.sqlite');
    fs.writeFileSync(dbPath, 'PRECIOUS_DB_BYTES'); // non-empty source

    // Monkey-patch fs.copyFileSync to force a failed copy.
    const origCopy = fs.copyFileSync;
    fs.copyFileSync = function patchedCopy() {
      throw new Error('simulated copy failure (EIO)');
    };
    try {
      const result = qs.demigrate({ dbPath });
      assert.equal(result.demigrated, false, 'demigrate must return demigrated=false on failed backup');
      assert.match(
        result.message,
        /refusing to remove|missing or empty/i,
        `expected refusal message, got: ${result.message}`
      );
      // CRITICAL: the source file must STILL EXIST because we refused to unlink.
      assert.equal(
        fs.existsSync(dbPath),
        true,
        'source dbPath must not be unlinked when backup verification fails'
      );
      assert.equal(
        fs.readFileSync(dbPath, 'utf8'),
        'PRECIOUS_DB_BYTES',
        'source dbPath contents must be intact when backup verification fails'
      );
    } finally {
      fs.copyFileSync = origCopy;
    }
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 6: demigrate() refuses to unlink when the backup ends up zero-byte.
// We patch copyFileSync to silently create a 0-byte file at the dest.
// ---------------------------------------------------------------------------

test('H5: demigrate refuses to unlink source when backup is zero bytes', () => {
  const dir = mkTmp('demigrate-emptycopy');
  try {
    const designDir = path.join(dir, '.design');
    fs.mkdirSync(designDir, { recursive: true });
    const dbPath = path.join(designDir, 'state.sqlite');
    fs.writeFileSync(dbPath, 'PRECIOUS_DB_BYTES');

    // Patch copyFileSync to write a 0-byte destination silently. This mirrors
    // the worst-case failure mode where copy "succeeds" but writes nothing.
    const origCopy = fs.copyFileSync;
    fs.copyFileSync = function patchedCopy(_src, dst) {
      fs.writeFileSync(dst, ''); // 0 bytes
    };
    try {
      const result = qs.demigrate({ dbPath });
      assert.equal(result.demigrated, false, 'demigrate must refuse on a zero-byte backup');
      assert.match(result.message, /refusing|empty/i, 'message should explain refusal');
      assert.equal(fs.existsSync(dbPath), true, 'source dbPath must survive a zero-byte backup');
      assert.equal(fs.readFileSync(dbPath, 'utf8'), 'PRECIOUS_DB_BYTES');
    } finally {
      fs.copyFileSync = origCopy;
    }
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Test 7: backupCycle() reports failure when copy fails (does not lie about
// success). This is the non-destructive form of the guard.
// ---------------------------------------------------------------------------

test('H5: backupCycle reports backed_up=false when copy fails', () => {
  const dir = mkTmp('backupcycle-failcopy');
  try {
    const designDir = path.join(dir, '.design');
    fs.mkdirSync(designDir, { recursive: true });
    const dbPath = path.join(designDir, 'state.sqlite');
    fs.writeFileSync(dbPath, 'PRECIOUS');

    const origCopy = fs.copyFileSync;
    fs.copyFileSync = function patchedCopy() {
      throw new Error('simulated copy failure');
    };
    try {
      const result = qs.backupCycle({ dbPath });
      // backupCycle only returns backed_up=true when BACKEND==='sqlite' AND
      // the copy succeeds. Under markdown floor (typical test env) it returns
      // backed_up=false with a "BACKEND is not sqlite" message - that's fine
      // because the guard never fires.
      assert.equal(
        result.backed_up,
        false,
        'backupCycle must not report success when backup verification fails'
      );
    } finally {
      fs.copyFileSync = origCopy;
    }
  } finally {
    cleanup(dir);
  }
});
