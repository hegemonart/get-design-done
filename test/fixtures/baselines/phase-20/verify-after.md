---
name: verify
description: "Stage 5 of 5 orchestrator that spawns design-auditor, design-verifier, and design-integration-checker in sequence, interprets pass/gap result, and drives the gap-response loop (inline fix, save-and-exit, or accept-as-is). Use when implementation is complete and ready for final pre-ship verification."
argument-hint: "[--auto] [--post-handoff]"
user-invocable: true
tools: mcp__gdd_state__get, mcp__gdd_state__transition_stage, mcp__gdd_state__add_must_have, mcp__gdd_state__add_blocker, mcp__gdd_state__resolve_blocker, mcp__gdd_state__update_progress, mcp__gdd_state__set_status, mcp__gdd_state__checkpoint, mcp__gdd_state__probe_connections
---

# Get Design Done — Verify

**Stage 5 of 5** in the get-design-done pipeline. Thin orchestrator. Verification intelligence lives in three agents: design-auditor, design-verifier, and design-integration-checker.

Full procedure detail: `../../reference/verify-procedure.md`.

---

## State Integration

1. `mcp__gdd_state__transition_stage` with `to: "verify"`; on gate failure surface `error.context.blockers` to the user without advancing.
2. `mcp__gdd_state__get` -> snapshot `state`. Read `state.must_haves` (verification checklist — each M-XX flips to `pass` or `fail`).
3. **Quality-gate gate (D-08, D-09)** — inspect `state.quality_gate?.run?.status`:
   - `"fail"` -> refuse to advance; call `mcp__gdd_state__add_blocker` with the iteration count + `commands_run`; exit. Do NOT open the stage.
   - `"timeout"` / `"skipped"` -> print one-line warning naming the status + `commands_run`, continue normally (signals, not walls).
   - `"pass"` / `null` -> continue silently.
   Full decision tree: `../../reference/verify-procedure.md` §Quality-gate gate.
4. Resume detection — if `state.position.status==in_progress` and `.design/DESIGN-VERIFICATION.md` exists: RESUME to Step 2 (gap-response loop). Otherwise call `mcp__gdd_state__update_progress` with `task_progress: "0/3"`, `status: "in_progress"` and proceed.
5. Missing STATE.md is a hard block — verify is never the entry point; upstream stages own bootstrap.

**Flipping a must-have status:** `mcp__gdd_state__add_must_have` with the SAME `id` updates in-place (no separate update tool). Detail: `../../reference/verify-procedure.md` §Flipping a must-have status.

---

## Connection probes

Run preview / storybook / chromatic probes at stage entry, then issue ONE batched `mcp__gdd_state__probe_connections` call with all results. Full probe specs (project detection, dev-server probe, CLI presence, token check) and downstream loops (storybook a11y, chromatic visual delta) are in `../../reference/verify-procedure.md` §Connection Probes.

---

## Prerequisites + flags

- **DESIGN-PLAN.md prerequisite** (normal mode): missing -> block with "Verify requires DESIGN-PLAN.md. Run `/gdd:plan` first, or use `--post-handoff` if starting from a Claude Design handoff bundle."
- **Post-handoff mode** (`--post-handoff` OR STATE.md `status: handoff-sourced`): skip the DESIGN-PLAN.md check; pass `post_handoff: true` + `handoff_path` to design-verifier; DESIGN-VERIFICATION.md gains a `## Handoff Faithfulness` section. Detail: `../../reference/verify-procedure.md` §Post-Handoff Mode.
- **Flags:** `--auto` -> `auto_mode=true` (no interactive prompts; on gaps: save-and-exit); `--post-handoff` -> see above.
- **Parallelism decision:** read `.design/config.json` + `reference/parallelism-rules.md`. Default serial (verifier depends on auditor output). Record via `mcp__gdd_state__set_status` before spawning. Detail: `../../reference/verify-procedure.md` §Parallelism Decision.

---

## Step 1 — Spawn Auditor + Verifier + Integration Checker

Initialize the fix-loop iteration counter to 0. Each full checker is preceded by a cheap Haiku gate that may return `{spawn: false}` to short-circuit (lazy-gate pattern from Plan 10.1-04 / D-21); skipped agents append `lazy_skipped: true` to `.design/telemetry/costs.jsonl`.

**1a. design-auditor** (retrospective 6-pillar audit) -> `.design/DESIGN-AUDIT.md`. Wait for `## AUDIT COMPLETE`, then `mcp__gdd_state__update_progress` `task_progress: "1/3"`.

**1b-gate -> 1b. design-verifier** (5-phase verification, reads auditor output) -> `.design/DESIGN-VERIFICATION.md`. Wait for `## VERIFICATION COMPLETE`, then `task_progress: "2/3"`.

**1c-gate -> 1c. design-integration-checker** (per-decision wiring check on each D-XX in DESIGN-CONTEXT.md) -> reports Connected / Orphaned / Missing counts. Wait for `## INTEGRATION CHECK COMPLETE`, then `task_progress: "3/3"`.

Full agent prompts, lazy-gate decision logic, and telemetry-row shapes: `../../reference/verify-procedure.md` §Step 1.

---

## Step 2 — Interpret Result

Consolidate gaps from both sources: verifier `## GAPS FOUND` (G-NN entries) and integration-checker (Orphaned -> MAJOR, Missing -> BLOCKER).

- **No gaps (PASS)** -> for each M-XX in the entry snapshot: `add_must_have` with `status: "pass"`. Proceed to Stage exit.
- **Gaps + `auto_mode=true`** -> preserve DESIGN-VERIFICATION.md, `set_status: "blocked"`, `add_blocker` with the gap count, exit with the failure message.
- **Gaps + `auto_mode=false`** -> proceed to Step 3.

Detail: `../../reference/verify-procedure.md` §Step 2.

---

## Step 3 — Gap Response Loop

Present the gap summary + 3-option menu (`[1] Fix now`, `[2] Save and exit`, `[3] Accept as-is`).

- **[1] Fix now** -> if iteration counter >= 3 fall back to [2]; otherwise increment counter, spawn `design-fixer` for BLOCKER+MAJOR gaps (each fix is an atomic `fix(design-gap-GNN):` commit), wait for `## FIX COMPLETE`, then re-spawn `design-verifier` with `re_verify=true` and loop to Step 2.
- **[2] Save and exit** -> preserve DESIGN-VERIFICATION.md, `set_status: "blocked"`, `add_blocker`, `checkpoint`, exit.
- **[3] Accept as-is** -> flip each unmet M-XX to `status: "fail"`, `add_blocker` with "accepted with N unresolved gaps", proceed to Stage exit.

Full prompts + branching: `../../reference/verify-procedure.md` §Step 3.

---

## Stage exit

1. `mcp__gdd_state__update_progress` -> `task_progress: "<verified>/<total>"`, `status: "verify_complete"`.
2. `mcp__gdd_state__set_status` -> `"pipeline_complete"` (all pass, no gaps) or `"verify_failed_requires_loop"` (gaps remain).
3. `mcp__gdd_state__checkpoint` — stamps `last_checkpoint` and appends `verify_completed_at`. No direct STATE.md writes.

## After Completion

Print the `=== Verify complete ===` summary (status, gap counts, agent paths, next-step suggestion) from `../../reference/verify-procedure.md` §After Completion.

## VERIFY COMPLETE
