---
name: gdd-explore
description: "Stage 2 of 5 — unified exploration merging inventory grep + design interview. Probes 6 connections, scans the codebase, conducts the AskUserQuestion interview, and writes .design/DESIGN.md + DESIGN-DEBT.md + DESIGN-CONTEXT.md. Use after /gdd:brief to map the existing system and lock decisions before planning."
argument-hint: "[--skip-interview] [--skip-scan]"
tools: Read, Write, Bash, Grep, Glob, Task, AskUserQuestion, mcp__gdd_state__get, mcp__gdd_state__transition_stage, mcp__gdd_state__probe_connections, mcp__gdd_state__update_progress, mcp__gdd_state__set_status, mcp__gdd_state__add_blocker, mcp__gdd_state__checkpoint, mcp__gdd_state__add_decision
---

# Get Design Done — Explore

**Role:** You are the Explore stage. Stage 2 of 5 in the get-design-done pipeline.

**Purpose:** Unified exploration merging the former `scan` (inventory grep) and `discover` (context interview) stages. Produces `.design/DESIGN.md`, `.design/DESIGN-DEBT.md`, and `.design/DESIGN-CONTEXT.md`.

Full procedure detail: `../../reference/explore-procedure.md`.

---

## Stage entry

All STATE.md persistence goes through `gdd-state` MCP tools — no direct edits. Plain design docs (DESIGN.md / DESIGN-DEBT.md / DESIGN-CONTEXT.md) use `Write`.

1. `mcp__gdd_state__transition_stage` with `to: "explore"`. On gate failure: print blockers from `error.context.blockers` verbatim, do not advance.
2. `mcp__gdd_state__get` (no args) -> snapshot `state` for downstream steps.

---

## Step 1 — Connection probe

Probe six connections, then batch-write results via ONE `mcp__gdd_state__probe_connections` call (unspecified connections keep their existing value):

- **A — Figma** (variant-agnostic): ToolSearch + regex parse of `get_metadata` / `use_figma` prefixes -> tiebreaker selection (`both-sets > reads-only`, `figma > others`, `non-figma-desktop`, alphabetical) -> live `{prefix}get_metadata` call -> `available` / `unavailable` / `not_configured` (with `prefix=` + `writes=`).
- **B — Refero**: ToolSearch presence sufficient.
- **C — 21st.dev**: ToolSearch `mcp__21st` presence.
- **D — Magic Patterns**: ToolSearch `mcp__magic_patterns` presence.
- **E — paper.design**: ToolSearch `mcp__paper` + live `get_selection` call.
- **F — pencil.dev**: `find . -name "*.pen"` file-presence.

Full probe specs + commit-results JSON shape: `../../reference/explore-procedure.md` §Step 1.

## Step 1.5 — 21st.dev Prior-Art Check (when `21st-dev: available`)

For each greenfield component in scope: `21st_magic_component_search(component_name, limit: 3)`. Fit >= 80% -> add `<prior-art>` block to DESIGN.md recommending adoption; fit < 80% -> note as reference, build custom. If `svgl_get_brand_logo` available and brand assets are in scope, call per logo and save SVGs to `.design/assets/`. Skip entirely if no greenfield components in scope. Detail: `../../reference/explore-procedure.md` §Step 1.5.

---

## Step 2 — Inventory scan (unless `--skip-scan`)

**Map pre-check**: if `.design/map/` exists with all 5 files (`tokens.md`, `components.md`, `visual-hierarchy.md`, `a11y.md`, `motion.md`) fresher than `src/`, consume them and skip the grep pass. Otherwise grep and, after Step 4, suggest `/gdd:map` for the next cycle.

**Parallelism decision**: read `.design/config.json` + `reference/parallelism-rules.md`. Record verdict via `mcp__gdd_state__set_status` (`"explore_parallel"` / `"explore_serial"`). Parallel -> multiple `Task()` in one response; serial -> sequential.

Run the canonical scan grep/glob inventory (POSIX ERE, preserving PLAT-01/02): component detection (Glob `**/*.{tsx,jsx,vue,svelte}`), color extraction (hex / rgb / hsl / Tailwind arbitrary), typography scan (font-family / Tailwind `font-*` / `text-*`), motion scan (`transition` / `animate-` / `@keyframes` / `framer-motion`), token detection (tailwind.config / CSS custom properties / token JSON), layout detection (ordered fallback `src/` -> `app/` -> `pages/` -> `lib/` -> unknown). Write `.design/DESIGN.md` + `.design/DESIGN-DEBT.md`. Then `mcp__gdd_state__update_progress` for scan progress. Detail: `../../reference/explore-procedure.md` §Step 2.

**Step 2.x — i18n readiness probe (informational, per D-04)**: check `package.json` deps against `{react-intl, next-intl, i18next, vue-i18n, formatjs, lingui}` -> `framework-managed`; else grep `Intl.(DateTimeFormat|NumberFormat|...)` in `src/` -> `partial`; else `none`. Emit single line `Localization readiness: <state>` in the report. NO gate, NO blocking — surface signal only (D-07). Detail: `../../reference/explore-procedure.md` §Step 2.x.

## Step 2.5 — Detect prior sketches and project-local conventions

- **Sketches**: list `.design/sketches/*` slugs, group by `WINNER.md` present (completed) vs absent (pending). Record via `mcp__gdd_state__set_status: "explore_sketches_present"`. Include in DESIGN.md "Prior Explorations" section.
- **Project-local skills**: read `./.claude/skills/design-*-conventions.md` -> include in DESIGN-CONTEXT.md `<project_conventions>` (these override defaults).
- **Global skills**: `~/.claude/gdd/global-skills/*.md` (other than README) -> prepend to `<project_conventions>` under `<global_conventions>` sub-block. Project-local D-XX wins on conflict.

---

## Step 3 — Design interview (unless `--skip-interview`)

**Run inline — NEVER spawn `design-discussant` as a subagent.** `AskUserQuestion` only renders the native picker from the top-level skill context; spawning degrades to plain markdown (broken in Claude Desktop).

- **3.a Pre-load context**: state.decisions snapshot -> BRIEF.md -> DESIGN.md -> DESIGN-CONTEXT.md `<gray_areas>` -> project conventions. If `figma: available`, call `{prefix}get_variable_defs` and draft tentative D-XX entries.
- **3.b Identify question set**: skip areas already covered by D-XX or project convention. Default coverage: cycle goal, audience, brand direction (if no tokens), color/typography/spacing primitives (if undetected), motion preferences, gray areas from DESIGN-CONTEXT.md.
- **3.c Ask one at a time**: `AskUserQuestion` with 4 concrete options + "Other" / "Skip". Reject generic answers ("modern", "clean") with one follow-up.
- **3.d Record after each answer**: `mcp__gdd_state__add_decision` (atomic, auto-assigns D-NN); append a quality-classified JSON line to `.design/learnings/question-quality.jsonl`.
- **3.e Produce DESIGN-CONTEXT.md**: summarize locked decisions, remaining gray areas, Figma tentatives. Frontmatter `status: complete`.

Full interview protocol + JSON line schema: `../../reference/explore-procedure.md` §Step 3.

---

## Step 4 — Close out explore

- If the synthesizer / mapper batch ran in Step 2: `mcp__gdd_state__update_progress` with `task_progress: "<done>/<total>"`, `status: "explore_mappers_done"`.
- `mcp__gdd_state__checkpoint` — bumps `last_checkpoint`.
- Stage advance to `plan` happens at the next stage's entry (plan owns its own `transition_stage`); do not edit frontmatter directly.

## After Writing

Print: "=== Explore complete ===\nSaved: .design/DESIGN.md, .design/DESIGN-DEBT.md, .design/DESIGN-CONTEXT.md\nNext: @get-design-done plan".

## EXPLORE COMPLETE
