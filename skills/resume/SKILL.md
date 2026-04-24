---
name: gdd-resume
description: "Restore session context from a numbered checkpoint. Lists available checkpoints when no argument given."
argument-hint: "[<N>]"
tools: Read, Write, Bash, Glob, AskUserQuestion
---

@reference/retrieval-contract.md
@reference/cycle-handoff-preamble.md

# /gdd:resume

Inverse of `/gdd:pause`. Reads a checkpoint file, prints a clear "you were here" summary, and routes to the next command.

## Steps

1. **Parse argument**:
   - If argument is a number N → restore checkpoint N.
   - If no argument → list available checkpoints and ask which to restore (see step 2).

2. **List mode** (no argument):
   ```bash
   ls .design/checkpoints/ 2>/dev/null | sort -n
   ```
   If empty, fall back to reading `.design/HANDOFF.md` (legacy single-slot format).
   If checkpoints exist, present the list and ask (AskUserQuestion):
   "Which checkpoint would you like to restore? (enter number, or press Enter for the latest)"
   Use the answer (or latest if Enter pressed) as N.

3. **Read checkpoint**: load `.design/checkpoints/NN-*.md`. If not found, try `.design/HANDOFF.md` as legacy fallback.

4. **Print summary** in this exact shape:
   ```
   Checkpoint NN restored.
   Saved: <timestamp>
   You were: <in-progress description>
   Next step: <next>
   Active sketch: <path or none>
   Open todos: <N>
   ```

5. **Staleness check**: compare mtime of `.design/` artifacts vs `src/` via Bash `stat` when available. If `src/` has commits newer than the checkpoint timestamp, warn:
   "Source has changed since checkpoint NN — consider re-running explore or verify."

6. **Route recommendation** based on checkpoint `Stage:` field:
   - `brief` → "Run `/gdd:brief`"
   - `explore` → "Run `/gdd:explore`"
   - `plan` → "Run `/gdd:plan`"
   - `design` → "Run `/gdd:design` to continue"
   - `verify` → "Run `/gdd:verify`"

## Do Not

- Do not delete checkpoint files.
- Do not modify STATE.md.
- Do not auto-execute the next command — just recommend.

## RESUME COMPLETE
