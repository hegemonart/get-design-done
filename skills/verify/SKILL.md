---
name: verify
description: "Stage 4 of the Ultimate Design pipeline. Compares post-design state against the baseline audit, checks all must-haves, scores NNG heuristics (H-01..H-10, 0–4 each), runs weighted category scoring (using audit-scoring.md), walks user through visual UAT, identifies gaps, and produces DESIGN-VERIFICATION.md. If gaps found, outputs a gap plan for targeted re-execution."
argument-hint: ""
user-invocable: true
---

# Ultimate Design — Verify

**Stage 4 of 4.** Reads `.design/DESIGN-SUMMARY.md` + `.design/DESIGN-CONTEXT.md`, writes `.design/DESIGN-VERIFICATION.md`.

You are the verification stage. Your job is not to redo design work — it is to measure whether what was built achieves what Discovery defined. You run four evaluation passes: automated audit scoring, must-have checks, NNG heuristic scoring, and visual UAT.

---

## Prerequisites

Read in this order:
1. `.design/DESIGN-CONTEXT.md` — goals, must-haves, baseline audit score
2. `.design/DESIGN-PLAN.md` — planned tasks and acceptance criteria
3. `.design/DESIGN-SUMMARY.md` — what was actually done
4. `${CLAUDE_PLUGIN_ROOT}/reference/audit-scoring.md` — scoring rubric
5. `${CLAUDE_PLUGIN_ROOT}/reference/heuristics.md` — NNG heuristics 0–4 scoring
6. `${CLAUDE_PLUGIN_ROOT}/reference/anti-patterns.md` — BAN/SLOP patterns for re-audit
7. `${CLAUDE_PLUGIN_ROOT}/reference/accessibility.md` — WCAG checklist

If DESIGN-SUMMARY.md doesn't exist:
> "No design summary found. Run `/ultimate-design:design` first."

---

## Phase 1 — Re-Audit (Category Scoring)

Re-run the same automated checks from the Discover stage. Score each category 0–10 using the rubric from `reference/audit-scoring.md`. Compare against `<baseline_audit>` from DESIGN-CONTEXT.md.

### Anti-Pattern Scan

Run the grep commands from `reference/anti-patterns.md`:

```bash
# BAN violations (each = −3 from Anti-Pattern score)
grep -rn "border-left:\s*[2-9]" src/ --include="*.css" --include="*.scss" --include="*.tsx" 2>/dev/null | head -5
grep -rn "background-clip:\s*text\|text-fill-color:\s*transparent" src/ 2>/dev/null | head -5
grep -rn "transition:\s*all" src/ 2>/dev/null | head -5
grep -rn "user-scalable=no\|maximum-scale=1" public/ 2>/dev/null | head -5

# SLOP signals (each = −1)
grep -rn "#6366f1\|#8b5cf6\|#06b6d4" src/ 2>/dev/null | head -5
grep -rn "backdrop-filter:\s*blur" src/ 2>/dev/null | head -5

# Accessibility
grep -rn "outline:\s*none\|outline:\s*0" src/ 2>/dev/null | head -5
grep -rn "prefers-reduced-motion" src/ 2>/dev/null | head -3
```

### Category Scores

Score each category using the audit-scoring.md rubric. For each category, cite 1–3 specific observations that justify the score.

```
Accessibility (weight 25%):
  Score: [N]/10
  Evidence: [what you observed — contrast values, focus rings, semantic HTML status]

Visual Hierarchy (weight 20%):
  Score: [N]/10
  Evidence: [primary CTA clarity, heading distinctiveness, spacing groups]

Typography (weight 15%):
  Score: [N]/10
  Evidence: [scale consistency, weight hierarchy, line-height values found]

Color (weight 15%):
  Score: [N]/10
  Evidence: [semantic consistency, palette origin, dark mode quality if applicable]

Layout & Spacing (weight 10%):
  Score: [N]/10
  Evidence: [grid alignment, spacing values found, max-width enforcement]

Anti-Patterns (weight 10%):
  BAN violations found: [N] × −3 = [−N]
  SLOP signals found: [N] × −1 = [−N]
  Score: max(0, 10 − [BAN×3] − [SLOP×1]) = [N]/10

Motion (weight 5%):
  Score: [N]/10
  Evidence: [easing values, reduced-motion presence, duration range]
```

**Weighted total:**
```
Score = (Accessibility × 0.25) + (Visual Hierarchy × 0.20) + (Typography × 0.15)
      + (Color × 0.15) + (Layout × 0.10) + (Anti-Patterns × 0.10) + (Motion × 0.05)
```

**Delta:**
```
Before: [baseline_score from DESIGN-CONTEXT.md]/100
After:  [new score]/100
Delta:  [+N or −N points]
```

Report:
```
━━━ Category Audit ━━━
Before → After
  Accessibility:    [N] → [N]  (+N)
  Visual Hierarchy: [N] → [N]  (+N)
  Typography:       [N] → [N]  (+N)
  Color:            [N] → [N]  (+N)
  Layout:           [N] → [N]  (+N)
  Anti-Patterns:    [N] → [N]  (+N)
  Motion:           [N] → [N]  (+N)
  ─────────────────────────────────
  Total:    [baseline]/100 → [new]/100  ([+N] improvement)
  Grade:    [before grade] → [after grade]
━━━━━━━━━━━━━━━━━━━━━
```

---

## Phase 2 — Must-Have Check

Work through every must-have from DESIGN-CONTEXT.md `<must_haves>` plus must-haves from DESIGN-PLAN.md.

For each must-have, determine verification method:

| Must-have type | Verification method |
|---|---|
| File exists | Check if file is present |
| Pattern in code | Grep for specific string/token |
| No pattern in code | Grep to confirm absence |
| Contrast ratio | Read color values from CSS/tokens, calculate ratio |
| Decision applied | Check if D-XX from DESIGN-CONTEXT.md is reflected in code |
| Acceptance criterion from plan | Cross-reference DESIGN-SUMMARY.md task results |

Mark each:
- `✓ PASS` — verified and confirmed
- `✗ FAIL` — verified and not met
- `? VISUAL` — cannot verify from code alone — queued for UAT

```
━━━ Must-Have Check ━━━
✓ [N] auto-verified PASS
✗ [N] auto-verified FAIL
? [N] require visual inspection

[if any FAIL]: Gaps found — flagged for gap analysis after UAT.
━━━━━━━━━━━━━━━━━━━━━
```

---

## Phase 3 — NNG Heuristic Scoring

Read `reference/heuristics.md`. Score each of the 10 heuristics 0–4 using the scoring rubric.

**Scoring: 0 = critical violation, 1 = major violation, 2 = minor violation, 3 = passes, 4 = excellent**

Score each based on what you observed in the codebase (Phase 1) and what was reported in DESIGN-SUMMARY.md:

| Heuristic | What to check in code |
|---|---|
| H-01 Visibility of status | Loading states present? Spinners, skeletons? Error states visible? `aria-busy`? |
| H-02 Real world match | Labels use domain language? Dates formatted for humans? No backend error codes? |
| H-03 User control & freedom | Cancel available in flows? Destructive confirmation? Undo for reversible actions? |
| H-04 Consistency & standards | Same action = same component across screens? Color semantic consistency? |
| H-05 Error prevention | Input validation before submit? Destructive actions require confirmation? |
| H-06 Recognition vs recall | Navigation options always visible? Form state preserved? Search shows query? |
| H-07 Flexibility & efficiency | Keyboard shortcuts exist? Bulk actions for lists? Power user paths? |
| H-08 Aesthetic & minimalist | One primary CTA per section? No competing priority elements? Visual hierarchy? |
| H-09 Error recovery | Error messages: what + why + how to fix? Errors near the causing element? |
| H-10 Help & documentation | Inline help for complex fields? Tooltips on icon-only buttons? |

Score each H-01..H-10 from 0–4. Total = sum/40 × 100.

```
━━━ NNG Heuristic Score ━━━
H-01 Visibility of status:  [N]/4  [brief note]
H-02 Real world match:      [N]/4  [brief note]
H-03 User control/freedom:  [N]/4  [brief note]
H-04 Consistency:           [N]/4  [brief note]
H-05 Error prevention:      [N]/4  [brief note]
H-06 Recognition vs recall: [N]/4  [brief note]
H-07 Flexibility/efficiency:[N]/4  [brief note]
H-08 Aesthetic/minimalist:  [N]/4  [brief note]
H-09 Error recovery:        [N]/4  [brief note]
H-10 Help/documentation:    [N]/4  [brief note]
──────────────────────────────────
Total: [N]/40 = [N×2.5]/100  [grade interpretation]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Phase 4 — Visual UAT

For each `? VISUAL` must-have plus key brand/tone goals from DESIGN-CONTEXT.md, present checks one at a time.

Also check:
- Brand tone: does the UI read as [tone word] · [tone word] · [tone word] at first glance?
- Anti-pattern check: is there any evidence of the NOT from DESIGN-CONTEXT.md brand direction?
- Reference alignment: does the design borrow the right elements from R-01, R-02?
- Hierarchy: can you identify the primary CTA on each key screen without hunting?

Format each check:

```
━━━ Visual Check [N/M] ━━━
Goal: [the must-have or brand goal being checked]
What to look for: [concrete observable description of what PASS looks like]

Does this pass? (yes / no [describe issue] / skip)
━━━━━━━━━━━━━━━━━━━━━━━━━
```

Record each response. For `no` responses, capture the user's issue description verbatim — it goes directly into the gap plan.

---

## Phase 5 — Gap Analysis

Collect all failures:
- Phase 1 category scores still below 7 (despite design pass)
- Phase 2 `✗ FAIL` must-haves
- Phase 3 NNG scores of 0 or 1 on any heuristic
- Phase 4 visual UAT `no` responses

Classify each:
- `BLOCKER` — core goal not met, design is incomplete; blocks shipping
- `MAJOR` — significant deviation from intent; should be fixed this pass
- `MINOR` — noticeable issue; fix if time allows
- `COSMETIC` — polish only; defer

For BLOCKER + MAJOR gaps, generate a targeted gap plan:

```markdown
### Gap [NN] — [Description]
Severity: BLOCKER | MAJOR
Category: [scoring category or heuristic]
Root cause: [why this didn't pass despite the design pass]
Fix: [Concrete instruction — what task type, what files, what to change]
Acceptance: [What PASS looks like]
Estimated scope: [minimal change vs. significant rework]
```

Present to the user:

```
━━━ Gaps found ━━━
BLOCKER: [N]
MAJOR:   [N]
MINOR:   [N]
COSMETIC:[N]

Options:
  1. Fix now — re-run the gap plan immediately
  2. Save and exit — gap plan in DESIGN-VERIFICATION.md, fix in next session
  3. Accept as-is — mark verified with known gaps

Your choice:
━━━━━━━━━━━━━━━━
```

If "Fix now": treat the gap plan as a mini DESIGN-PLAN.md. Execute each BLOCKER/MAJOR gap task sequentially using the Design stage's task execution approach. Then re-run Phases 1–3 after fixes.

---

## Output: DESIGN-VERIFICATION.md

Write `.design/DESIGN-VERIFICATION.md`:

```markdown
---
project: [name]
verified: [ISO 8601]
status: passed | passed-with-gaps | failed
baseline_score: [N]/100
result_score: [N]/100
delta: [+N or −N]
nng_score: [N]/100
must_haves_total: [N]
must_haves_passed: [N]
---

## Category Audit

| Category | Baseline | Result | Delta | Weight | Weighted |
|---|---|---|---|---|---|
| Accessibility | [N]/10 | [N]/10 | [±N] | 25% | [N] |
| Visual Hierarchy | [N]/10 | [N]/10 | [±N] | 20% | [N] |
| Typography | [N]/10 | [N]/10 | [±N] | 15% | [N] |
| Color | [N]/10 | [N]/10 | [±N] | 15% | [N] |
| Layout | [N]/10 | [N]/10 | [±N] | 10% | [N] |
| Anti-Patterns | [N]/10 | [N]/10 | [±N] | 10% | [N] |
| Motion | [N]/10 | [N]/10 | [±N] | 5% | [N] |
| **Total** | **[N]/100** | **[N]/100** | **[±N]** | | |

Grade: [before] → [after]

### Remaining Violations

| ID | Category | Description | Severity |
|---|---|---|---|
| [BAN/SLOP code] | Anti-Patterns | [description] | [P0–P3] |

---

## Must-Have Results

| # | Must-Have | Method | Result |
|---|---|---|---|
| M-01 | [text] | auto | ✓ PASS |
| M-02 | [text] | visual | ✗ FAIL |

---

## NNG Heuristic Scores

| Heuristic | Score /4 | Notes |
|---|---|---|
| H-01 Visibility of status | [N]/4 | [note] |
| H-02 Real world match | [N]/4 | [note] |
| H-03 User control/freedom | [N]/4 | [note] |
| H-04 Consistency | [N]/4 | [note] |
| H-05 Error prevention | [N]/4 | [note] |
| H-06 Recognition vs recall | [N]/4 | [note] |
| H-07 Flexibility/efficiency | [N]/4 | [note] |
| H-08 Aesthetic/minimalist | [N]/4 | [note] |
| H-09 Error recovery | [N]/4 | [note] |
| H-10 Help/documentation | [N]/4 | [note] |
| **Total** | **[N]/40** | **= [N]/100** |

---

## Visual UAT

| Check | Result | User Notes |
|---|---|---|
| [brand tone check] | ✓ PASS | [user response] |
| [anti-pattern check] | ✗ FAIL | [user description] |

---

## Gap Plan

[Generated gap plan with severity-classified items — empty if all passed]

### Gap 01 — [description]
Severity: [BLOCKER/MAJOR/MINOR/COSMETIC]
Category: [audit category or heuristic]
Root cause: [why it didn't pass]
Fix: [concrete instruction]
Acceptance: [what pass looks like]

---

## Session Summary

Design direction: [tone words from DESIGN-CONTEXT.md]
Tasks completed: [N from DESIGN-SUMMARY.md]
Category score: [baseline] → [result] ([±N] improvement)
NNG score: [N]/100
Must-haves: [N passed] / [N total]
Overall status: [passed | passed-with-gaps | failed]

Deferred to next session:
- [anything from DESIGN-CONTEXT.md <deferred> still applicable]
```

---

## After Writing

**Status: passed:**
```
━━━ ✓ Verification passed ━━━
Category score: [N]/100 [grade] ([+N] from baseline)
NNG score:      [N]/100
All must-haves confirmed. Design session complete.

Artifacts in .design/:
  DESIGN-CONTEXT.md    (discovery context + baseline)
  DESIGN-PLAN.md       (executed plan)
  DESIGN-SUMMARY.md    (task results)
  DESIGN-VERIFICATION.md (final scores + sign-off)

Start next session: /ultimate-design:discover
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Status: passed-with-gaps:**
```
━━━ ✓ Verified with known gaps ━━━
Category score: [N]/100 [grade] ([+N] from baseline)
NNG score:      [N]/100
Minor gaps accepted. Gap plan in DESIGN-VERIFICATION.md.
Resume: /ultimate-design:design (executes gap plan)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Status: failed:**
```
━━━ ✗ Verification failed ━━━
Category score: [N]/100 [grade]
NNG score:      [N]/100
[N] blockers found. Gap plan in DESIGN-VERIFICATION.md.
Fix: /ultimate-design:design (re-runs gap plan tasks)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
