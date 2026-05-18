---
name: plan
description: "Stage 3 of 5 orchestrator that reads DESIGN-CONTEXT.md, runs optional research (phase-researcher / pattern-mapper / assumptions-analyzer / synthesizer), spawns design-planner + design-plan-checker, and writes DESIGN-PLAN.md. Use when DESIGN-CONTEXT.md is locked and you need a wave-ordered execution plan."
argument-hint: "[--auto] [--parallel]"
user-invocable: true
tools: Read, Write, Bash, Glob, Task, AskUserQuestion, ToolSearch, mcp__gdd_state__get, mcp__gdd_state__transition_stage, mcp__gdd_state__add_decision, mcp__gdd_state__add_must_have, mcp__gdd_state__update_progress, mcp__gdd_state__set_status, mcp__gdd_state__add_blocker, mcp__gdd_state__checkpoint, mcp__gdd_state__probe_connections
---

# Get Design Done — Plan

**Stage 3 of 5** in the get-design-done pipeline. Thin orchestrator. All planning intelligence lives in `agents/design-planner.md`.

Full procedure detail: `./plan-procedure.md`.

---

## Stage entry

1. `mcp__gdd_state__transition_stage` with `to: "plan"`. Gate failure surfaces `error.context.blockers`; do not advance.
2. `mcp__gdd_state__get` -> snapshot `state` for `<position>`, `<connections>`, `<must_haves>`, `<blockers>`, `<decisions>`. Do not re-read STATE.md directly.
3. Abort only if `.design/DESIGN-CONTEXT.md` is missing — that is the true prerequisite, not STATE.md.

---

## Flags + parallelism

- `--auto` -> `auto_mode=true` (skip approvals, skip optional research).
- `--parallel` -> `parallel_mode=true` (planner fills `Touches:`/`Parallel:` fields).
- **Parallelism decision**: read `.design/config.json` + `reference/parallelism-rules.md`. Plan pipeline is inherently sequential (researcher -> pattern-mapper -> planner -> checker) so the expected verdict is **serial** (rule 1). Record via `mcp__gdd_state__update_progress` with `status: "plan_parallelism_decided: batch_size=<N>, reason=<short-reason>"`.

## Probe Chromatic connection

Probe `chromatic` (CLI presence + `CHROMATIC_PROJECT_TOKEN` check; auto-`unavailable` if `storybook: not_configured`), then write status via `mcp__gdd_state__probe_connections` (single-entry array, never edit `<connections>` directly). Detail: `./plan-procedure.md` §Probe Chromatic connection.

When `chromatic: available`, run change-risk scoping before writing DESIGN-PLAN.md: identify token/component files in scope from DESIGN-CONTEXT.md, run `npx chromatic --trace-changed=expanded --dry-run`, count story files that depend on changed source files, and pass the story count to the design-planner spawn prompt. Detail: `./plan-procedure.md` §Chromatic Change-Risk Scoping.

---

## Step 1 — Optional Research (skip if `auto_mode`)

Complexity heuristic: DESIGN-CONTEXT.md `<domain>` spans 3+ scopes OR `<decisions>` count > 6 -> spawn `design-phase-researcher` -> `.design/DESIGN-RESEARCH.md` (~100 lines, ~2 min). Wait for `## RESEARCH COMPLETE`, then `update_progress` `task_progress: "1/3"`. Full prompt: `./plan-procedure.md` §Step 1.

## Step 1.5 — Pattern Mapping (mandatory, brownfield protection)

Spawn `design-pattern-mapper` -> `.design/DESIGN-PATTERNS.md` (classify by design concern, not by code architecture — no controllers/services/middleware vocabulary). Wait for `## MAPPING COMPLETE`. Full prompt: `./plan-procedure.md` §Step 1.5.

## Step 1.6 — Assumptions Analysis (skip if `auto_mode`)

If assumptions analysis is enabled: spawn `design-assumptions-analyzer` -> surfaces hidden design assumptions with confidence + evidence. Wait for `## ANALYSIS COMPLETE`. Full prompt: `./plan-procedure.md` §Step 1.6.

## Step 1.7 — Synthesize pre-plan inputs (Plan 10.1-04, D-13/D-15)

If 2+ pre-plan agents ran (Step 1, 1.5, 1.6), invoke `Skill("synthesize", { outputs, directive, output_shape: "markdown" })` to merge their outputs into `.design/DESIGN-PREPLAN-BRIEF.md` (~150 lines, per-source headers preserved). Add the brief to the planner's `<required_reading>` in Step 2. If only one agent ran, skip. Full call signature + parallel-synthesizer note: `./plan-procedure.md` §Step 1.7.

**Research-synthesis persistence:** for each D-XX the synthesizer produces, `mcp__gdd_state__add_decision`; for each M-XX, `mcp__gdd_state__add_must_have`. Issue sequentially (lockfile-bound). Detail: `./plan-procedure.md` §Research-synthesis persistence.

---

## Step 2 — Plan

Spawn `design-planner` with `<required_reading>` covering STATE.md, DESIGN-CONTEXT.md, DESIGN-PATTERNS.md, plus (conditionally) DESIGN-RESEARCH.md, DESIGN-ASSUMPTIONS.md, DESIGN-PREPLAN-BRIEF.md (preferred when 1.7 ran), all `.design/sketches/*/WINNER.md`, all `.design/spikes/*/FINDINGS.md`, and all `./.claude/skills/design-*-conventions.md` + `~/.claude/gdd/global-skills/*.md` (project-local D-XX overrides globals). Wait for `## PLANNING COMPLETE`, then `update_progress` `task_progress: "2/3"`. Full prompt + conditional include syntax: `./plan-procedure.md` §Step 2.

## Step 3 — Check

Spawn `design-plan-checker` to validate DESIGN-PLAN.md against DESIGN-CONTEXT.md across 5 dimensions: requirement coverage, task completeness, wave ordering, must-have derivation, auto-mode compliance. Wait for `## PLAN CHECK COMPLETE`, then `update_progress` `task_progress: "3/3"`. On `## PLAN CHECK RESULT: ISSUES FOUND` + BLOCKER: offer revise/accept/abort (`auto_mode`: auto-accept WARN, abort on BLOCKER). Full prompt + branching: `./plan-procedure.md` §Step 3.

---

## Stage exit

1. `mcp__gdd_state__set_status` -> `"plan_complete"`.
2. `mcp__gdd_state__checkpoint` — stamps `last_checkpoint` and finalizes the plan stage.

The next stage (design) calls `mcp__gdd_state__transition_stage` on entry — this skill does NOT issue the transition itself, preserving the stage-owned-transition discipline.

## After Completion

Print: plan tasks (N waves, M total tasks), files written (`.design/DESIGN-PLAN.md`, plus `.design/DESIGN-RESEARCH.md` if research ran), next step `/get-design-done:design`.

## PLAN COMPLETE
