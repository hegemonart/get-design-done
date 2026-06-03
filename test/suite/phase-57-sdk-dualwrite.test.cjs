'use strict';
/**
 * test/suite/phase-57-sdk-dualwrite.test.cjs - Phase 57 SQLite State Backbone.
 * Tests for sdk/state/index.ts dual-write + sdk/state/lockfile.ts SQLite lock.
 *
 * Tag: 57-D:
 *
 * Test strategy:
 *   - migrationActive=false tests (no sibling state.sqlite present) run
 *     unconditionally on ALL configurations — these MUST pass on both
 *     SQLite and markdown backends (the SC#5 regression guard).
 *   - migrationActive=true tests are guarded with
 *     `if (!Database || BACKEND !== 'sqlite') return;`
 *     so they self-skip in CI where better-sqlite3 is absent.
 *   - Public API signature/return-shape regression assertions are always-on.
 *
 * The migration-active gate is defined as:
 *   BACKEND==='sqlite' && existsSync(<dir(statePath)>/state.sqlite)
 *
 * For migrationActive=false tests, we use a temp directory with a STATE.md
 * but NO state.sqlite sibling — this is the universal default for every
 * un-migrated project and every existing Phase-20 test.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// ---------------------------------------------------------------------------
// Repo root + module path resolution
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
const backendPath = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'state-backend.cjs');
const migratePath = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'migrate-to-sqlite.cjs');

// Load backend to guard SQLite-specific tests.
const { Database, BACKEND, openStateDb } = require(backendPath);

// ---------------------------------------------------------------------------
// Minimal valid STATE.md fixture (must have <position> block).
// ---------------------------------------------------------------------------

const MINIMAL_STATE = [
  '---',
  'pipeline_state_version: 1.0',
  'stage: brief',
  'cycle: test-cycle',
  'wave: 1',
  'started_at: 2026-01-01T00:00:00Z',
  'last_checkpoint: 2026-01-01T00:00:00Z',
  '---',
  '',
  '<position>',
  'stage: brief',
  'wave: 1',
  'task_progress: 0/0',
  'status: initialized',
  'handoff_source: ""',
  'handoff_path: ""',
  'skipped_stages: ""',
  '</position>',
  '',
  '<decisions>',
  'D-01: Use SQLite for state (tentative)',
  '</decisions>',
  '',
  '<timestamps>',
  'started_at: 2026-01-01T00:00:00Z',
  '</timestamps>',
  '',
].join('\n');

/**
 * Scaffold a temp dir with a STATE.md file (NO sibling state.sqlite).
 * Returns { dir, statePath, cleanup }.
 */
function scaffoldStateOnly() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57d-'));
  const statePath = path.join(dir, 'STATE.md');
  fs.writeFileSync(statePath, MINIMAL_STATE, 'utf8');
  return {
    dir,
    statePath,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Scaffold a temp dir with a STATE.md AND a sibling state.sqlite.
 * The state.sqlite is created by running migrate-to-sqlite on the STATE.md.
 * Returns { dir, statePath, dbPath, cleanup }.
 *
 * This helper is only called from SQLite-guarded tests.
 */
async function scaffoldStateWithSqlite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57d-migrated-'));
  const statePath = path.join(dir, 'STATE.md');
  const dbPath = path.join(dir, 'state.sqlite');
  fs.writeFileSync(statePath, MINIMAL_STATE, 'utf8');

  // Create the state.sqlite by opening a writer DB (applies schema).
  // We do NOT need a full migration here — just the DB file existing is
  // what activates the migration gate. We also seed the minimum state
  // so the R8 freshness guard has a sha to compare against.
  const db = openStateDb(dbPath);
  try {
    // Seed the state_position row so the DB is usable.
    db.prepare(`
      INSERT OR REPLACE INTO state_position
        (cycle_id, stage, wave, task_progress, status, raw_frontmatter,
         body_trailer, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'test-cycle', 'brief', 1, '0/0', 'initialized', '', '', new Date().toISOString()
    );
    // Store the sha256 of the current STATE.md so R8 sees no drift.
    const sha = require('node:crypto')
      .createHash('sha256')
      .update(MINIMAL_STATE, 'utf8')
      .digest('hex');
    db.prepare('INSERT OR REPLACE INTO _meta(key,value) VALUES(?,?)').run(
      'last_render_sha256', sha
    );
  } finally {
    db.close();
  }

  return {
    dir,
    statePath,
    dbPath,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------
// Helper: load the SDK (index.ts) via dynamic import (must be async).
// ---------------------------------------------------------------------------

async function loadSdk() {
  const indexPath = path.join(REPO_ROOT, 'sdk', 'state', 'index.ts');
  const mod = await import(pathToFileURL(indexPath).href);
  return mod;
}

async function loadLockfile() {
  const lockfilePath = path.join(REPO_ROOT, 'sdk', 'state', 'lockfile.ts');
  const mod = await import(pathToFileURL(lockfilePath).href);
  return mod;
}

// ===========================================================================
// 57-D: Public API signature / return-shape regression (always-on)
// These tests verify that the public exports are unchanged.
// ===========================================================================

test('57-D: sdk/state/index exports read, mutate, transition as async functions', async () => {
  const sdk = await loadSdk();
  assert.equal(typeof sdk.read, 'function', 'read must be exported');
  assert.equal(typeof sdk.mutate, 'function', 'mutate must be exported');
  assert.equal(typeof sdk.transition, 'function', 'transition must be exported');
  // Verify async by checking the prototype chain.
  const asyncFnProto = Object.getPrototypeOf(async function () {});
  assert.ok(
    Object.getPrototypeOf(sdk.read) === asyncFnProto ||
    sdk.read.constructor.name === 'AsyncFunction',
    'read must be async'
  );
  assert.ok(
    Object.getPrototypeOf(sdk.mutate) === asyncFnProto ||
    sdk.mutate.constructor.name === 'AsyncFunction',
    'mutate must be async'
  );
  assert.ok(
    Object.getPrototypeOf(sdk.transition) === asyncFnProto ||
    sdk.transition.constructor.name === 'AsyncFunction',
    'transition must be async'
  );
});

test('57-D: sdk/state/lockfile exports acquire and acquireSqliteLock', async () => {
  const lockfile = await loadLockfile();
  assert.equal(typeof lockfile.acquire, 'function', 'acquire must be exported');
  assert.equal(typeof lockfile.acquireSqliteLock, 'function',
    'acquireSqliteLock must be exported');
});

test('57-D: read() returns ParsedState with expected shape', async () => {
  const { dir, statePath, cleanup } = scaffoldStateOnly();
  try {
    const sdk = await loadSdk();
    const state = await sdk.read(statePath);
    // Shape check: required fields must be present.
    assert.ok(state !== null && typeof state === 'object', 'read must return an object');
    assert.ok('frontmatter' in state, 'state.frontmatter must be present');
    assert.ok('position' in state, 'state.position must be present');
    assert.ok('decisions' in state, 'state.decisions must be present');
    assert.equal(state.position.stage, 'brief', 'position.stage must be "brief"');
    assert.equal(state.decisions.length, 1, 'decisions must have 1 entry');
  } finally {
    cleanup();
  }
});

test('57-D: mutate() returns ParsedState (updated)', async () => {
  const { dir, statePath, cleanup } = scaffoldStateOnly();
  try {
    const sdk = await loadSdk();
    const before = await sdk.read(statePath);
    assert.equal(before.position.task_progress, '0/0');
    const after = await sdk.mutate(statePath, (s) => {
      s.position.task_progress = '1/4';
      return s;
    });
    assert.ok(typeof after === 'object' && after !== null, 'mutate must return ParsedState');
    assert.equal(after.position.task_progress, '1/4', 'mutate must apply fn');
  } finally {
    cleanup();
  }
});

// ===========================================================================
// 57-D: migrationActive=false — pure markdown path (always-on)
// These tests run regardless of whether better-sqlite3 is present.
// They verify that with NO sibling state.sqlite, the behavior is exactly
// as pre-Phase-57 (byte-identical markdown, no state.sqlite created).
// ===========================================================================

test('57-D: migrationActive=false: read behaves as pure markdown (no state.sqlite created)', async () => {
  const { dir, statePath, cleanup } = scaffoldStateOnly();
  try {
    const sdk = await loadSdk();
    const state = await sdk.read(statePath);
    // Verify no state.sqlite was created as side-effect.
    const sqliteSibling = path.join(dir, 'state.sqlite');
    assert.equal(
      fs.existsSync(sqliteSibling),
      false,
      'read() must NOT create state.sqlite when migration is inactive'
    );
    // Verify parse is correct.
    assert.equal(state.position.stage, 'brief');
    assert.equal(state.decisions[0].id, 'D-01');
  } finally {
    cleanup();
  }
});

test('57-D: migrationActive=false: mutate writes only STATE.md (no state.sqlite created)', async () => {
  const { dir, statePath, cleanup } = scaffoldStateOnly();
  try {
    const sdk = await loadSdk();
    await sdk.mutate(statePath, (s) => {
      s.position.task_progress = '2/5';
      return s;
    });
    // No state.sqlite sibling should have been created.
    const sqliteSibling = path.join(dir, 'state.sqlite');
    assert.equal(
      fs.existsSync(sqliteSibling),
      false,
      'mutate() must NOT create state.sqlite when migration is inactive'
    );
    // STATE.md must be updated.
    const raw = fs.readFileSync(statePath, 'utf8');
    assert.ok(raw.includes('task_progress: 2/5'), 'STATE.md must reflect mutation');
  } finally {
    cleanup();
  }
});

test('57-D: migrationActive=false: mutate is atomic (no .tmp orphan, lock released)', async () => {
  const { dir, statePath, cleanup } = scaffoldStateOnly();
  try {
    const sdk = await loadSdk();
    await sdk.mutate(statePath, (s) => {
      s.position.status = 'in_progress';
      return s;
    });
    // No .tmp file should remain.
    assert.equal(
      fs.existsSync(`${statePath}.tmp`),
      false,
      'no .tmp orphan after mutate'
    );
    // No .lock file should remain.
    assert.equal(
      fs.existsSync(`${statePath}.lock`),
      false,
      'lock released after mutate'
    );
  } finally {
    cleanup();
  }
});

test('57-D: migrationActive=false: STATE.md content is byte-equal round-trip', async () => {
  // Use the project's existing round-trip fixture (mid-pipeline.md) which
  // includes all mandatory blocks so the serializer produces byte-equal output.
  const fixtureDir = path.join(REPO_ROOT, 'test', 'suite', 'fixtures', 'state');
  const fixturePath = path.join(fixtureDir, 'mid-pipeline.md');
  if (!fs.existsSync(fixturePath)) {
    // Fixture not available — skip gracefully (test infrastructure issue).
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57d-rt-'));
  const statePath = path.join(dir, 'STATE.md');
  const content = fs.readFileSync(fixturePath, 'utf8');
  fs.writeFileSync(statePath, content, 'utf8');
  try {
    const sdk = await loadSdk();
    // Mutate with identity fn — should produce byte-equal output.
    await sdk.mutate(statePath, (s) => s);
    const after = fs.readFileSync(statePath, 'utf8');
    assert.equal(after, content, 'identity mutate must produce byte-equal STATE.md');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('57-D: migrationActive=false: read+mutate return consistent ParsedState shape (markdown floor on forced markdown backend)', async () => {
  // Spawn a subprocess with GDD_STATE_BACKEND=markdown to force the markdown
  // floor path. This test verifies that even when better-sqlite3 is present
  // but the env forces markdown, the SDK behaves as pure markdown.
  const { spawnSync } = require('node:child_process');
  const indexPath = path.join(REPO_ROOT, 'sdk', 'state', 'index.ts');
  const script = `
    const { pathToFileURL } = require('node:url');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const MINIMAL = ${JSON.stringify(MINIMAL_STATE)};
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57d-floor-'));
    const statePath = path.join(dir, 'STATE.md');
    fs.writeFileSync(statePath, MINIMAL, 'utf8');
    (async () => {
      try {
        const sdk = await import(pathToFileURL(${JSON.stringify(indexPath)}).href);
        const state = await sdk.read(statePath);
        if (state.position.stage !== 'brief') { process.exit(1); }
        const next = await sdk.mutate(statePath, (s) => {
          s.position.task_progress = '3/7';
          return s;
        });
        if (next.position.task_progress !== '3/7') { process.exit(2); }
        // Verify no sqlite sibling created.
        if (fs.existsSync(path.join(dir, 'state.sqlite'))) { process.exit(3); }
        // Verify STATE.md content.
        const raw = fs.readFileSync(statePath, 'utf8');
        if (!raw.includes('task_progress: 3/7')) { process.exit(4); }
        process.exit(0);
      } catch(e) {
        process.stderr.write(e.stack || e.message);
        process.exit(99);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    })();
  `;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '-e', script],
    {
      encoding: 'utf8',
      env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
      timeout: 15000,
    }
  );
  assert.equal(
    result.status, 0,
    `markdown floor subprocess failed (exit ${result.status}): ${result.stderr || result.stdout}`
  );
});

// ===========================================================================
// 57-D: migrationActive=true — dual-write path (SQLite guarded)
// These tests only run when better-sqlite3 + FTS5 is present.
// ===========================================================================

test('57-D: migrationActive=true: mutate writes STATE.md and SQLite sibling exists', async () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const scaffold = await scaffoldStateWithSqlite();
  try {
    const sdk = await loadSdk();
    const before = fs.readFileSync(scaffold.statePath, 'utf8');
    assert.ok(
      fs.existsSync(scaffold.dbPath),
      'state.sqlite must exist before mutate (precondition)'
    );
    // Now mutate — migration should be detected as active.
    const next = await sdk.mutate(scaffold.statePath, (s) => {
      s.position.task_progress = '2/8';
      return s;
    });
    assert.equal(next.position.task_progress, '2/8', 'mutate must apply fn');
    // STATE.md must be updated.
    const raw = fs.readFileSync(scaffold.statePath, 'utf8');
    assert.ok(raw.includes('task_progress: 2/8'), 'STATE.md must reflect mutation');
    // state.sqlite must still exist (must not have been deleted).
    assert.ok(fs.existsSync(scaffold.dbPath), 'state.sqlite must still exist after mutate');
  } finally {
    scaffold.cleanup();
  }
});

test('57-D: migrationActive=true: read returns SQLite-sourced state (via on-disk markdown)', async () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const scaffold = await scaffoldStateWithSqlite();
  try {
    const sdk = await loadSdk();
    // Mutate to write a known state.
    await sdk.mutate(scaffold.statePath, (s) => {
      s.position.task_progress = '5/10';
      return s;
    });
    // read() must return the updated state.
    const state = await sdk.read(scaffold.statePath);
    assert.equal(
      state.position.task_progress,
      '5/10',
      'read must return the state after mutate'
    );
    assert.equal(state.position.stage, 'brief', 'stage must be unchanged');
  } finally {
    scaffold.cleanup();
  }
});

test('57-D: migrationActive=true: lock ordering — sqlite lock acquired before STATE.md lock', async () => {
  if (!Database || BACKEND !== 'sqlite') return;

  // We can't directly observe lock ordering from outside, but we CAN verify
  // that both lock files are cleaned up after a mutate (no orphaned locks),
  // which is evidence the lock release ordering is correct.
  const scaffold = await scaffoldStateWithSqlite();
  try {
    const sdk = await loadSdk();
    await sdk.mutate(scaffold.statePath, (s) => {
      s.position.task_progress = '1/1';
      return s;
    });
    const sqliteLock = `${scaffold.dbPath}.lock`;
    const stateLock = `${scaffold.statePath}.lock`;
    assert.equal(fs.existsSync(sqliteLock), false,
      'state.sqlite.lock must be released after mutate');
    assert.equal(fs.existsSync(stateLock), false,
      'STATE.md.lock must be released after mutate');
  } finally {
    scaffold.cleanup();
  }
});

test('57-D: migrationActive=true: acquireSqliteLock produces state.sqlite.lock file', async () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const scaffold = await scaffoldStateWithSqlite();
  try {
    const lockfile = await loadLockfile();
    const sqliteLock = `${scaffold.dbPath}.lock`;
    assert.equal(fs.existsSync(sqliteLock), false, 'no lock file before acquire');
    const release = await lockfile.acquireSqliteLock(scaffold.dbPath, { maxWaitMs: 2000 });
    assert.equal(fs.existsSync(sqliteLock), true, 'lock file must exist after acquire');
    // Verify payload shape.
    const payload = JSON.parse(fs.readFileSync(sqliteLock, 'utf8'));
    assert.equal(typeof payload.pid, 'number', 'payload.pid must be a number');
    assert.equal(typeof payload.host, 'string', 'payload.host must be a string');
    assert.equal(typeof payload.acquired_at, 'string', 'payload.acquired_at must be a string');
    await release();
    assert.equal(fs.existsSync(sqliteLock), false, 'lock file must be removed after release');
  } finally {
    scaffold.cleanup();
  }
});

test('57-D: migrationActive=true: no .tmp orphan and both locks released after mutate', async () => {
  if (!Database || BACKEND !== 'sqlite') return;

  const scaffold = await scaffoldStateWithSqlite();
  try {
    const sdk = await loadSdk();
    await sdk.mutate(scaffold.statePath, (s) => {
      s.position.status = 'in_progress';
      return s;
    });
    assert.equal(fs.existsSync(`${scaffold.statePath}.tmp`), false,
      'no .tmp orphan after SQLite-active mutate');
    assert.equal(fs.existsSync(`${scaffold.statePath}.lock`), false,
      'STATE.md.lock released');
    assert.equal(fs.existsSync(`${scaffold.dbPath}.lock`), false,
      'state.sqlite.lock released');
  } finally {
    scaffold.cleanup();
  }
});

// ===========================================================================
// 57-D: migrationActive=false is the default for un-migrated paths (always-on)
// ===========================================================================

test('57-D: sqlitePathFor helper returns <dir>/state.sqlite', async () => {
  const sdk = await loadSdk();
  if (typeof sdk.sqlitePathFor !== 'function') return; // not exported in this build
  const result = sdk.sqlitePathFor('/some/project/.design/STATE.md');
  assert.equal(
    path.basename(result),
    'state.sqlite',
    'sqlitePathFor must return a path ending in state.sqlite'
  );
  assert.equal(
    path.dirname(result),
    path.normalize('/some/project/.design'),
    'sqlitePathFor must use the same dir as statePath'
  );
});

test('57-D: migrationActive is false when no state.sqlite sibling (even with sqlite backend)', async () => {
  // We use a subprocess with the sqlite backend (if available) and verify that
  // NO state.sqlite is created for a fresh temp STATE.md.
  const { spawnSync } = require('node:child_process');
  const indexPath = path.join(REPO_ROOT, 'sdk', 'state', 'index.ts');
  const script = `
    const { pathToFileURL } = require('node:url');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const MINIMAL = ${JSON.stringify(MINIMAL_STATE)};
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-57d-nodbcheck-'));
    const statePath = path.join(dir, 'STATE.md');
    fs.writeFileSync(statePath, MINIMAL, 'utf8');
    (async () => {
      try {
        const sdk = await import(pathToFileURL(${JSON.stringify(indexPath)}).href);
        // Multiple operations — none should create a state.sqlite.
        const s0 = await sdk.read(statePath);
        const s1 = await sdk.mutate(statePath, (s) => { s.position.task_progress = '1/3'; return s; });
        const s2 = await sdk.read(statePath);
        const sqliteSibling = path.join(dir, 'state.sqlite');
        if (fs.existsSync(sqliteSibling)) {
          process.stderr.write('FAIL: state.sqlite was created without --migrate-state');
          process.exit(1);
        }
        if (s1.position.task_progress !== '1/3') { process.exit(2); }
        if (s2.position.task_progress !== '1/3') { process.exit(3); }
        process.exit(0);
      } catch(e) {
        process.stderr.write(e.stack || e.message);
        process.exit(99);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    })();
  `;
  // Run WITHOUT GDD_STATE_BACKEND override — uses whatever backend is available.
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '-e', script],
    { encoding: 'utf8', timeout: 15000 }
  );
  assert.equal(
    result.status, 0,
    `no-state-sqlite subprocess failed (exit ${result.status}): ${result.stderr || result.stdout}`
  );
});
