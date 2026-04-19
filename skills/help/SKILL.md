---
name: gdd-help
description: "Lists all available get-design-done commands with one-line descriptions"
tools: Read
---

# Get Design Done — Help

**Role:** Print a formatted reference of all `/gdd:` commands, grouped by purpose.

---

## Output

Print the following table:

```
━━━ Get Design Done — Command Reference ━━━

Pipeline stages (run in order):
  brief              Stage 1 — capture problem statement, audience, constraints → BRIEF.md
  explore            Stage 2 — inventory scan + design context interview → DESIGN.md, DESIGN-DEBT.md, DESIGN-CONTEXT.md
  plan               Stage 3 — decompose into executable tasks → DESIGN-PLAN.md
  design             Stage 4 — execute tasks with wave coordination → DESIGN-SUMMARY.md
  verify             Stage 5 — audit, verify, score → DESIGN-VERIFICATION.md

Standalone analysis:
  style [Component]  Generate component handoff doc → DESIGN-STYLE-[Name].md
  darkmode           Audit dark mode architecture + contrast → DARKMODE-AUDIT.md
  compare            Delta between baseline and verification → COMPARE-REPORT.md

Ergonomics:
  next               Route to the next pipeline stage based on STATE.md
  help               This reference
  progress           Show current pipeline state
  health             Health check of .design/ artifacts
  quick              Fast pass through the whole pipeline
  fast               Aggressive speed mode

Exploration:
  discuss            Open discussion thread with design-discussant agent
  list-assumptions   Print active D-XX decisions from STATE.md
  sketch             Open a design sketch scratchpad
  sketch-wrap-up     Close sketch and merge learnings
  spike              Time-boxed exploratory spike
  spike-wrap-up      Close spike and capture outcomes
  map                Map the codebase structure
  audit              Run audit-only pass

Maintenance:
  note               Record a quick note to STATE.md
  plant-seed         Record an idea for later
  add-backlog        Append item to backlog
  review-backlog     Review pending backlog
  todo               List/manage design TODOs
  stats              Print pipeline stats
  settings           View/edit plugin settings
  update             Update the plugin
  reapply-patches    Reapply any pending patches
  debug              Enter systematic debugging mode
  undo               Revert the last stage action

Lifecycle:
  new-project        Initialize STATE.md + .design/ directory
  new-cycle          Start a new design cycle on an existing project
  complete-cycle     Archive the current cycle
  pause              Pause work and save context
  resume             Resume paused work
  do                 Execute a specific task
  ship               Create PR from completed work
  pr-branch          Create/switch PR branch

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Update notice (safe-window surface)

After the command reference, emit the plugin-update banner if one is present:

```bash
[ -f .design/update-available.md ] && cat .design/update-available.md
```

Written by `hooks/update-check.sh`; suppressed mid-pipeline and when the latest release is dismissed.

## HELP COMPLETE
