---
name: gdd-pause
description: "Write session handoff so work can resume in a new session without re-running completed stages."
argument-hint: "[context note]"
tools: Read, Write, AskUserQuestion, mcp__gdd_state__get, mcp__gdd_state__set_status, mcp__gdd_state__add_blocker, mcp__gdd_state__checkpoint
---

# /gdd:pause

Captures enough state that a killed or stopped session can resume cleanly via `/gdd:resume`.

## Steps

1. `mcp__gdd_state__get` → snapshot current pipeline state. Extract:
   - Current `stage` and `cycle`
   - `last_checkpoint` timestamp
   - `task_progress` and `status` for the current run
   - Open todos (from `.design/TODO.md` if present — this file is outside the MCP catalog, so `Read` is still used)
   - Active sketch/spike directories (scan `.design/sketches/` and `.design/spikes/` for in-progress markers)
2. If no context argument was passed, ask (AskUserQuestion): "What are you in the middle of? (optional context to capture)"
3. Flip status so `/gdd:resume` can detect the pause and recover the prior status:
   1. `mcp__gdd_state__set_status` with `status: "paused:<prior-status>"` — the `paused:` prefix preserves the prior status for resume parsing.
   2. If the user supplied a context/blocker message: `mcp__gdd_state__add_blocker` with `{ stage: <current>, date: <today>, text: <message> }`.
   3. `mcp__gdd_state__checkpoint` to stamp `last_checkpoint` via MCP.
4. Write `.design/HANDOFF.md`:
   ```markdown
   # Session Handoff
   **Paused**: <ISO timestamp>
   **Stage**: <stage>
   **Cycle**: <cycle-N>
   **In progress**: <task description + wave/index>
   **Next**: <next step>
   **Context**: <user note>
   **Active sketch**: <path or none>
   **Open todos**: <N items (see .design/TODO.md)>
   **Completed this session**: <list>
   ```
5. Print: "Session paused. Run `/gdd:resume` to pick back up."

## Do Not

- Do not mutate STATE.md directly — all STATE.md writes go through the `gdd-state` MCP tools above. HANDOFF.md is a sibling artifact, written with `Write`.
- Do not abort in-progress sketches; just record them.
- Do not call `mcp__gdd_state__transition_stage` — pause is status-only, never a stage transition.

## PAUSE COMPLETE
