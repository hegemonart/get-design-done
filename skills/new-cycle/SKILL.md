---
name: hone-new-cycle
description: "Start a new design cycle. Creates cycle scope in STATE.md, initializes .design/CYCLES.md entry. Each cycle has its own goal and tracks its own decisions/tasks/pipeline runs."
argument-hint: "[<goal>]"
tools: Read, Write, AskUserQuestion
---

# /hone:new-cycle

The cycle is the hierarchical unit above individual pipeline runs: **Cycle > Pipeline run > Wave > Task**. Each cycle has a goal, tracks its own decisions, and can span many pipeline runs. `/hone:complete-cycle` closes the cycle once goals are met and a retrospective is captured.

## Steps

1. Read `.design/STATE.md`. If `cycle:` field is populated and no `complete` flag, ask: "Cycle <N> is active. End it first with `/hone:complete-cycle`?" Abort if user declines.
2. If no goal was passed as an argument, ask (AskUserQuestion): "What is the goal for this design cycle? (e.g., 'Redesign the checkout flow', 'Improve dashboard accessibility')"
3. Generate cycle ID: read `.design/CYCLES.md` if present, find the max `cycle-N`, increment. If CYCLES.md is missing, start at `cycle-1`.
4. Update `.design/STATE.md` frontmatter: set `cycle: cycle-N`.
5. Create or append to `.design/CYCLES.md`:

   ```markdown
   ## cycle-N: <goal>
   **Started**: <date>
   **Status**: active
   **Goal**: <goal>
   **Pipeline runs**: 0
   **Decisions made**: 0
   ```

6. Reset the `<decisions>` section in STATE.md for the new cycle. Preserve prior decisions by prepending a comment marker `<!-- prior cycle decisions archived in CYCLES.md -->`.
7. Print: "Cycle cycle-N started. Run `@get-design-done brief` or `@get-design-done explore` to begin."

## Do Not

- Do not archive prior artifacts here - that's `/hone:complete-cycle`.
- Do not overwrite the existing CYCLES.md - append only.

## NEW-CYCLE COMPLETE
