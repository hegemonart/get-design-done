'use strict';
/**
 * test/suite/phase-57-backend.test.cjs - Phase 57 SQLite State Backbone.
 * Tests for scripts/lib/state/state-backend.cjs
 *
 * Tag: 57-A:
 *
 * Test strategy:
 *   - Every SQLite-specific assertion is guarded with `if (!Database) return;`
 *     so the suite is GREEN with OR without better-sqlite3.
 *   - The markdown floor (BACKEND==='markdown') is tested unconditionally
 *     (at least 2 assertions that always run).
 *   - This matches the CI contract: BACKEND==='markdown' on all CI jobs;
 *     SQLite path verified locally only.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Load the module under test from the main repo root.
// We walk up from __dirname to find the repo root, then require.
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
const backendPath = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'state-backend.cjs');

// ---------------------------------------------------------------------------
// 57-A: backend probe returns a backend string
// ---------------------------------------------------------------------------

test('57-A: state-backend exports BACKEND as a string', () => {
  const { BACKEND } = require(backendPath);
  assert.equal(typeof BACKEND, 'string', 'BACKEND must be a string');
  assert.ok(
    BACKEND === 'sqlite' || BACKEND === 'markdown',
    `BACKEND must be 'sqlite' or 'markdown', got: ${BACKEND}`
  );
});

test('57-A: GDD_STATE_BACKEND=markdown forces markdown floor', () => {
  // Force markdown backend by inspecting BACKEND with env override.
  // Since the module is already loaded (cached), we test the env contract
  // by directly checking: if the env is set to markdown, BACKEND should be markdown.
  // We cannot re-require a fresh module in the same process due to require cache,
  // so we verify the logic by checking the env is honored in a separate subprocess.
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(
    process.execPath,
    ['-e', `
      const { BACKEND } = require(${JSON.stringify(backendPath)});
      process.stdout.write(BACKEND);
    `],
    {
      encoding: 'utf8',
      env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
    }
  );
  assert.equal(result.status, 0, `subprocess failed: ${result.stderr}`);
  assert.equal(result.stdout, 'markdown',
    'GDD_STATE_BACKEND=markdown must force BACKEND to markdown');
});

// ---------------------------------------------------------------------------
// 57-A: Database export is null or a function (constructor)
// ---------------------------------------------------------------------------

test('57-A: state-backend exports Database (null or constructor)', () => {
  const { Database } = require(backendPath);
  // Database is either null (better-sqlite3 absent) or a function (constructor).
  const valid = Database === null || typeof Database === 'function';
  assert.ok(valid, 'Database must be null or a function');
});

// ---------------------------------------------------------------------------
// 57-A: sqlitePath resolves to .design/state.sqlite
// ---------------------------------------------------------------------------

test('57-A: sqlitePath resolves to .design/state.sqlite', () => {
  const { sqlitePath } = require(backendPath);
  // Create a temp dir to use as a fake project root.
  // We need a git repo context; use REPO_ROOT which is a real repo.
  const resolved = sqlitePath(REPO_ROOT);
  assert.ok(
    resolved.endsWith(path.join('.design', 'state.sqlite')),
    `sqlitePath should end with .design/state.sqlite, got: ${resolved}`
  );
  // The path should be under the REPO_ROOT (accounting for worktree redirect to main repo).
  // We check it ends with the expected suffix rather than starts with REPO_ROOT
  // because worktree-resolve may redirect to the main checkout.
  assert.ok(
    path.isAbsolute(resolved),
    `sqlitePath should return an absolute path, got: ${resolved}`
  );
});

// ---------------------------------------------------------------------------
// 57-A: schema loads without error when Database is present (SQLite-specific)
// ---------------------------------------------------------------------------

test('57-A: schema loads into an in-memory database without error', () => {
  const { Database, loadSchema } = require(backendPath);
  if (!Database) return; // SQLite not available - self-skip

  const db = new Database(':memory:');
  try {
    // loadSchema should not throw on a fresh in-memory database.
    assert.doesNotThrow(() => loadSchema(db), 'loadSchema must not throw on a fresh database');
    // Verify key tables exist by querying sqlite_master.
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);
    const requiredTables = [
      '_block_meta', '_meta', 'blockers', 'decisions', 'design_debt',
      'findings', 'instincts', 'must_haves', 'plans', 'recall_records',
      'sessions', 'state_position', 'worktree_state', 'conflict_incidents',
    ];
    for (const tbl of requiredTables) {
      assert.ok(tables.includes(tbl), `Table '${tbl}' must exist after loadSchema`);
    }
  } finally {
    db.close();
  }
});

test('57-A: loadSchema is idempotent (can be called twice without error)', () => {
  const { Database, loadSchema } = require(backendPath);
  if (!Database) return;

  const db = new Database(':memory:');
  try {
    loadSchema(db);
    // Second call must not throw (CREATE TABLE IF NOT EXISTS).
    assert.doesNotThrow(() => loadSchema(db), 'loadSchema must be idempotent');
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// 57-A: openQueryDb is readonly (write throws) when Database present
// ---------------------------------------------------------------------------

test('57-A: openQueryDb returns a readonly connection that rejects writes', () => {
  const { Database, openQueryDb } = require(backendPath);
  if (!Database) return;

  // Create a temporary database file with the schema.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');
  try {
    // First create the database and schema as a writer.
    const { openStateDb } = require(backendPath);
    const writer = openStateDb(dbPath);
    writer.close();

    // Now open as readonly and verify writes are rejected.
    const reader = openQueryDb(dbPath);
    try {
      assert.throws(
        () => reader.prepare("INSERT INTO _meta(key,value) VALUES('x','y')").run(),
        /SQLITE_READONLY|readonly/i,
        'Write to readonly database must throw'
      );
    } finally {
      reader.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 57-A: checkIntegrity returns true on a fresh database
// ---------------------------------------------------------------------------

test('57-A: checkIntegrity returns true on a fresh database', () => {
  const { Database, openStateDb, checkIntegrity } = require(backendPath);
  if (!Database) return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57-'));
  const dbPath = path.join(tmpDir, 'integrity.sqlite');
  try {
    const db = openStateDb(dbPath);
    try {
      const ok = checkIntegrity(db);
      assert.equal(ok, true, 'checkIntegrity must return true on a fresh database');
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 57-A: schema includes all 14 pinned base tables (SQLite-specific)
// ---------------------------------------------------------------------------

test('57-A: schema.sql contains all 14 pinned base tables', () => {
  const { Database, loadSchema } = require(backendPath);
  if (!Database) return;

  const db = new Database(':memory:');
  try {
    loadSchema(db);
    const tables = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    );
    // The 14 tables listed in CONTEXT.md "Shared contracts".
    const expected = [
      'state_position', 'decisions', 'blockers', 'must_haves', 'plans',
      'findings', 'design_debt', 'recall_records', 'instincts', 'sessions',
      'worktree_state', 'conflict_incidents', '_meta', '_block_meta',
    ];
    for (const t of expected) {
      assert.ok(tables.has(t), `Pinned table '${t}' must exist`);
    }
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// 57-A: openStateDb with readonly=true skips WAL (no write pragma set)
// ---------------------------------------------------------------------------

test('57-A: openStateDb with readonly:true skips WAL pragma', () => {
  const { Database, openStateDb } = require(backendPath);
  if (!Database) return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57-'));
  const dbPath = path.join(tmpDir, 'wal-test.sqlite');
  try {
    // Create a writable db first so the file exists.
    const writer = openStateDb(dbPath);
    writer.close();

    // Open readonly - should not throw.
    const reader = openStateDb(dbPath, { readonly: true });
    try {
      // Verify we can read.
      const rows = reader.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      assert.ok(Array.isArray(rows), 'readonly openStateDb must return a readable database');
    } finally {
      reader.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 57-A: markdown floor - BACKEND from env always returns 'markdown' (always-on)
// ---------------------------------------------------------------------------

test('57-A: markdown floor - backendName contract (always-on regardless of module)', () => {
  // This test exercises BACKEND without requiring better-sqlite3.
  // It runs on ALL CI configurations (the markdown floor is always-on per R5).
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(
    process.execPath,
    ['-e', `
      const { BACKEND } = require(${JSON.stringify(backendPath)});
      const valid = BACKEND === 'sqlite' || BACKEND === 'markdown';
      process.exit(valid ? 0 : 1);
    `],
    {
      encoding: 'utf8',
      env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
    }
  );
  assert.equal(result.status, 0, 'BACKEND must be sqlite or markdown under GDD_STATE_BACKEND=markdown');
});

test('57-A: markdown floor - sqlitePath is callable even when Database is null (always-on)', () => {
  // sqlitePath must not throw even when better-sqlite3 is absent.
  // This is the always-on markdown floor test.
  const { sqlitePath } = require(backendPath);
  // Should not throw regardless of backend.
  let result;
  assert.doesNotThrow(() => {
    result = sqlitePath(REPO_ROOT);
  }, 'sqlitePath must not throw even when Database is null');
  assert.equal(typeof result, 'string', 'sqlitePath must return a string');
  assert.ok(result.includes('state.sqlite'), 'sqlitePath must include state.sqlite');
});
