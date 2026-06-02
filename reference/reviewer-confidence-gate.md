---
name: reviewer-confidence-gate
type: meta-rules
version: 1.0.0
phase: 49
tags: [review, confidence, audit, verify, gap, routing, anti-slop]
last_updated: 2026-06-03
---

# Reviewer Confidence Gate

Audit and verify findings can inflate severity without proof. A grep hit gets reported as a BLOCKER; a single line read out of context becomes a MAJOR. This contract adds a confidence discipline so review agents (`design-auditor`, `design-verifier`, `design-debt-crawler`) earn the severity they assign, and so `design-fixer` only auto-applies fixes that are backed by evidence.

Every emitting agent runs the Pre-Report Gate before writing a finding, stamps each finding with a `confidence` score, and parks weak findings in a `## Tentative` section that the fixer never reads. The routing helper `scripts/lib/confidence-route.cjs` encodes the same rule in code.

## Pre-Report Gate

Before you emit any finding or gap, answer these four questions. If you cannot answer all four with a clear yes, the finding is not ready to ship at its stated severity.

- **a. Can I cite `file:line`?** Point at the exact location. A finding with no concrete location is a hunch, not a defect.
- **b. Can I state the failure mode in one sentence?** Name what breaks for the user or the build. If the sentence needs an "and" plus a "maybe", the finding is two findings or none.
- **c. Did I read context beyond the modified file?** Confirm the call site, the token definition, or the parent component. A value that looks wrong in isolation is often correct once you read what feeds it.
- **d. Is the severity defensible?** A BLOCKER blocks shipping. A MAJOR is a real deviation from intent. If you would not defend the label to the author, lower it.

## The `confidence` field

Every finding carries a `confidence: 0.0-1.0` field. It records how sure you are that the finding is real and correctly classified, not how bad the issue is. Severity and confidence are independent axes: a cosmetic issue can be high confidence, and a suspected BLOCKER can be low confidence.

| Range | Meaning | Where it goes |
|-------|---------|---------------|
| `>= 0.8` | Cited `file:line`, one-sentence failure mode, context read. | Reported at full severity; eligible for auto-fix. |
| `0.5 - 0.8` | Real signal, but evidence is partial or context is incomplete. | Reported, routed to user review, never auto-fixed. |
| `< 0.5` | A hunch, a guess, or a pattern match you could not confirm. | Moved to `## Tentative`; never reaches `design-fixer`. |

## Routing rule

The gate controls what reaches the fixer. The rule is:

- A HIGH severity finding (BLOCKER or MAJOR) requires `confidence >= 0.8` **and** a `file:line` citation **and** a one-sentence failure mode. Below `0.8`, a HIGH finding is surfaced for user review instead of auto-fix.
- A finding with `confidence < 0.5` stays in the `## Tentative` section and never reaches `design-fixer`.
- A finding with `confidence` in the `0.5 - 0.8` band is surfaced in the report but routed to user review, not auto-fix.

`scripts/lib/confidence-route.cjs` exports `route({ severity, confidence, tentative })` and returns `'fix'`, `'user-review'`, or `'drop'`. Agents and the fixer share this single decision so the matrix stays consistent.

### Routing matrix

The full decision table the helper encodes:

| Severity | `tentative` | confidence | Destination |
|----------|-------------|------------|-------------|
| any | `true` | any | `drop` (never reaches fixer) |
| any | `false` | `< 0.5` | `drop` (stays tentative) |
| BLOCKER or MAJOR | `false` | `0.5 - 0.8` | `user-review` |
| BLOCKER or MAJOR | `false` | `>= 0.8` | `fix` |
| MINOR or COSMETIC | `false` | `0.5 - 0.8` | `user-review` |
| MINOR or COSMETIC | `false` | `>= 0.8` | `fix` |

Read the table as: tentative wins first, then the `0.5` floor, then the severity-specific `0.8` auto-fix gate.

## How to emit a finding

After the Pre-Report Gate passes, write the finding with the `confidence` field on its own line inside the existing locked format. For `design-verifier` gaps this sits alongside the other gap fields:

```text
### BLOCKER G-01: raw error object rendered on payment failure
- Phase: 2
- Description: Checkout.tsx renders the error object directly
- Expected: a human-readable failure message
- Actual: users see "[object Object]"
- Location: src/Checkout.tsx:88
- Suggested fix: render error.message with a fallback string
- confidence: 0.85
```

A finding that scores `< 0.5` is not written in the gap list at all. It goes under a `## Tentative` heading in the same report, in plain prose, so a human can promote it later if context proves it real.

## Paired examples

Each pair shows a raw finding (before the gate) and the same finding after the gate corrects it.

### Example 1: severity inflated, no context read

**Before:** `BLOCKER: hardcoded color #1a73e8 in Button.tsx breaks theming.`

**After:** `MINOR G-04: raw #1a73e8 instead of a semantic token. confidence: 0.9`. Reading context (question c) showed `Button.tsx:42` is the token definition file, so theming is not broken; the issue is a style-coherence nit, not a shipping blocker. High confidence, low severity.

### Example 2: a grep guess that could not be confirmed

**Before:** `MAJOR: missing reduced-motion guard, animations will trigger vestibular issues.`

**After:** moved to `## Tentative` with `confidence: 0.4`. The grep matched `framer-motion` but question a failed: no single `file:line` proves the guard is absent app-wide, and a root `MotionConfig` may cover it. Parked as tentative; the fixer never sees it.

### Example 3: real defect, evidence complete

**Before:** `error states look weak somewhere in the checkout flow.`

**After:** `BLOCKER G-01: Checkout.tsx:88 renders the raw error object, so users see "[object Object]" on a failed payment. confidence: 0.85`. All four questions pass: cited location, one-sentence failure mode, call site read, severity defensible. Auto-fix eligible.

### Example 4: partial evidence, honest mid-band score

**Before:** `MAJOR: empty state copy is generic across the app.`

**After:** `MINOR G-06: Inbox.tsx:30 empty state reads "No data". confidence: 0.65`. One real instance is cited, but question c is only half done: the "across the app" claim was not verified. Scored mid-band, surfaced for user review rather than auto-fixed, and the severity was lowered to match the single confirmed instance.

## Agent integration

- `design-auditor`, `design-verifier`, and `design-debt-crawler` run the Pre-Report Gate, stamp each finding with `confidence`, and route sub-0.5 findings to `## Tentative`.
- `design-fixer` skips every gap in `## Tentative` and skips BLOCKER or MAJOR gaps whose `confidence < 0.8`, routing those to user review instead of auto-fix.
