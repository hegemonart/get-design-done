'use strict';
/**
 * scripts/lib/state/migrate-to-sqlite.cjs - Phase 57 (SQL-02)
 *
 * Reads .design/STATE.md, parses it via sdk/state/parser.ts (dynamic import,
 * never require a .ts), and UPSERTs all parsed blocks into the PINNED SQLite
 * tables. Also pulls Phase 19.5 recall records and Phase 51 instincts into
 * their respective tables (best-effort, degrades gracefully when absent).
 *
 * Programmatic API:
 *   migrateToSqlite({ projectRoot, dryRun, force })
 *     -> { migrated, tables:{...counts}, dryRun, skipped, reason }
 *
 * CLI usage:
 *   node migrate-to-sqlite.cjs [--migrate-state] [--dry-run] [--project-root=<path>]
 *
 * Critical invariants:
 *   - IDEMPOTENT: INSERT ... ON CONFLICT(id) DO UPDATE SET body_md=excluded.body_md
 *     etc. ordinal/created_at are NOT updated on conflict (preserve insert order).
 *   - --migrate-state (or force:true) is required; without it the CLI exits 0 with a
 *     notice (opt-in in v1.57.0).
 *   - --dry-run: wraps all writes in BEGIN ... ROLLBACK and prints a diff to stdout.
 *   - When BACKEND==='markdown': prints a notice and returns {skipped:true, reason:...}.
 *   - On boot: runs PRAGMA integrity_check if the db file already exists; refuses and
 *     prints a recovery hint if the db is corrupt.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

// ---------------------------------------------------------------------------
// Package-root walk-up (same pattern as sdk/dashboard/data/_pkg-root.cjs).
// Never use __dirname-relative cross-tree jumps - esbuild rewrites __dirname
// (Phase 53 lesson).
// ---------------------------------------------------------------------------

let _cachedPkgRoot = null;

function findPackageRoot(startDir) {
  let dir = path.resolve(startDir);
  let firstWithPkg = null;
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, 'package.json');
    let pkg = null;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { pkg = null; }
    if (pkg) {
      if (firstWithPkg === null) firstWithPkg = dir;
      if (pkg.name === '@hegemonart/hone') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return firstWithPkg || path.resolve(startDir);
}

function packageRoot() {
  if (_cachedPkgRoot === null) _cachedPkgRoot = findPackageRoot(__dirname);
  return _cachedPkgRoot;
}

function resolveFromPkgRoot(relPath) {
  return path.join(packageRoot(), relPath);
}

// ---------------------------------------------------------------------------
// Dynamic import of sdk/state/parser.ts.
// NEVER require() a .ts file - always dynamic import(pathToFileURL).
// ---------------------------------------------------------------------------

let _parserPromise = null;

function importParser() {
  if (_parserPromise === null) {
    const absPath = resolveFromPkgRoot('sdk/state/parser.ts');
    const url = pathToFileURL(absPath).href;
    _parserPromise = import(url).catch((err) => {
      _parserPromise = null;
      throw new Error(`migrate-to-sqlite: failed to import parser.ts: ${err.message}`);
    });
  }
  return _parserPromise;
}

// ---------------------------------------------------------------------------
// Load state-backend (Executor A's file). Required at call-time, not at module
// load, so tests can inject a stub or the file can be absent during testing.
// ---------------------------------------------------------------------------

let _backend = null;

function loadBackend() {
  if (_backend !== null) return _backend;
  try {
    _backend = require('./state-backend.cjs');
  } catch (err) {
    // state-backend.cjs doesn't exist yet (Executor A hasn't run) OR
    // better-sqlite3 is absent. Return a markdown-floor stub.
    _backend = {
      Database: null,
      BACKEND: 'markdown',
      openStateDb: null,
      checkIntegrity: null,
      sqlitePath: (root) => path.join(root, '.design', 'state.sqlite'),
    };
  }
  return _backend;
}

// ---------------------------------------------------------------------------
// SHA-256 helper for last_render_sha256.
// ---------------------------------------------------------------------------

function sha256hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Resolve project root (used by CLI and programmatic callers).
// ---------------------------------------------------------------------------

function resolveProjectRoot(explicitRoot) {
  if (explicitRoot) return path.resolve(explicitRoot);
  if (process.env.GDD_PROJECT_ROOT) return path.resolve(process.env.GDD_PROJECT_ROOT);
  // Walk up from cwd to find the nearest .design/STATE.md.
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.design', 'STATE.md'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// ---------------------------------------------------------------------------
// Load Phase 19.5 recall records from design-search index / recall json.
// Best-effort: returns [] on any error or absent file.
// ---------------------------------------------------------------------------

function loadRecallRecords(projectRoot) {
  try {
    // Phase 19.5 stores recall in .design/archive/**/*.md and LEARNINGS.md.
    // We do a best-effort scan: look for .design/recall.json or LEARNINGS lines.
    const recallJson = path.join(projectRoot, '.design', 'recall.json');
    if (fs.existsSync(recallJson)) {
      const data = JSON.parse(fs.readFileSync(recallJson, 'utf8'));
      if (Array.isArray(data.records)) return data.records;
      if (Array.isArray(data)) return data;
    }
    // Try CYCLES.md / LEARNINGS.md as a secondary source.
    const learnings = path.join(projectRoot, '.design', 'learnings', 'LEARNINGS.md');
    if (fs.existsSync(learnings)) {
      const text = fs.readFileSync(learnings, 'utf8');
      const lines = text.split('\n').filter((l) => l.trim().startsWith('- '));
      return lines.map((l, idx) => ({
        id: `recall-${idx}`,
        kind: 'learning',
        body_md: l.replace(/^-\s*/, '').trim(),
        tags: null,
        created_at: null,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Load Phase 51 instincts via instinct-store.load().
// Best-effort: returns [] on any error or absent file.
// ---------------------------------------------------------------------------

function loadInstincts(projectRoot) {
  try {
    const instinctStorePath = resolveFromPkgRoot('scripts/lib/instinct-store.cjs');
    if (!fs.existsSync(instinctStorePath)) return [];
    const instinctStore = require(instinctStorePath);
    const data = instinctStore.load({ scope: 'project', baseDir: projectRoot });
    if (Array.isArray(data.instincts)) return data.instincts;
    return [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Build a dry-run diff string from pending upsert operations.
// ---------------------------------------------------------------------------

function buildDryRunDiff(ops) {
  if (ops.length === 0) return '(no changes would be made)';
  const lines = [`Dry-run diff - ${ops.length} row(s) would be inserted/updated:\n`];
  for (const op of ops) {
    lines.push(`  [${op.action}] ${op.table} id=${op.id}`);
    if (op.fields) {
      for (const [k, v] of Object.entries(op.fields)) {
        const preview = String(v).slice(0, 80).replace(/\n/g, ' ');
        lines.push(`    ${k}: ${preview}`);
      }
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Core migration logic.
// ---------------------------------------------------------------------------

/**
 * Migrate .design/STATE.md (and supplementary stores) into the SQLite database.
 *
 * @param {object} opts
 * @param {string} [opts.projectRoot]    - project root dir (defaults to cwd / env)
 * @param {string} [opts.statePath]      - explicit path to STATE.md (overrides projectRoot lookup)
 * @param {boolean} [opts.dryRun=false]  - wrap writes in BEGIN/ROLLBACK + print diff
 * @param {boolean} [opts.force=false]   - same as --migrate-state flag; required to actually write
 * @param {boolean} [opts.upsertOnly=false] - re-parse markdown and UPSERT without wiping unrelated rows
 *                                            (used by the R8 freshness guard to fold hand-edits into SQLite)
 * @returns {Promise<{migrated:boolean, tables:object, dryRun:boolean, skipped:boolean, reason:string}>}
 */
async function migrateToSqlite(opts = {}) {
  const { dryRun = false, force = false, upsertOnly = false } = opts;
  // upsertOnly implies force (it's always an internal call, not user-facing opt-in).
  const effectiveForce = force || upsertOnly;
  const projectRoot = resolveProjectRoot(opts.projectRoot);

  // Opt-in guard: --migrate-state / force required.
  // This fires first (before the SQLite probe) so the message is consistent
  // regardless of whether better-sqlite3 is installed.
  if (!effectiveForce) {
    const notice =
      'Migration is opt-in in v1.57.0. Re-run with --migrate-state to proceed.';
    return {
      migrated: false,
      tables: {},
      dryRun,
      skipped: true,
      reason: notice,
    };
  }

  const backend = loadBackend();
  const { Database, BACKEND, openStateDb, checkIntegrity, sqlitePath } = backend;

  // Markdown floor: better-sqlite3 not available.
  if (BACKEND !== 'sqlite' || !Database) {
    const msg = 'better-sqlite3 not available - migration skipped, markdown remains source of truth';
    return {
      migrated: false,
      tables: {},
      dryRun,
      skipped: true,
      reason: msg,
    };
  }

  // Read STATE.md.
  const statePath = opts.statePath || path.join(projectRoot, '.design', 'STATE.md');
  if (!fs.existsSync(statePath)) {
    return {
      migrated: false,
      tables: {},
      dryRun,
      skipped: true,
      reason: `.design/STATE.md not found at ${statePath}`,
    };
  }

  const rawState = fs.readFileSync(statePath, 'utf8');

  // Parse via sdk/state/parser.ts (dynamic import - never require a .ts).
  const parserMod = await importParser();
  const { parse } = parserMod;

  let parsed;
  try {
    parsed = parse(rawState);
  } catch (err) {
    return {
      migrated: false,
      tables: {},
      dryRun,
      skipped: true,
      reason: `STATE.md parse error: ${err.message}`,
    };
  }

  const { state, raw_frontmatter, raw_bodies, block_gaps } = parsed;
  const { frontmatter, position, decisions, must_haves, blockers, prototyping, quality_gate } = state;

  const dbPath = sqlitePath(projectRoot);

  // Boot integrity check if db already exists.
  if (fs.existsSync(dbPath) && checkIntegrity) {
    const integrityDb = openStateDb(dbPath, { readonly: true });
    try {
      const ok = checkIntegrity(integrityDb);
      if (!ok) {
        return {
          migrated: false,
          tables: {},
          dryRun,
          skipped: true,
          reason:
            'SQLite database failed integrity_check. Run /hone:state recover to rebuild from markdown.',
        };
      }
    } finally {
      integrityDb.close();
    }
  }

  // Open the db for writing (schema is created by Executor A's openStateDb).
  const db = openStateDb(dbPath, { readonly: false });

  const now = new Date().toISOString();
  const renderSha = sha256hex(rawState);
  const cycleId = frontmatter.cycle || '';

  // Collect ops for dry-run diff output.
  const ops = [];

  // Accumulate row counts per table.
  const counts = {
    state_position: 0,
    decisions: 0,
    blockers: 0,
    must_haves: 0,
    _block_meta: 0,
    _meta: 0,
    recall_records: 0,
    instincts: 0,
  };

  // Wrap everything in a transaction. For dry-run we ROLLBACK; for real we COMMIT.
  const migrate = db.transaction(() => {
    // --- state_position ---
    const posBodyTrailer = state.body_trailer || '';
    const posBodyPreamble = state.body_preamble || '';
    const lineEnding = parsed.line_ending || '\n';
    db.prepare(`
      INSERT INTO state_position
        (cycle_id, stage, wave, task_progress, status, branch, raw_frontmatter,
         body_preamble, body_trailer, line_ending, last_render_sha256, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cycle_id) DO UPDATE SET
        stage = excluded.stage,
        wave = excluded.wave,
        task_progress = excluded.task_progress,
        status = excluded.status,
        raw_frontmatter = excluded.raw_frontmatter,
        body_preamble = excluded.body_preamble,
        body_trailer = excluded.body_trailer,
        line_ending = excluded.line_ending,
        last_render_sha256 = excluded.last_render_sha256,
        updated_at = excluded.updated_at
    `).run(
      cycleId,
      position.stage,
      position.wave,
      position.task_progress,
      position.status,
      '',
      raw_frontmatter,
      posBodyPreamble,
      posBodyTrailer,
      lineEnding,
      renderSha,
      now,
    );
    counts.state_position++;
    ops.push({
      action: 'upsert',
      table: 'state_position',
      id: cycleId,
      fields: { stage: position.stage, wave: position.wave, status: position.status },
    });

    // --- _meta ---
    db.prepare(`
      INSERT INTO _meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run('schema_version', '57.0');
    db.prepare(`
      INSERT INTO _meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run('last_render_sha256', renderSha);
    counts._meta += 2;

    // --- _block_meta (gap whitespace + raw_body per block for full round-trip fidelity) ---
    // Store EVERY block that was present in the parsed result: gap (preceding whitespace),
    // raw_body (verbatim block body for unstructured blocks), and ordinal (emit order).
    // This enables renderStateMarkdown to round-trip ALL blocks byte-for-byte.
    const BLOCK_ORDER_LOCAL = [
      'position', 'decisions', 'must_haves', 'prototyping', 'quality_gate',
      'connections', 'blockers', 'parallelism_decision', 'todos', 'timestamps',
    ];
    for (let blockOrdinal = 0; blockOrdinal < BLOCK_ORDER_LOCAL.length; blockOrdinal++) {
      const block = BLOCK_ORDER_LOCAL[blockOrdinal];
      const gap = block_gaps[block];
      const rawBody = raw_bodies[block];
      // Only store if the block was present (gap !== '' means it was in the file, or
      // raw_body is non-null meaning the block was parsed).
      if (gap === undefined && rawBody === null) continue;
      db.prepare(`
        INSERT INTO _block_meta (cycle_id, block, gap, raw_body, ordinal)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(cycle_id, block) DO UPDATE SET
          gap = excluded.gap,
          raw_body = CASE WHEN excluded.raw_body IS NOT NULL THEN excluded.raw_body ELSE raw_body END,
          ordinal = excluded.ordinal
      `).run(cycleId, block, gap !== undefined ? gap : '', rawBody !== null ? rawBody : null, blockOrdinal);
      counts._block_meta++;
    }

    // --- decisions ---
    for (let i = 0; i < decisions.length; i++) {
      const d = decisions[i];
      // Reconstruct the raw_line from the parsed fields to preserve verbatim format.
      const rawLine = `${d.id}: ${d.text} (${d.status})`;
      db.prepare(`
        INSERT INTO decisions
          (id, cycle_id, phase_id, status, body_md, tags, ordinal, raw_line, created_at, last_referenced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cycle_id, id) DO UPDATE SET
          body_md = excluded.body_md,
          status = excluded.status,
          raw_line = excluded.raw_line,
          last_referenced_at = excluded.last_referenced_at
      `).run(
        d.id,
        cycleId,
        '',
        d.status,
        d.text,
        null,
        i,
        rawLine,
        now,
        now,
      );
      counts.decisions++;
      ops.push({ action: 'upsert', table: 'decisions', id: d.id, fields: { status: d.status, body_md: d.text, raw_line: rawLine } });
      // BUG-05: populate FTS5 table so queryDecisions returns hits.
      // FTS5 virtual tables do not support ON CONFLICT — use DELETE + INSERT pattern.
      // Guard: if FTS5 tables are absent (no-fts5 build), skip without throwing.
      try {
        db.prepare('DELETE FROM decisions_fts WHERE id = ?').run(d.id);
        db.prepare('INSERT INTO decisions_fts (id, body_md, tags) VALUES (?, ?, ?)').run(d.id, d.text, null);
      } catch { /* FTS5 table absent - skip */ }
    }

    // --- blockers ---
    // BUG-02: DELETE existing rows for this cycle_id before re-inserting to prevent duplication.
    // The blockers table uses AUTOINCREMENT PK with no natural-key ON CONFLICT, so
    // re-running migrate without this delete would DUPLICATE every blocker row.
    db.prepare('DELETE FROM blockers WHERE cycle_id = ?').run(cycleId);
    for (let i = 0; i < blockers.length; i++) {
      const b = blockers[i];
      const rawLine = `[${b.stage}] [${b.date}]: ${b.text}`;
      db.prepare(`
        INSERT INTO blockers
          (cycle_id, stage, date, severity, body_md, ordinal, raw_line, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cycleId,
        b.stage,
        b.date,
        null,
        b.text,
        i,
        rawLine,
        null,
      );
      counts.blockers++;
      ops.push({ action: 'insert', table: 'blockers', id: `${b.stage}:${b.date}`, fields: { stage: b.stage, date: b.date, body_md: b.text } });
    }

    // --- must_haves ---
    for (let i = 0; i < must_haves.length; i++) {
      const m = must_haves[i];
      const rawLine = `${m.id}: ${m.text} | status: ${m.status}`;
      db.prepare(`
        INSERT INTO must_haves (id, cycle_id, body_md, status, ordinal, raw_line)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(cycle_id, id) DO UPDATE SET
          body_md = excluded.body_md,
          status = excluded.status,
          raw_line = excluded.raw_line
      `).run(
        m.id,
        cycleId,
        m.text,
        m.status,
        i,
        rawLine,
      );
      counts.must_haves++;
      ops.push({ action: 'upsert', table: 'must_haves', id: m.id, fields: { status: m.status, body_md: m.text } });
    }

    // --- prototyping -> findings (best-effort; prototyping block is optional) ---
    // Prototyping sketches/spikes are stored as plan entries in state for now;
    // the main table for prototyping data is addressed by consumers directly.
    // No dedicated prototyping table in the PINNED schema - store nothing here.

    // --- recall_records (Phase 19.5 - best-effort) ---
    const recalls = loadRecallRecords(projectRoot);
    for (let i = 0; i < recalls.length; i++) {
      const r = recalls[i];
      const recallId = r.id || `recall-${i}`;
      db.prepare(`
        INSERT INTO recall_records (id, cycle_id, kind, body_md, tags, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          body_md = excluded.body_md,
          tags = excluded.tags
      `).run(
        recallId,
        cycleId,
        r.kind || 'unknown',
        r.body_md || '',
        typeof r.tags === 'string' ? r.tags : (r.tags ? JSON.stringify(r.tags) : null),
        r.created_at || now,
      );
      counts.recall_records++;
    }

    // --- instincts (Phase 51 - best-effort) ---
    const instincts = loadInstincts(projectRoot);
    for (const inst of instincts) {
      const instId = inst.id || `instinct-${Math.random().toString(36).slice(2)}`;
      db.prepare(`
        INSERT INTO instincts
          (id, scope, domain, body_md, confidence, cycles_seen, project_ids, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          body_md = excluded.body_md,
          confidence = excluded.confidence,
          cycles_seen = excluded.cycles_seen,
          project_ids = excluded.project_ids,
          last_seen = excluded.last_seen
      `).run(
        instId,
        inst.scope || 'project',
        inst.domain || null,
        inst.body || inst.body_md || '',
        typeof inst.confidence === 'number' ? inst.confidence : null,
        typeof inst.cycles_seen === 'number' ? inst.cycles_seen : 1,
        Array.isArray(inst.project_ids) ? JSON.stringify(inst.project_ids) : null,
        inst.last_seen || now,
      );
      counts.instincts++;
    }
  });

  if (dryRun) {
    // Dry-run: build the op list (which happens inside the transaction callback),
    // then ROLLBACK so nothing is persisted.
    // better-sqlite3 transactions commit automatically when the wrapper function
    // returns. To dry-run, we wrap the whole thing in an outer savepoint that
    // we always roll back. We call db.transaction() around a manual SAVEPOINT
    // using the lower-level exec approach.
    try {
      db.exec('SAVEPOINT hone_dryrun');
      migrate(); // runs all UPSERTs but they land inside the savepoint
      db.exec('ROLLBACK TO SAVEPOINT hone_dryrun');
      db.exec('RELEASE SAVEPOINT hone_dryrun');
    } catch {
      // If there was a SQL error (e.g. table doesn't exist yet), still rollback.
      try { db.exec('ROLLBACK TO SAVEPOINT hone_dryrun'); } catch { /* ignore */ }
      try { db.exec('RELEASE SAVEPOINT hone_dryrun'); } catch { /* ignore */ }
    }

    const diff = buildDryRunDiff(ops);
    process.stdout.write(diff + '\n');

    db.close();
    return {
      migrated: false,
      tables: counts,
      dryRun: true,
      skipped: false,
      reason: 'dry-run: no changes persisted',
    };
  }

  // Real migration: run the transaction.
  migrate();
  db.close();

  return {
    migrated: true,
    tables: counts,
    dryRun: false,
    skipped: false,
    reason: 'ok',
  };
}

// ---------------------------------------------------------------------------
// CLI entry point.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const result = { force: false, dryRun: false, projectRoot: undefined };
  for (const arg of argv) {
    if (arg === '--migrate-state') result.force = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg.startsWith('--project-root=')) result.projectRoot = arg.slice('--project-root='.length);
    else if (arg === '--project-root' || arg === '-p') {
      // next arg handled below via index
    }
  }
  // Handle --project-root <value> (two-arg form).
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--project-root' || argv[i] === '-p') {
      result.projectRoot = argv[i + 1];
    }
  }
  return result;
}

async function main(argv) {
  const args = parseArgs(argv);

  if (!args.force) {
    process.stdout.write(
      'Migration is opt-in in v1.57.0. Re-run with --migrate-state to proceed.\n',
    );
    process.exitCode = 0;
    return;
  }

  let result;
  try {
    result = await migrateToSqlite({
      projectRoot: args.projectRoot,
      dryRun: args.dryRun,
      force: args.force,
    });
  } catch (err) {
    process.stderr.write(`migrate-to-sqlite error: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (result.skipped) {
    process.stdout.write(`${result.reason}\n`);
    process.exitCode = 0;
    return;
  }

  if (result.dryRun) {
    // diff was already printed by migrateToSqlite.
    process.stdout.write(
      `\nDry-run complete. Tables that WOULD be written: ${JSON.stringify(result.tables)}\n`,
    );
    process.exitCode = 0;
    return;
  }

  process.stdout.write(
    `Migration complete. Tables written: ${JSON.stringify(result.tables)}\n`,
  );
  process.exitCode = 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`migrate-to-sqlite fatal: ${err.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { migrateToSqlite };
