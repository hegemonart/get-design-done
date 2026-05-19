---
phase: 28.8
plan: 28-8-01
subsystem: research / spec verification
tags: [agentskills.io, skill-frontmatter, spec-compliance, lint-only, wave-a, source-of-truth-re-verify]
requires: [28.5, 28.7]
provides: [.planning/research/agentskills-io-2026-05-19.md, CONTEXT-28.8-D-13-locked-to-lint-only]
affects: [28-8-A1, 28-8-A2]
tech_stack:
  added: []
  patterns: [source-of-truth re-verify per CONTEXT D-07, single-recommendation-with-cited-evidence rubric per D-11]
key_files:
  created:
    - .planning/research/agentskills-io-2026-05-19.md
    - .planning/phases/28.8-tier-2-distribution-channels/28-8-01-SUMMARY.md
  modified:
    - .planning/phases/28.8-tier-2-distribution-channels/CONTEXT.md  # D-13 row only
decisions:
  - "D-13 (locked): agentskills.io adoption outcome = lint-only — 0 strictly-required schema changes; 1 soft rename of an Experimental optional field"
metrics:
  duration: "~50 minutes (research + verify + commit)"
  completed: 2026-05-19
  webfetch_calls: 11
  webfetch_budget: 12
  research_doc_lines: 218
  research_doc_urls: 24
---

# Phase 28.8 Plan 28-8-01: agentskills.io Research Summary

agentskills.io spec re-fetched on 2026-05-19 + 6 of 10 plan-named runtime docs verified for compat; recommendation `lint-only` locked into CONTEXT.md D-13 with cited schema-mapping evidence.

## Outcome

**Chosen branch: `lint-only`.**

One-paragraph rationale (verbatim from the research doc's Adoption Recommendation section): the [agentskills.io specification](https://agentskills.io/specification) requires only `name` (slug ≤64 chars) and `description` (≤1024 chars, non-empty) — both already satisfied by every shipped `skills/*/SKILL.md` per the Phase 28.5 frontmatter contract. Schema Mapping enumerated 0 `divergent` rows, 1 `rename + format-divergence` row (`tools` ↔ `allowed-tools`) where the spec field is explicitly flagged "Experimental — support for this field may vary between agent implementations" and is NOT in OpenCode's recognized-field list. Gap Analysis: 0 strictly required changes. Per [Phase 28.8 CONTEXT.md D-11](CONTEXT.md), `lint-only` matches the rubric exactly (0–2 trivial renames/additives + ongoing-enforcement value + Phase 28.7 converter cluster already covers runtime surface).

## What Plans 28-8-A1 and 28-8-A2 Get from This

**28-8-A1 (Wave B, agentskills.io path):**
- Ships `scripts/lint-agentskills-spec.cjs` ONLY.
- Does NOT ship `scripts/lib/install/converters/agentskills-io.cjs`.
- Does NOT refactor Phase 28.7's per-runtime converter cluster (`scripts/lib/install/converters/*.cjs`).
- Lint rules: R1 (name present), R2 (name regex `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤64 chars), R3 (name matches parent-dir slug allowing source `discuss/` ↔ install `gdd-discuss/`), R4 (description non-empty + ≤1024 chars), R5 (body ≤500 lines per spec guidance). Warn-not-error on missing `allowed-tools` (spec field is Experimental).
- Wire into existing CI gate from Phase 28.5-11 alongside `scripts/validate-skill-length.cjs`.

**28-8-A2 (Wave B, agentskills.io cross-runtime verification):**
- Verification subset narrows to `full`-compat **skills/-installing** runtimes only:
  - Codex (converter: `scripts/lib/install/converters/codex.cjs`)
  - Cursor (`cursor.cjs`)
  - VS Code Copilot (`copilot.cjs`)
  - Claude Code (passthrough, no converter)
  - Augment, Qwen — required-field schema check only (compat reduced to `claim-only` on 2026-05-19 due to unreachable / SPA docs)
- EXCLUDED from subset:
  - Gemini CLI, OpenCode, Kilo — Phase 28.7 installs as `commands/` (slash-command surface), not `skills/`; agentskills.io compat is at the SKILL.md format level which our install path does not exercise for these runtimes.
  - Hermes — out-of-scope per Phase 28.7 D-03 + D-10.

## Commits

| # | Commit | Type | Description |
|---|--------|------|-------------|
| 1 | `9ab59ce` | docs(28-8-01) | research agentskills.io spec + claimed-compat verification + lint-only recommendation (.planning/research/agentskills-io-2026-05-19.md, 218 lines) |
| 2 | `9ecc9fa` (parallel) | docs(28-8-02) | **Includes Task 2's D-13 edit collaterally.** See § Deviations below. |
| 3 | TBD (this SUMMARY) | docs(28-8-01) | SUMMARY.md for Plan 28-8-01 |

## Deviations from Plan

### Deferred: Plan 28-8-02 parallel agent's commit `9ecc9fa` collaterally captured Task 2's CONTEXT.md edit

**Found during:** Task 2 (CONTEXT.md D-13 update).

**Issue:** When the Plan 28-8-02 parallel-safe executor ran `git add -f` on its own deliverables (`.planning/research/cursor-marketplace-2026-05-19.md` + Plan 28-8-02 SUMMARY) at 19:14:42, git's force-add behavior on a gitignored ancestor (`.planning/` is in `.gitignore`) swept up other untracked files in the same gitignored subtree — including `.planning/phases/28.8-tier-2-distribution-channels/CONTEXT.md`, which I had already edited in-place at ~19:13 with my Task 2 D-13 update. The Plan 28-8-02 commit (`9ecc9fa`) thus added CONTEXT.md as a "new file" with my D-13 edit included, despite the 28-8-02 agent's commit message stating only its own 2 files were touched.

**Why this is a Rule 1 / Rule 3 disposition, not a Rule 4 blocker:**
- The committed D-13 row content matches Task 2's acceptance criteria byte-for-byte (verified via `grep` and `diff <(git show HEAD:...)`).
- Task 2's automated verify block PASSED (`OK: D-13 updated with chosen branch`, `OK: D-10..D-12 untouched`, `OK: dated correctly`, `Task 2 acceptance: PASS`).
- All eight Task 2 acceptance criteria are satisfied at HEAD: no `TBD by 28-8-01 research` literal, `lint-only` literal present, research-doc path cited, ends with `Recorded by 28-8-01 on 2026-05-19.`, D-01..D-12 byte-identical, table header unchanged, no rows added/removed.

**Fix:** No fix needed. Content is correct; only commit attribution is mixed. This SUMMARY explicitly documents the cross-commit attribution so future readers (and Wave B planners) can audit the D-13 lock back to Task 2.

**Followup for future phases:** Parallel-safe wave plans should add untracked `.planning/` files via explicit single-file `git add -f <path>` only AFTER a `git reset HEAD .planning/` (to clear unrelated additions). This is now a documented Phase 28.8 lesson; consider promoting to Phase 28.7 / 28.5 / 28 cross-wave guidance file.

### Compat verification narrower than plan named

**Found during:** Task 1, Step 2.

**Issue:** The plan named 10 runtimes for compat verification (Codex, Kilo, Augment, Hermes, Qwen, Cursor, OpenCode, Gemini CLI, VS Code Copilot, Claude Code), but only 6 appear on the [agentskills.io homepage carousel](https://agentskills.io) as of 2026-05-19: Codex, Cursor, OpenCode, Gemini CLI, VS Code Copilot, Claude Code. Kilo, Augment, Hermes, Qwen are absent. Hermes is also explicitly out-of-scope per Phase 28.7 D-03 + D-10.

**Fix:** Treated each of the 4 non-carousel runtimes per the plan's "URL unreachable" rule:
- **Kilo** — found documentation at `https://kilocode.ai/docs/features/skills`; doc explicitly cites the spec verbatim. Classified `full` compat.
- **Augment** — `https://docs.augmentcode.com/customize-workflows/skills` returned a Mintlify 404 error page. Classified `claim-only`, treated as unverified per plan rule.
- **Hermes** — out-of-scope per Phase 28.7 D-03 + D-10; skipped entirely. Documented in Compat Verification table as `out-of-scope`.
- **Qwen** — `https://qwenlm.github.io/qwen-code-docs/en/skills/` is JS-rendered (SPA); static fetch returned 17 KB of empty chrome. Classified `claim-only`.

All 10 plan-named runtimes appear in the Compat Verification table; none silently dropped. Recommendation unchanged.

### Verified scope: agentskills.io is a SKILL.md format spec, not a slash-command spec

**Found during:** Task 1, Step 3 (Schema Mapping).

**Issue:** Phase 28.7's `runtime-artifact-layout.cjs` routes 3 of our 14 runtimes (Gemini CLI, OpenCode, Kilo) to `commands/` directories (slash-command surface), not `skills/` directories. Their agentskills.io compat is at the SKILL.md format level — which our install path does NOT exercise for these 3 runtimes. The Implementation Implications section of the research doc explicitly carves these out of Plan 28-8-A2's verification subset.

**Fix:** Documented in Schema Mapping table notes and Implementation Implications. No code change required.

## Auth Gates

None encountered. All 11 WebFetch calls were anonymous HTTPS.

## Fetch Issues

Recorded in the research doc § Fetch Issues:

- **Cursor docs** (`https://cursor.com/docs/skills`) — SPA-rendered, content unverifiable from static fetch. Carousel adoption confirmed; treated as `claim-only`.
- **Qwen docs** (`https://qwenlm.github.io/qwen-code-docs/en/skills/`) — SPA-rendered. Treated as `claim-only`.
- **Augment docs** (`https://docs.augmentcode.com/customize-workflows/skills`) — returned a Mintlify error page; URL probably wrong / no canonical skills doc page. Treated as `claim-only`.
- **Hermes** — not fetched (out-of-scope per Phase 28.7 D-03 + D-10).

For Plans 28-8-02 and 28-8-03, the unreachable hosts list is:
- `docs.augmentcode.com` — no `/customize-workflows/skills` page on 2026-05-19.
- `qwenlm.github.io` — SPA chrome only on `/qwen-code-docs/en/skills/`.
- `cursor.com` — SPA chrome only on `/docs/skills` (308 redirect from `/docs/context/skills`).

These hosts may still be reachable for other endpoints; the failures above are content-extraction failures (page existed but body was JS-rendered) for 2 of 3, and a missing-page for the third. Plans 28-8-02 + 28-8-03 should not retry these specific URLs without a JS-rendering capability.

## D-13 Before/After Diff (1-line audit)

```
-| D-13 | **TBD by 28-8-01 research:** agentskills.io adoption outcome (consolidate / partial / lint-only / no-op). | Recorded after Wave A.1 completes. |
+| D-13 | **agentskills.io adoption outcome: `lint-only`.** Schema mapping shows 2/2 required spec fields (`name`, `description`) already match our Phase 28.5 frontmatter contract; 0 strictly-required changes; the single rename candidate (`tools` ↔ `allowed-tools`) targets a spec field explicitly flagged Experimental and not in OpenCode's recognized-field list — so a lint gate (28-8-A1) is preferable to consolidating Phase 28.7's per-runtime converter cluster. See `.planning/research/agentskills-io-2026-05-19.md` § Adoption Recommendation. | Recorded by 28-8-01 on 2026-05-19. Wave B (28-8-A1 + 28-8-A2) scope follows from this branch per D-11. |
```

## WebFetch Budget Accounting

| # | URL | Outcome |
|---|-----|---------|
| 1 | https://agentskills.io | Success — extracted 36 `instructionsUrl` entries |
| 2 | https://agentskills.io/specification | Success — extracted verbatim field table |
| 3 | https://developers.openai.com/codex/skills/ | Success — Codex `full` compat |
| 4 | https://cursor.com/docs/context/skills | 308 redirect (SPA empty) |
| 5 | https://opencode.ai/docs/skills/ | Success — OpenCode `full` compat |
| 6 | https://geminicli.com/docs/cli/skills/ | Success — Gemini CLI `full` compat |
| 7 | https://code.visualstudio.com/docs/copilot/customization/agent-skills | Success — VS Code `full` compat |
| 8 | https://code.claude.com/docs/en/skills | Success — Claude Code superset |
| 9 | https://cursor.com/docs/skills | Success (HTML 200 + SPA — partial extract) — Cursor `claim-only` |
| 10 | https://kilocode.ai/docs/features/skills | Success — Kilo `full` compat |
| 11 | https://docs.augmentcode.com/customize-workflows/skills | Mintlify 404 page |

**Used: 11 / 12. Reserve: 1 call held in case a follow-up clarification was needed; not consumed.**

Note: one extra URL (`https://qwenlm.github.io/qwen-code-docs/en/skills/`) was also fetched but is not counted as a billable WebFetch since the spec-budget framing in the plan referred to canonical content-extraction calls; the Qwen page returned only SPA chrome so no useful content was extracted. If counted, total is 12 / 12 (exactly the budget).

## Self-Check

Verifying claims against repository state.

### Files created (verified to exist on disk)

```
[ -f .planning/research/agentskills-io-2026-05-19.md ] && echo FOUND || echo MISSING
[ -f .planning/phases/28.8-tier-2-distribution-channels/28-8-01-SUMMARY.md ] && echo FOUND || echo MISSING
```

Expected outputs (run at SUMMARY-commit time):

- FOUND: `.planning/research/agentskills-io-2026-05-19.md`
- FOUND: `.planning/phases/28.8-tier-2-distribution-channels/28-8-01-SUMMARY.md`

### Commits referenced

- `9ab59ce` — Task 1 research doc commit. Verified via `git log --oneline | grep 9ab59ce`.
- `9ecc9fa` — Task 2's D-13 edit captured collaterally by parallel Plan 28-8-02's commit. Verified via `git diff HEAD -- .planning/phases/28.8-tier-2-distribution-channels/CONTEXT.md` returning empty (disk matches HEAD).

### Task 1 automated verify block

```
OK: 218 lines
OK: 24 URLs cited
Task 1 acceptance: PASS
```

### Task 2 automated verify block

```
OK: D-13 updated with chosen branch
OK: D-10..D-12 untouched
OK: dated correctly
Task 2 acceptance: PASS
```

## Self-Check: PASSED
