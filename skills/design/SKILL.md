---
name: design
description: "Stage 3 of 4 — reads DESIGN-PLAN.md, spawns design-executor per task with wave coordination and parallel/sequential routing. Thin orchestrator."
argument-hint: "[--auto] [--parallel]"
user-invocable: true
---

# Ultimate Design — Design

**Stage 3 of 4.** Thin orchestrator. All design execution intelligence lives in `agents/design-executor.md`.

---

## State Integration

1. Read `.design/STATE.md`.
   - **If missing:** create minimal skeleton from `reference/STATE-TEMPLATE.md` with `stage: design`, `status: in_progress`; log warning: "STATE.md not found — creating from template. Prior stage outputs may be incomplete."
   - **If present and `stage == design` and `status == in_progress`:** RESUME — use `task_progress` numerator as source of truth; skip tasks that already have a corresponding `.design/tasks/task-NN.md` file.
   - **Otherwise:** normal transition — set `stage: design`, `status: in_progress`.
2. Probe `<connections>`, update `last_checkpoint`, write STATE.md.

Abort only if `.design/DESIGN-PLAN.md` is missing:
> "No plan found. Run `/get-design-done:plan` first."

---

## Flag Parsing

- `--auto` → `auto_mode=true` (no mid-stage prompts; architectural deviations still stop the individual task but continue with remaining tasks)
- `--parallel` → `parallel_mode=true` (use worktree isolation for `Parallel: true` tasks)

---

## Step 1 — Parse DESIGN-PLAN.md

Read `.design/DESIGN-PLAN.md`. Partition tasks by `## Wave N` heading. Within each wave, partition by `Parallel: true` vs `Parallel: false`. Compute `total_tasks` for `task_progress` denominator.

If resuming: skip tasks where `.design/tasks/task-NN.md` already exists.

---

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

Update STATE.md `task_progress` after merge.

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

Update STATE.md `task_progress` after each task completes.

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

- Present affected task IDs and their blocker descriptions (from `.design/STATE.md <blockers>`)
- Offer: (a) stop stage, (b) continue remaining tasks
- In `auto_mode`: continue automatically, log all deviations

---

## State Update (exit)

1. Set `<position> status: completed`, `stage: design`.
2. Set `<timestamps> design_completed_at: [now ISO 8601]`.
3. Write STATE.md.

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

## DESIGN COMPLETE
