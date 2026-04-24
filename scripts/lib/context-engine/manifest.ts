// scripts/lib/context-engine/manifest.ts — locked per-stage file manifest +
// ENOENT-tolerant disk reader. The MANIFEST object is the single
// source-of-truth for which `.design/*.md` files each headless stage skill
// reads; runners in Plans 21-05..08 query it indirectly via manifestFor().
//
// Frozen shape: outer Record and every inner array are Object.freeze()d so
// downstream mutation attempts fail fast in strict mode (TypeScript strict
// mode already flags them at compile time).

import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

import type { Stage } from './types.ts';

/**
 * Per-stage file manifest. Order within each tuple is significant — it is the
 * order files appear in the rendered bundle (see `renderBundle` in index.ts).
 *
 * LOCKED: do not modify without revisiting the skill prompts for every stage
 * listed below. Changes here cascade into Phase 21 runner prompts.
 */
export const MANIFEST: Readonly<Record<Stage, readonly string[]>> = Object.freeze({
  brief:   Object.freeze(['.design/STATE.md', '.design/BRIEF.md']),
  explore: Object.freeze(['.design/STATE.md', '.design/BRIEF.md', '.design/DESIGN-CONTEXT.md']),
  plan:    Object.freeze([
    '.design/STATE.md',
    '.design/DESIGN-PLAN.md',
    '.design/DESIGN-CONTEXT.md',
    '.design/RESEARCH.md',
  ]),
  design:  Object.freeze(['.design/STATE.md', '.design/DESIGN-PLAN.md']),
  verify:  Object.freeze(['.design/STATE.md', '.design/DESIGN-PLAN.md', '.design/SUMMARY.md']),
  init:    Object.freeze(['.design/STATE.md']),
});

/**
 * Return the locked manifest entries for a stage. Returned array is
 * Object.freeze()d — callers must not mutate.
 */
export function manifestFor(stage: Stage): readonly string[] {
  const entries = MANIFEST[stage];
  // Defensive: MANIFEST is typed as Readonly<Record<Stage, ...>> but a caller
  // passing a value that has been cast to Stage at runtime could land here
  // with an unknown key. Return empty array rather than undefined to keep the
  // caller's control flow simple (they iterate and get zero files).
  return entries ?? Object.freeze([]);
}

/**
 * Read one file from disk. Returns `{ present, raw, raw_bytes }`. Never
 * throws on `ENOENT` — returns `{ present: false, raw: '', raw_bytes: 0 }`.
 * Other IO errors (EACCES, EIO, EISDIR, …) propagate to the caller because
 * those are configuration bugs, not missing-file conditions.
 */
export function readFileRaw(absPath: string): { present: boolean; raw: string; raw_bytes: number } {
  try {
    const raw = readFileSync(absPath, 'utf8');
    return { present: true, raw, raw_bytes: Buffer.byteLength(raw, 'utf8') };
  } catch (err) {
    // Node fs errors carry a `.code` string. Only swallow the missing-file
    // family; everything else is re-thrown so the caller (or strict mode in
    // buildContextBundle) surfaces the real problem.
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === 'ENOENT') {
      return { present: false, raw: '', raw_bytes: 0 };
    }
    throw err;
  }
}
