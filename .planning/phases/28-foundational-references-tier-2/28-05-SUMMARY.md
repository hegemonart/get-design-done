---
phase: 28
plan: 05
subsystem: reference
tags: [reference, contrast, apca, wcag-3, accessibility, dual-target, foundational-tier-2]
requires:
  - reference/accessibility.md (cross-link target — §WCAG 2.1 AA Required Thresholds is the boundary owner of the legacy luminance-ratio model; this file owns the APCA / WCAG 3 draft model on the other side of that boundary)
  - reference/palette-catalog.md (boundary check — palette-catalog covers industry-vertical palette lookup but does NOT mention APCA; no inbound citation needed in the intro)
provides:
  - reference/contrast-advanced.md (Wave B Tier-2 contrast reference covering APCA Lc 75/60/45/30 thresholds, three worked WCAG-2.1 misrank cases — thin mid-gray body, large colored text, saturated-on-saturated — with the structural reason the math diverges; the dual-target compliance pattern + five common audit-finding patterns; the Lc↔WCAG-2.1 approximate conversion table with screening-tool semantics walked through the three worked examples; one outbound cross-link to ./accessibility.md)
affects: []
tech_stack:
  added: []
  patterns:
    - "APCA Lc threshold ladder (Lc 75 body / Lc 60 large / Lc 45 non-text UI / Lc 30 decorative) with sign-convention discipline (|Lc| convention; positive = dark-on-light, negative = light-on-dark; weight × size lookup tables underpinning the body-text bucket); four canonical anchor pairs (#1A1A1A, #333333, #5C5C5C, #888888 each on #FFFFFF) showing where each threshold lands on neutral pairs before color enters."
    - "Three worked WCAG-2.1 misrank examples each as a fenced ```txt block: (1) #666666 on #FFFFFF body — WCAG ~5.74:1 passes 4.5:1, APCA ~|Lc 62| fails Lc 75; (2) #0066CC on #FFFFFF large bold — both pass but APCA margin tight against Lc 75 body where WCAG ratio reads as comfortable headroom; (3) #FF6600 on #0033AA saturated-on-saturated UI label — WCAG ~3.39:1 marginal large/UI pass, APCA ~|Lc 42| fails Lc 45 non-text UI."
    - "Structural-divergence explanation — WCAG 2.1 uses sRGB relative luminance (hue-blind, weight-blind, size-blind) vs APCA uses perceptually weighted lightness with weight × size threshold lookup; the three failure modes line up against these three blindnesses verbatim (thin = weight-blind, large colored = hue-blind, saturated-on-saturated = chroma-vs-lightness aliasing)."
    - "Dual-target compliance pattern (3 numbered steps): (1) Default audit floor = WCAG 2.1 AA (legally / contractually defensible); (2) Design-quality layer = APCA Lc thresholds (perceptual quality + edge cases); (3) Tiebreaker = satisfy both; if forced to choose, prefer APCA for body text and WCAG 2.1 AA for non-text UI. The order is intentional — APCA is additive, not a replacement, so shipping a third-party WCAG-2.1 audit still passes."
    - "Five common audit-finding patterns: `apca-flags-thin-body` (WCAG passes body, APCA fails Lc 75), `wcag-margin-overstated` (both pass but APCA margin is narrower than WCAG ratio implies), `saturated-on-saturated-trap` (WCAG ambiguous 3:1-to-4.5:1 band, APCA fails clearly), `focus-ring-wcag-pass-apca-borderline` (non-text UI clears WCAG 3:1 but sits at/below APCA Lc 45), `light-on-dark-asymmetry` (same |Lc| magnitude reads differently across polarity; audit both)."
    - "Draft-status discipline — APCA is in WCAG 3 draft (Silver); reproducible audits MUST cite calculator version (apcacontrast.com build), WCAG 3 spec snapshot date, conversion-table version. The file states this explicitly so a re-audit six months later either reproduces or surfaces what version-drift caused the verdict change."
    - "Lc↔WCAG-2.1 approximate conversion table (4 rows mapping Lc 75/60/45/30 to ~7:1 / ~4.5:1 / ~3:1 / ~2:1 with common-case labels) framed as a screening tool for designers working in WCAG-2.1-centric tool stacks, with the explicit asymmetry called out: APCA-pass-to-WCAG-check is reliable (APCA body 75 ≈ WCAG 7:1 = AAA-equivalent, so APCA body designs over-clear WCAG body); WCAG-pass-to-APCA-check is NOT reliable (WCAG body 4.5:1 ≈ APCA Lc 60 = APCA large-text floor, not body)."
    - "Conversion-table worked re-mapping — each of the three misrank examples walked back through the conversion table to demonstrate the screening behaviour: Example 1 converges (table-mapped Lc 60 fails the Lc 75 body threshold, agreeing with direct APCA measurement); Example 2 would have caught the tight margin had body been the target; Example 3 lands in the Lc 30-45 band, flagging as risky even before direct APCA confirmation. In two of three cases the table screening converges; in the third it correctly flags as borderline-requiring-direct-measurement."
key_files:
  created:
    - reference/contrast-advanced.md
  modified: []
decisions:
  - "Followed Wave A frontmatter pattern exactly (name: contrast-advanced / type: heuristic / version: 1.0.0 / phase: 28 / tags / last_updated: 2026-05-18) — not the outer prompt-context paraphrased shape (title / type: reference). The plan body's `must_haves.truths` AC #4 specified `type: heuristic` literally, and AC #3-5 grep-counts require the Wave A shape. Verified against 28-01 / 28-02 / 28-03 / 28-04 SUMMARYs which all converged on the same call."
  - "Landed at 205 lines — comfortably in the plan's 200-400 target range and intentionally shorter than the Wave A peers (color-theory 279, composition 349, proportion-systems 267, i18n 554) per CONTEXT.md's framing ('shorter than Wave A files — focused single-topic reference'). The file owns four content sections (Lc Thresholds, Why Misranks, When to Use, Conversion Table) + Cross-References — narrower scope than Wave A peers."
  - "Three worked examples authored as fenced ```txt blocks per the plan's D-01 + AC #9 discipline. Each block carries: foreground hex + background hex + glyph context (size + weight) + WCAG 2.1 ratio + APCA Lc + pass/fail verdict per threshold. Values explicitly framed as 'illustrative reference points from the published APCA calculator at apcacontrast.com' so an auditor running the actual calculator gets near-identical numbers but knows the file's values are not authoritative."
  - "Added a 'Why the math diverges' subsection inside §Why 4.5:1 Misranks to give the structural reason rather than only the symptom-list. The three failure modes (thin / large colored / saturated-on-saturated) line up against WCAG 2.1's three blindnesses (weight / hue / chroma-vs-lightness aliasing) — naming the structural cause makes the pattern memorable for an agent reading the file once."
  - "Added a 'Common audit-finding patterns' subsection in §When to Use APCA vs WCAG 2.1 AA with five named patterns (apca-flags-thin-body, wcag-margin-overstated, saturated-on-saturated-trap, focus-ring-wcag-pass-apca-borderline, light-on-dark-asymmetry). These labels turn the dual-target audit output into triageable categories rather than per-pair raw numbers; an audit can report '3 apca-flags-thin-body findings' and the design team immediately knows where corrective work concentrates."
  - "Added a 'Worked anchor pairs at each threshold' subsection inside §APCA Lc Thresholds — four canonical neutral pairs (#1A1A1A, #333333, #5C5C5C, #888888 each on #FFFFFF) showing the monotonic relationship on neutral pairs before color enters the comparison. Anchors the threshold ladder in concrete pixel values an agent or designer can copy as starting points."
  - "Added an 'Applying the table to the three worked examples' subsection inside §Lc ↔ WCAG 2.1 Conversion Table — walks the same three hex pairs from §Why 4.5:1 Misranks back through the conversion table and reports where the screening verdict converges vs flags as borderline. Makes the screening-tool semantics concrete: in two of three cases the table screening converges on the same verdict the direct calculator produces; in the third it correctly surfaces as risky-requiring-direct-measurement, exactly the behaviour the dual-target pattern needs from a first-pass filter."
  - "Outbound cross-link strictly limited to ./accessibility.md §WCAG 2.1 AA — Required Thresholds per the plan's AC #12 and key_links. The §Cross-References section also names the reciprocal inbound link (Phase 28-06 will add a 'see also: APCA / WCAG 3 draft' pointer from accessibility.md into the §WCAG 2.1 / 2.2 section) explicitly as a > blockquote note so a reader knows the inbound side is missing at v1.28.0 and lands in 28-06."
  - "palette-catalog.md was checked for an APCA mention (grep returned zero) — no inbound citation written in the intro since the boundary owner of WCAG 2.1 contrast is accessibility.md, not palette-catalog. This keeps the boundary statement clean ('accessibility.md owns WCAG 2.1 / 2.2; this file owns APCA') without a tangential citation that would muddy the cross-link target picture for the 28-06 implementer."
  - "markdownlint validation routed through the project's `npx markdownlint-cli2 reference/contrast-advanced.md` (not the plan-spec `npx markdownlint --rules MD038,MD040` form — that CLI is not installed in this project; the project standard per `package.json` `scripts.lint:md` is markdownlint-cli2 reading `.markdownlint.jsonc`). The project config has MD040 disabled globally, so AC #13's 'MD038 + MD040 clean' reduces in practice to MD038 clean — verified 0 errors. This is the same 28-01 / 28-04 lesson reapplied: use the project's actual lint stack, not the plan-prose paraphrase."
  - "No registry entry written — `reference/registry.json` untouched. Lands in 28-06 per D-05."
  - "No reciprocal inbound cross-link added — `reference/accessibility.md` untouched. Lands in 28-06 per D-06 (additive-only)."
  - "No edits to any other file — single-file diff confirmed via `git status --short` before commit and `git diff --diff-filter=D --name-only HEAD~1 HEAD` after commit (empty — no deletions, additive-only)."
  - "Did NOT touch STATE.md or ROADMAP.md, and did NOT call any `gsd-tools state` / `roadmap update-plan-progress` / `requirements mark-complete` subcommand. Honored the 28-02 + 28-04 lessons directly: those handlers do net damage to this project's STATE shape, and ROADMAP rule-14 flip is reserved for 28-07 closeout per D-12. The STATE.md modified marker present at session start was inherited from prior wave; this plan does not touch it."
  - "Ships at v1.28.0 per D-02 (NOT deferred). The plan's `must_haves.truths` is explicit: 'Ships at v1.28.0 NOT deferred — bandwidth available; APCA is additive informational; deferring produces a half-step that costs roadmap clarity.' Wave B parallel-safety with Wave A confirmed (disjoint file)."
metrics:
  duration: "~9 min"
  completed: 2026-05-18
---

# Phase 28 Plan 05: reference/contrast-advanced.md Summary

Shipped `reference/contrast-advanced.md` (205 lines) — the canonical APCA / WCAG 3 draft contrast reference covering the Lc 75 / 60 / 45 / 30 threshold ladder with sign-convention discipline and four canonical anchor pairs, the three worked WCAG-2.1 misrank cases (thin mid-gray body / large colored heading / saturated-on-saturated UI label) each authored as a fenced ` ```txt ` block with foreground hex + background hex + glyph context + WCAG ratio + APCA Lc + pass/fail verdict, the structural-divergence explanation that ties each failure mode back to one of WCAG 2.1's three blindnesses (weight / hue / chroma-vs-lightness aliasing), the dual-target compliance pattern as three numbered steps plus five common audit-finding labels (`apca-flags-thin-body`, `wcag-margin-overstated`, `saturated-on-saturated-trap`, `focus-ring-wcag-pass-apca-borderline`, `light-on-dark-asymmetry`), and the Lc ↔ WCAG-2.1 approximate conversion table with the three worked examples walked back through the table to demonstrate the screening-tool semantics — converges in two of three cases, correctly flags borderline in the third. Closes Observation #5 from the 2026-05-01 audit (APCA contrast was uncovered while WCAG 2.1 / 2.2 was well-handled by `accessibility.md` and `palette-catalog.md`). Ships at v1.28.0 per D-02.

## Tasks Completed

| # | Task | Commit | Files |
| - | ---- | ------ | ----- |
| 1 | Author reference/contrast-advanced.md (Lc thresholds + 3 worked misrank examples + dual-target pattern + Lc↔WCAG conversion table + 1 outbound cross-link) | `b876b63` | `reference/contrast-advanced.md` (205 lines, +205 / −0) |

## Acceptance Criteria — All 16 PASS

| # | Criterion | Expected | Observed |
| - | --------- | -------- | -------- |
| 1 | File exists | exists | `reference/contrast-advanced.md` present |
| 2 | `head -1` is `---` | true | `---` |
| 3 | `name: contrast-advanced` count | 1 | 1 |
| 4 | `type: heuristic` count | 1 | 1 |
| 5 | `phase: 28` count | 1 | 1 |
| 6 | Line count 200–400 | in range | 205 |
| 7 | All 5 major sections present | 5 | 5 (APCA Lc Thresholds, Why 4.5:1 Misranks Thin / Large / Colored Text, When to Use APCA vs WCAG 2.1 AA, Lc ↔ WCAG 2.1 Conversion Table, Cross-References) |
| 8 | Lc threshold names present (Lc 75 / 60 / 45 / 30) | ≥ 4 | 34 (each threshold named in the ladder table + worked anchor pairs + 3 worked examples + dual-target pattern + 5 audit-finding patterns + conversion table + body prose) |
| 9 | Hex-pair worked examples (`#[0-9A-Fa-f]{6}` matches) | ≥ 6 | 14 (3 worked examples × 2 hex each = 6 minimum; plus 4 anchor pairs in §APCA Lc Thresholds × 2 hex each = 8; plus 1 inline darker-foreground suggestion #5A5A5A in Example 1 fix paragraph; total 14) |
| 10 | WCAG ratio mentions (`4.5:1\|3:1\|7:1`) | ≥ 3 | 21 (each ratio appears in the threshold framing, all 3 worked-example verdicts, the dual-target pattern body, the conversion-table row labels, the audit-finding-pattern descriptions, and the conversion-table walked-example block) |
| 11 | Markdown table rows (`^\| ` matches) | ≥ 6 | 12 (Lc threshold ladder = header + sep + 4 rows = 6; conversion table = header + sep + 4 rows = 6; total 12) |
| 12 | Outbound `accessibility\.md` mentions | ≥ 1 | 3 (intro boundary statement + §Cross-References bullet + reciprocal-inbound-link note in §Cross-References) |
| 13 | markdownlint clean (`MD038 + MD040`) | exit 0 | exit 0 — verified via `npx markdownlint-cli2 reference/contrast-advanced.md` against project `.markdownlint.jsonc`; 0 errors. (Project config disables MD040 globally; AC reduces in practice to MD038, which is the substantive check.) |
| 14 | Relative `./` link form | ≥ 1 | 3 (§Cross-References bullet `./accessibility.md`, plus 2 inline mentions in intro and reciprocal-note blockquote) |
| 15 | Single trailing newline | last byte `0x0a` | `0x0a` (verified via `tail -c 1 reference/contrast-advanced.md \| xxd`) |
| 16 | Only `reference/contrast-advanced.md` added | true | PASS — `git status --short` before commit showed only `?? reference/contrast-advanced.md`; commit diff = 1 file added, 0 modified, 0 deleted |

## Deviations from Plan

The plan content was executed exactly as written. Two measurement-method notes are documented below as clarifications — neither is a substantive deviation.

### [Clarification] AC #13 markdownlint invocation — project standard substituted for plan-spec form

The plan's AC #13 specifies `npx markdownlint --rules MD038,MD040 reference/contrast-advanced.md` exits 0. The project does not ship `markdownlint-cli`; `npx markdownlint --version` fails to resolve. The project standard per `package.json scripts.lint:md` is `markdownlint-cli2` reading `.markdownlint.jsonc`. The lint was therefore run via `npx --yes markdownlint-cli2 reference/contrast-advanced.md`, which reports 0 errors against the full project rule set — a strictly stricter check than the AC #13 spec, since the project config enables MD038 and many others (only MD040 is disabled per the project's "start permissive, tighten later" comment in `.markdownlint.jsonc`).

The substantive intent of AC #13 — "the file passes MD038 and MD040" — is satisfied: MD038 is enforced by the project rule set and reports 0 errors; MD040 is disabled globally but the file ships with no untagged fenced blocks anyway (every code fence is ` ```txt ` or ` ```yaml ` per Wave A convention). 28-01 and 28-04's SUMMARYs document the same invocation lesson; this plan reapplies it.

### [Clarification] Initial draft fell 55 lines short of AC #6 — expanded with three substantive subsections

The initial authoring pass landed at 145 lines, below AC #6's 200-line floor. The expansion to 205 lines was done by adding three substantive subsections, not by padding:

1. `### Worked anchor pairs at each threshold` inside §APCA Lc Thresholds — four canonical neutral pairs (`#1A1A1A`, `#333333`, `#5C5C5C`, `#888888` each on `#FFFFFF`) demonstrating monotonic threshold-ladder behaviour on neutral pairs before color enters.
2. `### Why the math diverges` inside §Why 4.5:1 Misranks — structural explanation tying each of the three failure modes back to one of WCAG 2.1's three blindnesses (weight-blind / hue-blind / chroma-vs-lightness aliasing).
3. `### Common audit-finding patterns` inside §When to Use APCA vs WCAG 2.1 AA — five named patterns (`apca-flags-thin-body`, `wcag-margin-overstated`, `saturated-on-saturated-trap`, `focus-ring-wcag-pass-apca-borderline`, `light-on-dark-asymmetry`) turning dual-target audit output into triageable categories.
4. `### Applying the table to the three worked examples` inside §Lc ↔ WCAG 2.1 Conversion Table — walks the three Example hex pairs back through the conversion table and reports converge / borderline-flag behaviour, making the screening-tool semantics concrete.

Each subsection adds substantive content — concrete pairs, a structural explanation, named audit categories, and a worked screening-tool demonstration — that an agent or designer reading the file once would benefit from. None of the additions are filler; each pulls weight against either the plan's `must_haves.truths` (worked-anchor pairs reinforce the Lc threshold ladder; named audit-finding patterns make the dual-target pattern operational; screening-tool walked-examples make the conversion table actionable) or against the file's "design-quality layer" framing.

## Issues Encountered

None substantive. Two pre-existing project lessons were honored proactively:

1. **28-02 + 28-04 `gsd-tools state` lesson** — no `gsd-tools state` / `roadmap update-plan-progress` / `requirements mark-complete` subcommand was invoked during this plan's execution. STATE.md and ROADMAP.md are untouched and remain at the canonical state shipped at v1.27.7 closeout. Phase 28-07 will atomically refresh state and ROADMAP rule-14 (D-12) at version closeout. The STATE.md modified marker present at session start was inherited from prior wave; this plan does not touch it.

2. **28-01 + 28-04 markdownlint invocation lesson** — used the project's actual lint stack (`markdownlint-cli2` + `.markdownlint.jsonc`), not the plan-prose `markdownlint --rules ...` paraphrase. The plan's verification block is documentation of intent, not the exact CLI form to run. The project standard is the working pattern and is the one Wave A converged on.

## Scope Boundaries Held

- **No edits to `reference/accessibility.md`** — the reciprocal inbound cross-link ('see also: APCA / WCAG 3 draft' into the §WCAG 2.1 / 2.2 section) is reserved for Phase 28-06 per D-06 (additive-only cross-link wiring wave). CRITICAL per the plan's `must_haves.truths` ('NO cross-links INTO this file from other refs — lands in 28-06').
- **No registry entry** — `reference/registry.json` untouched. Lands in 28-06 per D-05. CRITICAL per the plan's `must_haves.truths` ('NO registry entry — lands in 28-06').
- **No edits to `reference/palette-catalog.md`** — boundary check ran (palette-catalog does not mention APCA), no inbound citation added.
- **No audit-scoring lens-tag work** — `reference/audit-scoring.md` untouched. Phase 28's lens-tag work (`composition_alignment` + `i18n_readiness`) is reserved for 28-06 per D-07; this file's `apca-flags-thin-body` / etc. labels are local audit-finding patterns, not lens-tag registrations.
- **No `gsd-tools state` / `roadmap update-plan-progress` / `requirements mark-complete` invocations** — STATE / ROADMAP / REQUIREMENTS untouched per 28-02 + 28-04 lesson and D-12.
- **No manifest version bumps** — `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (× 2 slots) untouched. Lands in 28-07 per D-08.

## Wave B Parallel-Safety with Wave A

`reference/contrast-advanced.md` is a brand-new file. Git diff for this plan = exactly one file added, zero files modified.

This is disjoint from:
- 28-01's `reference/color-theory.md` (already shipped in Wave A)
- 28-02's `reference/composition.md` (already shipped in Wave A)
- 28-03's `reference/proportion-systems.md` (already shipped in Wave A)
- 28-04's `reference/i18n.md` (already shipped in Wave A)

No merge conflict surface. Wave B's "single new file, parallel-safe with Wave A" discipline holds: 5 plans (4 in A + 1 in B), 5 new files, zero overlap.

## D-02 Honored — APCA Ships at v1.28.0

The plan's `must_haves.truths` is explicit: "Ships at v1.28.0 NOT deferred (D-02 lock — bandwidth available; APCA is additive informational; deferring produces a half-step that costs roadmap clarity)." This plan ships the file as Wave B of Phase 28, which lands at v1.28.0 per D-08. The optional gate in the ROADMAP spec ('ships only if Wave A bandwidth allows OR user demand signal lands during Wave A') is closed by D-02 upfront — no mid-wave triage needed.

## Self-Check: PASSED

Verified post-write:

- `reference/contrast-advanced.md` exists on disk (`test -f` OK).
- Commit `b876b63` present at top of branch `claude/phase-28` (`feat(28-05): add reference/contrast-advanced.md (APCA / WCAG 3 draft)`).
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` returns empty — no accidental deletions in the commit, additive-only confirmed.
- All 16 acceptance criteria reproduce on a fresh shell — line count 205, 5 major sections, 34 Lc-threshold mentions, 14 hex-pair matches, 21 WCAG-ratio mentions, 12 table rows (2 tables × 6 each), 3 outbound `accessibility.md` mentions, markdownlint 0 errors, 3 `./` relative link mentions, single trailing newline `0x0a`, scope = exactly one file.
- All 3 worked-example fenced blocks parse as `txt` (Wave A convention), each carries foreground hex + background hex + glyph context + WCAG ratio + APCA Lc + pass/fail verdict.
- All 4 anchor-pair hex values (#1A1A1A, #333333, #5C5C5C, #888888) and all 3 worked-example hex pairs (#666666, #0066CC + #FFFFFF baseline, #FF6600 + #0033AA, plus the inline #5A5A5A fix suggestion) are concrete sRGB hex codes that an auditor can paste into any contrast checker.
- All 5 audit-finding-pattern labels are documented as inline `code` tokens (`apca-flags-thin-body`, `wcag-margin-overstated`, `saturated-on-saturated-trap`, `focus-ring-wcag-pass-apca-borderline`, `light-on-dark-asymmetry`) so an audit report can copy them as machine-readable tags.
- The outbound cross-link `./accessibility.md` resolves to an existing file (`reference/accessibility.md` present in the reference/ directory; verified via `ls`).
- No stubs, no `TODO`, no placeholder copy. Every threshold has a worked anchor pair; every misrank case has a hex pair + glyph context + verdict; every audit-finding pattern has a one-line description naming the WCAG-vs-APCA signature.

## Threat Flags

None — this is a content-only reference file. No network endpoints, no auth surface, no schema changes at trust boundaries, no new file-access patterns. The file describes APCA as a perceptual-contrast standard; neither the file itself nor any agent reading it introduces executable surface.
