// scripts/lib/gdd-state/gates.ts — pure transition-gate functions.
//
// Plan 20-02 (SDK-03): the typed, single-source-of-truth implementation
// of "can this pipeline advance?" that replaces prose-encoded guards in
// each stage's SKILL.md. Each gate is a pure function of a `ParsedState`
// and returns `{ pass, blockers }` — never throws, never does I/O, never
// reads the clock or random state. Deterministic for a given input.
//
// Gate semantics (distilled from the current SKILL.md guards):
//
//   briefToExplore
//     Stage-parity check: `frontmatter.stage === 'brief'` AND
//     `position.stage === 'brief'`. No file-existence checks — gates are
//     pure; `.design/BRIEF.md` presence is verified by the caller.
//
//   exploreToPlan
//     Stage-parity on 'explore'. Additionally `connections` map MUST
//     have at least one entry with status `available` OR `not_configured`
//     (i.e., the probe ran and populated the map). An empty connections
//     map means the probe never ran — fail with an actionable blocker.
//
//   planToDesign
//     Stage-parity on 'plan'. `must_haves` MUST be non-empty (at minimum
//     M-01 exists). `decisions` MUST contain ≥1 `locked` entry. Any
//     `must_haves` entry with `status: fail` MUST have a matching
//     `decisions` entry to reconcile it — otherwise fail with
//     "M-XX marked fail without a decision to reconcile".
//
//   designToVerify
//     Stage-parity on 'design'. `must_haves` MUST NOT contain any entry
//     with `status: pending` whose text references a design-stage
//     deliverable (keywords: `component`, `token`, `style`, `copy`,
//     `layout`). Pending entries outside that vocabulary are verify-stage
//     responsibilities and are allowed through.
//
// Invalid transitions (e.g., brief→verify skipping explore/plan/design,
// or verify→verify no-op, or anything not in the forward chain) return
// `null` from `gateFor()`. The caller turns `null` into a
// `TransitionGateFailed` with an "Invalid transition" message.

import type { ParsedState, Stage } from './types.ts';

/**
 * Result of a single gate invocation.
 *
 * When `pass === true`, `blockers` is `[]`. When `pass === false`,
 * `blockers` has ≥1 entry and each entry is a non-empty, human-readable
 * one-line reason suitable for surfacing to operators.
 */
export interface GateResult {
  pass: boolean;
  blockers: string[];
}

/** Signature every gate satisfies. Pure — no I/O, no clock, no randomness. */
export type GateFn = (state: ParsedState) => GateResult;

/**
 * Keywords whose presence in a pending `must_haves` line marks the item
 * as a design-stage deliverable (must be resolved BEFORE verify). Kept
 * lowercase-matched on the full text so phrasing like "Primary CTA
 * component" or "color token" both hit.
 *
 * Adjust in lockstep with the designToVerify prose-guard removal in
 * Plans 20-07 through 20-11 — the keyword set there must match this one.
 */
const DESIGN_KEYWORDS = ['component', 'token', 'style', 'copy', 'layout'] as const;

/**
 * Shared parity helper — every gate requires the frontmatter + position
 * stages to agree with the expected FROM stage. Returns `null` on pass
 * (so the caller can keep going) or a blocker string on fail.
 */
function stageParity(state: ParsedState, expected: Stage): string | null {
  if (!state.position || typeof state.position.stage !== 'string') {
    return 'position block missing or malformed';
  }
  if (!state.frontmatter || typeof state.frontmatter.stage !== 'string') {
    return 'frontmatter stage missing or malformed';
  }
  if (state.position.stage !== expected) {
    return `position.stage is "${state.position.stage}" — expected "${expected}"`;
  }
  if (state.frontmatter.stage !== expected) {
    return `frontmatter.stage is "${state.frontmatter.stage}" — expected "${expected}"`;
  }
  return null;
}

/**
 * Brief → Explore: only a stage-parity check.
 *
 * `.design/BRIEF.md` existence is verified by the calling skill — gates
 * are pure and cannot touch the filesystem.
 */
export const briefToExplore: GateFn = (s) => {
  const blockers: string[] = [];
  const parity = stageParity(s, 'brief');
  if (parity) blockers.push(parity);
  return { pass: blockers.length === 0, blockers };
};

/**
 * Explore → Plan: stage parity + non-empty connections map.
 *
 * An empty `<connections>` map (no keys at all) means the explore-stage
 * probe never ran. We require at least one entry so we can assert the
 * probe wrote something — the value can be `available` or
 * `not_configured`; both are evidence of a real probe result.
 * `unavailable` alone also counts (probe ran, service down).
 */
export const exploreToPlan: GateFn = (s) => {
  const blockers: string[] = [];
  const parity = stageParity(s, 'explore');
  if (parity) blockers.push(parity);
  const connKeys = Object.keys(s.connections ?? {});
  if (connKeys.length === 0) {
    blockers.push(
      'connections map is empty — run the explore-stage probe before advancing',
    );
  }
  return { pass: blockers.length === 0, blockers };
};

/**
 * Plan → Design: stage parity + must_haves non-empty + ≥1 locked
 * decision + every `status: fail` must_have is reconciled by a matching
 * decision ID.
 *
 * Matching rule for reconciliation: a `must_haves` entry `M-XX` with
 * `status: fail` is considered reconciled when ANY `decisions` entry's
 * `text` mentions the substring `M-XX`. This is the convention used in
 * the current SKILL.md prose ("D-03 reconciles M-05 by …"); it is not
 * a structural link yet — Plan 20-08 may promote it to a typed field.
 */
export const planToDesign: GateFn = (s) => {
  const blockers: string[] = [];
  const parity = stageParity(s, 'plan');
  if (parity) blockers.push(parity);
  if ((s.must_haves ?? []).length === 0) {
    blockers.push('must_haves is empty — discover stage must land at least M-01');
  }
  const hasLocked = (s.decisions ?? []).some((d) => d.status === 'locked');
  if (!hasLocked) {
    blockers.push('no locked decision in <decisions> — at least one must be locked');
  }
  const failing = (s.must_haves ?? []).filter((m) => m.status === 'fail');
  for (const mh of failing) {
    const reconciled = (s.decisions ?? []).some((d) => d.text.includes(mh.id));
    if (!reconciled) {
      blockers.push(`${mh.id} marked fail without a decision to reconcile`);
    }
  }
  return { pass: blockers.length === 0, blockers };
};

/**
 * Design → Verify: stage parity + no pending must_haves whose text
 * references a design-stage deliverable.
 *
 * Pending items outside the design-keyword set are verify-stage
 * responsibilities (e.g., "ARIA live region announcement") and are
 * allowed through.
 */
export const designToVerify: GateFn = (s) => {
  const blockers: string[] = [];
  const parity = stageParity(s, 'design');
  if (parity) blockers.push(parity);
  const pending = (s.must_haves ?? []).filter((m) => m.status === 'pending');
  for (const mh of pending) {
    const lower = mh.text.toLowerCase();
    const hit = DESIGN_KEYWORDS.find((kw) => lower.includes(kw));
    if (hit) {
      blockers.push(
        `${mh.id} is pending and mentions "${hit}" — resolve in design before verify`,
      );
    }
  }
  return { pass: blockers.length === 0, blockers };
};

/**
 * Registry of every gate keyed by `${from}To${Capitalize<to>}`. Frozen
 * so downstream callers cannot mutate the gate set at runtime.
 */
export const GATES: Readonly<{
  briefToExplore: GateFn;
  exploreToPlan: GateFn;
  planToDesign: GateFn;
  designToVerify: GateFn;
}> = Object.freeze({
  briefToExplore,
  exploreToPlan,
  planToDesign,
  designToVerify,
});

/**
 * Pick the gate for a source → target transition.
 *
 * Returns `null` for:
 *   - skip-stage transitions (e.g., `brief → verify`),
 *   - backward transitions (e.g., `explore → brief`),
 *   - same-stage transitions (e.g., `verify → verify`),
 *   - any transition whose `from` or `to` is outside the `Stage` union.
 *
 * The caller (`transition()` in `index.ts`) converts a `null` response
 * into a `TransitionGateFailed` carrying an "Invalid transition" message.
 */
export function gateFor(from: Stage, to: Stage): GateFn | null {
  if (from === 'brief' && to === 'explore') return briefToExplore;
  if (from === 'explore' && to === 'plan') return exploreToPlan;
  if (from === 'plan' && to === 'design') return planToDesign;
  if (from === 'design' && to === 'verify') return designToVerify;
  return null;
}
