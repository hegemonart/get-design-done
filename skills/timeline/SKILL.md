---
name: gdd-timeline
description: "Narrative retrospective across cycles: reads EXPERIENCE.md files and git log to produce a timeline view."
argument-hint: "[<cycle-N> | <from>-<to> | all]"
tools: Read, Bash, Glob
---

@reference/retrieval-contract.md
@reference/cycle-handoff-preamble.md

# /gdd:timeline

Generates a narrative retrospective across one or more completed cycles by reading `.design/archive/cycle-N/EXPERIENCE.md` files and correlating with `git log`.

## Steps

1. **Parse argument**: accepted forms:
   - `cycle-N` or `N` — single cycle
   - `N-M` — inclusive range
   - `all` or no argument — all archived cycles

2. **Discover archives**: glob `.design/archive/cycle-*/EXPERIENCE.md`. Sort by cycle number. Filter to requested range.

3. **For each cycle archive**:
   a. Read `EXPERIENCE.md` — extract sections: Goal, Decisions made, Learnings graduated, What died, Handoff to next cycle.
   b. Read `DESIGN-SUMMARY.md` (if present) for shipped artifacts list.
   c. Run:
      ```bash
      git log --oneline --after="<cycle start date>" --before="<cycle end date>" -- .design/ 2>/dev/null | head -10
      ```
      to correlate with commits. Use dates from `EXPERIENCE.md` Opened/Ended headers if present.

4. **Print timeline** in this shape:

   ```
   ## Timeline: Cycle 1 → Cycle 3

   ---

   ### Cycle 1 — <goal headline>

   **Opened with**: <first meaningful action>
   **Key decisions**: <D-XX summary>, <D-XX summary>
   **Surprises**: <what was unexpected>
   **What we'd do differently**: <retrospective note>
   **Shipped**: <artifact list or "see DESIGN-SUMMARY.md">

   ---

   ### Cycle 2 — <goal headline>
   ...
   ```

5. **No archives found**: print
   ```
   No archived cycles found in .design/archive/.
   Complete a cycle first with /gdd:complete-cycle.
   ```

## Do Not

- Do not modify any file.
- Do not run git commands that write or stage (only `git log` for read).

## TIMELINE COMPLETE
