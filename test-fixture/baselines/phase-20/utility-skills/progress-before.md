---
name: gdd-progress
description: "Shows current pipeline position and routes to next action. --forensic runs 6-check integrity audit."
argument-hint: "[--forensic]"
tools: Read, Bash, Grep, Glob
---

# /gdd:progress

**Role:** Show current position in the pipeline and recommend the next action. With `--forensic`, run a 6-check integrity audit.

## Step 1 — Read state

Read `.design/STATE.md`. Extract:
- `stage:`, `cycle:`, `last_checkpoint`
- `<position>` `task_progress`, `status`
- D-XX count, open todos from `.design/TODO.md` (count unchecked `- [ ]`)

If STATE.md does not exist, print: "No pipeline state. Run `/gdd:brief` first." and stop.

## Step 2 — Default output

```
━━━ Pipeline state ━━━
Stage: <stage>   Cycle: <cycle or "default">   Wave: <wave>
Last checkpoint: <timestamp>
Decisions: <N>   Open todos: <N>
Next: /gdd:<next-stage>
━━━━━━━━━━━━━━━━━━━━━━
```

Recommend next stage via the same logic as `/gdd:next` (route by which artifacts exist).

### First-run connection nudge

After the pipeline state block, check STATE.md `<connections>`. If every entry is `not_configured` AND `.design/config.json > connections_onboarding` is absent (user has never run the wizard), append once:

```
Tip: run /gdd:connections to see what integrations can plug in (Figma, Storybook, Chromatic, etc.).
```

Suppress the nudge on subsequent invocations in the same session (track via a transient marker file `.design/.connections-nudge-shown` written at first emit, deleted on next session start by no mechanism — so effectively once per session).

## Step 3 — Forensic audit (only if `--forensic`)

Run these six checks and print PASS/WARN/FAIL per check:

1. **Stale artifacts** — compare mtime of `.design/DESIGN.md` against most recent file under `src/` via `ls -lt`. WARN if DESIGN.md is older by >7 days.
2. **Missing transitions** — STATE.md `stage:` vs artifacts present. e.g. stage=`plan` requires DESIGN-CONTEXT.md. FAIL if expected artifact missing.
3. **Token drift** — `wc -c .design/DESIGN.md .design/DESIGN-CONTEXT.md`; tokens ≈ bytes/4. WARN if combined >50000 tokens.
4. **Aged DESIGN-DEBT** — read `.design/DESIGN-DEBT.md`; any item whose line predates HEAD by >14 days (check `git blame` or file mtime fallback) → WARN.
5. **Cycle alignment** — if `cycle:` is set but `.design/CYCLES.md` has no matching heading → FAIL.
6. **Connection status** — re-probe figma/refero via ToolSearch; compare to STATE.md `<connections>`. WARN on mismatch.

Also scan `.design/SEEDS.md` (if present) for seeds whose trigger keywords match STATE.md or CYCLES.md content; list them as "Seed ready to germinate: <text>".

Print:
```
━━━ Forensic audit ━━━
[PASS] Stale artifacts
[WARN] Token drift — 53,400 tokens combined
[PASS] Missing transitions
[PASS] Aged DESIGN-DEBT
[PASS] Cycle alignment
[WARN] Connection status — figma now unavailable
Seeds ready: 0
━━━━━━━━━━━━━━━━━━━━━━
```

## Step 4 — Update notice (safe-window surface)

After printing the pipeline state, emit the plugin-update banner if one is present. This file is written by `hooks/update-check.sh` subject to the state-machine guard (mid-pipeline stages suppress it) and per-version dismissal.

```bash
[ -f .design/update-available.md ] && cat .design/update-available.md
```

No-op when: no new release exists, state-machine guard is active (stage in plan|design|verify), or the latest tag has been dismissed via `/gdd:check-update --dismiss`.

## PROGRESS COMPLETE
