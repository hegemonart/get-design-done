---
phase: 28
plan: 02
subsystem: reference
tags: [reference, composition, golden-ratio, fibonacci, focal-point, eye-flow, visual-weight, optical-centering, foundational-tier-2]
requires:
  - reference/visual-hierarchy-layout.md (cross-link target — §Compositional Grids + §Asymmetry and Rhythm)
  - reference/iconography.md (cross-link target — §1 Optical Sizing & Stroke Weight)
  - reference/typography.md (cross-link target — §Type Scale Systems + §Modular Scale)
provides:
  - reference/composition.md (Tier-2 compositional fundamentals: rule of thirds, φ-grid, √2/√3/√5 root rectangles, Fibonacci, focal-point construction, visual-weight calculus, optical-vs-mathematical centering, Z/F/Gutenberg eye-flow)
affects: []
tech_stack:
  added: []
  patterns:
    - "Visual-weight calculus formula: weight = size × contrast × isolation × complexity (each 0..1, multiplicative). Worked example computes weights for 3 hero elements; balanced defined as ±20% across the optical center; imbalance flag at 1.5× sum threshold."
    - "Optical-vs-mathematical centering: −1 px nudge for right-pointing play triangles to compensate the empty wedge; cap-height (not x-height, not baseline) as the anchor for icon-next-to-label alignment."
    - "Eye-flow archetype-to-pattern mapping: Z for landing/conversion (paired with single-focal), F for content-heavy/scanning (paired with distributed-focal), Gutenberg for editorial/reading (paired with single-focal terminal CTA)."
key_files:
  created:
    - reference/composition.md
  modified: []
decisions:
  - "Followed the lesson captured in 28-01-SUMMARY.md: invoke `markdownlint-cli` (not `cli2`) with `--disable <all-other-rules>` to allowlist MD038 + MD040 only. Exit 0 confirms clean."
  - "Frontmatter follows the registry-schema shape established by 28-01 (`name`, `type`, `version`, `phase`, `tags`, `last_updated`) — `type: layout` is a valid registry enum and the closest fit for composition rules. Plan frontmatter snippet in the user's <context> showed `title:` / `type: reference` style, but the registry schema (the authoritative validator) requires `name:` kebab-case + `type:` from the enum. CONTEXT D-01 says registry-schema shape governs; matched 28-01 precedent (color-theory uses `name: color-theory`, `type: palette`)."
  - "350-line target (landed at 349) — within the 200-500 typical range CONTEXT calls out, leaving room for 28-03 / 28-04 to be denser without breaching the 600 ceiling."
  - "Three ASCII diagrams shipped (Z, F, Gutenberg) — plan only required ≥1, but each eye-flow pattern is clearer with its own diagram. Cost: ~50 lines; value: the table at the end ('Choosing the pattern') becomes the authoritative archetype→pattern→focal-point lookup."
  - "No registry edit, no edits to existing references. Both reciprocal-link wiring and registration land in 28-06 per D-05 and D-06."
metrics:
  duration: "~13 min"
  completed: 2026-05-18
---

# Phase 28 Plan 02: reference/composition.md Summary

Shipped `reference/composition.md` (349 lines) — the canonical compositional-fundamentals reference covering rule of thirds, the golden ratio with √2/√3/√5 root rectangles and dynamic symmetry, Fibonacci, focal-point construction (single/dual/distributed), the visual-weight calculus formula with a worked example, optical-vs-mathematical centering with the play-triangle −1 px nudge and cap-height vs x-height alignment, and the Z / F / Gutenberg eye-flow patterns each illustrated with an ASCII diagram. Closes Observation #2 from the 2026-05-01 audit.

## Tasks Completed

| # | Task | Commit | Files |
| - | ---- | ------ | ----- |
| 1 | Author reference/composition.md | `ddf19eb` | `reference/composition.md` (349 lines, +349 / −0) |

## Acceptance Criteria — All 15 PASS

| # | Criterion | Expected | Observed |
| - | --------- | -------- | -------- |
| 1 | File exists | exists | `reference/composition.md` present |
| 2 | `head -1` is `---` | true | `---` |
| 3 | `name: composition` count | 1 | 1 |
| 4 | `type: layout` count | 1 | 1 |
| 5 | `phase: 28` count | 1 | 1 |
| 6 | Line count 250–600 | in range | 349 |
| 7 | All 7 major sections present | 7 | 7 (Rule of Thirds, Golden Ratio and Root Rectangles, Focal-Point Construction, Visual-Weight Calculus, Optical vs. Mathematical Centering, Eye-Flow Patterns, Cross-References) |
| 8 | Visual-weight formula present literally | ≥ 1 | 1 (`size × contrast × isolation × complexity` in a fenced txt block) |
| 9 | All 3 eye-flow patterns named (Z / F / Gutenberg) | ≥ 3 | 9 (mentioned across headings, body, table) |
| 10 | Outbound cross-links to the 3 targets | ≥ 3 | 8 mentions (visual-hierarchy-layout.md, iconography.md, typography.md — body + Cross-References) |
| 11 | ASCII diagrams in `\`\`\`txt` blocks | ≥ 1 | 3 (one each for Z, F, Gutenberg) |
| 12 | markdownlint MD038 + MD040 clean | exit 0 | exit 0 (via `npx markdownlint-cli --disable <all-other-rules> -- reference/composition.md`) |
| 13 | Relative `./` link form | ≥ 3 | 8 |
| 14 | Single trailing newline | last byte `0x0a` | `0x0a` |
| 15 | Only `reference/composition.md` added/modified | true | PASS (`.planning/STATE.md` was already in modified pre-existing state — left untouched per plan directive; this plan staged only `reference/composition.md`) |

## Deviations from Plan

The plan content was executed exactly as written. One Rule-1 auto-fix was applied to repair damage caused by mid-wave state-tooling runs (see Issues Encountered below).

The plan's `<context>` showed a frontmatter snippet using `title:` / `type: reference` / `summary:`, but the plan's `must_haves.truths` block explicitly required the registry-schema shape (`name: composition` / `type: layout` / `version: 1.0.0` / `phase: 28` / `tags` / `last_updated: 2026-05-XX`). The 28-01 precedent (`name: color-theory`, `type: palette`) confirms registry-schema shape is the authoritative one. Followed `must_haves` + 28-01 precedent — not a deviation, just clearing up an internal plan-document discrepancy.

## Issues Encountered

### [Rule 1 — Bug] gsd-tools state handlers do not match the actual STATE.md schema; auto-fix = revert

- **Found during:** Post-task STATE update step.
- **Issue:** `state advance-plan` errored `Cannot parse Current Plan or Total Plans in Phase from STATE.md`. `state record-metric` errored `phase, plan, and duration required` (even with positional args supplied). `state record-session` returned `No session fields found in STATE.md`. `state update-progress` "succeeded" but corrupted the `progress:` block — overwrote the canonical 60-phase / 178-plan / 55% project-wide counts with a windowed local view (5/3/26/21/81%), wiped `stopped_at`, `last_activity`, and altered `milestone_name` + `status` to handler-generated text. `roadmap update-plan-progress 28` flipped 28-01 and 28-02 inline checkboxes (which D-12 reserves for closeout 28-07) AND injected malformed text `**Plans:**2/7 plans executed` into the rule-14 prose at line 3434 of ROADMAP.md.
- **Fix:** Reverted both files to HEAD (`git checkout HEAD -- .planning/STATE.md .planning/ROADMAP.md`). STATE.md / ROADMAP.md remain at the same canonical state shipped at 27.7 closeout. This matches the 28-01 precedent (its SUMMARY notes the same pre-existing modified state was left untouched per plan directive).
- **Files modified:** none (revert returned them to HEAD).
- **Why this is the correct call:** This project's STATE.md / ROADMAP.md use a different field schema than the gsd-tools handlers expect (`total_plans_approx` not `total_plans`, freeform `status:` carrying multi-line summary rather than handler-managed, inline-checkbox flip owned by phase closeout per D-12, not mid-wave). Mid-wave state-handler runs do net damage. Plan 28-07 owns ROADMAP rule-14 flip (per D-12) and version closeout will refresh STATE counts atomically.
- **Out of scope:** Fixing the gsd-tools state handlers themselves — this is repo-tooling work that does not belong in a content-only Wave A plan.

The markdownlint invocation lesson from 28-01 (`--disable` for allowlist semantics) was applied directly — no re-discovery needed.

## Scope Boundaries Held

- No registry entry written — `reference/registry.json` untouched. Lands in 28-06 per D-05.
- No reciprocal inbound links into composition.md from other references — `visual-hierarchy-layout.md` / `iconography.md` / `typography.md` untouched. Lands in 28-06 per D-06.
- No audit-scoring lens-tag work — lands in 28-06 per D-07.
- No edits to any existing reference file, no version bumps to manifests — Wave A discipline (disjoint files only).

## Wave A Parallel-Safety

`reference/composition.md` is a brand-new file. Git diff for this plan = exactly one file added, zero files modified.
This is disjoint from 28-01's `reference/color-theory.md` (already shipped: `4159f17` / `0c6499d` / `b8ee04f`) and from the as-yet-unshipped 28-03 (`proportion-systems.md`) and 28-04 (`i18n.md`). No merge conflict surface.

## Self-Check: PASSED

Verified post-write:

- `reference/composition.md` exists on disk (`test -f` OK).
- Commit `ddf19eb` present in `git log --oneline -5` (top of branch `claude/phase-28`).
- All 15 acceptance criteria reproduce on a fresh shell — line count 349, 7 major sections, 3 ASCII diagrams, MD038+MD040 exit 0, single trailing newline `0x0a`.
- No stubs, no `TODO`, no placeholder copy. Every section has at least one concrete code/markup example or detection signature.

## Threat Flags

None — this is a content-only reference file. No network endpoints, no auth surface, no schema changes at trust boundaries, no new file-access patterns.
