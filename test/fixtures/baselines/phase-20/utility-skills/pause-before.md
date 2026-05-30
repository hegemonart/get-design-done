---
name: gdd-pause
description: "Write a numbered checkpoint so work can resume in a new session without re-running completed stages."
argument-hint: "[context note]"
tools: Read, Write, Bash, AskUserQuestion
---

@reference/retrieval-contract.md
@reference/cycle-handoff-preamble.md

# /gdd:pause

Captures enough state that a killed or stopped session can resume cleanly via `/gdd:resume` or `/gdd:continue`.

Each invocation writes an **immutable numbered checkpoint** — it does not overwrite previous pauses. This enables branched cycles: you can pause, take a detour via `/gdd:sketch`, compare, and resume an older snapshot via `/gdd:resume N`.

## Steps

1. **Read `.design/STATE.md`**. Extract:
   - `stage:` and `cycle:`
   - Last activity timestamp
   - Completed tasks in the current pipeline run
   - Open todos (scan `.design/TODO.md` if present)
   - Active sketch/spike directories (scan `.design/sketches/` and `.design/spikes/` for in-progress markers)

2. **Determine checkpoint number**: run
   ```bash
   ls .design/checkpoints/ 2>/dev/null | grep -E '^[0-9]+' | sort -n | tail -1
   ```
   Next checkpoint = last number + 1 (or `01` if none exist).

3. **Collect context**: if no context argument was passed, ask (AskUserQuestion):
   "What are you in the middle of? (optional context to capture)"

4. **Write numbered checkpoint**: create `.design/checkpoints/` with `mkdir -p`, then write:
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

5. **Update HANDOFF.md pointer**: write `.design/HANDOFF.md` with:
   ```markdown
   # Session Handoff (pointer)
   Latest checkpoint: `.design/checkpoints/NN-<stage>-<ISO-date>.md`
   Run `/gdd:resume` to restore, or `/gdd:resume N` for a specific checkpoint.
   ```

6. Print: "Checkpoint NN saved. Run `/gdd:resume` or `/gdd:continue` to pick back up."

## Do Not

- Do not modify STATE.md — checkpoints are the only write.
- Do not abort in-progress sketches; just record them.
- Do not delete previous checkpoint files.

## PAUSE COMPLETE
