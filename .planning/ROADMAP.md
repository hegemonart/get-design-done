# Roadmap: ultimate-design v3

## Overview

v3 hardens the existing five-stage pipeline to work correctly across platforms and project layouts, then adds three utility commands (style, darkmode, compare) that sit alongside the pipeline. Phase 1 fixes the cross-platform bash failures that produce silent false-clean results today. Phase 2 polishes the existing pipeline so all real-world project types get correct results. Phases 3 and 4 build the three new commands, with style and darkmode in parallel before compare (which depends on stable DESIGN.md schema). Phase 5 validates the full plugin and bumps the version to 3.0.0.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Platform Foundation** - Cross-platform bash, CRLF normalization, fallback path handling
- [ ] **Phase 2: Pipeline Polish** - Fix existing pipeline stages for real-world projects and accurate results
- [ ] **Phase 3: style + darkmode Commands** - Two new utility commands (parallel build)
- [ ] **Phase 4: compare Command** - Delta report between DESIGN.md baseline and DESIGN-VERIFICATION.md
- [ ] **Phase 5: Validation + Version Bump** - Plugin validate, smoke test, version 3.0.0

## Phase Details

### Phase 1: Platform Foundation
**Goal**: All bash patterns work correctly on macOS, Windows Git Bash, and Linux — no silent failures
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, SCAN-04
**Success Criteria** (what must be TRUE):
  1. Running any pipeline stage on macOS or Windows Git Bash produces the same grep match counts as on Linux (no silent false-negatives)
  2. `.gitattributes` enforces LF line endings and `git status` shows no unexpected diffs after checkout on Windows
  3. Bootstrap script runs without error on a Windows path containing spaces and on a path with no `/src/` directory
  4. Fallback path detection tries `app/`, `lib/`, `pages/`, `src/` in order and logs which one matched
**Plans**: TBD

Plans:
- [ ] 01-01: Fix all grep patterns to POSIX -E syntax + add .gitattributes
- [ ] 01-02: Normalize bootstrap.sh Windows path handling + non-src fallback paths

### Phase 2: Pipeline Polish
**Goal**: Every existing pipeline stage produces accurate, non-duplicate results for Next.js App Router, Remix, SvelteKit, and Tailwind-only projects
**Depends on**: Phase 1
**Requirements**: SCAN-01, SCAN-02, SCAN-03, DISC-01, DISC-02, DISC-03, PLAN-01, PLAN-02, DSGN-01, DSGN-02, DSGN-03, VRFY-01, VRFY-02, REF-01, REF-02, REF-03, REF-04, REF-05
**Success Criteria** (what must be TRUE):
  1. Running scan on a Next.js App Router project (no `src/`) produces a valid DESIGN.md with component inventory — no empty sections
  2. Running discover on a Tailwind-only project (no CSS files) completes without error and audits Tailwind config instead of CSS grep
  3. DESIGN-DEBT.md dependency ordering is deterministic: two runs on the same project produce identical ordering
  4. Verify stage visual-inspection heuristics are flagged `? VISUAL` with a reason — a reviewer knows which checks need eyes and which are automated
  5. All five reference files (audit-scoring.md, typography.md x2, motion.md x2) contain the new content sections — a user following a guide finds the guidance without searching elsewhere
**Plans**: TBD

Plans:
- [ ] 02-01: Scan polish — component detection, --full mode, DESIGN-DEBT ordering
- [ ] 02-02: Discover polish — non-src fallbacks, Tailwind-only, gray areas checklist
- [ ] 02-03: Plan + design + verify polish — task templates, --research doc, execution guides, oklch, decision authority, VISUAL flags
- [ ] 02-04: Reference file expansions — audit-scoring, typography, motion

### Phase 3: style + darkmode Commands
**Goal**: Two new utility commands exist, are routed from the root SKILL.md, and produce correct output artifacts without polluting the pipeline artifact namespace
**Depends on**: Phase 2
**Requirements**: STYL-01, STYL-02, STYL-03, STYL-04, STYL-05, DARK-01, DARK-02, DARK-03, DARK-04, DARK-05, DARK-06, DARK-07
**Success Criteria** (what must be TRUE):
  1. `@ultimate-design style Button` on a post-pipeline project reads DESIGN-SUMMARY.md and produces `.design/DESIGN-STYLE-Button.md` with spacing tokens, color tokens, typography scale, component states, and a token health score
  2. `@ultimate-design style Button` on a pre-pipeline project (no DESIGN-SUMMARY.md) falls back to DESIGN.md + source file and still produces a complete spec
  3. `@ultimate-design darkmode` detects which dark mode architecture is used (CSS custom properties / Tailwind `dark:` / JS class toggle) and reports it at the top of the audit
  4. `@ultimate-design darkmode` produces `.design/DARKMODE-AUDIT.md` (not DESIGN-*.md) with contrast audit, token override coverage, and a P0-P3 fix list
  5. Neither command appears in the pipeline progress bar or blocks any pipeline stage
**Plans**: TBD

Plans:
- [ ] 03-01: style command — SKILL.md, two modes, output schema, root router update
- [ ] 03-02: darkmode command — SKILL.md, architecture detection, audit checks, root router update

### Phase 4: compare Command
**Goal**: Developers can see exactly what changed between their DESIGN.md baseline and DESIGN-VERIFICATION.md scores, including design drift detection
**Depends on**: Phase 2 (requires stable DESIGN.md schema after scan polish)
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, COMP-05
**Success Criteria** (what must be TRUE):
  1. `@ultimate-design compare` on a project with both DESIGN.md and DESIGN-VERIFICATION.md produces `.design/COMPARE-REPORT.md` with a per-category score delta table
  2. The compare report flags any category where the score regressed and no design task in DESIGN-PLAN.md covers that category — design drift is visible without manual cross-referencing
  3. `@ultimate-design compare` with no DESIGN-VERIFICATION.md present prints a clear error explaining what is missing, not a generic failure
**Plans**: TBD

Plans:
- [ ] 04-01: compare command — SKILL.md, delta logic, drift detection, root router update

### Phase 5: Validation + Version Bump
**Goal**: The plugin passes formal validation, all eight commands work on a real Windows Git Bash project, and the version is 3.0.0
**Depends on**: Phases 3 and 4
**Requirements**: VAL-01, VAL-02, VAL-03
**Success Criteria** (what must be TRUE):
  1. `claude plugin validate .` exits 0 with no errors or warnings after all v3 changes
  2. Root SKILL.md argument-hint frontmatter, Command Reference table, and Jump Mode section all list style, darkmode, and compare — invoking any of them routes correctly
  3. `plugin.json` and `marketplace.json` both show version `3.0.0`
**Plans**: TBD

Plans:
- [ ] 05-01: Root SKILL.md routing audit + plugin validate + version bump

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Platform Foundation | 0/2 | Not started | - |
| 2. Pipeline Polish | 0/4 | Not started | - |
| 3. style + darkmode Commands | 0/2 | Not started | - |
| 4. compare Command | 0/1 | Not started | - |
| 5. Validation + Version Bump | 0/1 | Not started | - |
