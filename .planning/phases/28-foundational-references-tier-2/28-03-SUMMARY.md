---
phase: 28
plan: 03
subsystem: reference
tags: [reference, proportion, spacing, baseline-grid, vertical-rhythm, modular-scale, radius-scale, sizing-scale, foundational-tier-2]
requires:
  - reference/typography.md (cross-link target — §Type Scale Systems is the canonical modular slice this file extends)
  - reference/design-system-guidance.md (cross-link target — current 8pt-grid mention this file formalizes)
  - reference/style-vocabulary.md (cross-link target — "8pt spacing grid" / √2 style-row vocabulary surfaces)
provides:
  - reference/proportion-systems.md (Tier-2 whole-UI proportion reference: 4pt/8pt/√2 baseline grids with decision rule, baseline-grid lock mechanism, vertical-rhythm CSS pattern, 20-row cross-system pairing matrix, radius-scale 0.25×height rule, sizing-scale derivation from spacing tokens)
affects: []
tech_stack:
  added: []
  patterns:
    - "Three baseline-grid systems contrasted with explicit decision rule: 4pt for dense data UI (justified by row-density constraint), 8pt for product UI default (Material / iOS HIG convergence), √2 for editorial / print-adjacent (forward link to composition.md §Root Rectangles for the underlying geometry)."
    - "Cross-system pairing matrix (20 rows × 5 columns: System / Token / Value / Grid relationship / Cross-system pairing) — explicit numerical equalities across type, space, radius, size that an agent can grep when choosing a value (e.g., `text-base` 16px ≡ `space-2` ≡ `icon-sm`; body line-height 24px ≡ `space-3` ≡ `icon-md`)."
    - "Radius-as-proportion rule: `radius-md ≈ 0.25 × component height` with two named exceptions (`radius-full: 9999px` for pill, `radius-none: 0` for square data-table cells). Worked CSS example computes 8px radius for 32px chip, 10px radius for 40px button."
    - "Sizing-scale-derivation rule: a new sizing token MUST reuse an existing `--space-N` token, never introduce a new pixel literal. CSS example shows `--icon-md: var(--space-3)`, `--avatar-md: var(--space-6)`, `--button-md: var(--space-5)`."
    - "Baseline-grid lock + vertical-rhythm framing: every line-height set as `calc(var(--grid-unit) * N)` so block-level elements stack on the grid by construction; explicit named exceptions for display-scale optical line-height and single-line callouts (no ad-hoc overrides)."
key_files:
  created:
    - reference/proportion-systems.md
  modified: []
decisions:
  - "Followed the 28-01 markdownlint invocation lesson directly — `npx markdownlint-cli --disable <enumerated-rule-list> -- reference/proportion-systems.md` (allowlist semantics). Exit 0 confirms MD038 + MD040 clean. No re-discovery needed."
  - "Frontmatter mirrors the registry-schema shape established by 28-01 / 28-02 (`name: proportion-systems`, `type: layout`, `version: 1.0.0`, `phase: 28`, `tags`, `last_updated: 2026-05-18`). Plan body `must_haves` and AC #3-5 explicitly require this shape; the user-context message's `title:` / `type: reference` / `summary:` snippet is the older paraphrased shape and is overridden by AC and 28-01/02 precedent. CONTEXT D-01 says registry-schema shape governs."
  - "267-line landing — comfortably inside the plan's 250-450 typical range, denser than 28-02 (349) and matching 28-01's information-density profile. The proportion subject is more table-driven and less diagram-driven than composition, so prose-to-table ratio shifted accordingly: one 20-row matrix carries the cross-system relationship work that would otherwise need three or four ASCII diagrams."
  - "Seven CSS code blocks shipped (one per baseline grid, plus baseline-grid lock, vertical rhythm, radius scale, sizing derivation) — plan required ≥4. The extra examples buy concreteness for the 4pt-vs-8pt-vs-√2 contrast that is the file's load-bearing pedagogy."
  - "20-row pairing matrix exceeds the plan's required `≥3` table rows by an order of magnitude. The plan's intent is the matrix as the asset that closes Observation #3 — one row per token across the four sub-systems is the minimum that demonstrates the relationships, not the maximum. Truncating to 3 rows would defeat the cross-system view this file exists to provide."
  - "Forward link to `./composition.md` §Root Rectangles — √2, √3, √5 (line 91 of composition.md) added under §Baseline Grid Systems §√2 Grid and again in §Cross-References. Plan calls for 3 outbound links to design-system-guidance / typography / style-vocabulary; the composition.md forward note is an additional Rule-2-style cross-link (correctness: an agent reading the √2 section will want the underlying geometry, and composition.md is the canonical home for it)."
  - "No registry edit, no edits to existing references. Both reciprocal-link wiring and registration land in 28-06 per D-05 and D-06 — same scope discipline as 28-01 and 28-02."
  - "Did NOT touch STATE.md or ROADMAP.md, and did NOT call any `gsd-tools state` subcommand. Honored the 28-02 lesson directly: those handlers do net damage to this project's STATE shape, and ROADMAP rule-14 flip is reserved for 28-07 closeout per D-12."
metrics:
  duration: "~10 min"
  completed: 2026-05-18
---

# Phase 28 Plan 03: reference/proportion-systems.md Summary

Shipped `reference/proportion-systems.md` (267 lines) — the canonical whole-UI proportion reference covering 4pt / 8pt / √2 baseline grids with decision rule, baseline-grid lock as a mechanism, vertical rhythm as its lived consequence, a 20-row cross-system pairing matrix unifying type + spacing + radius + sizing on the same grid, the `radius-md ≈ 0.25 × component height` rule with named pill / square exceptions, and the sizing-scale-must-derive-from-spacing rule. Closes Observation #3 from the 2026-05-01 audit: the jump from "we use a modular type scale" to "we use a coherent proportion system across the whole UI".

## Tasks Completed

| # | Task | Commit | Files |
| - | ---- | ------ | ----- |
| 1 | Author reference/proportion-systems.md | `a64724a` | `reference/proportion-systems.md` (267 lines, +267 / −0) |

## Acceptance Criteria — All 15 PASS

| # | Criterion | Expected | Observed |
| - | --------- | -------- | -------- |
| 1 | File exists | exists | `reference/proportion-systems.md` present |
| 2 | `head -1` is `---` | true | `---` |
| 3 | `name: proportion-systems` count | 1 | 1 |
| 4 | `type: layout` count | 1 | 1 |
| 5 | `phase: 28` count | 1 | 1 |
| 6 | Line count 250–500 | in range | 267 |
| 7 | All 7 major sections present | 7 | 7 (Baseline Grid Systems, Baseline-Grid Lock, Vertical Rhythm, Modular Relationships, Radius Scale as Proportion, Sizing Scale Derivation, Cross-References) |
| 8 | All 3 baseline-grid subsections (4pt / 8pt / √2) | 3 | 3 |
| 9 | Markdown table rows `^\| ` | ≥ 3 | 22 (one 20-row cross-system pairing matrix + header + separator) |
| 10 | Outbound cross-links to the 3 targets | ≥ 3 | 5 mentions (design-system-guidance.md, typography.md, style-vocabulary.md across body + §Cross-References) |
| 11 | CSS fenced blocks `^```css$` | ≥ 4 | 7 (one per baseline grid, plus lock, rhythm, radius, sizing) |
| 12 | markdownlint MD038 + MD040 clean | exit 0 | exit 0 (via `npx markdownlint-cli --disable <all-other-rules> -- reference/proportion-systems.md`) |
| 13 | Relative `./` link form | ≥ 3 | 6 |
| 14 | Single trailing newline | last byte `0x0a` | `0x0a` |
| 15 | Only `reference/proportion-systems.md` added/modified | true | PASS (`git status --short` shows only `reference/proportion-systems.md` before commit; commit diff = 1 file added) |

## Deviations from Plan

The plan content was executed exactly as written. One internal-discrepancy clarification and one Rule-2 additive cross-link are noted below — neither is a substantive deviation.

### [Clarification] Frontmatter shape — plan body wins over user-context snippet

The plan's `<context>` block (passed in the orchestrator's invocation) showed a different frontmatter snippet (`title: Proportion Systems`, `type: reference`, `summary:`, `last_updated: 2026-05-18`) than the plan's `must_haves.truths` block (`name: proportion-systems`, `type: layout`, `version: 1.0.0`, `phase: 28`, `tags`, `last_updated: 2026-05-XX`). Acceptance criteria #3-5 grep for the latter shape verbatim (`^name: proportion-systems$`, `^type: layout$`, `^phase: 28$`). The 28-01 / 28-02 precedent (`name: color-theory` / `type: palette`, `name: composition` / `type: layout`) also uses the registry-schema shape. Followed `must_haves` + AC + precedent. Not a substantive deviation — same call 28-02's SUMMARY documented.

### [Rule 2 — Missing Critical Cross-Link] Forward note to `./composition.md` §Root Rectangles

The plan's §Baseline Grid Systems §√2 Grid subsection explains when √2 fits but offloads the underlying geometry to `composition.md` — which has `## Golden Ratio and Root Rectangles` at line 68 with `### Root Rectangles — √2, √3, √5` at line 91, the canonical home for the math. Added an inline forward-link under §√2 Grid plus a Cross-References footer line so an agent reading the √2 baseline does not have to grep for the geometry. This adds 1 additional outbound cross-link beyond the 3 the plan required (4 destinations total, 5 mentions). Justified under Rule 2: omitting it forces the reader to re-discover where the √2 geometry lives, which the file's content explicitly invokes. The link is forward-only (composition.md → proportion-systems.md is part of 28-06 reciprocal wiring).

## Issues Encountered

None. The 28-02 SUMMARY's "Rule 1 — gsd-tools state handlers do net damage" lesson was honored proactively: no `gsd-tools state` / `roadmap` / `requirements` subcommand was invoked during this plan's execution. STATE.md and ROADMAP.md are untouched and remain at the canonical state shipped at v1.27.7 closeout. Phase 28-07 will atomically refresh state and ROADMAP rule-14 (D-12) at version closeout.

The 28-01 markdownlint invocation lesson (`--disable <all-other-rules>` for allowlist semantics) was applied directly — no re-discovery.

## Scope Boundaries Held

- No registry entry written — `reference/registry.json` untouched. Lands in 28-06 per D-05.
- No reciprocal inbound links into proportion-systems.md from other references — `design-system-guidance.md` / `typography.md` / `style-vocabulary.md` / `composition.md` untouched. Lands in 28-06 per D-06.
- No audit-scoring lens-tag work — lands in 28-06 per D-07.
- No edits to any existing reference file, no version bumps to manifests — Wave A discipline (disjoint files only).
- No `gsd-tools state` / `roadmap update-plan-progress` / `requirements mark-complete` invocations — STATE / ROADMAP / REQUIREMENTS untouched per 28-02 lesson and D-12.

## Wave A Parallel-Safety

`reference/proportion-systems.md` is a brand-new file. Git diff for this plan = exactly one file added, zero files modified.
This is disjoint from 28-01's `reference/color-theory.md` (already shipped: `4159f17` / `0c6499d` / `b8ee04f`), from 28-02's `reference/composition.md` (already shipped: `ddf19eb`), and from the as-yet-unshipped 28-04 (`i18n.md`). No merge conflict surface.

## Self-Check: PASSED

Verified post-write:

- `reference/proportion-systems.md` exists on disk (`test -f` OK).
- Commit `a64724a` present at top of branch `claude/phase-28` (`feat(28-03): add reference/proportion-systems.md`).
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` returns empty — no accidental deletions in the commit, additive-only confirmed.
- All 15 acceptance criteria reproduce on a fresh shell — line count 267, 7 major sections, 3 baseline-grid subsections (4pt / 8pt / √2), 7 CSS blocks, 22 table rows (one 20-row pairing matrix), 5 outbound cross-link mentions across the 3 plan-required destinations (plus 1 additive Rule-2 forward link to composition.md), MD038 + MD040 exit 0, single trailing newline `0x0a`, scope = exactly one file.
- No stubs, no `TODO`, no placeholder copy. Every section has at least one concrete CSS example with token math; the cross-system matrix is fully populated for all four sub-systems.

## Threat Flags

None — this is a content-only reference file. No network endpoints, no auth surface, no schema changes at trust boundaries, no new file-access patterns.
