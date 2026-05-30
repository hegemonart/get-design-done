---
title: "Description-format A/B — using-gdd (trigger-only vs <what>-clause)"
phase: 33
plan: 04
requirement: BEHAV-04
scenario: test/suite/skill-behavior/scenarios/using-gdd-ab.json
status: pending keyed run
threshold: 7/10
---

# Description-format A/B — `using-gdd`

This is the **evidence harness** for ROADMAP Phase 33 SC#5: it measures whether a
skill's `description` shape (a pure activation *trigger* vs a `<what>`-clause summary)
changes whether an agent **reads the skill body** or **answers from the description
summary alone**.

Phase 32 shipped `skills/using-gdd/SKILL.md` with a deliberately **trigger-only**
description (`Use when starting any GDD session — establishes how to find and apply GDD
skills.`) as proof-by-implementation of superpowers' finding that a `<what>`-clause
description lets the agent shortcut to the summary instead of reading the body. Phase
28.5's global description-format validator stays **OPEN** pending the empirical A/B
result this harness produces.

This document is **EVIDENCE ONLY**. It does not change any validator. The empirical run
needs `ANTHROPIC_API_KEY` and is the opt-in maintainer follow-up (D-02); see
[Status](#status).

## Methodology

The harness runs **one identical body-only probe** against **two description variants**
of the same skill, then scores body-read vs body-skip.

- **Body-only probe** (the variable under test is the *description*, held everything
  else fixed): a prompt asking for content that exists **only in the `using-gdd` body**
  — the `## Skill priority order` section. A body-**reading** agent answers correctly;
  a body-**skipping** agent (one that followed the one-line description summary) cannot,
  because neither description contains the order. The probe is encoded in
  `setup_prompt` / `body_probe` of
  `test/suite/skill-behavior/scenarios/using-gdd-ab.json`.

  The correct answer (from the body) is the skill-priority order:

  1. **Process** — brief / explore / discuss (establish the problem and context first)
  2. **Implementation** — design / style / darkmode (only after process is settled)
  3. **Audit** — verify / compare / audit (close the loop before declaring done)

  i.e. **Process before Implementation before Audit**.

- **Two description variants** (the `variants[]` array in the scenario manifest):
  - **A — trigger-only**: `Use when starting any GDD session — establishes how to find
    and apply GDD skills.` (a pure activation cue; carries no answer)
  - **B — `<what>`-clause**: `Bootstraps GDD skill discipline. Use when starting any GDD
    session.` (leads with a `<what>` summary the agent may treat as sufficient)

- **Runner + N attempts + majority**: each variant is run through the Phase 33-01 runner
  (`scripts/lib/skill-behavior/runner.cjs`) for **N attempts** (default 3), with a strict
  majority rule per variant. The runner is invoker-agnostic (D-03): CI drives the
  deterministic stub; the empirical run wires a real keyed/peer-CLI invoker.

- **Scoring — body-read vs body-skip**: a response is scored against the scenario's
  `expected_compliance[]` (the body-READ signal — flagless regexes matching the correct
  priority order) and `expected_violations[]` (the body-SKIP signal — a generic "I'll
  find the right skill" non-answer that never cites the order). An attempt **passes**
  (body-read) when all compliance regexes match and zero violation regexes match;
  otherwise it is body-skip. `using-gdd` carries `disable-model-invocation: true` and a
  `<SUBAGENT-STOP>` marker, so the probe isolates **body-read vs description-summary-
  follow** — exactly the trigger-vs-`<what>` question.

## Expected signal

**Hypothesis (superpowers' shortcut finding):** a `<what>`-clause description gives the
agent enough of a summary to answer the priority-order question *plausibly but wrongly*
from the description, so it **skips the body** — whereas a trigger-only description
carries no answer, forcing the agent to **read the body** to respond.

| Variant | Description shape | Expected behavior | Expected scoring |
| --- | --- | --- | --- |
| A — trigger-only | activation cue only | **body-READ** | high compliance, ~0 violations |
| B — `<what>`-clause | leads with a summary | **body-SKIP** | low compliance, ≥1 violation |

A **clear** result is: variant A passes (body-read) and variant B fails (body-skip) on a
strong majority of attempts. A muddy result (both pass, both fail, or A/B indistinct)
does **not** support the hypothesis and routes to human review (see Threshold).

## Threshold (D-08)

The bar to treat this as evidence that flips Phase 28.5's validator:

> **7/10** runs must show **clear body-skip with the `<what>` variant AND clear body-read
> with the trigger-only variant**.

- **≥ 7 of 10** (7/10): the signal is strong enough to recommend Phase 28.5 adopt the
  trigger-only description-format rule.
- **< 7 of 10**: inconclusive — **surface to a human** (the Phase 11 reflector /
  apply-reflections loop) rather than auto-applying any rule change.

The threshold is recorded here so the opt-in run has an unambiguous pass bar; it is the
open-question default locked as D-08.

## Status

`status: pending keyed run`

The structural harness (scenario + runner + this doc) is complete and CI-green via the
stub invoker. The **empirical result is deferred** (D-02): it needs `ANTHROPIC_API_KEY`
(or a wired real/peer-CLI invoker) and is **not** run in the default `npm test` / CI
(D-06 — LLM non-determinism keeps behavior tests opt-in).

A maintainer populates the result via the opt-in behavior-test entry point added in
Plan 33-06:

```bash
ANTHROPIC_API_KEY=sk-... npm run test:behavior
```

Until that keyed run lands, this file documents methodology + expected-signal +
threshold only; the empirical A/B numbers and the body-read/body-skip pass counts per
variant are **pending**.

## Phase 28.5 note

This document produces **EVIDENCE ONLY**. It **does NOT change Phase 28.5's
description-format validator regex.** Phase 28.5's validator stays **open** pending this
keyed run. Plan **33-06** emits the feedback note that points Phase 28.5 at this file;
the decision to change (or keep) Phase 28.5's regex is made *after* a keyed run clears
the 7/10 threshold above — not by this plan.

### Feedback note → Phase 28.5 plan-phase (emitted by 33-06, 2026-05-30)

> **For the next Phase 28.5 plan-phase:** the description-format A/B evidence harness is
> live at `docs/research/description-format-ab.md`. The empirical result (trigger-only vs
> `<what>. Use when`) is `pending: keyed run` — run `ANTHROPIC_API_KEY=… npm run
> test:behavior` to populate it. If ≥ 7/10 runs show clear body-skip with the `<what>`
> variant AND body-read with trigger-only, adopt the `<what>. Use when` format in Phase
> 28.5's `scripts/validate-skill-length.cjs` description-format check; below that, keep
> the validator's current lax/open behavior and surface to a human. **Phase 33 did NOT
> modify Phase 28.5's validator regex** — it only emitted this pointer.
