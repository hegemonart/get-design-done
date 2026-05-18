---
name: design
description: "Stage 4 of 5 orchestrator that reads DESIGN-PLAN.md, partitions tasks by wave + parallel-safe flag, and spawns design-executor agents with the appropriate isolation (worktree for parallel batches, in-place for sequential tail). Use when DESIGN-PLAN.md is approved and ready for implementation."
argument-hint: "[--auto] [--parallel]"
user-invocable: true
tools: Read, Write, Bash, Grep, Glob, Task, AskUserQuestion, mcp__gdd_state__get, mcp__gdd_state__transition_stage, mcp__gdd_state__update_progress, mcp__gdd_state__set_status, mcp__gdd_state__add_blocker, mcp__gdd_state__resolve_blocker, mcp__gdd_state__checkpoint
---

# Get Design Done — Design

**Stage 4 of 5** in the get-design-done pipeline. Thin orchestrator. All design execution intelligence lives in `agents/design-executor.md`.

Full procedure detail: `../../reference/design-procedure.md`.

---

## Stage entry

1. `mcp__gdd_state__transition_stage` with `to: "design"`. Gate failure surfaces `error.context.blockers`; do not advance. Resume case: prior stage `design` + `status: in_progress` -> skip tasks where `.design/tasks/task-NN.md` already exists.
2. `mcp__gdd_state__get` -> snapshot `state`; read `state.position.wave` for execution plan.
3. Abort only if `.design/DESIGN-PLAN.md` is missing: "No plan found. Run `/get-design-done:plan` first."

Detail: `../../reference/design-procedure.md` §Stage entry.

---

## Flags + pre-execution checks

- `--auto` -> `auto_mode=true` (no mid-stage prompts; architectural deviations stop the individual task but continue the rest).
- `--parallel` -> `parallel_mode=true` (use worktree isolation for `Parallel: true` tasks).
- **Directionally-open check** (skipped if `auto_mode`): scan DESIGN-PLAN.md for tasks whose criteria read "explore N directions" / "pick a visual approach" and suggest `/gdd:sketch` first.
- **Project-local conventions**: include any `./.claude/skills/design-*-conventions.md` and `~/.claude/gdd/global-skills/*.md` in every executor's `<required_reading>` — global conventions inform but do not override project-local D-XX decisions.
- **`.stories.tsx` stub**: after each new component file is created by the executor, emit a CSF stub alongside if `.storybook/` exists or `"storybook"` is in `package.json`, even with the dev server offline. Detail: `../../reference/design-procedure.md` §.stories.tsx Stub.

---

## Step 1 — Parse DESIGN-PLAN.md

Read `.design/DESIGN-PLAN.md`. Partition tasks by `## Wave N` heading. Within each wave, partition by `Parallel: true` vs `Parallel: false`. Compute `total_tasks` for the `task_progress` denominator. If resuming, skip tasks whose `.design/tasks/task-NN.md` already exists.

---

## Step 2 — Wave-by-Wave Execution

For each wave in order:

1. **Parallelism decision (per wave)**: read `.design/config.json` `parallelism`, collect candidates, check `Touches:` / `writes:` / `parallel-safe` / `typical-duration-seconds`, apply `reference/parallelism-rules.md` hard->soft. Overlapping `Touches:` split into sequential sub-waves. Record verdict via `mcp__gdd_state__update_progress` with `status: "design_wave_<N>_parallelism: <parallel|serial>, reason=<short-reason>"`.
2. **Executor STATE.md protocol** (inlined verbatim into every `design-executor` prompt): executors update STATE.md ONLY via `gdd-state` MCP tools — `update_progress`, `add_blocker`, `resolve_blocker`. NEVER `Read`+`Write` `.design/STATE.md` directly. The MCP tools enforce the lockfile (Plan 20-01) and emit mutation events (Plan 20-06) so concurrent executors serialize safely.
3. **Parallel batch** (when `parallel_mode=true` AND any `Parallel: true` tasks in wave): announce the partition, spawn all `Parallel: true` tasks via concurrent `Task("design-executor", ..., isolation: "worktree")` calls in ONE response, wait for all `## EXECUTION COMPLETE` markers, merge worktrees (non-overlapping `Touches:` guarantees no conflicts; surface any conflict to the user before continuing), then `update_progress` + `checkpoint`.
4. **Sequential tail** (`Parallel: false` or `parallel_mode=false`): spawn one `design-executor` at a time (no worktree isolation), waiting for each `## EXECUTION COMPLETE` and emitting `update_progress` per task; `checkpoint` after the final task of the wave.

Full executor prompts (parallel + sequential variants) and the merge-worktrees protocol: `../../reference/design-procedure.md` §Step 2.

---

## Step 3 — Wave Checkpoint

After each wave, unless `auto_mode=true`, prompt: "Ready for Wave [N+1]? (yes / review first)". Skip in `auto_mode`.

## Step 4 — Handle Deviations

Check task-NN.md files for `status: deviation`. If found: `mcp__gdd_state__get` -> read `state.blockers`, present affected task IDs + blocker descriptions, offer (a) stop, (b) continue. `auto_mode`: continue, log. When a blocker is later fixed by a follow-up task: `mcp__gdd_state__resolve_blocker`.

---

## State Update (exit)

1. `mcp__gdd_state__set_status` -> `"design_complete"` — marks the stage complete WITHOUT transitioning (verify owns its own `transition_stage` on entry).
2. `mcp__gdd_state__checkpoint` — stamps `last_checkpoint`, appends `design_completed_at` to `<timestamps>`.

## After Completion

Print the `=== Design stage complete ===` summary (tasks complete/total, deviations, commits since stage start, next step `/get-design-done:verify`). Template: `../../reference/design-procedure.md` §After Completion.

---

## Figma Write Dispatch

After all tasks finish, if STATE.md `<connections>` has `figma: available`, offer the user the figma-write opt-in prompt (modes: annotate / tokenize / mappings, with optional `--dry-run`). Spawn `design-figma-writer` with the selected mode on "yes"; skip silently on "no". NEVER auto-run without confirmation. Full prompt + dispatch logic: `../../reference/design-procedure.md` §Figma Write Dispatch.

## DESIGN COMPLETE
