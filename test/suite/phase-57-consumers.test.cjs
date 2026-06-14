'use strict';
/**
 * test/suite/phase-57-consumers.test.cjs - Phase 57 SQLite State Backbone.
 * Tests for the consumer read path (Round 3-E):
 *   - sdk/mcp/hone-state/tools/get.ts  (read via sdk/state, transparent SQLite gate)
 *   - sdk/dashboard/data/source.cjs   (loadDashboardModel backend field)
 *
 * Tag: 57-E:
 *
 * Test strategy:
 *   - Always-on (markdown floor) tests: at least 2 per consumer that run on
 *     ALL configurations regardless of better-sqlite3 availability. These are
 *     the CI surface.
 *   - SQLite-specific tests guarded with `if (!Database || BACKEND !== 'sqlite') return;`
 *     so they self-skip in CI where better-sqlite3 is absent.
 *   - MCP tool schema / return shape assertions are always-on (must never drift).
 *
 * Migration-active gate reminder:
 *   BACKEND==='sqlite' AND existsSync(<dir(statePath)>/state.sqlite)
 *
 * For markdown-floor tests we use a temp dir with a STATE.md but NO sibling
 * state.sqlite — this is the universal default and matches all Phase-20 tests.
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
      if (pkg.name === '@hegemonart/hone') return dir;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const backendPath = path.join(REPO_ROOT, 'scripts', 'lib', 'state', 'state-backend.cjs');
const sourcePath = path.join(REPO_ROOT, 'sdk', 'dashboard', 'data', 'source.cjs');

// Load backend to guard SQLite-specific tests.
const { Database, BACKEND, openStateDb } = require(backendPath);

// ---------------------------------------------------------------------------
// Minimal valid STATE.md fixture (sdk/state parser requires these fields).
// ---------------------------------------------------------------------------

const MINIMAL_STATE = [
  '---',
  'pipeline_state_version: 1.0',
  'stage: brief',
  'cycle: test-57e',
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
  'D-01: Transparent SQLite read path via dual-write (tentative)',
  '</decisions>',
  '',
  '<timestamps>',
  'started_at: 2026-01-01T00:00:00Z',
  '</timestamps>',
  '',
].join('\n');

/**
 * Scaffold a temp dir with STATE.md only (no sibling state.sqlite).
 * Migration gate is INACTIVE for this fixture.
 * Returns { dir, statePath, designDir, cleanup }.
 */
function scaffoldStateOnly() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-57e-md-'));
  const designDir = path.join(dir, '.design');
  fs.mkdirSync(designDir, { recursive: true });
  const statePath = path.join(designDir, 'STATE.md');
  fs.writeFileSync(statePath, MINIMAL_STATE, 'utf8');
  return {
    dir,
    statePath,
    designDir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Scaffold a temp dir with STATE.md AND a sibling state.sqlite.
 * Migration gate is ACTIVE for this fixture.
 * Only call from SQLite-guarded tests.
 * Returns { dir, statePath, dbPath, designDir, cleanup }.
 */
function scaffoldStateWithSqlite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-57e-sq-'));
  const designDir = path.join(dir, '.design');
  fs.mkdirSync(designDir, { recursive: true });
  const statePath = path.join(designDir, 'STATE.md');
  const dbPath = path.join(designDir, 'state.sqlite');
  fs.writeFileSync(statePath, MINIMAL_STATE, 'utf8');

  // Create the state.sqlite by opening a writer DB (applies schema).
  // The file existing is what activates the migration gate.
  const db = openStateDb(dbPath);
  try {
    db.prepare(`
      INSERT OR REPLACE INTO state_position
        (cycle_id, stage, wave, task_progress, status, raw_frontmatter,
         body_trailer, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'test-57e', 'brief', 1, '0/0', 'initialized', '', '', new Date().toISOString()
    );
    // Seed decisions row matching MINIMAL_STATE.
    db.prepare(`
      INSERT OR REPLACE INTO decisions
        (id, cycle_id, status, body_md, ordinal, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'D-01', 'test-57e', 'tentative',
      'Transparent SQLite read path via dual-write', 0,
      new Date().toISOString()
    );
    // Store sha256 of MINIMAL_STATE so R8 sees no drift.
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
    designDir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------
// Helper: load sdk/mcp/hone-state/tools/get.ts via dynamic import.
// ---------------------------------------------------------------------------

async function loadGetTool() {
  const getTsPath = path.join(REPO_ROOT, 'sdk', 'mcp', 'hone-state', 'tools', 'get.ts');
  const mod = await import(pathToFileURL(getTsPath).href);
  return mod;
}

// ---------------------------------------------------------------------------
// 57-E: MCP hone_state__get — schema / return-shape assertions (always-on)
// ---------------------------------------------------------------------------

test('57-E: get.ts exports name, schemaPath, handle as expected (always-on)', async () => {
  const getTool = await loadGetTool();
  assert.equal(getTool.name, 'hone_state__get', 'tool name must be hone_state__get');
  assert.equal(typeof getTool.schemaPath, 'string', 'schemaPath must be a string');
  assert.ok(getTool.schemaPath.includes('get.schema.json'), 'schemaPath must reference get.schema.json');
  assert.equal(typeof getTool.handle, 'function', 'handle must be a function');
});

test('57-E: get.ts handle returns {success:true, data:{state, path}} shape (always-on)', async () => {
  const { dir, designDir, cleanup } = scaffoldStateOnly();
  try {
    const getTool = await loadGetTool();
    // Override GDD_STATE_PATH so the tool reads our fixture.
    const statePath = path.join(designDir, 'STATE.md');
    const originalEnv = process.env['GDD_STATE_PATH'];
    process.env['GDD_STATE_PATH'] = statePath;
    try {
      const result = await getTool.handle({});
      // Return shape: { success: true, data: { state: {...}, path: string } }
      assert.ok(typeof result === 'object' && result !== null, 'handle must return object');
      assert.ok('success' in result, 'result must have success field');
      assert.equal(result.success, true, 'success must be true for valid STATE.md');
      assert.ok('data' in result, 'result must have data field');
      assert.ok('state' in result.data, 'data must have state field');
      assert.ok('path' in result.data, 'data must have path field');
      assert.equal(typeof result.data.path, 'string', 'path must be a string');
      // State shape must include expected top-level keys.
      assert.ok(typeof result.data.state === 'object', 'state must be an object');
      assert.ok('frontmatter' in result.data.state, 'state must have frontmatter');
      assert.ok('position' in result.data.state, 'state must have position');
    } finally {
      if (originalEnv === undefined) {
        delete process.env['GDD_STATE_PATH'];
      } else {
        process.env['GDD_STATE_PATH'] = originalEnv;
      }
    }
  } finally {
    cleanup();
  }
});

test('57-E: get.ts handle data.state does NOT contain a backend field (schema unchanged, always-on)', async () => {
  // This is the critical schema-hash-unchanged assertion.
  // The tool response schema must stay identical to the Phase-20 baseline:
  //   { success: true, data: { state: {...}, path: string } }
  // Adding a top-level "backend" to data would alter the schema hash.
  const { designDir, cleanup } = scaffoldStateOnly();
  try {
    const getTool = await loadGetTool();
    const statePath = path.join(designDir, 'STATE.md');
    const originalEnv = process.env['GDD_STATE_PATH'];
    process.env['GDD_STATE_PATH'] = statePath;
    try {
      const result = await getTool.handle({});
      assert.ok(result.success, 'handle must succeed');
      // data must have ONLY { state, path } — no additional fields were added.
      const dataKeys = Object.keys(result.data).sort();
      assert.deepEqual(dataKeys, ['path', 'state'], 'data must have exactly {state, path} — no backend field added');
    } finally {
      if (originalEnv === undefined) {
        delete process.env['GDD_STATE_PATH'];
      } else {
        process.env['GDD_STATE_PATH'] = originalEnv;
      }
    }
  } finally {
    cleanup();
  }
});

test('57-E: get.ts handle with fields projection returns only requested keys (always-on)', async () => {
  const { designDir, cleanup } = scaffoldStateOnly();
  try {
    const getTool = await loadGetTool();
    const statePath = path.join(designDir, 'STATE.md');
    const originalEnv = process.env['GDD_STATE_PATH'];
    process.env['GDD_STATE_PATH'] = statePath;
    try {
      const result = await getTool.handle({ fields: ['frontmatter'] });
      assert.ok(result.success, 'handle must succeed with fields projection');
      assert.ok('frontmatter' in result.data.state, 'projected state must contain frontmatter');
      // 'position' was not requested — should be absent in projected output.
      assert.ok(!('position' in result.data.state), 'projected state must NOT contain position when not requested');
    } finally {
      if (originalEnv === undefined) {
        delete process.env['GDD_STATE_PATH'];
      } else {
        process.env['GDD_STATE_PATH'] = originalEnv;
      }
    }
  } finally {
    cleanup();
  }
});

test('57-E: get.ts handle returns {success:false} for a missing STATE.md (always-on)', async () => {
  const getTool = await loadGetTool();
  const originalEnv = process.env['GDD_STATE_PATH'];
  process.env['GDD_STATE_PATH'] = '/tmp/nonexistent-phase-57e-state.md';
  try {
    const result = await getTool.handle({});
    assert.equal(result.success, false, 'handle must return success:false for missing file');
    assert.ok('error' in result, 'result must have error field on failure');
    assert.ok(typeof result.error.code === 'string', 'error.code must be a string');
    assert.ok(typeof result.error.message === 'string', 'error.message must be a string');
  } finally {
    if (originalEnv === undefined) {
      delete process.env['GDD_STATE_PATH'];
    } else {
      process.env['GDD_STATE_PATH'] = originalEnv;
    }
  }
});

// ---------------------------------------------------------------------------
// 57-E: get.ts — SQLite-path test (guarded: migration-active gate)
// ---------------------------------------------------------------------------

test('57-E: get.ts returns correct state when migration-active (SQLite)', async () => {
  if (!Database || BACKEND !== 'sqlite') return;
  const { designDir, cleanup } = scaffoldStateWithSqlite();
  try {
    const getTool = await loadGetTool();
    const statePath = path.join(designDir, 'STATE.md');
    const originalEnv = process.env['GDD_STATE_PATH'];
    process.env['GDD_STATE_PATH'] = statePath;
    try {
      const result = await getTool.handle({});
      // When migration is active, read() still reads from STATE.md (which the
      // dual-write path keeps byte-equal with SQLite). The shape is identical.
      assert.ok(result.success, 'handle must succeed when migration is active');
      assert.ok('state' in result.data, 'data.state must be present');
      assert.equal(result.data.state.frontmatter.cycle, 'test-57e',
        'state.frontmatter.cycle must match the fixture cycle');
      // No backend field in data — schema is unchanged.
      const dataKeys = Object.keys(result.data).sort();
      assert.deepEqual(dataKeys, ['path', 'state'],
        'data must have exactly {state, path} even when migration is active');
    } finally {
      if (originalEnv === undefined) {
        delete process.env['GDD_STATE_PATH'];
      } else {
        process.env['GDD_STATE_PATH'] = originalEnv;
      }
    }
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// 57-E: source.cjs / loadDashboardModel — backend field assertions
// ---------------------------------------------------------------------------

test('57-E: loadDashboardModel includes backend field in returned model (always-on)', async () => {
  const { dir, cleanup } = scaffoldStateOnly();
  try {
    const source = require(sourcePath);
    const model = await source.loadDashboardModel({ root: dir });
    assert.ok(typeof model === 'object' && model !== null, 'model must be an object');
    assert.ok('backend' in model, 'model must have a backend field');
    assert.ok(
      model.backend === 'sqlite' || model.backend === 'markdown',
      `model.backend must be 'sqlite' or 'markdown', got: ${model.backend}`
    );
  } finally {
    cleanup();
  }
});

test('57-E: loadDashboardModel backend field is markdown when no state.sqlite (always-on)', async () => {
  // Force markdown via env so we get a deterministic result regardless of
  // whether better-sqlite3 is present in the test environment.
  const { spawnSync } = require('node:child_process');
  const script = `
    const source = require(${JSON.stringify(sourcePath)});
    (async () => {
      // Use a temp dir with a STATE.md but no state.sqlite.
      const fs = require('node:fs');
      const os = require('node:os');
      const path = require('node:path');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-57e-floor-'));
      const designDir = path.join(dir, '.design');
      fs.mkdirSync(designDir, { recursive: true });
      fs.writeFileSync(path.join(designDir, 'STATE.md'), ${JSON.stringify(MINIMAL_STATE)}, 'utf8');
      try {
        const model = await source.loadDashboardModel({ root: dir });
        const ok = model.backend === 'markdown';
        process.exit(ok ? 0 : 1);
      } catch {
        process.exit(1);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    })().catch(() => process.exit(1));
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, GDD_STATE_BACKEND: 'markdown' },
    timeout: 15000,
  });
  assert.equal(result.status, 0,
    `markdown floor backend field test failed: ${result.stderr || result.stdout}`);
});

test('57-E: loadDashboardModel never throws even with absent .design (always-on)', async () => {
  const source = require(sourcePath);
  // Point at a non-existent project root.
  const fakeRoot = path.join(os.tmpdir(), 'hone-57e-absent-' + Date.now());
  let model;
  let threw = false;
  try {
    model = await source.loadDashboardModel({ root: fakeRoot });
  } catch {
    threw = true;
  }
  assert.ok(!threw, 'loadDashboardModel must not throw even with absent .design');
  assert.ok(typeof model === 'object' && model !== null, 'model must be an object');
  assert.ok(Array.isArray(model.degraded), 'degraded must be an array');
  assert.ok(model.degraded.length > 0, 'degraded must have at least one entry for absent .design');
  // backend must still be present and valid.
  assert.ok('backend' in model, 'model must have backend even when .design is absent');
  assert.ok(
    model.backend === 'sqlite' || model.backend === 'markdown',
    `model.backend must be 'sqlite' or 'markdown', got: ${model.backend}`
  );
});

test('57-E: loadDashboardModel state fields present when STATE.md exists (always-on)', async () => {
  const { dir, cleanup } = scaffoldStateOnly();
  try {
    const source = require(sourcePath);
    const model = await source.loadDashboardModel({ root: dir });
    // The fixture STATE.md has stage:brief, cycle:test-57e, D-01 decision.
    assert.ok(model !== null, 'model must not be null');
    assert.ok('status' in model, 'model must have status');
    assert.ok('phase' in model, 'model must have phase');
    assert.ok('cycle' in model, 'model must have cycle');
    assert.ok('decisions' in model, 'model must have decisions');
    assert.ok('blockers' in model, 'model must have blockers');
    // cycle should be parsed from MINIMAL_STATE.
    assert.equal(model.cycle, 'test-57e', 'cycle must be parsed from STATE.md frontmatter');
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// 57-E: source.cjs — SQLite-path test (guarded: migration-active gate)
// ---------------------------------------------------------------------------

test('57-E: loadDashboardModel backend is sqlite when migration-active (SQLite)', async () => {
  if (!Database || BACKEND !== 'sqlite') return;
  const { dir, cleanup } = scaffoldStateWithSqlite();
  try {
    const source = require(sourcePath);
    const model = await source.loadDashboardModel({ root: dir });
    assert.ok(!model.degraded.some((d) => d.includes('state:')),
      'no state degraded entries when STATE.md is valid and migration is active');
    assert.equal(model.backend, 'sqlite',
      'backend must be sqlite when migration is active and better-sqlite3 present');
    assert.equal(model.cycle, 'test-57e',
      'cycle must be read from STATE.md (which dual-write keeps byte-equal with SQLite)');
    assert.ok(Array.isArray(model.decisions), 'decisions must be an array');
  } finally {
    cleanup();
  }
});

test('57-E: loadDashboardModel backend is markdown when migration is NOT active (SQLite present, no sqlite sibling)', async () => {
  if (!Database || BACKEND !== 'sqlite') return;
  // State-only fixture: STATE.md present, no state.sqlite.
  // Even though better-sqlite3 is available, migration is NOT active.
  const { dir, cleanup } = scaffoldStateOnly();
  try {
    const source = require(sourcePath);
    const model = await source.loadDashboardModel({ root: dir });
    assert.equal(model.backend, 'markdown',
      'backend must be markdown when state.sqlite sibling does not exist');
  } finally {
    cleanup();
  }
});
