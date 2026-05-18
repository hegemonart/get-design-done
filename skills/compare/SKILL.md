---
name: get-design-done:compare
description: "Compute the delta between the `DESIGN.md` baseline (from scan) and the `DESIGN-VERIFICATION.md` result (from verify), reporting per-category score delta, anti-pattern delta (resolved vs new), must-have pass/fail change, and design drift (regressions without covering tasks in `DESIGN-PLAN.md`). Use after `verify` to measure whether a design pipeline cycle actually improved the design. Writes `.design/COMPARE-REPORT.md`."
argument-hint: ""
user-invocable: true
---

# get-design-done:compare — Baseline vs Result Delta

Standalone delta command. Computes the difference between the scan baseline (`DESIGN.md`) and the verification result (`DESIGN-VERIFICATION.md`), and flags design drift for any regression not covered by an explicit task in `DESIGN-PLAN.md`. Writes one artifact: `.design/COMPARE-REPORT.md`.

For the full step-by-step methodology (score parsing, set arithmetic for anti-patterns, drift-coverage map, screenshot-delta probe, and `COMPARE-REPORT.md` template), see `./compare-rubric.md`. For the cross-skill output discipline (artifact prefix, completion marker, MUST-NOT-write list, connection-probe pattern), see `../../reference/shared-preamble.md#output-contract-reminders` and `../../reference/shared-preamble.md#connection-handshake-summary`. For the underlying 0–10 category-scoring rubric the delta is computed against, see `../../reference/audit-scoring.md`.

---

## Scope

This command is **standalone** — not a pipeline stage:

- Scoped strictly to delta between two existing files (COMP-02): `DESIGN.md` (baseline, from scan) and `DESIGN-VERIFICATION.md` (result, from verify).
- Does NOT require or implement a snapshot mechanism — multi-run history is deferred to V2-06.
- Does NOT mutate any pipeline artifact (`DESIGN.md`, `DESIGN-VERIFICATION.md`, `DESIGN-SUMMARY.md`, `DESIGN-CONTEXT.md`, `DESIGN-PLAN.md`, `.design/STATE.md`).
- Writes exactly ONE file: `.design/COMPARE-REPORT.md`.
- Output artifact prefix `COMPARE-REPORT` is distinct from the pipeline namespace (`DESIGN-*.md`). No naming conflict.

---

## Pre-Flight Checks (Pitfall 3)

Required files — abort if either is missing:

- `.design/DESIGN.md` missing → `"No baseline found. Run /get-design-done scan first."`
- `.design/DESIGN-VERIFICATION.md` missing → `"No verification result found. Run /get-design-done verify first to produce DESIGN-VERIFICATION.md."`

**Optional files (graceful degradation if absent):**

- `.design/DESIGN-CONTEXT.md` — used for must-have delta. If missing, skip the Must-Have Status section and emit note: `"Must-have delta skipped: DESIGN-CONTEXT.md not found."`
- `.design/DESIGN-PLAN.md` — used for drift detection. If missing, skip DRIFT flagging and emit note: `"Drift detection skipped: no DESIGN-PLAN.md."`

Confirm `.design/` directory exists. If absent: `mkdir -p .design/`.

Probe `preview` connection per `../../reference/shared-preamble.md#connection-handshake-summary` (ToolSearch → live call → STATE.md write). Result drives Step 5B (screenshot delta).

---

## Workflow

1. **Parse Category Scores** — extract baseline + result score tables, normalize names, flag unmatched. Detail: `./compare-rubric.md#step-1--parse-category-scores`.
2. **Compute Score Delta** — `delta = result - baseline`, classify (`improvement`/`no_change`/`regression`). Detail: `./compare-rubric.md#step-2--compute-score-delta-comp-03`.
3. **Anti-Pattern Delta** — set arithmetic on baseline vs result anti-pattern sets (resolved / new / unchanged). Detail: `./compare-rubric.md#step-3--anti-pattern-delta`.
4. **Must-Have Pass/Fail Change** — read `<must_haves>` from `DESIGN-CONTEXT.md`, status from `DESIGN-VERIFICATION.md`. Detail: `./compare-rubric.md#step-4--must-have-passfail-change`.
5. **Design Drift Detection (COMP-04)** — build coverage map from `DESIGN-PLAN.md` `Type:` fields; for each `regression` not in coverage_map → emit `DRIFT: [category] ...`. Detail: `./compare-rubric.md#step-5--design-drift-detection-comp-04`.
6. **Screenshot Delta (preview: available only)** — capture per-route screenshots to `.design/screenshots/{before,after}/<route>.png`. Detail: `./compare-rubric.md#step-5b--screenshot-delta-when-preview-available`.
7. **Write `.design/COMPARE-REPORT.md`** — full template at `./compare-rubric.md#step-6--compare-reportmd-template`.

---

## Constraints

This command MUST NOT (per `../../reference/shared-preamble.md#output-contract-reminders`):

- Write to `DESIGN.md`, `DESIGN-VERIFICATION.md`, `DESIGN-SUMMARY.md`, `DESIGN-CONTEXT.md`, `DESIGN-PLAN.md`, or `.design/STATE.md`.
- Require or implement a snapshot system (V2-06 deferred).
- Reinterpret or silently normalize category names that do not match between files — report mismatches in the Notes section.
- Invoke `design-auditor` or any other pipeline agent.
- Produce more than one output file: `.design/COMPARE-REPORT.md`.

Must abort with a clear actionable error message if either input file (`DESIGN.md` baseline, `DESIGN-VERIFICATION.md` result) is missing.

---

## Completion

After writing `.design/COMPARE-REPORT.md`, print a summary:

```
Compare complete. Improvements: N. Regressions: M. Drift flags: K. See .design/COMPARE-REPORT.md.
```

Where `N` = improvement count, `M` = regression count, `K` = DRIFT-flag count (0 if drift detection was skipped or no regressions). Do not summarize individual issues — the file contains the full detail.

## COMPARE COMPLETE
