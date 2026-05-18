---
name: start-procedure
type: heuristic
version: 1.0.0
phase: 28.5
tags: [start, first-run, proof-path, scan, writer-agent, handoff]
last_updated: 2026-05-18
---

# Start Skill — Full Procedure

Extracted from `skills/start/SKILL.md` per Phase 28.5 D-10 (extract-then-link, never delete
content). The skill keeps its arguments table, step headings, and non-goals; the per-step
operational detail (interview JSON shape, scan invocation, writer spawn payload, handoff
template) lives here so the SKILL stays under the 100-line cap.

The companion file `./start-interview.md` (Phase 27 ship) holds the 5-question copy,
defaults, and validation rules. This file documents what `/gdd:start` does WITH the answers.

## Step 0 — Dismiss-only shortcut

If invoked with `--dismiss-nudge`:

1. `touch ~/.claude/gdd-nudge-dismissed` (Windows: equivalent). Ignore errors silently.
2. Print exactly: `Nudge dismissed. Delete ~/.claude/gdd-nudge-dismissed to re-enable.`
3. Exit with `## START COMPLETE` marker.

Do not proceed to any other step.

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

## Step 2 — Run the 5-question interview

Read `./start-interview.md` for the exact question copy, defaults, and validation rules.

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

## Step 4 — Spawn the writer

Dispatch `Task` with:

- `subagent_type: design-start-writer`
- `description: "Write .design/START-REPORT.md"`
- `prompt:` a short instruction pointing the agent at `.design/.start-context.json` and asking it to emit the report per its Output contract. Include a reminder that it must produce exactly 7 H2 sections plus the JSON block, and must not write `STATE.md`.

Wait for the agent to complete. The agent writes `.design/START-REPORT.md`.

## Step 5 — Print the handoff

Read the final line of `.design/START-REPORT.md` to capture the suggested command.

Print exactly (one line, no emoji):

```
Report written to .design/START-REPORT.md. Next: run <suggested_command> to see the first proof.
```

If `bestFirstProofId` was null, the suggested command is `/gdd:brief` (the default fallback).

Emit `## START COMPLETE` and exit.

## Failure handling

Every error path exits with `## START COMPLETE` and a one-line pointer. Do not half-write files: if the writer agent fails, keep `.design/.start-context.json` and tell the user they can rerun. Do not delete `.design/` unless it was empty before the run.
