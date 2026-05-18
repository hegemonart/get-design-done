---
name: adr-format
type: meta-rules
version: 1.0.0
phase: 28.5
tags: [adr, decision, project-scoped, architecture, offer-gate]
last_updated: 2026-05-18
---

Source: mattpocock/skills (MIT) — adapted with permission. See `../NOTICE` for the full attribution block.

# ADR Format

An Architecture Decision Record (ADR) is a project-scoped record of a decision that
outlives the current cycle. ADRs live at `docs/adr/NNNN-<slug>.md` (zero-padded sequence,
kebab-case slug) and are offered SPARINGLY — only when all three criteria of the offer
gate hold (D-04). Most decisions stay in `STATE.md` and roll over with the cycle; ADRs
are the rare exception. See `./context-md-format.md` for the lighter glossary form that
shares the same project-scoped lifetime.

## 3-criteria offer gate

ALL THREE criteria must hold for the agent to offer an ADR. If ANY criterion fails, keep
the decision in `STATE.md` instead.

- **hard-to-reverse.** Undoing this decision requires migrating data, breaking APIs, or
  coordinating across multiple teams or agents. Routine code changes do not qualify.
- **surprising-without-context.** A reader six months from now, given only the codebase,
  would be confused. The rationale must be NON-OBVIOUS from the result.
- **real-tradeoff.** At least one credible alternative was considered and rejected for
  stated reasons. Decisions with no plausible alternative (e.g., "use HTTPS") do not
  qualify.

Worked example — **qualifier:** "Switch from REST to GraphQL for the public API."
Hard-to-reverse (clients integrate against the schema), surprising-without-context (most
greenfield APIs default to REST), real-tradeoff (tRPC and gRPC were rejected for stated
reasons). Ship an ADR.

Worked example — **disqualifier:** "Rename the `users` table to `accounts`." Hard-to-reverse,
but the rationale is obvious from the rename and there is no real alternative once the
domain has settled on the word. Log in `STATE.md`, not an ADR.

## Frontmatter

```yaml
---
title: <Active-voice imperative — e.g., "Adopt OKLCH for design tokens">
status: Proposed | Accepted | Superseded | Deprecated
date: <ISO 8601, YYYY-MM-DD>
cycle-id: <optional GDD addition — originating cycle slug, e.g., "v1.28.5">
phase-id: <optional GDD addition — originating phase, e.g., "28.5">
supersedes: <optional — ADR number this one replaces, e.g., "0042">
---
```

- **Required.** `title`, `status`, `date`.
- **Optional (GDD additions per D-04).** `cycle-id` and `phase-id` back-link to the
  originating cycle's `STATE.md` and the phase that produced the decision. `supersedes`
  points at the prior ADR number when this ADR replaces one.
- **Path convention.** `docs/adr/NNNN-<slug>.md` where `NNNN` is zero-padded (`0001`,
  `0042`, etc.) and the slug is kebab-case.

## Body structure

The ADR body uses four `##` sections in the following order. Each section is a thin
paragraph or short bullet list — ADRs are decision records, not design docs.

- `## Context` — what situation made this decision necessary; cite the originating
  cycle's `BRIEF.md` or `STATE.md` if relevant.
- `## Decision` — what was chosen, stated as an imperative.
- `## Alternatives` — what was considered and rejected, with brief rationale per
  alternative.
- `## Consequences` — what this enables, what it costs, what it constrains downstream.

## Status lifecycle

ADRs progress through four states. The status field in frontmatter is the source of
truth; transitions are explicit, never silent.

- **Proposed.** Drafted but not yet decided; reviewer pass pending. Downstream work
  does not cite Proposed ADRs.
- **Accepted.** Decision active; downstream work cites this ADR by number.
- **Superseded.** Replaced by a later ADR. The later ADR's `supersedes:` field points
  here, and this ADR's status is flipped to Superseded. NEVER delete a Superseded ADR —
  the audit trail is the point.
- **Deprecated.** No longer relevant (e.g., the system the ADR governed was removed).
  Kept for history.

## Cross-references

- Domain terms used in the ADR body should already appear in `CONTEXT.md` — see
  `./context-md-format.md`. If a term is missing, the writer adds it before referencing it.
- Cycle-scoped decisions (most routine choices) stay in `STATE.md` — see
  `./STATE-TEMPLATE.md`.
- Skill structural rules (length cap, frontmatter, progressive disclosure) — see
  `./skill-authoring-contract.md`.
