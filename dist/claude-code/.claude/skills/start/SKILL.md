---
name: start
description: "First-Run Proof Path — one command that scans your UI code and returns one concrete first fix. Leaf command, no STATE.md writes, no pipeline entry. Writes .design/START-REPORT.md and exits."
argument-hint: "[--budget <fast|balanced|thorough>] [--skip-interview] [--dismiss-nudge]"
tools: Read, Grep, Glob, Bash, Write, Task
disable-model-invocation: true
---

# Get Design Done — /gdd:start

**Role:** the canonical 0→1 proof path. A new user runs `/gdd:start`, answers five short questions, and receives `.design/START-REPORT.md` with three concrete findings in the user's own code, one `best_first_proof` selected by a deterministic rubric, and a single next command to run.

**Non-goals:** do NOT write/mutate `.design/STATE.md`, enter the pipeline state machine, modify source code, auto-install MCPs or run `/gdd:connections`, or capture before/after screenshots (that belongs to the full pipeline).

---

## When to use

- First time opening a repo with the get-design-done plugin installed.
- The user wants a single proof-of-value pass without committing to the pipeline.

## When NOT to use

- `.design/STATE.md` already exists — route to `/gdd:progress` instead.
- User asked for a full audit — route to `/gdd:scan`.
- User asked to fix a specific file — route to `/gdd:fast`.

---

## Arguments

| Flag | Effect |
|------|--------|
| `--budget fast` | 90-second wall-clock cap on the findings scan. Skips thorough detectors. |
| `--budget balanced` *(default)* | 3-minute wall-clock cap. All detectors, bounded file walk. |
| `--budget thorough` | 5-minute wall-clock cap. Used only when the user opts in. |
| `--skip-interview` | Skip the 5-question interview; use sane defaults (pain=unspecified, area=detected, budget=balanced, framework=detected, figma=skip). |
| `--dismiss-nudge` | Touch `~/.claude/gdd-nudge-dismissed` and exit. Does not run the scan. |

---

## Workflow

Six steps, all documented in `./start-procedure.md`. Companion file `./reference/start-interview.md` holds the 5-question copy + defaults + validation.

| Step | What it does | Where to look |
|------|--------------|---------------|
| 0 | Dismiss-only shortcut (if `--dismiss-nudge`) | `start-procedure.md#step-0-dismiss-only-shortcut` |
| 1 | Detect UI root via `scripts/lib/detect-ui-root.cjs` (early-exit on backend-only or `kind: null`) | `start-procedure.md#step-1-detect-ui-root` |
| 2 | Run 5-question interview (or use `--skip-interview` defaults); write `.design/.start-context.json` (NOT STATE.md) | `start-procedure.md#step-2-run-the-5-question-interview` + `start-interview.md` |
| 3 | Invoke `scripts/lib/start-findings-engine.cjs` → up to 3 findings (`F1`..`F3`) + `bestFirstProofId` | `start-procedure.md#step-3-scan-findings` |
| 4 | Spawn `design-start-writer` Task → emit `.design/START-REPORT.md` (7 H2 sections + JSON block, no STATE.md write) | `start-procedure.md#step-4-spawn-the-writer` |
| 5 | Print one-line handoff with suggested command (fallback: `/gdd:brief` if `bestFirstProofId` is null); emit `## START COMPLETE` | `start-procedure.md#step-5-print-the-handoff` |

Failure handling: every error path exits with `## START COMPLETE` plus a one-line pointer. Do not half-write files — if the writer fails, keep `.design/.start-context.json` and tell the user they can rerun. Do not delete `.design/` unless it was empty before the run.

---

## Do Not

- Do not write or mutate `.design/STATE.md`.
- Do not modify source code.
- Do not auto-install MCPs or write to `.design/config.json`.
- Do not take more than the budgeted wall-clock — let the engine truncate findings rather than hang.
- Do not invent findings — the findings engine output is the sole source of truth.

## START COMPLETE
