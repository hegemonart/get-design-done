---
name: gdd-resume
description: "Restore session context from a numbered checkpoint. Lists available checkpoints when no argument given."
argument-hint: "[<N>]"
tools: Read, Write, Bash, Glob, AskUserQuestion, mcp__gdd_state__get, mcp__gdd_state__set_status, mcp__gdd_state__resolve_blocker, mcp__gdd_state__checkpoint, mcp__gdd_status, mcp__gdd_phase_current, mcp__gdd_plans_list, mcp__gdd_decisions_list
disable-model-invocation: true
---

@reference/retrieval-contract.md
@reference/cycle-handoff-preamble.md

# /gdd:resume

Inverse of `/gdd:pause`. Reads a checkpoint file, prints a clear "you were here" summary, and routes to the next command.

## Step 0 — Prime cycle context

Two paths — MCP preferred when available, file-read fallback otherwise. This runs BEFORE checkpoint restoration so the "you were here" summary has full cycle context (phase, plans, decisions).

### MCP path (preferred)

When `mcp__gdd_status` is exposed (Phase 27.7+, registered via `npx @hegemonart/get-design-done --register-mcp`):

1. Call `mcp__gdd_status` (no args) → `{phase, branch, last_decisions, last_completed_plans, blocker_count}`. One call replaces reading STATE.md + parsing frontmatter + extracting decisions.
2. Call `mcp__gdd_cycle_recap` (no args) → diff vs last cycle snapshot. Critical for session-restoration context: what changed since you paused?
3. Call `mcp__gdd_decisions_list` (no args) → full D-XX list with rationale. Use for the "decisions you made" line in the resume summary.
4. (Optional) Call `mcp__gdd_plans_list` (no args) → current phase plans + status, to identify next incomplete plan.

Three to four MCP calls = full resume priming (~5s, ~32k tokens — Storybloq benchmark). Proceed to Step 1.

### File-read path (fallback)

When MCP tools are not available:

1. `Read .design/STATE.md` and parse the frontmatter + `<position>`, `<decisions>`, `<plans>` sections. Extract `cycle`, `branch`, `last N decisions`, `completed plans`.
2. Also `Read .design/CYCLES.md` (if present) to see prior cycle state for the recap.
3. Proceed to Step 1.

This path loads the same context in 3–5 file reads (~60s, ~46.5k tokens — file-reading baseline).

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
