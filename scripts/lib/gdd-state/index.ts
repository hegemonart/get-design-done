// scripts/lib/gdd-state/index.ts — public API for the gdd-state module.
//
// This is the ONLY file consumers should import from. The module exposes
// exactly five surface-level names:
//   * read(path)                    — parse STATE.md from disk
//   * mutate(path, fn)              — atomic read-modify-write under a lock
//   * transition(path, toStage)     — gate + stage-advance helper
//   * ParsedState (type)            — consumer-visible shape
//   * Stage (type)                  — stage enum
//
// Plan 20-02 wires the gate function in; for now `transition()` calls a
// stub that always returns `{ pass: true, blockers: [] }`. Plan 20-04
// will migrate the locally-defined error classes (TransitionGateFailed,
// LockAcquisitionError, ParseError) into the unified GDDError taxonomy.

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';

import { acquire } from './lockfile.ts';
import { parse } from './parser.ts';
import { serialize } from './mutator.ts';
import {
  TransitionGateFailed,
  type ParsedState,
  type Stage,
  type TransitionResult,
} from './types.ts';

export type { ParsedState, Stage } from './types.ts';
export { TransitionGateFailed, LockAcquisitionError, ParseError } from './types.ts';

/**
 * Read STATE.md from disk and return the parsed state.
 *
 * Shared-read: no lock is taken. Reads are snapshot-safe for markdown
 * (the OS guarantees a coherent view even if a writer is mid-rename —
 * we either see the old file or the new file, never a torn write,
 * because `mutate()` uses atomic rename).
 */
export async function read(path: string): Promise<ParsedState> {
  const raw: string = readFileSync(path, 'utf8');
  return parse(raw).state;
}

/**
 * Atomic read-modify-write on STATE.md.
 *
 * Flow:
 *   1. Acquire sibling `.lock` file (PID+timestamp advisory lock).
 *   2. Read current contents.
 *   3. Apply `fn`.
 *   4. Serialize to a `.tmp` file next to `path`.
 *   5. `renameSync(.tmp, path)` — POSIX-atomic; on Windows EPERM means
 *      a scanner held it briefly, retry once.
 *   6. Release the lock (in `finally` — released even on mid-fn throw).
 *
 * Crash between write and rename is benign: STATE.md is untouched; the
 * `.tmp` file is orphaned (cleaned up on the next acquire by the caller).
 */
export async function mutate(
  path: string,
  fn: (s: ParsedState) => ParsedState,
): Promise<ParsedState> {
  const release = await acquire(path);
  const tmpPath: string = `${path}.tmp`;
  try {
    const raw: string = readFileSync(path, 'utf8');
    const { state, raw_bodies, raw_frontmatter, block_gaps, line_ending } =
      parse(raw);
    // Deep-clone so the consumer's fn cannot mutate the state we just
    // parsed (defensive — apply() does this too for pure callers).
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
    // Clean up the orphaned tmp file on failure so we don't pollute.
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // best-effort; a leftover tmp file does not corrupt STATE.md.
    }
    throw err;
  } finally {
    await release();
  }
}

/**
 * Advance to `toStage` under the locked RMW protocol.
 *
 * Steps:
 *   1. Call the transition gate (stub until Plan 20-02).
 *   2. If `pass: false` — throw TransitionGateFailed with blockers.
 *   3. If `pass: true` — mutate STATE.md:
 *        - frontmatter.stage = toStage
 *        - position.stage = toStage
 *        - frontmatter.last_checkpoint = now (ISO)
 *        - timestamps[`${toStage}_started_at`] = now (ISO)
 *
 * Returns the updated state plus the gate response (for callers that
 * want to log blockers even on pass).
 */
export async function transition(
  path: string,
  toStage: Stage,
): Promise<TransitionResult> {
  // Read (outside the lock) to pass current state to the gate — the
  // mutate() below will re-read under the lock before applying changes.
  // This two-phase pattern matches the GSD reference implementation.
  const beforeMutate = await read(path);
  const gate = await runGate(beforeMutate, toStage);
  if (!gate.pass) {
    throw new TransitionGateFailed(toStage, gate.blockers);
  }
  const nowIso: string = new Date().toISOString();
  const nextState = await mutate(path, (s): ParsedState => {
    s.frontmatter.stage = toStage;
    s.frontmatter.last_checkpoint = nowIso;
    s.position.stage = toStage;
    s.timestamps[`${toStage}_started_at`] = nowIso;
    return s;
  });
  return { pass: true, blockers: gate.blockers, state: nextState };
}

/**
 * Stub gate for Plan 20-01. Plan 20-02 replaces this with the real
 * set of gate rules. The shape is the stable contract — do not alter it
 * without also updating transition().
 */
async function runGate(
  _state: ParsedState,
  _toStage: Stage,
): Promise<{ pass: boolean; blockers: string[] }> {
  return { pass: true, blockers: [] };
}
