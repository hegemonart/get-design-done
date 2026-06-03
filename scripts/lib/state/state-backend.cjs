'use strict';
/**
 * scripts/lib/state/state-backend.cjs - Phase 57 SQLite State Backbone.
 *
 * Backend probe and database helpers. Mirrors the probe pattern from
 * scripts/lib/instinct-store.cjs (Phase 51) and scripts/lib/design-search.cjs:
 *   1. probeOptional('better-sqlite3') -> Database class or null
 *   2. In-memory CREATE VIRTUAL TABLE _p USING fts5(t) probe -> _sqliteOk flag
 *   3. BACKEND = 'sqlite' when both succeed, 'markdown' otherwise
 *   4. GDD_STATE_BACKEND=markdown env override forces the markdown floor (tests use this)
 *
 * Exports: { Database, BACKEND, openStateDb, openQueryDb, checkIntegrity, sqlitePath, loadSchema }
 *
 * R4/R9/R10 compliance:
 *   - R4: better-sqlite3 only (no node:sqlite - no FTS5 support in official Node 22/24 builds)
 *   - R9: WAL journal + synchronous=NORMAL + busy_timeout=5000 + foreign_keys=ON
 *   - R10: openQueryDb uses engine-level readonly:true (engine rejects writes with SQLITE_READONLY)
 *
 * Package-root resolution: walk-up from __dirname to find package.json with
 * name === '@hegemonart/get-design-done', then resolve sdk/state/schema.sql
 * from that root. This is the Phase 53 lesson - never use __dirname-relative
 * cross-tree jumps; esbuild rewrites __dirname so fixed relative paths break.
 *
 * NEVER throws on a missing better-sqlite3 module. Always degrades to markdown floor.
 */

const fs = require('node:fs');
const path = require('node:path');

const { probeOptional } = require('../probe-optional.cjs');
const { resolveRepoRoot } = require('../worktree-resolve.cjs');

// ---------------------------------------------------------------------------
// better-sqlite3 + FTS5 backend probe (evaluated once at module load).
// Mirrors instinct-store.cjs and design-search.cjs backend selection exactly.
// ---------------------------------------------------------------------------

/** The Database constructor from better-sqlite3, or null if unavailable. */
const Database = probeOptional('better-sqlite3');

/**
 * True when better-sqlite3 is present AND its FTS5 extension is compiled in.
 * The in-memory probe matches instinct-store.cjs lines 101-110 verbatim.
 */
let _sqliteOk = false;
if (Database) {
  try {
    const probe = new Database(':memory:');
    probe.exec('CREATE VIRTUAL TABLE _p USING fts5(t)');
    probe.close();
    _sqliteOk = true;
  } catch {
    /* fts5 extension not compiled in - fall back to markdown floor */
  }
}

/**
 * GDD_STATE_BACKEND=markdown forces the markdown floor regardless of whether
 * better-sqlite3 is present. Tests use this to exercise the markdown path
 * even in environments where the native module is installed.
 */
const _envForceMarkdown = process.env.GDD_STATE_BACKEND === 'markdown';

/**
 * 'sqlite' when better-sqlite3 + FTS5 is available AND not overridden by env.
 * 'markdown' otherwise (the guaranteed fallback / CI surface).
 */
const BACKEND = (!_envForceMarkdown && _sqliteOk) ? 'sqlite' : 'markdown';

// ---------------------------------------------------------------------------
// Package-root walk-up (Phase 53 lesson: never use __dirname-relative jumps).
// Walk up from __dirname to find the GDD package root, then resolve schema.sql.
// Memoized per process.
// ---------------------------------------------------------------------------

/** @type {string|null} */
let _cachedPkgRoot = null;

/**
 * Find the GDD package root by walking up from startDir.
 * Looks for package.json with name === '@hegemonart/get-design-done'.
 * Falls back to the first directory with any package.json, then startDir.
 *
 * @param {string} startDir
 * @returns {string}
 */
function _findPackageRoot(startDir) {
  let dir = path.resolve(startDir);
  let firstWithPkg = null;
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, 'package.json');
    let pkg = null;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      pkg = null;
    }
    if (pkg) {
      if (firstWithPkg === null) firstWithPkg = dir;
      if (pkg.name === '@hegemonart/get-design-done') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return firstWithPkg || path.resolve(startDir);
}

/**
 * Resolved GDD package root, memoized. Computed from __dirname so it is
 * correct regardless of the caller's cwd (and survives esbuild bundling where
 * __dirname is rewritten to the bundle output location).
 *
 * @returns {string}
 */
function _packageRoot() {
  if (_cachedPkgRoot === null) _cachedPkgRoot = _findPackageRoot(__dirname);
  return _cachedPkgRoot;
}

// ---------------------------------------------------------------------------
// Schema loading
// ---------------------------------------------------------------------------

/** @type {string|null} Memoized schema SQL (base section only). */
let _baseSchemaSql = null;
/** @type {string|null} Memoized FTS5 section SQL. */
let _fts5SchemaSql = null;

/**
 * Read sdk/state/schema.sql from the package root and split into two sections:
 *   - base: everything before GDD_FTS5_SECTION_START
 *   - fts5: everything between GDD_FTS5_SECTION_START and GDD_FTS5_SECTION_END
 *
 * Memoized; file is read once per process.
 *
 * @returns {{ base: string, fts5: string }}
 */
function _readSchemaSql() {
  if (_baseSchemaSql !== null) return { base: _baseSchemaSql, fts5: _fts5SchemaSql || '' };

  const schemaPath = path.join(_packageRoot(), 'sdk', 'state', 'schema.sql');
  const raw = fs.readFileSync(schemaPath, 'utf8');

  const startMarker = '-- GDD_FTS5_SECTION_START';
  const endMarker = '-- GDD_FTS5_SECTION_END';
  const startIdx = raw.indexOf(startMarker);
  const endIdx = raw.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    _baseSchemaSql = raw.slice(0, startIdx).trim();
    _fts5SchemaSql = raw.slice(startIdx + startMarker.length, endIdx).trim();
  } else {
    // No FTS5 section markers found - treat the whole file as base schema.
    _baseSchemaSql = raw;
    _fts5SchemaSql = '';
  }

  return { base: _baseSchemaSql, fts5: _fts5SchemaSql };
}

/**
 * Execute schema.sql against the given database, creating all base tables.
 * FTS5 virtual tables are created only when _sqliteOk (and not env-overridden).
 *
 * Safe to call on both fresh and existing databases (CREATE TABLE IF NOT EXISTS).
 *
 * @param {import('better-sqlite3').Database} db
 */
function loadSchema(db) {
  const { base, fts5 } = _readSchemaSql();
  db.exec(base);
  // FTS5 section only when the probe confirmed FTS5 is available.
  // Do NOT use BACKEND here - loadSchema is called from openStateDb before BACKEND
  // matters. Use _sqliteOk directly (probe result, not env override).
  if (_sqliteOk && fts5) {
    try {
      db.exec(fts5);
    } catch {
      /* FTS5 section failed - base tables are still created; FTS5 is optional */
    }
  }
}

// ---------------------------------------------------------------------------
// sqlitePath - resolve the state.sqlite path in the main repo root.
// Uses worktree-resolve.cjs (Phase 49) to find .design/ in the main checkout,
// not in a throwaway worktree. Matches the pattern used by instinct-store.cjs.
// ---------------------------------------------------------------------------

/**
 * Resolve the path to state.sqlite in the main repo root's .design/ directory.
 * Worktree-safe: uses resolveRepoRoot so writes land in the main checkout even
 * when called from inside a linked worktree.
 *
 * @param {string} [projectRoot] starting directory for repo-root resolution
 *   (defaults to process.cwd())
 * @returns {string} absolute path to <repoRoot>/.design/state.sqlite
 */
function sqlitePath(projectRoot) {
  const root = resolveRepoRoot(projectRoot || process.cwd());
  return path.join(root, '.design', 'state.sqlite');
}

// ---------------------------------------------------------------------------
// openStateDb - open a writer database with WAL pragmas (R9).
// ---------------------------------------------------------------------------

/**
 * Open state.sqlite at dbPath for read-write access.
 *
 * PRAGMAs applied (R9):
 *   journal_mode=WAL     - concurrent readers while writer is active
 *   synchronous=NORMAL   - safe with WAL; fsync on checkpoints not every write
 *   busy_timeout=5000    - wait up to 5s instead of failing immediately on lock
 *   foreign_keys=ON      - enforce FK constraints
 *
 * WAL is skipped when readonly=true (cannot set WAL on a readonly connection;
 * the writer is responsible for enabling WAL on first open).
 *
 * Calls loadSchema(db) to ensure all tables exist before returning.
 *
 * NEVER call this when BACKEND === 'markdown'; callers must guard.
 *
 * @param {string} dbPath absolute path to state.sqlite
 * @param {{ readonly?: boolean }} [opts]
 * @returns {import('better-sqlite3').Database}
 */
function openStateDb(dbPath, opts = {}) {
  if (!Database) {
    throw new Error('state-backend: better-sqlite3 not available (BACKEND=markdown)');
  }
  const readonly = opts.readonly === true;
  const db = new Database(dbPath, readonly ? { readonly: true } : {});
  if (!readonly) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    loadSchema(db);
  }
  return db;
}

// ---------------------------------------------------------------------------
// openQueryDb - engine-level read-only connection (R10).
// ---------------------------------------------------------------------------

/**
 * Open state.sqlite at dbPath as a read-only connection.
 *
 * Uses engine-level readonly:true (better-sqlite3 passes SQLITE_OPEN_READONLY
 * to sqlite3_open_v2). The engine rejects all write operations with
 * SQLITE_READONLY - no schema execution is performed.
 *
 * This is the correct path for /gdd:state query (R10).
 *
 * @param {string} dbPath absolute path to state.sqlite
 * @returns {import('better-sqlite3').Database}
 */
function openQueryDb(dbPath) {
  if (!Database) {
    throw new Error('state-backend: better-sqlite3 not available (BACKEND=markdown)');
  }
  return new Database(dbPath, { readonly: true });
}

// ---------------------------------------------------------------------------
// checkIntegrity - PRAGMA integrity_check (R11 boot check).
// ---------------------------------------------------------------------------

/**
 * Run PRAGMA integrity_check on the database.
 * Returns true only when the result is a single row containing 'ok'.
 * Any corruption, error, or unexpected result returns false.
 *
 * Used by the migration boot check (R11): degrade to markdown on failure.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {boolean}
 */
function checkIntegrity(db) {
  try {
    const rows = db.pragma('integrity_check');
    // better-sqlite3 pragma() returns an array of row objects.
    // integrity_check returns [{ integrity_check: 'ok' }] on success.
    if (!Array.isArray(rows) || rows.length !== 1) return false;
    const val = rows[0];
    // The column name is 'integrity_check'.
    if (typeof val === 'object' && val !== null) {
      const v = val['integrity_check'];
      return v === 'ok';
    }
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  /**
   * The Database constructor from better-sqlite3, or null when unavailable.
   * Guards on this before calling any SQLite operation.
   */
  Database,

  /**
   * 'sqlite' when better-sqlite3+FTS5 is available and GDD_STATE_BACKEND!=markdown.
   * 'markdown' otherwise (the CI surface and guaranteed fallback).
   */
  BACKEND,

  /**
   * Open a read-write database connection with WAL pragmas + schema applied.
   * Throws when Database is null (callers should guard on BACKEND).
   */
  openStateDb,

  /**
   * Open a read-only database connection (engine-level readonly).
   * Throws when Database is null.
   */
  openQueryDb,

  /**
   * Check database integrity via PRAGMA integrity_check.
   * Returns true only for a clean 'ok' result.
   */
  checkIntegrity,

  /**
   * Resolve <repoRoot>/.design/state.sqlite (worktree-safe).
   */
  sqlitePath,

  /**
   * Execute schema.sql DDL against db (base tables always; FTS5 when _sqliteOk).
   * Safe to call on existing databases (CREATE TABLE IF NOT EXISTS).
   */
  loadSchema,
};
