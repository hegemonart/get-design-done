---
name: gdd-audit
description: "Run a design audit by spawning design-auditor, design-integration-checker, and (optionally) design-verifier + design-reflector agents, then printing a consolidated 6-pillar score summary. Use when the user wants to score the current design, retroactively verify a completed cycle, or quickly re-check after a fix."
argument-hint: "[--retroactive] [--quick] [--no-reflect]"
tools: Read, Write, Task, Glob, Bash
---

# {{command_prefix}}audit

Wraps the existing `design-auditor`, `design-verifier`, and `design-integration-checker` agents - no new auditor logic here. Parses flags, spawns the right combination, prints summary.

For the 6-pillar scoring rubric this skill aggregates, see `../../reference/audit-scoring.md`. For the shared design-quality pillar set that frames the score categories, see `../../reference/shared-preamble.md`.

## Modes

### Default
Spawn `design-auditor` (6-pillar scoring 1–4) in parallel with `design-integration-checker`. After both finish, read `.design/DESIGN-AUDIT.md` and `.design/DESIGN-INTEGRATION.md` and print a consolidated summary (scores + top 3 findings each).

After the auditor and integration checker complete, check if `.design/learnings/` exists and contains at least one `.md` file. If so - and unless `--no-reflect` is passed - spawn `design-reflector` for the current cycle. Append the reflection proposal count to the audit summary: "Reflection: N proposals → review with `{{command_prefix}}apply-reflections`".

### `--retroactive`
Spawn `design-verifier` with cycle-span scope. Verifier reads all tasks completed in the current cycle (from STATE.md `<completed_tasks>` list for the active `cycle:` ID) and uses `DESIGN-PLAN.md` goals as the reference baseline for what "should have been done." Output: `.design/DESIGN-VERIFICATION.md` with per-task pass/fail.

### `--quick`
Run only `design-auditor` (skip `design-integration-checker`). Faster health check when integration isn't the concern.

## Steps

1. Parse args for `--retroactive`, `--quick`, and `--no-reflect`.
2. Verify `.design/STATE.md` exists; abort if not (suggest `{{command_prefix}}new-project`).
3. Spawn the appropriate agents (Task tool). Default and `--retroactive` spawn two agents; `--quick` spawns one.
4. Wait for completion, then read each output file and print a summary:
   - Auditor scores per pillar
   - Integration check pass/fail
   - Verifier pass/fail per task (retroactive mode)
5. **Reflection step** (default + retroactive modes only, skipped with `--no-reflect` or `--quick`):
   - Check if `.design/learnings/` exists and has ≥1 `.md` file
   - If yes: spawn `design-reflector` for the current cycle slug (read from STATE.md)
   - After completion: count proposal types and append to summary
6. Recommend next action based on findings (e.g., "Score 2/4 on typography - run `{{command_prefix}}discuss typography` to gather decisions").

## Registered Audit Agents

| Agent | Trigger | Output |
|---|---|---|
| `design-auditor` | Default, retroactive | `.design/DESIGN-AUDIT.md` |
| `design-integration-checker` | Default, retroactive | `.design/DESIGN-INTEGRATION.md` |
| `design-verifier` | `--retroactive` only | `.design/DESIGN-VERIFICATION.md` |
| `design-reflector` | Default + retroactive when learnings exist | `.design/reflections/<slug>.md` |

## Do Not

- Do not modify source files.
- Do not rerun stages; this is a read-only audit.

## Step 7 - Update notice (post-closeout surface)

After the consolidated audit summary has been printed (and any reflection-proposal count appended), emit the plugin-update banner if one is present:

```bash
[ -f .design/update-available.md ] && cat .design/update-available.md
```

Written by `hooks/update-check.sh`; suppressed mid-pipeline and when the latest release is dismissed.

## Rationalizations - Thought to Reality

The excuses an agent reaches for to skip or thin out an audit, and the drift each one misses:

| Thought | Reality |
|---------|---------|
| "The audit passed last cycle, I can skip it this cycle." | Per-cycle audit catches drift the prior pass couldn't see; a skipped review is exactly where regressions accumulate unnoticed. |
| "`--quick` is fine, integration isn't the concern here." | Dropping the integration-checker hides orphaned decisions - wiring breaks even when the 6-pillar score looks healthy. |
| "I can eyeball the scores instead of spawning the auditor." | The auditor's rubric scores six pillars consistently; an eyeballed review drifts toward whatever the agent already believes. |
| "Reflection proposals are optional polish, skip the reflector." | The reflector turns this cycle's learnings into next-cycle improvements; skipping it lets the same mistakes repeat. |
| "I'll modify the source while I'm in here fixing findings." | Audit is read-only by contract; editing source mid-audit invalidates the very scores you're producing. |
| "Retroactive mode is overkill for a finished cycle." | Retroactive verification is the only check on tasks that shipped without per-task verify - skipping it leaves a completed cycle unaudited. |

## AUDIT COMPLETE
