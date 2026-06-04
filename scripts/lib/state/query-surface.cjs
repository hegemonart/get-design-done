'use strict';
/**
 * scripts/lib/state/query-surface.cjs - Phase 57 (SAFE-01 / CONS-03)
 *
 * Public query surface for the /gdd:state skill subcommands:
 *   query(sql, opts)           - readonly SELECT-only execution with denylist
 *   recover(opts)              - rotate corrupt .sqlite to .bak, rebuild from markdown
 *   demigrate(opts)            - remove .design/state.sqlite so markdown becomes SoT
 *   rotateBak(dbPath)          - shift .bak.0..9 (cap at 10); used internally
 *   backupCycle(opts)          - take a named backup of the current sqlite
 *
 * All functions degrade gracefully when BACKEND==='markdown' (clear message, no throw).
 *
 * R10 compliance:
 *   - engine-level readonly:true via openQueryDb (SQLITE_OPEN_READONLY; engine rejects
 *     writes with SQLITE_READONLY even before denylist)
 *   - defense-in-depth: first-token Set denylist {DROP,DELETE,UPDATE,INSERT,ALTER,
 *     ATTACH,CREATE,PRAGMA,VACUUM,ANALYZE,REINDEX,REPLACE} via Set.has() - NO regex,
 *     no ReDoS. Throws on denied or non-SELECT first token.
 */

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Package-root walk-up (Phase 53 lesson).
// ---------------------------------------------------------------------------
function _findPackageRoot(startDir) {
  let dir = path.resolve(startDir);
  let firstWithPkg = null;
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, 'package.json');
    let pkg = null;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { pkg = null; }
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

const PKG_ROOT = _findPackageRoot(__dirname);

// ---------------------------------------------------------------------------
// Lazy-require state-backend.cjs (loaded on first call so optional better-sqlite3
// binding does not crash module load).
// ---------------------------------------------------------------------------
let _backend = null;
function _requireBackend() {
  if (_backend) return _backend;
  try {
    _backend = require('./state-backend.cjs');
  } catch {
    // Try from package root
    try {
      _backend = require(path.join(PKG_ROOT, 'scripts', 'lib', 'state', 'state-backend.cjs'));
    } catch {
      _backend = null;
    }
  }
  return _backend;
}

// ---------------------------------------------------------------------------
// Lazy-require migrate-to-sqlite.cjs - used by recover().
// ---------------------------------------------------------------------------
let _migrate = null;
function _requireMigrate() {
  if (_migrate) return _migrate;
  try {
    _migrate = require('./migrate-to-sqlite.cjs');
  } catch {
    try {
      _migrate = require(path.join(PKG_ROOT, 'scripts', 'lib', 'state', 'migrate-to-sqlite.cjs'));
    } catch {
      _migrate = null;
    }
  }
  return _migrate;
}

// ---------------------------------------------------------------------------
// First-token Set denylist (R10, defense-in-depth).
// Set.has() — NO regex — no ReDoS.
// These tokens are denied even though engine readonly prevents them anyway.
// ---------------------------------------------------------------------------
const DENIED_TOKENS = new Set([
  'DROP',
  'DELETE',
  'UPDATE',
  'INSERT',
  'ALTER',
  'ATTACH',
  'CREATE',
  'PRAGMA',
  'VACUUM',
  'ANALYZE',
  'REINDEX',
  'REPLACE',
]);

/**
 * Extract the first SQL token (uppercase) from a query string.
 * Strips leading whitespace and comments (-- and /* style).
 * @param {string} sql
 * @returns {string} uppercased first token, or '' if empty
 */
function _firstToken(sql) {
  if (typeof sql !== 'string') return '';
  // Strip leading whitespace.
  let s = sql.trimStart();
  // Strip single-line comments (-- ...).
  while (s.startsWith('--')) {
    const nl = s.indexOf('\n');
    s = (nl === -1 ? '' : s.slice(nl + 1)).trimStart();
  }
  // Strip block comments (/* ... */).
  if (s.startsWith('/*')) {
    const end = s.indexOf('*/');
    s = (end === -1 ? '' : s.slice(end + 2)).trimStart();
  }
  // Extract first alphanumeric token.
  const m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  return m ? m[1].toUpperCase() : '';
}

/**
 * Assert that the SQL query is a safe readonly SELECT (or CTE: WITH ... SELECT).
 * Throws with a descriptive message when the first token is denied or not SELECT/WITH.
 *
 * BUG-11: allow a leading WITH token for CTEs (WITH ... SELECT ...).
 * The engine-level readonly connection already blocks any write CTE.
 * We keep blocking all other non-SELECT first tokens.
 *
 * @param {string} sql
 */
function _assertReadonly(sql) {
  const token = _firstToken(sql);
  if (token === '') {
    throw new Error('query-surface: empty query rejected');
  }
  if (DENIED_TOKENS.has(token)) {
    throw new Error(
      `query-surface: statement type '${token}' is not allowed (denylist). Only SELECT is permitted.`
    );
  }
  // Allow WITH for CTEs (WITH ... SELECT ...) — engine readonly blocks any write CTE.
  if (token !== 'SELECT' && token !== 'WITH') {
    throw new Error(
      `query-surface: first token '${token}' is not SELECT. Only SELECT queries are permitted.`
    );
  }
}

// ---------------------------------------------------------------------------
// query(sql, opts) - readonly SELECT-only execution.
// ---------------------------------------------------------------------------

/**
 * Execute a readonly SQL SELECT query against the state SQLite database.
 *
 * Guards:
 *   1. BACKEND must be 'sqlite' (else returns degraded message object)
 *   2. First-token denylist check (throws on denied)
 *   3. Engine-level readonly:true connection (engine rejects writes)
 *
 * @param {string} sql
 * @param {{ projectRoot?: string, dbPath?: string }} [opts]
 * @returns {{ rows: Array<object>, backend: string } | { degraded: true, message: string }}
 */
function query(sql, opts = {}) {
  const backend = _requireBackend();
  if (!backend || backend.BACKEND !== 'sqlite') {
    return {
      degraded: true,
      message: 'query-surface: BACKEND is not sqlite (better-sqlite3 not available or GDD_STATE_BACKEND=markdown). ' +
        'Query is a no-op on the markdown floor.',
    };
  }

  // Defense-in-depth: denylist check before the engine connection.
  // Throws on denied token or non-SELECT.
  _assertReadonly(sql);

  const dbPath = opts.dbPath || backend.sqlitePath(opts.projectRoot || process.cwd());
  if (!fs.existsSync(dbPath)) {
    return {
      degraded: true,
      message: `query-surface: state.sqlite not found at ${dbPath}. Run --migrate-state first.`,
    };
  }

  const db = backend.openQueryDb(dbPath);
  try {
    const rows = db.prepare(sql).all();
    return { rows, backend: 'sqlite' };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// _safeBackup(srcPath, bakPath) - H5 backup-guard.
//
// Copy srcPath to bakPath, then verify the backup exists AND is non-empty
// AFTER the copy. Returns true only when the backup is a faithful non-empty
// copy of the source. Callers MUST check the return value before unlinking
// the source - the dangerous pattern is `copy → unconditional unlink`, where
// a silent copy failure (or zero-byte destination) means the unlink deletes
// the only remaining data.
//
// Defensive: never throws. Returns false on any error or empty backup.
//
// @param {string} srcPath path to source file (must exist)
// @param {string} bakPath path for the backup (created/overwritten)
// @returns {boolean} true iff bakPath exists and is non-empty after copy
// ---------------------------------------------------------------------------

function _safeBackup(srcPath, bakPath) {
  try {
    fs.copyFileSync(srcPath, bakPath);
  } catch {
    return false;
  }
  // Post-copy verification: the backup must EXIST and be NON-EMPTY.
  // copyFileSync can silently produce a 0-byte file in some failure modes
  // (interrupted IO, full disk after open). An empty backup is not a backup;
  // unlinking the source after one would destroy the data.
  try {
    const st = fs.statSync(bakPath);
    if (!st.isFile() || st.size === 0) return false;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// rotateBak(dbPath) - shift .bak.0..9, cap at 10.
// ---------------------------------------------------------------------------

/**
 * Rotate backup files for dbPath, keeping at most 10 (indices 0..9).
 * Shift: .bak.8 -> .bak.9, .bak.7 -> .bak.8, ..., .bak.0 -> .bak.1
 * The slot .bak.0 is then free for the caller to write the current db.
 *
 * @param {string} dbPath absolute path to the .sqlite file
 */
function rotateBak(dbPath) {
  // Cap: shift indices 8..0 up by 1 (9 is dropped if it exists), then free slot 0.
  for (let i = 8; i >= 0; i--) {
    const src = `${dbPath}.bak.${i}`;
    const dst = `${dbPath}.bak.${i + 1}`;
    if (fs.existsSync(src)) {
      // Remove destination if it exists (cap at 10 means .bak.9 is overwritten).
      try { fs.unlinkSync(dst); } catch { /* ok if missing */ }
      try { fs.renameSync(src, dst); } catch { /* best-effort */ }
    }
  }
}

// ---------------------------------------------------------------------------
// backupCycle(opts) - copy current sqlite to .bak.0 after rotation.
// ---------------------------------------------------------------------------

/**
 * Take a backup of the current state.sqlite (rotate existing backups first).
 *
 * @param {{ projectRoot?: string, dbPath?: string }} [opts]
 * @returns {{ backed_up: boolean, path?: string, message?: string }}
 */
function backupCycle(opts = {}) {
  const backend = _requireBackend();
  if (!backend || backend.BACKEND !== 'sqlite') {
    return { backed_up: false, message: 'backupCycle: BACKEND is not sqlite; skipped.' };
  }
  const dbPath = opts.dbPath || backend.sqlitePath(opts.projectRoot || process.cwd());
  if (!fs.existsSync(dbPath)) {
    return { backed_up: false, message: `backupCycle: ${dbPath} does not exist; nothing to back up.` };
  }
  rotateBak(dbPath);
  const bak0 = `${dbPath}.bak.0`;
  if (_safeBackup(dbPath, bak0)) {
    return { backed_up: true, path: bak0 };
  }
  return { backed_up: false, message: `backupCycle: copy failed or backup is empty at ${bak0}` };
}

// ---------------------------------------------------------------------------
// demigrate(opts) - remove .design/state.sqlite so markdown becomes SoT.
// Idempotent: no-op if the file does not exist.
// ---------------------------------------------------------------------------

/**
 * Remove .design/state.sqlite so the markdown STATE.md becomes the SoT again.
 * Idempotent: if state.sqlite does not exist, returns a clear message without error.
 *
 * @param {{ projectRoot?: string, dbPath?: string }} [opts]
 * @returns {{ demigrated: boolean, message: string }}
 */
function demigrate(opts = {}) {
  const backend = _requireBackend();
  if (!backend) {
    // state-backend.cjs not available at all; no sqlite to remove.
    return { demigrated: false, message: 'demigrate: state-backend.cjs not available; nothing to remove.' };
  }
  // sqlitePath is always safe to call regardless of BACKEND.
  const dbPath = opts.dbPath || backend.sqlitePath(opts.projectRoot || process.cwd());
  if (!fs.existsSync(dbPath)) {
    return {
      demigrated: false,
      message: `demigrate: ${dbPath} does not exist; markdown is already the SoT (no-op).`,
    };
  }
  // Take a backup before removing.
  // H5 backup-guard: only unlink when the backup is a faithful non-empty copy.
  // If the copy failed (or produced a 0-byte file), refuse to unlink the source -
  // we'd be deleting the only remaining data.
  rotateBak(dbPath);
  const bak0 = `${dbPath}.bak.0`;
  if (!_safeBackup(dbPath, bak0)) {
    return {
      demigrated: false,
      message: `demigrate: refusing to remove ${dbPath} - backup at ${bak0} ` +
        `is missing or empty after copyFileSync (would lose data).`,
    };
  }
  try {
    fs.unlinkSync(dbPath);
  } catch (err) {
    return { demigrated: false, message: `demigrate: failed to remove ${dbPath}: ${err.message}` };
  }
  return {
    demigrated: true,
    message: `demigrate: removed ${dbPath}. Markdown STATE.md is now the SoT. ` +
      `A backup was saved to ${bak0}.`,
  };
}

// ---------------------------------------------------------------------------
// recover(opts) - rotate current sqlite to .bak.0, rebuild via migrate-to-sqlite
// force-mode from the markdown STATE.md.
// ---------------------------------------------------------------------------

/**
 * Recover a corrupt or missing state.sqlite by rebuilding it from the markdown STATE.md.
 *
 * Steps:
 *   1. If state.sqlite exists, rotate it to .bak.0 (backup of the corrupt file).
 *   2. Remove the corrupt .sqlite so migrate-to-sqlite can write a fresh one.
 *   3. Invoke migrate-to-sqlite with force:true to rebuild from markdown.
 *   4. Run integrity_check on the new database.
 *
 * BUG-03/08: recover() is now async — it awaits migrateToSqlite() so that
 * state.sqlite actually exists before the integrity check is run.
 *
 * @param {{ projectRoot?: string, dbPath?: string }} [opts]
 * @returns {Promise<{ recovered: boolean, message: string, integrity?: boolean }>}
 */
async function recover(opts = {}) {
  const backend = _requireBackend();
  if (!backend || backend.BACKEND !== 'sqlite') {
    return {
      recovered: false,
      message: 'recover: BACKEND is not sqlite (better-sqlite3 not available or GDD_STATE_BACKEND=markdown). ' +
        'Markdown STATE.md is already the SoT; no SQLite to recover.',
    };
  }

  const dbPath = opts.dbPath || backend.sqlitePath(opts.projectRoot || process.cwd());

  // Step 1: Rotate existing (possibly corrupt) file to .bak.0.
  // H5 backup-guard: only unlink the source after a verified non-empty backup.
  // For recover() the source MAY already be corrupt - so an empty/failed backup
  // is still significant signal. We refuse to unlink when the backup is missing
  // OR zero bytes, so the operator retains a copy of the corrupt file for
  // diagnostics. The caller can manually delete and retry once the backup
  // location is writable.
  if (fs.existsSync(dbPath)) {
    rotateBak(dbPath);
    const bak0 = `${dbPath}.bak.0`;
    if (!_safeBackup(dbPath, bak0)) {
      return {
        recovered: false,
        message: `recover: refusing to remove ${dbPath} - backup at ${bak0} ` +
          `is missing or empty after copyFileSync (would lose corrupt file ` +
          `before rebuild). Resolve disk/permission issues and retry.`,
      };
    }
    try { fs.unlinkSync(dbPath); } catch (err) {
      return { recovered: false, message: `recover: could not remove corrupt ${dbPath}: ${err.message}` };
    }
  }

  // Step 2: Rebuild from markdown.
  const migrate = _requireMigrate();
  if (!migrate) {
    return {
      recovered: false,
      message: 'recover: migrate-to-sqlite.cjs could not be loaded (require failed). ' +
        'Cannot rebuild SQLite from markdown.',
    };
  }

  let migrateResult = null;
  try {
    if (typeof migrate.migrateToSqlite === 'function') {
      // BUG-03/08: await the async migrateToSqlite so state.sqlite is written before
      // the integrity check below. Without await, recover() returned before the DB
      // existed, causing integrity:false on every call.
      migrateResult = await migrate.migrateToSqlite({
        projectRoot: opts.projectRoot,
        dbPath,
        force: true,
      });
    } else if (typeof migrate.migrate === 'function') {
      migrateResult = await migrate.migrate({ projectRoot: opts.projectRoot, dbPath, force: true });
    } else {
      return { recovered: false, message: 'recover: migrate-to-sqlite.cjs has no recognized export.' };
    }
  } catch (err) {
    return { recovered: false, message: `recover: migration threw: ${err.message}` };
  }

  // Step 3: Integrity check on the newly written database.
  let integrity = false;
  if (fs.existsSync(dbPath)) {
    try {
      const db = backend.openStateDb(dbPath, { readonly: true });
      try { integrity = backend.checkIntegrity(db); } finally { db.close(); }
    } catch { integrity = false; }
  }

  return {
    recovered: true,
    integrity,
    migration: migrateResult,
    message: `recover: rebuilt ${dbPath} from markdown STATE.md. integrity_check=${integrity ? 'ok' : 'FAILED'}.`,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  query,
  recover,
  demigrate,
  rotateBak,
  backupCycle,
  // Expose internals for testing.
  _assertReadonly,
  _firstToken,
  _safeBackup,
  DENIED_TOKENS,
};
