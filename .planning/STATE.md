---
gsd_state_version: 1.0
milestone: v1.0.0
milestone_name: milestone
status: Phase 27 + v1.27.1 wiring patch shipped. Phase 31 (Figma Off-Context Extractor) in progress. Roadmap rebalanced 2026-05-16 — 7 new decimal phases inserted (27.6, 30.5, 33.5, 36.5, 39.5, 40.5, 41.5), 5 phases split into sub-phases (34→34.1/2/3, 36→36.1/2/3, 37→37.1/2/3, 38→38.1/2, 40→40.1/2), Phase 35 renumbered → 49 (consumes 42 + 44).
stopped_at: v1.27.1 (2026-05-02). See ROADMAP.md Phase Details for full phase list (1 → 49).
last_updated: "2026-05-16T11:00:00.000Z"
last_activity: 2026-05-16
progress:
  total_phases: 60
  completed_phases: 33
  total_plans_approx: 280
  completed_plans_approx: 178
  percent: 55
---

# Project State

> **Single source of truth = `.planning/ROADMAP.md`.** This file is a thin pointer that summarizes status; full phase specs, dependency notes, and waves live in ROADMAP.md.

## Project Reference

See: [.planning/PROJECT.md](PROJECT.md) (updated 2026-04-17)

**Core value:** Any developer can run the full pipeline on a real project and receive measurable, specific design improvement — not generic AI advice.

## Current Position

**Released:** **v1.27.1** (latest npm + git tag, 2026-05-02 — Peer-CLI Delegation wiring patch).

**In progress:**
- Phase 31 — Figma Off-Context Extractor + Variables Sync Plugin (target v1.31.0). See [.planning/phases/31-figma-extractor-sync/PLAN.md](phases/31-figma-extractor-sync/PLAN.md).

**Planned next** (post-2026-05-16 rebalance — see [ROADMAP.md Overview](ROADMAP.md#planned-v1275--v1490)):

- **Near-term integration**: 27.5 (Bandit Prod), 27.6 (Perf Optimization — NEW), 28 (Tier-2 Refs), 28.5 (Skill Contract + Rework)
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

## Phases shipped (33 through v1.27.1)

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
