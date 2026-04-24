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
// Plan 20-02 wired the real transition gates in via `gateFor(from, to)`
// imported from `./gates.ts`. Plan 20-04 migrated the error classes
// (TransitionGateFailed, LockAcquisitionError, ParseError) to the
// unified `gdd-errors` taxonomy — `types.ts` re-exports them verbatim
// so consumers of `gdd-state` need no changes.

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';

import { acquire } from './lockfile.ts';
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
