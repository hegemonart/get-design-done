---
name: design
description: "Stage 4 of 5 — reads DESIGN-PLAN.md, spawns design-executor per task with wave coordination and parallel/sequential routing. Thin orchestrator."
argument-hint: "[--auto] [--parallel]"
user-invocable: true
tools: Read, Write, Bash, Grep, Glob, Task, AskUserQuestion, mcp__gdd_state__get, mcp__gdd_state__transition_stage, mcp__gdd_state__update_progress, mcp__gdd_state__set_status, mcp__gdd_state__add_blocker, mcp__gdd_state__resolve_blocker, mcp__gdd_state__checkpoint
---

# Get Design Done — Design

**Stage 4 of 5** in the get-design-done pipeline. Thin orchestrator. All design execution intelligence lives in `agents/design-executor.md`.

---

## Stage entry

1. Call `mcp__gdd_state__transition_stage` with `to: "design"`.
   - Gate failure surfaces `error.context.blockers` to the user; do not advance.
   - If the transition succeeds and the prior stage was already `design` with `status: in_progress`, this is a RESUME — use `task_progress` numerator as source of truth and skip tasks that already have a corresponding `.design/tasks/task-NN.md` file.
2. Call `mcp__gdd_state__get` → snapshot `state`; read `state.position.wave` to decide execution plan.

Abort only if `.design/DESIGN-PLAN.md` is missing:
> "No plan found. Run `/get-design-done:plan` first."

---

## Flag Parsing

- `--auto` → `auto_mode=true` (no mid-stage prompts; architectural deviations still stop the individual task but continue with remaining tasks)
- `--parallel` → `parallel_mode=true` (use worktree isolation for `Parallel: true` tasks)

---

## Pre-execution — Directionally-open check

Scan DESIGN-PLAN.md for tasks marked as "directionally open" (exploration-appropriate — e.g., tasks whose acceptance criteria read "explore N directions" or "pick a visual approach"). If any are found, print:

> "Tasks [IDs] appear directionally open — consider running `/gdd:sketch` first to explore variants before implementation."

Skip if `auto_mode=true`.

## Pre-execution — Project-local conventions

When spawning the executor, include any `./.claude/skills/design-*-conventions.md` files in `<required_reading>` so the executor sees project-local design conventions (typography, color, layout, motion, component, interaction decisions codified from prior sketch wrap-ups). Also include any `~/.claude/gdd/global-skills/*.md` files if the directory exists � global skills are cross-project conventions that inform but do not override project-local D-XX decisions.

---

### .stories.tsx Stub (when storybook project detected)

After every new component file is created by the design-executor:

Step 1 — Check project detection (does not require server running):
  Bash: ls .storybook/ 2>/dev/null || grep '"storybook"' package.json 2>/dev/null
  → Found → storybook_project: true
  → Not found → skip .stories.tsx emission

Step 2 — When storybook_project: true, emit a CSF stub alongside the component:
  File: `<same directory as component>/<ComponentName>.stories.tsx`
  Content follows CSF format (see `connections/storybook.md` for full template):
  - Import `Meta` and `StoryObj` from `@storybook/react`
  - Import the new component
  - `meta: Meta<typeof ComponentName>` with `title` and `parameters.a11y.test = 'error'`
  - Export `Default`, `Primary`, `Disabled` story variants
  Adjust `title` to match directory structure (e.g., `'Components/Button'` or `'Features/Auth/LoginForm'`)

Note: the `.stories.tsx` stub is emitted whenever `storybook_project: true` regardless of whether
the dev server is running. New components need stories even in offline/CI contexts.

---

## Step 1 — Parse DESIGN-PLAN.md

Read `.design/DESIGN-PLAN.md`. Partition tasks by `## Wave N` heading. Within each wave, partition by `Parallel: true` vs `Parallel: false`. Compute `total_tasks` for `task_progress` denominator.

If resuming: skip tasks where `.design/tasks/task-NN.md` already exists.

---

## Parallelism Decision (per wave, before spawning)

For each wave:
1. Read `.design/config.json` `parallelism` (or defaults from `reference/config-schema.md`).
2. Collect candidates in the wave; check `Touches:`, `writes:`, `parallel-safe`, and `typical-duration-seconds` fields.
3. Apply rules in order from `reference/parallelism-rules.md` (hard → soft). Overlapping Touches split into sequential sub-waves.
4. Record the parallelism decision for this wave via `mcp__gdd_state__update_progress` with `task_progress: "<completed>/<total>"` and `status: "design_wave_<N>_parallelism: <parallel|serial>, reason=<short-reason>"` — the status string is the canonical carrier (mirrors the plan-stage convention from Plan 20-09; a dedicated tool may be added in a follow-on plan).
5. If `parallel`: spawn all candidates via concurrent `Task()` calls in one response. If `serial`: spawn sequentially.

### Executor prompt template (applies to every spawned design-executor)

Every spawned executor receives the following STATE.md contract in its prompt:

> **STATE.md mutation protocol** — When you complete a task in your assigned batch, update STATE.md ONLY via the `gdd-state` MCP tools. Specifically:
> - Report task progress: `mcp__gdd_state__update_progress` with your new `task_progress` fraction.
> - Add blockers: `mcp__gdd_state__add_blocker` with `{ stage: "design", date: <today>, text: "..." }`.
> - Resolve your own blockers on fix: `mcp__gdd_state__resolve_blocker` with the blocker id.
>
> Do NOT `Read` + `Write` `.design/STATE.md` directly — the MCP tools enforce the lockfile and emit mutation events. Direct writes corrupt parallel state.

Inline this protocol block verbatim inside every design-executor prompt in both the parallel-batch and sequential-tail spawns below. Concurrent executors (Phase 10.1 parallel mode) each emit `update_progress` calls; the lockfile (Plan 20-01) and event stream (Plan 20-06) serialize them safely.

## Step 2 — Wave-by-Wave Execution

For each Wave in order (Wave 1, Wave 2, ...):

### Parallel batch (if `parallel_mode=true` AND any `Parallel: true` tasks in wave)

Report the partition before spawning:

```
━━━ Wave [N] — parallel mode ━━━
Parallel batch ([N] tasks — spawning concurrently):
  [01] [type]: [scope] — touches: [files]
  [02] [type]: [scope] — touches: [files]

Sequential tail ([N] tasks):
  [03] [type]: [scope] — touches: [files]

Spawning agents now...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn ALL `Parallel: true` tasks in this wave as concurrent `Task()` calls in ONE response. Each call uses `isolation: "worktree"`:

```
Task("design-executor", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-PLAN.md
@.design/DESIGN-CONTEXT.md
@reference/[type-relevant].md
</required_reading>

You are the design-executor agent. Execute Task NN from DESIGN-PLAN.md.

Prompt context:
  task_id: NN
  task_type: [type]
  task_scope: [scope]
  task_acceptance_criteria:
    - [criterion 1]
    - [criterion 2]
  wave: N
  is_parallel: true
  auto_mode: [true|false]

Write .design/tasks/task-NN.md and make an atomic commit `feat(design-NN): [type] — [scope]`.

Emit `## EXECUTION COMPLETE` when done.
""", subagent_type="design-executor", isolation="worktree")
```

Wait for all parallel tasks to emit `## EXECUTION COMPLETE`.

**Merge worktrees** (preserved from v2.1.0 — do not redesign):

```
━━━ Parallel batch complete ━━━
[✓/⚠/✗] Task 01 — [type]
[✓/⚠/✗] Task 02 — [type]

Merging worktrees...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Merge each worktree branch back into the working directory. Each agent touched non-overlapping files (guaranteed by the conflict check on `Touches:` fields). If an unexpected merge conflict appears, flag it and ask the user to resolve before continuing.

After merge, roll up the batch's progress:

- Call `mcp__gdd_state__update_progress` with `task_progress: "<completed>/<total>"` and `status: "design_wave_<N>_parallel_batch_complete"`.
- Call `mcp__gdd_state__checkpoint` — records the wave boundary in `<timestamps>` and bumps `last_checkpoint`.

### Sequential tail (Parallel: false tasks, or all tasks if `parallel_mode=false`)

Announce each wave before starting:

```
━━━ Wave [N] — [N tasks] — sequential ━━━
Tasks:
  [01] [type]: [scope]
  [02] [type]: [scope]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Run one at a time. Same `Task("design-executor", ...)` pattern with `is_parallel: false` (no worktree isolation):

```
Task("design-executor", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-PLAN.md
@.design/DESIGN-CONTEXT.md
@reference/[type-relevant].md
</required_reading>

You are the design-executor agent. Execute Task NN from DESIGN-PLAN.md.

Prompt context:
  task_id: NN
  task_type: [type]
  task_scope: [scope]
  task_acceptance_criteria:
    - [criterion 1]
    - [criterion 2]
  wave: N
  is_parallel: false
  auto_mode: [true|false]

Write .design/tasks/task-NN.md and make an atomic commit `feat(design-NN): [type] — [scope]`.

Emit `## EXECUTION COMPLETE` when done.
""", subagent_type="design-executor")
```

After each task completes, call `mcp__gdd_state__update_progress` with the new `task_progress: "<completed>/<total>"` and `status: "design_wave_<N>_task_<NN>_complete"`.

After the final sequential task of the wave, call `mcp__gdd_state__checkpoint` — records the wave boundary in `<timestamps>` and bumps `last_checkpoint`.

---

## Step 3 — Wave Checkpoint

After each wave (unless `--auto` flag was passed):

```
━━━ Wave [N] complete ━━━
  ✓ [N] tasks complete
  ⚠ [N] deviations (see .design/tasks/ files)

Ready for Wave [N+1]? (yes / review first)
━━━━━━━━━━━━━━━━━━━━━━━
```

Skip checkpoint if `auto_mode=true`.

---

## Step 4 — Handle Deviations

After each wave, check task-NN.md files for `status: deviation`. If any found:

- Call `mcp__gdd_state__get` → read `state.blockers`; present affected task IDs and their blocker descriptions from the returned snapshot.
- Offer: (a) stop stage, (b) continue remaining tasks
- In `auto_mode`: continue automatically, log all deviations
- When a blocker is addressed (fix committed by a follow-up task), call `mcp__gdd_state__resolve_blocker` with the blocker id to clear it from the live state.

---

## State Update (exit)

1. Call `mcp__gdd_state__set_status` with `status: "design_complete"` — marks the stage completed without transitioning; verify calls `transition_stage` on its entry, keeping the transition atomic with the owning stage.
2. Call `mcp__gdd_state__checkpoint` — stamps `last_checkpoint` and appends a `design_completed_at` entry to `<timestamps>`.

---

## After Completion

Print summary:

```
━━━ Design stage complete ━━━
Tasks: [N] complete / [M] total
Deviations: [N]
Commits: [git log --oneline since stage start]

Next: /get-design-done:verify
  → Scores the result against baseline, checks must-haves,
    runs NNG heuristic evaluation, and identifies gaps.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Figma Write Dispatch (after design-executor completes)

After design-executor has finished and DESIGN-PLAN.md tasks are complete:

1. Read `figma:` status from `.design/STATE.md` `<connections>` (the unified remote MCP covers both reads and writes as of v1.0.7.1):
   - If `figma: not_configured` or `figma: unavailable` or absent → skip this block entirely (no prompt, no output)
   - If `figma: available` → proceed to step 2

2. Offer the user a prompt:
   ```
   figma write-back is available — propagate design decisions back to Figma?
   Modes: annotate (layer comments) | tokenize (variable bindings) | mappings (Code Connect)
   Run figma-write? (y/N):
   ```

3. If user answers "y" or "yes":
   - Ask which mode: annotate / tokenize / mappings (or all)
   - Spawn `design-figma-writer` agent with the selected mode
   - Pass `--dry-run` flag if user requests preview first

4. If user answers "n", "N", or no response: skip silently.

Note: This dispatch is always opt-in. The design stage never auto-runs figma-writer without user confirmation.

---

## DESIGN COMPLETE
