---
gsd_state_version: 1.0
milestone: v1.0.0
milestone_name: → v1.27.1)
status: "Phase 28.7 (Multi-Runtime Install — Pragmatic Port from gsd-build) closed out — v1.28.7 shipped (2026-05-19). 4-manifest lockstep at v1.28.7 + CHANGELOG `## [1.28.7]` block at top + OFF_CADENCE_VERSIONS.add('1.28.7'). 10 plans across Wave A foundations (runtime-homes + runtime-artifact-layout + runtime-slash) + Wave B converters (13 per-runtime converters + shared.cjs in scripts/lib/install/converters/) + Wave C wire-up + 14-runtime simulation suite + closeout. Replaces Phase 24 `kind: 'agents-md'` placeholder with proper native install per runtime (skills/, command/, agents/, or .clinerules rule-block aggregation). Architecture ported from gsd-build/get-shit-done (MIT, D-02 port-not-byte-copy); NOTICE extended. Cline embeds rule-blocks in .clinerules (D-09); Codex uses `$gdd-<name>` shell-var slash form. Phase 21 cross-harness tool-name maps reused. 4-file regression baseline at test-fixture/baselines/phase-28.7/ (manifests-version '1.28.7', converter-inventory 14 .cjs files with hermes.cjs absence guard, registry-diff 'no registry changes', cross-link-integrity PASS). tests/phase-28.7-baseline.test.cjs adds 16 version-agnostic tests (full RegExp escape per CodeQL js/incomplete-sanitization). ROADMAP entry CREATED for Phase 28.7 (INSERTED between 28.6 and 29) + scoped flip (10 inline plan checkboxes + 1 overview entry). Forward-propagation: phase-28.6/manifests-version.txt 1.28.6 -> 1.28.7 and phase-28/manifests-version.txt 1.28.6 -> 1.28.7. phase-20/skill-list.txt UNCHANGED (no skill add/remove). README clarified all 14 runtimes receive native artifact layout (no Experimental tier per D-04). Phase 28.6 (Skill Reference Co-Location) shipped prior at v1.28.6. Phase 31 (Figma Off-Context Extractor) in progress."
last_updated: "2026-05-19T14:10:00.000Z"
progress:
  total_phases: 9
  completed_phases: 7
  total_plans: 62
  completed_plans: 62
  percent: 100
---

# Project State

> **Single source of truth = `.planning/ROADMAP.md`.** This file is a thin pointer that summarizes status; full phase specs, dependency notes, and waves live in ROADMAP.md.

## Project Reference

See: [.planning/PROJECT.md](PROJECT.md) (updated 2026-04-17)

**Core value:** Any developer can run the full pipeline on a real project and receive measurable, specific design improvement — not generic AI advice.

## Current Position

**Released:** **v1.28.7** (latest npm + git tag, 2026-05-19 — Multi-Runtime Install, pragmatic port from gsd-build).

**In progress:**

- Phase 31 — Figma Off-Context Extractor + Variables Sync Plugin (target v1.31.0). See [.planning/phases/31-figma-extractor-sync/PLAN.md](phases/31-figma-extractor-sync/PLAN.md).

**Planned next** (post-2026-05-16 rebalance — see [ROADMAP.md Overview](ROADMAP.md#planned-v1275--v1490)):

- **Near-term integration**: ~~27.5 (Bandit Prod) ✓~~, ~~27.6 (Perf Optimization) ✓~~, ~~27.7 (GDD MCP) ✓~~, ~~28 (Tier-2 Refs) ✓~~, ~~28.5 (Skill Contract + Rework) ✓~~, ~~28.6 (Skill Reference Co-Location, corrective) ✓~~, ~~28.7 (Multi-Runtime Install, pragmatic port from gsd-build) ✓~~ — all shipped
- **Reflection + feedback**: 29 (Cap-Gap Self-Author), 30 (Issue Reporter), 30.5 (Failure-Mode Catalogue — NEW)
- **Active project**: 31 (Figma Extractor), 31.5 (SDK Reorg)
- **Skill discipline**: 32 (Auto-Trigger), 33 (Behavior Tests), 33.5 (Runtime Security — NEW)
- **Output expansion (split-phases)**: 34.1 Native / 34.2 Email / 34.3 Print-PDF
- **Team layer (split-phases + new)**: 36.1 PR Inline / 36.2 Notification / 36.3 Ticket Sync, 36.5 Export — NEW
- **Knowledge (split-phases)**: 37.1 Domain Packs / 37.2 Motion Tools / 37.3 Conversational
- **AI tools + greenfield (split)**: 38.1 Wave 2 connections / 38.2 Greenfield DS
- **Adaptation**: 39 (Outcome-Driven), 39.5 (Deployment Loop — NEW)
- **Ops (split + new)**: 40.1 DS Migration / 40.2 Cost Governance, 40.5 GDD Self-Migration — NEW
- **Team mode + locale**: 41 (Collaboration), 41.5 (CLI Localization — NEW)
- **Impeccable-gap closeout**: 42 (`gdd-detect`), 43 (multi-harness compile), 44 (STYLE.md), 45 (HARNESSES.md), 46 (canonical domain index), 47 (skill UX polish), 48 (`/gdd:live`), 49 (Audit & Pillar Expansion — was Phase 35; ships after 42 + 44)

**After all planned phases ship:** v1.49.0 (~22 minor releases beyond v1.27.1, ~280 plans total — roughly 1.5× existing codebase).

## Phases shipped (40 through v1.28.7)

| # | Phase | Version | Shipped |
|---|-------|---------|---------|
| 1 | Foundation + Distribution + Infrastructure | — | 2026-04-17 |
| 2 | Core Agents + Stage Orchestration | — | 2026-04-17 |
| 3 | Quality Gate Agents + Pipeline Polish | — | 2026-04-17 |
| 4 | Connections Layer | — | 2026-04-17 |
| 5 | Automation Agents + New Commands | — | 2026-04-17 |
| 6 | Validation + Version Bump | v1.0.0 | 2026-04-18 |
| 7 | GSD Parity + Exploration | v1.0.1 | 2026-04-18 |
| 8 | Visual + Design-Side Connections + Knowledge Graph | v1.0.2 | 2026-04-18 |
| 9 | Claude Design Integration + Pinterest Connection | v1.0.3 | 2026-04-18 |
| 10 | Knowledge Layer | v1.0.4 | 2026-04-18 |
| 10.1 | Optimization Layer + Cost Governance (INSERTED) | v1.0.4.1 *(CHANGELOG)* | 2026-04-18 |
| 11 | Self-Improvement | v1.0.5 | 2026-04-18 |
| 12 | Test Coverage | v1.0.5 | 2026-04-18 |
| 13 | CI/CD | v1.13.0 | 2026-04-18 |
| 13.1 | Figma MCP Consolidation (INSERTED) | v1.13.1 | 2026-04-19 |
| 13.2 | External Authority Watcher (INSERTED) | v1.13.2 | 2026-04-19 |
| 13.3 | Plugin Update Checker (INSERTED) | v1.13.3 | 2026-04-19 |
| 14 | AI-Native Design Tool Connections | v1.14.0 | 2026-04-19 |
| 14.5 | Safety + Recall Floor (INSERTED) | v1.14.6 *(slot v1.14.5 burned)* | 2026-04-24 |
| 14.6 | Test Coverage Completion (INSERTED) | v1.14.6 | 2026-04-24 |
| 14.7 | First-Run Proof Path (INSERTED) | v1.14.8 *(slot v1.14.7 burned)* | 2026-04-24 |
| 15 | Design Knowledge Expansion | v1.15.0 | 2026-04-24 |
| 16 | Component Benchmark Corpus — Tooling + Waves 1–2 | v1.16.0 | 2026-04-24 |
| 17 | Component Benchmark Corpus — Waves 3–5 + Pipeline Integration | v1.17.0 | 2026-04-24 |
| 18 | Advanced Craft References | v1.18.0 | 2026-04-24 |
| 19 | Platform, Inclusive & UX Research References | v1.19.0 | 2026-04-24 |
| 19.5 | Cross-Cycle Memory (INSERTED) | v1.19.5 | 2026-04-24 |
| 19.6 | Design Philosophy Layer (INSERTED) | v1.19.6 | 2026-04-24 |
| 20 | GDD SDK Foundation | v1.20.0 | 2026-04-24 |
| 21 | GDD SDK Headless | v1.21.0 | 2026-04-24 |
| 22 | GDD SDK Observability | v1.22.0 | 2026-04-25 |
| 23 | GDD SDK Domain Primitives | v1.23.0 | 2026-04-25 |
| 23.5 | No-Regret Adaptive Layer (INSERTED) | v1.23.5 | 2026-04-25 |
| 24 | Multi-Runtime Installer | v1.24.0 | 2026-04-25 |
| 25 | Pipeline Hardening | v1.25.0 | 2026-04-29 |
| 26 | Headless Model Resolver | v1.26.0 | 2026-04-29 |
| 27 | Peer-CLI Delegation Layer | v1.27.0 (+ v1.27.1 patch) | 2026-04-30 / 2026-05-02 |
| 27.5 | Bandit Production Integration (INSERTED) | v1.27.5 | 2026-05-16 |
| 27.6 | Pipeline Performance + Token-Cost Optimization (INSERTED) | v1.27.6 | 2026-05-17 |
| 27.7 | GDD MCP Server (INSERTED) | v1.27.7 | 2026-05-18 |
| 28 | Foundational References Tier 2 — Color, Composition, Proportion, i18n | v1.28.0 | 2026-05-18 |
| 28.5 | Skill Authoring Contract + Skill Rework + Project Artifacts (INSERTED) | v1.28.5 | 2026-05-18 |
| 28.6 | Skill Reference Co-Location (INSERTED — Corrective Follow-Up to Phase 28.5) | v1.28.6 | 2026-05-18 |
| 28.7 | Multi-Runtime Install (INSERTED — Pragmatic Port from gsd-build) | v1.28.7 | 2026-05-19 |

## Open follow-ups

- [ ] Phase 31 plan execution (in progress in `.planning/phases/31-figma-extractor-sync/`).
- [ ] Apply `scripts/apply-branch-protection.sh --enforcing` after CI has been green for one release cycle (per D-17 two-phase rollout in `reference/BRANCH-PROTECTION.md`).
- [ ] Resolve Phase 35 ↔ Phase 42 numbering inversion (35 consumes 42's `gdd-detect`; either renumber or annotate "soft-blocks-on-42").
- [ ] Baseline measurement for Phase 46's "20–40% token-load reduction" claim (separate spike before 46 plan-phase).

## Notes on this file

Historical detail (per-phase plans, velocity tables, etc.) lives in:

- [ROADMAP.md](ROADMAP.md) — phase specs, progress table, deferred backlog
- `.planning/phases/<phase-N>/` — per-phase PLAN.md, CONTEXT.md, etc.
- `CHANGELOG.md` (repo root) — user-facing version history
