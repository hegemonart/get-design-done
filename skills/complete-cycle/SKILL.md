---
name: gdd-complete-cycle
description: "Archive current cycle artifacts and prepare for the next cycle. Updates CYCLES.md, moves artifacts to .design/archive/cycle-N/."
argument-hint: "[<retrospective note>]"
tools: Read, Write, Bash, AskUserQuestion
---

# /gdd:complete-cycle

Closes the current cycle: marks CYCLES.md entry complete, archives pipeline artifacts, and clears STATE.md for the next cycle.

## Steps

1. **Load state**: Read `.design/STATE.md` for the active `cycle:` ID. If empty/missing, error: "No active cycle — nothing to complete."
2. **Retrospective**: If no argument was passed, ask (AskUserQuestion): "Is cycle <N> complete? Briefly describe what was achieved." Capture for CYCLES.md.
3. **Update CYCLES.md**: Find the current cycle entry, change `**Status**: active` to `**Status**: complete`, append a `**Retrospective**: <note>` line and `**Ended**: <date>`.
4. **Archive artifacts**: Create `.design/archive/cycle-N/` via Bash `mkdir -p`. Copy these files into it (if present):
   - `DESIGN.md`
   - `DESIGN-PLAN.md`
   - `DESIGN-CONTEXT.md`
   - `DESIGN-VERIFICATION.md`
   - `DESIGN-AUDIT.md`
   - `DESIGN-SUMMARY.md`
   Mark originals with a `<!-- archived to .design/archive/cycle-N/ -->` note at top (do not delete — next cycle will overwrite).
5. **Clear STATE.md**: Set `cycle:` to empty string, reset `<decisions>` to a fresh empty section, reset `stage:` to `brief`.
6. Print: "Cycle <N> archived. Run `/gdd:new-cycle` to start the next cycle."

## Do Not

- Do not delete source files in `src/` — only archive `.design/` artifacts.
- Do not auto-start a new cycle — user invokes `/gdd:new-cycle` explicitly.

## Step 6 — Update notice (post-closeout surface)

After the archive has been written and STATE.md has been cleared for the next cycle, emit the plugin-update banner if one is present:

```bash
[ -f .design/update-available.md ] && cat .design/update-available.md
```

Written by `hooks/update-check.sh`; suppressed mid-pipeline and when the latest release is dismissed.

## COMPLETE-CYCLE COMPLETE
