---
name: gdd-bandit-reset
description: "Confirm-then-reset the per-(agent, bin, delegate) bandit posterior - backs up .design/telemetry/posterior.json to posterior.json.bak, then clears it to a fresh empty envelope. Phase 23.5 (v1.27.5) mutation companion to read-only bandit-status. Use when the posterior is corrupted/unparseable, after a major agent/skill roster change invalidates accumulated arms, or when you deliberately want to rebootstrap adaptive routing from informed priors."
argument-hint: "[--yes to skip the confirmation prompt]"
tools: Read, Write, Bash, AskUserQuestion
disable-model-invocation: true
---

# gdd-bandit-reset

## Role

You are a deterministic, destructive maintenance skill. You are the ONLY skill that clears the bandit posterior - the mutation companion to read-only `{{command_prefix}}bandit-status`. You read the posterior path declared by `scripts/lib/bandit-router.cjs`'s `DEFAULT_POSTERIOR_PATH` (`.design/telemetry/posterior.json`), REQUIRE explicit confirmation, back the file up to `posterior.json.bak`, then overwrite it with a fresh empty envelope so the next bandit pull rebootstraps from informed priors. See `./reference/bandit-integration.md` for setup, interpretation, and convergence guidance.

## Invocation Contract

- **Input**: optional `--yes` to skip the interactive confirmation (for non-interactive/automated runs).
- **Output**: a Markdown reset receipt to stdout (backup path + arms cleared + envelope written).

## Procedure

### 1. Locate the posterior file

Read `.design/telemetry/posterior.json` (path declared by `scripts/lib/bandit-router.cjs`'s `DEFAULT_POSTERIOR_PATH` - never hardcode a different path). Missing → nothing to reset; emit and skip to Section 5 (Record):

```
## Bandit Posterior Reset

No posterior file found at `.design/telemetry/posterior.json` — nothing to reset.

The next bandit pull with `adaptive_mode: full` will bootstrap a fresh posterior from informed priors. See `reference/bandit-integration.md`.
```

If present, count the arms (`arms.length`, treating a missing/non-array `arms` as `0`) so the confirmation and receipt can report what will be cleared. A corrupted/unparseable file is still resettable — report `arms: unknown (file unparseable)` and continue.

### 2. Require explicit confirmation

This is a DESTRUCTIVE operation. Do NOT proceed without confirmation.

- If `--yes` was passed, skip straight to Section 3.
- Otherwise, prompt via AskUserQuestion: "Reset the bandit posterior at `.design/telemetry/posterior.json`? This clears <N> learned arms. A backup will be written to `posterior.json.bak` first." with options **Reset** and **Cancel**.
- On **Cancel** (or any non-affirmative answer), abort WITHOUT touching either the posterior or the backup, and emit:

```
## Bandit Posterior Reset — Cancelled

No changes made. The posterior at `.design/telemetry/posterior.json` is untouched (<N> arms).
```

Then skip to Section 5 (Record) with `reset: false`.

### 3. Back up the current posterior

Copy the live posterior to `.design/telemetry/posterior.json.bak` (sibling backup) BEFORE clearing it, so the previous state is always recoverable. Overwrite any existing `.bak` from a prior reset. If the backup write fails, ABORT before clearing — never clear without a successful backup.

### 4. Clear to a fresh empty envelope

Overwrite `.design/telemetry/posterior.json` with a fresh empty envelope matching `scripts/lib/bandit-router.cjs`'s `loadPosterior()` shape (`SCHEMA_VERSION` = `1.0.0`, current ISO `generated_at`, empty `arms`):

```json
{
  "schema_version": "1.0.0",
  "generated_at": "<ISO>",
  "arms": []
}
```

Write atomically where possible (`.tmp` + rename, mirroring `savePosterior()`). Then emit the receipt:

```
## Bandit Posterior Reset

Posterior cleared. The next bandit pull with `adaptive_mode: full` will rebootstrap from informed priors.

- Backup: `.design/telemetry/posterior.json.bak`
- Arms cleared: <N>
- Fresh envelope: `.design/telemetry/posterior.json` (schema_version 1.0.0, 0 arms)

Restore the previous state with: `cp .design/telemetry/posterior.json.bak .design/telemetry/posterior.json`
Verify the cleared state with `{{command_prefix}}bandit-status`. See `reference/bandit-integration.md`.
```

### 5. Record

Append one JSONL line to `.design/skill-records.jsonl`: `{"skill":"gdd-bandit-reset","ts":"<ISO>","reset":<bool>,"arms_cleared":<count>,"backup_written":<bool>}`. The skill mutates ONLY the posterior (+ its `.bak`) and appends to skill-records.jsonl (telemetry); it touches no other state.

## Cross-references

- `{{command_prefix}}bandit-status` (Phase 27.5) - read-only companion; inspect the posterior before/after a reset.
- `./reference/bandit-integration.md` - operator guide; interpretation patterns and when a reset is warranted.
- `scripts/lib/bandit-router.cjs` (Phase 23.5) - posterior shape, `DEFAULT_POSTERIOR_PATH`, `SCHEMA_VERSION`, `loadPosterior()`, `savePosterior()`, `reset()`.
