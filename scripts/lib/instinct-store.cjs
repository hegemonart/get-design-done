'use strict';
/**
 * scripts/lib/instinct-store.cjs — Phase 51 (Instinct-Based Learnings) store.
 *
 * An "instinct" is an atomic, confidence-weighted YAML unit (a trigger sentence
 * plus a 1-3 paragraph body) learned across design cycles. This module persists
 * instincts, queries them by keyword, promotes project instincts to a global
 * store once they earn cross-project trust, and decays stale ones. See
 * reference/instinct-format.md for the unit format and the promotion / decay
 * rules, and reference/schemas/instinct.schema.json for the frontmatter schema.
 *
 * No new dependency. better-sqlite3 stays a RUNTIME probe (probe-optional.cjs):
 * when it is present AND its FTS5 extension is compiled in, `query` accelerates
 * over a small full-text index; otherwise an in-memory token/substring scan
 * answers the same query. Persistence is always JSON-canonical (an atomic
 * .tmp+rename write), so the FTS5 index is a disposable accelerator, never the
 * source of truth — exactly the Phase 19.5 three-tier optional-SQLite pattern
 * used by design-search.cjs.
 *
 * Purity: no top-level Date.now() / Math.random(). Callers inject `now` (a
 * Date or an ISO string) wherever a timestamp is recorded, so the suite is
 * deterministic. Project-scoped writes resolve through worktree-resolve.cjs so
 * they land in the MAIN checkout, not a throwaway worktree.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const { probeOptional } = require('./probe-optional.cjs');
const { resolveDesignRoot } = require('./worktree-resolve.cjs');
const { splitFrontmatter } = require('../generate-skill-frontmatter.cjs');

/**
 * Normalize a git remote origin URL so the same logical origin across git@,
 * https, and ssh shapes maps to one string: strip the protocol/host prefix,
 * strip a trailing `.git`, lowercase. This mirrors pseudonymize.cjs's internal
 * normalizeRepoOrigin (that helper is not exported), kept dependency-free here.
 *
 * @param {string} origin
 * @returns {string}
 */
function normalizeRepoOrigin(origin) {
  if (typeof origin !== 'string' || origin.length === 0) return '';
  let s = origin.trim();
  s = s.replace(/^git@[^:]+:/i, '');
  s = s.replace(/^https?:\/\/[^/]+\//i, '');
  s = s.replace(/^ssh:\/\/(?:[^@]+@)?[^/]+\//i, '');
  s = s.replace(/^git:\/\/[^/]+\//i, '');
  s = s.replace(/\.git$/i, '');
  return s.toLowerCase();
}

// ---------------------------------------------------------------------------
// Constants — the prior, the domain enum, the gate + decay knobs.
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = '51.0';

/**
 * Beta(2, 8) prior — posterior mean 0.2. An instinct EARNS trust from repeated
 * cross-cycle observation; it is advisory until real outcomes shift it. Same
 * conservative prior shape as the Phase 38 design_arms store (D-03).
 */
const INSTINCT_PRIOR = Object.freeze({ alpha: 2, beta: 8 });

/** Lifecycle stages an instinct can apply to (aligned to the Phase 50 stages). */
const DOMAINS = Object.freeze([
  'intake',
  'explore',
  'decide',
  'build',
  'verify',
  'operate',
  'utility',
]);

/** Confidence floor/ceiling — a fresh instinct is advisory, none is ever certain. */
const CONFIDENCE_FLOOR = 0.3;
const CONFIDENCE_CEILING = 0.9;

/** Promotion gate: seen across >=K cycles AND >=M distinct project ids. */
const PROMOTE_MIN_CYCLES = 2; // K
const PROMOTE_MIN_PROJECTS = 2; // M

/** TTL decay: unsurfaced for >= this many cycles -> confidence *= factor. */
const DECAY_CYCLES_WINDOW = 6;
const DECAY_FACTOR = 0.9;
const ARCHIVE_THRESHOLD = 0.2;

// ---------------------------------------------------------------------------
// better-sqlite3 + FTS5 backend probe (evaluated once at module load).
// Mirrors design-search.cjs backend selection.
// ---------------------------------------------------------------------------

const Database = probeOptional('better-sqlite3');

let _fts5Supported = false;
if (Database) {
  try {
    const probe = new Database(':memory:');
    probe.exec('CREATE VIRTUAL TABLE _p USING fts5(t)');
    probe.close();
    _fts5Supported = true;
  } catch {
    /* fts5 extension not compiled in — fall back to the JS scan */
  }
}

/** 'fts5' when better-sqlite3+fts5 is available, else the in-memory 'js-scan'. */
function backendName() {
  return _fts5Supported ? 'fts5' : 'js-scan';
}

// ---------------------------------------------------------------------------
// Time helper — every timestamp flows through an injected `now`.
// ---------------------------------------------------------------------------

/**
 * Coerce an injected `now` into a Date. Accepts a Date, an ISO string, or
 * undefined; throws on undefined so a caller can never silently fall back to a
 * hidden global clock (the purity contract). Tests always pass `now`.
 *
 * @param {Date|string|undefined} now
 * @returns {Date}
 */
function coerceNow(now) {
  if (now instanceof Date) return now;
  if (typeof now === 'string' && now.length) {
    const d = new Date(now);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new Error('instinct-store: a `now` (Date or ISO string) must be injected — no global clock is used');
}

/** ISO date (YYYY-MM-DD) from an injected `now`. */
function isoDate(now) {
  return coerceNow(now).toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (b - a), floored at 0. */
function daysBetween(aIso, bIso) {
  const a = Date.parse(aIso + 'T00:00:00Z');
  const b = Date.parse(bIso + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

// ---------------------------------------------------------------------------
// Paths — project store (worktree-safe) + global store + optional FTS index.
// ---------------------------------------------------------------------------

/**
 * Resolve the on-disk locations for a scope.
 *
 *   project: <resolveDesignRoot(baseDir)>/instincts/instincts.json
 *   global:  <os.homedir()>/.claude/gdd/global-instincts.json
 *
 * `dir` is the directory the store file lives in (where archive/ + the optional
 * FTS index sit alongside). `exec` is forwarded to worktree-resolve for tests.
 *
 * @param {{ scope?: 'project'|'global', baseDir?: string, exec?: Function }} [opts]
 * @returns {{ scope: string, dir: string, file: string, archiveDir: string, ftsPath: string }}
 */
function paths(opts = {}) {
  const scope = opts.scope || 'project';
  if (scope === 'global') {
    const dir = path.join(os.homedir(), '.claude', 'gdd');
    return {
      scope,
      dir,
      file: path.join(dir, 'global-instincts.json'),
      archiveDir: path.join(dir, 'instincts', 'archive'),
      ftsPath: path.join(dir, 'global-instincts.fts.db'),
    };
  }
  const base = opts.baseDir || process.cwd();
  const dir = path.join(resolveDesignRoot(base, opts.exec), 'instincts');
  return {
    scope,
    dir,
    file: path.join(dir, 'instincts.json'),
    archiveDir: path.join(dir, 'archive'),
    ftsPath: path.join(dir, 'instincts.fts.db'),
  };
}

// ---------------------------------------------------------------------------
// Load / save — JSON-canonical, atomic .tmp+rename (mirrors ds-arms save()).
// ---------------------------------------------------------------------------

function load(opts = {}) {
  const { file } = paths(opts);
  if (!fs.existsSync(file)) return { schema_version: SCHEMA_VERSION, instincts: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data.instincts)) data.instincts = [];
    return data;
  } catch {
    return { schema_version: SCHEMA_VERSION, instincts: [] };
  }
}

function save(store, opts = {}) {
  const { file, dir } = paths(opts);
  fs.mkdirSync(dir, { recursive: true });
  store.schema_version = SCHEMA_VERSION;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(tmp, file);
  // The FTS index (if any) is now stale; drop it so the next query rebuilds it.
  _invalidateFts(opts);
}

// ---------------------------------------------------------------------------
// deriveProjectId — sha8 of the normalized git origin; never throws.
// Mirrors pseudonymize.stablePseudonym shape (normalizeRepoOrigin + sha256[:8]).
// ---------------------------------------------------------------------------

/**
 * Default git runner: `git -C <cwd> remote get-url origin` -> trimmed stdout,
 * or null on any failure (no repo, git missing, no origin remote).
 *
 * @param {string} cwd
 * @returns {string|null}
 */
function defaultOrigin(cwd) {
  try {
    const res = spawnSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (!res || res.status !== 0 || typeof res.stdout !== 'string') return null;
    const out = res.stdout.trim();
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Derive a stable 8-char hex project id from the git origin URL. The same
 * logical origin across git@/https/ssh shapes maps to one id (normalizeRepoOrigin).
 * Returns the sentinel 'unknown' when no origin can be resolved. NEVER throws.
 *
 * `exec` is an injectable `(cmd, args) => string` git runner (matching the
 * worktree-resolve contract) so tests need no real repo.
 *
 * @param {string} [cwd=process.cwd()]
 * @param {(cmd: string, args: string[]) => string} [exec]
 * @returns {string} 8-char hex, or 'unknown'
 */
function deriveProjectId(cwd = process.cwd(), exec) {
  let origin = null;
  try {
    if (typeof exec === 'function') {
      const out = exec('git', ['-C', cwd, 'remote', 'get-url', 'origin']);
      origin = typeof out === 'string' && out.trim().length ? out.trim() : null;
    } else {
      origin = defaultOrigin(cwd);
    }
  } catch {
    origin = null;
  }
  if (!origin) return 'unknown';
  const normalized = normalizeRepoOrigin(origin);
  if (!normalized) return 'unknown';
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 8);
}

// ---------------------------------------------------------------------------
// add / get / list — the CRUD surface.
// ---------------------------------------------------------------------------

/** Find the index of a unit by id in a store's instincts array, or -1. */
function _indexOf(store, id) {
  return store.instincts.findIndex((u) => u && u.id === id);
}

/**
 * Persist an instinct. Stamps first_seen/last_seen from the injected `now` and
 * seeds cycles_seen=1 when absent. Project-scoped units record their project_id
 * in the project_ids set. Replaces an existing unit with the same id. Atomic.
 *
 * @param {object} unit  the instinct frontmatter object (id/trigger/confidence/domain/...)
 * @param {{ scope?: string, baseDir?: string, now?: Date|string, exec?: Function }} [opts]
 * @returns {object} the stored unit
 */
function add(unit, opts = {}) {
  if (!unit || typeof unit !== 'object' || typeof unit.id !== 'string' || !unit.id.length) {
    throw new Error('instinct-store.add: unit must be an object with a non-empty string id');
  }
  const scope = opts.scope || 'project';
  const date = isoDate(opts.now);
  const store = load({ ...opts, scope });

  const stored = { ...unit, scope };
  if (typeof stored.first_seen !== 'string') stored.first_seen = date;
  stored.last_seen = typeof stored.last_seen === 'string' ? stored.last_seen : date;
  if (typeof stored.cycles_seen !== 'number' || stored.cycles_seen < 1) stored.cycles_seen = 1;

  // Track the distinct-project set used by the promotion gate.
  const ids = Array.isArray(stored.project_ids) ? stored.project_ids.slice() : [];
  if (typeof stored.project_id === 'string' && stored.project_id && !ids.includes(stored.project_id)) {
    ids.push(stored.project_id);
  }
  stored.project_ids = ids;

  const existing = _indexOf(store, stored.id);
  if (existing >= 0) store.instincts[existing] = stored;
  else store.instincts.push(stored);

  save(store, { ...opts, scope });
  return stored;
}

/**
 * Return all units for a scope, optionally filtered by domain, sorted by
 * last_seen DESC (most-recently-surfaced first).
 *
 * @param {{ scope?: string, domain?: string, baseDir?: string, exec?: Function }} [opts]
 * @returns {object[]}
 */
function list(opts = {}) {
  const store = load(opts);
  let units = store.instincts.slice();
  if (opts.domain) units = units.filter((u) => u.domain === opts.domain);
  units.sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')));
  return units;
}

/**
 * Fetch one unit by id, or null.
 *
 * @param {string} id
 * @param {{ scope?: string, baseDir?: string, exec?: Function }} [opts]
 * @returns {object|null}
 */
function get(id, opts = {}) {
  const store = load(opts);
  const i = _indexOf(store, id);
  return i >= 0 ? store.instincts[i] : null;
}

// ---------------------------------------------------------------------------
// query — ranked keyword match over trigger + body + domain.
//   FTS5 fast path when better-sqlite3+fts5 is available, else an in-memory
//   token/substring scan (the path CI exercises). Both return the SAME shape.
// ---------------------------------------------------------------------------

/** Lowercased searchable text for a unit: trigger + body + domain + id. */
function _haystack(unit) {
  return [unit.trigger, unit.body, unit.domain, unit.id]
    .filter((s) => typeof s === 'string')
    .join('\n')
    .toLowerCase();
}

/** In-memory ranking: term-frequency over tokens, with a substring fallback. */
function _scoreJs(keyword, unit) {
  const hay = _haystack(unit);
  const terms = String(keyword).toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  let score = 0;
  for (const t of terms) {
    // Count occurrences (term frequency). split().length-1 = occurrence count.
    const occ = hay.split(t).length - 1;
    if (occ > 0) score += occ;
  }
  // A trigger hit is worth more than a body hit — weight trigger matches.
  const trig = typeof unit.trigger === 'string' ? unit.trigger.toLowerCase() : '';
  for (const t of terms) if (trig.includes(t)) score += 2;
  return score;
}

function _queryJs(keyword, opts) {
  const limit = opts.limit ?? 3;
  const store = load(opts);
  const scored = store.instincts
    .map((u) => ({ u, s: _scoreJs(keyword, u) }))
    .filter((r) => r.s > 0);
  scored.sort((a, b) => b.s - a.s || String(b.u.last_seen || '').localeCompare(String(a.u.last_seen || '')));
  return scored.slice(0, limit).map((r) => r.u);
}

/** Drop a stale FTS index file (best-effort) so the next query rebuilds it. */
function _invalidateFts(opts) {
  if (!_fts5Supported) return;
  try {
    const { ftsPath } = paths(opts);
    if (fs.existsSync(ftsPath)) fs.rmSync(ftsPath, { force: true });
  } catch {
    /* best-effort */
  }
}

function _queryFts5(keyword, opts) {
  const limit = opts.limit ?? 3;
  const store = load(opts);
  if (!store.instincts.length) return [];
  const { ftsPath, dir } = paths(opts);
  fs.mkdirSync(dir, { recursive: true });

  // Build a fresh in-memory-ish index keyed by array position. We rebuild each
  // call (instinct stores are small) so the index can never drift from JSON.
  const db = new Database(ftsPath);
  try {
    db.exec("DROP TABLE IF EXISTS units");
    db.exec("CREATE VIRTUAL TABLE units USING fts5(idx UNINDEXED, body, tokenize='trigram')");
    const insert = db.prepare('INSERT INTO units(idx, body) VALUES (?, ?)');
    const txn = db.transaction((rows) => {
      for (const r of rows) insert.run(r.idx, r.body);
    });
    txn(store.instincts.map((u, idx) => ({ idx, body: _haystack(u) })));

    const terms = String(keyword).toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const matchExpr = terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
    const rows = db
      .prepare('SELECT idx FROM units WHERE units MATCH ? ORDER BY rank LIMIT ?')
      .all(matchExpr, limit);
    return rows.map((r) => store.instincts[r.idx]).filter(Boolean);
  } finally {
    db.close();
  }
}

/**
 * Rank instincts matching `keyword` over trigger + body + domain. Returns at
 * most `limit` units, best match first. Uses the FTS5 backend when available,
 * else the in-memory scan; both produce the same ranked shape.
 *
 * @param {string} keyword
 * @param {{ scope?: string, baseDir?: string, limit?: number, exec?: Function }} [opts]
 * @returns {object[]}
 */
function query(keyword, opts = {}) {
  if (typeof keyword !== 'string' || !keyword.trim()) return [];
  if (_fts5Supported) {
    try {
      return _queryFts5(keyword, opts);
    } catch {
      // A corrupt/locked index must never break recall — degrade to the scan.
      return _queryJs(keyword, opts);
    }
  }
  return _queryJs(keyword, opts);
}

// ---------------------------------------------------------------------------
// touch — bump last_seen + cycles_seen, widen project_ids, reset decay.
// ---------------------------------------------------------------------------

/**
 * Record that an instinct was surfaced again: bump last_seen to `now`,
 * increment cycles_seen, and (project scope) add the current project_id to the
 * unit's project_ids set. Resets the TTL decay window. Atomic.
 *
 * @param {string} id
 * @param {{ scope?: string, baseDir?: string, now?: Date|string, projectId?: string, exec?: Function }} [opts]
 * @returns {object|null} the touched unit, or null if not found
 */
function touch(id, opts = {}) {
  const scope = opts.scope || 'project';
  const store = load({ ...opts, scope });
  const i = _indexOf(store, id);
  if (i < 0) return null;
  const unit = store.instincts[i];
  unit.last_seen = isoDate(opts.now);
  unit.cycles_seen = (typeof unit.cycles_seen === 'number' ? unit.cycles_seen : 0) + 1;

  const pid = typeof opts.projectId === 'string' && opts.projectId ? opts.projectId : unit.project_id;
  if (typeof pid === 'string' && pid) {
    const ids = Array.isArray(unit.project_ids) ? unit.project_ids : [];
    if (!ids.includes(pid)) ids.push(pid);
    unit.project_ids = ids;
  }
  save(store, { ...opts, scope });
  return unit;
}

// ---------------------------------------------------------------------------
// promote — move a project instinct to the global store once the gate passes.
// ---------------------------------------------------------------------------

/**
 * Promote a project instinct to the global store. Gate: cycles_seen >= K (2)
 * AND it has been seen across >= M (2) distinct project_ids. Throws a clear
 * Error if the gate is unmet. On promotion the unit is re-scoped to global,
 * seeded with the Beta(2,8) prior class, and removed from the project store.
 *
 * @param {string} id
 * @param {{ baseDir?: string, now?: Date|string, exec?: Function }} [opts]
 * @returns {object} the promoted (global-scoped) unit
 */
function promote(id, opts = {}) {
  const projectStore = load({ ...opts, scope: 'project' });
  const i = _indexOf(projectStore, id);
  if (i < 0) throw new Error(`instinct-store.promote: no project instinct with id "${id}"`);
  const unit = projectStore.instincts[i];

  const cycles = typeof unit.cycles_seen === 'number' ? unit.cycles_seen : 0;
  const distinctProjects = Array.isArray(unit.project_ids) ? new Set(unit.project_ids).size : 0;
  if (cycles < PROMOTE_MIN_CYCLES || distinctProjects < PROMOTE_MIN_PROJECTS) {
    throw new Error(
      `instinct-store.promote: "${id}" fails the promotion gate ` +
        `(cycles_seen=${cycles} needs >=${PROMOTE_MIN_CYCLES}, ` +
        `distinct project_ids=${distinctProjects} needs >=${PROMOTE_MIN_PROJECTS})`,
    );
  }

  // Build the global-scoped unit: drop the single-origin project_id, apply the
  // Beta(2,8) prior class, keep the cross-project provenance set.
  const promoted = {
    ...unit,
    scope: 'global',
    alpha: INSTINCT_PRIOR.alpha,
    beta: INSTINCT_PRIOR.beta,
    prior_class: 'instinct',
    last_seen: isoDate(opts.now),
  };
  delete promoted.project_id;

  const globalStore = load({ ...opts, scope: 'global' });
  const gi = _indexOf(globalStore, id);
  if (gi >= 0) globalStore.instincts[gi] = promoted;
  else globalStore.instincts.push(promoted);
  save(globalStore, { ...opts, scope: 'global' });

  // Remove from the project store now that it is global.
  projectStore.instincts.splice(i, 1);
  save(projectStore, { ...opts, scope: 'project' });

  return promoted;
}

// ---------------------------------------------------------------------------
// decay — TTL: unsurfaced for >= cyclesWindow -> confidence *= 0.9; archive <0.2.
// ---------------------------------------------------------------------------

/**
 * Apply TTL decay across a scope. An instinct not surfaced within the decay
 * window has its confidence multiplied by 0.9. Any instinct whose confidence
 * falls below 0.2 is archived (moved to <store-dir>/archive/<id>.json) and
 * removed from the live store. The decay window is measured in CYCLES; one
 * cycle is treated as one day for the staleness math, and tests inject `now`
 * to fast-forward. Atomic.
 *
 * @param {{ scope?: string, baseDir?: string, now?: Date|string, cyclesWindow?: number, exec?: Function }} [opts]
 * @returns {{ decayed: number, archived: number }}
 */
function decay(opts = {}) {
  const scope = opts.scope || 'project';
  const window = typeof opts.cyclesWindow === 'number' ? opts.cyclesWindow : DECAY_CYCLES_WINDOW;
  const today = isoDate(opts.now);
  const store = load({ ...opts, scope });

  let decayed = 0;
  let archived = 0;
  const survivors = [];
  const toArchive = [];

  for (const unit of store.instincts) {
    const last = typeof unit.last_seen === 'string' ? unit.last_seen : today;
    const stale = daysBetween(last, today) >= window;
    if (stale && typeof unit.confidence === 'number') {
      unit.confidence = Math.max(0, unit.confidence * DECAY_FACTOR);
      decayed += 1;
    }
    if (typeof unit.confidence === 'number' && unit.confidence < ARCHIVE_THRESHOLD) {
      toArchive.push(unit);
      archived += 1;
    } else {
      survivors.push(unit);
    }
  }

  if (archived > 0) {
    const { archiveDir } = paths({ ...opts, scope });
    fs.mkdirSync(archiveDir, { recursive: true });
    for (const unit of toArchive) {
      const dest = path.join(archiveDir, `${unit.id}.json`);
      const tmp = dest + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ ...unit, archived_at: today }, null, 2) + '\n');
      fs.renameSync(tmp, dest);
    }
  }

  store.instincts = survivors;
  save(store, { ...opts, scope });
  return { decayed, archived };
}

// ---------------------------------------------------------------------------
// parseUnit — read a YAML instinct unit (frontmatter + body) into an object.
//   Reuses splitFrontmatter from generate-skill-frontmatter.cjs. That helper
//   calls process.exit on malformed input, so we guard the fences first and
//   return null rather than letting the process die.
// ---------------------------------------------------------------------------

/** Minimal YAML-scalar coercion for the flat frontmatter our schema allows. */
function _coerceScalar(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  // inline flow array: [a, b, c]
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => _coerceScalar(s));
  }
  return v;
}

/**
 * Parse an instinct unit document (YAML frontmatter + markdown body) into a
 * frontmatter object with a `body` field appended. Returns null when the text
 * is not a well-formed frontmatter document (no fences) rather than throwing.
 *
 * @param {string} text
 * @param {string} [id='instinct'] label used in error context
 * @returns {object|null}
 */
function parseUnit(text, id = 'instinct') {
  if (typeof text !== 'string') return null;
  const norm = text.replace(/\r\n/g, '\n');
  // Guard the fences ourselves — splitFrontmatter exits the process on bad input.
  if (!norm.startsWith('---\n') || norm.indexOf('\n---\n', 4) === -1) return null;
  const { fmLines, body } = splitFrontmatter(norm, id);
  const obj = {};
  for (const line of fmLines) {
    const m = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (!m) continue;
    obj[m[1]] = _coerceScalar(m[2]);
  }
  obj.body = body.trim();
  return obj;
}

module.exports = {
  // CRUD + recall
  add,
  list,
  query,
  get,
  // lifecycle
  promote,
  touch,
  decay,
  // identity + parsing
  deriveProjectId,
  parseUnit,
  // backend + helpers
  backendName,
  load,
  save,
  paths,
  // constants
  INSTINCT_PRIOR,
  DOMAINS,
  SCHEMA_VERSION,
  CONFIDENCE_FLOOR,
  CONFIDENCE_CEILING,
  PROMOTE_MIN_CYCLES,
  PROMOTE_MIN_PROJECTS,
  DECAY_CYCLES_WINDOW,
  DECAY_FACTOR,
  ARCHIVE_THRESHOLD,
};
