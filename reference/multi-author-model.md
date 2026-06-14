# Multi-Author Model - Team Collaboration Contract

Phase 40 contract. GDD's single-process baseline (Phase 20 lockfile + atomic STATE.md RMW) is safe for
one operator. This file is the contract for **multiple developers** working a design in parallel: how
STATE.md merges, how decisions are attributed and reviewed, how writes coordinate across processes,
and who is allowed to write what. Everything here is **git-native + advisory** - no server, no live
multiplayer, no SSO.

## 1. Multi-writer STATE.md - git-merge-driver with per-section semantic merge

GDD does **not** ship a CRDT or OT engine. The chosen model (lowest risk, highest familiarity) is a
**git merge driver with per-section semantic conflict detection**. The append-mostly `<decisions>`
block is the common case: two branches each adding a new `D-NN` must merge cleanly. The pure core
`scripts/lib/collab/section-merge.cjs` implements the rule:

- **Union by id.** A `D-NN` present on only one side (vs the merge base) is kept.
- **Equal duplicates collapse.** The same `D-NN` with identical text/status/attribution on both sides
  is kept once.
- **Divergence is the only conflict.** The same `D-NN` with different text or status on the two sides
  is a genuine conflict - surfaced to `agents/conflict-resolver.md`, never auto-resolved.
- **Decisions are durable.** A `D-NN` removed on one side but unchanged on the other is **kept** - a
  decision is never silently deleted by a merge; removal goes through the unlock flow (§3).

A single-value section (e.g. `status`) merges with `mergeStatusScalar`: if only one side changed, take
that side; if both changed differently, it's a conflict.

## 2. Attribution

A decision line carries an **optional** attribution suffix:

```
D-07: Use OKLCH design tokens (locked) [author=alice co-author=hone-3f9a]
```

- `author` - the git user who made the decision.
- `co-author` - the GDD instance id (which machine/agent run produced it).

The suffix is backward-compatible: a plain `D-01: text (locked)` parses with `author`/`co-author` =
null. `scripts/lib/collab/attribution.cjs` parses + formats the line and groups decisions by author.
`agents/design-reflector.md` reads attribution to surface **per-author patterns** (who tends to lock
early, whose decisions get reverted). This is the SC#5 "attribution field" - encoded in the line, not
a schema-breaking change to the `Decision` type.

## 3. Async review queue + decision locks

Each decision under review lives at `.design/reviews/<decision-id>/`, moving through a state machine
(`scripts/lib/collab/review-queue.cjs`):

```
proposed → reviewing → approved → locked
```

- **`locked` is terminal and hard.** A locked decision cannot be amended. `canAmend(state)` is true
  only for `proposed`/`reviewing`.
- **Unlock is explicit + audited.** `/hone:unlock-decision <id> --approver <who>` moves `locked →
  reviewing` and appends an audit entry (`{ from:'locked', to:'reviewing', approver, reason }`). There
  is no silent unlock.
- **`/hone:review-decisions`** surfaces every queue entry by state (and `--pending` for the ones
  awaiting action).

## 4. Multi-writer lock policy

`scripts/lib/collab/lock-policy.cjs` derives the `acquire()` options from config. In single-process
mode the Phase 20 defaults apply (`maxWaitMs: 5000`). When `collab.multi_writer_enabled: true`, a
teammate's write may be queued, so the policy waits up to **30 s** with a **100 ms** backoff poll and a
2-minute stale threshold. `collab.lock_timeout_ms` overrides the wait. The hone-state MCP write path
passes these options to the existing advisory lock - coordinated multi-process writes, no new lock
mechanism.

## 5. Sectional handoff - `gdd_cycle_mode`

`.design/config.json#gdd_cycle_mode` partitions a cycle by role (`scripts/lib/collab/cycle-mode.cjs`):

| Mode | Permitted stages |
|---|---|
| `designer` | Brief, Explore |
| `dev` | Plan, Design, Verify |
| `full` | all (the default / current behavior) |

`stagePermitted(mode, stage)` gates STATE writes by stage - a designer-mode cycle cannot write Plan/Design
state, and vice versa. This lets a designer hand a brief to a dev without either overwriting the other's
sections.

## 6. Permissions

`.design/config.json#permissions` declares who can write which sections
(`scripts/lib/collab/permissions.cjs` `can(config, actor, section, action)`). The default policy is
permissive (`owner` can do everything); an override can restrict, e.g. "only `@lead-designer` can
`lock` decisions". A CI gate asserts the permission model is enforced on PRs.

## 7. Decision-journal export + PR threading

- **`agents/decision-journal-exporter.md`** writes a **read-only** Notion/Confluence page from the
  `<decisions>` block on cycle close (write-only this phase; non-GDD stakeholders read it). Every
  decision is piped through `scripts/lib/pseudonymize.cjs` first (R1 git-identity + R8 stable hash), so
  author names are masked before they leave the repo. Degrades to a local markdown file when no Notion
  connection is available.
- **`agents/pr-commenter.md`** threads PR review comments on the `D-XX` decisions referenced in
  DESIGN.md / DESIGN-VERIFICATION.md, so decision discussion persists as part of the PR history.

## 8. Cross-machine sync (opt-in)

`scripts/lib/collab/sync-backend.cjs` `resolveBackend(config)` selects the `.design/` sync backend:
`git` (the **default** - existing behavior), or an opt-in `s3` / `git-lfs` for orgs whose git
push/pull cadence is too slow. Sync is **opt-in and off by default**; a live S3/LFS client is out of
scope for this phase - the selector + contract ship, the backend is pluggable.

## Boundaries

No real-time multiplayer, no SSO/SAML, no GDD-side user accounts (users are git authors), no
bidirectional Notion, no merge-queue automation beyond the conflict-resolver. Everything is advisory
and git-native: a team that already uses git + PRs gets collaboration without new infrastructure.
