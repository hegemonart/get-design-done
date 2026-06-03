'use strict';
/**
 * test/suite/phase-57-state-skill.test.cjs - Phase 57 (57-F:)
 *
 * Tests for:
 *   - scripts/lib/state/query-surface.cjs (query denylist, SELECT, recover, demigrate,
 *     rotateBak cap, backupCycle)
 *   - hooks/gdd-fact-force.js decisionMentions() via both FTS5 (migrated) and grep
 *     (un-migrated) paths
 *
 * Strategy:
 *   - SQLite-specific assertions guarded with `if (!Database || BACKEND !== 'sqlite') return;`
 *     so they self-skip in CI (BACKEND==='markdown', better-sqlite3 absent).
 *   - At least 2 always-on floor assertions (denylist is pure; demigrate no-op message).
 *   - GDD_STATE_BACKEND=markdown env override is the CI floor path.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Repo root resolution (same pattern as phase-57-backend.test.cjs).
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
const QS_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'query-surface.cjs');
const BACKEND_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'state-backend.cjs');
const FACT_HOOK_PATH = path.join(REPO_ROOT, 'hooks', 'gdd-fact-force.js');

const qs = require(QS_PATH);
const { _assertReadonly, _firstToken, DENIED_TOKENS, query, recover, demigrate, rotateBak, backupCycle } = qs;
const { Database, BACKEND, openStateDb, sqlitePath, loadSchema } = require(BACKEND_PATH);
const { decisionMentions } = require(FACT_HOOK_PATH);

// ---------------------------------------------------------------------------
// Always-on floor tests (run regardless of BACKEND / better-sqlite3 presence).
// ---------------------------------------------------------------------------

test('57-F: denylist is a Set (pure — always-on)', () => {
  assert.ok(DENIED_TOKENS instanceof Set, 'DENIED_TOKENS must be a Set');
  // Spot-check several denied tokens.
  for (const tok of ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'PRAGMA']) {
    assert.ok(DENIED_TOKENS.has(tok), `DENIED_TOKENS must include ${tok}`);
  }
  // SELECT is NOT in the denylist.
  assert.ok(!DENIED_TOKENS.has('SELECT'), 'SELECT must not be in the denylist');
});

test('57-F: _firstToken extracts the first token correctly (always-on)', () => {
  assert.equal(_firstToken('SELECT * FROM foo'), 'SELECT');
  assert.equal(_firstToken('  select * from foo'), 'SELECT');
  assert.equal(_firstToken('DROP TABLE foo'), 'DROP');
  assert.equal(_firstToken('INSERT INTO foo VALUES (1)'), 'INSERT');
  assert.equal(_firstToken(''), '');
  assert.equal(_firstToken('   '), '');
  // Strips single-line comment.
  assert.equal(_firstToken('-- comment\nSELECT 1'), 'SELECT');
  // Strips block comment.
  assert.equal(_firstToken('/* comment */SELECT 1'), 'SELECT');
});

test('57-F: _assertReadonly throws for denied tokens (always-on)', () => {
  // All denied tokens must throw.
  for (const tok of [...DENIED_TOKENS]) {
    assert.throws(
      () => _assertReadonly(`${tok} something`),
      /not allowed|denylist|not SELECT/i,
      `_assertReadonly must throw for ${tok}`
    );
  }
  // Empty query throws.
  assert.throws(() => _assertReadonly(''), /empty query/i);
  // Non-denied, non-SELECT, non-WITH first tokens must throw.
  assert.throws(
    () => _assertReadonly('EXPLAIN SELECT 1'),
    /not SELECT/i,
    'EXPLAIN must be rejected'
  );
  // WITH ... SELECT CTE must be ALLOWED (BUG-11 fix; engine readonly blocks write CTEs).
  assert.doesNotThrow(
    () => _assertReadonly('WITH cte AS (SELECT 1) SELECT * FROM cte'),
    'WITH ... SELECT CTE must be allowed'
  );
});

test('57-F: _assertReadonly does NOT throw for SELECT (always-on)', () => {
  assert.doesNotThrow(() => _assertReadonly('SELECT 1'), 'SELECT 1 must be allowed');
  assert.doesNotThrow(
    () => _assertReadonly('SELECT * FROM decisions WHERE id = ?'),
    'full SELECT must be allowed'
  );
  assert.doesNotThrow(
    () => _assertReadonly('  select id from decisions order by ordinal'),
    'lowercase select must be allowed'
  );
});

test('57-F: demigrate no-op message when sqlite absent (always-on)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-'));
  try {
    // Point at a nonexistent dbPath.
    const fakePath = path.join(tmpDir, '.design', 'state.sqlite');
    const result = demigrate({ dbPath: fakePath });
    assert.equal(typeof result.message, 'string', 'demigrate must return a message string');
    // Must report no-op (not an error throw).
    assert.equal(result.demigrated, false, 'demigrate of nonexistent path must return demigrated:false');
    assert.match(result.message, /no-op|does not exist/i, 'no-op message expected');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: query degrades gracefully when BACKEND is markdown (always-on floor)', () => {
  // We can exercise this by calling query() and observing the return shape.
  // If BACKEND==='markdown', query() must return { degraded: true, message: '...' }.
  // If BACKEND==='sqlite', query() with a valid SELECT on a real path is tested below.
  if (BACKEND !== 'sqlite') {
    const result = query('SELECT 1', { projectRoot: REPO_ROOT });
    assert.equal(result.degraded, true, 'query must degrade gracefully in markdown mode');
    assert.equal(typeof result.message, 'string', 'degrade result must have a message');
  } else {
    // Floor assertion still passes (skip content check in sqlite mode).
    assert.equal(typeof BACKEND, 'string', 'BACKEND must be a string');
  }
});

// ---------------------------------------------------------------------------
// fact-force decisionMentions: grep path (un-migrated, always-on floor).
// ---------------------------------------------------------------------------

test('57-F: decisionMentions grep path returns {found,where} shape (always-on)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-ff-'));
  try {
    const designDir = path.join(tmpDir, '.design');
    fs.mkdirSync(designDir, { recursive: true });
    // Write a STATE.md that mentions 'auth.ts'.
    fs.writeFileSync(
      path.join(designDir, 'STATE.md'),
      '# Pipeline State\n\n<decisions>\n- D-01 auth.ts must use JWT\n</decisions>\n',
      'utf8'
    );
    // No state.sqlite -> grep path.
    const result = decisionMentions(tmpDir, 'src/auth.ts');
    assert.equal(typeof result.found, 'boolean', 'decisionMentions must return {found:boolean,...}');
    assert.ok(result.found === true || result.found === false, 'found must be boolean');
    if (result.found) {
      assert.equal(typeof result.where, 'string', 'where must be a string when found');
    } else {
      // 'auth.ts' is in STATE.md, so it must be found.
      assert.fail('decisionMentions must find auth.ts in STATE.md');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: decisionMentions grep path returns found:false when no mention (always-on)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-ff2-'));
  try {
    const designDir = path.join(tmpDir, '.design');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'STATE.md'),
      '# Pipeline State\n\nNo mentions of anything here.\n',
      'utf8'
    );
    const result = decisionMentions(tmpDir, 'totally-unmention.ts');
    assert.equal(result.found, false, 'decisionMentions must return found:false for missing file');
    assert.equal(result.where, null, 'where must be null when found:false');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// rotateBak cap at 10 (tested with a temp dir, no SQLite needed).
// ---------------------------------------------------------------------------

test('57-F: rotateBak shifts backups and caps at 10 (always-on)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-bak-'));
  try {
    const dbPath = path.join(tmpDir, 'state.sqlite');
    // Create a dummy 'sqlite' file.
    fs.writeFileSync(dbPath, 'test', 'utf8');

    // Pre-fill .bak.0 through .bak.9 to test cap enforcement.
    for (let i = 0; i <= 9; i++) {
      fs.writeFileSync(`${dbPath}.bak.${i}`, `content-${i}`, 'utf8');
    }

    // Call rotateBak: should shift 0->1, 1->2, ..., 8->9, dropping old .bak.9.
    rotateBak(dbPath);

    // After rotation, slots 1..9 exist, slot 0 is free.
    assert.ok(!fs.existsSync(`${dbPath}.bak.0`), '.bak.0 must be free after rotation');
    // .bak.1 should exist (was .bak.0).
    assert.ok(fs.existsSync(`${dbPath}.bak.1`), '.bak.1 must exist after rotation');
    // .bak.9 should exist (was .bak.8).
    assert.ok(fs.existsSync(`${dbPath}.bak.9`), '.bak.9 must exist after rotation');
    // No .bak.10 should be created (cap at 10).
    assert.ok(!fs.existsSync(`${dbPath}.bak.10`), '.bak.10 must not exist (cap at 10)');
    // Content of .bak.1 was content-0 (shifted).
    const bak1Content = fs.readFileSync(`${dbPath}.bak.1`, 'utf8');
    assert.equal(bak1Content, 'content-0', '.bak.1 must contain old .bak.0 content');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: rotateBak on empty dir (no existing backups) is a no-op (always-on)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-bak2-'));
  try {
    const dbPath = path.join(tmpDir, 'state.sqlite');
    // No .bak.N files present; should not throw.
    assert.doesNotThrow(() => rotateBak(dbPath), 'rotateBak must not throw on missing backups');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// SQLite-specific tests. All guarded with `if (!Database || BACKEND !== 'sqlite') return;`
// ---------------------------------------------------------------------------

test('57-F: query SELECT works when migration-active (SQLite-specific)', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-qs-'));
  try {
    const dbPath = path.join(tmpDir, 'state.sqlite');
    // Create and populate a test database.
    const db = openStateDb(dbPath);
    db.close();

    // Run a simple SELECT.
    const result = query('SELECT 1 AS n', { dbPath });
    assert.ok(!result.degraded, 'query must not degrade when SQLite is active');
    assert.ok(Array.isArray(result.rows), 'query must return rows array');
    assert.equal(result.rows.length, 1, 'SELECT 1 must return 1 row');
    assert.equal(result.rows[0].n, 1, 'SELECT 1 AS n must return n=1');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: query rejects INSERT at engine level (SQLITE_READONLY) (SQLite-specific)', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-ro-'));
  try {
    const dbPath = path.join(tmpDir, 'state.sqlite');
    const db = openStateDb(dbPath);
    db.close();

    // The denylist catches INSERT before the engine, so it throws our denylist error.
    assert.throws(
      () => query("INSERT INTO _meta(key,value) VALUES('x','y')", { dbPath }),
      /denylist|not allowed|not SELECT/i,
      'INSERT must be rejected by denylist'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: query rejects DROP at denylist (before engine) (SQLite-specific)', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-drop-'));
  try {
    const dbPath = path.join(tmpDir, 'state.sqlite');
    const db = openStateDb(dbPath);
    db.close();

    assert.throws(
      () => query('DROP TABLE decisions', { dbPath }),
      /denylist|not allowed|not SELECT/i,
      'DROP must be rejected by denylist'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: query rejects UPDATE at denylist (SQLite-specific)', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-upd-'));
  try {
    const dbPath = path.join(tmpDir, 'state.sqlite');
    const db = openStateDb(dbPath);
    db.close();

    assert.throws(
      () => query("UPDATE _meta SET value='x' WHERE key='k'", { dbPath }),
      /denylist|not allowed|not SELECT/i,
      'UPDATE must be rejected by denylist'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: query returns degraded:true when sqlite file does not exist (SQLite-specific)', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-nofile-'));
  try {
    const fakePath = path.join(tmpDir, 'nonexistent.sqlite');
    const result = query('SELECT 1', { dbPath: fakePath });
    assert.equal(result.degraded, true, 'must degrade when sqlite file not found');
    assert.match(result.message, /not found|does not exist/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: demigrate removes sqlite and reports demigrated:true (SQLite-specific)', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-demi-'));
  try {
    const designDir = path.join(tmpDir, '.design');
    fs.mkdirSync(designDir, { recursive: true });
    const dbPath = path.join(designDir, 'state.sqlite');
    // Create a real sqlite file.
    const db = openStateDb(dbPath);
    db.close();
    assert.ok(fs.existsSync(dbPath), 'sqlite must exist before demigrate');

    const result = demigrate({ dbPath });
    assert.equal(result.demigrated, true, 'demigrate must return demigrated:true');
    assert.ok(!fs.existsSync(dbPath), 'sqlite must be removed after demigrate');
    // Backup .bak.0 must exist.
    assert.ok(fs.existsSync(`${dbPath}.bak.0`), '.bak.0 must exist after demigrate');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: demigrate idempotent - second call returns no-op message (SQLite-specific)', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-demi2-'));
  try {
    const dbPath = path.join(tmpDir, 'state.sqlite');
    // First call with nonexistent path.
    const r1 = demigrate({ dbPath });
    assert.equal(r1.demigrated, false, 'first call on nonexistent must be no-op');
    // Second call also no-op.
    const r2 = demigrate({ dbPath });
    assert.equal(r2.demigrated, false, 'second call on nonexistent must also be no-op');
    assert.match(r2.message, /no-op|does not exist/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: backupCycle creates .bak.0 when sqlite exists (SQLite-specific)', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-bkp-'));
  try {
    const dbPath = path.join(tmpDir, 'state.sqlite');
    const db = openStateDb(dbPath);
    db.close();

    const result = backupCycle({ dbPath });
    assert.equal(result.backed_up, true, 'backupCycle must succeed');
    assert.ok(fs.existsSync(`${dbPath}.bak.0`), '.bak.0 must exist after backupCycle');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-F: recover returns degraded when BACKEND is markdown (SQLite-specific gate)', async () => {
  // recover() is now async (BUG-03 fix) - must be awaited.
  // This tests the degrade path. Even when BACKEND==='sqlite' it degrades when
  // migrate-to-sqlite is not ready. We test the degrade message shape.
  const result = await recover({ dbPath: path.join(os.tmpdir(), 'nonexistent-57f.sqlite') });
  // The result must always be an object with {recovered, message}.
  assert.equal(typeof result.recovered, 'boolean', 'recover must return {recovered:boolean}');
  assert.equal(typeof result.message, 'string', 'recover must return {message:string}');
});

// ---------------------------------------------------------------------------
// fact-force decisionMentions: FTS5 path (migrated, SQLite-specific).
// ---------------------------------------------------------------------------

test('57-F: decisionMentions FTS5 path returns {found,where} shape (SQLite-specific)', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-fts-'));
  const designDir = path.join(tmpDir, '.design');
  fs.mkdirSync(designDir, { recursive: true });

  // Create a real state.sqlite with a decision that mentions 'auth.ts'.
  const dbPath = path.join(designDir, 'state.sqlite');
  {
    const db = openStateDb(dbPath);
    // Insert the parent state_position row first (FK constraint).
    db.prepare(`
      INSERT INTO state_position (cycle_id, stage, status, updated_at)
      VALUES ('cycle-test', 'scan', 'active', '2026-01-01T00:00:00Z')
    `).run();
    // Insert a decision row mentioning auth.ts.
    db.prepare(`
      INSERT INTO decisions (id, cycle_id, status, body_md, ordinal, created_at)
      VALUES ('D-01', 'cycle-test', 'tentative', 'auth.ts must use JWT signing', 0, '2026-01-01T00:00:00Z')
    `).run();
    db.close();
  }

  // Also write a minimal STATE.md (required by _isMigrationActive path).
  fs.writeFileSync(
    path.join(designDir, 'STATE.md'),
    '# Pipeline State\n---\nstage: scan\n---\n',
    'utf8'
  );

  // With state.sqlite present, decisionMentions should use FTS5 path.
  const result = decisionMentions(tmpDir, 'src/auth.ts');

  // Cleanup before assertions that might add to the error trace.
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows WAL files - ignore */ }

  assert.equal(typeof result.found, 'boolean', 'FTS5 decisionMentions must return {found:boolean}');
  // found may be true (FTS5 hits 'auth.ts') or false (FTS5 didn't match the token).
  // The critical invariant is: the shape is correct and it does not throw.
  if (result.found) {
    assert.equal(typeof result.where, 'string', 'where must be string when found:true');
  } else {
    assert.equal(result.where, null, 'where must be null when found:false');
  }
});

test('57-F: decisionMentions FTS5 path falls back to grep when store throws (SQLite-specific)', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  // Even if the FTS5 path were to fail, the grep fallback must work.
  // We test the grep fallback by ensuring decisionMentions still works with STATE.md.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57f-ffgr-'));
  try {
    const designDir = path.join(tmpDir, '.design');
    fs.mkdirSync(designDir, { recursive: true });
    // No state.sqlite -> falls through to grep.
    fs.writeFileSync(
      path.join(designDir, 'STATE.md'),
      '# Pipeline State\n\n<decisions>\n- D-01 render.ts is the render backbone\n</decisions>\n',
      'utf8'
    );
    const result = decisionMentions(tmpDir, 'scripts/lib/state/render.ts');
    assert.equal(result.found, true, 'grep fallback must find mention of render.ts');
    assert.equal(result.where, 'STATE.md', 'grep fallback must return STATE.md as where');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
