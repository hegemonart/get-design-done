---
name: hone-apply-reflections
description: "Review and selectively apply proposals from .design/reflections/<cycle-slug>.md. Diffs each proposal, prompts user to accept/skip/edit, then writes changes."
argument-hint: "[--cycle <slug>] [--filter <FRONTMATTER|REFERENCE|BUDGET|QUESTION|GLOBAL-SKILL>] [--dry-run]"
tools: Read, Write, Edit, Bash, Glob
---

# /hone:apply-reflections

Interactive proposal review loop. Reads `.design/reflections/<cycle-slug>.md`, walks each numbered proposal, and applies accepted ones to the appropriate target file. Nothing is applied without explicit user confirmation.

## Steps

### 1. Resolve reflections file

- If `--cycle <slug>` given: load `.design/reflections/<slug>.md`
- Else: glob `.design/reflections/*.md`, sort by modified time descending, load the most recent
- If no file found: error "No reflections found. Run `/hone:reflect` first."
- Print: "Reviewing reflections: <filename>"

### 2. Parse proposals

Scan file for lines matching `### Proposal N — [TYPE] ...`. Extract each proposal block (Why / Change / Risk).

If `--filter <TYPE>` given: skip proposals whose type tag doesn't match.

Print: "Found N proposals (N after filter)."

### 3. Review loop

For each proposal (in order):

Print the full proposal block:
```
─────────────────────────────────────────
Proposal N/TOTAL — [TYPE] Title
Risk: low|medium

Why: ...
Change: ...
─────────────────────────────────────────
(a) apply   (s) skip   (e) edit   (q) quit
```

If `--dry-run`: print `[dry-run — would prompt here]` and continue to next proposal without prompting.

Based on user choice:
- **a** - apply (see Apply Logic below)
- **s** - mark proposal as `**Reviewed: skipped**` in the reflections file; continue
- **e** - show the Change text, ask user to provide edited version, then apply the edited version
- **q** - stop processing; print "Stopped at proposal N. Resume with `/hone:apply-reflections --cycle <slug>`."

### 4. Apply Logic by Proposal Type

After the user chooses `a` (apply) or `e` (edit-then-apply), branch on the proposal's bracketed type tag and follow the per-type apply procedure in `./apply-reflections-procedure.md` - one numbered procedure each for `[FRONTMATTER]`, `[REFERENCE]`, `[BUDGET]`, `[QUESTION]`, `[GLOBAL-SKILL]`. All branches end with `**Applied**: <date>` appended to the proposal block in the reflections file.

### 5. Summary

After all proposals processed (or `q`):
```
─────────────────────────────────────────
Apply-reflections complete
  Applied:  N
  Skipped:  N
  Remaining: N (run again to continue)
─────────────────────────────────────────
```

## [INCUBATOR]

Incubator drafts authored by `scripts/lib/incubator-author.cjs` (Phase 29-04) appear as a distinct proposal class. For each draft under `.design/reflections/incubator/<slug>/`, use `scripts/lib/apply-reflections/incubator-proposals.cjs`:

1. `discoverIncubatorDrafts()` → list pending drafts.
2. `renderProposal(draft)` → show full body + diff + origin signals.
3. User chooses **accept** | **reject** | **defer** | **edit**.
4. **accept** - scope-guard runs FIRST (`validateScope` from `scripts/validate-incubator-scope.cjs`); `applyAccept` then promotes draft → `agents/<slug>.md` or `skills/<slug>/SKILL.md` and appends a registry entry. Single-step per D-04.
5. **reject** - `applyReject` removes the incubator subdir.
6. **defer** - no-op; draft re-surfaces next run.
7. **edit** - `applyEdit` opens `$EDITOR`; re-prompt user on close.

**Stage-1 gate.** At session start, call `checkStage1Gate()`. If `thresholdMet && !optInRecorded`, display the opt-in prompt once. NEVER auto-flip per D-01 - recording opt-in requires explicit user confirmation via `recordOptIn()`. Full procedure: `./apply-reflections-procedure.md` §[INCUBATOR].

## [KFM-CANDIDATE]

KFM-catalogue proposals authored by `scripts/lib/reflector-kfm-proposer.cjs` (Phase 30.5-03 D-05) appear as a 6th proposal class. Drafts at `.design/reflections/incubator/kfm-<slug>/CATALOGUE-ENTRY.md`; pre-filled 11-field schema with `TODO:` placeholders for `pattern` + `fix`. Two upstream signals share the surface (D-06): `capability_gap` clusters (≥3, no existing match) + `kfm-candidate` events (whitelist-matched articles, 1-shot). User chooses **accept** | **reject** | **defer** | **edit**. `applyAccept` appends to `reference/known-failure-modes.md` + `reference/registry.json` (`origin: incubator-kfm`); `applyReject` removes the incubator subdir; `applyDefer` stamps `deferred_until`; `applyEdit` returns the draft path for `$EDITOR`. Full procedure: `./apply-reflections-procedure.md` §[KFM-CANDIDATE].

## [INSTINCT]

Atomic instinct units emitted by `design-reflector` (and surfaced from `/hone:extract-learnings`) appear as a distinct proposal class, alongside `[INCUBATOR]` and `[KFM-CANDIDATE]`. Each unit is a fenced `yaml` block under the reflector's `## Atomic instincts` section, shaped per `reference/instinct-format.md` (`id`, `trigger`, `confidence`, `domain`, `scope`, `project_id`, `source`, `cycles_seen`, `first_seen`, `last_seen`, plus a short body). A unit is a proposal, never a stored fact - nothing lands until the user accepts it.

Mirror the `[INCUBATOR]` flow:

1. Discover the units: parse every `yaml` block under `## Atomic instincts` in the reflections file. Skip malformed blocks (warn on stderr, keep going).
2. For each unit: show the parsed `trigger`, `domain`, `confidence`, and body so the user sees what would be stored.
3. Prompt: `(a) accept   (r) reject   (d) defer   (e) edit   (q) quit`.

**Per-action behavior:**

1. **accept** - call `scripts/lib/instinct-store.cjs` `add(unit, { scope, baseDir })` with the unit at its emitted `confidence`. The store owns de-duplication and `cycles_seen` bookkeeping. On success print `Stored instinct <id> (<domain>, confidence <n>).` and append `**Applied**: <date>` to the proposal block.
2. **reject** - do not store the unit. Append `**Reviewed: rejected**` to the reflections file.
3. **defer** - no-op; the unit re-surfaces next run. Append `**Reviewed: deferred**`.
4. **edit** - let the user adjust `trigger`, `confidence`, or `domain`, then accept the edited unit through the same `add(...)` call. Default `scope: 'project'` (write `global` only when the unit's frontmatter says so); never edit `.design/instincts/instincts.json` directly, and promote to global via the separate gated `/hone:instinct promote`.

## Do Not

- Do not apply any proposal without the user explicitly choosing `a` or `e`.
- Do not modify source code files (`.ts`, `.tsx`, `.css`, `.js`) - only agent files, reference files, budget.json, discussant questions, global skills, and incubator drafts.
- Do not re-run the reflector - this skill only applies existing proposals.
- Do not bypass the scope guard or auto-flip Stage-1 - both are non-negotiable per D-05 / D-01.
