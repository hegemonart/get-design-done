---
name: design
description: "Stage 4 of 5 — reads DESIGN-PLAN.md, spawns design-executor per task with wave coordination and parallel/sequential routing. Thin orchestrator."
argument-hint: "[--auto] [--parallel]"
user-invocable: true
---

# Get Design Done — Design

**Stage 4 of 5** in the get-design-done pipeline. Thin orchestrator. All design execution intelligence lives in `agents/design-executor.md`.

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
4. Write `<parallelism_decision>` to STATE.md per wave (stage: design, wave: N).
5. If `parallel`: spawn all candidates via concurrent `Task()` calls in one response. If `serial`: spawn sequentially.

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

### Figma Write Dispatch (after design-executor completes)

After design-executor has finished and DESIGN-PLAN.md tasks are complete:

1. Read `figma_writer:` status from `.design/STATE.md` `<connections>`:
   - If `figma_writer: not_configured` or absent → skip this block entirely (no prompt, no output)
   - If `figma_writer: available` → proceed to step 2

2. Offer the user a prompt:
   ```
   figma-writer is available — propagate design decisions back to Figma?
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
