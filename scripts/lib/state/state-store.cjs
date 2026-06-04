'use strict';
/**
 * scripts/lib/state/state-store.cjs - Phase 57 SQLite State Backbone.
 *
 * Dual-backend dispatch layer. All state mutations and queries route through
 * this module. When BACKEND==='sqlite', operations write to SQLite AND render
 * a fresh STATE.md inside a single better-sqlite3 transaction (R7 dual-write).
 * When BACKEND==='markdown', operations delegate to the SDK markdown path.
 *
 * Public API:
 *   appendDecision(decision, opts)  - add a decision row
 *   getDecisions(opts)              - return decision rows
 *   appendBlocker(blocker, opts)    - add a blocker row
 *   getBlockers(opts)               - return blocker rows
 *   setPosition(position, opts)     - upsert state_position
 *   getPosition(opts)               - return current position
 *   queryDecisions(ftsQuery, opts)  - FTS5 search over decisions (or JS fallback)
 *   migrate(migrateOpts)            - lazy-require migrate-to-sqlite.cjs
 *   render(projectRoot)             - lazy-require render-markdown.cjs
 *   backendName()                   - return BACKEND string
 *
 * R7 dual-write: every SQLite MUTATION wraps writeStructured() + renderMarkdown()
 * in a single db.transaction(). If the markdown render throws, the transaction
 * rolls back SQLite too (no divergence).
 *
 * The SDK (sdk/state) is loaded asynchronously ONCE via lazy async loader,
 * BEFORE entering the synchronous db.transaction() callback. This is required
 * because better-sqlite3 transactions are synchronous and cannot contain
 * async code (dynamic import returns a Promise, which would cause
 * "Received an instance of Promise" errors when passed to writeFileSync).
 *
 * R8 freshness guard: before any mutation, compare on-disk STATE.md sha256 to
 * _meta.last_render_sha256. If they differ (user hand-edited), re-parse markdown
 * + upsert SQLite first (mini-migration), then proceed with the intended mutation.
 *
 * NEVER throws on a missing better-sqlite3 module. Always degrades.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const { BACKEND, Database, openStateDb, sqlitePath, loadSchema } = require('./state-backend.cjs');

// ---------------------------------------------------------------------------
// Package-root walk-up for SDK resolution (same pattern as render-markdown).
// ---------------------------------------------------------------------------

function findPackageRoot(startDir) {
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

const PKG_ROOT = findPackageRoot(__dirname);

// ---------------------------------------------------------------------------
// Lazy async SDK loader (cached after first call).
// Loads sdk/state (serialize + parse) via dynamic import (never require a .ts).
// Must be called BEFORE entering db.transaction() so the loaded sdk can be
// used synchronously inside the transaction callback.
// ---------------------------------------------------------------------------

/** @type {{ serialize: Function, parse: Function } | null} */
let _sdk = null;

/**
 * Load the SDK async, cache after first load.
 * Returns { serialize, parse } or null if unavailable.
 * @returns {Promise<{ serialize: Function, parse: Function } | null>}
 */
async function loadSdk() {
  if (_sdk !== null) return _sdk;
  try {
    const mutatorPath = path.join(PKG_ROOT, 'sdk', 'state', 'mutator.ts');
    const parserPath = path.join(PKG_ROOT, 'sdk', 'state', 'parser.ts');
    const [mutator, parser] = await Promise.all([
      import(pathToFileURL(mutatorPath).href),
      import(pathToFileURL(parserPath).href),
    ]);
    if (mutator && parser && typeof mutator.serialize === 'function' && typeof parser.parse === 'function') {
      _sdk = { serialize: mutator.serialize, parse: parser.parse };
    } else {
      _sdk = null;
    }
  } catch {
    _sdk = null;
  }
  return _sdk;
}

// ---------------------------------------------------------------------------
// Lazy-require helpers for the migrate and render sibling modules (PINNED names).
// Loaded on first call so a missing better-sqlite3 binding does not crash module load.
// ---------------------------------------------------------------------------

/** @type {any|null} Cached migrate-to-sqlite module. */
let _migrateModule = null;
/** @type {any|null} Cached render-markdown module. */
let _renderModule = null;

/**
 * Lazy-require ./migrate-to-sqlite.cjs.
 * Returns null if the require fails (e.g. better-sqlite3 missing).
 * @returns {any|null}
 */
function _requireMigrate() {
  if (_migrateModule) return _migrateModule;
  try {
    _migrateModule = require('./migrate-to-sqlite.cjs');
  } catch {
    _migrateModule = null;
  }
  return _migrateModule;
}

/**
 * Lazy-require ./render-markdown.cjs.
 * Returns null if the require fails.
 * @returns {any|null}
 */
function _requireRender() {
  if (_renderModule) return _renderModule;
  try {
    _renderModule = require('./render-markdown.cjs');
  } catch {
    _renderModule = null;
  }
  return _renderModule;
}

// ---------------------------------------------------------------------------
// Atomic write helper (mirrors instinct-store .tmp+rename pattern).
// ---------------------------------------------------------------------------

/**
 * Write content to filePath atomically via a .tmp sibling + rename.
 * Creates parent directories if needed.
 *
 * @param {string} filePath
 * @param {string} content
 */
function _writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

// ---------------------------------------------------------------------------
// SHA256 helper for R8 freshness guard.
// ---------------------------------------------------------------------------

/**
 * Compute the sha256 hex digest of a string.
 * @param {string} content
 * @returns {string}
 */
function _sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Read STATE.md from disk and return its sha256. Returns null if not found.
 * @param {string} statePath
 * @returns {string|null}
 */
function _onDiskSha(statePath) {
  try {
    const content = fs.readFileSync(statePath, 'utf8');
    return _sha256(content);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// R8 freshness guard - check if STATE.md has been hand-edited since last render.
// If so, run a mini-migration to upsert SQLite from the current markdown state.
// ---------------------------------------------------------------------------

/**
 * Compare on-disk STATE.md sha256 to the stored _meta.last_render_sha256.
 * If they differ, the user has hand-edited STATE.md since the last SQLite write.
 * In that case, run a mini-migration (upsert SQLite from markdown) before proceeding.
 *
 * This is ASYNC - must be awaited before entering the db.transaction().
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} statePath absolute path to STATE.md
 */
async function _applyFreshnessGuard(db, statePath) {
  try {
    const onDisk = _onDiskSha(statePath);
    if (onDisk === null) return; // STATE.md doesn't exist yet - skip
    const metaRow = db.prepare('SELECT value FROM _meta WHERE key = ?').get('last_render_sha256');
    const stored = metaRow ? metaRow.value : null;
    if (stored === onDisk) return; // No drift - proceed normally
    // Drift detected: user hand-edited STATE.md.
    // Run mini-migration (upsertOnly) to fold the hand-edit into SQLite before
    // proceeding with the intended mutation.
    const migrate = _requireMigrate();
    if (migrate && typeof migrate.migrateToSqlite === 'function') {
      try {
        // Close db first if needed - migrateToSqlite opens its own connection.
        // We pass the resolved projectRoot (dirname of .design/STATE.md's parent).
        const projectRoot = path.resolve(path.dirname(statePath), '..');
        await migrate.migrateToSqlite({ statePath, projectRoot, force: true, upsertOnly: true });
      } catch {
        // Migration failed - log and continue rather than blocking the write.
        // Still update the sha to prevent infinite re-triggering.
      }
    }
    // Update stored sha to reflect the current on-disk content.
    db.prepare('INSERT OR REPLACE INTO _meta(key, value) VALUES (?, ?)').run('last_render_sha256', onDisk);
  } catch {
    /* Freshness guard must never break a write path */
  }
}

// ---------------------------------------------------------------------------
// Resolve STATE.md path from projectRoot or current sqlite db location.
// ---------------------------------------------------------------------------

/**
 * Resolve the STATE.md path for a given project root (or process.cwd()).
 * @param {string} [projectRoot]
 * @returns {string}
 */
function _statePath(projectRoot) {
  const root = projectRoot || process.cwd();
  return path.join(root, '.design', 'STATE.md');
}

// ---------------------------------------------------------------------------
// SQLite mutation helper - R7 dual-write inside a single transaction.
// Pattern: BEFORE transaction: await loadSdk().
//          INSIDE transaction (sync): writeStructured() + renderMarkdown(sdk).
// If the markdown render throws, the transaction rolls back SQLite too.
//
// sdk must be pre-loaded (passed in) because db.transaction() is SYNCHRONOUS
// and cannot contain await or dynamic import calls.
// ---------------------------------------------------------------------------

/**
 * Execute a structured write + markdown render in a single SQLite transaction.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} statePath path to STATE.md
 * @param {string} cycleId cycle_id for the current state
 * @param {Function} writeStructured function that does all SQLite writes (sync)
 * @param {{ serialize: Function, parse: Function } | null} sdk pre-loaded SDK (or null)
 */
function _dualWrite(db, statePath, cycleId, writeStructured, sdk) {
  const txn = db.transaction(() => {
    writeStructured();
    // Render markdown from SQLite and write atomically.
    // MUST be synchronous: no await, no dynamic import here.
    const renderMod = _requireRender();
    if (renderMod && typeof renderMod.renderStateMarkdown === 'function' && sdk) {
      // renderStateMarkdown is synchronous when sdk is injected.
      const md = renderMod.renderStateMarkdown(db, cycleId, sdk);
      _writeFileAtomic(statePath, md);
      // Update last_render_sha256 in _meta.
      const newSha = _sha256(md);
      db.prepare('INSERT OR REPLACE INTO _meta(key, value) VALUES (?, ?)').run('last_render_sha256', newSha);
    }
    // If render module not available or sdk not loaded, still write the structured data.
    // STATE.md will be stale until the render module loads successfully.
  });
  txn();
}

// ---------------------------------------------------------------------------
// SQLite path: resolve from process.cwd() for store-level operations.
// Callers may pass { dbPath } or { projectRoot } to override.
// ---------------------------------------------------------------------------

/**
 * Resolve the dbPath from opts or default to sqlitePath(projectRoot or cwd).
 * @param {{ dbPath?: string, projectRoot?: string }} [opts]
 * @returns {string}
 */
function _resolveDbPath(opts = {}) {
  if (opts.dbPath) return opts.dbPath;
  return sqlitePath(opts.projectRoot || process.cwd());
}

// ---------------------------------------------------------------------------
// appendDecision - add or upsert a decision row.
// ---------------------------------------------------------------------------

/**
 * Append (or upsert) a decision record.
 *
 * SQLite path: INSERT OR REPLACE into decisions + dual-write STATE.md.
 * Markdown path: no-op write path (sdk/state owns markdown writes);
 *   returns { backend: 'markdown', skipped: true }.
 *
 * @param {{ id: string, cycleId?: string, bodyMd: string, status?: string,
 *           tags?: string[], ordinal?: number, rawLine?: string,
 *           createdAt?: string }} decision
 * @param {{ dbPath?: string, projectRoot?: string }} [opts]
 * @returns {Promise<{ backend: string, id: string }>}
 */
async function appendDecision(decision, opts = {}) {
  if (BACKEND !== 'sqlite') {
    return { backend: 'markdown', skipped: true, id: decision.id };
  }
  // Load SDK async BEFORE the transaction (transaction is sync).
  const sdk = await loadSdk();
  const dbPath = _resolveDbPath(opts);
  const statePath = _statePath(opts.projectRoot);
  const db = openStateDb(dbPath);
  try {
    await _applyFreshnessGuard(db, statePath);
    const cycleId = decision.cycleId || _currentCycleId(db);
    // BUG-10: if no cycle is active, skip rather than inserting cycle_id=null (NOT NULL throw).
    if (!cycleId) {
      return { backend: 'sqlite', skipped: true, reason: 'no active cycle_id - call setPosition first' };
    }
    _dualWrite(db, statePath, cycleId, () => {
      db.prepare(`
        INSERT INTO decisions
          (id, cycle_id, phase_id, status, body_md, tags, ordinal, raw_line, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cycle_id, id) DO UPDATE SET
          body_md = excluded.body_md,
          status = excluded.status,
          raw_line = excluded.raw_line,
          last_referenced_at = excluded.created_at
      `).run(
        decision.id,
        cycleId || null,
        decision.phaseId || null,
        decision.status || 'tentative',
        decision.bodyMd || '',
        decision.tags ? JSON.stringify(decision.tags) : null,
        typeof decision.ordinal === 'number' ? decision.ordinal : 0,
        decision.rawLine || null,
        decision.createdAt || new Date().toISOString(),
      );
      // BUG-05: populate decisions_fts so FTS5 queries return hits.
      // FTS5 virtual tables do not support ON CONFLICT — use DELETE + INSERT pattern.
      // Guard: if FTS5 tables are absent (no-fts5 build), skip without throwing.
      try {
        db.prepare(`DELETE FROM decisions_fts WHERE id = ?`).run(decision.id);
        db.prepare(`INSERT INTO decisions_fts (id, body_md, tags) VALUES (?, ?, ?)`).run(
          decision.id,
          decision.bodyMd || '',
          decision.tags ? JSON.stringify(decision.tags) : null,
        );
      } catch { /* FTS5 table absent in no-fts5 build - skip */ }
    }, sdk);
    return { backend: 'sqlite', id: decision.id };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// getDecisions - return decision rows.
// ---------------------------------------------------------------------------

/**
 * Return all decision rows for the current cycle, ordered by ordinal.
 *
 * SQLite path: SELECT from decisions.
 * Markdown path: returns [] (read path; callers use sdk/state read() for markdown).
 *
 * @param {{ dbPath?: string, projectRoot?: string, cycleId?: string }} [opts]
 * @returns {Array<object>}
 */
function getDecisions(opts = {}) {
  if (BACKEND !== 'sqlite') {
    return [];
  }
  // BUG-06: wrap in try/catch — openStateDb(readonly) throws on a missing file.
  try {
    const dbPath = _resolveDbPath(opts);
    const db = openStateDb(dbPath, { readonly: true });
    try {
      const cycleId = opts.cycleId || _currentCycleId(db);
      if (!cycleId) return [];
      return db.prepare(
        'SELECT * FROM decisions WHERE cycle_id = ? ORDER BY ordinal ASC'
      ).all(cycleId);
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// appendBlocker - add a blocker row.
// ---------------------------------------------------------------------------

/**
 * Append a blocker record.
 *
 * @param {{ cycleId?: string, stage: string, date: string, bodyMd: string,
 *           severity?: string, ordinal?: number, rawLine?: string }} blocker
 * @param {{ dbPath?: string, projectRoot?: string }} [opts]
 * @returns {Promise<{ backend: string, rowid: number|null }>}
 */
async function appendBlocker(blocker, opts = {}) {
  if (BACKEND !== 'sqlite') {
    return { backend: 'markdown', skipped: true, rowid: null };
  }
  // Load SDK async BEFORE the transaction (transaction is sync).
  const sdk = await loadSdk();
  const dbPath = _resolveDbPath(opts);
  const statePath = _statePath(opts.projectRoot);
  const db = openStateDb(dbPath);
  try {
    await _applyFreshnessGuard(db, statePath);
    const cycleId = blocker.cycleId || _currentCycleId(db);
    let rowid = null;
    _dualWrite(db, statePath, cycleId, () => {
      const result = db.prepare(`
        INSERT INTO blockers (cycle_id, stage, date, severity, body_md, ordinal, raw_line)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        cycleId || null,
        blocker.stage || null,
        blocker.date || null,
        blocker.severity || null,
        blocker.bodyMd || '',
        typeof blocker.ordinal === 'number' ? blocker.ordinal : 0,
        blocker.rawLine || null,
      );
      rowid = result.lastInsertRowid;
    }, sdk);
    return { backend: 'sqlite', rowid };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// getBlockers - return blocker rows.
// ---------------------------------------------------------------------------

/**
 * Return all (unresolved) blocker rows for the current cycle.
 *
 * @param {{ dbPath?: string, projectRoot?: string, cycleId?: string,
 *           includeResolved?: boolean }} [opts]
 * @returns {Array<object>}
 */
function getBlockers(opts = {}) {
  if (BACKEND !== 'sqlite') {
    return [];
  }
  // BUG-06: wrap in try/catch — openStateDb(readonly) throws on a missing file.
  try {
    const dbPath = _resolveDbPath(opts);
    const db = openStateDb(dbPath, { readonly: true });
    try {
      const cycleId = opts.cycleId || _currentCycleId(db);
      if (!cycleId) return [];
      if (opts.includeResolved) {
        return db.prepare(
          'SELECT * FROM blockers WHERE cycle_id = ? ORDER BY ordinal ASC'
        ).all(cycleId);
      }
      return db.prepare(
        'SELECT * FROM blockers WHERE cycle_id = ? AND resolved_at IS NULL ORDER BY ordinal ASC'
      ).all(cycleId);
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// setPosition - upsert the state_position row.
// ---------------------------------------------------------------------------

/**
 * Upsert the state_position row for a cycle.
 *
 * @param {{ cycleId: string, stage?: string, wave?: number, taskProgress?: string,
 *           status?: string, branch?: string, rawFrontmatter?: string,
 *           bodyTrailer?: string }} position
 * @param {{ dbPath?: string, projectRoot?: string }} [opts]
 * @returns {Promise<{ backend: string, cycleId: string }>}
 */
async function setPosition(position, opts = {}) {
  if (BACKEND !== 'sqlite') {
    return { backend: 'markdown', skipped: true, cycleId: position.cycleId };
  }
  // Load SDK async BEFORE the transaction (transaction is sync).
  const sdk = await loadSdk();
  const dbPath = _resolveDbPath(opts);
  const statePath = _statePath(opts.projectRoot);
  const db = openStateDb(dbPath);
  try {
    await _applyFreshnessGuard(db, statePath);
    _dualWrite(db, statePath, position.cycleId, () => {
      db.prepare(`
        INSERT INTO state_position
          (cycle_id, stage, wave, task_progress, status, branch,
           raw_frontmatter, body_trailer, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cycle_id) DO UPDATE SET
          stage = excluded.stage,
          wave = excluded.wave,
          task_progress = excluded.task_progress,
          status = excluded.status,
          raw_frontmatter = excluded.raw_frontmatter,
          body_trailer = excluded.body_trailer,
          updated_at = excluded.updated_at
      `).run(
        position.cycleId,
        position.stage || null,
        typeof position.wave === 'number' ? position.wave : null,
        position.taskProgress || null,
        position.status || null,
        position.branch || null,
        position.rawFrontmatter || null,
        position.bodyTrailer || null,
        new Date().toISOString(),
      );
    }, sdk);
    return { backend: 'sqlite', cycleId: position.cycleId };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// getPosition - return the current state_position row.
// ---------------------------------------------------------------------------

/**
 * Return the most recent state_position row (by updated_at).
 *
 * @param {{ dbPath?: string, projectRoot?: string, cycleId?: string }} [opts]
 * @returns {object|null}
 */
function getPosition(opts = {}) {
  if (BACKEND !== 'sqlite') {
    return null;
  }
  // BUG-06: wrap in try/catch — openStateDb(readonly) throws on a missing file.
  try {
    const dbPath = _resolveDbPath(opts);
    const db = openStateDb(dbPath, { readonly: true });
    try {
      if (opts.cycleId) {
        return db.prepare('SELECT * FROM state_position WHERE cycle_id = ?').get(opts.cycleId) || null;
      }
      return db.prepare(
        'SELECT * FROM state_position ORDER BY updated_at DESC LIMIT 1'
      ).get() || null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// queryDecisions - FTS5 search (or JS fallback) over decisions.
// ---------------------------------------------------------------------------

/**
 * Query decisions by full-text search (trigram FTS5) or substring fallback.
 *
 * SQLite path: uses decisions_fts virtual table when available, else
 * LIKE substring scan over body_md.
 * Markdown path: returns [].
 *
 * @param {string} ftsQuery search terms
 * @param {{ dbPath?: string, projectRoot?: string, cycleId?: string, limit?: number }} [opts]
 * @returns {Array<object>}
 */
function queryDecisions(ftsQuery, opts = {}) {
  if (BACKEND !== 'sqlite') {
    return [];
  }
  if (typeof ftsQuery !== 'string' || !ftsQuery.trim()) return [];
  const dbPath = _resolveDbPath(opts);
  const db = openStateDb(dbPath, { readonly: true });
  try {
    const limit = opts.limit || 10;
    const cycleId = opts.cycleId || _currentCycleId(db);
    // Try FTS5 first, fall back to LIKE scan.
    try {
      const rows = db.prepare(`
        SELECT d.* FROM decisions d
        JOIN decisions_fts fts ON d.id = fts.id
        WHERE decisions_fts MATCH ?
        ${cycleId ? 'AND d.cycle_id = ?' : ''}
        ORDER BY rank
        LIMIT ?
      `).all(...(cycleId ? [ftsQuery, cycleId, limit] : [ftsQuery, limit]));
      return rows;
    } catch {
      // FTS5 not available or query failed - fall back to LIKE scan.
      const pattern = '%' + ftsQuery.replace(/[%_\\]/g, '\\$&') + '%';
      if (cycleId) {
        return db.prepare(
          'SELECT * FROM decisions WHERE cycle_id = ? AND body_md LIKE ? ESCAPE ? ORDER BY ordinal LIMIT ?'
        ).all(cycleId, pattern, '\\', limit);
      }
      return db.prepare(
        'SELECT * FROM decisions WHERE body_md LIKE ? ESCAPE ? ORDER BY ordinal LIMIT ?'
      ).all(pattern, '\\', limit);
    }
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// _currentCycleId - get the most recently active cycle_id from state_position.
// ---------------------------------------------------------------------------

/**
 * Return the most recent cycle_id from state_position, or null.
 * @param {import('better-sqlite3').Database} db
 * @returns {string|null}
 */
function _currentCycleId(db) {
  try {
    const row = db.prepare(
      'SELECT cycle_id FROM state_position ORDER BY updated_at DESC LIMIT 1'
    ).get();
    return row ? row.cycle_id : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// migrate - async lazy delegate to migrate-to-sqlite.cjs.
// ---------------------------------------------------------------------------

/**
 * Run migration from markdown `.design/STATE.md` to the SQLite state database.
 *
 * This function is the public store-level entry point for the
 * `--migrate-state` flow. It lazy-loads `./migrate-to-sqlite.cjs` on first call
 * and delegates to whichever export it exposes (`migrateToSqlite`,
 * `migrate`, or `migrateState`), in priority order. The underlying
 * `migrateToSqlite` is itself async (it dynamically imports
 * `sdk/state/parser.ts` and uses node:fs/promises for IO), so this wrapper
 * is async and always returns a Promise.
 *
 * The function NEVER throws on infrastructure failures:
 *   - `BACKEND === 'markdown'` (no better-sqlite3) → resolves with
 *     `{ migrated: false, backend: 'markdown', message: ... }`.
 *   - `require('./migrate-to-sqlite.cjs')` failed → resolves with
 *     `{ migrated: false, backend: 'sqlite', message: ... }`.
 *   - The delegate module loaded but exposes no recognized export → resolves
 *     with `{ migrated: false, backend: 'sqlite', message: ... }`.
 *
 * Errors thrown by the delegate (parser failure, schema mismatch, etc.) are
 * propagated as a rejected Promise - callers should `await` and handle.
 *
 * Idempotent: calling `migrate()` repeatedly on a clean database is safe
 * (the underlying migration uses `INSERT ... ON CONFLICT ... DO UPDATE`).
 * Migration is opt-in: the delegate refuses to write unless `force:true` or
 * the CLI `--migrate-state` flag is set (a notice is returned instead).
 *
 * Dual-channel result shapes:
 *   - markdown floor:   { migrated: false, backend: 'markdown', message }
 *   - sqlite path:      { migrated: boolean, tables: {...counts}, dryRun,
 *                         skipped, reason }
 * The caller MUST inspect `migrated` (the boolean) — never `backend` alone —
 * to decide whether the operation actually performed writes.
 *
 * @async
 * @param {object} [migrateOpts] options forwarded to the delegate
 * @param {string} [migrateOpts.statePath]    explicit path to STATE.md
 * @param {string} [migrateOpts.dbPath]       explicit path to state.sqlite
 * @param {string} [migrateOpts.projectRoot]  project root for path lookup
 * @param {boolean} [migrateOpts.dryRun]      wrap writes in BEGIN/ROLLBACK
 * @param {boolean} [migrateOpts.force]       same as `--migrate-state` flag
 * @param {boolean} [migrateOpts.upsertOnly]  re-parse + UPSERT without wiping
 *                                            unrelated rows (used by the R8
 *                                            freshness guard)
 * @returns {Promise<{ migrated: boolean, backend?: string, message?: string,
 *   tables?: object, dryRun?: boolean, skipped?: boolean, reason?: string }>}
 *   Resolves with the migration result; rejects only on delegate exceptions.
 * @see migrate-to-sqlite.cjs for the underlying transactional implementation
 * @see render for the reverse direction (SQLite → STATE.md)
 */
async function migrate(migrateOpts = {}) {
  if (BACKEND !== 'sqlite') {
    return {
      migrated: false,
      backend: 'markdown',
      message: 'migration is a no-op when BACKEND===markdown (better-sqlite3 not available)',
    };
  }
  const mod = _requireMigrate();
  if (!mod) {
    return {
      migrated: false,
      backend: 'sqlite',
      message: 'migrate-to-sqlite.cjs could not be loaded (require failed)',
    };
  }
  // Delegate is async; await so callers see the resolved result, not a Promise.
  if (typeof mod.migrateToSqlite === 'function') {
    return await mod.migrateToSqlite(migrateOpts);
  }
  if (typeof mod.migrate === 'function') {
    return await mod.migrate(migrateOpts);
  }
  if (typeof mod.migrateState === 'function') {
    return await mod.migrateState(migrateOpts);
  }
  return {
    migrated: false,
    backend: 'sqlite',
    message: 'migrate-to-sqlite.cjs loaded but expected function not found',
  };
}

// ---------------------------------------------------------------------------
// render - lazy delegate to render-markdown.cjs.
// ---------------------------------------------------------------------------

/**
 * Re-render STATE.md from SQLite state (reverse of migration).
 * Delegates to ./render-markdown.cjs.
 * If that module cannot be loaded, returns null silently.
 *
 * @param {string} [projectRoot]
 * @returns {Promise<string|null>} rendered markdown string, or null if unavailable
 */
async function render(projectRoot) {
  if (BACKEND !== 'sqlite') {
    return null;
  }
  const mod = _requireRender();
  if (!mod) {
    return null;
  }
  if (typeof mod.renderStateMarkdown !== 'function') {
    return null;
  }
  const sdk = await loadSdk();
  if (!sdk) {
    return null;
  }
  const dbPath = sqlitePath(projectRoot || process.cwd());
  const db = openStateDb(dbPath, { readonly: true });
  try {
    const cycleId = _currentCycleId(db);
    return mod.renderStateMarkdown(db, cycleId, sdk);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// backendName - return the active backend string.
// ---------------------------------------------------------------------------

/**
 * Return the active backend name: 'sqlite' or 'markdown'.
 * Mirrors the pattern from instinct-store.cjs backendName().
 * @returns {'sqlite'|'markdown'}
 */
function backendName() {
  return BACKEND;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  appendDecision,
  getDecisions,
  appendBlocker,
  getBlockers,
  setPosition,
  getPosition,
  queryDecisions,
  migrate,
  render,
  backendName,
};
