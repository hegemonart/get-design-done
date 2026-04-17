---
name: plan
description: "Stage 2 of the Ultimate Design pipeline. Reads DESIGN-CONTEXT.md and decomposes the design work into a wave-ordered task plan that Claude executes directly — no sub-skill dependencies. Each task maps to a design domain with specific reference files and acceptance criteria. Use --auto to skip confirmation. Use --parallel to enable parallel execution metadata."
argument-hint: "[--auto] [--parallel]"
user-invocable: true
---

# Ultimate Design — Plan

**Stage 2 of 4.** Reads `.design/DESIGN-CONTEXT.md`, writes `.design/DESIGN-PLAN.md`.

---

## Prerequisites

Read these first:
1. `.design/DESIGN-CONTEXT.md` — decisions, goals, must-haves, baseline audit
2. All files listed in `<canonical_refs>` from DESIGN-CONTEXT.md
3. `${CLAUDE_PLUGIN_ROOT}/reference/audit-scoring.md` — to understand what task types map to which scoring categories

If DESIGN-CONTEXT.md doesn't exist:
> "No discovery context found. Run `/ultimate-design:discover` first."

---

## Task Type Reference

Each task maps to a domain with specific reference files. Claude executes the task directly — no sub-skills required.

| Task type | Domain | Reference files to include in task |
|---|---|---|
| `audit` | Find existing violations | reference/audit-scoring.md, reference/anti-patterns.md |
| `typography` | Fix type scale, weights, line-heights | reference/typography.md |
| `color` | Fix palette, semantic roles, dark mode | reference/anti-patterns.md (SLOP-01..08) |
| `layout` | Fix spacing grid, alignment, max-widths | reference/anti-patterns.md (layout section) |
| `accessibility` | Fix contrast, focus rings, semantics, ARIA | reference/accessibility.md |
| `motion` | Fix animations, easing, reduced-motion | reference/motion.md |
| `copy` | Fix button labels, errors, empty states, placeholders | reference/anti-patterns.md (copy section) |
| `polish` | Final coherence pass — visual consistency, hierarchy | reference/heuristics.md, reference/audit-scoring.md |
| `tokens` | Introduce or clean up design token layer | reference/typography.md, reference/anti-patterns.md |
| `component` | Build or rebuild a specific component | All reference files relevant to component's concerns |

---

## Planning Logic

### Step 1 — Derive task list

From `<domain>`, `<goals>`, `<baseline_audit>`, and `<decisions>` in DESIGN-CONTEXT.md, identify all discrete design tasks needed.

Rules for task granularity:
- One task = one focused area of design work that can be verified independently
- Tasks that touch different files can potentially run in parallel
- Tasks that depend on each other's output must be sequential

**Always include:**
- An `audit` task at the start of Wave 1 if `<baseline_audit>` shows Anti-Pattern violations (this finds all violations to fix)
- An `accessibility` task if baseline Accessibility score < 8
- A `polish` task in the final wave for visual coherence review

**Derive from goals:**
- Each G-XX from DESIGN-CONTEXT.md should map to at least one task
- Each D-XX decision from DESIGN-CONTEXT.md should map to at least one task

**Derive from baseline audit:**
- For each scoring category with score < 7, add a task for that category

### Step 2 — Wave assignment

| Wave | Rule |
|---|---|
| Wave 1 | Tasks with no dependencies on other tasks in this plan |
| Wave 2 | Tasks that need Wave 1 output (e.g., polish after typography/color; handoff after final design) |
| Wave 3+ | Rarely needed — only if Wave 2 creates outputs that Wave 3 depends on |

Most plans are 2 waves: fix-pass in Wave 1, polish/verify-prep in Wave 2.

### Step 3 — Parallel analysis (only if `--parallel`)

For each Wave 1 task, list every file it will touch (`Touches:` field). Two tasks conflict if their `Touches:` sets overlap. Conflicting tasks are `Parallel: false` and go into the "sequential tail" — they run after the parallel batch completes.

**Conflict detection:**
- `audit` task: reads everything, writes to `.design/tasks/` only — no conflict with other tasks
- `typography` task: touches CSS/token files, any TSX with hardcoded font sizes
- `color` task: touches CSS/token files — may conflict with typography if both touch the same token file
- `accessibility` task: touches components with focus/ARIA issues
- `motion` task: touches CSS animation definitions
- `copy` task: touches component JSX/TSX (button labels, error messages, empty states)

If two tasks both touch `src/styles/tokens.css`, one must be `Parallel: false`.

### Step 4 — Build acceptance criteria

For each task, write 2–4 acceptance criteria. These are:
- Observable design outcomes, not process steps
- Verifiable by reading code or visual inspection
- Tied back to must-haves or goals from DESIGN-CONTEXT.md

Examples:
- ✓ "All body text has contrast ratio ≥ 4.5:1 against background"
- ✓ "No `transition: all` remaining in stylesheet"
- ✓ "Font sizes use only values from the modular scale: 12/14/16/18/20/24/30/36px"
- ✗ "Run the accessibility audit" (process, not outcome)
- ✗ "Fix the typography" (not specific)

---

## Present Plan for Approval

Before writing, show the user:

```
━━━ Design Plan ━━━
[N] tasks across [W] waves

Wave 1 ([parallel/sequential]):
  [01] [task-type] — [scope description]
  [02] [task-type] — [scope description]
  [03] [task-type] — [scope description]

Wave 2:
  [04] [task-type] — [scope description]

Must-haves (carried from Discovery):
  • M-01: [must-have]
  • M-02: [...]

New must-haves from plan:
  • M-0N: [plan-specific verifiable outcome]

Reference files each task will use:
  [01]: reference/anti-patterns.md, reference/audit-scoring.md
  [02]: reference/typography.md
  ...

Does this scope look right? Adjust before I write the plan.
━━━━━━━━━━━━━━━━━━━━━
```

If `--auto`, skip approval and write immediately.

---

## Output: DESIGN-PLAN.md

Write `.design/DESIGN-PLAN.md`:

```markdown
---
project: [name]
created: [ISO 8601]
waves: [N]
context: .design/DESIGN-CONTEXT.md
parallel_ready: true | false
---

## Wave 1

### Task 01 — [Task Name]
Type: [audit | typography | color | layout | accessibility | motion | copy | polish | tokens | component]
Scope: [Exactly what this task covers — specific components, files, CSS properties, etc.]
Touches: [comma-separated list of files/dirs this task will read AND write]
Parallel: true | false    # only present when planned with --parallel
Conflict: [only if Parallel: false — name the other task(s) that share touched files]

Reference files:
  - ${CLAUDE_PLUGIN_ROOT}/reference/[relevant-file].md
  - .design/DESIGN-CONTEXT.md (decisions: [D-XX list])
  - [canonical_refs files relevant to this task]

Action: |
  [Concrete, specific instruction for what Claude should do.
  Written so that a future Claude agent with no session memory can execute it.
  Include: what to look for, what to change, what the end state should be.
  Reference specific decisions from DESIGN-CONTEXT.md by D-XX code.]

Acceptance criteria:
  - [Verifiable design outcome]
  - [Second verifiable outcome]
  - [Third if needed]

---

### Task 02 — [Task Name]
[same structure]

---

## Wave 2

### Task 03 — [Task Name]
Depends on: Task 01, Task 02
[same structure]

---

## Must-Haves (checked during Verify)

- M-01: [Observable outcome from DESIGN-CONTEXT.md]
- M-02: [...]
- M-0N: [Plan-specific must-have]

---

## Deferred

[Tasks discussed but explicitly descoped from this plan. With reason.]
```

---

## After Writing

```
━━━ Plan complete ━━━
Saved: .design/DESIGN-PLAN.md
Tasks: [N] across [W] waves
[if --parallel]: Parallel batch: [N] tasks / Sequential tail: [N] tasks

Next: /ultimate-design:design
  → Executes each task directly using embedded design knowledge.
  → Add --parallel to run Wave 1 tasks concurrently.
━━━━━━━━━━━━━━━━━━━━
```

Do not start design work automatically unless the user says "go" or `--auto` was passed.
