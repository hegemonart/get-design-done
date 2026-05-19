---
phase: 28.8
name: tier-2-distribution-channels
version_target: v1.28.8
depends_on: [28.7]
status: planned
created: 2026-05-19
---

# Phase 28.8 — Tier-2 Distribution Channels — CONTEXT

## Goal

Extend distribution reach beyond Claude Code marketplace (Tier 1) and file-drop installs (Phase 28.7 foundation) to three structured Tier-2 channels:

1. **Workstream A — agentskills.io compliance.** agentskills.io is the open SKILL.md spec released by Anthropic and adopted by ~38 tools (Cursor, Codex, Claude Code, Gemini CLI, OpenCode, Kilo, Hermes, etc.). NOT a registry — a STANDARD. Wave A validates our `skills/` against the spec, identifies gaps, ships a lint check.
2. **Workstream B — Cursor Marketplace integration.** Cursor's plugin/rules registry (launched Feb 2026). Maintainer-confirmed publish access. New `kind: 'cursor-marketplace'` + `.cursor-plugin/manifest.json` manifest.
3. **Workstream C — Codex Plugin distribution.** `.codex-plugin/plugin.json` manifest at repo root. Install today via `codex plugin marketplace add owner/repo` (self-serve "coming soon" but install-by-URL works). New `kind: 'codex-plugin'`.

**User direction 2026-05-19:** "i can add it to cursor marketplace. в кодексе вроде пока нет официального добавления (прочитай тут https://developers.openai.com/codex/plugins/build)" — confirmed Cursor access, requested re-verification of Codex distribution mechanics. Codex docs (re-fetched 2026-05-19) confirm `codex plugin marketplace add owner/repo` works against any GitHub URL with `.codex-plugin/plugin.json`. Self-serve registry "coming soon" but does not block install-by-URL distribution today.

## Why this phase exists

Phase 28.7 (just shipped at v1.28.7) gave us proper file-drop install for all 14 runtimes — users who clone our repo or `npm install -g` get working skills/agents/commands in the right native format per runtime. That covers **directed-install** users.

Tier-2 channels cover **discovery-install** users — people who browse Cursor's marketplace UI or Codex's `/plugins` directory and find us without prior awareness. Three reasons this is worth doing now:

1. **38 tools claim agentskills.io compat.** Compliance check is cheap (our Phase 28.5 contract is already mattpocock-shaped, which the agentskills.io spec mirrors). Confirming compliance unlocks cross-runtime portability without code changes — or surfaces small fixes if there's drift.

2. **Cursor Marketplace launched Feb 2026, maintainer has access.** No blocker. Manifest is one JSON file + a publish action by the maintainer.

3. **Codex Plugins ship by GitHub URL today.** Manifest is one JSON file. User runs `codex plugin marketplace add hegemonart/get-design-done` as the field-test post-merge — no account, no marketplace review.

GSD reference (`gsd-build/get-shit-done`) does NOT yet ship to any Tier-2 channel — this is differentiation territory.

## What ships

| Plan | Wave | Surface |
|------|------|---------|
| 28-8-01 | A | `.planning/research/agentskills-io-2026-05-19.md` — agentskills.io spec deep-read; claimed-compat verification per runtime (which runtimes' docs reference the spec); schema mapping (our `skills/<name>/SKILL.md` frontmatter → agentskills.io spec); gap analysis; adoption recommendation (adopt / partial / lint-only / no-op). Records D-XX in this CONTEXT. |
| 28-8-02 | A | `.planning/research/cursor-marketplace-2026-05-19.md` — Cursor Marketplace re-verify (launch date confirmation; manifest format; admin requirements; field-test prerequisites). Plugin manifest schema mapping from our `skills/` structure → `.cursor-plugin/manifest.json`. |
| 28-8-03 | A | `.planning/research/codex-plugins-2026-05-19.md` — Codex Plugins re-verify (developers.openai.com/codex/plugins/build current spec; vs our existing AGENTS.md surface — what's additive). Plugin manifest schema mapping from our `skills/` structure → `.codex-plugin/plugin.json`. |
| 28-8-A1 | B | `scripts/lib/install/converters/agentskills-io.cjs` (consolidated agentskills.io-shape converter, if Wave A recommends consolidate) OR `scripts/lint-agentskills-spec.cjs` only (lint-only path) OR no-op (per Wave A recommendation). Tests on consolidated converter output OR lint pass against current skills/. |
| 28-8-A2 | B | Cross-runtime agentskills.io compat verification: re-test each runtime claiming compat (subset of Codex / Kilo / Augment / Hermes / Qwen per Wave A findings) against converted skills. Each gets a 1-page verification report at `.planning/research/agentskills-io-compat/<runtime>.md`. |
| 28-8-B1 | B | `scripts/lib/install/converters/cursor-marketplace.cjs` + `.cursor-plugin/manifest.json` generator. New `kind: 'cursor-marketplace'` in `scripts/lib/install/runtimes.cjs`. Tests on manifest schema validation + simulated install to tmpdir. |
| 28-8-B2 | B | Cursor Marketplace distribution-channel doctor integration. `scripts/install.cjs --doctor` reports "registered in Cursor Marketplace: yes/no" (based on manifest presence + last-publish timestamp from `.cursor-plugin/marketplace-state.json` written post-publish). Field-test: maintainer runs `cursor marketplace publish` post-merge, doctor verifies. |
| 28-8-C1 | B | `scripts/lib/install/converters/codex-plugin.cjs` + `.codex-plugin/plugin.json` generator (per developers.openai.com/codex/plugins/build spec). New `kind: 'codex-plugin'` in `runtimes.cjs`. Tests on manifest schema + simulated install. |
| 28-8-C2 | B | Codex Plugin distribution doctor integration. `scripts/install.cjs --doctor` reports "Codex plugin manifest present: yes/no". Field-test: maintainer runs `codex plugin marketplace add hegemonart/get-design-done` post-merge against the live repo URL, doctor verifies install succeeds. |
| 28-8-X1 | C | `scripts/build-distribution-bundles.cjs` — shared source / multiple channel-specific bundles. Consumes `skills/` + Wave B converters, produces `dist/cursor-marketplace/`, `dist/codex-plugin/`, `dist/agentskills-io/`. Tests on bundle output diff between channels (channel-specific files only differ where converter intentionally diverges). |
| 28-8-X2 | C | `scripts/install.cjs --doctor` Tier-2 extension consolidation: aggregate B2 + C2 + Wave A lint pass into single "tier-2 status" doctor section. Tests on doctor output format. |
| 28-8-Z1 | D | **Phase closeout v1.28.8**: 4-manifest lockstep bump to 1.28.8 (`package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` × 2 slots); CHANGELOG `## [1.28.8]` block; `OFF_CADENCE_VERSIONS.add('1.28.8')` in `tests/semver-compare.test.cjs`; `tests/phase-28.8-baseline.test.cjs` (16 version-agnostic tests); `test-fixture/baselines/phase-28.8/` baselines; README + 9 translated READMEs updated with Tier-2 install paths per adopted channel; ROADMAP scoped flip (12 inline plan checkboxes + 1 overview entry); forward-prop phase-28.7/manifests-version.txt 1.28.7 → 1.28.8. |

**Wave A (3 plans):** parallel-safe — disjoint research docs.

**Wave B (6 plans):** Plan dependencies — A1 depends on 01, A2 depends on A1, B1 depends on 02, B2 depends on B1, C1 depends on 03, C2 depends on C1. A1/A2 + B1/B2 + C1/C2 chains are mutually parallel-safe.

**Wave C (2 plans):** sequential after Wave B — X1 bundles, X2 doctor aggregation.

**Wave D (1 plan):** sequential after Wave C — closeout.

**Total: 12 plans.**

## Decisions locked

| # | Decision | Rationale |
|---|----------|-----------|
| D-01 | **Three workstreams: A (agentskills.io) + B (Cursor Marketplace) + C (Codex Plugin), all in scope.** Defer Cline MCP Marketplace / Kilo Marketplace / Trae / CodeBuddy / Hermes Skills Hub to Phase 28.10+. | Three workstreams keep scope manageable (~12 plans). Maintainer confirmed Cursor access + Codex install-by-URL works without registry. Other channels add ~10+ plans without proven user demand. |
| D-02 | **agentskills.io is a STANDARD, not a registry.** Wave A research output may downgrade Workstream A from "adopt" to "lint-only" if our Phase 28.5 contract is already spec-compliant. No new registry account, no submission process — agentskills.io showcases compatible tools on a homepage carousel. | Avoids over-engineering Workstream A. The actual value is cross-runtime portability via standard SKILL.md format. |
| D-03 | **Codex Plugin distribution-by-URL works today.** Self-serve registry "coming soon" but `codex plugin marketplace add owner/repo` accepts any GitHub URL with `.codex-plugin/plugin.json` per developers.openai.com/codex/plugins/build (re-fetched 2026-05-19). No account, no review. | Closes "field-test access" open question from ROADMAP spec. C2 field-test is `codex plugin marketplace add hegemonart/get-design-done` — runnable by maintainer immediately post-merge. |
| D-04 | **Cursor Marketplace: maintainer has access for live publish.** Confirmed 2026-05-19. Manifest format per Cursor docs (re-verify in 28-8-02 research at workstream start). | Closes Wave B field-test gate. |
| D-05 | **New `kind: 'cursor-marketplace'` and `kind: 'codex-plugin'` in runtimes.cjs are ADDITIVE.** Phase 28.7's existing `cursor.cjs` (file-drop install to `~/.cursor/skills/`) and `codex.cjs` (file-drop AGENTS.md surface) REMAIN unchanged. Tier-2 channels coexist with Tier-1 file-drop. | Backward-compat. Users on existing install paths don't break. Tier-2 is opt-in via marketplace UI. Matches Phase 28.7 D-12 ship-together discipline. |
| D-06 | **Skills are shared source.** `scripts/build-distribution-bundles.cjs` produces channel-specific bundles from one `skills/` tree. No forking. Converter difference between Tier-1 (file-drop) and Tier-2 (marketplace bundle) is bundling shape only — same SKILL.md content. | Maintainability. One source of truth survives 38-tool adoption. |
| D-07 | **All workstream-start re-verification mandatory.** The 2026-05-18 audit established the framing; vendor docs may have shifted in 1-7 days. Each Wave A plan re-fetches the relevant doc and pin-dates it. If spec changed in incompatible way, downgrade workstream scope before Wave B begins. | Matches Phase 28.7 source-of-truth discipline. Avoids implementing against stale specs. |
| D-08 | **All 12 plans ship together at v1.28.8.** 4-manifest lockstep. `OFF_CADENCE_VERSIONS.add('1.28.8')` (decimal version). Baselines at `test-fixture/baselines/phase-28.8/`. ROADMAP scoped flip (12 inline plan checkboxes + 1 overview entry). Phase 28.7 baselines manifests-version.txt forward-propped from 1.28.7 → 1.28.8. | Standard ship-it-together (Phase 25..28.7 precedent). |
| D-09 | **Live publish + live install field-tests happen POST-merge as maintainer steps.** v1.28.8 ships all manifest code + bundle generators + doctor mode. After merge: (a) maintainer runs `cursor marketplace publish` for Cursor; (b) maintainer runs `codex plugin marketplace add hegemonart/get-design-done` for Codex. Doctor mode (X2) verifies post-publish state. | We don't need maintainer creds in CI. Tier-1 install (Phase 28.7) keeps working through Tier-2 publish window. |
| D-10 | **Tests use tmpdir simulation per Phase 28.7 D-13.** No live marketplace calls in CI. Manifest schema validation + simulated install path checks only. | Reproducible, no leaked state, no maintainer creds in CI. |
| D-11 | **Branch on Wave A finding for Workstream A scope.** Possible outcomes per A1: (a) consolidate — refactor common patterns from Phase 28.7's per-runtime converters into shared `agentskills-io.cjs`; (b) partial — consolidate a subset of runtimes; (c) lint-only — no consolidation, just `lint-agentskills-spec.cjs` enforcing ongoing compliance; (d) no-op — Phase 28.7 produced no agentskills.io-shape output worth consolidating. Wave A.1 records the chosen branch as D-13. | Avoids predetermined scope before research. The 28.5 corrective (centralized refs → per-skill refs) is a precedent — research findings can revise scope mid-phase. |
| D-12 | **agentskills.io homepage carousel placement is NOT a deliverable.** Anthropic's curation, not ours to claim. Workstream A's outcome is technical compliance + lint check, not marketing inclusion. | Carousel inclusion is downstream of compliance. If Anthropic curates us, that's organic. |
| D-13 | **agentskills.io adoption outcome: `lint-only`.** Schema mapping shows 2/2 required spec fields (`name`, `description`) already match our Phase 28.5 frontmatter contract; 0 strictly-required changes; the single rename candidate (`tools` ↔ `allowed-tools`) targets a spec field explicitly flagged Experimental and not in OpenCode's recognized-field list — so a lint gate (28-8-A1) is preferable to consolidating Phase 28.7's per-runtime converter cluster. See `.planning/research/agentskills-io-2026-05-19.md` § Adoption Recommendation. | Recorded by 28-8-01 on 2026-05-19. Wave B (28-8-A1 + 28-8-A2) scope follows from this branch per D-11. |

## Out of scope (rejected)

- **Cline MCP Marketplace / Kilo Marketplace / Trae Custom Agents / CodeBuddy SkillHub / Hermes Skills Hub distribution.** Each is its own Tier-2 channel adding ~5+ plans. Defer to Phase 28.10+ proposals after 28.8's three workstreams land. If Workstream A succeeds and agentskills.io compliance carries those runtimes for free (Kilo, Hermes, CodeBuddy claim compat per 2026-05-18 audit), Phase 28.10+ may be unnecessary.
- **Auto-publish on `npm publish`.** Tier-2 channel registration automation is Phase 28.11+ concern. v1.28.8 ships manual publish flow.
- **Cross-marketplace analytics / install-count tracking.** Distribution observability is its own phase.
- **Pricing / paid plugins.** All GDD distribution is free/MIT regardless of channel.
- **Backward-compat removal of Phase 28.7 file-drop install for Cursor/Codex.** Phase 28.7 file-drop install remains the default — Tier-2 channels are additive opt-in (D-05).
- **Marketplace metadata polish** (screenshots, demo videos, paid description copywriting). Stub generic metadata in 28.8; polish in a follow-up if traction warrants.
- **Live marketplace API calls in CI.** Tests use tmpdir simulation only (D-10). Live marketplace tests are post-merge maintainer steps.

## References

- Phase 28.7 CONTEXT (`.planning/phases/28.7-verified-install-for-claimed-runtimes/CONTEXT.md`) — file-drop install foundation this builds on.
- Phase 28.5 CONTEXT (`.planning/phases/28.5-skill-authoring-contract/CONTEXT.md`) — skill authoring contract that agentskills.io compliance check validates against.
- agentskills.io spec (https://agentskills.io) — open SKILL.md format; carousel lists 38 adopting tools as of 2026-05-19.
- developers.openai.com/codex/plugins/build — Codex Plugin manifest spec + distribution mechanics; re-fetched 2026-05-19, install-by-URL confirmed working.
- ROADMAP.md Phase 28.8 section — original phase spec (lines ~1890-1985).
- gsd-build/get-shit-done (https://github.com/gsd-build/get-shit-done) — reference impl; does NOT ship to Tier-2 channels; differentiation opportunity.
