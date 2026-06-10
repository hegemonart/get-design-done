---
name: gdd-quick
description: "Run the pipeline with optional agents skipped for speed. Skips: phase-researcher, design-assumptions-analyzer, design-integration-checker. Keeps: planner, executor, verifier, auditor. Activates for requests involving a lightweight design pass, a fast iteration, or a quick low-ceremony change."
argument-hint: "[--skip <agent-name>] [stage]"
tools: Read, Task
disable-model-invocation: true
---

# /gdd:quick

Fast pipeline run. Skips optional-quality agents for speed while keeping the core decision chain (planner → executor → verifier → auditor) intact.

## Default skipped agents

- `design-phase-researcher` - no external research step
- `design-assumptions-analyzer` - no assumption surfacing
- `design-integration-checker` - skipped (verifier still runs)

## Default kept agents

- `design-planner`, `design-executor`, `design-verifier`, `design-auditor`

## Steps

1. Parse args:
   - Optional stage name (defaults to full pipeline from the current STATE.md position).
   - `--skip <agent-name>` (repeatable) adds to the skip list.
2. Read `.design/STATE.md` to determine entry stage if none was passed.
3. For each stage to execute, invoke the stage skill but spawn it with the optional agents in the effective skip list **omitted from the spawn graph** - this skill is the orchestrator, so it simply does not call those agents (the stage skills do not read a `quick_mode` flag; the skipping happens here, by not spawning them). The kept agents run exactly as in the full pipeline.
4. After each stage, print: "Stage <name> done. Skipped: <list>."
5. Final summary prints which agents were skipped across the full run.

Mechanism note: `/gdd:quick` is a lighter-touch *invocation* of the normal stages, not a special stage mode. It reduces ceremony by leaving the listed optional-quality agents out of the spawn graph it orchestrates. There is no flag the stage skills parse - if invoked directly (not via this skill) the stages run their full agent set.

## Use When

- You trust the problem scope (no need for fresh research).
- The project has a mature DESIGN-CONTEXT.md (assumptions already surfaced).
- You want verify + audit coverage without integration-checker overhead.

## Do Not Use When

- First pipeline run in a new project - use the full pipeline.
- Large or cross-cutting changes - skip risks are higher.

## QUICK COMPLETE
