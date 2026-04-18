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
