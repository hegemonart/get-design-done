---
name: hone-pause
description: "Write a numbered checkpoint so work can resume in a new session without re-running completed stages."
argument-hint: "[context note]"
tools: Read, Write, Bash, AskUserQuestion, mcp__hone_state__get, mcp__hone_state__set_status, mcp__hone_state__add_blocker, mcp__hone_state__checkpoint
disable-model-invocation: true
---

@reference/retrieval-contract.md
@reference/cycle-handoff-preamble.md

# {{command_prefix}}pause

Captures enough state that a killed or stopped session can resume cleanly via `{{command_prefix}}resume` or `{{command_prefix}}continue`.

Each invocation writes an **immutable numbered checkpoint** - it does not overwrite previous pauses. This enables branched cycles: you can pause, take a detour via `{{command_prefix}}sketch`, compare, and resume an older snapshot via `{{command_prefix}}resume N`.

## Steps

1. `mcp__hone_state__get` → snapshot current pipeline state. Extract:
   - Current `stage` and `cycle`
   - `last_checkpoint` timestamp
   - `task_progress` and `status` for the current run
   - Open todos (from `.design/TODO.md` if present - this file is outside the MCP catalog, so `Read` is still used)
   - Active sketch/spike directories (scan `.design/sketches/` and `.design/spikes/` for in-progress markers)

2. **Determine checkpoint number**: run
   ```bash
   ls .design/checkpoints/ 2>/dev/null | grep -E '^[0-9]+' | sort -n | tail -1
   ```
   Next checkpoint = last number + 1 (or `01` if none exist).

3. **Collect context**: if no context argument was passed, ask (AskUserQuestion):
   "What are you in the middle of? (optional context to capture)"

4. **Flip status via MCP** so `{{command_prefix}}resume` can detect the pause and recover the prior status:
   1. `mcp__hone_state__set_status` with `status: "paused:<prior-status>"` - the `paused:` prefix preserves the prior status for resume parsing.
   2. If the user supplied a context/blocker message: `mcp__hone_state__add_blocker` with `{ stage: <current>, date: <today>, text: <message> }`.
   3. `mcp__hone_state__checkpoint` to stamp `last_checkpoint` via MCP.

5. **Write numbered checkpoint**: create `.design/checkpoints/` with `mkdir -p`, then write:
   ```
   .design/checkpoints/NN-<stage>-<ISO-date>.md
   ```
   e.g. `01-design-2026-04-24.md`

   Content:
   ```markdown
   # Checkpoint NN
   **Saved**: <ISO timestamp>
   **Stage**: <stage>
   **Cycle**: <cycle>
   **In progress**: <task description + wave/index>
   **Next**: <next step>
   **Context**: <user note or "none">
   **Active sketch**: <path or none>
   **Open todos**: <N items (see .design/TODO.md)>
   **Completed this session**: <list>
   ```

6. **Update HANDOFF.md pointer**: write `.design/HANDOFF.md` with:
   ```markdown
   # Session Handoff (pointer)
   Latest checkpoint: `.design/checkpoints/NN-<stage>-<ISO-date>.md`
   Run `{{command_prefix}}resume` to restore, or `{{command_prefix}}resume N` for a specific checkpoint.
   ```

7. Print: "Checkpoint NN saved. Run `{{command_prefix}}resume` or `{{command_prefix}}continue` to pick back up."

## Do Not

- Do not mutate STATE.md directly - all STATE.md writes go through the `hone-state` MCP tools above. Checkpoint files + HANDOFF.md are sibling artifacts, written with `Write`.
- Do not abort in-progress sketches; just record them.
- Do not delete previous checkpoint files.
- Do not call `mcp__hone_state__transition_stage` - pause is status-only, never a stage transition.

## PAUSE COMPLETE
