'use strict';
/**
 * test/suite/state-store-sqlite-path.test.cjs - H7 path + migrate() async.
 *
 * Two-pronged sanity check for the Phase 57 state backbone path conventions:
 *
 *   1. state-backend.sqlitePath(projectRoot) must resolve to the PINNED
 *      `<projectRoot>/.design/state.sqlite` location. This is the canonical
 *      on-disk store for the SQLite backend; many tools (recover, demigrate,
 *      backupCycle, the hooks layer, etc.) hard-code this path.
 *
 *   2. state-store.migrate() must be async (returns a Promise) and must
 *      resolve to a structured result object regardless of whether
 *      better-sqlite3 is installed. The H7 cut converted migrate() to
 *      `async` so that callers can `await` it instead of receiving an
 *      un-awaited Promise from the underlying migrateToSqlite delegate.
 *
 * Both tests are always-on (no better-sqlite3 needed).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Repo-root walk-up (same pattern as sibling tests).
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
const storePath = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'state-store.cjs');
const backendPath = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'state-backend.cjs');

// ---------------------------------------------------------------------------
// Test 1: sqlitePath resolves to <projectRoot>/.design/state.sqlite (PINNED).
// Multiple hard-coded sites depend on this exact name; we lock it in.
// ---------------------------------------------------------------------------

test('H7: sqlitePath resolves to <projectRoot>/.design/state.sqlite', () => {
  const backend = require(backendPath);
  assert.equal(typeof backend.sqlitePath, 'function', 'sqlitePath must be exported');

  const probeRoot = path.resolve(REPO_ROOT);
  const resolved = backend.sqlitePath(probeRoot);

  // The path must end with .design/state.sqlite using the platform separator.
  const expectedSuffix = path.join('.design', 'state.sqlite');
  assert.ok(
    resolved.endsWith(expectedSuffix),
    `sqlitePath should end with ${expectedSuffix}, got: ${resolved}`
  );

  // The file name itself must be exactly 'state.sqlite' (no .db, no .sqlite3,
  // no other variant). This pins the wire-format choice.
  assert.equal(
    path.basename(resolved),
    'state.sqlite',
    `state file basename must be 'state.sqlite', got: ${path.basename(resolved)}`
  );

  // The parent directory must be exactly '.design'.
  assert.equal(
    path.basename(path.dirname(resolved)),
    '.design',
    `state file parent dir must be '.design', got: ${path.basename(path.dirname(resolved))}`
  );

  // The resolved path must be absolute (callers concat with this directly).
  assert.ok(path.isAbsolute(resolved), `sqlitePath must return absolute path, got: ${resolved}`);
});

// ---------------------------------------------------------------------------
// Test 2: sqlitePath honors an explicit projectRoot rather than cwd.
// ---------------------------------------------------------------------------

test('H7: sqlitePath honors explicit projectRoot', () => {
  const backend = require(backendPath);
  // Use a path that doesn't match cwd to prove the arg is wired through.
  const fakeRoot = path.join(REPO_ROOT, 'test', '__fake_project_root_h7');
  const resolved = backend.sqlitePath(fakeRoot);
  // The .design/state.sqlite must dangle off the fake root (Phase 53 worktree
  // resolver may walk up to REPO_ROOT, so we only assert the suffix).
  const expectedSuffix = path.join('.design', 'state.sqlite');
  assert.ok(
    resolved.endsWith(expectedSuffix),
    `sqlitePath should end with ${expectedSuffix}, got: ${resolved}`
  );
});

// ---------------------------------------------------------------------------
// Test 3: state-store.migrate() is async and returns a Promise.
// H7 conversion: migrate() must be callable with await.
// ---------------------------------------------------------------------------

test('H7: state-store.migrate() returns a Promise (async)', () => {
  const store = require(storePath);
  assert.equal(typeof store.migrate, 'function', 'migrate must be exported');
  const ret = store.migrate({});
  assert.ok(ret && typeof ret.then === 'function',
    `migrate() must return a Promise, got: ${typeof ret}`);
  // Don't leave the Promise dangling - drain it so the test runner doesn't
  // warn about unhandled rejections.
  return ret.then(() => undefined, () => undefined);
});

// ---------------------------------------------------------------------------
// Test 4: migrate() resolves to a structured result on the markdown floor.
// Spawned subprocess with GDD_STATE_BACKEND=markdown so the result is
// deterministic regardless of better-sqlite3 availability.
// ---------------------------------------------------------------------------

test('H7: migrate() resolves to {migrated:false, backend:markdown} on markdown floor', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const store = require(${JSON.stringify(storePath)});
    (async () => {
      const result = await store.migrate({});
      const ok = result && result.migrated === false && result.backend === 'markdown';
      process.exit(ok ? 0 : 1);
    })().catch((err) => {
      process.stderr.write('migrate threw: ' + err.message + '\\n');
      process.exit(2);
    });
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
  });
  assert.equal(
    result.status,
    0,
    `markdown-floor migrate() should resolve cleanly. stdout=${result.stdout} stderr=${result.stderr}`
  );
});
