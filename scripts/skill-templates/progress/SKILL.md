---
name: hone-progress
description: "Shows current pipeline position and routes to next action. --forensic runs 6-check integrity audit. Activates for requests involving showing current project state, routing to the next action, or a status check."
argument-hint: "[--forensic]"
tools: Read, Bash, Grep, Glob, mcp__hone_state__get, mcp__hone_status, mcp__hone_phase_current
---

@reference/retrieval-contract.md

# {{command_prefix}}progress

**Role:** Show current position in the pipeline and recommend the next action. With `--forensic`, run a 6-check integrity audit.

## Step 1 - Read state

Two paths - MCP preferred when available, file-read fallback otherwise.

### MCP path (preferred)

When the harness exposes `mcp__hone_status` (Phase 27.7+, registered via `npx @hegemonart/get-design-done --register-mcp`):

1. Call `mcp__hone_status` (no args). Returns `{phase, branch, last_decisions, last_completed_plans, blocker_count}` in one call.
2. If you need `stage` / `task_progress` for the output line, call `mcp__hone_phase_current` (no args). Returns `{phase, stage, task_progress, status}`.
3. Skip to Step 2.

This path loads the full priming context in 1–2 MCP calls (~3s, ~32k tokens - Storybloq benchmark).

### File-read path (fallback)

When MCP tools are not available, fall back to the legacy flow:

1. Call `mcp__hone_state__get` if exposed (Phase 20 STATE.md mutator MCP) → parsed state object. Otherwise, `Read .design/STATE.md` and parse the frontmatter + `<position>`, `<decisions>`, `<plans>` sections.
2. Extract: `stage`, `cycle`, `last_checkpoint`, `task_progress`, `status`, `decisions.length`, open todos from `.design/TODO.md` (count unchecked `- [ ]` - outside the MCP catalog, so `Read` is still used).
3. If STATE.md is missing, print: "No pipeline state. Run `{{command_prefix}}brief` first." and stop.

This path loads the same context in 5–10 file reads (~100s, ~46.5k tokens - file-reading baseline).

## Step 2 - Default output

```
━━━ Pipeline state ━━━
Stage: <stage>   Cycle: <cycle or "default">   Wave: <wave>
Last checkpoint: <timestamp>
Decisions: <N>   Open todos: <N>
Next: {{command_prefix}}<next-stage>
━━━━━━━━━━━━━━━━━━━━━━
```

Recommend next stage via the same logic as `{{command_prefix}}next` (route by which artifacts exist).

### First-run connection nudge

After the pipeline state block, if every `<connections>` entry from the snapshot is `not_configured` AND `.design/config.json > connections_onboarding` is absent, append once per session (transient marker `.design/.connections-nudge-shown`): `Tip: run {{command_prefix}}connections to see what integrations can plug in (Figma, Storybook, Chromatic, etc.).`

## Step 3 - Forensic audit (only if `--forensic`)

Run these six checks and print PASS/WARN/FAIL per check:

1. **Stale artifacts** - compare mtime of `.design/DESIGN.md` against most recent file under `src/` via `ls -lt`. WARN if DESIGN.md is older by >7 days.
2. **Missing transitions** - `stage` from the `mcp__hone_state__get` snapshot vs artifacts present. e.g. stage=`plan` requires DESIGN-CONTEXT.md. FAIL if expected artifact missing.
3. **Token drift** - `wc -c .design/DESIGN.md .design/DESIGN-CONTEXT.md`; tokens ≈ bytes/4. WARN if combined >50000 tokens.
4. **Aged DESIGN-DEBT** - read `.design/DESIGN-DEBT.md`; any item whose line predates HEAD by >14 days (check `git blame` or file mtime fallback) → WARN.
5. **Cycle alignment** - if `cycle` from the snapshot is set but `.design/CYCLES.md` has no matching heading → FAIL.
6. **Connection status** - re-probe figma/refero via ToolSearch; compare to the `<connections>` field in the snapshot. WARN on mismatch.

Also scan `.design/SEEDS.md` (if present) for seeds whose trigger keywords match the snapshot or CYCLES.md content; list them as "Seed ready to germinate: <text>".

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

## Step 3.5 - Composition-graph readiness

After the pipeline state (and forensic audit if run), surface a one-line composition-graph hint from `scripts/lib/manifest/skills.json`. Count skill records declaring `composes_with` or `next_skills`, then probe for structural problems (cycles in the directed graph, or edges pointing at a skill name that has no record). Print one line:

- `Composition graph: <edges> edges, <skills-with-edges> skills wired | cycles: <n> | dangling: <n>`

Run `scripts/validate-composition-graph.cjs` for the authoritative cycle and dangling-edge counts when that validator is present; until then report `0` and note the graph is not yet wired. This is a readiness hint, not a gate.

## Step 3.6 - DesignContext graph coverage

When `.design/context-graph.json` exists, surface one line for the typed DesignContext graph using the `coverage` helper in `scripts/lib/design-context-query.cjs` (`node scripts/lib/design-context-query.cjs coverage`), then point at the Atomic-Design map: `DesignContext graph: <pct>% node-type coverage | map: .design/INTEGRATION-MAP.md`. Skip this line entirely when the graph is absent (a pre-Phase-52 project); offer `{{command_prefix}}migrate-context` as the next step instead. Readiness hint, not a gate.

## Step 4 - Update notice (safe-window surface)

After printing the pipeline state, emit the plugin-update banner if one is present. This file is written by `hooks/update-check.sh` subject to the state-machine guard (mid-pipeline stages suppress it) and per-version dismissal.

```bash
[ -f .design/update-available.md ] && cat .design/update-available.md
```

No-op when: no new release exists, state-machine guard is active (stage in plan|design|verify), or the latest tag has been dismissed via `{{command_prefix}}check-update --dismiss`.

## Do Not

- Do not mutate STATE.md - this skill is read-only. Only `mcp__hone_state__get` is permitted.

## PROGRESS COMPLETE
