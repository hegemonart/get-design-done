---
name: start
description: "First-Run Proof Path — one command that scans your UI code and returns one concrete first fix. Leaf command, no STATE.md writes, no pipeline entry. Writes .design/START-REPORT.md and exits."
argument-hint: "[--budget <fast|balanced|thorough>] [--skip-interview] [--dismiss-nudge]"
tools: Read, Grep, Glob, Bash, Write, Task
---

# Get Design Done — /gdd:start

**Role:** the canonical 0→1 proof path. A new user runs `/gdd:start`, answers five short questions, and receives `.design/START-REPORT.md` with three concrete findings in the user's own code, one `best_first_proof` selected by a deterministic rubric, and a single next command to run.

**Non-goals** (do not do any of these):

- Do NOT write or mutate `.design/STATE.md`.
- Do NOT enter the pipeline state machine.
- Do NOT modify source code.
- Do NOT auto-install MCPs or run `/gdd:connections`.
- Do NOT capture before/after screenshots — that belongs to the full pipeline.

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

## Step 0 — Dismiss-only shortcut

If invoked with `--dismiss-nudge`:

1. `touch ~/.claude/gdd-nudge-dismissed` (Windows: equivalent). Ignore errors silently.
2. Print exactly: `Nudge dismissed. Delete ~/.claude/gdd-nudge-dismissed to re-enable.`
3. Exit with `## START COMPLETE` marker.

Do not proceed to any other step.

---

## Step 1 — Detect UI root

Run the detector:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/detect-ui-root.cjs" "$(pwd)"
```

Capture the JSON output. Branches:

- `kind: "backend-only"` → print the frontend-only diagnostic below, write nothing, exit with `## START COMPLETE`. The diagnostic copy is:
  > `/gdd:start` is for frontend codebases. This repo looks backend-only (detected `<framework>`). The plugin can still help with design references and component libraries imported by your clients — but there is no UI surface here to scan. Exiting without creating `.design/`.
- `kind: null` (no package.json, no UI dir) → print a short "Nothing recognizable here — point me at a frontend repo and try again." and exit.
- Any other `kind` → proceed with `detected.path` as the scan root.

---

## Step 2 — Run the 5-question interview

Read `reference/start-interview.md` for the exact question copy, defaults, and validation rules.

If `--skip-interview`, skip this step and use the defaults documented in that file.

Otherwise, ask the five questions in order using `AskUserQuestion`:

1. Pain point (text, required, single-line cap 120 chars)
2. Target area confirmation (detected path)
3. Budget / latency preference (enum: fast / balanced / thorough)
4. Framework + design-system confirmation (from detection)
5. Figma / canvas workflow (enum: figma / canvas / neither / skip)

Any early exit at Q1 → abort with a one-line pointer to `/gdd:scan`.

Store the answers + detection result in `.design/.start-context.json`:

```json
{
  "schema_version": "1.0",
  "detected": { "kind": "...", "path": "...", "framework": "...", "design_system": "...", "confidence": 0.85 },
  "interview": { "pain": "...", "target_area": "...", "budget": "balanced", "framework_confirmed": true, "design_system_confirmed": true, "figma_workflow": "skip" },
  "generated_at": "<ISO-8601>"
}
```

`.design/` is created here for the first time. `.design/STATE.md` is NOT written.

---

## Step 3 — Scan findings

Run the findings engine:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/start-findings-engine.cjs" \
  --root "<detected.path>" \
  --budget "<budget>" \
  --pain "<pain_point>"
```

Capture the JSON. The output carries at most three findings, each with stable IDs `F1`..`F3`, plus `bestFirstProofId` (may be null).

Append the engine output to `.design/.start-context.json` under a `scan` key.

---

## Step 4 — Spawn the writer

Dispatch `Task` with:

- `subagent_type: design-start-writer`
- `description: "Write .design/START-REPORT.md"`
- `prompt:` a short instruction pointing the agent at `.design/.start-context.json` and asking it to emit the report per its Output contract. Include a reminder that it must produce exactly 7 H2 sections plus the JSON block, and must not write `STATE.md`.

Wait for the agent to complete. The agent writes `.design/START-REPORT.md`.

---

## Step 5 — Print the handoff

Read the final line of `.design/START-REPORT.md` to capture the suggested command.

Print exactly (one line, no emoji):

```
Report written to .design/START-REPORT.md. Next: run <suggested_command> to see the first proof.
```

If `bestFirstProofId` was null, the suggested command is `/gdd:brief` (the default fallback).

Emit `## START COMPLETE` and exit.

---

## Failure handling

Every error path exits with `## START COMPLETE` and a one-line pointer. Do not half-write files: if the writer agent fails, keep `.design/.start-context.json` and tell the user they can rerun. Do not delete `.design/` unless it was empty before the run.

---

## Do Not

- Do not write or mutate `.design/STATE.md`.
- Do not modify source code.
- Do not auto-install MCPs or write to `.design/config.json`.
- Do not take more than the budgeted wall-clock — let the engine truncate findings rather than hang.
- Do not invent findings — the findings engine output is the sole source of truth.

## START COMPLETE
