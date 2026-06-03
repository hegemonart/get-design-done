---
name: instinct-format
type: meta-rules
version: 1.0.0
phase: 51
tags: [instinct, learning, confidence, beta-prior, promotion-gate, ttl-decay]
last_updated: 2026-06-03
---

# Instinct Unit Format

An instinct is an atomic, confidence-weighted lesson the pipeline learns across design
cycles. Where an ADR records a deliberate, hard-to-reverse decision (see `./adr-format.md`)
and `CONTEXT.md` records agreed vocabulary (see `./context-md-format.md`), an instinct
records a softer signal: a recurring "when X, prefer Y" reflex that earns trust by being
seen again and again. Each unit is one trigger sentence plus a short body, stored as a YAML
document and validated by `./schemas/instinct.schema.json`. The store
(`scripts/lib/instinct-store.cjs`) persists, queries, promotes, and decays them.

Instincts are always advisory, never directive. A fresh instinct carries low confidence and
is offered as a suggestion; only repeated cross-project observation raises that confidence,
and even then it is capped well below certainty.

## Unit shape

A unit is a YAML frontmatter block followed by a 1 to 3 paragraph body. The body explains
the reflex in plain language: what situation fires it, what to reach for, and why.

```yaml
---
id: prefer-token-over-hex            # kebab-case stable identifier
trigger: When a raw color literal appears in a component, reach for a design token first.
confidence: 0.5                      # float in [0.3, 0.9]
domain: build                        # intake|explore|decide|build|verify|operate|utility
scope: project                       # project|global
project_id: abcd1234                 # sha8 of the normalized git origin (project scope)
source: reflection                   # reflection|extract-learnings|user
cycles_seen: 1                       # distinct cycles that surfaced this instinct
project_ids: [abcd1234]              # distinct origins that surfaced it (promotion gate)
first_seen: 2026-06-01               # ISO date the unit was recorded
last_seen: 2026-06-01                # ISO date it was last surfaced (resets decay)
---
Hardcoded hex values drift away from the system palette over time. Routing the value
through a token keeps one source of truth and lets a theme change land everywhere at once.
```

### Field reference

- **id** (required). Kebab-case, lowercase letters and digits with single hyphens, 3 to 80
  characters. The id is stable: touching or promoting a unit never changes it.
- **trigger** (required). One sentence naming the situation that fires the instinct. Keep it
  concrete enough that a reader knows when it applies.
- **confidence** (required). A float between 0.3 and 0.9. The floor of 0.3 says a brand-new
  instinct is a hint, not a rule. The ceiling of 0.9 says no instinct is ever certain.
- **domain** (required). One of `intake`, `explore`, `decide`, `build`, `verify`, `operate`,
  `utility`. These map to the Phase 50 lifecycle stages so an instinct surfaces at the right
  moment in a cycle.
- **scope** (required). `project` for a lesson learned in one repository, `global` for one
  promoted after it clears the cross-project gate below.
- **project_id** (required for project scope). The 8-character hex sha of the normalized git
  origin, produced by `deriveProjectId`. A global unit may omit it, since a promoted instinct
  is no longer tied to a single origin.
- **source** (required). Which producer minted the unit: a `reflection` pass, the
  `extract-learnings` step, or a direct `user` assertion.
- **cycles_seen** (optional, defaults to 1). How many distinct cycles have surfaced the unit.
- **project_ids** (optional). The set of distinct origins that surfaced it. Its size feeds the
  promotion gate.
- **first_seen** / **last_seen** (optional, stamped on write). ISO dates for recording and last
  surfacing. `last_seen` resets the decay window.

## The Beta(2,8) prior

When an instinct is promoted to the global store it is seeded with a Beta(2,8) posterior, the
same conservative prior the Phase 38 `design_arms` store uses. Its posterior mean is 0.2, so a
promoted pattern still has to earn standing from real outcomes rather than starting trusted.
The store exposes this as `INSTINCT_PRIOR = {alpha: 2, beta: 8}`. Successful outcomes add to
`alpha`, disappointing ones add to `beta`, and the mean moves accordingly.

## Promotion gate (K=2 cycles across M=2 projects)

A project instinct may move to the global store only when both halves of the gate hold:

1. **K = 2 cycles.** `cycles_seen` is at least 2, so the lesson repeated rather than firing once.
2. **M = 2 projects.** The unit appears in at least 2 distinct `project_ids`, so the lesson
   generalized beyond the repository that first taught it.

`promote(id)` throws a clear error when either half is unmet, so a one-off observation in a
single project can never leak into global advice. On a passing gate the unit is re-scoped to
`global`, the single-origin `project_id` is dropped, the Beta(2,8) prior is applied, and the
unit is removed from the project store. `touch(id)` is how a unit accumulates toward the gate:
each call bumps `last_seen` and `cycles_seen` and adds the current origin to `project_ids`.

## TTL decay

Instincts that stop showing up should fade rather than linger as stale advice. `decay()` walks
a scope and, for any unit not surfaced within the decay window of 6 cycles, multiplies its
confidence by 0.9. Once a unit's confidence falls below 0.2 it is archived: the store writes it
to `<root>/instincts/archive/<id>.json` with an `archived_at` stamp and removes it from the live
set. Archiving is reversible by hand, so the audit trail survives. Calling `touch(id)` resets the
window, so an instinct that keeps proving useful never decays.

## Storage and recall

Project units live at `<root>/instincts/instincts.json`, resolved through the worktree-aware
root so writes land in the main checkout rather than a throwaway worktree. Global units live at
`~/.claude/gdd/global-instincts.json`. Both files are written atomically (a temp file plus a
rename), and JSON is always the source of truth.

`query(keyword)` ranks units by how well the keyword matches their trigger, body, and domain,
returning the best few. When `better-sqlite3` is present with its FTS5 extension the query runs
over a small full-text index for speed; otherwise an in-memory scan answers the same query with
the same shape. `better-sqlite3` stays a runtime probe and is never a hard dependency, so recall
degrades gracefully wherever the native module is absent. `backendName()` reports which path is
active.

## Cross-references

- Hard-to-reverse decisions belong in an ADR, not an instinct. See `./adr-format.md`.
- Agreed domain vocabulary belongs in `CONTEXT.md`. See `./context-md-format.md`.
- The frontmatter schema is `./schemas/instinct.schema.json`, validated under Ajv.
