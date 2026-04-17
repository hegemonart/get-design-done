---
name: ultimate-design:compare
description: "Compute delta between DESIGN.md baseline (from scan) and DESIGN-VERIFICATION.md result (from verify). Reports per-category score delta, anti-pattern delta (resolved vs new), must-have pass/fail change, and design drift (regressions without covering tasks in DESIGN-PLAN.md). Writes .design/COMPARE-REPORT.md."
argument-hint: ""
user-invocable: true
---

# ultimate-design:compare — Baseline vs Result Delta

Standalone delta command. Computes the difference between the scan baseline (`DESIGN.md`) and the verification result (`DESIGN-VERIFICATION.md`), and flags design drift for any regression not covered by an explicit task in `DESIGN-PLAN.md`. Writes one artifact: `.design/COMPARE-REPORT.md`.

---

## Scope

This command is **standalone** — not a pipeline stage:

- Scoped strictly to delta between two existing files (COMP-02): `DESIGN.md` (baseline, from scan) and `DESIGN-VERIFICATION.md` (result, from verify).
- Does NOT require or implement a snapshot mechanism — multi-run history is deferred to V2-06.
- Does NOT mutate any pipeline artifact (`DESIGN.md`, `DESIGN-VERIFICATION.md`, `DESIGN-SUMMARY.md`, `DESIGN-CONTEXT.md`, `DESIGN-PLAN.md`, `.design/STATE.md`).
- Writes exactly ONE file: `.design/COMPARE-REPORT.md`.
- Output artifact prefix is `COMPARE-REPORT` — distinct from the pipeline namespace (`DESIGN-*.md`). No naming conflict.

---

## Pre-Flight Checks (Pitfall 3)

Required files — abort if either is missing:

```
.design/DESIGN.md              — baseline from scan
.design/DESIGN-VERIFICATION.md — result from verify
```

**Abort conditions:**

- If `.design/DESIGN.md` is missing:
  > "No baseline found. Run /ultimate-design scan first."

- If `.design/DESIGN-VERIFICATION.md` is missing:
  > "No verification result found. Run /ultimate-design verify first to produce DESIGN-VERIFICATION.md."

**Optional files** (graceful degradation if absent):

- `.design/DESIGN-CONTEXT.md` — used for must-have delta (COMP-03). If missing, skip the Must-Have Status section and emit note: "Must-have delta skipped: DESIGN-CONTEXT.md not found."
- `.design/DESIGN-PLAN.md` — used for drift detection (COMP-04). If missing, skip DRIFT flagging and emit note: "Drift detection skipped: no DESIGN-PLAN.md."

Confirm `.design/` directory exists. If absent, create it: `mkdir -p .design/`

---

## Step 1: Parse Category Scores

**Extract baseline scores from `.design/DESIGN.md`:**

Locate the category score table. Expected format:

```
| Category | Score | Notes |
|----------|-------|-------|
| Accessibility | 6/10 | ... |
```

Parse each row: extract category name and numeric score (e.g., `6` from `6/10`).

Store as `baseline_scores` map: `{ "Accessibility": 6, "Visual Hierarchy": 5, ... }`

**Extract result scores from `.design/DESIGN-VERIFICATION.md`:**

Locate the category score table in the Phase 1 output section. Same format as above.

Store as `result_scores` map: `{ "Accessibility": 8, "Visual Hierarchy": 6, ... }`

**Normalize category names:**
- Strip leading/trailing whitespace
- Apply title-case normalization (e.g., `anti-patterns` → `Anti-Patterns`)
- Match categories case-insensitively between the two tables

**Unmatched categories:**
- If a category appears in `DESIGN.md` but not `DESIGN-VERIFICATION.md` → flag as `[UNMATCHED-BASELINE]` and exclude from score delta
- If a category appears in `DESIGN-VERIFICATION.md` but not `DESIGN.md` → flag as `[UNMATCHED-RESULT]` and exclude from score delta
- Report all unmatched categories in the Notes section of `COMPARE-REPORT.md`
- Do NOT silently paper over category name mismatches

---

## Step 2: Compute Score Delta (COMP-03)

For each matched category:

```
delta = result_scores[category] - baseline_scores[category]
```

Classify each delta:
- `improvement` — delta > 0
- `no_change` — delta == 0
- `regression` — delta < 0

Record per category:
- `category` — name
- `baseline` — numeric score from DESIGN.md
- `result` — numeric score from DESIGN-VERIFICATION.md
- `delta` — signed integer
- `classification` — improvement / no_change / regression

Collect all regressed categories for drift detection in Step 5.

---

## Step 3: Anti-Pattern Delta (COMP-03)

**Enumerate anti-patterns in DESIGN.md (baseline):**

Scan for entries identified by BAN-*, SLOP-*, or labeled as anti-patterns in DESIGN.md. Collect identifiers or descriptions as `baseline_anti_patterns` set.

**Enumerate anti-patterns in DESIGN-VERIFICATION.md (result):**

Same scan against DESIGN-VERIFICATION.md. Collect as `result_anti_patterns` set.

**Compute delta:**

```
resolved  = baseline_anti_patterns - result_anti_patterns
           (present in baseline, absent in result — fixed)

new       = result_anti_patterns - baseline_anti_patterns
           (absent in baseline, present in result — introduced)

unchanged = intersection of both sets
           (still present in both)
```

Report all three groups.

---

## Step 4: Must-Have Pass/Fail Change (COMP-03)

**Skip condition:** If `.design/DESIGN-CONTEXT.md` is absent → emit note and skip this section.

**Extract must-haves:**
- Read `.design/DESIGN-CONTEXT.md` `<must_haves>` section
- Enumerate each declared must-have (ID + description)

**Read pass/fail status from DESIGN-VERIFICATION.md:**
- Locate the must-have status table in the verification output
- For each must-have: record status as `pass`, `fail`, or `not-evaluated`

**Report:**
- Each must-have's current status (pass | fail | not-evaluated)
- If DESIGN.md contained a must-have status section from a prior verify, compute change (pass→fail, fail→pass); otherwise report current status only

---

## Step 5: Design Drift Detection (COMP-04)

**Skip condition:** If `.design/DESIGN-PLAN.md` is absent → emit note: "Drift detection skipped: DESIGN-PLAN.md not found."

**Coverage map:**

Read `.design/DESIGN-PLAN.md` and extract the `Type:` field from each task entry. Build a coverage map of which design categories have at least one task of matching type:

```
Example: Type: accessibility → covers "Accessibility" category
         Type: color         → covers "Color" category
         Type: typography    → covers "Typography" category
```

Category-to-Type matching is case-insensitive and normalized (e.g., `visual-hierarchy` matches `Visual Hierarchy`).

**Drift check:**

For each category classified as `regression` in Step 2:

```
If category NOT in coverage_map:
  → flag: DRIFT: [category] regressed from <baseline> to <result> without a design task of Type:<category>
```

If all regressed categories are covered by tasks → emit: "No drift detected. All regressed categories are covered by tasks in DESIGN-PLAN.md."

If no regressions in Step 2 → emit: "No drift detected. No score regressions found."

---

## Step 6: Write COMPARE-REPORT.md (COMP-05)

Output path: `.design/COMPARE-REPORT.md`

This file MUST NOT be written to any of the pipeline-reserved paths (`DESIGN.md`, `DESIGN-VERIFICATION.md`, `DESIGN-SUMMARY.md`, `DESIGN-CONTEXT.md`, `DESIGN-PLAN.md`).

**Report structure:**

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
| ... | ... | ... | ... | ... |

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

<One of the following:>
- "No drift detected. No score regressions found."
- "No drift detected. All regressed categories are covered by tasks in DESIGN-PLAN.md."
- "DRIFT: [Category] regressed from <baseline> to <result> without a design task of Type:<category>"
- "Drift detection skipped: DESIGN-PLAN.md not found."

## Notes

Scope: delta between two existing artifacts (.design/DESIGN.md → .design/DESIGN-VERIFICATION.md).
No snapshot mechanism — multi-snapshot compare deferred to V2-06.
This report does not modify DESIGN.md, DESIGN-VERIFICATION.md, or any other pipeline artifact.
<List any UNMATCHED-BASELINE or UNMATCHED-RESULT categories here, if any.>
<If must-have section was skipped: "Must-have delta skipped: DESIGN-CONTEXT.md not found.">
<If drift detection was skipped: "Drift detection skipped: DESIGN-PLAN.md not found.">
```

If a section has no items (e.g., no anti-patterns in baseline), write "None."

---

## Constraints

This command MUST NOT:

- MUST NOT write to `DESIGN.md`, `DESIGN-VERIFICATION.md`, `DESIGN-SUMMARY.md`, `DESIGN-CONTEXT.md`, `DESIGN-PLAN.md`, or `.design/STATE.md`
- MUST NOT require or implement a snapshot system (V2-06 deferred)
- MUST abort with a clear actionable error message if `DESIGN-VERIFICATION.md` is missing (Pitfall 3)
- MUST abort with a clear actionable error message if `DESIGN.md` (baseline) is missing
- MUST produce exactly one output file: `.design/COMPARE-REPORT.md`
- MUST NOT reinterpret or silently normalize category names that do not match between files — report mismatches explicitly in the Notes section
- MUST NOT invoke design-auditor or any other pipeline agent

---

## Completion

After writing `.design/COMPARE-REPORT.md`, print a summary:

```
Compare complete. Improvements: N. Regressions: M. Drift flags: K. See .design/COMPARE-REPORT.md.
```

Where:
- `N` = count of categories classified as `improvement`
- `M` = count of categories classified as `regression`
- `K` = count of DRIFT flags emitted (0 if drift detection was skipped or no regressions)

Do not summarize individual issues in the completion message — the file contains the full detail.
