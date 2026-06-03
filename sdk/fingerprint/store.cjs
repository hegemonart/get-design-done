'use strict';
/**
 * sdk/fingerprint/store.cjs — Phase 53 (Semantic Mapper Engine), FP-02.
 *
 * Persistence for the per-node fingerprint set across design cycles:
 *
 *   .design/fingerprints/current.json     — the latest fingerprint snapshot
 *   .design/fingerprints/cycle-NNN.json    — rolling history (newest N=5 kept)
 *
 * The store is JSON-canonical and writes are ATOMIC (tmp + rename in the SAME
 * directory — the Windows-safe pattern from `scripts/lib/graph/atomic-write.mjs`,
 * inlined here as the sanctioned CJS twin exactly as `scripts/lib/live/session-store.cjs`
 * and `scripts/lib/design-context/integration-map.mjs` already do, so this module
 * stays synchronous + dep-free + `require()`-able from `.cjs` CLIs and skills).
 *
 * The store ROOT follows the Phase 49 worktree-redirect: writes resolve through
 * `scripts/lib/worktree-resolve.cjs#resolveRepoRoot()` so a GDD run inside a git
 * worktree persists fingerprints in the MAIN checkout, not the throwaway
 * worktree. Tests (and any caller that wants an explicit location) pass a
 * `{ root }` override that bypasses git resolution entirely — see ROOT OVERRIDE.
 *
 * `sinceCycle` answers "which node ids changed since cycle X" with an OPTIONAL
 * FTS5 acceleration via `probeOptional('better-sqlite3')` and a dependency-free
 * JSON-scan fallback (the three-tier optional-SQLite pattern from
 * `design-search.cjs` / `instinct-store.cjs`). The native module is NEVER
 * required: with better-sqlite3 absent, the JSON-scan path answers the same
 * query, so the suite passes on a clean install.
 *
 * NEVER throws on an absent store: reads return an empty/bootstrap shape and
 * `sinceCycle` treats "no prior cycle" as "everything is new" (returns the
 * current id set). Determinism is a hard contract (D6): ids are returned sorted;
 * no `Math.random` / `Date.now` leaks into stored content (the atomic tmp suffix
 * uses pid+random for filename uniqueness only and never lands in the payload).
 *
 * ---------------------------------------------------------------------------
 * STORED SHAPE
 * ---------------------------------------------------------------------------
 *   current.json / cycle-NNN.json:
 *     {
 *       schema_version: '53.0',
 *       cycle: number|null,                 // the cycle this snapshot represents (null for current-before-roll)
 *       fingerprints: Record<nodeId, { full: string, structural: string, type?: string }>
 *     }
 *
 *   `fingerprints` is whatever the caller hands `writeCurrent` — typically the
 *   per-node `{ full, structural }` from `sdk/fingerprint/index.ts#fingerprint`.
 *   The store treats values opaquely except that `sinceCycle` compares the
 *   `full` (and falls back to `structural`, then a stable stringify) to detect
 *   change. A plain `Record<nodeId, string>` of hashes also works.
 *
 * ---------------------------------------------------------------------------
 * ROOT OVERRIDE (the `{ root }` convention — used by tests + explicit callers)
 * ---------------------------------------------------------------------------
 *   Every function takes an options bag whose `root` field, when a non-empty
 *   string, is used VERBATIM as the repo root (the store lives at
 *   `<root>/.design/fingerprints/`). No git is consulted. When `root` is absent,
 *   the root is `resolveRepoRoot(opts.cwd, opts.exec)` — worktree-redirected.
 *   `opts.exec` is the injectable git runner from worktree-resolve.cjs (tests
 *   simulate a worktree without a real one). So:
 *
 *     writeCurrent(fps, { root: '/tmp/fake-repo' })   // hermetic, no git
 *     writeCurrent(fps)                               // resolveRepoRoot(cwd)
 *     writeCurrent(fps, { cwd, exec })                // simulated worktree
 */

const fs = require('node:fs');
const path = require('node:path');

const { probeOptional } = require('../../scripts/lib/probe-optional.cjs');
const { resolveRepoRoot } = require('../../scripts/lib/worktree-resolve.cjs');

const SCHEMA_VERSION = '53.0';

/** Rolling history depth — newest N cycle snapshots are kept, older pruned. */
const ROLLING_HISTORY = 5;

// ---------------------------------------------------------------------------
// better-sqlite3 + FTS5 backend probe (evaluated once at module load).
//   Mirrors design-search.cjs / instinct-store.cjs backend selection. The
//   native module is purely an OPTIONAL accelerator for sinceCycle; the JSON
//   scan below answers the identical query when it is absent.
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
    /* fts5 extension not compiled in — the JSON scan answers sinceCycle */
  }
}

/** 'fts5' when better-sqlite3+fts5 is available, else the dep-free 'json-scan'. */
function backendName() {
  return _fts5Supported ? 'fts5' : 'json-scan';
}

// ---------------------------------------------------------------------------
// Atomic JSON write — sanctioned synchronous CJS twin of
//   scripts/lib/graph/atomic-write.mjs#atomicWriteJson (same tmp+rename in the
//   SAME directory; the Windows atomicity guarantee). Inlined exactly as
//   session-store.cjs / integration-map.mjs do, because that ESM helper cannot
//   be `require()`d from CJS without forcing this whole module async.
// ---------------------------------------------------------------------------

/**
 * @param {string} target absolute path to the final JSON file
 * @param {unknown} payload JSON-serializable value (pretty 2-space + trailing \n)
 */
function atomicWriteJson(target, payload) {
  const parent = path.dirname(target);
  const base = path.basename(target);
  const tmp = path.join(
    parent,
    `.${base}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
  );
  // Invariant: tmp must live in the SAME dir as target (cross-device rename is
  // not atomic on Windows). Resolve both to normalize slash style.
  if (path.resolve(path.dirname(tmp)) !== path.resolve(parent)) {
    throw new Error(
      `atomicWriteJson invariant: tmp not in same dir as target (tmp=${tmp}, target=${target})`,
    );
  }
  fs.mkdirSync(parent, { recursive: true });
  const body = JSON.stringify(payload, null, 2) + '\n';
  try {
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    if (fs.existsSync(tmp)) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* swallow cleanup error — original throw wins */
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Paths — resolve the store dir + file locations from the {root} override or
//   the worktree-redirected repo root.
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute repo root for a call. A non-empty `opts.root` string is
 * used verbatim (hermetic; no git). Otherwise `resolveRepoRoot(cwd, exec)`
 * applies the worktree redirect (and degrades to cwd when git is unavailable).
 *
 * @param {{ root?: string, cwd?: string, exec?: Function }} [opts]
 * @returns {string} absolute repo root
 */
function resolveRoot(opts = {}) {
  if (typeof opts.root === 'string' && opts.root.length) {
    return path.resolve(opts.root);
  }
  const cwd = typeof opts.cwd === 'string' && opts.cwd.length ? opts.cwd : process.cwd();
  return resolveRepoRoot(cwd, opts.exec);
}

/**
 * The store directory `<root>/.design/fingerprints` and the well-known files
 * within it.
 *
 * @param {{ root?: string, cwd?: string, exec?: Function }} [opts]
 * @returns {{ root: string, dir: string, currentFile: string, ftsPath: string }}
 */
function paths(opts = {}) {
  const root = resolveRoot(opts);
  const dir = path.join(root, '.design', 'fingerprints');
  return {
    root,
    dir,
    currentFile: path.join(dir, 'current.json'),
    ftsPath: path.join(dir, 'fingerprints.fts.db'),
  };
}

/** Zero-pad a cycle number to 3 digits for the `cycle-NNN.json` filename. */
function cycleFileName(n) {
  const num = Math.max(0, Math.floor(Number(n) || 0));
  return `cycle-${String(num).padStart(3, '0')}.json`;
}

/** Absolute path to a specific cycle snapshot file. */
function cyclePath(n, opts = {}) {
  return path.join(paths(opts).dir, cycleFileName(n));
}

// ---------------------------------------------------------------------------
// Shape helpers — normalize whatever the caller stores into the canonical
//   envelope, and read it back tolerantly (never throw on absent/corrupt).
// ---------------------------------------------------------------------------

/** The empty/bootstrap snapshot returned when nothing is on disk. */
function emptySnapshot() {
  return { schema_version: SCHEMA_VERSION, cycle: null, fingerprints: {} };
}

/**
 * Coerce arbitrary input into the canonical `{ schema_version, cycle,
 * fingerprints }` envelope. Accepts either a bare `fingerprints` map or an
 * already-enveloped object.
 *
 * @param {object} input
 * @param {number|null} cycle
 * @returns {{ schema_version: string, cycle: number|null, fingerprints: object }}
 */
function toEnvelope(input, cycle) {
  let fingerprints = {};
  if (input && typeof input === 'object') {
    if (input.fingerprints && typeof input.fingerprints === 'object') {
      fingerprints = input.fingerprints;
    } else {
      // bare map of nodeId -> fingerprint
      fingerprints = input;
    }
  }
  return {
    schema_version: SCHEMA_VERSION,
    cycle: Number.isFinite(cycle) ? Math.floor(cycle) : null,
    fingerprints: fingerprints && typeof fingerprints === 'object' ? fingerprints : {},
  };
}

/** Read + parse a JSON snapshot file, tolerant of absence/corruption. */
function readSnapshotFile(file) {
  if (!fs.existsSync(file)) return emptySnapshot();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object') return emptySnapshot();
    if (!data.fingerprints || typeof data.fingerprints !== 'object') {
      data.fingerprints = {};
    }
    if (typeof data.schema_version !== 'string') data.schema_version = SCHEMA_VERSION;
    if (!('cycle' in data)) data.cycle = null;
    return data;
  } catch {
    return emptySnapshot();
  }
}

/**
 * Extract a stable, comparable signature for one stored fingerprint value.
 * Prefers `full`, then `structural`, then a deterministic stringify (sorted
 * keys) so a plain string or an arbitrary object both compare correctly.
 *
 * @param {unknown} v
 * @returns {string}
 */
function sigOf(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    if (typeof v.full === 'string') return v.full;
    if (typeof v.structural === 'string') return v.structural;
    try {
      const keys = Object.keys(v).sort();
      return keys.map((k) => `${k}=${JSON.stringify(v[k])}`).join('|');
    } catch {
      return '';
    }
  }
  return String(v);
}

// ---------------------------------------------------------------------------
// writeCurrent / readCurrent — the live snapshot.
// ---------------------------------------------------------------------------

/**
 * Atomically write the current fingerprint snapshot to
 * `<root>/.design/fingerprints/current.json`. Returns the absolute path written.
 *
 * @param {object} fingerprints bare map nodeId->fp OR an enveloped snapshot
 * @param {{ root?: string, cwd?: string, exec?: Function, cycle?: number }} [opts]
 * @returns {{ path: string, snapshot: object }}
 */
function writeCurrent(fingerprints, opts = {}) {
  const { currentFile } = paths(opts);
  const cycle =
    Number.isFinite(opts.cycle) ? opts.cycle
    : fingerprints && typeof fingerprints === 'object' && Number.isFinite(fingerprints.cycle)
      ? fingerprints.cycle
      : null;
  const snapshot = toEnvelope(fingerprints, cycle);
  atomicWriteJson(currentFile, snapshot);
  return { path: currentFile, snapshot };
}

/**
 * Read the current snapshot, or the empty/bootstrap shape when none exists.
 *
 * @param {{ root?: string, cwd?: string, exec?: Function }} [opts]
 * @returns {{ schema_version: string, cycle: number|null, fingerprints: object }}
 */
function readCurrent(opts = {}) {
  return readSnapshotFile(paths(opts).currentFile);
}

/**
 * Read a specific cycle snapshot, or the empty/bootstrap shape when absent.
 *
 * @param {number} n cycle number
 * @param {{ root?: string, cwd?: string, exec?: Function }} [opts]
 * @returns {{ schema_version: string, cycle: number|null, fingerprints: object }}
 */
function readCycle(n, opts = {}) {
  return readSnapshotFile(cyclePath(n, opts));
}

// ---------------------------------------------------------------------------
// rollCycle — snapshot current → cycle-NNN.json, then prune to rolling N=5.
// ---------------------------------------------------------------------------

/** List existing cycle snapshot files as { n, file }, sorted by n ascending. */
function listCycles(opts = {}) {
  const { dir } = paths(opts);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of entries) {
    const m = /^cycle-(\d+)\.json$/.exec(name);
    if (m) out.push({ n: parseInt(m[1], 10), file: path.join(dir, name) });
  }
  out.sort((a, b) => a.n - b.n);
  return out;
}

/**
 * Snapshot the current fingerprint set into `cycle-NNN.json`, stamping the
 * envelope's `cycle` field, then prune the history to the newest ROLLING_HISTORY
 * (=5) snapshots (oldest deleted). Idempotent per cycle number (re-rolling the
 * same N overwrites that snapshot atomically). Never throws on an absent
 * current.json — it rolls an empty snapshot (a degenerate but valid cycle).
 *
 * @param {number} cycleN the cycle number to stamp this snapshot with
 * @param {{ root?: string, cwd?: string, exec?: Function }} [opts]
 * @returns {{ path: string, cycle: number, pruned: string[], kept: number[] }}
 */
function rollCycle(cycleN, opts = {}) {
  const n = Math.max(0, Math.floor(Number(cycleN) || 0));
  const current = readCurrent(opts);
  const snapshot = toEnvelope(current, n);
  const dest = cyclePath(n, opts);
  atomicWriteJson(dest, snapshot);

  // Prune to the newest ROLLING_HISTORY snapshots. Sort by cycle number so the
  // pruning is deterministic regardless of readdir order.
  const cycles = listCycles(opts);
  const pruned = [];
  if (cycles.length > ROLLING_HISTORY) {
    const excess = cycles.length - ROLLING_HISTORY;
    for (let i = 0; i < excess; i++) {
      const victim = cycles[i]; // oldest first (ascending sort)
      try {
        fs.rmSync(victim.file, { force: true });
        pruned.push(victim.file);
      } catch {
        /* best-effort prune; a locked file simply remains */
      }
    }
  }
  const kept = listCycles(opts).map((c) => c.n);
  return { path: dest, cycle: n, pruned, kept };
}

// ---------------------------------------------------------------------------
// sinceCycle — ids whose fingerprint changed since cycle X.
//   FTS5 fast path when available; dep-free JSON scan otherwise. Both compare
//   the stored signature of each node in current.json against the cycle-X
//   snapshot and return the SORTED set of changed (added / modified) ids. A node
//   present in cycle-X but absent from current is treated as REMOVED and its id
//   is also included (a removal is a change the caller must react to).
// ---------------------------------------------------------------------------

/**
 * Pure diff between two fingerprint maps → sorted array of changed ids
 * (added, modified, or removed). Shared by both backends so they agree.
 *
 * @param {object} baseFps fingerprints at cycle X
 * @param {object} currFps current fingerprints
 * @returns {string[]} sorted changed ids
 */
function diffFingerprintMaps(baseFps, currFps) {
  const base = baseFps && typeof baseFps === 'object' ? baseFps : {};
  const curr = currFps && typeof currFps === 'object' ? currFps : {};
  const changed = new Set();
  // added or modified
  for (const id of Object.keys(curr)) {
    if (!(id in base) || sigOf(curr[id]) !== sigOf(base[id])) changed.add(id);
  }
  // removed
  for (const id of Object.keys(base)) {
    if (!(id in curr)) changed.add(id);
  }
  return [...changed].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * FTS5-accelerated diff. We do NOT use full-text ranking here (the query is an
 * exact id+signature set-difference, not a relevance search); FTS5 is used as a
 * fast keyed store to materialize the base snapshot and probe membership. This
 * keeps parity with the JSON scan while exercising the native module when it is
 * present. Falls back to the JSON scan on any sqlite error.
 *
 * @param {object} baseFps
 * @param {object} currFps
 * @param {string} ftsPath
 * @returns {string[]}
 */
function _sinceCycleFts5(baseFps, currFps, ftsPath) {
  // The FTS5 path materializes base (id, sig) into a trigram-indexed table and
  // diffs against current. For the exact-membership query an ordinary table
  // would do, but we keep the fts5 vtable so the optional-backend wiring is
  // genuinely exercised when better-sqlite3 is installed. On ANY failure we
  // degrade to the identical JSON-scan diff — recall must never break.
  let db;
  try {
    fs.mkdirSync(path.dirname(ftsPath), { recursive: true });
    db = new Database(ftsPath);
    db.exec('DROP TABLE IF EXISTS base_fp');
    db.exec("CREATE VIRTUAL TABLE base_fp USING fts5(id UNINDEXED, sig UNINDEXED, tokenize='trigram')");
    const insert = db.prepare('INSERT INTO base_fp(id, sig) VALUES (?, ?)');
    const rows = Object.keys(baseFps || {}).map((id) => ({ id, sig: sigOf(baseFps[id]) }));
    const txn = db.transaction((rs) => {
      for (const r of rs) insert.run(r.id, r.sig);
    });
    txn(rows);

    const lookup = db.prepare('SELECT sig FROM base_fp WHERE id = ? LIMIT 1');
    const changed = new Set();
    for (const id of Object.keys(currFps || {})) {
      const row = lookup.get(id);
      if (!row || row.sig !== sigOf(currFps[id])) changed.add(id);
    }
    // removed: ids in base not in current
    const currKeys = new Set(Object.keys(currFps || {}));
    for (const r of rows) if (!currKeys.has(r.id)) changed.add(r.id);

    return [...changed].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  } catch {
    return diffFingerprintMaps(baseFps, currFps);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Return the sorted set of node ids whose fingerprint changed since cycle
 * `cycleN` (added, modified, or removed relative to that snapshot), comparing
 * against the CURRENT snapshot.
 *
 * Bootstrap / absent-baseline behavior: when the requested cycle snapshot does
 * not exist (or is empty), there is no prior baseline, so EVERY current id is
 * "changed" — the full current id set is returned (sorted). When BOTH the cycle
 * and current snapshots are empty, returns []. Never throws.
 *
 * Uses the FTS5 backend when better-sqlite3+fts5 is available, else the
 * dep-free JSON scan; both return the identical sorted id set.
 *
 * @param {number} cycleN the cycle to diff against
 * @param {{ root?: string, cwd?: string, exec?: Function }} [opts]
 * @returns {string[]} sorted changed ids
 */
function sinceCycle(cycleN, opts = {}) {
  const baseSnap = readCycle(cycleN, opts);
  const currSnap = readCurrent(opts);
  const baseFps = baseSnap.fingerprints || {};
  const currFps = currSnap.fingerprints || {};

  // No baseline at that cycle ⇒ everything current is new (bootstrap).
  if (!Object.keys(baseFps).length) {
    return Object.keys(currFps).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  if (_fts5Supported) {
    try {
      return _sinceCycleFts5(baseFps, currFps, paths(opts).ftsPath);
    } catch {
      return diffFingerprintMaps(baseFps, currFps);
    }
  }
  return diffFingerprintMaps(baseFps, currFps);
}

module.exports = {
  // live snapshot
  writeCurrent,
  readCurrent,
  // history
  rollCycle,
  readCycle,
  listCycles,
  // since-cycle query
  sinceCycle,
  diffFingerprintMaps,
  // backend + paths (for tests / display)
  backendName,
  paths,
  cyclePath,
  cycleFileName,
  resolveRoot,
  // constants
  SCHEMA_VERSION,
  ROLLING_HISTORY,
};
