'use strict';
/**
 * design-search.cjs — cross-cycle recall search backend.
 *
 * Priority chain:
 *   1. FTS5 via better-sqlite3 (fast, ranked)  — when module is available
 *   2. ripgrep                                  — when rg is on PATH
 *   3. Node fs line scan                        — universal fallback
 *
 * Public API:
 *   search(query, projectRoot, opts?) → [{file, line, text}]
 *   reindex(projectRoot)              → void  (rebuilds FTS5 DB; no-op on grep path)
 *   backendName()                     → 'fts5' | 'ripgrep' | 'node-grep'
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { probeOptional } = require('./probe-optional.cjs');

// ---------------------------------------------------------------------------
// Backend selection (evaluated once at module load)
// ---------------------------------------------------------------------------

const Database = probeOptional('better-sqlite3');

let _fts5Supported = false;
if (Database) {
  try {
    const probe = new Database(':memory:');
    probe.exec('CREATE VIRTUAL TABLE _p USING fts5(t)');
    probe.close();
    _fts5Supported = true;
  } catch { /* fts5 extension not compiled in */ }
}

function _rgAvailable() {
  try {
    const r = spawnSync('rg', ['--version'], { encoding: 'utf8', windowsHide: true });
    return r.status === 0;
  } catch { return false; }
}

const _hasRg = _rgAvailable();

function backendName() {
  if (_fts5Supported) return 'fts5';
  if (_hasRg) return 'ripgrep';
  return 'node-grep';
}

// ---------------------------------------------------------------------------
// Index paths
// ---------------------------------------------------------------------------

const INDEXED_GLOBS = [
  '.design/archive/**/*.md',
  '.design/learnings/LEARNINGS.md',
  '.design/CYCLES.md',
];

function _dbPath(projectRoot) {
  return path.join(projectRoot, '.design', 'search.db');
}

function _collectFiles(projectRoot) {
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (e.name.endsWith('.md')) results.push(full);
    }
  }
  walk(path.join(projectRoot, '.design', 'archive'));
  for (const rel of [
    path.join('.design', 'learnings', 'LEARNINGS.md'),
    path.join('.design', 'CYCLES.md'),
  ]) {
    const full = path.join(projectRoot, rel);
    if (fs.existsSync(full)) results.push(full);
  }
  // STATE.md decision blocks
  const state = path.join(projectRoot, '.design', 'STATE.md');
  if (fs.existsSync(state)) results.push(state);
  return results;
}

// ---------------------------------------------------------------------------
// FTS5 backend
// ---------------------------------------------------------------------------

function _openDb(projectRoot) {
  const dbPath = _dbPath(projectRoot);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
      file UNINDEXED, line UNINDEXED, text, tokenize='trigram'
    );
  `);
  return db;
}

function reindex(projectRoot) {
  if (!_fts5Supported) return;
  const db = _openDb(projectRoot);
  db.exec('DELETE FROM docs');
  const insert = db.prepare('INSERT INTO docs(file, line, text) VALUES (?,?,?)');
  const txn = db.transaction((files) => {
    for (const file of files) {
      let content;
      try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t) insert.run(file, i + 1, t);
      }
    }
  });
  txn(_collectFiles(projectRoot));
  db.close();
}

function _searchFts5(query, projectRoot, limit) {
  const dbPath = _dbPath(projectRoot);
  if (!fs.existsSync(dbPath)) reindex(projectRoot);
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare(
      `SELECT file, line, text FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT ?`
    ).all(query, limit);
    return rows.map(r => ({ file: r.file, line: r.line, text: r.text }));
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Ripgrep backend
// ---------------------------------------------------------------------------

function _escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _searchRg(query, projectRoot, limit) {
  const terms = query.split(/\s+/).filter(Boolean);
  const pattern = terms.map(_escapeRe).join('|');
  const targets = _collectFiles(projectRoot);
  if (!targets.length || !pattern) return [];
  const r = spawnSync('rg', ['-n', '--no-heading', '-i', '-S', pattern, ...targets], {
    encoding: 'utf8', windowsHide: true,
  });
  const results = [];
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const m = line.match(/^(.+?):(\d+):(.*)$/);
    if (m) results.push({ file: m[1], line: Number(m[2]), text: m[3].trim() });
    if (results.length >= limit) break;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Node fs fallback backend
// ---------------------------------------------------------------------------

function _searchNode(query, projectRoot, limit) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const files = _collectFiles(projectRoot);
  const results = [];
  for (const file of files) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (terms.every(t => lower.includes(t))) {
        results.push({ file, line: i + 1, text: lines[i].trim() });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public search
// ---------------------------------------------------------------------------

/**
 * @param {string} query
 * @param {string} projectRoot  absolute path to the project (contains .design/)
 * @param {{ limit?: number }} [opts]
 * @returns {{ file: string, line: number, text: string }[]}
 */
function search(query, projectRoot, opts = {}) {
  const limit = opts.limit ?? 20;
  if (_fts5Supported) return _searchFts5(query, projectRoot, limit);
  if (_hasRg) return _searchRg(query, projectRoot, limit);
  return _searchNode(query, projectRoot, limit);
}

module.exports = { search, reindex, backendName };
