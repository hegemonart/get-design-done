---
name: gdd-pause
description: "Write session handoff so work can resume in a new session without re-running completed stages."
argument-hint: "[context note]"
tools: Read, Write, AskUserQuestion
---

# /gdd:pause

Captures enough state that a killed or stopped session can resume cleanly via `/gdd:resume`.

## Steps

1. Read `.design/STATE.md`. Extract:
   - Current `stage:` and `cycle:`
   - Last activity timestamp
   - Completed tasks in the current pipeline run
   - Open todos (from `.design/TODO.md` if present)
   - Active sketch/spike directories (scan `.design/sketches/` and `.design/spikes/` for in-progress markers)
2. If no context argument was passed, ask (AskUserQuestion): "What are you in the middle of? (optional context to capture)"
3. Write `.design/HANDOFF.md`:
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
4. Print: "Session paused. Run `/gdd:resume` to pick back up."

## Do Not

- Do not modify STATE.md itself — HANDOFF.md is the only write.
- Do not abort in-progress sketches; just record them.

## PAUSE COMPLETE
