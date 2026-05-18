---
name: gdd-turn-closeout
description: "Portable mirror of the gdd-turn-closeout Stop hook (D-11). Closes the events.jsonl gap at turn-end and surfaces a stage-completion or paused-mid-task nudge. Tail-called by orchestrator skills (/gdd:next, /gdd:design, /gdd:verify) at exit on the 13 non-Claude runtimes that lack a Stop hook surface. Idempotent, non-blocking, ≤10ms typical."
argument-hint: "(none — reads .design/STATE.md and .design/telemetry/events.jsonl from cwd)"
tools: Read, Bash
---

# gdd-turn-closeout

## Role

You are a deterministic **closeout** skill. You close the per-turn telemetry gap on runtimes that don't expose a Stop event (codex, gemini, and 11 others). You are a code-level mirror of `hooks/gdd-turn-closeout.js` (D-10): same conditions, same idempotence, same emitted event shape. The only difference: the JS hook emits the nudge as `additionalContext` via the harness; this skill prints the nudge directly to the user. See `./reference/milestone-completeness-rubric.md` §"Task level" for the broader closeout discipline (what "turn complete" means within a stage).

**When to invoke:** orchestrator skills (`/gdd:next`, `/gdd:design`, `/gdd:verify`) tail-call this skill as their final step before returning. Adoption is incremental — each orchestrator can wire the tail-call independently; the skill exists as a stable, callable surface today.

## Invocation Contract

- **Input**: none. Operates on `.design/STATE.md` and `.design/telemetry/events.jsonl` in cwd.
- **Output**: at most one printed line — the nudge — or silent return.
- **Latency budget**: ≤10ms typical. Read **only** STATE.md and the tail of events.jsonl.
- **Idempotence**: if the most recent event is already a `turn_end` for the current `(stage, task_progress)` tuple, skip append but still print nudge.
- **Non-blocking**: any I/O failure → silent return. This skill never gates the user.

## Algorithm

Execute in order; stop at the first early-return.

### Step 1 — Read STATE.md

Read `.design/STATE.md`. Missing or unreadable → **return silently** (no print, no append).

### Step 2 — Parse `<position>` block

Lightweight-parse only `<position>…</position>` (regex `/<position>([\s\S]*?)<\/position>/` then per-line `key: value`). Extract `stage`, `status`, `task_progress`. Do not invoke the full STATE parser.

If `status != "in_progress"` → **return silently**. Pipeline is initialized / completed / blocked — no turn-end gap to close.

### Step 3 — Tail the last event line

Read **only the last 8 KiB** of `.design/telemetry/events.jsonl`. Treat as "stale by definition":

- File missing.
- File empty.
- Last line fails JSON parse.
- Last line's `timestamp` is missing or unparseable.

Otherwise compute `now - last_event.timestamp`. Gap < 60 seconds → user is actively mid-turn → **return silently** (next real event closes the gap naturally). Bash one-liner for the tail: `tail -n 1 .design/telemetry/events.jsonl 2>/dev/null`.

### Step 4 — Idempotence check, then append

If last event is already `{type:"turn_end", stage:<same>, payload:{task_progress:<same>}}` for the exact `(stage, task_progress)` from Step 2: **skip append** but proceed to Step 5.

Otherwise append one JSONL line to `.design/telemetry/events.jsonl`:

```json
{"type":"turn_end","timestamp":"<ISO 8601 now>","sessionId":"<session-id-or-'turn-closeout'>","stage":"<stage>","payload":{"task_progress":"<N/M>"},"_meta":{"source":"gdd-turn-closeout-skill"}}
```

Create `.design/telemetry/` if missing. Append is a single `appendFile`-equivalent call (writer assumes append-atomicity per Plan 20-06).

### Step 5 — Print the nudge

Match `task_progress` against `^(\d+)/(\d+)$`:

- **Numerator equals denominator and denominator > 0** (e.g. `5/5`): `Stage <stage> complete — run /gdd:next or /gdd:reflect`.
- **Otherwise** (mid-task, e.g. `3/7`, `0/0`, malformed): `Stage <stage> paused mid-task — resume with /gdd:resume`.

One line exactly. No commentary — the nudge is the user-facing surface.

## Failure Modes

| Condition | Behavior |
|-----------|----------|
| STATE.md missing/unreadable | Silent return |
| `<position>` absent or malformed | Silent return |
| `status != "in_progress"` | Silent return |
| `events.jsonl` missing | Treat as stale → fall through to append + nudge |
| Last event unparseable | Treat as stale → fall through |
| Last event < 60s old | Silent return |
| Append fails (permission, disk full) | Print nudge anyway; do not surface I/O error |
| Any uncaught throw | Silent return |

## Equivalence with the JS hook

This skill and `hooks/gdd-turn-closeout.js` MUST stay code-level equivalent: same four early-return branches, same 60-second staleness threshold, same idempotence guard (`type=turn_end, stage, payload.task_progress`), same event shape (only `_meta.source` differs: `gdd-turn-closeout` vs `gdd-turn-closeout-skill` so reflector telemetry can distinguish hook-driven vs skill-driven). Same nudge wording for both N/N and mid-task cases. Change one → change the other in the same plan. Plan 25-09's `tests/turn-closeout-hook.test.cjs` covers the JS hook.

## Non-Goals

- **Not a state writer.** Never edits STATE.md. The events.jsonl append is the only side effect.
- **Not a stage transition.** `turn_end` is within-stage, not a state-machine move; downstream tools ignore it for transition gating.
- **Not a Stop-event harness.** Cross-runtime Stop-event support at the harness level is out-of-scope for Phase 25 (CONTEXT.md OOS).

## Integration Point

Canonical tail-call sites per D-11: `/gdd:next`, `/gdd:design`, `/gdd:verify`. Each orchestrator's final step before returning to the user invokes `gdd-turn-closeout`. Tail-call wiring intentionally not part of v1.25 (Plan 25-04 ships only the callable surface).
