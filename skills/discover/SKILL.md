---
name: discover
description: "Stage 1.5 of 4 orchestrator that probes Figma / Refero / Pinterest connections, spawns design-context-builder (auto-detect + interview) and (via lazy gate) design-context-checker (6-dimension validator), producing .design/DESIGN-CONTEXT.md. Use after /gdd:scan when a fast-path context build is wanted instead of the full /gdd:explore."
argument-hint: "[--auto]"
user-invocable: true
---

# Get Design Done — Discover

**Stage 1.5 of 4.** Produces `.design/DESIGN-CONTEXT.md`.

Full procedure detail: `../../reference/discover-procedure.md`.

---

## State Integration

1. Read `.design/STATE.md`.
   - **Missing** -> create minimal skeleton from `reference/STATE-TEMPLATE.md` (stage=discover, status=in_progress, task_progress=0/1) and log warning "STATE.md not found — created fresh. If this is a resumed session, run /get-design-done:scan first."
   - **Present + stage==discover + status==in_progress** -> RESUME (continue interview; do not reset).
   - **Otherwise** -> normal transition: set frontmatter stage=discover, `<position>` stage=discover, status=in_progress, task_progress=0/1.
2. Probe connection availability. ToolSearch runs FIRST (MCP tools may be in the deferred tool set). Run three probes — A (Figma, variant-agnostic with prefix tiebreaker), B (Refero, ToolSearch-only), C (Pinterest, ToolSearch-only). After all probes, write `<connections>` to STATE.md so the builder doesn't re-probe. Full probe specs: `../../reference/discover-procedure.md` §Connection Probes.
3. Update `last_checkpoint`. Write STATE.md.

---

## Auto Mode

When `--auto` is passed to the builder: if `tailwind.config.{js,cjs,mjs,ts}` exists -> Tailwind-only project (skip CSS file grep, parse tailwind.config for palette/spacing/font, use those as the baseline style signal). Else fall through to the existing CSS file grep logic. Detail: `../../reference/discover-procedure.md` §Auto Mode.

---

## Step 1 — Spawn design-context-builder

Spawn `design-context-builder` -> `.design/DESIGN-CONTEXT.md`. The agent auto-detects via grep/glob first and interviews only for areas where auto-detect returned no confident answer. Baseline audit directory chain: `src/` -> `app/` -> `pages/` -> `lib/` -> flag "layout unknown". Common gray areas to probe (Area 7): font-change risk, token-layer introduction risk, component rebuild-vs-restyle. Wait for `## CONTEXT COMPLETE`, then update STATE.md `task_progress = 0.5`. Full prompt: `../../reference/discover-procedure.md` §Step 1.

---

## Step 1.75 — Lazy gate: should design-context-checker run? (Plan 10.1-04, D-21)

Spawn the cheap Haiku gate `design-context-checker-gate` before the full checker. It applies the single-file heuristic (is `DESIGN-CONTEXT.md` in `git diff --name-only HEAD~1..HEAD`?) and emits JSON + `## GATE COMPLETE`. On `spawn: false`: append `lazy_skipped: true` telemetry row, skip Step 2, set STATE.md `<position>` as if checker passed. On `spawn: true`: proceed to Step 2. On first-run discover the gate always returns `spawn: true` (builder just wrote the file); the gate meaningfully short-circuits only on re-runs where the builder made no changes. Full prompt: `../../reference/discover-procedure.md` §Step 1.75.

**Parallel synthesizer note:** discover does not spawn parallel researchers in v1, so `skills/synthesize/` is not wired here. If future variants spawn N parallel interviewers, wire synthesize between dispatch and collate as in `skills/map/` Step 3.5.

---

## Step 2 — Spawn design-context-checker

Spawn `design-context-checker` with `<required_reading>` on STATE.md + DESIGN-CONTEXT.md. The agent validates DESIGN-CONTEXT.md across 6 dimensions and returns APPROVED or BLOCKED with per-dimension verdicts. Wait for `## CONTEXT CHECK COMPLETE`. Full prompt: `../../reference/discover-procedure.md` §Step 2.

---

## Step 3 — Handle checker verdict

- **APPROVED** -> proceed to state update.
- **BLOCKED** -> present blocked dimensions to user, offer fix-and-retry loop (re-spawn builder with specific fix instructions). Do not proceed to planning.

---

## State Update (exit)

1. Set `<position>` `status=completed`, `task_progress=1/1`.
2. Set `<timestamps>` `discover_completed_at=<ISO 8601 now>`.
3. Update `last_checkpoint`. Write STATE.md.

---

## After Writing

Print the "=== Discovery complete ===" block with saved path, baseline score, top key issues, and next step (`/get-design-done:plan`). Do not proceed to planning automatically unless `--auto` was passed. Template: `../../reference/discover-procedure.md` §After Writing.

## DISCOVER COMPLETE
