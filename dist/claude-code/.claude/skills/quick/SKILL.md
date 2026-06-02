---
name: gdd-quick
description: "Run the pipeline with optional agents skipped for speed. Skips: phase-researcher, design-assumptions-analyzer, design-integration-checker. Keeps: planner, executor, verifier, auditor."
argument-hint: "[--skip <agent-name>] [stage]"
tools: Read, Task
disable-model-invocation: true
---

# /gdd:quick

Fast pipeline run. Skips optional-quality agents for speed while keeping the core decision chain (planner → executor → verifier → auditor) intact.

## Default skipped agents

- `design-phase-researcher` — no external research step
- `design-assumptions-analyzer` — no assumption surfacing
- `design-integration-checker` — skipped (verifier still runs)

## Default kept agents

- `design-planner`, `design-executor`, `design-verifier`, `design-auditor`

## Steps

1. Parse args:
   - Optional stage name (defaults to full pipeline from the current STATE.md position).
   - `--skip <agent-name>` (repeatable) adds to the skip list.
2. Read `.design/STATE.md` to determine entry stage if none was passed.
3. For each stage to execute, spawn the stage skill with a `quick_mode: true` flag and the effective skip list in the spawn context. Stage skills read this flag and route around the listed agents.
4. After each stage, print: "Stage <name> done. Skipped: <list>."
5. Final summary prints which agents were skipped across the full run.

## Use When

- You trust the problem scope (no need for fresh research).
- The project has a mature DESIGN-CONTEXT.md (assumptions already surfaced).
- You want verify + audit coverage without integration-checker overhead.

## Do Not Use When

- First pipeline run in a new project — use the full pipeline.
- Large or cross-cutting changes — skip risks are higher.

## QUICK COMPLETE
