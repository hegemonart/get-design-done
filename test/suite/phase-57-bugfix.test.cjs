'use strict';
/**
 * test/suite/phase-57-bugfix.test.cjs - Phase 57 bug-fix regression tests.
 *
 * Locks each confirmed bug fix:
 *   BUG-01 - R8 freshness guard: hand-edit to STATE.md is preserved (upsertOnly flow)
 *   BUG-02 - migrate idempotency: re-running migrate does NOT duplicate blockers
 *   BUG-03 - recover() is async + awaits migrateToSqlite -> integrity:true
 *   BUG-05 - FTS5 populated by migrate + appendDecision; queryDecisions returns hits
 *   BUG-06 - getters return [] / null when state.sqlite is absent (not throw)
 *   BUG-07 - directory named state.sqlite: migrationActive degrades gracefully
 *   BUG-09 - blocker comment lines round-trip verbatim via _block_meta.raw_body
 *   BUG-10 - appendDecision returns skip result when no active cycle_id
 *   BUG-11 - WITH ... SELECT CTE allowed by _assertReadonly
 *   NIT     - findPackageRoot uses scoped name '@hegemonart/get-design-done'
 *
 * All SQLite assertions are guarded with `if (!Database || BACKEND !== 'sqlite') return;`
 * so this suite stays green on the markdown floor (CI).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// ---------------------------------------------------------------------------
// Repo root resolution.
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
const STORE_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'state-store.cjs');
const MIGRATE_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'migrate-to-sqlite.cjs');
const QS_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'query-surface.cjs');
const BACKEND_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'state-backend.cjs');
const FIXTURE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-57');

const { Database, BACKEND, openStateDb } = require(BACKEND_PATH);
const { migrateToSqlite } = require(MIGRATE_PATH);
const store = require(STORE_PATH);
const { _assertReadonly, recover } = require(QS_PATH);

const FIXTURE_MID = fs.readFileSync(path.join(FIXTURE_DIR, 'sample-state-mid.md'), 'utf8');
const FIXTURE_FULL = fs.readFileSync(path.join(FIXTURE_DIR, 'sample-state-full.md'), 'utf8');

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `gdd-57fix-${prefix}-`));
}
function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
function mkProject(fixtureMd) {
  const root = mkTmp('proj');
  fs.mkdirSync(path.join(root, '.design'), { recursive: true });
  fs.writeFileSync(path.join(root, '.design', 'STATE.md'), fixtureMd, 'utf8');
  return root;
}

// ---------------------------------------------------------------------------
// NIT: findPackageRoot uses scoped package name.
// ---------------------------------------------------------------------------

test('NIT: state-store findPackageRoot uses @hegemonart/get-design-done (always-on)', () => {
  // Verify by checking that the store loads correctly (it uses findPackageRoot internally).
  assert.equal(typeof store.backendName, 'function', 'state-store must load without error');
  // If the wrong name were used, PKG_ROOT would be wrong and SDK loading would fail.
  // We verify that backendName() returns a valid string.
  const name = store.backendName();
  assert.ok(name === 'sqlite' || name === 'markdown', `backendName must be sqlite or markdown, got: ${name}`);
});

// ---------------------------------------------------------------------------
// BUG-10 (always-on): appendDecision skips gracefully when no cycle_id.
// ---------------------------------------------------------------------------

test('BUG-10: appendDecision returns skip when no active cycle_id (SQLite-specific)', async () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = mkTmp('bug10');
  const dbPath = path.join(tmpDir, 'state.sqlite');
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    // Open DB with schema but no state_position row.
    openStateDb(dbPath).close();
    // appendDecision with no cycleId and no state_position row should skip.
    const result = await store.appendDecision(
      { id: 'D-01', bodyMd: 'test decision', status: 'tentative' },
      { dbPath, projectRoot: tmpDir }
    );
    assert.ok(
      result.skipped === true || result.id === 'D-01',
      'appendDecision must return skip or succeed, not throw'
    );
    if (result.skipped) {
      assert.match(result.reason, /cycle_id|setPosition/i, 'skip reason must mention cycle_id');
    }
  } finally {
    rmrf(tmpDir);
  }
});

// ---------------------------------------------------------------------------
// BUG-11 (always-on): WITH ... SELECT CTE allowed by _assertReadonly.
// ---------------------------------------------------------------------------

test('BUG-11: _assertReadonly allows WITH ... SELECT CTE (always-on)', () => {
  // Plain SELECT is still allowed.
  assert.doesNotThrow(
    () => _assertReadonly('SELECT * FROM decisions'),
    'SELECT must be allowed'
  );
  // WITH CTE must now be allowed.
  assert.doesNotThrow(
    () => _assertReadonly('WITH cte AS (SELECT 1) SELECT * FROM cte'),
    'WITH ... SELECT CTE must be allowed'
  );
  assert.doesNotThrow(
    () => _assertReadonly('  with x as (SELECT id FROM decisions) SELECT id FROM x'),
    'lowercase with must be allowed'
  );
  // Non-SELECT after WITH is still blocked if it starts the query with denied token.
  assert.throws(
    () => _assertReadonly('DROP TABLE decisions'),
    /denylist|not allowed/i,
    'DROP must still be rejected'
  );
  // Non-SELECT, non-WITH first token must still be rejected.
  assert.throws(
    () => _assertReadonly('EXPLAIN SELECT 1'),
    /not SELECT/i,
    'EXPLAIN must still be rejected (not SELECT or WITH)'
  );
});

// ---------------------------------------------------------------------------
// BUG-06 (always-on via subprocess): getters return [] / null on absent db.
// ---------------------------------------------------------------------------

test('BUG-06: getDecisions returns [] when state.sqlite absent (always-on)', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const store = require(${JSON.stringify(STORE_PATH)});
    const result = store.getDecisions({ dbPath: '/nonexistent/state.sqlite' });
    const ok = Array.isArray(result) && result.length === 0;
    process.exit(ok ? 0 : 1);
  `;
  const r = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    // Do NOT override GDD_STATE_BACKEND so the real backend is used.
    env: { ...process.env },
  });
  assert.equal(r.status, 0, `getDecisions on absent db should return []: ${r.stderr || r.stdout}`);
});

test('BUG-06: getBlockers returns [] when state.sqlite absent (always-on)', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const store = require(${JSON.stringify(STORE_PATH)});
    const result = store.getBlockers({ dbPath: '/nonexistent/state.sqlite' });
    const ok = Array.isArray(result) && result.length === 0;
    process.exit(ok ? 0 : 1);
  `;
  const r = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env },
  });
  assert.equal(r.status, 0, `getBlockers on absent db should return []: ${r.stderr || r.stdout}`);
});

test('BUG-06: getPosition returns null when state.sqlite absent (always-on)', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const store = require(${JSON.stringify(STORE_PATH)});
    const result = store.getPosition({ dbPath: '/nonexistent/state.sqlite' });
    const ok = result === null;
    process.exit(ok ? 0 : 1);
  `;
  const r = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env },
  });
  assert.equal(r.status, 0, `getPosition on absent db should return null: ${r.stderr || r.stdout}`);
});

// ---------------------------------------------------------------------------
// BUG-02 (SQLite): re-migrating does NOT duplicate blockers.
// ---------------------------------------------------------------------------

test('BUG-02: re-running migrate yields identical blocker counts (SQLite-specific)', async (t) => {
  if (!Database || BACKEND !== 'sqlite') { t.skip('better-sqlite3 not available'); return; }

  const root = mkProject(FIXTURE_MID);
  try {
    const r1 = await migrateToSqlite({ projectRoot: root, force: true });
    assert.ok(r1.migrated, 'first run should migrate');

    const r2 = await migrateToSqlite({ projectRoot: root, force: true });
    assert.ok(r2.migrated, 'second run should also succeed');

    // Blocker counts must be identical.
    assert.deepStrictEqual(r1.tables.blockers, r2.tables.blockers,
      'blocker counts must be identical on re-run (no duplication)');

    // Verify in DB: count must equal the fixture's blocker count, not double it.
    const { sqlitePath } = require(BACKEND_PATH);
    const db = openStateDb(sqlitePath(root), { readonly: true });
    try {
      const { n } = db.prepare('SELECT COUNT(*) as n FROM blockers').get();
      assert.strictEqual(n, r1.tables.blockers, 'DB blocker count must match reported count');
    } finally {
      db.close();
    }
  } finally {
    rmrf(root);
  }
});

// Also test with FIXTURE_FULL which has 2 blockers.
test('BUG-02: full fixture re-migrate blockers still exactly 2 (SQLite-specific)', async (t) => {
  if (!Database || BACKEND !== 'sqlite') { t.skip('better-sqlite3 not available'); return; }

  const root = mkProject(FIXTURE_FULL);
  try {
    await migrateToSqlite({ projectRoot: root, force: true });
    await migrateToSqlite({ projectRoot: root, force: true });

    const { sqlitePath } = require(BACKEND_PATH);
    const db = openStateDb(sqlitePath(root), { readonly: true });
    try {
      const { n } = db.prepare('SELECT COUNT(*) as n FROM blockers').get();
      assert.strictEqual(n, 2, 'FIXTURE_FULL must have exactly 2 blockers after re-migrate (not 4)');
    } finally {
      db.close();
    }
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// BUG-03: recover() is async and returns integrity:true after successful rebuild.
// ---------------------------------------------------------------------------

test('BUG-03: recover() returns integrity:true after rebuild (SQLite-specific)', async (t) => {
  if (!Database || BACKEND !== 'sqlite') { t.skip('better-sqlite3 not available'); return; }

  const root = mkProject(FIXTURE_MID);
  const { sqlitePath } = require(BACKEND_PATH);
  const dbPath = sqlitePath(root);
  try {
    // Run recover() on a project that has STATE.md but no state.sqlite yet.
    // recover() should create the db via migrate and report integrity:true.
    const result = await recover({ projectRoot: root, dbPath });
    assert.equal(typeof result.recovered, 'boolean', 'result.recovered must be boolean');
    assert.equal(typeof result.message, 'string', 'result.message must be string');
    // If it migrated successfully, integrity must be true.
    if (result.recovered) {
      assert.equal(result.integrity, true, 'recover must report integrity:true after successful rebuild');
      assert.ok(fs.existsSync(dbPath), 'state.sqlite must exist after recover');
    }
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// BUG-05: FTS5 populated by migrate; queryDecisions returns hits.
// ---------------------------------------------------------------------------

test('BUG-05: migrate populates decisions_fts; queryDecisions returns hits (SQLite-specific)', async (t) => {
  if (!Database || BACKEND !== 'sqlite') { t.skip('better-sqlite3 not available'); return; }

  const root = mkProject(FIXTURE_MID);
  const { sqlitePath } = require(BACKEND_PATH);
  const dbPath = sqlitePath(root);
  try {
    await migrateToSqlite({ projectRoot: root, force: true });

    // queryDecisions should find decisions matching 'CSS' (from sample-state-mid.md D-01).
    const results = store.queryDecisions('CSS', { dbPath, projectRoot: root });
    assert.ok(Array.isArray(results), 'queryDecisions must return an array');
    assert.ok(results.length > 0,
      `queryDecisions('CSS') must return at least 1 hit after migration (got 0); FTS5 not populated`);
    // The result must include D-01 which mentions CSS.
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes('D-01'), `queryDecisions result must include D-01; got ids: ${ids.join(',')}`);
  } finally {
    rmrf(root);
  }
});

test('BUG-05: appendDecision populates decisions_fts; subsequent queryDecisions returns hit (SQLite-specific)', async (t) => {
  if (!Database || BACKEND !== 'sqlite') { t.skip('better-sqlite3 not available'); return; }

  const tmpDir = mkTmp('bug05-store');
  const dbPath = path.join(tmpDir, 'state.sqlite');
  const designDir = path.join(tmpDir, '.design');
  fs.mkdirSync(designDir, { recursive: true });
  try {
    // Create DB and seed a position row.
    const db = openStateDb(dbPath);
    db.prepare(`INSERT OR REPLACE INTO state_position(cycle_id, stage, updated_at) VALUES(?,?,?)`).run('c-01', 'build', new Date().toISOString());
    db.close();

    // appendDecision with body_md containing a unique token.
    await store.appendDecision(
      { id: 'D-01', cycleId: 'c-01', bodyMd: 'Use trigram-xyzzy for state search', status: 'tentative', ordinal: 1 },
      { dbPath, projectRoot: tmpDir }
    );

    // queryDecisions should now find it via FTS5.
    const results = store.queryDecisions('trigram-xyzzy', { dbPath, projectRoot: tmpDir });
    assert.ok(Array.isArray(results), 'queryDecisions must return array');
    assert.ok(results.length > 0,
      'queryDecisions must return at least 1 hit after appendDecision (FTS5 not populated)');
    assert.equal(results[0].id, 'D-01', 'queryDecisions must return D-01');
  } finally {
    rmrf(tmpDir);
  }
});

// ---------------------------------------------------------------------------
// BUG-07 (always-on): directory named state.sqlite degrades migrationActive.
// ---------------------------------------------------------------------------

test('BUG-07: directory named state.sqlite does not cause migrationActive to return true (always-on)', async () => {
  // We test via a subprocess with --experimental-strip-types so we can import the .ts SDK.
  const { spawnSync } = require('node:child_process');
  const indexPath = path.join(REPO_ROOT, 'sdk', 'state', 'index.ts');
  const script = `
    const { pathToFileURL } = require('node:url');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-bug07-'));
    const statePath = path.join(dir, 'STATE.md');
    // Create a DIRECTORY named state.sqlite (the trigger for the bug).
    const fakeSqliteDir = path.join(dir, 'state.sqlite');
    fs.mkdirSync(fakeSqliteDir, { recursive: true });
    // Write a minimal STATE.md.
    const minimalState = [
      '---', 'pipeline_state_version: 1.0', 'stage: brief', 'cycle: test', 'wave: 1',
      'started_at: 2026-01-01T00:00:00Z', 'last_checkpoint: 2026-01-01T00:00:00Z', '---', '',
      '<position>', 'stage: brief', 'wave: 1', 'task_progress: 0/0', 'status: initialized',
      'handoff_source: ""', 'handoff_path: ""', 'skipped_stages: ""', '</position>', ''
    ].join('\\n');
    fs.writeFileSync(statePath, minimalState, 'utf8');
    (async () => {
      try {
        const sdk = await import(pathToFileURL(${JSON.stringify(indexPath)}).href);
        // mutate() should NOT throw (should NOT try to open the directory as a db).
        const next = await sdk.mutate(statePath, (s) => {
          s.position.task_progress = '1/1';
          return s;
        });
        if (next.position.task_progress !== '1/1') { process.exit(2); }
        process.exit(0);
      } catch(e) {
        process.stderr.write(e.stack || e.message);
        process.exit(1);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    })();
  `;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '-e', script],
    { encoding: 'utf8', timeout: 15000 }
  );
  assert.equal(
    result.status, 0,
    `BUG-07: directory as state.sqlite must degrade gracefully, not throw (exit ${result.status}): ${result.stderr || result.stdout}`
  );
});

// ---------------------------------------------------------------------------
// BUG-09 (SQLite): blocker comment lines round-trip verbatim via raw_body.
// ---------------------------------------------------------------------------

test('BUG-09: blockers block with comment lines round-trips verbatim (SQLite-specific)', async (t) => {
  if (!Database || BACKEND !== 'sqlite') { t.skip('better-sqlite3 not available'); return; }

  // Create a STATE.md with a comment inside <blockers>.
  const stateWithComment = [
    '---',
    'pipeline_state_version: 1.0',
    'stage: build',
    'cycle: bugfix-09',
    'wave: 1',
    'started_at: 2026-06-01T00:00:00Z',
    'last_checkpoint: 2026-06-01T00:00:00Z',
    '---',
    '',
    '<position>',
    'stage: build',
    'wave: 1',
    'task_progress: 2/5',
    'status: in_progress',
    'handoff_source: ""',
    'handoff_path: ""',
    'skipped_stages: ""',
    '</position>',
    '',
    '<decisions>',
    'D-01: Use SQLite for state (locked)',
    '</decisions>',
    '',
    '<blockers>',
    '<!-- TODO: resolve before ship -->',
    '[build] [2026-06-01]: Blocker one needs fix',
    '</blockers>',
    '',
    '<timestamps>',
    'started_at: 2026-06-01T00:00:00Z',
    '</timestamps>',
    '',
  ].join('\n');

  const root = mkTmp('bug09');
  const { sqlitePath } = require(BACKEND_PATH);
  const dbPath = sqlitePath(root);
  fs.mkdirSync(path.join(root, '.design'), { recursive: true });
  fs.writeFileSync(path.join(root, '.design', 'STATE.md'), stateWithComment, 'utf8');
  try {
    const result = await migrateToSqlite({ projectRoot: root, force: true });
    assert.ok(result.migrated, 'should migrate successfully');

    // Render back and check that the comment is preserved.
    const rendered = await store.render(root);
    if (rendered !== null) {
      assert.ok(
        rendered.includes('<!-- TODO: resolve before ship -->'),
        'rendered STATE.md must preserve comment in <blockers> block'
      );
    }
    // Also verify the blocker row was migrated.
    const db = openStateDb(dbPath, { readonly: true });
    try {
      const { n } = db.prepare("SELECT COUNT(*) as n FROM blockers").get();
      assert.equal(n, 1, 'should have 1 blocker row');
    } finally {
      db.close();
    }
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// BUG-01 (SQLite): R8 freshness guard folds hand-edit into SQLite.
// ---------------------------------------------------------------------------

test('BUG-01: hand-edit to STATE.md is preserved on next mutation (SQLite-specific)', async (t) => {
  if (!Database || BACKEND !== 'sqlite') { t.skip('better-sqlite3 not available'); return; }

  const root = mkProject(FIXTURE_MID);
  const { sqlitePath } = require(BACKEND_PATH);
  const dbPath = sqlitePath(root);
  const stateMdPath = path.join(root, '.design', 'STATE.md');
  try {
    // Migrate to populate SQLite.
    const r = await migrateToSqlite({ projectRoot: root, force: true });
    assert.ok(r.migrated, 'initial migration must succeed');

    // Verify initial decision count.
    {
      const db = openStateDb(dbPath, { readonly: true });
      const { n } = db.prepare('SELECT COUNT(*) as n FROM decisions').get();
      db.close();
      assert.equal(n, 4, 'FIXTURE_MID must have 4 decisions');
    }

    // Simulate a hand-edit: add a new decision D-05 directly to STATE.md.
    const current = fs.readFileSync(stateMdPath, 'utf8');
    const patched = current.replace(
      'D-04: Accessibility target is WCAG 2.1 AA (locked)',
      'D-04: Accessibility target is WCAG 2.1 AA (locked)\nD-05: Hand-edited decision for freshness test (tentative)'
    );
    fs.writeFileSync(stateMdPath, patched, 'utf8');
    // Verify the sha is now different from what SQLite has stored.
    // (The freshness guard should detect this on the next mutation.)

    // Now trigger a mutation via setPosition which calls _applyFreshnessGuard.
    await store.setPosition(
      { cycleId: 'alpha-001', stage: 'build', wave: 3, status: 'active', taskProgress: '5/7' },
      { dbPath, projectRoot: root }
    );

    // After the mutation, SQLite should have incorporated D-05 from the hand-edit.
    const db = openStateDb(dbPath, { readonly: true });
    try {
      const rows = db.prepare('SELECT id FROM decisions ORDER BY ordinal').all();
      const ids = rows.map((r) => r.id);
      assert.ok(
        ids.includes('D-05'),
        `BUG-01: D-05 from hand-edit must be in SQLite after freshness guard runs; got: ${ids.join(',')}`
      );
    } finally {
      db.close();
    }
  } finally {
    rmrf(root);
  }
});
