# Changelog

All notable changes to get-design-done are documented here. Versions follow [semantic versioning](https://semver.org/).

---

## [1.0.7] — 2026-04-18

### Added — Phase 13: CI/CD
- `.github/workflows/ci.yml` expanded from single-job test runner to five-job pipeline: `lint` → `validate` → `test` (matrix) → `security` + `size-budget`
- Markdown lint via `markdownlint-cli2@0.13.0` (pinned); link checker via `lycheeverse/lychee-action@v2` (blocking)
- JSON schemas at `reference/schemas/`: `plugin.schema.json`, `marketplace.schema.json`, `hooks.schema.json`, `config.schema.json`, `intel.schema.json`
- `scripts/validate-schemas.cjs` — ajv-cli wrapper with structural-parse fallback for all schemas
- `scripts/validate-frontmatter.cjs` — CLI-friendly agent-frontmatter validator reusing `tests/helpers.cjs`
- `scripts/detect-stale-refs.cjs` — fails on any `/design:*` legacy namespace or deprecated agent/stage names; authoritative list in `reference/DEPRECATIONS.md`
- `claude plugin validate .` in CI with schema-only fallback (per D-09)
- `ludeeus/action-shellcheck@master` at severity=error on `scripts/`
- Hardcoded-absolute-path grep across `scripts/`, `reference/`, `agents/`, `skills/` (flags `/Users/`, `/home/<user>/`, `C:\`)
- `gitleaks/gitleaks-action@v2` secrets scan with `.gitleaks.toml` allowlist
- `scripts/run-injection-scanner-ci.cjs` — CI-mode scanner over Phase 7 injection patterns against all shipped `reference/`, `skills/**/SKILL.md`, `agents/*.md`
- `tests/agent-size-budget.test.cjs` wired as its own blocking `size-budget` CI job with actionable override guidance
- `.github/pull_request_template.md` — phase / version-bump / CHANGELOG / baseline / tests checklist
- `.github/CODEOWNERS` — solo-maintainer default (`* @hegemonart`)
- `reference/BRANCH-PROTECTION.md` + `scripts/apply-branch-protection.sh` — two-phase rollout (advisory → enforcing)
- `.github/workflows/release.yml` — auto-tag + GitHub Release on `.claude-plugin/plugin.json` version change; softprops/action-gh-release@v2
- `scripts/extract-changelog-section.cjs` — parses CHANGELOG for release body
- `scripts/rollback-release.sh` — documented manual rollback (not CI-automated, per D-22)
- `scripts/release-smoke-test.cjs` — fresh-checkout deterministic smoke test against `test-fixture/src/`, diffs against `test-fixture/baselines/phase-13/`
- `CONTRIBUTING.md` — branch strategy, PR checklist, required checks list, version-bump workflow, baseline relock how-to
- README badges: CI build status, Node versions (22, 24), plugin version, license (MIT)
- `test-fixture/baselines/phase-13/` — regression baseline locked at v1.0.7

### Changed
- Plugin version: 1.0.5 → 1.0.7 (skipping 1.0.6 — Phase 12 did not ship a manifest bump in this worktree)
- `package.json` gains CI-focused scripts: `lint:md`, `lint:links`, `validate:schemas`, `validate:frontmatter`, `detect:stale-refs`, `scan:injection`, `test:size-budget`, `release:extract-changelog`
- `ci.yml` matrix preserved exactly: Node 22/24 × ubuntu/macos/windows

---

## [1.0.6] — 2026-04-18

### Added — Phase 12: Test Coverage
- Test runner wired (`node --test "tests/**/*.cjs"` via `npm test`) — zero third-party test dependencies
- `tests/helpers.cjs` — shared fixtures: `scaffoldDesignDir`, `readFrontmatter`, `countLines`, `mockMCP`
- GitHub Actions CI matrix: Node 22/24 × Linux/macOS/Windows, fail-fast disabled
- Regression baseline harness: `test-fixture/baselines/phase-<N>/` snapshots of agent/skill/connection manifests and agent frontmatter snapshots; drift detector per phase
- **Agent hygiene tests** — `tests/agent-frontmatter.test.cjs`, `tests/agent-size-budget.test.cjs`, `tests/agent-required-reading-consistency.test.cjs`, `tests/stale-colon-refs.test.cjs`
- **System contract tests** — `tests/config.test.cjs`, `tests/commands.test.cjs`, `tests/command-count-sync.test.cjs`, `tests/hook-validation.test.cjs`, `tests/atomic-write.test.cjs`, `tests/frontmatter.test.cjs`, `tests/model-profiles.test.cjs`, `tests/verify-health.test.cjs`, `tests/worktree-safety.test.cjs`, `tests/semver-compare.test.cjs`, `tests/schema-drift.test.cjs`
- **Pipeline + data tests** — `tests/pipeline-smoke.test.cjs`, `tests/mapper-schema.test.cjs`, `tests/parallelism-engine.test.cjs`, `tests/touches-analysis.test.cjs`, `tests/cycle-lifecycle.test.cjs`, `tests/intel-consistency.test.cjs`, `tests/regression-baseline-drift.test.cjs`
- **Feature correctness tests** — `tests/sketch-determinism.test.cjs`, `tests/connection-probe.test.cjs`, `tests/figma-writer-dry-run.test.cjs`, `tests/reflection-proposal.test.cjs`, `tests/deprecation-redirect.test.cjs`, `tests/nng-coverage.test.cjs`, `tests/read-injection-scanner.test.cjs`, `tests/optimization-layer.test.cjs`
- `reference/DEPRECATIONS.md` — registry of renamed/split/removed concepts (seeded by deprecation-redirect test)
- `test-fixture/mapper-outputs/*.json` — locked schema-shape fixtures for the 5 domain mappers
- Added `XXL` tier (700 lines) to `agent-size-budget.test.cjs` for legitimately long agents (`design-verifier`, `design-context-builder`)

### Changed
- `package.json` keywords add `"tested"`, `"ci"`; `.claude-plugin/plugin.json` + `marketplace.json` versions bumped to 1.0.6 with matching keyword + description additions
- `README.md` gains a `## Testing` section describing the suite + CI contract
- Root `SKILL.md` surfaces `analyze-dependencies`, `extract-learnings`, `skill-manifest` in the command table so `command-count-sync` passes
- `test-fixture/baselines/phase-6/` manifests re-locked to reflect post-Phase-11 inventory (documented in `phase-6/README.md`)
- Plugin version: 1.0.5 → 1.0.6

### Policy change
- **From v1.0.6 forward, every PR MUST pass `npm test` before merging to `main`.** See `CONTRIBUTING.md` for the testing contract.

## [1.0.5] — 2026-04-18

### Added — Phase 11: Self-Improvement
- `design-reflector` agent — post-cycle reflection from learnings + telemetry + agent-metrics
- `/gdd:reflect` command — on-demand reflection with `--dry-run` and `--cycle` flags
- `/gdd:apply-reflections` command — user-review + selective apply for all proposal types
- Frontmatter feedback loop — reflector proposes `typical-duration-seconds`, `default-tier`, `parallel-safe`, `reads-only` updates from measured data
- Budget-config feedback loop — reflector proposes `.design/budget.json` cap adjustments from telemetry
- Reference-update proposer — N≥3 pattern detection across learnings files → `reference/` additions
- Discussant question-quality logging — answer quality recorded to `.design/learnings/question-quality.jsonl`
- Discussant question-quality analysis — low-value questions flagged and pruning proposed after ≥3 cycles
- Global skills layer — `~/.claude/gdd/global-skills/` for cross-project conventions
- Global skills auto-loading in explore, plan, design stages
- Phase 11 regression baseline locked in `test-fixture/baselines/phase-11/`

### Changed
- `/gdd:audit` now spawns `design-reflector` at cycle end when learnings data exists
- `agents/design-discussant.md` logs answer quality after each Q&A exchange
- Plugin version: 1.0.4.1 → 1.0.5

## [1.0.4.1] — 2026-04-18 (off-cadence patch, retroactive)

**Phase 10.1: Optimization Layer + Cost Governance.** Off-cadence decimal phase — does NOT shift the v1.0.5 / v1.0.6 / v1.0.7 sequence of Phases 11/12/13. `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` remain at their post-Phase-11 versions; the v1.0.4.1 identity lives in this entry, the plugin description, and the baseline directory name.

### Added
- `gdd-router` skill — intent → `{path: fast|quick|full, model_tier_overrides, estimated_cost_usd, cache_hits}`. First step of every `/gdd:*` command.
- `gdd-cache-manager` skill + `/gdd:warm-cache` command — maintains `.design/cache-manifest.json`, pre-warms common agent prompts for Anthropic's 5-min prompt cache.
- `skills/synthesize/` streaming-synthesizer skill — Haiku-collapses N parallel-agent outputs for map / discover / plan orchestrators.
- `/gdd:optimize` advisory command — reads telemetry + metrics, emits `.design/OPTIMIZE-RECOMMENDATIONS.md`. No auto-apply.
- `hooks/budget-enforcer.js` — PreToolUse hook on `Agent` spawns. Hard-blocks on cap breach, auto-downgrades at 80% soft-threshold, short-circuits on cache hit. Writes telemetry on every decision.
- `.design/budget.json` config — `per_task_cap_usd`, `per_phase_cap_usd`, `tier_overrides`, `auto_downgrade_on_cap`, `cache_ttl_seconds`, `enforcement_mode`.
- `.design/cache-manifest.json` — SHA-256-keyed answer store with TTL.
- `.design/telemetry/costs.jsonl` — append-only ledger per spawn decision: `{ts, agent, tier, tokens_in, tokens_out, cache_hit, est_cost_usd, cycle, phase}`.
- `.design/agent-metrics.json` — incremental per-agent aggregator (total_spawns, total_cost_usd, cache_hit_rate, etc). Consumed by Phase 11 reflector.
- `reference/model-prices.md` — static Anthropic pricing table + `size_budget` → token-range mapping.
- `reference/model-tiers.md` — tier-selection guide, per-agent tier map, override precedence rules.
- `reference/shared-preamble.md` — extracted common agent framework preamble. Every agent imports it first.
- Three lazy gate agents: `design-verifier-gate`, `design-integration-checker-gate`, `design-context-checker-gate`. Cheap Haiku heuristic decides whether to spawn the full expensive checker.
- `scripts/aggregate-agent-metrics.js` — incremental telemetry aggregator invoked by the hook.
- Regression baseline at `test-fixture/baselines/phase-10.1/` — methodology README + `pre-baseline-cost-report.md` + `cost-report.md`.

### Changed
- All 26 agents in `agents/` now carry `default-tier: haiku|sonnet|opus` + `tier-rationale` frontmatter.
- All 26 agents now open with `@reference/shared-preamble.md` import (cache-aligned ordering per agents/README.md convention).
- `scripts/bootstrap.sh` writes `.design/budget.json` defaults on first run if missing.
- `hooks/hooks.json` adds `PreToolUse` matcher `Agent` → `hooks/budget-enforcer.js`.
- `skills/map/`, `skills/discover/`, `skills/plan/` — parallel-agent outputs now funnel through `skills/synthesize/` before main-context merge.
- `skills/verify/` — spawns `design-*-gate` agents before their full checker counterparts; skips the full spawn when the gate returns `spawn: false`.
- `agents/README.md` — documents the `default-tier` + `tier-rationale` frontmatter fields and the cache-aligned agent-prompt ordering convention.
- `reference/config-schema.md` — new sections for `.design/budget.json`, `.design/cache-manifest.json`, `.design/telemetry/costs.jsonl`, `.design/agent-metrics.json`.

### Performance
- Target: 50–70% per-task token-cost reduction vs the pre-10.1 baseline on `test-fixture/`.
- Evidence: `test-fixture/baselines/phase-10.1/pre-baseline-cost-report.md` (pre-layer run) + `cost-report.md` (post-layer run).
- Gap-count regression check: DESIGN-VERIFICATION.md gap count on the post-layer run must be ≤ pre-layer.

### Notes
- Requirements OPT-01 through OPT-10 + MAN-10a/b were formally added to `.planning/REQUIREMENTS.md` by plan 01.
- Phase 11's `design-reflector` (already shipped in v1.0.5) now has the `.design/telemetry/costs.jsonl` + `.design/agent-metrics.json` it was originally designed to read.

---

## [1.0.4] — 2026-04-18

### Added — Phase 10: Knowledge Layer

- **Intel store** (`.design/intel/`): queryable JSON slices indexing all files, exports, symbols, tokens, components, patterns, dependencies, decisions, debt, and a cross-reference graph
- `scripts/build-intel.cjs` — full initial index builder with mtime + git-hash incremental updates
- `agents/gdd-intel-updater` — incremental intel store updater agent
- `/gdd:analyze-dependencies` — token fan-out, component call-graph, decision traceability, circular dependency detection (all O(1) from intel store)
- `/gdd:skill-manifest` — browse all skills and agents from intel store; fallback to directory scan
- `/gdd:extract-learnings` — extract project-specific patterns from `.design/` artifacts; propose reference/ additions with user review flow
- `agents/gdd-learnings-extractor` — structured learning entry extractor; writes `.design/learnings/LEARNINGS.md`
- `agents/gdd-graphify-sync` — feeds Graphify knowledge graph from intel store `graph.json`
- `hooks/context-exhaustion.js` — PostToolUse hook: auto-records `<paused>` STATE.md block at 85% context
- `reference/intel-schema.md` — authoritative schema reference for all ten intel slices
- `design-phase-researcher` — now produces `## Architectural Responsibility Map` and `## Flow Diagram` (Mermaid) in every DESIGN-CONTEXT.md
- Five core agents (design-context-builder, design-executor, design-verifier, design-phase-researcher, design-planner) now include conditional `@.design/intel/` required-reading blocks

### Changed

- Plugin version: 1.0.3 → 1.0.4
- `hooks/hooks.json`: added context-exhaustion PostToolUse entry (fires on all tools)

---

## [1.0.3] — 2026-04-18

### Added — Phase 9: Claude Design Integration + Pinterest Connection
- Claude Design handoff bundle adapter: HTML export → D-XX decisions in STATE.md (`connections/claude-design.md`)
- `/gdd:handoff <path>` standalone command — skips Scan→Discover→Plan, routes direct to verify with Handoff Faithfulness scoring
- Handoff Faithfulness Phase in design-verifier: color, typography, spacing, component structure scoring with PASS/WARN/FAIL thresholds
- `--post-handoff` flag for `verify` stage — relaxes DESIGN-PLAN.md prerequisite, activates HF section
- `--from-handoff` mode for design-discussant — confirms tentative D-XX decisions, fills gaps only
- Handoff mode for design-research-synthesizer — parses bundle HTML, writes `<handoff_context>` to DESIGN-CONTEXT.md
- Pinterest MCP connection spec (`connections/pinterest.md`): ToolSearch-only probe, `mcp__mcp-pinterest__pinterest_search`, fallback chain Pinterest → Refero → awesome-design-md
- Pinterest as visual reference source in design-research-synthesizer (up to 2–3 queries per synthesis)
- Pinterest probe (block C) in `discover` stage
- `implementation-status` mode for design-figma-writer — annotates Figma frames with build status + registers Code Connect mappings from Handoff Faithfulness results
- `pinterest:` and `claude_design:` fields in STATE-TEMPLATE.md `<connections>` block
- `handoff_source`, `handoff_path`, `skipped_stages` fields in STATE-TEMPLATE.md `<position>` block

### Changed
- Plugin version: 1.0.2 → 1.0.3
- connections/connections.md: added Pinterest and Claude Design rows to Active Connections table and Capability Matrix
- README: updated agent count (14 → 22), added handoff command, Pinterest and Claude Design connection docs

---

## [1.0.2] — Phase 8: Visual + Design-Side Connections + Knowledge Graph

### Added

- **Preview (Playwright) connection** — `connections/preview.md`; live page screenshots for `? VISUAL` verification gaps via `mcp__Claude_Preview__*` tools
- **Storybook connection** — `connections/storybook.md`; HTTP probe for component inventory, a11y per story, `.stories.tsx` stub generation during design stage
- **Chromatic connection** — `connections/chromatic.md`; CLI-based visual regression delta narration and change-risk scoping using `--trace-changed=expanded`
- **Figma Writer agent** — `agents/design-figma-writer.md`; write design decisions back to Figma (annotate, tokenize, Code Connect mappings) via remote MCP `use_figma`; proposal→confirm UX with `--dry-run` and `--confirm-shared` guards
- **Graphify knowledge graph connection** — `connections/graphify.md`; queryable component↔token↔decision graph via `gsd-tools graphify`
- **`/gdd:figma-write` command** — `skills/figma-write/SKILL.md`; standalone Figma write command
- **`/gdd:graphify` command** — `skills/graphify/SKILL.md`; build/query/status/diff subcommands
- **Connections capability matrix expanded** — `connections/connections.md` updated to 7 active connections
- **Agent pre-search consultation** — `design-integration-checker` and `design-planner` consult the knowledge graph before grep searches when Graphify is available

### Changed

- `connections/connections.md` — Active Connections table expanded from 2 to 7; Capability Matrix updated; placeholder rows removed
- `agents/design-verifier.md` — Phase 4B visual evidence block added; Chromatic delta narration block added
- `agents/design-planner.md` — Chromatic change-risk scoping block added; Graphify component-count annotation block added
- `agents/design-context-builder.md` — Storybook component inventory block added
- `SKILL.md` — argument-hint and Command Reference updated with `figma-write` and `graphify`
- Root `SKILL.md` — `figma-write` and `graphify` entries added

---

## [1.0.1] — 2026-04-18

### Added — Phase 7: GSD Parity + Exploration
- Reshaped pipeline to 5-stage canonical shape (brief → explore → plan → design → verify)
- `/gdd:` namespace for all commands
- design-discussant agent + `/gdd:discuss` + `/gdd:list-assumptions`
- 5 specialist mapper agents (token, component-taxonomy, visual-hierarchy, a11y, motion)
- Wave-native parallelism decision engine
- Sketch (multi-variant HTML) and Spike (feasibility) explorations — `/gdd:sketch`, `/gdd:sketch-wrap-up`, `/gdd:spike`, `/gdd:spike-wrap-up`
- Project-local skills layer (`./.claude/skills/design-*-conventions.md`) auto-loaded by explore/plan/design
- Lifecycle commands: `new-project`, `new-cycle`, `complete-cycle`
- Ergonomics: `progress`, `health`, `todo`, `stats`, `next`, `help`
- Capture layer: `note`, `plant-seed`, `add-backlog`, `review-backlog`
- Safety: `pause`/`resume`, `undo`, `pr-branch`, `ship`
- Settings + maintenance (`update`, `reapply-patches`)
- Debug workflow + debugger philosophy
- Agent hygiene: frontmatter extensions, size budgets, injection scanner

### Changed
- Plugin version: 1.0.0 → 1.0.1

## [1.0.0] — 2026-04-17
- Initial release as `get-design-done`.
