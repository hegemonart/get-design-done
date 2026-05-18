---
phase: 28.5
name: skill-authoring-contract
version_target: v1.28.5
depends_on: [12, 14.5, 15]
status: planned
created: 2026-05-18
---

# Phase 28.5 — Skill Authoring Contract + Skill Rework + Project Artifacts — CONTEXT

## Goal

Adopt the mattpocock/skills authoring contract (100-line SKILL.md cap, `<what>. Use when <triggers>.` description form, references-one-level-deep progressive disclosure) and apply it retroactively across all 69 shipped GDD skills. Ship the contract spec + format files (CONTEXT-FORMAT, ADR-FORMAT, architecture-vocabulary), rework every existing skill to comply, patch `debug` with mattpocock's feedback-loop Phase 1, add `/gdd:zoom-out` micro-shortcut, and land CI enforcement.

Independent of Phase 28 — touches different files; can land before, after, or in parallel.

## Why this phase exists

A 2026-05-02 audit comparing GDD's skill set against mattpocock/skills (53,508★, MIT, last push 2026-04-30) produced four observations + one fifth from `engineering/diagnose/SKILL.md`:

1. **Length discipline absent.** GDD skill range: ~30 lines (utilities) to 731 lines (`scan`). 13 skills exceed the 250-line block threshold; 25+ exceed the 100-line warn threshold. Long SKILL.mds bloat agent context, slow first-token latency, obscure workflow under supporting detail.
2. **Description format inconsistent.** Some lack `<what>. Use when <triggers>.` form; some too short (under-specification), some over 1024 chars.
3. **No project-level domain glossary.** STATE.md is cycle-scoped; nothing project-scoped tracks domain language sharpening across cycles.
4. **No project-level ADR class.** D-XX decisions in STATE.md are cycle-scoped; project-shaping decisions have no equivalent artifact.
5. **`debug` Phase 1 weaker than mattpocock's `engineering/diagnose`.** Lacks the deterministic feedback-loop construction discipline (10 priority-ordered paths).

## What ships

| Plan | Wave | Surface |
|------|------|---------|
| 28.5-01 | A | `reference/skill-authoring-contract.md` + `scripts/validate-skill-length.cjs` + `tests/skill-authoring-contract.test.cjs` |
| 28.5-02 | A | `reference/context-md-format.md` + `reference/adr-format.md` (mattpocock MIT ports with attribution) |
| 28.5-03 | A | `reference/architecture-vocabulary.md` (Ousterhout glossary via mattpocock MIT) |
| 28.5-04 | B | Bucket 1 rework — pipeline-stage skills (12 skills) |
| 28.5-05 | B | Bucket 2 rework — design-family skills (8 skills) |
| 28.5-06 | B | Bucket 3 rework — orchestrator + utility skills (31 skills) |
| 28.5-07 | B | Bucket 4 rework — analysis + audit skills (20 skills) |
| 28.5-08 | C | `discuss` + `brief` patches: inline `CONTEXT.md` glossary maintenance + ADR-offer behavior + `decision-injector` extension |
| 28.5-09 | C | `debug` Phase 1 content patch (mattpocock feedback-loop discipline; 10 paths; "iterate on the loop itself") |
| 28.5-10 | B | New `/gdd:zoom-out` micro-skill (`disable-model-invocation: true`, MIT port) — moved from Wave C to Wave B per revision iteration 1 Warning #6 (depends only on 28.5-01; no Wave B bucket-rework dependency) |
| 28.5-11 | D | CI integration (`validate-skill-length.cjs` wired into existing lint/validate gate; `health` skill gains skill-length report subsection); regression baseline |
| 28.5-12 | D | Closeout: 4 manifests at 1.28.5, CHANGELOG, OFF_CADENCE, `NOTICE` attributions, baseline at `test-fixture/baselines/phase-28.5/`, ROADMAP scoped flip |

Wave A (3 plans): parallel-safe — 3 disjoint reference files + 1 validator script.

Wave B (5 plans): parallel-safe within wave — 4 disjoint skill buckets (no overlap after conflict resolution per D-08 below) + the new `zoom-out` micro-skill plan (28.5-10) which touches entirely new files (`skills/zoom-out/SKILL.md` + `tests/zoom-out.test.cjs`) and is parallel-safe with all bucket reworks.

Wave C (2 plans): parallel-safe within wave — disjoint files. 28-08 + 28-09 each touch separate skill files (`discuss`/`brief` vs `debug`). 28-10 moved to Wave B per revision iteration 1 Warning #6.

Wave D (2 plans): 28.5-11 lands first (CI gate + baseline), 28.5-12 closeout follows.

## Decisions locked

| # | Decision | Rationale |
|---|----------|-----------|
| D-01 | **Two-tier length threshold: warn ≥100 lines, block ≥250 lines.** Validator at `scripts/validate-skill-length.cjs` emits warning (non-blocking) at 100+ and hard-fails CI at 250+. | mattpocock's own skill set runs ~30% over 100 (cap is forcing function, not religion). Split discipline catches drift without bikeshedding 110-line skills. |
| D-02 | **Description regex flexible — accepts both `<what>. Use when <triggers>.` form AND a single-sentence form.** Format-strict mode behind `STRICT_DESCRIPTION=1` env flag, advisory by default until Phase 33's A/B evidence lands at `.design/research/description-format-ab.md`. Pure description-length cap (1024 chars) IS strict. | Open contract tension per ROADMAP spec — `obra/superpowers/writing-skills` documents shortcut-effect where agents follow the description summary and skip skill body. Wait for Phase 33 A/B before forcing the form. |
| D-03 | **MIT attribution lands in `NOTICE` and at top of each ported file.** Ports: `reference/context-md-format.md`, `reference/adr-format.md`, `reference/architecture-vocabulary.md`, `skills/zoom-out/SKILL.md`, `debug` Phase 1 feedback-loop content. Format: `Source: mattpocock/skills (MIT) — adapted with permission`. | License compliance. mattpocock/skills is MIT — usable with attribution. |
| D-04 | **CONTEXT.md is project-scoped, lazy-created.** `discuss` + `brief` write to `./CONTEXT.md` immediately when a term is resolved (no batching). Multi-context repos via top-level `CONTEXT-MAP.md` → per-area `<area>/CONTEXT.md`. `decision-injector` reads CONTEXT.md as additive context alongside STATE.md. ADRs `docs/adr/NNNN-<slug>.md` offered ONLY when all three of `hard-to-reverse AND surprising-without-context AND real-tradeoff` hold. | Captures mattpocock's `grill-with-docs` pattern — DDD-style ubiquitous language inline; ADRs sparingly. STATE.md decisions stay cycle-scoped. |
| D-05 | **No skill renames.** Rework is content-only. Skill names land in user CLAUDE.md references, slash-command surfaces, external integrations; renames trigger user-side breakage. | API-breaking change forbidden. |
| D-06 | **Keep refs centralized in `reference/`.** Per-skill folders allowed only for content that's TRULY single-skill-private (rare). Don't restructure to mattpocock's per-skill-folder pattern — refs like `typography.md` are consumed by 15+ skills; bundling per-skill creates massive duplication. | Adopt the contract (cap + progressive disclosure + refs-one-level-deep), NOT the per-skill-folder restructure. **Corrected by Phase 28.6** — Phase 28.6 D-01 reversed this over-generalization; per-skill folder pattern endorsed for skill-private (1-consumer) procedure refs per mattpocock structure. See [Phase 28.6 CONTEXT.md](../28.6-skill-reference-co-location/CONTEXT.md). |
| D-07 | **No new audit pillar, no skill-namespace change.** No flatten of `gdd:`/`gsd:` prefixes to mattpocock's bare-noun convention — namespaces are load-bearing for plugin coexistence. | Preserve API stability. |
| D-08 | **Bucket assignment (D-08 conflict resolution per ROADMAP).** ROADMAP spec lists some skills in multiple buckets. Canonical assignment for 28.5-04/05/06/07: |   |
|   | • **Bucket 1 (28.5-04)** — `brief`, `discuss`, `plan`, `design`, `verify`, `explore`, `discover`, `sketch`, `spike`, `complete-cycle`. (Drops `scan` → Bucket 4 per spec note. Drops `new-cycle` → Bucket 4. Drops `design` here, keeps it in Bucket 2.) Actually: keep `design` in Bucket 1 (pipeline-stage), remove from Bucket 2; keep `scan` in Bucket 1 (pipeline-stage stage 1), remove from Bucket 4 list. ROADMAP spec drift acknowledged. | Resolve overlaps deterministically: each skill in exactly one bucket. |
|   | • **Bucket 2 (28.5-05)** — `audit`, `style`, `darkmode`, `compare`, `figma-write`, `connections`, `benchmark`. (Removes `design` → Bucket 1.) |   |
|   | • **Bucket 3 (28.5-06)** — `help`, `stats`, `note`, `add-backlog`, `todo`, `progress`, `health`, `update`, `undo`, `fast`, `quick`, `next`, `do`, `resume`, `pause`, `extract-learnings`, `settings`, `graphify`, `pr-branch`, `ship`, `reapply-patches`, `list-assumptions`, `plant-seed`, `review-backlog`, `apply-reflections`, `reflect`, `cache-manager`, `warm-cache`, `router`, `synthesize`, `timeline`, `continue`, `start`, `recall` (3 extra discovered in current repo). |   |
|   | • **Bucket 4 (28.5-07)** — `map`, `analyze-dependencies`, `sketch-wrap-up`, `spike-wrap-up`, `skill-manifest`, `debug`, `new-cycle`, `new-project`, `peers`, `peer-cli-add`, `peer-cli-customize`, `quality-gate`, `turn-closeout`, `watch-authorities`, `optimize`, `check-update`, `bandit-status` (new in 27.5). |   |
| D-09 | **`disable-model-invocation: true` applies to pure shortcuts**: `help`, `stats`, `note`, `add-backlog`, `todo`, `health`, `settings`, `next`, `pause`, `resume`, `fast`, `quick`, `pr-branch`, `ship`, `reapply-patches`, `list-assumptions`, `plant-seed`, `review-backlog`, `cache-manager`, `warm-cache`, `synthesize`, `timeline`, `start`, `recall`, `continue`, `update`, `undo`, `gdd-zoom-out` (new). User-invoked-only; router doesn't auto-fire. | Prevents accidental shortcut firing during pipeline auto-routing. |
| D-10 | **Rework discipline: extract-then-link, never delete content.** For each skill exceeding 100 lines: (a) identify load-bearing workflow + decision-tree content (KEEP in SKILL.md); (b) identify domain-content / heuristics / framework matrices / glossary explanations / extended examples (EXTRACT to existing `reference/*.md` if topic matches; CREATE new `reference/<topic>.md` if topic doesn't fit); (c) replace extracted content with single-sentence summary + cross-link. NEVER drop content — it gets relocated. | Reduces context bloat without losing institutional knowledge. Matches `additive-only` discipline from Phase 28. |
| D-11 | **Skill structural compliance is the load-bearing test contract.** Validator at `scripts/validate-skill-length.cjs` enforces: (a) frontmatter required fields `name`, `description`; (b) `description` length ≤ 1024 chars; (c) SKILL.md ≤ 100 lines = pass with warning; (d) ≤ 250 lines = pass strictly; (e) > 250 lines = fail; (f) `disable-model-invocation` allowed only on whitelist via frontmatter. Each Wave B/C plan asserts validator passes for its scope. | Test contract is the load-bearing surface — content quality is hard to test mechanically. |
| D-12 | **All 12 plans ship together at v1.28.5.** 4 manifests bump lockstep. `tests/semver-compare.test.cjs` adds `OFF_CADENCE_VERSIONS.add('1.28.5')`. Baseline at `test-fixture/baselines/phase-28.5/`. v1.28.5 follows v1.28.0. | Same ship-it-together discipline as Phases 27.5–28. |

## Out of scope (rejected per ROADMAP)

- TDD-default for executor (mattpocock's `tdd` skill mandates red-green-refactor as workflow). Workflow change requires explicit user buy-in. Tracked as separate phase candidate.
- Porting `to-prd` / `to-issues` / `triage` skills. Functionally overlap with `gsd-inbox` + `gsd-spec-phase` + `connections/`. Defer.
- Restructuring all skills into self-contained per-skill folders. Incompatible with shared `reference/` model (D-06).
- Hard 100-line gate. Cap is forcing function, not religion (D-01).
- Renaming any skills (D-05).
- Porting `improve-codebase-architecture` skill itself (only its `LANGUAGE.md` glossary lifted per D-03).
- Porting `caveman` skill (out-of-scope).
- Re-litigating skill names to follow bare-noun convention (D-07).

## Research tail (non-blocking, monitor)

- Skill-length distribution before/after rework — measure mean / median / p95 line counts; reflector picks up if rework caused agent task-success regression.
- Description-character distribution — outliers under 100 chars (under-spec) + over 1024 chars (violation).
- `CONTEXT.md` adoption signal — count grilling sessions writing CONTEXT.md term entry within first N runs.
- ADR creation rate — should be RARE per 3-criteria gate. If rate exceeds ~1 per 5 sessions, gate too lax.
- Skill-length validator false-positive rate — some skills legitimately need 150-200 lines (multi-stage orchestrators).
- mattpocock/skills upstream changes — `/gdd:watch-authorities` feed; `apply-reflections` proposes contract updates.

## Carry-forward from prior phases

- **Phase 12** — CI infrastructure (existing lint/validate gate) for `validate-skill-length.cjs` integration
- **Phase 14.5** — reference registry; `decision-injector` hook plumbing
- **Phase 15** — foundational references corpus is the extraction destination
- **Phase 19.6** — `shared-preamble.md` pattern (reused in Bucket 2 design-family dedupe)
- **Phase 28** — `reference/registry.json` schema, `./relative` cross-link convention, ADDITIVE-ONLY discipline (D-06 of Phase 28; D-10 of Phase 28.5)

## Phase 25/26/27/27.5/27.6/27.7/28 lessons applied

- 4-manifest lockstep at v1.28.5 (D-12)
- `OFF_CADENCE_VERSIONS.add('1.28.5')` in semver-compare
- markdownlint MD038 clean (no spaces inside inline code spans)
- Baseline tests version-agnostic — reads `package.json#version`; full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28 lesson)
- ROADMAP regex tolerates leading whitespace (`^[[:space:]]*-`)
- ROADMAP flip scoped strictly to Phase 28.5 (12 inline plan checkboxes + 1 top-level overview entry)
- New `reference/*.md` files register through `reference/registry.json` (5 entries: skill-authoring-contract, context-md-format, adr-format, architecture-vocabulary, debug-feedback-loops; new files from Bucket 4 extraction also)
- `test-fixture/baselines/phase-20/agent-list.txt` unchanged (no new agents); `skill-list.txt` += `zoom-out` (1 new skill)
- Closeout (28.5-12) bumps phase-27-7 manifests-version baseline (Phase 28 lesson 3) — actually no, Phase 28 closeout did bump. Phase 28.5 closeout MUST bump phase-28/manifests-version.txt (if exists) to 1.28.5.
- NO ZWJ emoji in any new content (injection scanner blocks invisible-unicode); codepoint descriptions only (Phase 28 lesson 4)

## Notes for downstream plan-phase

When `/gsd-plan-phase 28.5` runs:
- Generate 12 plan files (`28.5-01-PLAN.md` through `28.5-12-PLAN.md`)
- Wave A (28.5-01..03) parallel-safe — 3 disjoint reference files + validator script
- Wave B (28.5-04..07, 28.5-10) parallel-safe — 4 disjoint skill buckets per D-08 canonical assignment + the new `zoom-out` micro-skill (28.5-10 moved from Wave C per revision iteration 1 Warning #6)
- Wave C (28.5-08..09) parallel-safe — disjoint skill files
- Wave D (28.5-11..12) sequential — gate first, closeout last
- Bucket 1 (28.5-04) is the heaviest — 12 skills incl. `verify` (511), `scan` (731), `design` (299), `plan` (267), `explore` (253). Plan should handle aggressive extraction.
- Bucket 4 (28.5-07) creates 2-3 new reference files for extracted content (`debug-feedback-loops.md`, `threat-modeling.md`, `milestone-completeness-rubric.md` per spec)
- 28.5-08 needs `CONTEXT.md` glossary writer hooks in `skills/discuss/SKILL.md` + `skills/brief/SKILL.md` + `hooks/gdd-decision-injector.js` extension (Phase 14.5 plumbing)
- 28.5-11 CI gate goes into existing `.github/workflows/ci.yml` lint job — finds the script invocation, adds it
- 28.5-12 closeout bumps `tests/phase-27-7-baseline.test.cjs` `expected: '1.28.0' → '1.28.5'` (or whichever pattern the test uses) per Phase 28 lesson 3
