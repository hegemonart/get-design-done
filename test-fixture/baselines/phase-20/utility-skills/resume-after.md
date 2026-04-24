---
name: gdd-resume
description: "Restore session context from a numbered checkpoint. Lists available checkpoints when no argument given."
argument-hint: "[<N>]"
tools: Read, Write, Bash, Glob, AskUserQuestion, mcp__gdd_state__get, mcp__gdd_state__set_status, mcp__gdd_state__resolve_blocker, mcp__gdd_state__checkpoint
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

4. **Check paused status via MCP**: call `mcp__gdd_state__get` and inspect `status`. If it does **not** start with `paused:`, print "No pause to resume" and exit — the prior session was not paused via `/gdd:pause`, so there is nothing to restore.

5. **Restore prior status via MCP**: parse the prior status from the `paused:<prior>` prefix. Call `mcp__gdd_state__set_status` with `status: <prior>` to restore the pre-pause state.

6. **Clear the pause blocker**: optionally call `mcp__gdd_state__resolve_blocker` to clear the pause-related blocker (match by text containing "paused"). Skip if no such blocker exists.

7. **Stamp last_checkpoint via MCP**: call `mcp__gdd_state__checkpoint`.

8. **Print summary** in this exact shape:
   ```
   Checkpoint NN restored.
   Saved: <timestamp>
   You were: <in-progress description>
   Next step: <next>
   Active sketch: <path or none>
   Open todos: <N>
   ```

9. **Staleness check**: compare mtime of `.design/` artifacts vs `src/` via Bash `stat` when available. If `src/` has commits newer than the checkpoint timestamp, warn:
   "Source has changed since checkpoint NN — consider re-running explore or verify."

10. **Route recommendation** based on checkpoint `Stage:` field:
    - `brief` → "Run `/gdd:brief`"
    - `explore` → "Run `/gdd:explore`"
    - `plan` → "Run `/gdd:plan`"
    - `design` → "Run `/gdd:design` to continue"
    - `verify` → "Run `/gdd:verify`"

## Do Not

- Do not delete checkpoint files.
- Do not mutate STATE.md directly — all STATE.md writes go through the `gdd-state` MCP tools above.
- Do not auto-execute the next command — just recommend.
- Do not call `mcp__gdd_state__transition_stage` — resume restores prior status without moving the pipeline.

## RESUME COMPLETE
