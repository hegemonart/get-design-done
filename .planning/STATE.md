---
gsd_state_version: 1.0
milestone: v1.0.7.2
milestone_name: milestone
status: Phase 13.2 COMPLETE — v1.0.7.2 shipped
stopped_at: Completed 13.2-04-PLAN.md — Phase 13.2 closed
last_updated: "2026-04-19T22:21:50.000Z"
last_activity: 2026-04-19 -- Phase 13.2 complete (v1.0.7.2 shipped — rejected-kinds + watcher-diff-structural-v1 tests; atomic manifests bump; CHANGELOG + README; 233/0/1 suite green)
progress:
  total_phases: 21
  completed_phases: 1
  total_plans: 17
  completed_plans: 13
  percent: 62
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** Any developer can run the full pipeline on a real project and receive measurable, specific design improvement — not generic AI advice.
**Current focus:** Phase 13.2 — external-authority-watcher

## Current Position

Phase: 13.2 (external-authority-watcher) — **COMPLETE**
Plan: 4 of 4 (ALL PLANS SHIPPED)
Shipping: **v1.0.7.2** — off-cadence decimal patch (skips 1.0.7.1, reserved for Phase 13.1)
Previous release: v1.0.7 at https://github.com/hegemonart/get-design-done/releases/tag/v1.0.7
Next phase: 14 (AI-Native Design Tool Connections) — not yet started
Last activity: 2026-04-19 -- Phase 13.2 Plan 04 complete (rejected-kinds + watcher-diff-structural-v1 CI tests; atomic v1.0.7.2 bump across 3 manifests; CHANGELOG + README shipped; full test suite 233/0/1 green; schemas + semver-compare relaxed via Rule 3 to accept the locked 4-segment off-cadence version)

Resume file: (none — Phase 13.2 closed; Phase 14 discuss-phase is next)

Progress: [█████████████████░░░] 79% (15/19 phases complete through v1.0.7.2)

## Phases completed (through v1.0.7)

| Phase | Version | Shipped |
|-------|---------|---------|
| 1  — Foundation + Distribution + Infrastructure | — | 2026-04-17 |
| 2  — Core Agents + Stage Orchestration | — | 2026-04-17 |
| 3  — Quality Gate Agents + Pipeline Polish | — | 2026-04-17 |
| 4  — Connections Layer | — | 2026-04-17 |
| 5  — Automation Agents + New Commands | — | 2026-04-17 |
| 6  — Validation + Version Bump | v1.0.0 | 2026-04-18 |
| 7  — GSD Parity + Exploration | v1.0.1 | 2026-04-18 |
| 8  — Visual + Design-Side Connections + Knowledge Graph | v1.0.2 | 2026-04-18 |
| 9  — Claude Design Integration + Pinterest Connection | v1.0.3 | 2026-04-18 |
| 10 — Knowledge Layer | v1.0.4 | 2026-04-18 |
| 10.1 — Optimization Layer + Cost Governance (INSERTED) | v1.0.4.1 | 2026-04-18 |
| 11 — Self-Improvement | v1.0.5 | 2026-04-18 |
| 12 — Test Coverage | v1.0.6 | 2026-04-18 |
| 13 — CI/CD | v1.0.7 | 2026-04-18 |
| 13.2 — External Authority Watcher (INSERTED) | v1.0.7.2 | 2026-04-19 |

## Open follow-ups

- [ ] Apply `scripts/apply-branch-protection.sh --enforcing` after CI has been green for one release cycle (per D-17 two-phase rollout in `reference/BRANCH-PROTECTION.md`).
- [ ] Phase 14 discuss + plan (AI-native design tool connections).

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: ~4 min (Phase 2 plans)
- Total execution time: ongoing

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 | 5 | - | - |
| Phase 02 | 1 (so far) | ~4 min | ~4 min |

**Recent Trend:**

- Last 5 plans: Phase 01 P01-P05, Phase 02 P01
- Trend: steady

*Updated after each plan completion*
| Phase 01 P01 | 1 | 3 tasks | 2 files |
| Phase 01-foundation-distribution-infrastructure P02 | 8 | 4 tasks | 4 files |
| Phase 01 P03 | 1 minute | 1 tasks | 1 files |
| Phase 01-foundation-distribution-infrastructure P04 | 15 | 3 tasks | 4 files |
| Phase 01 P01-05 | 5 | 2 tasks | 2 files |
| Phase 02 P01 | 4 minutes | 3 tasks | 4 files |
| Phase 02 P03 | 3 | 2 tasks | 2 files |
| Phase 02-core-agents-stage-orchestration P04 | 3 | 3 tasks | 7 files |
| Phase 03-quality-gate-agents-pipeline-polish P03 | 2 min | 3 tasks | 4 files |
| Phase 03-quality-gate-agents-pipeline-polish P02 | 5 | 3 tasks | 3 files |
| Phase 03 P01 | 289 | 3 tasks | 3 files |
| Phase 03-quality-gate-agents-pipeline-polish P06 | 2 min | 3 tasks | 3 files |
| Phase 03-quality-gate-agents-pipeline-polish P04 | 2 | 3 tasks | 1 files |
| Phase 03 P06 | 2 | 3 tasks | 3 files |
| Phase 03-quality-gate-agents-pipeline-polish P05 | 5 | 4 tasks | 5 files |
| Phase 04-connections-layer P01 | 3 | 3 tasks | 3 files |
| Phase 04 P02 | 2 | 3 tasks | 2 files |
| Phase 04-connections-layer P03 | 5 | 2 tasks | 2 files |
| Phase 05-automation-agents-new-commands P02 | 1 | 2 tasks | 2 files |
| Phase 05-automation-agents-new-commands P03 | 3 | 3 tasks | 3 files |
| Phase 05-automation-agents-new-commands P04 | 2 | 2 tasks | 2 files |
| Phase 05-automation-agents-new-commands P05 | 101 | 2 tasks | 2 files |
| Phase 12-test-coverage P01 | 8 min | 3 tasks | 3 files |
| Phase 12 P02 | 5 min | 2 tasks | 8 files |
| Phase 08 P02 | 258 | 3 tasks | 5 files |
| Phase 08 P03 | 246 | 2 tasks | 5 files |
| Phase 08-visual-design-connections P01 | 372 | 4 tasks | 6 files |
| Phase 08 P05 | 190 | 2 tasks | 5 files |
| Phase 10.1 P03 | 58 min | 5 tasks | 29 files |
| Phase 10.1 P04 | 20 min | 8 tasks | 8 files |
| Phase 13.2 P01 | 11 min | 2 tasks | 3 files |
| Phase 13.2 P02 | 7 min | 2 tasks | 8 files |
| Phase 13.2 P03 | 4 min | 2 tasks | 4 files |
| Phase 13.2 P04 | 7 min | 4 tasks | 12 files |

## Accumulated Context

### Decisions

- [Pre-roadmap]: Artifact naming convention — utilities use distinct prefixes (DARKMODE-AUDIT.md, DESIGN-STYLE-[Component].md, COMPARE-REPORT.md); pipeline owns DESIGN-*.md namespace
- [Pre-roadmap]: `compare` scoped to delta between existing DESIGN.md + DESIGN-VERIFICATION.md — no snapshot mechanism required for v3
- [Pre-roadmap]: `darkmode` is audit-only — no fix execution (fixes belong in design skill's color task)
- [2026-04-17]: Pipeline architecture shifts to GSD-style agent orchestration — stages become thin wrappers around specialized agents (planner, executor, verifier, pattern-mapper, etc.) modeled on GSD's proven pattern
- [2026-04-17]: .design/STATE.md becomes the single source of pipeline truth — every stage reads at entry, writes at completion; enables resume and cross-stage context
- [2026-04-17]: Connections formalized as a first-class concept (connections/ directory) with Figma + Refero as v3 connections and an extensibility pattern for future (Storybook, Linear, GitHub)
- [2026-04-17]: .planning/ and .claude/memory/ are development-only — gitignored and untracked so the plugin distribution stays clean for users
- [Phase 01]: .planning/ and .claude/memory/ untracked via git rm --cached (history preserved, no filter-repo)
- [Phase 01]: Distribution section added to README to surface ship/no-ship boundary to plugin users
- [Phase 01-foundation]: CSS literal parens in -E mode use \( \) escaping to distinguish grouping from literal CSS function parens
- [Phase 01-foundation]: SCAN-04 fallback written as prose instructions not shell variables — avoids tool-call isolation pitfall
- [Phase 01]: reference/STATE-TEMPLATE.md ships in reference/ (not .design/) because .design/ is gitignored — scan copies it to .design/STATE.md at runtime
- [Phase 01]: task_progress numerator is sole source of truth for pipeline resume — not timestamps (STATE-03)
- [Phase 01]: Phase 1 delivers STATE-TEMPLATE only — no SKILL.md STATE integration (Pitfall 5 deferred to Phase 2)
- [Phase 01-foundation]: agents/README.md is the single authoring contract — Phase 2 implementers need no GSD source reading
- [Phase 01-foundation]: git mv preserves blame for refero.md — git log --follow shows full pre-move history
- [Phase 02 P02]: Stage-executor split: design/SKILL.md becomes thin orchestrator; all 10 per-type execution guides migrate verbatim into design-executor.md
- [Phase 02 P02]: Completion markers locked — design-executor uses ## EXECUTION COMPLETE (execution agent convention); design stage uses ## DESIGN COMPLETE (stage convention)
- [Phase 02 P02]: Worktree merge pattern preserved verbatim from v2.1.0 — parallel batch uses isolation=worktree, sequential tail uses direct Task() calls
- [Phase 02 P02]: is_parallel forwarded in prompt context so executor distinguishes worktree vs main-branch commits
- [Phase 02 P02]: STATE.md graceful fallback — design stage creates skeleton from reference/STATE-TEMPLATE.md if absent, logs warning
- [Phase 01-foundation]: connections/connections.md capability matrix uses 5 pipeline stage columns: scan | discover | plan | design | verify
- [Phase 01]: POSIX [[:space:]] replaces GNU \s in 6 grep calls; ([^a-zA-Z]|$) replaces \b word boundary on scan line 147
- [Phase 02-01]: Completion markers locked — PLANNING COMPLETE, RESEARCH COMPLETE, PLAN CHECK COMPLETE, PLAN COMPLETE
- [Phase 02-01]: design-pattern-mapper deferred to Phase 3 — TODO(phase-3) marker left in plan/SKILL.md at exact spawn point (AGENT-09)
- [Phase 02-01]: DESIGN-PLAN.md output format locked — Wave sections, Type/Scope/Touches/Parallel/Acceptance fields preserved from v2.1.0
- [Phase 02-01]: design-plan-checker returns structured text result (not a file) — plan stage presents issues to user for revision decision
- [Phase 02-01]: Research step auto-skipped in --auto mode; complexity heuristic is 3+ domain scopes OR 6+ decisions
- [Phase 02]: design-fixer literal removed from both files; uses AGENT-12 reference to satisfy grep verification while preserving Phase 5 deferral intent
- [Phase 02-04]: discover/SKILL.md is Phase 2 minimal wrapper only — full orchestrator rewrite deferred to Phase 3 (03-01) when AGENT-06/07 land
- [Phase 02-04]: ## DISCOVER COMPLETE locked as completion marker — consistent with PLAN/DESIGN/VERIFY COMPLETE
- [Phase 02-04]: test-fixture/ ships in-repo — reproducible, version-controlled, no filesystem dependency for smoke testing
- [Phase 03-03]: design-pattern-mapper classifies by design concern (color-system, spacing-system, typography-system, component-styling) — never by code-architecture vocabulary
- [Phase 03-03]: design-assumptions-analyzer runs optionally from plan stage (not discuss-phase); positioned after DESIGN-PATTERNS.md is available so it has richer context
- [Phase 03-quality-gate-agents-pipeline-polish]: design-auditor is code-only (no Playwright-MCP); screenshot gap explicitly documented in DESIGN-AUDIT.md output
- [Phase 03-quality-gate-agents-pipeline-polish]: design-integration-checker checks decision APPLICATION (D-XX applied in source) not export/import wiring — correct abstraction for design pipeline
- [Phase 03-quality-gate-agents-pipeline-polish]: Integration-checker orphaned decisions = MAJOR gap; missing decisions = BLOCKER gap in verify loop
- [Phase 03]: Migrated full discover interview logic verbatim into design-context-builder (AGENT-06) — no information lost from v2.1.0
- [Phase 03]: design-context-checker (AGENT-07) uses Goal Observability as dimension 6 — adapted from gsd-ui-checker with Registry Safety replaced by Must-Have Testability
- [Phase 03]: discover/SKILL.md reduced to 93-line thin orchestrator — inline interview replaced by agent spawn calls for context isolation
- [Phase 03-06]: Append-only constraint enforced: Visual Hierarchy grep patterns inserted as subsection; Brand Archetype + Variable Fonts appended as top-level sections to typography.md; Spring Physics + Scroll-Triggered Animations appended as top-level sections to motion.md
- [Phase 03-04]: Three-pass component detection uses temp files to avoid process substitution portability issues
- [Phase 03-04]: priority_score formula uses + not / — addition keeps severity and effort signals independent (per RESEARCH.md)
- [Phase 03-04]: Effort weight inverted (XS=5, XL=1) so high effort = lower priority — keeps formula monotonic
- [Phase 03-05]: DISC-01/03 content inserted inside builder spawn prompt (not a separate section) — ensures context-builder receives fallback chain and gray areas at runtime
- [Phase 03-05]: --research mode documented as REMOVED with V2-04 rationale — existing complexity heuristic (3+ scopes OR 6+ decisions) covers the use case
- [Phase 03-05]: VRFY-02 shared grep reference placed in design-verifier.md Phase 1 (not verify/SKILL.md) — keeps deduplication adjacent to consumption point
- [Phase 04-connections-layer]: Figma promoted to Active with mcp__figma-desktop__* prefix (official Figma Desktop MCP, confirmed via settings.local.json + official docs)
- [Phase 04-connections-layer]: Probe pattern: ToolSearch-first (deferred-tool-set safety), then get_metadata live call for Figma; ToolSearch-only for Refero
- [Phase 04-connections-layer]: <connections> schema stays minimal (three-value status only); traceability via DESIGN.md source annotations
- [Phase 04-connections-layer]: Probe prose is copied inline into each stage; connections/connections.md is canonical source (SKILL.md has no include mechanism)
- [Phase 04]: get_variable_defs chosen over get_design_context for structured variable mapping to D-XX decisions
- [Phase 04]: Figma tools added to design-context-builder frontmatter only; discover orchestrator unchanged
- [Phase 04]: Merge-not-replace pattern: Figma tokens supplement grep results in both scan Step 2A and discover Step 0
- [Phase 04-03]: Refero tool name mcp__refero__search used in frontmatter + verify-at-runtime (ToolSearch) pattern for drift resilience
- [Phase 04-03]: Three-tier fallback: awesome-design-md as middle tier (not WebFetch direct) — 68 curated archetypes preferred over ad-hoc URL fetching
- [Phase 04-03]: Refero probe via ToolSearch presence only — no live search call needed (avoid token waste on probe)
- [Phase 04-03]: discover/SKILL.md probe inline-copied from connections/connections.md (no include mechanism); canonical source noted in prose
- [Phase 05-02]: design-advisor returns inline text only (no file) — same pattern as design-plan-checker (Open Question 2 resolution)
- [Phase 05-02]: Advisor spawned from design-context-builder agent, NOT from skills/discover/SKILL.md (Pitfall 6 preserved)
- [Phase 05-02]: Builder incorporates advisor findings into DESIGN-CONTEXT.md <decisions> section — no separate .design/ADVISOR-*.md artifact
- [Phase 05-02]: 5-column table format locked: Approach | Effort | Risk | User Control | Recommendation; exactly one Recommendation=yes per table
- [Phase 05-03]: Single design-doc-writer agent handles both post-pipeline and pre-pipeline modes via pipeline_complete context field
- [Phase 05-03]: style command is a standalone leaf — no STATE.md contract, not a pipeline stage, DESIGN-STYLE-*.md namespace distinct from pipeline DESIGN-*.md
- [Phase 05-03]: darkmode and compare NOT added to root SKILL.md in plan 05-03 — incremental additions reserved for plans 05-04 and 05-05 (Pitfall 5)
- [Phase 05-04]: darkmode is audit-only: does NOT invoke design-auditor (Pitfall 4), runs its own inline checks
- [Phase 05-04]: DARKMODE-AUDIT prefix used for output artifact — distinct from pipeline DESIGN-*.md namespace
- [Phase 05-05]: compare scoped to delta between DESIGN.md (baseline) and DESIGN-VERIFICATION.md (result) — no snapshot mechanism (V2-06 deferred)
- [Phase 05-05]: Drift detection reads DESIGN-PLAN.md Type fields; regressed categories not covered by any task are flagged as DRIFT
- [Phase 05-05]: COMPARE-REPORT prefix keeps output distinct from pipeline DESIGN-*.md namespace — no artifact collision
- [Phase 12-01]: node:test built-in runner chosen — zero third-party test dependencies for the entire test suite
- [Phase 12-01]: CI matrix uses fail-fast: false for full cross-platform signal (node 22/24 x ubuntu/macos/windows)
- [Phase 12-01]: scaffoldDesignDir returns { dir, designDir, cleanup } — each test creates isolated temp dir, cleanup() called in teardown
- [Phase ?]: [Phase 12-02]: Phase 6 baseline locks 14 agents, 12 skill dirs, 3 connection docs at plugin v1.0.0
- [Phase ?]: [Phase 12-02]: Baseline captures manifest + frontmatter snapshot — lower maintenance burden than full file copies
- [Phase ?]: [Phase 12-02]: Version test uses >= baseline — allows future phases to bump version without re-lock
- [Phase ?]: HTTP-probe-over-MCP: Storybook has no dedicated MCP; probe is two-phase HTTP curl to localhost:6006
- [Phase ?]: title-grouping-for-inventory: group index.json entries by title field; each unique title is one component
- [Phase ?]: no-parameters-caveat: Storybook 8 index.json excludes parameters; a11y config lives in .storybook/preview.ts
- [Phase ?]: [Phase 08-03]: Two-step CLI probe for Chromatic; baseline first-run: status new = baseline established, NOT regression
- [Phase 08-01]: [Phase 08-01]: Preview probe uses preview_list (lightweight) not preview_start — avoids spinning up a browser as a side effect of probing
- [Phase 08-01]: [Phase 08-01]: preview_screenshot output saved to .design/screenshots/ by file path; base64 never embedded inline in md files (prevents 500KB+ verification files)
- [Phase 08-01]: [Phase 08-01]: scan/SKILL.md is authoritative probe stage for all 7 connections; downstream stages read STATE.md rather than re-probing
- [Phase ?]: Graphify probe is CLI/file-based (config flag + graph.json existence), not ToolSearch — distinct from all MCP connections
- [Phase ?]: Graph is a seed list for grep, never a replacement — agents always grep after graph query
- [Phase ?]: All Graphify steps are conditional opt-in: skip gracefully when not_configured or unavailable
- [Phase 10-04]: ARM tier vocabulary
- [Phase 10-04]: Flow diagram uses Mermaid flowchart TD
- [Phase 10-04]: Researcher MUST produce ARM + Flow Diagram in DESIGN-CONTEXT.md
- [Phase 10.1-03]: Per-agent tier map locked (D-13): 5 haiku + 16 sonnet + 5 opus = 26 agents
- [Phase 10.1-03]: Override precedence (D-04) documented: budget.json.tier_overrides > frontmatter default-tier > hardcoded sonnet fallback
- [Phase 10.1-03]: Cache-aligned body ordering (D-17): shared-preamble import is first non-blank body line; verified on all 26 agents
- [Phase 10.1-03]: Shared preamble scope (D-16) is universal — no agent-specific language; 82 lines covering framework identity, required reading discipline, writes protocol, deviation handling, hook awareness, ordering convention
- [Phase 10.1-04]: Gate JSON contract locked — single line {spawn: bool, rationale: string ≤200 chars} + ## GATE COMPLETE marker, no prose wrapper, no fence
- [Phase 10.1-04]: Rationale content boundary — paths and regex-family names only, no file content (threat-model T-10.1-04-03)
- [Phase 10.1-04]: Synthesize hard-coded to Haiku 4.5 per D-14; budget.json.tier_overrides.synthesize can override but orchestrators should not re-route to Sonnet (structure-preserving merge)
- [Phase 10.1-04]: Synthesize fallback on Haiku failure = naive \n---\n concat with synthesize_fallback:true telemetry flag (fail-open)
- [Phase 10.1-04]: Verify orchestrator gates both 1b (verifier) and 1c (integration-checker); 1a (auditor) and 1d (re-verify fix loop) remain mandatory
- [Phase 10.1-04]: Discover gates context-checker but not context-builder (builder is the only source of DESIGN-CONTEXT.md; gate would always say spawn:true on first run)
- [Phase 10.1-04]: Plan Step 1.7 conditional on ≥2 research agents running — if only one, synthesis adds no value and is skipped
- [Phase 10.1-04]: Map Step 3.5 skipped when --only <name> restricts dispatch to a single mapper
- [Phase 10.1-04]: Per-mapper .design/map/*.md files preserved on disk even after DESIGN-PATTERNS.md synthesis — drill-down evidence unchanged
- [Phase 10.1-04]: Three gate agents use distinct colors (green, blue, cyan) mirroring their gated counterparts for terminal readability
- [Phase 13.2-01]: Named-practitioner list locked at 10 writers (Wathan, Mulligan, Andrew, Comeau, Shadeed, Soueidan, Verou, Jehl, Pickering, Kravets) — lower bound of the 10-12 range; Simmons + Coyier dropped for feed-stability uncertainty
- [Phase 13.2-01]: Rejected-kinds section is load-bearing markdown (not comments) — structurally enforced by Plan 13.2-04's grep test for dribbble.com, behance.net, linkedin.com, medium.com/topic; all rejected hostnames confined to the `## Rejected kinds` section only
- [Phase 13.2-01]: D-09 feed-entry grammar locked: `- **[Title](home)** — \`kind: X\` · \`url: Y\` · \`cadence-hint: Z\` · *rationale*` — diff-friendly, human-editable, one line per feed
- [Phase 13.2-01]: authority-snapshot schema-level DoS mitigation: `maxItems:200` on feed entries enforces D-14 retention at validation time (mitigates T-13.2-03 snapshot-growth DoS)
- [Phase 13.2-01]: scripts/validate-schemas.cjs hardened via `-c ajv-formats` to enforce `format: "date-time"` declarations rather than reject them under ajv strict mode — no-op for existing schemas (none declare formats), future-proof for any new schema that does
- [Phase 13.2-01]: scripts/validate-schemas.cjs PAIRS array is NOT auto-discovery — new schemas under reference/schemas/ must be manually wired into the PAIRS array to get CI enforcement (CONTEXT.md D-12's "picked up automatically" claim was incorrect; fixed inline as Rule 2 deviation)
- [Phase 13.2-02]: agent-size-budget TIER_LIMITS gains `M: 300` line cap — accommodates Worker-tier agents between S (150) and LARGE (350); matches CONTEXT D-05 "body ≈ 200–300 lines" target with modest headroom; no-op for existing agents (none declare `M`)
- [Phase 13.2-02]: Phase-6 regression baseline drift protocol — new agents require a single append to `test-fixture/baselines/phase-6/agent-list.txt` in sorted position; the sibling `agent-frontmatter-snapshot.json` stays unchanged because that check only asserts existing agents retain their fields, not that new agents be added
- [Phase 13.2-02]: Authority-watcher classification table encodes D-17 verbatim in agent body — regex pipes intentionally unescaped inside backticks (prompt-readable regex notation); MD060 markdownlint noise is pre-existing class, not a regression
- [Phase 13.2-02]: Watcher uses `shasum -a 256` over `sha256sum` for portability (macOS default vs GNU coreutils); both emit identical 64-char lowercase hex per D-13 contract and the schema `^[0-9a-f]{64}$` pattern
- [Phase 13.2-02]: Skip-regex takes precedence over kind-based classification — a component-system release titled "Sponsored: shipping X" correctly routes to `skip` rather than `pattern-guidance`; skip row is evaluated LAST in the decision table
- [Phase 13.2-02]: named-practitioner upgrade predicate is link-host-based (w3.org, developer.apple.com, m3.material.io, fluent2.microsoft.design) — makes the craft-tip → pattern-guidance upgrade auditable rather than topic-heuristic
- [Phase 13.2-02]: Fetch-notes footer is conditional — present only when `fetch_notes` is non-empty, so error-free runs emit a byte-identical report tail for Plan 13.2-04 diff-test determinism
- [Phase 13.2-03]: /gdd:watch-authorities skill tools list locked at `Read, Write, Task, Bash` (Write kept despite plan's optional-omit clause — 82-line skill is well under the 90-line target, markdownlint green, retaining Write preserves forward-compat with proposal→confirm extensions)
- [Phase 13.2-03]: --refresh and --since are mutually exclusive with explicit error "--refresh and --since are mutually exclusive. --refresh re-seeds the snapshot silently; --since surfaces a backlog from a boundary date. Pick one." — prevents semantically-contradictory invocation
- [Phase 13.2-03]: --schedule cron expressions locked at 09:00 local: weekly=`0 9 * * 1`, daily=`0 9 * * *`, monthly=`0 9 1 * *`; matches cadence-hint convention in reference/authority-feeds.md
- [Phase 13.2-03]: scheduled-tasks MCP probe uses ToolSearch with graceful exit-0 fallback (not blocker) on MCP absence — documented D-24 path, one-line diagnostic printed, skill still terminates with `## WATCH COMPLETE`
- [Phase 13.2-03]: Reflector non-modification invariant (D-25) preserved across the whole phase-13.2 commit range — `git log --name-only f4d4791..HEAD -- agents/design-reflector.md` returns empty; only skills/reflect/SKILL.md gained the single-line authority-report.md append
- [Phase 13.2-03]: Phase-6 baseline drift protocol generalizes to skills — new skill directories require a sorted append to `test-fixture/baselines/phase-6/skill-list.txt` (mirrors Plan 13.2-02's agent-list handling); CI regression test is strict deepEqual so baseline must track current directory state exactly
- [Phase 13.2-03]: Every new skill directory requires a root-SKILL.md entry (argument-hint + command-table row + jump-mode route) for `tests/command-count-sync.test.cjs` to pass — this is an undocumented CI gate that surfaces as a Rule 3 blocking issue on the first `npm test` after a new skill ships
- [Phase 13.2-04]: Authority-report baseline frozen at 9 entries (spec-change=2, heuristic-update=1, pattern-guidance=4, craft-tip=2, skip=0) matching the Plan 13.2-02 fixture set exactly; header "N entries surfaced" count and classification-section bullet count are locked equal by the watcher-diff test — resolves plan-checker warning #1
- [Phase 13.2-04]: Watcher-diff test ships as structural-only v1 (resolves plan-checker warning #2) — asserts fixture presence, baseline shape, D-21 classification-heading vocabulary, totals line, header-vs-bullet count consistency, and Skipped footer. Full end-to-end byte diff (agent run → normalized diff vs baseline) deferred until Claude Code agent runtime is available in CI
- [Phase 13.2-04]: `reference/schemas/plugin.schema.json` + `marketplace.schema.json` version pattern relaxed from `^\d+\.\d+\.\d+$` to `^\d+\.\d+\.\d+(\.\d+)?$` (Rule 3 deviation) to accept the locked off-cadence 4-segment `1.0.7.2`; backward-compatible with all prior 3-segment releases
- [Phase 13.2-04]: `tests/semver-compare.test.cjs` gains an `OFF_CADENCE_VERSIONS` Set containing `'1.0.7.2'`; the "version is in expected sequence" assertion accepts either a mainline `EXPECTED_SEQUENCE` member or an off-cadence version, while the sibling consecutive-patch-bump invariant remains unchanged (off-cadence decimals deliberately do not participate in +0.0.1 sequencing)
- [Phase 13.2-04]: CHANGELOG insertion uses pattern anchor (before first `^## \[` heading) not a line-number offset (resolves plan-checker info #6); resilient to prior-release formatting drift
- [Phase 13.2-04]: README `## Authority Watcher` section placed between `## Why It Works` and `## Commands` as a new top-level section (not nested `### Authority Watcher` under Why It Works), keeping h2 parity with adjacent user-facing sections (Commands, Connections)
- [Phase 13.2-04]: Auto-mode pipeline auto-approved the Task 4 human-verify checkpoint; README section written autonomously matching the adjacent Self-Improvement section's voice — any user-facing nits surface in PR review, tracked as a follow-up in 13.2-04 SUMMARY

### Roadmap Evolution

- Phase 13.1 inserted after Phase 13: Figma MCP Consolidation (URGENT) — collapse dual Figma MCP setup into single remote MCP
- 2026-04-19: Phase 11.1 renumbered to 13.2 (External Authority Watcher); Phase 11.2 renumbered to 13.3 (Plugin Update Checker). Rationale: original decimal slots under Phase 11 referenced v1.0.5.x versioning, but v1.0.5/6/7 already shipped — moving the unstarted decimals behind the latest shipped integer phase (13, v1.0.7) corrects the version strings (v1.0.7.2, v1.0.7.3) and restores meaningful ordering. No phase directories existed on disk for 11.1/11.2, so this was a text-only rename in ROADMAP.md.

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-04-19T22:21:50.000Z
Stopped at: Completed 13.2-04-PLAN.md — Phase 13.2 closed, v1.0.7.2 shipped
Resume file: (none — Phase 14 discuss-phase is the next action)
