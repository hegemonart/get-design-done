// scripts/lib/pipeline-runner/state-machine.ts — Plan 21-05 Task 2.
//
// Stage-ordering primitives. Pure — no I/O, no logging, no side effects.
// Consumed by `index.ts` (to compute the run order) and `stage-handlers.ts`
// indirectly via `nextStage()` for future lookahead hooks.
//
// Rules locked by Plan 21-05:
//   * STAGE_ORDER is frozen — mutation attempts throw in strict mode.
//   * `resolveStageOrder` must preserve STAGE_ORDER's relative ordering.
//     Out-of-order user input (e.g., `stages: ['verify', 'brief']`) throws
//     a `ValidationError` with code `INVALID_STAGE_ORDER`.
//   * `resumeFrom` drops stages strictly before it (keeps self + after).
//   * `stopAfter` drops stages strictly after it (keeps self + before).
//   * `skipStages` is applied last, filtering any remaining stage whose
//     name is in the set. Unknown stage names in `skipStages` are
//     tolerated (no-op) — the filter is a membership check.

import { ValidationError } from '../gdd-errors/index.ts';
import type { Stage } from './types.ts';

/**
 * Canonical pipeline order. Frozen so downstream consumers cannot
 * mutate it by accident. Every other ordering primitive derives from
 * this array.
 */
export const STAGE_ORDER: readonly Stage[] = Object.freeze([
  'brief',
  'explore',
  'plan',
  'design',
  'verify',
] as const);

/**
 * Return the zero-based index of `stage` in `STAGE_ORDER`. Throws
 * `ValidationError` for unknown stages — callers should have already
 * narrowed the input to the `Stage` union, but runtime checks defend
 * against `as` casts.
 */
export function stageIndex(stage: Stage): number {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0) {
    throw new ValidationError(
      `unknown stage: ${String(stage)}`,
      'INVALID_STAGE',
      { stage, knownStages: [...STAGE_ORDER] },
    );
  }
  return idx;
}

/**
 * Return the stage that follows `current` in canonical order, or
 * `null` when `current` is the terminal stage (`verify`).
 */
export function nextStage(current: Stage): Stage | null {
  const idx = stageIndex(current);
  if (idx === STAGE_ORDER.length - 1) return null;
  const next = STAGE_ORDER[idx + 1];
  // noUncheckedIndexedAccess narrows to `Stage | undefined`; we just
  // proved it's defined because idx + 1 < length.
  if (next === undefined) return null;
  return next;
}

/**
 * Configuration subset relevant to stage-order resolution.
 */
export interface ResolveStageOrderInput {
  readonly stages?: readonly Stage[];
  readonly skipStages?: readonly Stage[];
  readonly resumeFrom?: Stage;
  readonly stopAfter?: Stage;
}

/**
 * Resolve the effective run order for a pipeline invocation, applying
 * (in order) `stages` selection → `resumeFrom` → `stopAfter` →
 * `skipStages`.
 *
 * Validates that the user-supplied `stages` array preserves the
 * canonical relative ordering — out-of-order input throws a
 * `ValidationError`.
 *
 * Validates that `resumeFrom` and `stopAfter` are mutually consistent
 * when both are supplied (`resumeFrom` cannot be later than
 * `stopAfter`).
 *
 * Returns a frozen, read-only array.
 */
export function resolveStageOrder(input: ResolveStageOrderInput = {}): readonly Stage[] {
  // 1. Pick the initial set of stages.
  const initial: readonly Stage[] = input.stages ?? STAGE_ORDER;

  // 2. Validate relative order against STAGE_ORDER.
  let lastIdx = -1;
  for (const s of initial) {
    const idx = stageIndex(s);
    if (idx <= lastIdx) {
      throw new ValidationError(
        `stages array out of canonical order near "${s}"; expected ascending ${STAGE_ORDER.join(' → ')}`,
        'INVALID_STAGE_ORDER',
        { stages: [...initial], canonical: [...STAGE_ORDER] },
      );
    }
    lastIdx = idx;
  }

  // 3. Validate resumeFrom / stopAfter consistency.
  if (input.resumeFrom !== undefined && input.stopAfter !== undefined) {
    const rIdx = stageIndex(input.resumeFrom);
    const sIdx = stageIndex(input.stopAfter);
    if (rIdx > sIdx) {
      throw new ValidationError(
        `resumeFrom="${input.resumeFrom}" is later than stopAfter="${input.stopAfter}"`,
        'INVALID_STAGE_WINDOW',
        { resumeFrom: input.resumeFrom, stopAfter: input.stopAfter },
      );
    }
  }

  // 4. Apply resumeFrom — drop stages strictly before it.
  let working: Stage[] = [...initial];
  if (input.resumeFrom !== undefined) {
    const resume = input.resumeFrom;
    const resumeIdx = stageIndex(resume);
    working = working.filter((s) => stageIndex(s) >= resumeIdx);
  }

  // 5. Apply stopAfter — drop stages strictly after it.
  if (input.stopAfter !== undefined) {
    const stop = input.stopAfter;
    const stopIdx = stageIndex(stop);
    working = working.filter((s) => stageIndex(s) <= stopIdx);
  }

  // 6. Apply skipStages — membership filter.
  if (input.skipStages !== undefined && input.skipStages.length > 0) {
    const skip = new Set<string>(input.skipStages);
    working = working.filter((s) => !skip.has(s));
  }

  return Object.freeze(working);
}
