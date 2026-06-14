---
name: hone-explore
description: "Stage 2 of 5 - unified exploration merging inventory grep + design interview. Probes 6 connections, scans the codebase, conducts the AskUserQuestion interview, and writes .design/DESIGN.md + DESIGN-DEBT.md + DESIGN-CONTEXT.md. Use after /hone:brief to map the existing system and lock decisions before planning. Activates for requests involving researching design direction, gathering references, or exploring visual options."
argument-hint: "[--skip-interview] [--skip-scan] [--incremental] [--full]"
tools: Read, Write, Bash, Grep, Glob, Task, AskUserQuestion, mcp__hone_state__get, mcp__hone_state__transition_stage, mcp__hone_state__probe_connections, mcp__hone_state__update_progress, mcp__hone_state__set_status, mcp__hone_state__add_blocker, mcp__hone_state__checkpoint, mcp__hone_state__add_decision
---

# Get Design Done - Explore

**Role:** You are the Explore stage. Stage 2 of 5 in the get-design-done pipeline.

**Purpose:** Unified exploration merging the former `scan` (inventory grep) and `discover` (context interview) stages. Produces `.design/DESIGN.md`, `.design/DESIGN-DEBT.md`, and `.design/DESIGN-CONTEXT.md`.

Full procedure detail: `./explore-procedure.md`.

---

## Stage entry

All STATE.md persistence goes through `hone-state` MCP tools - no direct edits. Plain design docs (DESIGN.md / DESIGN-DEBT.md / DESIGN-CONTEXT.md) use `Write`.

1. `mcp__hone_state__transition_stage` with `to: "explore"`. On gate failure: print blockers from `error.context.blockers` verbatim, do not advance.
2. `mcp__hone_state__get` (no args) -> snapshot `state` for downstream steps.

---

## Step 1 - Connection probe

Probe six connections, then batch-write results via ONE `mcp__hone_state__probe_connections` call (unspecified connections keep their existing value):

- **A - Figma** (variant-agnostic): ToolSearch + regex parse of `get_metadata` / `use_figma` prefixes -> tiebreaker selection (`both-sets > reads-only`, `figma > others`, `non-figma-desktop`, alphabetical) -> live `{prefix}get_metadata` call -> `available` / `unavailable` / `not_configured` (with `prefix=` + `writes=`).
- **B - Refero**: ToolSearch presence sufficient.
- **C - 21st.dev**: ToolSearch `mcp__21st` presence.
- **D - Magic Patterns**: ToolSearch `mcp__magic_patterns` presence.
- **E - paper.design**: ToolSearch `mcp__paper` + live `get_selection` call.
- **F - pencil.dev**: `find . -name "*.pen"` file-presence.

Full probe specs + commit-results JSON shape: `./explore-procedure.md` §Step 1.

## Step 1.5 - 21st.dev Prior-Art Check (when `21st-dev: available`)

For each greenfield component in scope: `21st_magic_component_search(component_name, limit: 3)`. Fit >= 80% -> add `<prior-art>` block to DESIGN.md recommending adoption; fit < 80% -> note as reference, build custom. If `svgl_get_brand_logo` available and brand assets are in scope, call per logo and save SVGs to `.design/assets/`. Skip entirely if no greenfield components in scope. Detail: `./explore-procedure.md` §Step 1.5.

---

## Step 2 - Inventory scan (unless `--skip-scan`)

**Map pre-check**: if `.design/map/` exists with all 5 files (`tokens.md`, `components.md`, `visual-hierarchy.md`, `a11y.md`, `motion.md`) fresher than `src/`, consume them and skip the grep pass. Otherwise grep and, after Step 4, suggest `/hone:map` for the next cycle.

**Parallelism decision**: read `.design/config.json` + `reference/parallelism-rules.md`. Record verdict via `mcp__hone_state__set_status` (`"explore_parallel"` / `"explore_serial"`). Parallel -> multiple `Task()` in one response; serial -> sequential.

**Incremental batching (Phase 53, default)**: `--incremental` (default; `--full` opts out) runs the change classifier first via the fingerprint store, groups the DesignContext graph into Louvain community batches, and dispatches mappers per the verdict (SKIP=0, PARTIAL=affected batches only, FULL=all). Engine: `scripts/lib/explore-parallel-runner` + `scripts/lib/mappers/incremental-discover.cjs`; dispatch concurrency comes from `concurrency-tuner.cjs`. Detail: `./explore-procedure.md` §Incremental Batching.

Run the canonical scan grep/glob inventory (POSIX ERE, preserving PLAT-01/02): component detection (Glob `**/*.{tsx,jsx,vue,svelte}`), color extraction (hex / rgb / hsl / Tailwind arbitrary), typography scan (font-family / Tailwind `font-*` / `text-*`), motion scan (`transition` / `animate-` / `@keyframes` / `framer-motion`), token detection (tailwind.config / CSS custom properties / token JSON), layout detection (ordered fallback `src/` -> `app/` -> `pages/` -> `lib/` -> unknown). Write `.design/DESIGN.md` + `.design/DESIGN-DEBT.md`. Then `mcp__hone_state__update_progress` for scan progress. Detail: `./explore-procedure.md` §Step 2.

**Step 2.x - i18n readiness probe (informational, per D-04)**: check `package.json` deps against `{react-intl, next-intl, i18next, vue-i18n, formatjs, lingui}` -> `framework-managed`; else grep `Intl.(DateTimeFormat|NumberFormat|...)` in `src/` -> `partial`; else `none`. Emit single line `Localization readiness: <state>` in the report. NO gate, NO blocking - surface signal only (D-07). Detail: `./explore-procedure.md` §Step 2.x.

## Step 2.5 - Detect prior sketches and project-local conventions

- **Sketches**: list `.design/sketches/*` slugs, group by `WINNER.md` present (completed) vs absent (pending). Record via `mcp__hone_state__set_status: "explore_sketches_present"`. Include in DESIGN.md "Prior Explorations" section.
- **Project-local skills**: read `./.claude/skills/design-*-conventions.md` -> include in DESIGN-CONTEXT.md `<project_conventions>` (these override defaults).
- **Global skills**: `~/.claude/gdd/global-skills/*.md` (other than README) -> prepend to `<project_conventions>` under `<global_conventions>` sub-block. Project-local D-XX wins on conflict.

## Step 2.6 - Graph review (gate then reviewer)

Runs only when Step 2's mapper batch + synthesizer produced `.design/context-graph.json`. Skip the whole step if the file is absent (pre-Phase-52 project, or `--skip-scan`).

1. **Gate first (cheap Haiku check).** Spawn `design-context-reviewer-gate` via `Task()` with the classifier signal from Step 2's incremental batching pass: `change_pct` (fingerprint classifier `pct`), `classifier_action` (`SKIP` / `PARTIAL_UPDATE` / `ARCHITECTURE_UPDATE` / `FULL_UPDATE`), and `graph_path: ".design/context-graph.json"`. Gate emits a single-line `{spawn, rationale}` JSON decision then `## GATE COMPLETE`.
2. **If `spawn: false`**: record `mcp__hone_state__set_status: "explore_graph_review_skipped"`, log the gate `rationale` (e.g., "project change 3% < 5% threshold"), set telemetry `lazy_skipped: true`. Done - proceed to Step 3.
3. **If `spawn: true`**: spawn `design-context-reviewer` via `Task()` with `<required_reading>` pointing at `.design/STATE.md`, `.design/context-graph.json`, `reference/design-context-schema.md`, `reference/design-context-tag-vocab.md`. The reviewer runs `scripts/validate-design-context.cjs --json` as the deterministic floor (checks 1/2/3/5) then layers the semantic checks (4/6/7/8/9) and returns the 9-check verdict inline (`APPROVED` or `REJECT`).
4. **Capture verdict (read-only contract).** The reviewer does NOT write `.design/DESIGN-CONTEXT-REVIEW.md` - it is `reads-only: true, writes: []`. WARN findings surface through `scripts/lib/health-mirror#getHealthChecks` as `status: 'warn'`; a hard-reject maps to `status: 'fail'`. Record the overall verdict via `mcp__hone_state__set_status: "explore_graph_review_approved"` (or `"_rejected"`).
5. **On REJECT**: record `mcp__hone_state__add_blocker` with the reviewer's blocking-issues list verbatim. Do not advance to Step 3 until the synthesizer or the implicated mapper is re-run. On `APPROVED` (with or without WARNs): proceed.

---

## Step 3 - Design interview (unless `--skip-interview`)

**Run inline - NEVER spawn `design-discussant` as a subagent.** `AskUserQuestion` only renders the native picker from the top-level skill context; spawning degrades to plain markdown (broken in Claude Desktop).

- **3.a Pre-load context**: state.decisions snapshot -> BRIEF.md -> DESIGN.md -> DESIGN-CONTEXT.md `<gray_areas>` -> project conventions. If `figma: available`, call `{prefix}get_variable_defs` and draft tentative D-XX entries.
- **3.b Identify question set**: skip areas already covered by D-XX or project convention. Default coverage: cycle goal, audience, brand direction (if no tokens), color/typography/spacing primitives (if undetected), motion preferences, gray areas from DESIGN-CONTEXT.md.
- **3.c Ask one at a time**: `AskUserQuestion` with 4 concrete options + "Other" / "Skip". Reject generic answers ("modern", "clean") with one follow-up.
- **3.d Record after each answer**: `mcp__hone_state__add_decision` (atomic, auto-assigns D-NN); append a quality-classified JSON line to `.design/learnings/question-quality.jsonl`.
- **3.e Produce DESIGN-CONTEXT.md**: summarize locked decisions, remaining gray areas, Figma tentatives. Frontmatter `status: complete`.

Full interview protocol + JSON line schema: `./explore-procedure.md` §Step 3.

---

## Step 4 - Close out explore

- If the synthesizer / mapper batch ran in Step 2: `mcp__hone_state__update_progress` with `task_progress: "<done>/<total>"`, `status: "explore_mappers_done"`.
- If Step 2.6 ran the graph review: ensure the verdict status is recorded (`explore_graph_review_approved` / `_rejected` / `_skipped`); on `_rejected` do NOT checkpoint until re-run.
- `mcp__hone_state__checkpoint` - bumps `last_checkpoint`.
- Stage advance to `plan` happens at the next stage's entry (plan owns its own `transition_stage`); do not edit frontmatter directly.

## After Writing

Print: "=== Explore complete ===\nSaved: .design/DESIGN.md, .design/DESIGN-DEBT.md, .design/DESIGN-CONTEXT.md\nNext: @get-design-done plan".

<HARD-GATE>
Do NOT transition to plan (or invoke `/hone:plan`) until BOTH `.design/DESIGN.md` AND `.design/DESIGN-CONTEXT.md` are committed AND the user has approved them. If this project uses a custom `.design` location, read the artifact paths from `.design/STATE.md` rather than assuming the default.
</HARD-GATE>

## Rationalizations - Thought to Reality

The shortcut excuses an agent reaches for during explore, and the drift each one introduces:

| Thought | Reality |
|---------|---------|
| "I already know this codebase, I can skip the inventory scan." | An unscanned codebase hides the tokens/components you'll duplicate - the grep pass exists to stop you reinventing what's there. |
| "The six connection probes are noise, I'll assume Figma is off." | A skipped probe means a wrong connection assumption silently breaks the design stage's tool dispatch. |
| "`--skip-interview` is fine, the brief covered it." | The interview locks the gray areas the brief left fuzzy; skipping it ships undecided D-XX into planning. |
| "I'll batch all the interview questions to save round-trips." | Batched questions overwhelm the user and smuggle in coupled assumptions - one-at-a-time keeps each decision clean. |
| "DESIGN-DEBT.md is optional, the scan was clean enough." | Unrecorded debt resurfaces as an unexplained constraint three stages later with no provenance. |
| "Prior sketches and project conventions don't apply this cycle." | Ignored conventions get overridden by defaults, producing inconsistency the audit will flag against the rest of the system. |

## EXPLORE COMPLETE
