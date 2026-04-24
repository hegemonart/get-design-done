# Changelog

All notable changes to get-design-done are documented here. Versions follow [semantic versioning](https://semver.org/).

---

## [1.15.0] — 2026-04-24

### Added — Design Knowledge Expansion: 10 foundational references + MIFB micro-polish + UUPM ingest

This release closes the plugin's shallow-coverage gaps across iconography, performance, brand voice, visual hierarchy, Gestalt principles, design-system governance, and adds two new UUPM-sourced knowledge bases (palette catalog + style vocabulary). It also lands the complete MIT-licensed MIFB (make-interfaces-feel-better) micro-polish track.

#### Impeccable removal

All `impeccable-*` skill coupling removed from the plugin. References in `reference/checklists.md` and `reference/review-format.md` replaced with native GDD equivalents (`DESIGN-CONTEXT.md`, `/gdd:fast`, `design:design-critique`). Salvage archive at `.planning/research/impeccable-salvage/` for Phase 16.

#### 10 new foundational reference files

- **`reference/iconography.md`** — Optical sizing, stroke-weight rules, metaphor taxonomy (functional/status/nav/brand), dark-mode variants, icon animation guidelines, semantic vs. decorative labeling, touch-target pairing, catalog of 9 public icon libraries (Lucide, Phosphor, Heroicons, Radix Icons, Tabler, Iconoir, Remix, SF Symbols, Feather). Metaphor taxonomy absorbs UUPM `icons.csv` (MIT).
- **`reference/performance.md`** — Core Web Vitals targets by project type (SaaS/marketing/e-commerce/docs/dashboards), LCP/INP/CLS/TTFB budgets, critical CSS, image budgets, animation frame budget (16.67ms), JS bundle budgets (<170KB gzipped), font budgets, Lighthouse CI hookup. React runtime section absorbs UUPM `react-performance.csv` (MIT).
- **`reference/design-systems-catalog.md`** — Quick-reference index of 18 major design systems: Material 3, Apple HIG, Radix+WAI-ARIA, shadcn/ui, Polaris, Carbon, Fluent 2, Primer, Atlassian, Ant Design, Mantine, Chakra, Base Web, Nord, Spectrum, Lightning, Evergreen, Gestalt (Pinterest).
- **`reference/brand-voice.md`** — 5 voice axes (Formal↔Casual, Serious↔Playful, Expert↔Approachable, Reverent↔Irreverent, Authoritative↔Collaborative), 12 Jungian archetypes + 6 design-register variants, tone-by-context table (8 contexts), 20+ industry-vertical context table. Industry-context absorbs UUPM `products.csv` + `ui-reasoning.csv` (MIT).
- **`reference/visual-hierarchy-layout.md`** — Z-order/depth cues, whitespace principles, asymmetry/rhythm, compositional grids (4/8/12/16-col), figure-ground, reading-order patterns (F/Z/inverted-triangle), progressive disclosure. Landing-archetypes subsection absorbs UUPM `landing.csv` (24 patterns, MIT).
- **`reference/gestalt.md`** — All 8 Gestalt principles (Proximity, Similarity, Continuity, Closure, Figure-Ground, Common Fate, Common Region, Prägnanz), each with definition, design application, scoring rubric, and CSS grep signatures. UUPM `ux-guidelines.csv` deduped across gestalt/heuristics/anti-patterns/priority-matrix (MIT).
- **`reference/design-system-guidance.md`** — Token versioning/deprecation, multi-brand token architecture (base/semantic/component layers), platform translation (Style Dictionary/Tokens Studio/Terrazzo), governance/RFC model, documentation standard, maturity rubric levels 0–5.
- **`reference/framer-motion-patterns.md`** — Spring vs. tween config, AnimatePresence (including `initial={false}` rule), layout animations, variants+staggering, gesture motion (`whileHover`, `whileTap` canonical 0.96), scroll-linked animations, `prefers-reduced-motion` compliance, 60fps GPU-safe property rules, MotionConfig, common pitfalls. UUPM `stacks/react.csv` framer rows absorbed (MIT).
- **`reference/palette-catalog.md`** — 40+ industry-vertical color palettes with 12 semantic token roles each, all WCAG 4.5:1 body / 3:1 UI verified. Data sibling at `reference/data/palettes.csv`. UUPM `colors.csv` absorbed (MIT).
- **`reference/style-vocabulary.md`** — 38+ named UI aesthetics (Glassmorphism, Brutalism, Neumorphism, Bento, Claymorphism, Aurora, AI-Native, Swiss Modernism 2.0, Vaporwave, Editorial Grid, HUD/Sci-Fi FUI, and more) with keywords, signature effects, best-for, avoid-for, era. Data sibling at `reference/data/styles.csv`. UUPM `styles.csv` absorbed (MIT).

#### MIFB micro-polish track

Source: [jakub.kr/writing/details-that-make-interfaces-feel-better](https://jakub.kr/writing/details-that-make-interfaces-feel-better) (MIT, Jakub Krehel)

- **`reference/surfaces.md`** (new) — Concentric radius formula (`outerRadius = innerRadius + padding`), optical alignment offsets, 3-layer shadow system (exact `rgba` values), image outline rule (pure black/white opacity only), hit-area `::after` pseudo-element pattern.
- **`reference/typography.md`** extended — `text-wrap: balance` (headings, ≤6 lines Chromium), `text-wrap: pretty` (body/captions), `-webkit-font-smoothing: antialiased` at `:root` only, `font-variant-numeric: tabular-nums` for dynamic numerals. UUPM `typography.csv` (57 pairings) absorbed into expanded pairings catalog (MIT). `reference/data/google-fonts.csv` registered as data sibling.
- **`reference/motion.md`** extended — 6 new subsections: interruptible animations (transitions vs. keyframes decision table), split-and-stagger enter/exit pattern, contextual icon cross-fade (canonical `scale 0.25→1`, `opacity 0→1`, `blur 4→0`, `bounce: 0`), scale-on-press canonical `0.96`, `<AnimatePresence initial={false}>` rule, `will-change` GPU-compositable property table.
- **`reference/anti-patterns.md`** — 4 new BAN entries: BAN-10 same-radius-nested, BAN-11 tinted image outline, BAN-12 `transition: all`, BAN-13 `will-change: all`. Each with grep signature and fix pointer.
- **`reference/checklists.md`** — New "Micro-polish check" gate (14 items across typography/surfaces/motion). `scale(0.97)` mention reconciled to canonical `0.96`.

#### ⚠️ BREAKING — 7th audit pillar: Micro-polish (weight redistribution)

A new **Micro-polish** pillar (5%) has been added to `reference/audit-scoring.md`. Weight was redistributed from the Anti-Pattern Compliance pillar (10% → 5%). **Total remains 100%, but per-pillar weights changed.** Cross-cycle score comparisons that mix v1.14.x and v1.15.0 audit reports should account for this weight shift.

#### Mapper extensions

All four mapper agents (`motion-mapper`, `token-mapper`, `visual-hierarchy-mapper`, `a11y-mapper`) gain "Micro-polish findings" output sections with grep-driven detection of BAN-10/11/12/13 and MIFB rule violations.

#### Agent integrations

- `design-context-builder` — reads `brand-voice.md` for archetype resolution, `palette-catalog.md` for palette proposal, `style-vocabulary.md` for style-direction picker.
- `design-auditor` — reads `iconography.md`, `performance.md`, `gestalt.md`, `framer-motion-patterns.md`, `surfaces.md`; includes 7th pillar micro_polish in output schema.
- `design-executor` — reads `brand-voice.md` (type:copy), `design-system-guidance.md` (type:tokens), `framer-motion-patterns.md` (type:motion), `performance.md` (type:layout).
- `design-pattern-mapper` — extended with `iconography-system` and `brand-voice` categories.
- `design-verifier` — micro_polish added as supplemental dimension.

#### Attribution

- Jakub Krehel (MIT) — micro-polish rules in typography.md, surfaces.md, motion.md, anti-patterns.md BAN-10/11/12/13, checklists.md Micro-polish gate.
- nextlevelbuilder/ui-ux-pro-max-skill v2.5.0 (MIT) — data snapshot ingested into iconography, performance, brand-voice, visual-hierarchy-layout, typography, framer-motion-patterns, palette-catalog, style-vocabulary, gestalt/heuristics/anti-patterns/priority-matrix dedup. **One-shot snapshot — no live re-sync contract.**

#### UUPM deferrals (explicitly routed, not discarded)

- `charts.csv` → Phase 19 `reference/data-visualization.md`
- `app-interface.csv` → Phase 17 component-corpus authoring
- `stacks/*.csv` (14 non-React) → future stack-playbook phase
## [1.14.8] — 2026-04-24

### Added — Phase 14.7 First-Run Proof Path

A new user can now install the plugin, run one command, and see GDD inspect their own UI code in under five minutes — with a concrete "first fix" pointer on the way out.

- **`/gdd:start` skill** (`skills/start/SKILL.md`) — leaf command with a locked 5-question interview (`reference/start-interview.md`) that collects pain hint, target-area confirmation, budget preference, framework/design-system confirmation, and visual-workflow selection. Writes only `.design/START-REPORT.md` and a temporary `.design/.start-context.json`; never mutates `STATE.md`, `config.json`, or source files.
- **`detect-ui-root` helper** (`scripts/lib/detect-ui-root.cjs`) — deterministic priority-ordered detector that identifies the user's UI surface across `packages/ui/src/`, `apps/*/components/`, Next.js app-router `app/components/`, Vite `src/components/`, CRA `src/components/`, root `components/`, and Svelte/Remix `src/routes/`. Backend-only repos get a clean diagnostic and exit with zero `.design/` footprint.
- **`start-findings-engine` helper** (`scripts/lib/start-findings-engine.cjs`) — read-only scanner with seven regex-based detectors (transition-all, will-change-all, tinted-image-outline, scale-on-press-drift, same-radius-nested, missing-reduced-motion-guard, non-root-font-smoothing), budget-bounded walk (fast / balanced / thorough), and a deterministic **safe-fix rubric** that picks exactly one `best_first_proof` per report.
- **`design-start-writer` agent** (`agents/design-start-writer.md`) — Haiku-tier writer with `allowed-write-paths: [.design/START-REPORT.md]`. Output contract locks seven H2 sections (`What I inspected`, `Three findings`, `Best first proof`, `Suggested next command`, `Visual Proof Readiness`, `Full pipeline path`, `Connections / writeback optional`) plus one trailing machine-readable JSON block that future `/gdd:fast` / `/gdd:do` invocations can consume.
- **First-run nudge** (`hooks/first-run-nudge.sh`) — SessionStart hook that surfaces one restrained line pointing at `/gdd:start` only when `.design/config.json` is absent, no dismissal flag exists, and no active pipeline stage is in progress. Per-install dismissal lives at `~/.claude/gdd-nudge-dismissed`. Silent-on-failure posture inherited from Phase 13.3.
- **Regression fixtures** at `test-fixture/baselines/phase-14.7/` (context-input.json, expected-report-shape.md) and `test-fixture/src/ui-detection/` covering Next.js, Vite, CRA, Remix, two monorepo shapes, backend-only, and empty-repo paths.
- **Plugin keywords** extended with `onboarding`, `first-run`, `demo`, `proof-path`.

### Non-breaking

Phase 15 target version unchanged (`v1.15.0`). `v1.14.6` remains reserved for Phase 14.6 (test-coverage-completion); this release does not block or reshape that phase.

### Scope notes

- The first-run report **recommends** commands; it never auto-applies fixes. `/gdd:fast` suggestions are printed as ready-to-run text.
- `/gdd:do` is intentionally **not** surfaced as a suggested command in v1.14.8 (revisit at Phase 15 per Phase 14.7 D-05).

---

## [1.14.7] — 2026-04-24

### Phase 14.6 — Test Coverage Completion (Phase 12 Wave C closeout)

Closes the Phase 12 test-coverage slate that had Waves A + B shipped but Wave C (plans `12-05` / `12-06` / `12-07`) never executed. The plans were migrated to **Phase 14.6** (`.planning/phases/14.6-test-coverage-completion/`) and the gdd-unique test files those plans targeted are now validated end-to-end alongside the pre-existing suite.

### Verified — gdd-unique test coverage (no code diff vs 1.14.6)

Inspection during Phase 14.6 execution confirmed that all 13 gdd-unique test files from the Wave-C migration are present in `tests/` and pass under `npm test`. No net-new test source ships with this release — Phase 14.6's substantive deliverable is the validation, documentation, and closeout bump.

| Area | Test files covered |
|---|---|
| Pipeline + data | `pipeline-smoke`, `mapper-schema`, `parallelism-engine`, `touches-analysis`, `cycle-lifecycle`, `intel-consistency` |
| Feature correctness | `sketch-determinism`, `connection-probe`, `figma-writer-dry-run`, `reflection-proposal`, `deprecation-redirect`, `nng-coverage`, `read-injection-scanner` |

Full suite: **343 tests, 342 pass, 1 skipped, 0 fail**.

### Changed

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (outer + `plugins[0]`), `package.json` — version `1.14.6` → `1.14.7`.
- `tests/semver-compare.test.cjs` — `1.14.7` registered in `OFF_CADENCE_VERSIONS`.

### Notes

- Phase 12 ROADMAP entry remains **Complete** (scope-reduced); Phase 14.6 is now marked **Complete** with the Wave-C + closeout scope that was split out on 2026-04-24.
- Phase 14.7 (First-Run Proof Path) retains its reserved release slot and will ship as a subsequent PATCH bump (the original `v1.14.7` reservation shifts forward to the next available patch when Phase 14.7 ships).

---

## [1.14.6] — 2026-04-24

### Phase 14.5 — Safety + Recall Floor

Closes two unrelated risks before the Phase 15–19 reference-library expansion and the Phase 20+ autonomy ramp: (a) agents had no typed reference index and no cache-stable L0 preamble; (b) no defense-in-depth around prompt-injected bash, protected-paths violations, runaway blast radius, or the Figma plugin-sandbox hill-climb failure mode. Ships the minimum-viable version of both tracks as one cohesive release.

### Added

**Safety hooks**
- `hooks/gdd-bash-guard.js` — PreToolUse:Bash guard. 45 dangerous-pattern regexes across 10 families (filesystem destruction, permission escalation, pipe-to-shell, git destruction, system mutation, process nuking, credential exfil, shell obfuscation, path traversal, npm/docker/firewall abuse). `scripts/lib/dangerous-patterns.cjs` normalizes Unicode NFKC + strips ANSI escapes + strips zero-width / bidi overrides before matching so obfuscated attacks (`rm\u200B -rf /`, bidi overrides, hex-encoded `\x72\x6d\x20\x2d\x72\x66`) fail closed.
- `hooks/gdd-protected-paths.js` + `reference/protected-paths.default.json` — PreToolUse:Edit|Write|Bash guard blocking mutation of `reference/**`, `skills/**`, `commands/**`, `hooks/**`, `.design/archive/**`, `.design/config.json`, `.design/telemetry/**`, `.git/**`, both plugin manifests. User additions in `.design/config.json.protected_paths` MERGE into the default list — users cannot reduce the default-protected set. `scripts/lib/glob-match.cjs` ships a dependency-free `**` glob matcher.
- `scripts/lib/blast-radius.cjs` — `estimate({touchedPaths, diffStats})` + `estimateMCPCalls({toolCalls})` preflight called by `design-executor` before the first Edit/Write of each task. Defaults: `max_files_per_task: 10`, `max_lines_per_task: 400`, `max_mcp_calls_per_task: 30`. Zero-value limits disable that ceiling. `design-executor` gains a new `## Preflight — Blast-Radius Check` section.

**Injection-scanner extension**
- `scripts/injection-patterns.cjs` extended from 7 to 22 patterns: classic prompt-injection verbs (incl. `forget previous`), **invisible-Unicode** (zero-width, BOM, bidi overrides), **HTML-comment instruction hijacks** (`<!-- system: …`, hidden divs/spans, zero-font-size tricks), **secret-exfil triggers** (`curl $OPENAI_API_KEY`, `cat .env`, `tar ~ | nc`, `process.env._KEY fetch`, SSH private-key reads). Single source of truth consumed by `hooks/gdd-read-injection-scanner.js`.

**Decision-injector hook (first cross-cycle recall primitive)**
- `hooks/gdd-decision-injector.js` — PreToolUse:Read on any `.design/**.md | reference/**.md | .planning/**.md` ≥ 1500 bytes. Surfaces the top-15 matching D-XX decisions, L-NN learnings, and cycle-N summary excerpts that reference the opened file's basename or path. Grep backend (ripgrep when available, Node fs fallback); Phase 19.5 will swap in FTS5 transparently.

**Reference registry + L0/L2 cache split**
- `reference/registry.schema.json` + `reference/registry.json` — typed index of every `reference/*.md` and `.default.json` file (18 entry types: `preamble | meta-rules | heuristic | output-contract | defaults | schema | data | motion | surfaces | authority-feed | influences | easing | taxonomy | principles | emotional-design | experience | palette | style-vocabulary`). Round-trip enforced by `scripts/lib/reference-registry.cjs.validateRegistry()`.
- `scripts/build-intel.cjs` re-runs `validateRegistry()` on any `reference/**` change.
- `reference/meta-rules.md` (tier L0) — 5 framework-invariant subsections extracted verbatim from `reference/shared-preamble.md`. `shared-preamble.md` becomes an L0 aggregator (imports `meta-rules.md` first), shrunk from ~6.5KB to <4KB. Stabilizes the Anthropic 5-min prompt-cache prefix.
- `reference/cycle-handoff-preamble.md` — "reference, not current requests" framing prose imported by `/gdd:pause` and `/gdd:resume`.
- `reference/retrieval-contract.md` — 3-layer `search → metadata → full-doc` protocol with per-row token-cost labels. Imported by `/gdd:progress`, `/gdd:resume`, `/gdd:reflect`, `/gdd:pause`.

**Figma authoring-intent guard + MCP circuit-breaker**
- `reference/figma-sandbox.md` — 4 Figma plugin-sandbox pitfalls encoded as hard rules (`loadFontAsync` no-cache, `findOne` O(N), `appendChild` AutoLayout recomputation, per-call ~5–10s timeout).
- `reference/mcp-budget.default.json` + `reference/schemas/mcp-budget.schema.json` — defaults: `max_calls_per_task: 30`, `max_consecutive_timeouts: 3`, `reset_on_success: true`, tracked tools `mcp__*use_figma | use_paper | use_pencil`.
- `agents/design-figma-writer` Step 0.5 **Authoring-Intent Guard** — bilingual EN/RU pattern set classifies invocations as author-intent vs decision-intent. Author-intent STOPs with a redirect to `figma:figma-generate-design` and cites the 4 pitfalls. Decision-intent proceeds. Bumped `size_budget` LARGE → XL.
- `hooks/gdd-mcp-circuit-breaker.js` — PostToolUse on `mcp__*use_figma | use_paper | use_pencil`. Appends `{ts, tool, outcome, consecutive_timeouts, total_calls}` rows to `.design/telemetry/mcp-budget.jsonl`. Breaks with `{continue:false}` at threshold + appends a STATE.md blocker.
- README.md + `connections/figma.md` gain the authoring-redirect callout + 4-pitfalls summary.

**Tests** (8 new files, ~60 new assertions):
- `bash-guard`, `protected-paths`, `blast-radius`, `decision-injector`, `reference-registry`, `meta-rules-split`, `figma-authoring-guard`, `mcp-circuit-breaker` all added. `read-injection-scanner.test.cjs` extended with bidi-override + HTML-comment hijack + secret-exfil + benign-regression cases.

### Changed

- `agents/design-executor.md` — new Preflight Blast-Radius Check + MCP Budget sections.
- `agents/design-figma-writer.md` — Step 0.5 Authoring-Intent Guard; `size_budget: XL`.
- `reference/shared-preamble.md` — rewritten as L0 aggregator.
- `scripts/build-intel.cjs` — registry round-trip on `reference/**` changes.
- `skills/{progress,resume,reflect,pause}/SKILL.md` — import `reference/retrieval-contract.md` (+ `cycle-handoff-preamble.md` for pause + resume).
- `hooks/hooks.json` — registers bash-guard, protected-paths, decision-injector, MCP circuit-breaker.
- Plugin manifests — add `safety-hardening`, `protected-paths`, `decision-injector`, `reference-registry`, `mcp-circuit-breaker` keywords.
- `tests/semver-compare.test.cjs` — `1.14.6` added to `OFF_CADENCE_VERSIONS`.

### Security

- Bash guard normalizes Unicode (NFKC + strip zero-width + bidi) and ANSI escapes before pattern match — blocks bidi-override obfuscation, zero-width-injected verbs, and ANSI-colored reformulations.
- Read-injection scanner flags invisible-Unicode sequences, HTML-comment hijacks, and secret-exfil triggers (7 → 22 patterns).
- Protected-paths enforces a merge-only glob list — user configs cannot reduce the default-protected set.

---

## [1.14.5] — 2026-04-23

### Fixed — Preview MCP silently skipped in verify even when available ([#19](https://github.com/hegemonart/get-design-done/issues/19))

`design-verifier` was spawned with `tools: Read, Write, Bash, Grep, Glob` only. The verify skill's orchestrator-level probe correctly classified the session as `preview: available` and wrote it to `STATE.md`, but the subagent's tool allowlist blocked every `mcp__Claude_Preview__*` call, causing Phase 4B to silently skip screenshot capture and leave all `? VISUAL` heuristic flags unresolved.

**Fix:** Added six Preview MCP tools to `design-verifier`'s `tools:` frontmatter — `preview_list`, `preview_navigate`, `preview_screenshot`, `preview_eval`, `preview_snapshot`, `preview_inspect` — so Phase 4B runs in the same permission context as the probe.

**Probe hardening:** The availability probe in `connections/preview.md` and `skills/verify/SKILL.md` now distinguishes three failure modes instead of collapsing them to `not_configured`/`unavailable`:

| New status | Meaning |
|---|---|
| `not_loaded` | ToolSearch empty — MCP not registered in this session |
| `permission_denied` | ToolSearch found the tool but the live call was rejected by the tool permission layer |
| `unreachable` | Tool loaded but live call errored for a non-permission reason (no dev server, timeout) |

The Phase 4B gate in `design-verifier` skips on all non-`available` statuses and emits a targeted message on `permission_denied` to aid diagnosis.

`connections/preview.md` now documents the **execution-context requirement**: the probe and the `preview_*` calls must run in the same context; a parent-session probe does not transfer to a spawned subagent.

---

## [1.14.4] — 2026-04-20

### Fixed — Figma MCP install URL was stale

The docs everywhere referenced the legacy `https://mcp.figma.com/v1/sse` endpoint. Users following the current Claude Code Figma MCP flow hit "Failed to connect" because Figma has since moved the server to `https://mcp.figma.com/mcp` (Streamable HTTP). Every skill, agent, and reference doc that prints Figma install steps now uses the current URL, and the migration note tells existing users how to remove a stale registration.

### Changed — Variant-agnostic Figma MCP probe

- The `mcp__figma__` prefix is no longer hardcoded. The probe matches any server whose name fits `/figma/i` — remote `figma`, `Figma`, local `figma-desktop`, UUID-prefixed instances — via keyword `ToolSearch`, applies a tiebreaker (both-sets > reads-only > canonical `figma` > alphabetical), and writes the resolved `prefix=` and `writes=` capability flags to `.design/STATE.md <connections>`. Consumer skills and agents read the resolved prefix from `STATE.md` instead of hardcoding it.
- Added preferred install path: `claude plugin install figma@claude-plugins-official` (bundles the MCP + Figma's agent skills). Manual `claude mcp add` remains supported.
- Tool table extended with `generate_figma_design`, `search_design_system`, `create_new_file`, `whoami`, `generate_diagram`, `get_figjam`, `get_code_connect_suggestions`, `send_code_connect_mappings` — split by reads (remote + desktop) vs writes (remote-only).
- `design-figma-writer` now STOPs early with a clear install message when only a reads-only variant (e.g. `figma-desktop`) is detected.
- `tests/semver-compare.test.cjs` — registered `1.14.4` as a recognized off-cadence version.

Cherry-picked from `c11cd7b` on `claude/upbeat-fermi-199627` — the Figma MCP fix that was authored before v1.14.2 but never merged to main, so every install doc was printing the outdated URL until this release.

---

## [1.14.3] — 2026-04-20

### Added — `npx @hegemonart/get-design-done` installer

- **`scripts/install.cjs`** — new npm-bin entrypoint (the bin slot referenced from `package.json` since v1.0.7 but never shipped). Running `npx @hegemonart/get-design-done` now atomically merges an `extraKnownMarketplaces["get-design-done"]` entry (source: `github:hegemonart/get-design-done`) and an `enabledPlugins["get-design-done@get-design-done"] = true` flag into `$CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`). Flags: `--dry-run`, `--help`. Idempotent; preserves unrelated keys; rejects malformed settings JSON with a clear error.

### Fixed — Plugin manifest bugs blocking v1.14.2 install

- **`.claude-plugin/plugin.json`** — dropped `"./"` from the `skills` array. The Claude Code plugin loader rejects it as `Path escapes plugin directory: ./` even though the spec describes it as legal. Manifest now declares `"skills": ["./skills/"]` only; the plugin loads cleanly from the marketplace.
- **`.claude-plugin/plugin.json`** — removed the explicit `"hooks": "./hooks/hooks.json"` pointer. Claude Code auto-detects `hooks/hooks.json` at the standard location, so the manifest pointer triggered `Duplicate hooks file`. Hooks still register the same PreToolUse/SessionStart/PostToolUse commands — only the redundant pointer is gone.
- **`reference/schemas/plugin.schema.json`** — `hooks` is no longer a required field (still permitted for plugins that keep the file elsewhere).
- **`skills/explore/SKILL.md`** — design interview now runs inline inside `/gdd:explore` instead of being delegated to a `design-discussant` subagent via `Task()`. Subagent spawns in Claude Desktop collapse `AskUserQuestion` to plain markdown; inlining restores the native-picker widget so the interview renders as interactive UI instead of chat text. `/gdd:discuss` and the handoff confirmation flow still use the subagent — only the explore-stage interview moved inline.
- **`tests/semver-compare.test.cjs`** — registered `1.14.2` and `1.14.3` as recognized off-cadence versions.
- **`tests/install-script.test.cjs`** — new suite (7 tests) covering the installer: bin wiring, `--help`, fresh install, idempotency, key preservation, `--dry-run` no-write, malformed-JSON exit code.

---

## [1.14.2] — 2026-04-20

### Added — Multi-format Claude Design handoff ingestion

- **URL entry point**: detect `https://api.anthropic.com/v1/design/h/<hash>` in agent prompt (native "Send to local coding agent" flow); `WebFetch` with `Content-Type` routing — HTML parsed directly, ZIP downloaded and extracted
- **ZIP bundle**: extract to `.design/handoff/`, find primary HTML + readme, parse normally, clean up after
- **PDF format**: `pdftotext` text extraction; grep for token values; all decisions tagged `(tentative — text-only)` since no CSS is present
- **PPTX format**: slide XML text extraction (`ppt/slides/*.xml`); same tentative-only tagging as PDF
- Updated synthesizer parsing algorithm step 1 with format dispatch before parsing
- Updated probe pattern: URL detection takes priority over file path lookup
- New `handoff_source` values: `claude-design-url`, `claude-design-zip`, `claude-design-pdf`, `claude-design-pptx`

---

## [1.14.1] — 2026-04-19

### Fixed — Security hardening (full codebase review)

- **CR-01** `scripts/build-intel.cjs` — replaced `execSync` template literal with `spawnSync` argv array; eliminates command injection via crafted filenames in the project tree. Added 5 s timeout to all git calls.
- **CR-02** `hooks/update-check.sh` — validate `LATEST_TAG` against a semver pattern before writing to cache; strip double-quotes from `BODY_EXCERPT` to prevent injection via adversarial release body.
- **CR-03** `.github/workflows/ci.yml` — pin `ludeeus/action-shellcheck` from `@master` (mutable) to `@2.0.0` (supply-chain hardening).
- **WR-01** `scripts/injection-patterns.cjs` — new shared source of truth for prompt-injection patterns; both the runtime hook and CI scanner now require from it, eliminating silent pattern drift.
- **WR-02** `hooks/budget-enforcer.js` — phase spend now read from the lightweight `phase-totals.json` written by the aggregator instead of replaying the full `costs.jsonl` on every agent spawn (O(1) vs O(n)).
- **WR-04** `hooks/update-check.sh` — allowlist-gate `C_DELTA` after cache read (`major|minor|patch|off-cadence|none`) before it reaches any shell context.
- **WR-05** `scripts/tests/test-authority-watcher-diff.sh` — replace `find | wc -l` with null-delimited loop; handles filenames with newlines.
- **WR-06** `tests/regression-baseline.test.cjs` — replace `execSync` template literal with `spawnSync` in git helpers.
- **WR-07** `tests/optimization-layer.test.cjs` — fix budget schema test to match the actual `loadBudget()` format (`per_task_cap_usd`, `per_phase_cap_usd`, `enforcement_mode`, …); previous test validated a dead schema shape.
- **IN-02** `hooks/budget-enforcer.js` — detached aggregator child now inherits only `PATH`, not full `process.env`.

---

## [1.14.0] — 2026-04-19

### Added — Phase 14: AI-Native Design Tool Connections

- `connections/paper-design.md` — paper.design MCP integration (canvas read/write, budget tracking, 100 calls/week free tier)
- `connections/pencil-dev.md` — pencil.dev .pen file integration (git-tracked design specs, pre-merge spec-vs-impl diff)
- `connections/21st-dev.md` — 21st.dev Magic MCP (prior-art gate, component scaffolding, SVGL brand logo lookup)
- `connections/magic-patterns.md` — Magic Patterns component generator (Claude connector + API key fallback, DS-aware, preview_url)
- `agents/design-paper-writer.md` — annotate / tokenize / roundtrip modes for paper.design canvas; proposal→confirm, dry-run, budget-aware
- `agents/design-pencil-writer.md` — annotate / roundtrip modes for .pen files with atomic git commits
- `agents/design-component-generator.md` — shared component generator (21st.dev + Magic Patterns impl sections); proposal→confirm, DS-aware
- `reference/ai-native-tool-interface.md` — capability-based contract for canvas + component-generator sub-categories; extension guide for future tools
- Explore stage: 21st.dev prior-art gate — marketplace search before any greenfield component build; ≥80% fit → adopt recommendation
- Explore stage: design-system auto-detection (shadcn / tailwind / mantine / chakra) written to STATE.md for generator targeting
- Verify stage: paper.design component screenshots via `get_screenshot` for `? VISUAL` checks (Phase 4C)
- Verify stage: pencil.dev spec-vs-implementation diff — compares .pen design-token declarations against actual code values

### Changed

- `connections/connections.md` — added `canvas` and `generator` columns to capability matrix; 4 new rows; backlog of 8 candidate future tools
- `agents/design-context-builder.md` — Step 0A (paper.design canvas read), Step 0B (pencil.dev .pen discovery), Step 0C (DS detection)
- `agents/design-verifier.md` — Phase 4C (paper.design screenshots), pencil.dev spec-vs-impl diff block
- `agents/design-research-synthesizer.md` — .pen file merge into synthesis output
- `skills/explore/SKILL.md` — probes C/D/E/F (21st.dev, Magic Patterns, paper.design, pencil.dev) + Step 1.5 prior-art gate
- Version bump to 1.14.0 (milestone.phase.patch scheme: 1.MM.P)

---

## [1.13.3] — 2026-04-19

### Added — Phase 13.3: Plugin Update Checker

- `hooks/update-check.sh` — SessionStart Bash hook; 24h-cached unauthenticated `GET /repos/hegemonart/get-design-done/releases/latest`; classifies semver delta (major / minor / patch / off-cadence); respects `.design/STATE.md` stage guard (suppresses nudge during `plan`, `design`, `verify`); respects per-version dismissal from `.design/config.json`; silent-on-failure by policy (exit 0 on every error path); BASH_SOURCE guard makes the script source-safe for self-test.
- `hooks/hooks.json` — registers `update-check.sh` as a second SessionStart command alongside `bootstrap.sh` (run order: bootstrap → update-check).
- `agents/design-update-checker.md` — Haiku-tier enrichment agent (Phase 10.1 cost governance). Invoked only by `/gdd:check-update --prompt` to produce a 3–5-line "what this release changes for you" summary from the cached release body. Reads-only, inline-text-only output, ends with `## UPDATE-CHECKER COMPLETE`.
- `skills/check-update/SKILL.md` — `/gdd:check-update` manual slash command. Flags: `--refresh` (bypass 24h TTL, re-fetch now), `--dismiss` (write `update_dismissed: "<tag>"` atomically to `.design/config.json` via env-prefix python3 heredoc, preserves all pre-existing keys), `--prompt` (spawn the enrichment agent). Default (no flag) prints cached state.
- `.design/update-cache.json` — per-user-project runtime cache (written by the hook). Shape: `{checked_at, current_tag, latest_tag, delta, is_newer, changelog_excerpt}`; 500-char excerpt from release body.
- `.design/update-available.md` — per-user-project runtime rendered banner. Written only when all four gates pass (cache is_newer=true AND stage ∉ {plan,design,verify} AND not dismissed AND latest_tag parsed successfully). Consumed by safe-window skills via `[ -f .design/update-available.md ] && cat .design/update-available.md`.
- `reference/schemas/config.schema.json` — adds optional `update_dismissed: string` property.
- Safe-window surfaces: `/gdd:progress`, `/gdd:health`, `/gdd:help`, post-closeout of `/gdd:ship`, `/gdd:complete-cycle`, `/gdd:audit` — each appends the one-line banner-cat tail before its completion marker. Mid-pipeline skills (`brief`, `explore`, `plan`, `design`, `verify`) explicitly NOT modified.
- `skills/audit/SKILL.md` — `tools:` list extended with `Bash` to enable the banner-cat tail (previously: `Read, Write, Task, Glob`).
- Root `SKILL.md` — `check-update` registered in argument-hint alternation.
- `test-fixture/baselines/phase-13.3/` — regression baseline lock for v1.13.3.
- `test-fixture/baselines/current/agent-list.txt` — appended `design-update-checker.md` in sorted position.
- `test-fixture/baselines/current/skill-list.txt` — appended `check-update` in sorted position.

### Changed

- Plugin version: 1.0.7.2 → 1.13.3 (per the new milestone.phase.sub-phase versioning scheme — MAJOR=milestone, MINOR=phase, PATCH=sub-phase). Phase 13.3 lands as a valid semver; release workflow auto-tags and `npm publish` succeeds.

### Design principles (Phase 13.3)

- **Never auto-updates.** The checker only surfaces a nudge; `/gdd:update` remains the explicit user action.
- **Never interrupts critical work.** State-machine guard suppresses the nudge during mid-pipeline stages (`plan`, `design`, `verify`); banner renders only in the 6 documented safe windows.
- **Silent-on-failure.** Network timeout, malformed JSON, missing plugin.json, unwritable `.design/` — every path exits 0 without printing to stderr during normal SessionStart.
- **No telemetry.** Unauthenticated GitHub Releases fetch; no phone-home, no tracking, no tokens in code.

---

## [1.13.2] — 2026-04-19

### Added — Phase 13.2: External Authority Watcher

- `reference/authority-feeds.md` — curated whitelist of 26 design-authority feeds grouped by kind (5 spec sources, 8 component systems, 3 research institutions, 10 named practitioners, user-extensible Are.na channels) with an explicit `## Rejected kinds` assertion block covering Dribbble, Behance, LinkedIn, generic Medium topic feeds, and trending aggregators.
- `reference/schemas/authority-snapshot.schema.json` — Draft-07 JSON Schema validating `.design/authority-snapshot.json` shape (version const 1, feeds keyed by id, 64-hex sha256 hash pattern, `maxItems: 200` per-feed entry cap enforcing D-14 retention at validation time).
- `agents/design-authority-watcher.md` — Sonnet-tier, parallel-safe watcher agent. Fetches feeds via WebFetch, diffs against snapshot, classifies new entries into five buckets (`spec-change`, `heuristic-update`, `pattern-guidance`, `craft-tip`, `skip`) with a one-sentence rationale per entry. First run seeds the snapshot silently; `--since <date>` is the escape hatch for surfacing a backlog.
- `skills/watch-authorities/SKILL.md` — `/gdd:watch-authorities` command with `--refresh`, `--since <date>`, `--feed <name>`, `--schedule <weekly|daily|monthly>` flags. Mutual-exclusion rules between `--refresh` and `--since`; `--schedule` registers a cron via the `scheduled-tasks` MCP when connected (weekly=`0 9 * * 1`, daily=`0 9 * * *`, monthly=`0 9 1 * *`) with graceful exit-0 fallback on MCP absence.
- `scripts/tests/test-authority-rejected-kinds.sh` — CI test enforcing the anti-slop thesis structurally. Splits `reference/authority-feeds.md` at the `## Rejected kinds` heading and greps the active section for `dribbble.com` / `behance.net` / `linkedin.com` / `medium.com/topic` / trending-aggregator hostnames; exits non-zero on any match.
- `scripts/tests/test-authority-watcher-diff.sh` — structural-only v1 of the watcher-diff test. Asserts fixture presence, baseline existence, D-21 classification-heading vocabulary, and exact count consistency between the header's "N entries surfaced" figure and the number of bulleted entries across classification sections. Full end-to-end byte diff against a live watcher run is deferred until the Claude Code agent runtime is available in CI.
- `test-fixture/authority-feeds/` — four frozen mock feeds (WAI-ARIA APG Atom, Radix Primitives release Atom, NN/g articles RSS, Are.na channel JSON) with deterministic timestamps for byte-stable CI diff testing. Exercises all four non-practitioner source kinds against every branch of the D-17 classification decision table.
- `test-fixture/baselines/phase-13.2/authority-report.expected.md` — frozen regression baseline for the watcher-diff test (9 entries across 4 feeds: spec-change=2, heuristic-update=1, pattern-guidance=4, craft-tip=2, skip=0).

### Changed

- `skills/reflect/SKILL.md` step 3 "Build required-reading list" — appended `.design/authority-report.md`. Single-line addition; `agents/design-reflector.md` itself is byte-identical since phase start (D-25 reflector-non-modification invariant preserved).
- Root `SKILL.md` — `watch-authorities` registered in argument-hint alternation, the maintenance Command Reference table, and the Jump Mode routing block alongside `/gdd:reflect` and `/gdd:apply-reflections`.
- `scripts/validate-schemas.cjs` — wired `authority-snapshot` into the `PAIRS` array and invoked `ajv-cli` with `-c ajv-formats` so `format: "date-time"` declarations are enforced rather than rejected under ajv strict mode. No-op for existing schemas (none declared formats).
- `tests/agent-size-budget.test.cjs` — added `M: 300` tier to `TIER_LIMITS` for Worker-tier agents (between `S: 150` and `LARGE: 350`); accommodates CONTEXT D-05's "body ≈ 200–300 lines" target with modest headroom.
- `test-fixture/baselines/phase-6/agent-list.txt` — appended `design-authority-watcher.md` in sorted position.
- `test-fixture/baselines/phase-6/skill-list.txt` — appended `watch-authorities` in sorted position.
- Plugin version: 1.0.7 → 1.13.2 (decimal sub-phase = PATCH bump per new versioning scheme: MAJOR=milestone, MINOR=phase, PATCH=sub-phase). Does not shift the Phase 14 → v1.14.0 cadence.

---

## [1.13.1] — 2026-04-19

### Changed — Phase 13.1: Figma MCP Consolidation
- Collapsed the dual Figma MCP setup (local `figma-desktop` for reads + remote `figma` for writes) into the single remote `figma` MCP, which exposes full read parity (`get_metadata`, `get_design_context`, `get_variable_defs`, `get_screenshot`) alongside `use_figma` for writes.
- Rewrote `connections/figma.md` to cover both reads and writes; deleted `connections/figma-writer.md` (folded into the unified spec).
- Migrated every `mcp__figma-desktop__*` tool reference to `mcp__figma__*` across skills (`scan`, `discover`, `explore`, `design`), agents (`design-figma-writer`, `design-context-builder`, `design-discussant`, `token-mapper`), and `connections/connections.md` capability matrix + probe block.
- Collapsed STATE.md `<connections>` schema from `figma: … / figma_writer: …` to a single `figma:` key. The remote MCP is one server — one probe, one status.
- Updated capability matrix in `connections/connections.md`: a single `Figma` row now declares write-back under the `design` column (FWR-01..04).
- Regenerated `test-fixture/baselines/phase-6/connection-list.txt` to drop the deleted `figma-writer.md` entry.

### Migration
- Install the remote Figma MCP (one command; replaces both prior installs):
  ```
  claude mcp add figma --transport http https://mcp.figma.com/v1/sse
  ```
- Optionally remove the old desktop MCP after upgrading:
  ```
  claude mcp remove figma-desktop
  ```
- No command or flag renames. The `design-figma-writer` agent keeps its name and proposal→confirm UX unchanged.

### Version note
- Shipped as **v1.13.1** per the new versioning scheme (MAJOR=milestone, MINOR=phase, PATCH=sub-phase). Phase 13.1 is a PATCH bump from v1.13.0. Phase 14 ships as v1.14.0.

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

## [1.10.1] — 2026-04-18

**Phase 10.1: Optimization Layer + Cost Governance.** Decimal sub-phase = PATCH bump per versioning scheme (MAJOR=milestone, MINOR=phase, PATCH=sub-phase). v1.10.1 follows v1.10.0 (Phase 10) and precedes v1.11.0 (Phase 11).

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
