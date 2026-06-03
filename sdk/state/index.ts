// sdk/state/index.ts — public API for the gdd-state module.
//
// This is the ONLY file consumers should import from. The module exposes
// exactly five surface-level names:
//   * read(path)                    — parse STATE.md from disk
//   * mutate(path, fn)              — atomic read-modify-write under a lock
//   * transition(path, toStage)     — gate + stage-advance helper
//   * ParsedState (type)            — consumer-visible shape
//   * Stage (type)                  — stage enum
//
// Plan 20-02 wired the real transition gates in via `gateFor(from, to)`
// imported from `./gates.ts`. Plan 20-04 migrated the error classes
// (TransitionGateFailed, LockAcquisitionError, ParseError) to the
// unified `gdd-errors` taxonomy — `types.ts` re-exports them verbatim
// so consumers of `gdd-state` need no changes.
//
// Phase 57 (Plan 57-06 Round 2-D): dual-write to SQLite when migration
// is active for this state file. The public API signatures are FROZEN
// (SC#5) — only the persistence path branches internally.
//
// Migration-active gate:
//   migrationActive(statePath) === true
//     iff BACKEND==='sqlite' AND existsSync(<dir(statePath)>/state.sqlite)
//
// When false (the universal default for un-migrated projects and all
// existing Phase-20 tests that use temp STATE.md paths), every function
// behaves EXACTLY as before Phase 57: pure markdown path, byte-identical,
// same lockfile, same events.

import {
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { acquire, acquireSqliteLock } from './lockfile.ts';
import { parse } from './parser.ts';
import { serialize } from './mutator.ts';
import { gateFor } from './gates.ts';
import {
  TransitionGateFailed,
  isStage,
  type ParsedState,
  type Stage,
  type TransitionResult,
} from './types.ts';

export type { ParsedState, Stage } from './types.ts';
export { TransitionGateFailed, LockAcquisitionError, ParseError } from './types.ts';

// ---------------------------------------------------------------------------
// Phase 57: package-root resolver (walk-up from sdk/state/index.ts location).
// ---------------------------------------------------------------------------

/**
 * Walk up from `startDir` to find the package root (directory with
 * package.json named '@hegemonart/get-design-done').
 * Falls back to the first directory that has any package.json, then null.
 */
function _findPackageRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  let firstWithPkg: string | null = null;
  for (let i = 0; i < 12; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require(pkgPath) as { name?: string };
        if (firstWithPkg === null) firstWithPkg = dir;
        if (pkg.name === '@hegemonart/get-design-done') return dir;
      } catch {
        if (firstWithPkg === null) firstWithPkg = dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return firstWithPkg;
}

// ---------------------------------------------------------------------------
// Phase 57: backend probe (loaded once via require, memoized).
// state-backend.cjs is a CommonJS module; require() works from .ts under
// Node 22 --experimental-strip-types (only type-erasable syntax is used).
// ---------------------------------------------------------------------------

interface StateBackendMod {
  Database: ((...args: unknown[]) => unknown) | null;
  BACKEND: 'sqlite' | 'markdown';
  sqlitePath: (projectRoot: string) => string;
  openStateDb: (p: string, opts?: { readonly?: boolean }) => StateDb;
}

interface StateDb {
  close(): void;
  prepare(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[]; run(...args: unknown[]): unknown };
  transaction(fn: () => void): () => void;
  pragma(s: string): unknown;
  exec(s: string): void;
}

/** null = not yet loaded, false = failed to load, StateBackendMod = loaded */
let _backendCache: StateBackendMod | null | false = null;

function _loadBackend(): StateBackendMod | null {
  if (_backendCache !== null) return _backendCache === false ? null : _backendCache as StateBackendMod;
  try {
    const pkgRoot = _findPackageRoot(__dirname);
    if (pkgRoot === null) { _backendCache = false; return null; }
    const backendPath = join(pkgRoot, 'scripts', 'lib', 'state', 'state-backend.cjs');
    if (!existsSync(backendPath)) { _backendCache = false; return null; }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _backendCache = require(backendPath) as StateBackendMod;
    return _backendCache as StateBackendMod;
  } catch {
    _backendCache = false;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 57: state-store loader (async, cached after first successful load).
// state-store.cjs itself does dynamic imports of .ts SDK files, so we load
// it via dynamic import (not require) to stay in async context.
// ---------------------------------------------------------------------------

interface StateStoreMod {
  appendDecision: (...args: unknown[]) => Promise<unknown>;
  getDecisions: (...args: unknown[]) => unknown[];
  setPosition: (...args: unknown[]) => Promise<unknown>;
  getPosition: (...args: unknown[]) => unknown;
  backendName: () => string;
  [key: string]: unknown;
}

let _storeCache: StateStoreMod | null | false = null;

async function _loadStore(): Promise<StateStoreMod | null> {
  if (_storeCache !== null) return _storeCache === false ? null : _storeCache as StateStoreMod;
  try {
    const pkgRoot = _findPackageRoot(__dirname);
    if (pkgRoot === null) { _storeCache = false; return null; }
    const storePath = join(pkgRoot, 'scripts', 'lib', 'state', 'state-store.cjs');
    if (!existsSync(storePath)) { _storeCache = false; return null; }
    const mod = await import(pathToFileURL(storePath).href);
    _storeCache = mod as StateStoreMod;
    return _storeCache as StateStoreMod;
  } catch {
    _storeCache = false;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 57: migration-active gate.
//
// migrationActive(statePath) === true  iff:
//   1. BACKEND === 'sqlite'   (better-sqlite3 + FTS5 available, env not forcing markdown)
//   2. existsSync(join(dirname(statePath), 'state.sqlite'))
//
// The sibling check uses dirname(statePath) directly so every temp-dir test
// that creates a STATE.md WITHOUT a sibling state.sqlite is correctly NOT
// considered migrated — this is the universal default.
//
// This gate is what keeps all existing Phase-20 tests green with better-sqlite3
// present: they use temp paths with no state.sqlite sibling, so migrationActive
// returns false and the pure-markdown path runs byte-identically.
// ---------------------------------------------------------------------------

function migrationActive(statePath: string): boolean {
  const backend = _loadBackend();
  if (backend === null || backend.BACKEND !== 'sqlite') return false;
  const sqliteSibling = join(dirname(statePath), 'state.sqlite');
  if (!existsSync(sqliteSibling)) return false;
  // BUG-07: a DIRECTORY named state.sqlite would cause existsSync to return true,
  // and then every mutate() would throw when trying to open it as a database.
  // Guard: if the path is a directory, treat migration as inactive.
  try {
    if (statSync(sqliteSibling).isDirectory()) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Return the path to the sibling state.sqlite for a given STATE.md path.
 * This is always `<dirname(statePath)>/state.sqlite`.
 * Exported for use by tests and lockfile helpers.
 */
export function sqlitePathFor(statePath: string): string {
  return join(dirname(statePath), 'state.sqlite');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read STATE.md from disk and return the parsed state.
 *
 * Phase 57 dual-write: when migration is active, reads the on-disk STATE.md
 * (which the dual-write path keeps byte-equal with SQLite state), then parses
 * it. This matches the pre-Phase-57 behavior of this function and keeps the
 * returned ParsedState shape identical whether reading via SQLite or markdown.
 *
 * Shared-read: no lock is taken. Reads are snapshot-safe (atomic rename by
 * `mutate()` means we either see the old file or the new file, never a torn
 * write).
 */
export async function read(path: string): Promise<ParsedState> {
  // Phase 57: both paths parse the on-disk STATE.md (the dual-write path
  // maintains STATE.md as a byte-equal render of SQLite state). No behavioral
  // difference; the branch is here for future extension (e.g., reading directly
  // from SQLite without touching disk). The returned ParsedState is identical
  // whether migration is active or not.
  const raw: string = readFileSync(path, 'utf8');
  return parse(raw).state;
}

/**
 * Atomic read-modify-write on STATE.md.
 *
 * Phase 57 dual-write: when migration is active for this statePath, acquires
 * the SQLite sibling lock BEFORE the STATE.md lock (R9 deadlock-free
 * ordering), then after applying fn() serializes to markdown and writes
 * atomically (same .tmp+rename path). The on-disk STATE.md is always the
 * byte-equal rendered form, so SQLite stays consistent via the R8 freshness
 * guard on the next state-store operation.
 *
 * When migration is inactive, behavior is EXACTLY as pre-Phase-57:
 *   1. Acquire sibling `.lock` file (PID+timestamp advisory lock).
 *   2. Read current contents.
 *   3. Apply `fn`.
 *   4. Serialize to a `.tmp` file next to `path`.
 *   5. `renameSync(.tmp, path)` — POSIX-atomic; Windows EPERM retry once.
 *   6. Release the lock (in `finally` — released even on mid-fn throw).
 *
 * Crash between write and rename is benign: STATE.md is untouched; the
 * `.tmp` file is orphaned (cleaned up on the next acquire by the caller).
 */
export async function mutate(
  path: string,
  fn: (s: ParsedState) => ParsedState,
): Promise<ParsedState> {
  if (migrationActive(path)) {
    return _mutateSqliteActive(path, fn);
  }
  return _mutateMarkdown(path, fn);
}

/**
 * Pure markdown mutate path (pre-Phase-57 behavior, unchanged).
 * Called when migrationActive() === false.
 */
async function _mutateMarkdown(
  path: string,
  fn: (s: ParsedState) => ParsedState,
): Promise<ParsedState> {
  const release = await acquire(path);
  const tmpPath: string = `${path}.tmp`;
  try {
    const raw: string = readFileSync(path, 'utf8');
    const { state, raw_bodies, raw_frontmatter, block_gaps, line_ending } =
      parse(raw);
    const clone = structuredClone(state);
    const next = fn(clone);
    const out = serialize(next, {
      raw_frontmatter,
      raw_bodies,
      block_gaps,
      line_ending,
    });
    writeFileSync(tmpPath, out, 'utf8');
    try {
      renameSync(tmpPath, path);
    } catch (err) {
      // Windows EPERM retry — AV / indexer holding STATE.md briefly.
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code?: unknown }).code
          : undefined;
      if (code === 'EPERM' || code === 'EBUSY') {
        await new Promise((r) => setTimeout(r, 50));
        renameSync(tmpPath, path);
      } else {
        throw err;
      }
    }
    return next;
  } catch (err) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup.
    }
    throw err;
  } finally {
    await release();
  }
}

/**
 * SQLite-active mutate path (Phase 57, migrationActive() === true).
 *
 * Lock ordering per R9: acquire state.sqlite.lock BEFORE STATE.md.lock
 * (deadlock-free). Both released in finally.
 *
 * Write strategy: serialize next state to markdown, write atomically
 * (.tmp + rename). This keeps STATE.md byte-equal with the last parsed
 * state. The R8 freshness guard in state-store detects the sha-change on
 * the next state-store call and re-syncs SQLite from the markdown SoT.
 * This avoids duplicating state-store's row-level write logic here while
 * still keeping SQLite eventually consistent.
 */
async function _mutateSqliteActive(
  path: string,
  fn: (s: ParsedState) => ParsedState,
): Promise<ParsedState> {
  const sqlitePath = join(dirname(path), 'state.sqlite');
  // Acquire SQLite lock first (R9: state.sqlite.lock before STATE.md.lock).
  const releaseSqliteLock = await acquireSqliteLock(sqlitePath);
  const release = await acquire(path);
  const tmpPath: string = `${path}.tmp`;
  try {
    const raw: string = readFileSync(path, 'utf8');
    const { state, raw_bodies, raw_frontmatter, block_gaps, line_ending } =
      parse(raw);
    const clone = structuredClone(state);
    const next = fn(clone);
    const out = serialize(next, {
      raw_frontmatter,
      raw_bodies,
      block_gaps,
      line_ending,
    });
    writeFileSync(tmpPath, out, 'utf8');
    try {
      renameSync(tmpPath, path);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code?: unknown }).code
          : undefined;
      if (code === 'EPERM' || code === 'EBUSY') {
        await new Promise((r) => setTimeout(r, 50));
        renameSync(tmpPath, path);
      } else {
        throw err;
      }
    }
    return next;
  } catch (err) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup.
    }
    throw err;
  } finally {
    await release();
    await releaseSqliteLock();
  }
}

/**
 * Advance to `toStage` under the locked RMW protocol.
 *
 * Steps:
 *   1. Read current state (outside the lock) to pass to the gate.
 *   2. Resolve the gate via `gateFor(position.stage, toStage)`.
 *        - `null` → TransitionGateFailed "Invalid transition" (skip-stage,
 *          backward, same-stage, or from outside the Stage union).
 *   3. Invoke the gate. If `pass: false`, throw TransitionGateFailed with
 *      the gate's blockers verbatim.
 *   4. If `pass: true`, mutate STATE.md under the lock:
 *        - frontmatter.stage = toStage
 *        - position.stage = toStage
 *        - frontmatter.last_checkpoint = now (ISO)
 *        - timestamps[`${toStage}_started_at`] = now (ISO)
 *
 * Phase 57: the gate evaluation + stamping logic is unchanged. The
 * persistence path branches via `mutate()` which applies the
 * migration-active gate internally.
 *
 * Returns the updated state plus the gate response (for callers that
 * want to log blockers — on pass, `blockers` is always `[]`).
 */
export async function transition(
  path: string,
  toStage: Stage,
): Promise<TransitionResult> {
  // Read (outside the lock) to pass current state to the gate — the
  // mutate() below will re-read under the lock before applying changes.
  // This two-phase pattern matches the GSD reference implementation.
  const beforeMutate = await read(path);
  const from: string = beforeMutate.position.stage;
  // `position.stage` is typed as `string` in ParsedState (parser tolerates
  // `scan` and other pre-brief values). Narrow it to `Stage` before asking
  // the gate registry — anything outside the union is an invalid FROM.
  if (!isStage(from)) {
    throw new TransitionGateFailed(toStage, [
      `Invalid transition: from="${from}" is not a recognized Stage`,
    ]);
  }
  const gate = gateFor(from, toStage);
  if (gate === null) {
    throw new TransitionGateFailed(toStage, [
      `Invalid transition: ${from} → ${toStage}`,
    ]);
  }
  const gateResult = gate(beforeMutate);
  if (!gateResult.pass) {
    throw new TransitionGateFailed(toStage, gateResult.blockers);
  }
  const nowIso: string = new Date().toISOString();
  const nextState = await mutate(path, (s): ParsedState => {
    s.frontmatter.stage = toStage;
    s.frontmatter.last_checkpoint = nowIso;
    s.position.stage = toStage;
    s.timestamps[`${toStage}_started_at`] = nowIso;
    return s;
  });
  return { pass: true, blockers: gateResult.blockers, state: nextState };
}
