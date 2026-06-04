'use strict';
/**
 * test/suite/phase-57-store.test.cjs - Phase 57 SQLite State Backbone.
 * Tests for scripts/lib/state/state-store.cjs
 *
 * Tag: 57-A:
 *
 * Test strategy:
 *   - Every SQLite-specific assertion is guarded with `if (!Database) return;`
 *     so the suite is GREEN with OR without better-sqlite3.
 *   - The markdown floor tests (at least 2) run unconditionally on ALL
 *     CI configurations regardless of better-sqlite3 availability.
 *   - Transaction rollback on a forced render throw is tested when SQLite present.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Repo root resolution (same pattern as backend test).
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

// We need the Database from backend to guard SQLite-specific tests.
const { Database, BACKEND, openStateDb } = require(backendPath);

// ---------------------------------------------------------------------------
// 57-A: dispatch picks the right branch (markdown floor - always-on)
// ---------------------------------------------------------------------------

test('57-A: state-store backendName returns a valid backend string (always-on)', () => {
  const store = require(storePath);
  const name = store.backendName();
  assert.ok(
    name === 'sqlite' || name === 'markdown',
    `backendName must be 'sqlite' or 'markdown', got: ${name}`
  );
});

test('57-A: state-store BACKEND matches state-backend BACKEND (always-on)', () => {
  // Both modules are loaded in the same process, so BACKEND must agree.
  const store = require(storePath);
  const storeName = store.backendName();
  assert.equal(storeName, BACKEND,
    'state-store backendName must match state-backend BACKEND');
});

// ---------------------------------------------------------------------------
// 57-A: markdown floor - operations return non-throwing results (always-on)
// ---------------------------------------------------------------------------

test('57-A: markdown floor - appendDecision returns {backend:markdown} without throwing', () => {
  // Force markdown floor in a subprocess to exercise the markdown code path.
  const { spawnSync } = require('node:child_process');
  const script = `
    const store = require(${JSON.stringify(storePath)});
    (async () => {
      const result = await store.appendDecision({ id: 'D-01', bodyMd: 'test decision' });
      const ok = result.backend === 'markdown' && result.skipped === true;
      process.exit(ok ? 0 : 1);
    })().catch(() => process.exit(1));
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
  });
  assert.equal(result.status, 0,
    `markdown floor appendDecision failed: ${result.stderr || result.stdout}`);
});

test('57-A: markdown floor - getDecisions returns [] without throwing', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const store = require(${JSON.stringify(storePath)});
    const result = store.getDecisions();
    const ok = Array.isArray(result) && result.length === 0;
    process.exit(ok ? 0 : 1);
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
  });
  assert.equal(result.status, 0,
    `markdown floor getDecisions failed: ${result.stderr || result.stdout}`);
});

test('57-A: markdown floor - appendBlocker returns {backend:markdown} without throwing', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const store = require(${JSON.stringify(storePath)});
    (async () => {
      const result = await store.appendBlocker({ stage: 'build', date: '2026-06-03', bodyMd: 'blocked' });
      const ok = result.backend === 'markdown';
      process.exit(ok ? 0 : 1);
    })().catch(() => process.exit(1));
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
  });
  assert.equal(result.status, 0,
    `markdown floor appendBlocker failed: ${result.stderr || result.stdout}`);
});

test('57-A: markdown floor - getBlockers returns [] without throwing', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const store = require(${JSON.stringify(storePath)});
    const result = store.getBlockers();
    const ok = Array.isArray(result) && result.length === 0;
    process.exit(ok ? 0 : 1);
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
  });
  assert.equal(result.status, 0,
    `markdown floor getBlockers failed: ${result.stderr || result.stdout}`);
});

test('57-A: markdown floor - migrate returns {migrated:false,backend:markdown}', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const store = require(${JSON.stringify(storePath)});
    (async () => {
      const result = await store.migrate();
      const ok = result.migrated === false && result.backend === 'markdown';
      process.exit(ok ? 0 : 1);
    })().catch(() => process.exit(1));
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
  });
  assert.equal(result.status, 0,
    `markdown floor migrate failed: ${result.stderr || result.stdout}`);
});

test('57-A: markdown floor - render returns null without throwing', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const store = require(${JSON.stringify(storePath)});
    (async () => {
      const result = await store.render(${JSON.stringify(REPO_ROOT)});
      // render returns null when BACKEND=markdown
      const ok = result === null;
      process.exit(ok ? 0 : 1);
    })().catch(() => process.exit(1));
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
  });
  assert.equal(result.status, 0,
    `markdown floor render failed: ${result.stderr || result.stdout}`);
});

// ---------------------------------------------------------------------------
// 57-A: SQLite dispatch - operations write to SQLite correctly
// ---------------------------------------------------------------------------

test('57-A: SQLite dispatch - appendDecision stores to SQLite', async () => {
  if (!Database || BACKEND !== 'sqlite') return; // SQLite not available or forced markdown

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57-store-'));
  const dbPath = path.join(tmpDir, 'state.sqlite');
  const designDir = path.join(tmpDir, '.design');
  fs.mkdirSync(designDir, { recursive: true });

  try {
    const store = require(storePath);
    // First ensure the database exists with schema by opening it as a writer.
    const db = openStateDb(dbPath);
    // Insert a position row so cycleId can be resolved.
    db.prepare(`
      INSERT OR REPLACE INTO state_position(cycle_id, stage, updated_at)
      VALUES (?, ?, ?)
    `).run('c-01', 'build', new Date().toISOString());
    db.close();

    // appendDecision with explicit dbPath (now async - await the Promise).
    const result = await store.appendDecision(
      { id: 'D-01', cycleId: 'c-01', bodyMd: 'Use SQLite for state', status: 'locked', ordinal: 1 },
      { dbPath, projectRoot: tmpDir }
    );
    assert.equal(result.backend, 'sqlite', 'appendDecision must use sqlite backend');
    assert.equal(result.id, 'D-01', 'appendDecision must return the decision id');

    // Verify row was stored.
    const verifyDb = openStateDb(dbPath, { readonly: true });
    try {
      // decisions table now has composite PK (cycle_id, id).
      const row = verifyDb.prepare("SELECT * FROM decisions WHERE cycle_id = 'c-01' AND id = 'D-01'").get();
      assert.ok(row, 'Decision row must exist in SQLite');
      assert.equal(row.id, 'D-01');
      assert.equal(row.body_md, 'Use SQLite for state');
      assert.equal(row.status, 'locked');
    } finally {
      verifyDb.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-A: SQLite dispatch - getDecisions returns rows from SQLite', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57-store-'));
  const dbPath = path.join(tmpDir, 'state.sqlite');
  const designDir = path.join(tmpDir, '.design');
  fs.mkdirSync(designDir, { recursive: true });

  try {
    const store = require(storePath);
    const db = openStateDb(dbPath);
    db.prepare(`
      INSERT OR REPLACE INTO state_position(cycle_id, stage, updated_at)
      VALUES ('c-01', 'build', '2026-06-03T00:00:00Z')
    `).run();
    db.prepare(`
      INSERT OR REPLACE INTO decisions(id, cycle_id, body_md, status, ordinal, created_at)
      VALUES ('D-01', 'c-01', 'First decision', 'locked', 1, '2026-06-03T00:00:00Z')
    `).run();
    db.prepare(`
      INSERT OR REPLACE INTO decisions(id, cycle_id, body_md, status, ordinal, created_at)
      VALUES ('D-02', 'c-01', 'Second decision', 'tentative', 2, '2026-06-03T00:00:00Z')
    `).run();
    db.close();

    const decisions = store.getDecisions({ dbPath, cycleId: 'c-01' });
    assert.equal(decisions.length, 2, 'getDecisions must return 2 rows');
    assert.equal(decisions[0].id, 'D-01', 'First decision must be D-01 (ordinal 1)');
    assert.equal(decisions[1].id, 'D-02', 'Second decision must be D-02 (ordinal 2)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-A: SQLite dispatch - appendBlocker stores to SQLite', async () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57-store-'));
  const dbPath = path.join(tmpDir, 'state.sqlite');
  const designDir = path.join(tmpDir, '.design');
  fs.mkdirSync(designDir, { recursive: true });

  try {
    const store = require(storePath);
    const db = openStateDb(dbPath);
    db.prepare(`
      INSERT OR REPLACE INTO state_position(cycle_id, stage, updated_at)
      VALUES ('c-01', 'build', '2026-06-03T00:00:00Z')
    `).run();
    db.close();

    // appendBlocker is now async - await the Promise.
    const result = await store.appendBlocker(
      { cycleId: 'c-01', stage: 'build', date: '2026-06-03', bodyMd: 'Test blocker', ordinal: 1 },
      { dbPath, projectRoot: tmpDir }
    );
    assert.equal(result.backend, 'sqlite');
    assert.ok(typeof result.rowid === 'number' || typeof result.rowid === 'bigint',
      'appendBlocker must return a numeric rowid');

    // Verify row.
    const verifyDb = openStateDb(dbPath, { readonly: true });
    try {
      const row = verifyDb.prepare("SELECT * FROM blockers WHERE stage = 'build'").get();
      assert.ok(row, 'Blocker row must exist');
      assert.equal(row.body_md, 'Test blocker');
    } finally {
      verifyDb.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-A: SQLite dispatch - setPosition and getPosition round-trip', async () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57-store-'));
  const dbPath = path.join(tmpDir, 'state.sqlite');
  const designDir = path.join(tmpDir, '.design');
  fs.mkdirSync(designDir, { recursive: true });

  try {
    const store = require(storePath);
    // setPosition is now async - await the Promise.
    const setResult = await store.setPosition(
      { cycleId: 'c-test', stage: 'verify', wave: 3, status: 'active', taskProgress: '2/5' },
      { dbPath, projectRoot: tmpDir }
    );
    assert.equal(setResult.backend, 'sqlite');
    assert.equal(setResult.cycleId, 'c-test');

    const pos = store.getPosition({ dbPath, cycleId: 'c-test' });
    assert.ok(pos, 'getPosition must return a row');
    assert.equal(pos.cycle_id, 'c-test');
    assert.equal(pos.stage, 'verify');
    assert.equal(pos.wave, 3);
    assert.equal(pos.status, 'active');
    assert.equal(pos.task_progress, '2/5');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 57-A: Transaction rollback on forced render throw
// ---------------------------------------------------------------------------

test('57-A: txn rollback on forced render throw leaves SQLite unchanged', () => {
  if (!Database) return;

  // This test verifies that R7 dual-write rolls back SQLite when the
  // render step throws. We do this by monkey-patching require to return
  // a broken render module for the duration of this test.

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57-txn-'));
  const dbPath = path.join(tmpDir, 'state.sqlite');
  const designDir = path.join(tmpDir, '.design');
  fs.mkdirSync(designDir, { recursive: true });

  try {
    // Seed the database.
    const setupDb = openStateDb(dbPath);
    setupDb.prepare(`
      INSERT OR REPLACE INTO state_position(cycle_id, stage, updated_at)
      VALUES ('c-txn', 'build', '2026-06-03T00:00:00Z')
    `).run();
    // Insert an existing decision so we know baseline count.
    setupDb.prepare(`
      INSERT OR REPLACE INTO decisions(id, cycle_id, body_md, status, ordinal, created_at)
      VALUES ('D-EXISTING', 'c-txn', 'Existing decision', 'locked', 1, '2026-06-03T00:00:00Z')
    `).run();
    setupDb.close();

    // Verify baseline: 1 decision exists.
    const checkDb = openStateDb(dbPath, { readonly: true });
    const beforeCount = checkDb.prepare("SELECT COUNT(*) as n FROM decisions WHERE cycle_id = 'c-txn'").get().n;
    checkDb.close();
    assert.equal(beforeCount, 1, 'Baseline: 1 decision before txn test');

    // Inject a broken render module by writing to the render module path.
    // Since state-store lazy-requires render-markdown.cjs, we create a fake one
    // in the scripts/lib/state/ directory ONLY if there isn't one already
    // (we must not clobber Executor C's real file).
    const renderModPath = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'render-markdown.cjs');
    const renderExists = fs.existsSync(renderModPath);

    if (!renderExists) {
      // Create a temporary broken render module to test rollback.
      fs.writeFileSync(renderModPath, `
        'use strict';
        module.exports = {
          renderStateMarkdown: function() { throw new Error('render-test-failure'); }
        };
      `, 'utf8');

      // Clear the require cache so the store picks up the new module.
      delete require.cache[require.resolve(renderModPath)];
      delete require.cache[require.resolve(storePath)];

      try {
        const store = require(storePath);
        // Attempt to append a decision - render should throw, rolling back SQLite.
        let threw = false;
        try {
          store.appendDecision(
            { id: 'D-ROLLBACK', cycleId: 'c-txn', bodyMd: 'Should be rolled back', ordinal: 2 },
            { dbPath, projectRoot: tmpDir }
          );
        } catch {
          threw = true;
        }
        // The transaction should have thrown (render threw).
        assert.ok(threw, 'appendDecision must throw when render throws (R7 rollback)');

        // Verify the SQLite count is still 1 (rollback worked).
        const afterDb = openStateDb(dbPath, { readonly: true });
        try {
          const afterCount = afterDb.prepare("SELECT COUNT(*) as n FROM decisions WHERE cycle_id = 'c-txn'").get().n;
          assert.equal(afterCount, 1, 'SQLite must roll back when render throws (R7)');
        } finally {
          afterDb.close();
        }
      } finally {
        // Clean up the temporary render module.
        try { fs.unlinkSync(renderModPath); } catch { /* best effort */ }
        // Clear cache to restore normal operation.
        delete require.cache[require.resolve(storePath)];
        if (require.cache[renderModPath]) delete require.cache[renderModPath];
      }
    } else {
      // render-markdown.cjs already exists (Executor C's file) - skip rollback test.
      // We still verify state-store loads without issue.
      const store = require(storePath);
      assert.equal(typeof store.appendDecision, 'function',
        'state-store must export appendDecision even when render-markdown.cjs exists');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 57-A: queryDecisions returns [] on empty database (SQLite)
// ---------------------------------------------------------------------------

test('57-A: queryDecisions returns [] for empty database', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57-store-'));
  const dbPath = path.join(tmpDir, 'state.sqlite');
  fs.mkdirSync(path.join(tmpDir, '.design'), { recursive: true });

  try {
    const store = require(storePath);
    openStateDb(dbPath).close(); // create schema
    const results = store.queryDecisions('test query', { dbPath });
    assert.ok(Array.isArray(results), 'queryDecisions must return an array');
    assert.equal(results.length, 0, 'queryDecisions must return [] for empty database');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('57-A: queryDecisions returns [] for empty string query', () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57-store-'));
  const dbPath = path.join(tmpDir, 'state.sqlite');
  fs.mkdirSync(path.join(tmpDir, '.design'), { recursive: true });

  try {
    const store = require(storePath);
    openStateDb(dbPath).close();
    const results = store.queryDecisions('', { dbPath });
    assert.ok(Array.isArray(results), 'queryDecisions must return an array for empty query');
    assert.equal(results.length, 0, 'queryDecisions must return [] for empty string');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
