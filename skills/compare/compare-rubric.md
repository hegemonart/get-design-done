---
name: compare-rubric
type: heuristic
version: 1.0.0
phase: 28.5
tags: [compare, delta, drift, scoring, rubric, extracted]
last_updated: 2026-05-18
---

Source: extracted from `skills/compare/SKILL.md` (Phase 28.5 rework — D-10 extract-then-link).
The skill's load-bearing workflow stays in `../skills/compare/SKILL.md`; this file holds the
delta-computation methodology, anti-pattern set arithmetic, drift-detection coverage map,
and the `COMPARE-REPORT.md` template the skill writes.

# Compare Rubric — Baseline vs Result Delta Methodology

Detailed methodology for the `get-design-done:compare` standalone command — companion to
`../skills/compare/SKILL.md`. Read this file when executing a specific compare step (score
delta math, anti-pattern set arithmetic, drift coverage map, report layout). The SKILL.md
keeps the load-bearing pre-flight checks + step routing; this file holds the deep methodology.

See `./shared-preamble.md#output-contract-reminders` for the per-skill output discipline and
`./audit-scoring.md` for the 0–10 category-scoring rubric the delta is computed against.

---

## Step 1 — Parse Category Scores

**Extract baseline scores from `.design/DESIGN.md`:** locate the category score table (rows like `| Accessibility | 6/10 | ... |`). Parse each row: extract category name + numeric score. Store as `baseline_scores` map.

**Extract result scores from `.design/DESIGN-VERIFICATION.md`:** locate the same table in the Phase 1 output section. Store as `result_scores` map.

**Normalize category names:**
- Strip leading/trailing whitespace.
- Apply title-case normalization (e.g., `anti-patterns` → `Anti-Patterns`).
- Match categories case-insensitively between the two tables.

**Unmatched categories:**
- Baseline-only → flag `[UNMATCHED-BASELINE]`, exclude from score delta.
- Result-only → flag `[UNMATCHED-RESULT]`, exclude from score delta.
- Report all unmatched categories in the Notes section. Do NOT silently paper over mismatches.

## Step 2 — Compute Score Delta (COMP-03)

For each matched category: `delta = result_scores[category] - baseline_scores[category]`.

Classify:
- `improvement` — delta > 0
- `no_change` — delta == 0
- `regression` — delta < 0

Record per category: name, baseline score, result score, signed delta, classification. Collect regressed categories for drift detection in Step 5.

## Step 3 — Anti-Pattern Delta

Enumerate anti-patterns in both files (entries identified by BAN-*, SLOP-*, or labeled as anti-patterns). Collect identifiers or descriptions as sets.

Compute set arithmetic:

```
resolved  = baseline_anti_patterns - result_anti_patterns
           (present in baseline, absent in result — fixed)

new       = result_anti_patterns - baseline_anti_patterns
           (absent in baseline, present in result — introduced)

unchanged = intersection of both sets
           (still present in both)
```

Report all three groups in the output report.

## Step 4 — Must-Have Pass/Fail Change

**Skip condition:** if `.design/DESIGN-CONTEXT.md` is absent → emit note and skip this section.

Read `<must_haves>` from `DESIGN-CONTEXT.md` (each must-have has ID + description). Read pass/fail status from `DESIGN-VERIFICATION.md` (must-have status table). For each must-have: record `pass`, `fail`, or `not-evaluated`. If `DESIGN.md` contained a prior must-have status section, compute the change (`pass→fail`, `fail→pass`); otherwise report current status only.

## Step 5 — Design Drift Detection (COMP-04)

**Skip condition:** if `.design/DESIGN-PLAN.md` is absent → emit `"Drift detection skipped: DESIGN-PLAN.md not found."` in the Drift section.

**Coverage map:** read `DESIGN-PLAN.md` and extract the `Type:` field from each task. Build a map of which design categories have at least one task of matching Type:

```
Type: accessibility   → covers "Accessibility" category
Type: color           → covers "Color" category
Type: typography      → covers "Typography" category
Type: visual-hierarchy → covers "Visual Hierarchy" category
```

Category-to-Type matching is case-insensitive and normalized.

**Drift check:** for each category classified as `regression` in Step 2: if category NOT in coverage_map → emit `DRIFT: [category] regressed from <baseline> to <result> without a design task of Type:<category>`.

Emit `"No drift detected. All regressed categories are covered by tasks in DESIGN-PLAN.md."` if all regressed categories are covered. Emit `"No drift detected. No score regressions found."` if no regressions in Step 2.

## Step 5B — Screenshot Delta (when preview: available)

Check `preview` status from `.design/STATE.md <connections>` (written by the probe at stage entry — see `./shared-preamble.md#connection-handshake-summary`).

**If `preview: available`:**

1. `preview_start` if no session is already running.
2. For each route inferred from `DESIGN-PLAN.md` tasks or `src/app/` / `src/pages/` file structure:
   a. `preview_navigate` to route URL (e.g., `http://localhost:3000/<route>`).
   b. `preview_screenshot` → save to `.design/screenshots/before/<route>.png` (only if a prior baseline exists at this path) and `.design/screenshots/after/<route>.png` (current render).
   c. Record reference paths (NOT base64) for embedding in the `## Screenshot Delta` section.
3. `preview_stop` when all routes are captured.

**If `preview: unavailable` or `preview: not_configured`:** emit exactly `Screenshot delta skipped — preview not configured.`

## Step 6 — COMPARE-REPORT.md Template

Output path: `.design/COMPARE-REPORT.md`. This file MUST NOT be written to any pipeline-reserved path.

```markdown
# Compare Report: Baseline vs Result

**Generated:** <ISO 8601 date>
**Baseline:** .design/DESIGN.md
**Result:** .design/DESIGN-VERIFICATION.md

## Score Delta by Category

| Category | Baseline | Result | Delta | Status |
|----------|----------|--------|-------|--------|
| Accessibility | 6 | 8 | +2 | improvement |
| Visual Hierarchy | 5 | 5 | 0 | no_change |
| Anti-Patterns | 4 | 3 | -1 | regression |

## Anti-Pattern Delta

**Resolved** (present in baseline, absent in result):
- <anti-pattern id or description>

**New** (absent in baseline, present in result):
- <anti-pattern id or description>

**Unchanged:**
- <anti-pattern id or description>

## Must-Have Status

| Must-Have | Status |
|-----------|--------|
| <id / description> | pass |
| <id / description> | fail |
| <id / description> | not-evaluated |

## Design Drift

<One of: "No drift detected. ..." | "DRIFT: [Category] regressed ..." | "Drift detection skipped: DESIGN-PLAN.md not found.">

## Screenshot Delta

<Per-route screenshot pairs OR "Screenshot delta skipped — preview not configured.">

## Notes

Scope: delta between two existing artifacts (.design/DESIGN.md → .design/DESIGN-VERIFICATION.md).
No snapshot mechanism — multi-snapshot compare deferred to V2-06.
This report does not modify DESIGN.md, DESIGN-VERIFICATION.md, or any other pipeline artifact.
<List any UNMATCHED-BASELINE or UNMATCHED-RESULT categories here, if any.>
```

If a section has no items (e.g., no anti-patterns in baseline), write "None."

---

*Imported by: `../skills/compare/SKILL.md`. Maintained as part of Phase 28.5 (Bucket 2 rework — D-10).*
