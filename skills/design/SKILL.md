---
name: design
description: "Stage 3 of the Ultimate Design pipeline. Reads DESIGN-PLAN.md and executes each task directly using embedded design knowledge from reference files — no sub-skill dependencies. Claude applies typography, color, accessibility, motion, and anti-pattern guidance directly to the codebase. --parallel spawns Wave 1 tasks as isolated concurrent agents. --wave N runs a single wave only."
argument-hint: "[--parallel] [--wave N]"
user-invocable: true
---

# Ultimate Design — Design

**Stage 3 of 4.** Reads `.design/DESIGN-PLAN.md`, executes tasks, writes `.design/DESIGN-SUMMARY.md`.

---

## Prerequisites

Read before anything else:
1. `.design/DESIGN-PLAN.md` — task list, waves, must-haves
2. `.design/DESIGN-CONTEXT.md` — brand, decisions, constraints
3. All files in `<canonical_refs>` from DESIGN-CONTEXT.md
4. All reference files listed in each task's `Reference files:` section

If DESIGN-PLAN.md doesn't exist:
> "No plan found. Run `/ultimate-design:plan` first."

If `--parallel` is passed but `parallel_ready: false` in DESIGN-PLAN.md header:
> "Plan was not created with --parallel. Re-run `/ultimate-design:plan --parallel` first."

Create `.design/tasks/` directory for per-task output files.

---

## Execution Mode

```
$ARGUMENTS contains --parallel?
  YES → Parallel mode (Wave 1 Parallel:true tasks run as concurrent Agents)
  NO  → Sequential mode (all tasks run one by one)

$ARGUMENTS contains --wave N?
  YES → Only run Wave N tasks, then stop
  NO  → Run all waves in order
```

---

## Design Execution Principles

For every task, before touching a single file:
1. Read all reference files listed in the task
2. Read all files the task will modify
3. Apply the specific guidance from each reference file

**What "execute a task" means:**
- For `audit` tasks: grep the codebase using patterns from reference/anti-patterns.md, document all violations, produce a findings list
- For `typography` tasks: read reference/typography.md, identify all non-compliant font values, apply the modular scale and hierarchy rules
- For `color` tasks: audit the palette against SLOP-01..08 patterns, fix semantic inconsistencies, replace AI-default colors
- For `accessibility` tasks: run through the WCAG checklist in reference/accessibility.md, fix each violation found
- For `motion` tasks: apply the 5-question decision framework from reference/motion.md to each animation
- For `copy` tasks: apply UX copy standards from reference/anti-patterns.md copy section
- For `polish` tasks: apply NNG heuristics from reference/heuristics.md, check visual hierarchy and Gestalt principles
- For `tokens` tasks: create CSS custom properties for all magic values, organize by role (color, spacing, typography, radius, shadow)
- For `component` tasks: build following all relevant reference guidelines simultaneously

**Decision authority:** When a task requires a design choice not covered by DESIGN-CONTEXT.md decisions, apply the reference file guidance and note the choice in the task output file. Do not stop to ask unless the choice is high-stakes and clearly contradicts existing context.

---

## Sequential Mode

For each wave, in order:

### 1. Announce the wave

```
━━━ Wave [N] — [N tasks] — sequential ━━━
Tasks:
  [01] [type]: [scope]
  [02] [type]: [scope]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. For each task

**a.** Read every file in the task's `Reference files:` and `Touches:` list.

**b.** Apply the task type's execution approach (see Design Execution Principles above).

**c.** Make the actual code changes. Edit files directly.

**d.** Verify acceptance criteria from the task plan. Mark each pass/fail.

**e.** Write `.design/tasks/task-NN.md`:

```markdown
---
task: NN
type: [audit | typography | color | ...]
status: complete | deviation
---

## What was done
[2–4 sentences describing the actual changes made]

## Files changed
- [path]: [what changed]

## Acceptance criteria
- [✓/✗] [criterion from plan]
- [✓/✗] [criterion from plan]

## Design choices made
[Any choices made beyond what was specified in DESIGN-CONTEXT.md decisions]

## Deviations (if any)
[What couldn't be done and why, or "none"]
```

### 3. Between waves — checkpoint

```
━━━ Wave [N] complete ━━━
  ✓ [N] tasks complete
  ⚠ [N] deviations (see task files)

Ready for Wave [N+1]? (yes / review first)
━━━━━━━━━━━━━━━━━━━━━━━
```

Skip checkpoint if `--auto` flag was used at any stage (check for `.design/auto-mode` marker file).

---

## Parallel Mode (--parallel)

Only Wave 1 runs in parallel. Wave 2+ always runs sequentially.

### Step 1 — Pre-flight partition

Read every Wave 1 task's `Parallel:` and `Touches:` fields from DESIGN-PLAN.md.

| Partition | Condition | Execution |
|---|---|---|
| **Parallel batch** | `Parallel: true` | Spawn as concurrent Agent instances |
| **Sequential tail** | `Parallel: false` (file conflict) | Run after parallel batch completes |

Report partition before spawning:

```
━━━ Wave 1 — parallel mode ━━━
Parallel batch ([N] tasks — spawning concurrently):
  [01] [type]: [scope] — touches: [files]
  [02] [type]: [scope] — touches: [files]

Sequential tail ([N] tasks — conflict):
  [03] [type]: [scope] — touches: [files] ← conflicts with Task [XX]

Spawning agents now...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 2 — Spawn all parallel agents in one message

Send ALL parallel-batch agent calls in a SINGLE response so they run concurrently. Each Agent call uses `isolation: "worktree"`.

Each agent prompt must be fully self-contained (the agent has no session memory):

```
You are executing a single design task as part of the Ultimate Design pipeline.
No sub-skills are needed — you apply design changes directly to the codebase.

== TASK ==
Task: [NN] — [Task Name]
Type: [task type]
Scope: [exact task scope]

Action:
[verbatim Action field from DESIGN-PLAN.md]

== DESIGN CONTEXT ==
Project: [name]
Brand direction: [one sentence]
Tone: [word] · [word] · [word]
NOT: [what to avoid]

Locked decisions relevant to this task:
  [D-XX]: [decision]
  [D-XX]: [decision]

== REFERENCE FILES TO READ ==
Read these files before making any changes:
  [list from task Reference files — full paths]

== FILES TO MODIFY ==
This task touches:
  [list from task Touches field]

Read these files first, then apply changes.

== ACCEPTANCE CRITERIA ==
  - [criterion]
  - [criterion]

== OUTPUT REQUIRED ==
After completing the task, write results to: .design/tasks/task-[NN].md

Format:
---
task: NN
type: [type]
status: complete | deviation
---

## What was done
[2–4 sentences]

## Files changed
- [path]: [what changed]

## Acceptance criteria
- [✓/✗] [criterion]

## Design choices made
[choices beyond what was specified, or "none beyond plan"]

## Deviations
[what couldn't be done and why, or "none"]

Do NOT write to DESIGN-SUMMARY.md. The orchestrator merges task files after you complete.
Apply design changes now. Use Read, Edit, Grep, Glob, and Bash tools as needed.
```

### Step 3 — Wait, then merge

After all parallel agents complete:

```
━━━ Parallel batch complete ━━━
[✓/⚠/✗] Task 01 — [type]
[✓/⚠/✗] Task 02 — [type]
[✓/⚠/✗] Task 03 — [type]

Merging worktrees...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Merge each worktree branch back into the working directory. Each agent touched non-overlapping files (guaranteed by the conflict check). If an unexpected merge conflict appears, flag it and ask the user to resolve before continuing.

### Step 4 — Run sequential tail

After the parallel batch is merged, run any `Parallel: false` tasks using sequential mode.

### Step 5 — Wave checkpoint

Same as Sequential Mode — show summary and ask go/no-go before Wave 2.

---

## Typography Task — Execution Guide

Read `reference/typography.md` before starting.

1. **Identify current state**: grep all font-size values in the codebase. List every unique value.
2. **Design the target scale**: from the `<decisions>` in DESIGN-CONTEXT.md, pick the modular ratio (default: 1.25, base 16px). Compute: 12/14/16/20/24/30/36/48px (or `text-xs` through `text-5xl` in Tailwind).
3. **Map old → new**: for each non-scale value, determine the closest scale value that maintains intent.
4. **Apply line-height**: body text 1.5–1.75, headings 1.1–1.3, captions 1.4.
5. **Apply weight hierarchy**: headings 600–700, body 400, labels 500, never 300 on < 16px.
6. **Check font family**: if using a reflex font without a brand reason, note as a recommendation (do not change unless explicitly tasked).

---

## Color Task — Execution Guide

Read `reference/anti-patterns.md` SLOP-01..08 and BAN-01..09 before starting.

1. **Audit palette**: grep all color values (#hex, rgb(), oklch(), etc.) from CSS/tokens. List every unique color.
2. **Check for AI-slop palette**: does the codebase contain #6366f1, #8b5cf6, #06b6d4? If yes, these are BAN violations.
3. **Check semantic consistency**: is red used ONLY for error/danger? Is green ONLY for success? Document violations.
4. **Check dark mode**: if dark mode exists, is the background pure black? Replace with oklch(14% 0.005 [hue]).
5. **Apply from DESIGN-CONTEXT.md decisions**: D-XX entries about color → implement them.
6. **Introduce token layer if not present**: CSS custom properties with semantic names (`--color-primary`, `--color-danger`, `--color-text-muted`).

---

## Accessibility Task — Execution Guide

Read `reference/accessibility.md` before starting.

Work through the accessibility checklist:

**Contrast (auto-check):**
- Read all color values used for text and their backgrounds
- Calculate contrast ratio: `(L1 + 0.05) / (L2 + 0.05)` where L = `0.2126*R + 0.7152*G + 0.0722*B` (linearized)
- Flag any body text < 4.5:1 or large text < 3:1

**Focus rings:**
- grep for `:focus` without `:focus-visible`
- grep for `outline: none` without replacement
- Add: `:focus-visible { outline: 2px solid var(--color-focus-ring, #2563eb); outline-offset: 2px; }`

**Semantic structure:**
- grep for `div onClick` and flag for conversion to `<button>`
- Check for form inputs without associated `<label>`
- Check for icon-only buttons without `aria-label`

**Touch targets:**
- grep for interactive elements with explicit px sizing < 44px

**prefers-reduced-motion:**
- grep for CSS animations/transitions
- Verify `@media (prefers-reduced-motion: reduce)` block exists

---

## Motion Task — Execution Guide

Read `reference/motion.md` before starting.

Apply the 5-question framework to every animation/transition in scope:

1. **Should this animate at all?** Check frequency table. Keyboard-initiated actions = never.
2. **What purpose does it serve?** If none from the valid list → remove.
3. **Is the easing correct?** Enter = ease-out, exit = ease-in, transition = ease-in-out. Bounce/elastic = BAN.
4. **Is the duration correct?** Micro 80–150ms, enter/exit 150–250ms, never > 400ms.
5. **Is it only transform + opacity?** Width/height/top/left animations = fix.

Also: verify `prefers-reduced-motion` is implemented (global CSS block).
Also: verify exit animations are 60–70% of enter duration.

---

## Output: DESIGN-SUMMARY.md

After all waves complete, merge all `.design/tasks/task-NN.md` into `.design/DESIGN-SUMMARY.md`:

```markdown
---
project: [name]
created: [ISO 8601]
status: complete | partial
mode: sequential | parallel
waves_run: [N]
tasks_complete: [N]
tasks_total: [N]
deviations: [N]
---

## Wave 1

### Task 01 — [Task Name]
Type: [type]
Status: ✓ complete | ⚠ deviation | ✗ skipped

**What was done:**
[from task file]

**Files changed:**
- [path]: [what changed]

**Acceptance criteria:**
- [✓/✗] [criterion]

**Design choices made:**
[from task file, or "none beyond plan"]

---

[repeat for each task]

---

## Deviations

[Aggregated list of all deviations across tasks with task references]

---

## All Files Modified

[Complete deduplicated list of every file changed across all tasks]

---

## Must-Have Readiness

[For each must-have from DESIGN-PLAN.md, indicate: likely met / not verified / known gap]
```

---

## After Completion

```
━━━ Design stage complete ━━━
Saved: .design/DESIGN-SUMMARY.md
Mode: [sequential | parallel]
Tasks: [N] complete / [M] total
Deviations: [N]
Files modified: [N]

Next: /ultimate-design:verify
  → Scores the result against baseline, checks must-haves,
    runs NNG heuristic evaluation, and identifies gaps.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
