# Changelog

All notable changes to get-design-done are documented here. Versions follow [semantic versioning](https://semver.org/).

---

## [1.23.5] — 2026-04-25

Phase 23.5 No-Regret Adaptive Layer milestone — turns the passive Phase 22–23 observability + validation infrastructure into a closed self-tuning loop. Three tightly-scoped no-regret algorithms sharing one feature-flag ladder. Single-user viable via informed Beta-prior bootstrap (no shared telemetry required). Ships as a decimal patch on the v1.23 minor — does NOT shift Phase 24 → v1.24.0.

### Added

- **Bandit router** — `scripts/lib/bandit-router.cjs` implements contextual Thompson sampling over `(agent_type, touches_size_bin) → {haiku, sonnet, opus}`. Per-arm `Beta(α, β)` posterior at `.design/telemetry/posterior.json` (atomic .tmp + rename). Discounted Thompson via per-arm time-decay factor `ρ^days_since_last_use` applied at sample time (default ρ=0.988 → 60-day half-life). Informed bootstrap: each arm starts at `Beta(α, β)` with α weighted toward the historical tier success rate (haiku=0.6, sonnet=0.8, opus=0.85) and `α + β ≈ 10` so 5–10 local samples shift the posterior. Two-stage lexicographic reward: `if !solidify_pass: 0; elif user_undo_in_session: 0; else: 1 − λ · normalize(cost + ε · wall_time)`. API: `pull / update / reset / loadPosterior / savePosterior / computeReward`. Touches-size bins: `tiny <5`, `small 5–15`, `medium 16–50`, `large >50` globs. (Plan 23.5-01)

- **Hedge ensemble** — `scripts/lib/hedge-ensemble.cjs` implements parameter-free AdaNormalHedge weighted-majority over verifier + checker agents. Weights persist at `.design/telemetry/hedge-weights.json`. Update rule: `η_i = sqrt(ln(N) / max(1, cumLoss2_i))` per-agent learning rate; `w_i *= exp(-η_i * loss_i)`; renormalise. Vote semantics: weighted sum normalised by the SUM of voting agents' weights — agents in the pool that didn't vote this round don't dilute the verdict. API: `loss / vote / weights / loadWeights / saveWeights`. Default vote threshold 0.5. (Plan 23.5-02)

- **MMR re-rank** — `scripts/lib/mmr-rerank.cjs` implements Maximal Marginal Relevance over scored items. Solves the "all 5 surfaced learnings are about the same thing" failure mode in the Phase 14.5 decision-injector. Greedy criterion: `next = argmax_{i ∉ selected} λ * relevance(i) − (1 − λ) * max_sim(i, selected)`. Similarity = Jaccard on word n-grams (default n=2). λ default 0.7. No external deps, no embedding API. API: `rerank / similarity / tokenize / ngrams / jaccard`. (Plan 23.5-03)

- **Adaptive-mode feature flag ladder** — `scripts/lib/adaptive-mode.cjs` is the single source of truth for which Phase 23.5 components are active. Three modes:
  - `static` (DEFAULT) — Phase 10.1 behaviour. Static `tier_overrides` applies. No posterior writes / no hedge updates / no MMR.
  - `hedge` — Adds AdaNormalHedge consensus + MMR re-rank. Routing still static (bandit OFF). Safest intro level.
  - `full` — Adds bandit Thompson-sampling routing + reflector confidence-interval proposals. Both posterior + hedge persist.
  Read from `.design/budget.json.adaptive_mode` with safe fallback to `static` on missing/malformed/unknown values. API: `getMode / setMode / caps / isBanditEnabled / isHedgeEnabled / isMmrEnabled / isReflectorProposalsEnabled`. (Plan 23.5-04)

### Changed

- `tests/semver-compare.test.cjs` `OFF_CADENCE_VERSIONS` gains `1.23.5`.
- `test-fixture/baselines/phase-20/resilience-primitives.txt` regenerated alphabetically with all four new `.cjs` modules added.

### Tests

- `tests/bandit-router.test.cjs` — bin partitioning, prior elevation per tier, beta sampling, pull persistence, missing-input throws, update/reward/clamp, reset, decay-toward-prior, all reward branches, load+save, 60-round convergence smoke test (18 tests)
- `tests/hedge-ensemble.test.cjs` — init uniform, high-loss penalty, normalisation, simple vs weighted vote, boolean=numeric equivalence, custom threshold, empty votes, loss clamp, NaN throw, round-trip (14)
- `tests/mmr-rerank.test.cjs` — tokenize edges, ngram size+fallback, similarity properties, λ=1 pure relevance, λ=0 pure diversity, textOf/relevanceOf overrides, empty input, non-array throw, k>length truncation, defaults, jaccard guards, canonical "5 D-13 hits" scenario (18)
- `tests/adaptive-mode.test.cjs` — missing-file fallback, malformed-JSON fallback, unknown-mode quiet fallback, all 3 capability matrices, all 4 predicates, setMode preserves other fields, parent-dir creation, mode rejection, exports, absolute-path support (13)
- `tests/phase-23.5-baseline.test.cjs` — Phase 23.5 regression baseline (8)

Total: 71 new tests. All Phase 20/21/22/23 tests still green.

### Reflector integration

The Phase 22 code-level reflector reads `posterior.json` + hedge weights at run time (under `adaptive_mode: "full"`). When `stddev(Beta(α, β)) < 0.05` for a single-arm dominant tier, it proposes `tier_overrides` updates via `/gdd:apply-reflections`. Pure-read; never auto-writes. Same proposal pattern as Plan 23-06 touches pattern miner.

### Deferred (evidence-gated, per ROADMAP)

- Hierarchical shared prior (revisit after 20+ cycles of single-user convergence data)
- Dense-embedding retrieval (revisit if MMR-only miss-rate exceeds 15%)
- Offline policy evaluation harness (bootstraps from bandit's stochastic logs once accumulated)
- Auto changepoint detection (manual `/gdd:bandit-reset --reason "<msg>"` covers v1)

### Explicitly out of scope

- HDBSCAN auto-crystallization, BOCPD changepoint detection, Personalized PageRank, MinHash/LSH dedup, Borda/Kemeny rank aggregation, submodular greedy — each rejected with rationale in ROADMAP.md.

---

## [1.23.0] — 2026-04-25

Phase 23 GDD SDK Domain Primitives milestone — lands the highest-leverage code primitives from the ROADMAP "GDD SDK Domain Primitives" entry as typed Node modules with tests. 10 atomic plans (23-01 through 23-10), additive — every Phase 20/21/22 consumer keeps working unchanged. Distribution as separate `@hegemonart/gdd-sdk` npm package and screenshot-capture orchestration are explicitly deferred to follow-up phases.

### Added

- **JSON output contracts** — `reference/output-contracts/planner-decision.schema.json` + `verifier-decision.schema.json` (Draft-07). `scripts/lib/parse-contract.cjs` gains `parsePlannerDecision()` and `parseVerifierDecision()` riding the same extract→parse→validate pipeline as the existing `parseMotionMap`. Lets `/gdd:synthesize` consume planner output without regex-parsing markdown headings, and lets executor↔verifier ping-pong on a typed envelope. (Plan 23-01)

- **Solidify-with-rollback gate** — `scripts/lib/design-solidify.mjs` runs the typecheck/build/targeted-test triplet for a task and, on any failure, rolls the working tree back via `git stash` (configurable: `stash` | `hard` | `none`) and emits a `solidify.rollback` event onto the Phase 22 causal chain. Optional `emit()` callback for event-stream telemetry sink. Authored as `.mjs` to sidestep the Phase 22 Node 24 + Windows + .mjs↔.ts loader bug. (Plan 23-02)

- **Touches: analyzer + parallelism decision engine** — `scripts/lib/touches-analyzer/index.cjs` parses `Touches:` lines from task markdown into glob lists and produces a pairwise verdict (`parallel` | `sequential`) for any two tasks. Encodes today's prompt-only heuristic into auditable code. Verdict rules (first match wins): empty → unknown-touches; literal equality → shared-glob; shared component dir → shared-component-dir; resolved-file overlap → shared-file; otherwise → disjoint. (Plan 23-03)

- **Audit aggregator** — `scripts/lib/audit-aggregator/index.cjs` takes `Array<Finding>` from N audit-agents, dedups by `{file, line, rule_id}`, scores via severity-weighted formula (P0:8/P1:4/P2:2/P3:1), and returns sorted top-N + tally summary. Default merge picks higher-confidence → higher-severity → lex-earliest agent → first-seen. Confidence outside `[0, 1]` clamped with one `process.emitWarning` per call. Cross-platform path normalization. (Plan 23-04)

- **Reference resolver** — `scripts/lib/reference-resolver.cjs` adds the resolution direction on top of the Phase 14.5 reference-registry. `resolve('forms')` / `resolve('type:forms')` → `{name, path, type, excerpt}` with a 200-char excerpt suitable for inlining into agent prompts. Lookup order: exact name → slug match → singularize fuzzy → type-only-when-unique. Ambiguous match throws `RangeError` with candidates. `resolveAll(keys, {ignoreMissing})` for bulk. `excerptOf(path, {maxChars})` strips frontmatter / fenced code / HTML comments / markdown headers. (Plan 23-05)

- **Touches pattern miner** — `scripts/lib/touches-pattern-miner.cjs` scans `.design/archive/cycle-*/tasks/*.md` after `/gdd:complete-cycle`, canonicalizes signatures (lowercase + backslash-normalize + cycle-slug strip + dedup + sort), and proposes crystallization candidates when a signature recurs in ≥3 tasks across ≥2 cycles. Writes `.design/learnings/touches-patterns.json` atomically (`.tmp` + rename). **NEVER auto-applies** — `/gdd:apply-reflections` is the materialization gate. (Plan 23-06)

- **Image diff + visual baseline manager** — `scripts/lib/visual-baseline/diff.cjs` compares two PNG buffers. With `pngjs` installed (probeOptional), decodes both and counts pixels whose R/G/B/A channels differ beyond the tolerance (default 4). Without `pngjs`, falls back to bytewise SHA-256 equality. `scripts/lib/visual-baseline/index.cjs` exposes `compareToBaseline(key, pngBuffer)` and `applyBaseline(key, pngBuffer)`; reads/writes `.design/baselines/<key>.png`; rejects path-traversal keys. `pngjs@7` declared as optional dep. Defers Playwright/Preview MCP screenshot capture orchestration to a later phase. (Plan 23-07)

- **Design-token reader (multi-source)** — `scripts/lib/design-tokens/index.cjs` facades over four pure-JS readers producing the uniform `{tokens, source, format, warnings}` shape:
  - `css-vars.cjs` — extracts `--token: value;` from CSS/SCSS, last-write-wins, strips block comments, warns on `$scss-vars`
  - `js-const.cjs` — spawn-node harness evaluates CJS/ESM exports, recognises `{tokens: …}` / default / direct bag, flattens nested with `.` separator
  - `tailwind.cjs` — same harness, walks `theme` + `theme.extend` per scale (extend overrides base)
  - `figma.cjs` — parses `{variableCollections}` shape OR already-flattened bag; emits `rgb(R, G, B)` for color values, per-mode tokens for multi-mode variables
  Auto-detection by extension + content sniff. (Plan 23-08)

- **Domain primitives bundle** — three checkers sharing a single hit shape (`{rule_id, severity P0-P3, summary, evidence?, line?, file}`):
  - `domain-primitives/nng.cjs` — runs grep-style heuristic rules loaded from `reference/heuristics.md` fenced yaml blocks; caller may inject `opts.rules` to bypass file-load
  - `domain-primitives/anti-patterns.cjs` — same yaml extractor against `reference/anti-patterns.md`
  - `domain-primitives/wcag.cjs` (no axe-core dep) — `contrastRatio()` (WCAG 1.4.3 luminance), `checkContrast({fg, bg, level: AA|AAA})`, `checkTapTarget({width, height, level})` (AA 24×24, AAA 44×44), `checkAriaLabels({content})` (interactive elements without text + aria-label)
  Both NNG + anti-pattern files allow no parseable yaml today (treated as empty registry); robust to gradual rule population. (Plan 23-09)

### Changed

- `tests/semver-compare.test.cjs` `OFF_CADENCE_VERSIONS` gains `1.23.0`.
- `test-fixture/baselines/phase-20/resilience-primitives.txt` gains `reference-resolver.cjs` (alphabetical between `reference-registry.cjs` and `relevance-counter.cjs`) and `touches-pattern-miner.cjs` (alphabetical at end).

### Tests

- `tests/output-contracts-23-01.test.cjs` — planner + verifier contracts (14 tests)
- `tests/design-solidify.test.cjs` — solidify gate, all rollback modes (6)
- `tests/touches-analyzer.test.cjs` — parser + verdict + matrix (17)
- `tests/audit-aggregator.test.cjs` — dedup + score + tallies (15)
- `tests/reference-resolver.test.cjs` — resolution rules + excerpts (12)
- `tests/touches-pattern-miner.test.cjs` — canonicalize + thresholds + atomic write (10)
- `tests/visual-baseline.test.cjs` — diff modes + baseline round-trip (14, pngjs-optional path skipped when absent)
- `tests/design-tokens.test.cjs` — 4 readers + facade auto-detect (15)
- `tests/domain-primitives.test.cjs` — NNG + anti-pattern + WCAG checkers (18)
- `tests/phase-23-baseline.test.cjs` — Phase 23 regression baseline (12)

Total: 133 new tests. All Phase 20/21/22 tests still green.

### Deferred

- **`@hegemonart/gdd-sdk` separate npm package** — out of scope; build/packaging project of its own.
- **Screenshot capture orchestration** (Playwright + Claude Preview MCP wrapper) — needs live MCP infra to validate.
- **Spec↔code↔visual triangulation verifier** — depends on Phase 16/17 component specs being fleshed out.
- **Knowledge-graph typed query layer** + cycle/workstream model SDK + pause/resume context serializer SDK + per-stage budget allocator SDK + git operations primitive + handoff bundle parser + intel store typed reader/writer — each is roadmap-text-sized and warrants its own phase scope.

---

## [1.22.0] — 2026-04-25

Phase 22 GDD SDK Observability milestone — the single-typed `BaseEvent` envelope from Phase 20 grows into a queryable, redacted, transport-able observability layer with tail/grep/WebSocket consumers and a causal event chain. 10 plans (22-01 through 22-10), additive — every Phase 20 + Phase 21 consumer keeps working unchanged.

### Added

- **Expanded event-type registry** — 17 new pre-registered subtypes alongside
  the 6 from Phase 20: `wave.started`, `wave.completed`, `blocker.added`,
  `decision.added`, `must_have.added`, `parallelism.verdict`, `cost.update`,
  `rate_limit`, `api.retry`, `compact.boundary`, `mcp.probe`,
  `reflection.proposed`, `connection.status_change`, `tool_call.started`,
  `tool_call.completed`, `agent.spawn`, `agent.outcome`. The envelope
  remains open (`type: string`); the `KnownEvent` union is an additive
  overlay for typed `switch` consumers. Runtime `KNOWN_EVENT_TYPES` list
  exported for the CLI's `list-types` subcommand. (Plan 22-01)

- **Secret scrubber** — `scripts/lib/redact.cjs` deep-walks every event
  payload and replaces secret-shaped strings with `[REDACTED:<type>]`
  placeholders. Patterns: `sk-ant-…` (anthropic), `sk_live_…` (stripe),
  `xox[baprs]-…` (slack), `ghp_…` (github_pat), `AKIA…` (aws), generic
  `sk-…`, `eyJ…` JWTs, and full `-----BEGIN/END-----` PEM blocks.
  Wired into `EventWriter.serialize()` so every event hitting disk and
  every bus subscriber sees the scrubbed form — single rule everywhere,
  no escape hatch. (Plan 22-02)

- **Per-tool-call trajectory stream** — `.design/telemetry/trajectories/<cycle>.jsonl`
  receives one line per agent tool-use:
  `{ts, agent, tool, args_hash, result_hash, latency_ms, status}`.
  Args + result are sha256-prefix-hashed (16 chars) — line size stays
  bounded; prompt content stays de-identified. Captured by the new
  PostToolUse:Agent hook `hooks/gdd-trajectory-capture.js`. (Plan 22-03)

- **Append-only event chain** — `.design/gep/events.jsonl` (gep =
  "GDD Event Provenance"). One line per causal hop: `{event_id,
  parent_event_id, ts, agent, decision_refs, outcome, rollback_reason?}`.
  `appendChainEvent()` auto-generates UUIDs; `walkParents()` traces a
  row up to its root for `/gdd:audit --retroactive`. Cycle-safe; skips
  invalid lines; lives separately from the firehose so audits don't
  scan unrelated rows. (Plan 22-04)

- **Typed event reader + aggregator** — `readEvents({path, type,
  predicate, since, until})` returns an async streaming iterator over
  `events.jsonl` (readline + createReadStream — no full-file load,
  GB-scale logs OK). `aggregate()` rolls events up by type, stage,
  cycle, agent + totals (count, error_count, truncated_count). Exposed
  from the public event-stream API. (Plan 22-05)

- **CLI transport** — `gdd-events` bin entry, subcommands:
  `tail [--follow]` (250ms-poll follow mode, no native inotify dep);
  `grep <terms…>` with hand-rolled filter language
  (`type=foo`, `payload.x.y=bar`, `!type=baz`, multiple = AND);
  `cat` pretty-print with timestamp+type prefix; `list-types` runtime
  registry dump; `serve` for the WebSocket transport. (Plan 22-06)

- **WebSocket transport** — `scripts/lib/transports/ws.cjs` exposes
  `startServer({port, token, tailFrom?, subscribe?})`. Loaded via
  `probeOptional('ws')` — clear install hint when absent. Auth:
  `Authorization: Bearer <token>` on the upgrade; mismatched →
  HTTP 401 close. Tail replay sends `tailFrom`'s contents to new
  clients before subscribing them to the live bus. Fire-and-forget
  delivery; closed sockets dropped silently. `ws@8` declared as
  optional dep. (Plan 22-07)

- **Connection probe primitive** — `scripts/lib/connection-probe/`
  exposes `probe({name, cmd, timeout, retries, fallback})` →
  `{status: 'ok'|'degraded'|'down', latency_ms, attempts,
  fallback_used, error?}`. Backoff between retries via
  `jittered-backoff.cjs`. State persisted at
  `.design/telemetry/connection-state.json` (atomic .tmp+rename).
  Status transitions emit `connection.status_change` events through a
  caller-supplied `emit` callback — transitions only, not every probe.
  Replaces ad-hoc bash probe snippets in `connections/`. (Plan 22-08)

- **Hook → event-stream wire-in** — new `hooks/_hook-emit.js` shared
  helper wraps `appendEvent()` in try/catch (hooks must NEVER throw on
  telemetry failure). Wired hooks emit `hook.fired` events on every
  decision: `gdd-bash-guard` (allow/block + severity + pattern),
  `gdd-protected-paths` (allow/block + matched glob),
  `gdd-decision-injector` (inject/no-hits + backend label).
  Trajectory-capture (Plan 22-03) already emits via its own path.
  Additive — zero behavior change to existing hook contracts. (Plan 22-09)

### Changed

- `EventWriter.serialize()` now runs `redact()` on the event before
  JSON-stringifying. Persisted form is the canonical scrubbed form.
  All 27 Phase 20 event-stream tests still pass. (Plan 22-02 wire-in)

- `hooks.json` registers a new `PostToolUse:Agent` matcher pointing at
  `gdd-trajectory-capture.js`. The existing `PreToolUse:Agent`
  budget-enforcer is unaffected. (Plan 22-03 registration)

### Tests

- `tests/event-types-registry.test.ts` — registry expansion (4 tests)
- `tests/redact.test.cjs` — secret scrubber (12 tests)
- `tests/event-stream-redact-integration.test.ts` — write-time wire-in (2 tests)
- `tests/trajectory-capture.test.cjs` — module + hook subprocess (7 tests)
- `tests/event-chain.test.cjs` — chain + walk + cycle defense (10 tests)
- `tests/event-reader.test.ts` — reader + aggregator (8 tests)
- `tests/cli-events.test.cjs` — CLI subcommands + filter language (10 tests)
- `tests/ws-transport.test.cjs` — WebSocket auth + replay + live (5 + 1 skip)
- `tests/connection-probe-primitive.test.cjs` — retry + fallback + emit (9 tests)
- `tests/hook-emit-wire.test.cjs` — bash-guard + protected-paths emission (4 tests)
- `tests/phase-22-baseline.test.cjs` — Phase 22 regression baseline (12 tests)

Total: 84 new tests. All Phase 20/21 tests still green.

### Deferred

- Grafana / Prometheus exporter (out of scope; code-primitive
  observability shipped first).
- Event-stream compaction / retention (`events.jsonl` grows unbounded;
  Phase 22.x if needed).
- Replay-on-subscribe semantics (bus stays live-only; transports that
  want replay read `events.jsonl` directly, then subscribe live).
- Wire-in for `gdd-mcp-circuit-breaker.js`, `budget-enforcer.ts`,
  `context-exhaustion.ts`, `gdd-read-injection-scanner.ts` — flow is
  more intricate; follow-up phase.

---

## [1.21.0] — 2026-04-24

Phase 21 GDD SDK Headless milestone — the plugin now runs unchanged on Claude Code, OpenAI Codex CLI, and Gemini CLI, and ships a full `gdd-sdk` CLI that executes the design pipeline without a harness. 12 plans (21-01 through 21-12), 50+ commits, 936 tests.

### Added

- **Headless SDK** — new `bin/gdd-sdk` CLI that runs the full design pipeline
  without Claude Code. Subcommands: `run`, `stage <name>`, `query <op>`,
  `audit`, `init`. Publishes as `gdd-sdk` in `package.json` `bin`. See
  `docs/HEADLESS.md` (Phase 23 deliverable) for CI integration guidance.
- **Session runner** (`scripts/lib/session-runner/`) — typed wrapper around
  `@anthropic-ai/claude-agent-sdk` with USD/token budget caps, turn caps,
  transcript capture, structured error mapping via `gdd-errors` taxonomy.
  Emits `session.started`, `session.completed`, `session.budget_exceeded`
  events on the shared event stream.
- **Context engine** (`scripts/lib/context-engine/`) — per-stage file
  manifest + markdown-aware truncation that preserves frontmatter, every
  heading, and the first paragraph of each section for files larger than
  8 KiB. Keeps session prompts within budget without dropping load-bearing
  context.
- **Tool scoping** (`scripts/lib/tool-scoping/`) — per-stage allowed-tools
  enforcement at session creation. Verify is read-only; Explore adds web;
  Design permits shell mutations. Per-agent frontmatter overrides via
  `parseAgentTools()` for agent-level deviations.
- **Structured logger** (`scripts/lib/logger/`) — leveled (debug/info/warn/
  error) with JSONL output in headless mode, ANSI-colored stderr in
  interactive mode. `warn`/`error` also emit `ErrorEvent` on the event
  stream for CI consumers.
- **Pipeline runner** (`scripts/lib/pipeline-runner/`) — brief → explore →
  plan → design → verify state machine with retry-once, halt logic,
  human-gate callbacks, config-driven step skipping. Emits
  `pipeline.started`, `pipeline.completed`, `pipeline.halted`.
- **Explore parallel runner** (`scripts/lib/explore-parallel-runner/`) —
  4 mappers (token, component-taxonomy, a11y, visual-hierarchy) concurrent
  with streaming synthesizer. Honors `parallelism_safe` agent frontmatter
  for opt-in isolation.
- **Discuss parallel runner** (`scripts/lib/discuss-parallel-runner/`) —
  N discussant variants (user-journey, technical-constraint, brand-fit,
  accessibility) concurrent, aggregator dedupes and clusters questions.
- **`gdd-sdk init`** (`scripts/lib/init-runner/`) — new-project bootstrap
  spawning 4 parallel researchers (design-system-audit, brand-context,
  accessibility-baseline, competitive-references) + synthesizer producing
  `.design/DESIGN-CONTEXT.md` draft.
- **Cross-harness portability** (`scripts/lib/harness/`) — the plugin now
  runs unchanged on Claude Code, OpenAI Codex CLI, and Gemini CLI. Ships
  `reference/codex-tools.md`, `reference/gemini-tools.md`, `AGENTS.md`
  (Codex), `GEMINI.md` (Gemini). The `gdd-state` MCP server works on all
  three harnesses; harness detection is runtime-driven.
- **E2E headless integration test** — `tests/e2e-headless.test.ts` with a
  dry-run variant (always runs) and a live variant (gated on
  `ANTHROPIC_API_KEY`). CI workflow gains an `e2e-headless` job.
- **Phase 21 regression baseline** at `test-fixture/baselines/phase-21/` —
  directory list, module list, agent list, connections list, CLI
  subcommand list, event-type list. Enforced by
  `tests/phase-21-baseline.test.cjs`.

### Changed

- `@anthropic-ai/claude-agent-sdk` added as a runtime dependency (was
  previously only referenced in docs).
- `package.json` `bin` now exports `gdd-sdk` in addition to
  `get-design-done` and `gdd-state-mcp`.
- `package.json` `files` adds `bin/` to the publish include list so the
  `gdd-sdk` trampoline ships with the npm package.
- `package.json` `keywords` expanded with headless / CLI / cross-harness
  tokens (`headless`, `cli`, `codex`, `gemini`, `mcp`, `parallel-agents`,
  `agent-sdk`) for npm search surface.

### Infrastructure

- New regression baseline at `test-fixture/baselines/phase-21/`.
- CI workflow gains an `e2e-headless` job (dry-run on every PR; live on
  main-branch push with `ANTHROPIC_API_KEY` secret).
- `tests/semver-compare.test.cjs` `OFF_CADENCE_VERSIONS` now includes
  `1.21.0` as the second off-cadence minor bump after `1.20.0`.

---

## [1.20.0] — 2026-04-24

Phase 20 SDK foundation milestone — the shift from "design pipeline" to "typed SDK + MCP server + resilience primitives + event stream". 16 plans (20-00 through 20-15), 50+ commits, 645+ tests.

### Added

- **Resilience primitives** (headline upgrade) — pipeline now survives Anthropic API rate limits, 429 responses, and context-overflow errors without manual restart. New modules:
  - `scripts/lib/jittered-backoff.cjs` — decorrelated-jitter exponential backoff with a pluggable clock for testability.
  - `scripts/lib/rate-guard.cjs` — token-bucket rate limiter with `RateLimitSchema`-driven config.
  - `scripts/lib/error-classifier.cjs` — three-class taxonomy (transient / retryable-after / fatal) mapping real Anthropic error codes.
  - `scripts/lib/iteration-budget.cjs` — bounded-iteration guard for recovery loops with `IterationBudgetSchema`.
  - See [`reference/error-recovery.md`](reference/error-recovery.md) for the recovery protocol.
- **`gdd-state` MCP server** at `scripts/mcp-servers/gdd-state/` — 11 typed tools replace ad-hoc `Read + regex + Write` patterns for STATE.md:
  - `gdd_state__get`, `__update_progress`, `__transition_stage`, `__add_blocker`, `__resolve_blocker`, `__add_decision`, `__add_must_have`, `__set_status`, `__checkpoint`, `__probe_connections`, `__frontmatter_update`.
  - Every tool has a JSON Schema at `scripts/mcp-servers/gdd-state/schemas/`; inputs and outputs are strict-validated.
  - Every mutation emits a typed event to `.design/telemetry/events.jsonl`.
- **Typed state core** (`scripts/lib/gdd-state/`) — `parse()`, `serialize()`, `mutate()`, `transition()`, `read()`. Lockfile-safe concurrent writes validated by a 4-way race-condition test (`tests/race-condition-state-mutation.test.ts`) — 2000 concurrent ops, zero lost writes, <60s.
- **Event stream foundation** — `.design/telemetry/events.jsonl` append-only with a typed `EventBus`. Parallel stream to the existing `costs.jsonl` cost telemetry.
- **Prompt sanitizer** (`scripts/lib/prompt-sanitizer/`) — strips interactive-only constructs (AskUserQuestion, STOP, `/gdd:` slash commands) from skill bodies for future headless-runner support.
- **TypeScript toolchain** — strict `tsconfig.json`, schema codegen to `reference/schemas/generated.d.ts`, Node 22 `--experimental-strip-types` direct execution (no bundler step).
- **Transition gates** as pure functions (`briefToExplore`, `exploreToPlan`, `planToDesign`, `designToVerify`) with fixture-based tests.
- **`GDDError` 3-class taxonomy** (`ValidationError`, `StateConflictError`, `OperationFailedError`) at `scripts/lib/gdd-errors/`.
- **Phase 20 regression baseline** at `test-fixture/baselines/phase-20/` — agent list, skill list, frontmatter snapshot, MCP tools manifest (schema sha256), events schema hash, hook list, resilience primitives list. Enforced by `tests/regression-baseline-phase-20.test.cjs`.

### Changed

- All 5 stage skills (`brief`, `explore`, `plan`, `design`, `verify`) use `gdd_state__*` MCP tools for STATE.md operations instead of direct `Read + regex + Write`.
- Utility skills (`pause`, `resume`, `progress`, `health`, `todo`, `settings`) migrated to typed `gdd_state__get` + mutation tools.
- Three hooks (`budget-enforcer`, `context-exhaustion`, `gdd-read-injection-scanner`) rewritten in TypeScript and wired as event-stream consumers.
- Four Tier-1 scripts converted to `.ts` (`tests/helpers.ts`, `scripts/validate-schemas.ts`, `scripts/validate-frontmatter.ts`, `scripts/aggregate-agent-metrics.ts`).
- Connection probes (Figma MCP, update-check, watch-authorities) use jittered backoff instead of fixed sleeps.
- Reflector (`agents/design-reflector.md`) reads proposals from the event stream; legacy grep path preserved as fallback.
- `hooks.json` repointed from `.js` hooks to the new `.ts` hooks (via `--experimental-strip-types`).

### Security

- Lockfile-safe STATE.md mutations validated by 4-way concurrent race-condition test. Each mutation acquires `${path}.lock` (PID + timestamp), performs read-modify-write under the lock, writes to `${path}.tmp`, and atomic-renames. Windows EPERM/EBUSY from AV scanners is retried transparently.
- Prompt sanitizer strips untrusted interactive constructs before headless execution paths — reduces prompt-injection surface for future runner work.

### Fixed

- Race conditions in `<position>` `task_progress` and `<blockers>` updates under parallel executor load. The prior `Read + regex + Write` pattern could lose increments and corrupt blocker counts under concurrent agent writes; the new typed `mutate()` API guarantees zero lost writes.

### Deprecated

- `.js` hooks under `hooks/` — replaced by `.ts` equivalents running via `--experimental-strip-types`.
- Direct `Read → regex → Write` patterns against STATE.md — replaced by the 11 `gdd_state__*` MCP tools. Skills that still use the direct pattern will be migrated in a future phase.

### Migration notes

- Consumers of STATE.md should prefer the `gdd_state__*` MCP tools over direct file reads/writes — the typed tools emit events, enforce schemas, and are lockfile-safe. Direct reads for non-mutation cases remain supported.
- Node 22+ is required for `--experimental-strip-types` execution of `.ts` scripts. The CI matrix already pins Node 22 & 24.
- No breaking API changes. All legacy skills and agents continue to work unchanged; the MCP server is additive.

### Stats

- 16 plans (20-00 through 20-15) completed across 4 waves.
- 50+ per-task commits on the Phase 20 branch.
- 645+ tests across CJS + TS suites, 0 failures, 1 skipped.
- `tsc --noEmit` green; `validate:schemas` 11/11 green; `validate:frontmatter` 0 violations.
## [1.19.6] — 2026-04-24

### Added — Design Philosophy Layer

Adds a generative reasoning spine on top of the defensive (anti-patterns) and descriptive (heuristics) layers. Purely additive knowledge + lens integration — no new agents, skills, or commands.

**New `reference/first-principles.md`:** 3-invariant framework (body / attention / memory) with grep-able principle→code pairs and a reducibility test for every design element. Wired into `design-discussant` as Step 0.5 — three invariant questions prepended to the brief-stage interview; answers recorded as `[Invariant]` D-XX decisions in STATE.md.

**New `reference/emotional-design.md`:** Don Norman's visceral / behavioral / reflective three-level framework as a cross-cutting scoring lens. Per-level scoring rubrics (1–4) and a cross-level conflict table. Wired into `design-auditor` (Step 4.5 Emotional Design Overlay appended to DESIGN-AUDIT.md) and `design-reflector` (visceral/behavioral divergence check in Section 1).

**New `reference/component-authoring.md`:** Emil Kowalski / Sonner 6-principle component quality standard — P-01 Minimal API, P-02 Composability, P-03 Defaults, P-04 Animation as State, P-05 Accessibility First, P-06 Edge Honesty — with grep-able audit signals and an ARIA contract table by component type. Wired into design-auditor (Pillar 7 sub-check), design-discussant (`--spec` mode question), and design-verifier must-have checklist.

**`reference/heuristics.md` extended:** Added Peak-End Rule, Loss Aversion, Cognitive Load Theory (intrinsic / extraneous / germane), Aesthetic-Usability Effect, Doherty Threshold (400ms), and Flow (Csikszentmihalyi) — completing the psychology foundations layer.

**`reference/motion-advanced.md`:** Disney's 12 Principles UX mapping stub replaced with full authoring — all 12 principles translated to interface motion with code examples (Squash and Stretch, Anticipation, Staging, Straight Ahead vs Pose to Pose, Follow Through, Slow In/Slow Out, Arcs, Secondary Action, Timing, Exaggeration, Solid Drawing, Appeal).

**`reference/checklists.md`:** Added Rams Lens (10 questions mapping Dieter Rams's principles) and Sonner / Component-Authoring Lens (6 P-0N questions) as post-audit self-checks.

**`reference/shared-preamble.md`:** Added Design Philosophy Layer block pointing to the three new reference files — ensures all agents are aware of the philosophy spine.

**`reference/authority-feeds.md`:** Added `jnd.org` (Don Norman) and `vitsoe.com` (Dieter Rams / Vitsœ) as named-practitioner feeds. Feed count: 26 → 28.

**`design-auditor`:** Required reading expanded with `reference/emotional-design.md` and `reference/component-authoring.md`. Step 4.5 (Emotional Design Overlay) added to execution steps.

**`design-discussant`:** Step 0.5 (First-Principles Invariants) prepends three invariant questions during brief/discover stage.

**`design-reflector`:** Section 1 extended with four principles-check prompts: reducibility, memory-load, peak-end, and error-redemption.

---

## [1.19.5] — 2026-04-24

### Added — Cross-Cycle Memory: Recall, Checkpoints, Experience Archive

Turns write-only learnings and reflections into a queryable, ranked, self-pruning memory layer.

**Search backend (`scripts/lib/design-search.cjs`):** Priority chain — FTS5 via `better-sqlite3` (optional dep, runtime-probed) → ripgrep → Node fs scan. `/gdd:recall --reindex` rebuilds the index. `scripts/lib/probe-optional.cjs` wraps optional native deps for future reuse.

**Cross-cycle recall (`/gdd:recall <query>`):** `skills/recall/SKILL.md` — searches `.design/archive/`, `.design/learnings/LEARNINGS.md`, `.design/CYCLES.md`, and STATE.md decision blocks; signals `surfaced` for matched L-NN IDs via `relevance-counter.cjs`.

**Numbered checkpoints (pause/resume rewrite):** `skills/pause/SKILL.md` atomic-appends to `.design/checkpoints/NN-<stage>-<ISO-date>.md` instead of clobbering `HANDOFF.md`; `HANDOFF.md` becomes a pointer to the latest checkpoint. `skills/resume/SKILL.md` gains listing mode with `AskUserQuestion` picker when no arg; `/gdd:resume N` restores checkpoint N. `skills/continue/SKILL.md` — alias for `/gdd:resume` (discoverability).

**Per-cycle EXPERIENCE.md:** `skills/complete-cycle/SKILL.md` extended — Haiku-tier writer reads cycle STATE + DESIGN-VERIFICATION + reflections, emits `.design/archive/cycle-N/EXPERIENCE.md` (~100–200 lines, declarative-fact framing: Goal / Decisions made / Learnings graduated / What died / Surprises / Handoff to next cycle). Highest-priority source for decision-injector.

**Timeline retrospective (`/gdd:timeline`):** `skills/timeline/SKILL.md` — narrative view across EXPERIENCE.md files + git log; sections Opened with / Key decisions / Surprises / What we'd do differently.

**Relevance counter (`scripts/lib/relevance-counter.cjs`):** `record(id, signal, designDir)` under atomic-write + `.lock`; signals: `cited`, `surfaced`, `dismissed`. `shouldPromote` at 8+ cites; `shouldPrune` at 0 cites + 4 cycles.

**Decision-injector FTS5 upgrade:** `hooks/gdd-decision-injector.js` backend-swaps to FTS5 transparently when `design-search.cjs` is available — zero surface-level output change, backend label shown in footer.

**Record contract (mandatory for all agents):** `agents/README.md` authoring template gains mandatory `## Record` step — every agent appends one JSONL line to `.design/intel/insights.jsonl`. `reference/schemas/insight-line.schema.json` — schema with 6 required fields (`ts`, `agent`, `cycle`, `stage`, `one_line_insight`, `artifacts_written`). `tests/record-contract.test.cjs` enforces presence of `## Record` section in every `agents/*.md`. All 36 existing agents updated with stub Record sections.

---

## [1.19.0] — 2026-04-24

### Added — Platform, Inclusive Design & UX Research References (knowledge-layer complete)

This release closes the final reference gaps identified in the 2026-04-18 knowledge audit. The plugin now ships 18 reference files covering every major design-knowledge domain.

#### 7 new reference files

- **`reference/platforms.md`** — iOS/Android/web/visionOS/watchOS conventions: nav patterns, safe areas, gesture vocabularies, native typography, haptic feedback. Wired into `design-context-builder` + `design-phase-researcher`.
- **`reference/rtl-cjk-cultural.md`** — RTL logical CSS properties, CJK typography (line-height 1.5–1.8, font-fallback stacks), Arabic/Hebrew, Devanagari/Tamil/Thai, cultural color meanings table, `Intl.*` formatting. Wired into `design-context-builder` + `design-auditor`.
- **`reference/onboarding-progressive-disclosure.md`** — First-run pattern matrix, feature discovery, Aha-moment mapping, activation vs. habituation metrics, anti-patterns. Wired into `design-executor` + `design-auditor`.
- **`reference/user-research.md`** — Research method matrix, card sort/tree test/A/B benchmarks, synthesis techniques, research ethics. Wired into `design-phase-researcher`.
- **`reference/information-architecture.md`** — Nav pattern catalog (hub-and-spoke/nested/faceted/flat/mega-menu), tree-test benchmarks, wayfinding ARIA conventions. Wired into `design-context-builder` + `design-pattern-mapper`.
- **`reference/form-patterns.md`** — Label position (Wroblewski research), on-blur validation default, full `autocomplete` taxonomy, `inputmode`/`enterkeyhint`, password UX (paste-allowed), CAPTCHA ethics. Wired into `design-auditor` (forms pillar) + `design-executor` (new `type:forms`).
- **`reference/data-visualization.md`** — Chart-choice matrix, 25 chart types (decision-tree prose, UUPM `charts.csv` MIT), Okabe-Ito/viridis/cividis palettes, axis conventions, dashboard patterns. Wired into `design-auditor` + `design-executor`.

#### Agent wiring
- `design-context-builder` — Area 2 locale detection; Area 6 platform note; `canonical_refs` extended with 3 conditional references.
- `design-auditor` — Required reading extended: form-patterns, onboarding, data-visualization, rtl-cjk-cultural, information-architecture.
- `design-executor` — New `type:forms` task type (7-step checklist); `type:layout` reads data-viz for dashboards; `type:copy` reads onboarding for first-run flows.
- `design-phase-researcher` — reads user-research.md + platforms.md.
- `design-pattern-mapper` — reads information-architecture.md for nav classification.

All 7 files registered in `reference/registry.json`. Regression baseline at `test-fixture/baselines/phase-19/`.

---

## [1.18.0] — 2026-04-24

### Added — Advanced Craft References + Motion Vocabulary

**Wave A — Craft references (4 new files):**

- `reference/variable-fonts-loading.md` — Variable font axes (wght/ital/opsz/slnt/GRAD/custom), `@font-face` range declarations, `font-display` trade-offs (swap/fallback/optional), WOFF2 subsetting with `unicode-range`, FOIT vs FOUT, fallback metric overrides (`size-adjust`, `ascent-override`, `descent-override`, `line-gap-override`), GRAD axis for dark-mode weight compensation without layout reflow, system font stacks per platform (REF-14)
- `reference/image-optimization.md` — WebP/AVIF/JPEG XL choice matrix, `srcset`+`sizes` math by breakpoint, responsive art direction with `<picture>`, LQIP/BlurHash/ThumbHash placeholder strategies, lazy-loading + `decoding="async"` + `fetchpriority="high"`, CDN transform patterns (Cloudinary/imgix/Vercel Image), image budget enforcement (REF-15)
- `reference/css-grid-layout.md` — CSS Grid template patterns (holy grail, bento, masonry), `subgrid`, container queries (`@container` + `container-type`), fluid typography with `clamp()` (utopia.fyi math), intrinsic sizing, logical properties, safe-area insets, `aspect-ratio`/`object-fit`, anchor positioning progressive enhancement (REF-16)
- `reference/motion-advanced.md` — Spring physics, stagger patterns, scroll-driven animation (`animation-timeline`), FLIP, View Transitions API, route orchestration, gesture/drag mechanics (velocity threshold ≈0.11, boundary damping, pointer capture, multi-touch protection), clip-path animation patterns (hold-to-delete, scroll reveals, tab masks, comparison sliders), blur-to-mask crossfades (<20px Safari cap), CSS transitions vs keyframes for interruptible UI, WAAPI, Framer Motion hardware-accel gotcha (`x`/`y` shorthand vs GPU `transform` string), motion cohesion & personality, next-day slow-motion review process; Disney's 12 Principles UX mapping stub (fills at Phase 19.6 closeout) (REF-17)

**Wave B — Motion vocabulary (RN MIT + hyperframes Apache-2.0):**

- `reference/motion-easings.md` — 12 canonical curve presets (linear/quad/cubic/poly/sin/circle/exp/elastic/back/bounce/bezier + in/out/inOut wrappers) from React Native MIT upstream; `--ease-*` CSS custom property token catalog; 60fps settle-times for spring/bounce/elastic variants (MOT-01)
- `reference/motion-interpolate.md` — Input→output range model + 4 extrapolation modes (extend/identity/clamp/wrap) from RN MIT; taxonomy of progress-linked/scroll-linked/gesture-linked/time-linked animations (MOT-02)
- `reference/motion-spring.md` — Stiffness/damping/mass triad + 4 canonical presets (gentle/wobbly/stiff/slow) with 60fps settle-times; Framer Motion + React Spring syntax; CSS `linear()` approximation pattern (MOT-05)
- `reference/motion-transition-taxonomy.md` — 8 controlled transition families from hyperframes Apache-2.0: 3d, blur, cover, destruction, dissolve, distortion, grid, light — each with definition, canonical examples, when-to-use heuristics (MOT-03)
- `reference/external/NOTICE.hyperframes` — Apache-2.0 attribution for hyperframes transition taxonomy

**Wave B — Output contract + tooling:**

- `reference/output-contracts/motion-map.schema.json` — JSON schema requiring each animation binding to declare easing (canonical or custom+justification), transition family (optional), duration class (instant/quick/standard/slow/narrative), and trigger type (user-gesture/state-change/scroll-progress/time/loop) (MOT-04)
- `scripts/lib/parse-contract.cjs` — Shared validation helper: extracts JSON block from agent markdown output, validates against motion-map contract, returns structured data or actionable error
- `scripts/lib/easings.cjs` — Closed-form easing math helper (RN MIT): all 12 presets + in/out/inOut HOFs, cubic-bezier Newton-Raphson solver
- `scripts/lib/spring.cjs` — Spring simulation helper (RN MIT): PRESETS, criticalDamping(), settleTime(), step()
- `scripts/tests/test-motion-provenance.sh` — Provenance test: asserts RN-MIT attribution in all motion-vocabulary files; asserts no Remotion/ path citations

**Agent integrations:**

- `agents/motion-mapper.md` — Reads motion-advanced + easings + interpolate + transition-taxonomy + spring; emits structured JSON block (conforming to motion-map schema) before prose; advanced scan patterns for gesture/drag, clip-path, FLIP, View Transitions, scroll-driven, WAAPI
- `agents/design-executor.md` — type:typography reads `variable-fonts-loading.md`; type:layout reads `css-grid-layout.md` + `image-optimization.md`; type:motion reads `motion-advanced.md` + `motion-easings.md` + `motion-spring.md`
- `agents/design-auditor.md` — Required Reading extended with 4 Phase 18 references; gesture/clip-path/blur-crossfade patterns scored as "advanced craft" signal (positive) in Pillar 7
- `agents/token-mapper.md` — Micro-polish finding #5: easing token consolidation (raw `cubic-bezier()` → `--ease-*` canonical tokens)
- `reference/motion.md` — Cross-links added pointing to all 4 Phase 18 motion references
- `reference/registry.json` — 9 new entries: REF-14 through REF-17 + MOT-01 through MOT-05

**Phase 18 keywords added to package.json:** `variable-fonts`, `container-queries`, `view-transitions`, `motion-vocabulary`, `motion-easings`, `transition-taxonomy`, `gesture-mechanics`, `clip-path-animation`

---

## [1.17.0] — 2026-04-24

### Added — Component Benchmark Corpus: Waves 3–5 (20 specs) + Pipeline Integration

Completes the 35-spec component benchmark corpus and wires it into the design pipeline so agents actively consume per-component benchmarks during audit, execution, documentation, and pattern analysis.

#### Wave 3 — Feedback (6 specs)

- **`reference/components/toast.md`** — transient notification (4–8s auto-dismiss, configurable); `role="status"` (info/success) vs `role="alert"` (warning/error); entry/exit slide+fade animation; optional action; stacking with 8px gap (max 3 visible); UUPM app-interface dashboard/settings-save context (MIT attribution).
- **`reference/components/alert.md`** — inline persistent message; info/success/warning/error variants; `role="alert"` (assertive) vs `role="status"` (polite); icon reinforces variant — never color as sole differentiator (WCAG 1.4.1).
- **`reference/components/progress.md`** — linear + circular variants; determinate (`aria-valuenow`) vs indeterminate (`aria-valuetext`); `role="progressbar"`; `aria-label` required; 4px minimum track height.
- **`reference/components/skeleton.md`** — content-layout mirror; shimmer (left-to-right gradient, 1.5s loop); `aria-hidden="true"` on skeleton elements; `aria-busy="true"` + `aria-label` on container; 60–90% width variation.
- **`reference/components/badge.md`** — count/dot/icon variants; `99+` overflow pattern; decorative (no keyboard interaction); count surfaced via `aria-label` on parent element.
- **`reference/components/chip.md`** — filter/input/suggestion/display variants; independent `aria-label` on remove button; `aria-pressed` on toggle; `role="option"` in listbox context; UUPM app-interface filter/tag-input context (MIT attribution).

#### Wave 4 — Navigation & Data (9 specs)

- **`reference/components/menu.md`** — `role="menu"` + `role="menuitem"`; arrow-key navigation; click-only open (no hover trigger); sub-menus on ArrowRight; focus returns to trigger on close.
- **`reference/components/navbar.md`** — `role="banner"` + `role="navigation"` + `aria-label="Primary"`; skip-to-main link; `aria-current="page"`; hamburger `aria-expanded`; UUPM dashboard/settings/profile context (MIT attribution).
- **`reference/components/sidebar.md`** — `aria-label="Secondary"`; icon+label vs icon-only collapsed; `aria-expanded` on collapsible sections; UUPM settings-nav + dashboard-nav variants (MIT attribution).
- **`reference/components/breadcrumbs.md`** — `role="navigation"` + `aria-label="Breadcrumb"`; `aria-current="page"` on last item; `aria-hidden` on separators; truncate middle not ends.
- **`reference/components/pagination.md`** — `aria-label="Pagination"`; `aria-current="page"` on active page; per-page `<select>` with visible label; UUPM list-view context (MIT attribution).
- **`reference/components/table.md`** — `scope="col"` on all `<th>`; `aria-sort` on sortable headers; `aria-selected` on rows; `role="grid"` vs `role="table"`; virtualise >200 rows; UUPM list/detail + master-detail + dashboard context (MIT attribution).
- **`reference/components/list.md`** — display (`<ul>/<li>`) vs interactive (`role="listbox"` + `role="option"`); `aria-multiselectable`; virtualise >100 items; UUPM list/detail left-panel context (MIT attribution).
- **`reference/components/tree.md`** — `role="tree"` + `role="treeitem"` + `role="group"`; `aria-expanded`; `aria-level`; `aria-busy` on lazy-load nodes; full WAI-ARIA APG keyboard contract.
- **`reference/components/command-palette.md`** — `role="dialog"` + `aria-modal`; focus trap; `role="combobox"` + `aria-controls` → `role="listbox"`; Cmd/Ctrl+K trigger; UUPM global-search context (MIT attribution).

#### Wave 5 — Advanced (5 specs)

- **`reference/components/date-picker.md`** — input + range variants; calendar `role="dialog"`; day cells `role="gridcell"` + `role="button"`; full arrow-key navigation; native `<input type="date">` mobile fallback.
- **`reference/components/slider.md`** — single + range; `role="slider"` + `aria-valuenow/min/max/valuetext`; 44px thumb touch target via `::before` trick; Page Up/Down ±10%.
- **`reference/components/file-upload.md`** — drop-zone + picker; `<input type="file">` never `display:none` (keyboard/AT fallback); `aria-label="Remove [filename]"` on remove buttons; upload errors via `aria-live="assertive"`.
- **`reference/components/rich-text-editor.md`** — `contenteditable` + `role="textbox"` + `aria-multiline="true"`; toolbar `role="toolbar"`; toggle buttons `aria-pressed`; placeholder via CSS `::before`; mention trigger pattern.
- **`reference/components/stepper.md`** — `role="list"` (not `role="tablist"`); `aria-current="step"` on active step; UUPM wizard/onboarding/checkout flow context (MIT attribution).

#### Pipeline Integration

- **`agents/design-auditor.md`** — new **Component Conformance** addendum: discovers specs, runs grep signatures against codebase, scores state/variant/a11y coverage per component, emits conformance table as informational addendum (does not change /28 pillar score).
- **`agents/design-executor.md`** — **Benchmark Spec Pre-Flight** for `type:components` tasks: reads matching `reference/components/<name>.md`, applies anatomy/states/a11y contract before building — no re-discovering ARIA roles or keyboard patterns already benchmarked.
- **`agents/design-doc-writer.md`** — **Component Spec Scaffold**: pre-fills DESIGN-STYLE doc structure from benchmark spec's Purpose/Anatomy/Variants/States when a spec exists; includes "Benchmarked against" citation; falls back to from-scratch generation gracefully.
- **`agents/design-pattern-mapper.md`** — **Component Convergence Detector**: writes `.design/map/component-convergence.md` with matched/absent component table and per-component convergence %; runs after pattern extraction.

---

## [1.16.0] — 2026-04-24

### Added — Component Benchmark Corpus: Tooling + Waves 1–2 (15 specs)

This release builds the infrastructure to harvest per-component design knowledge from 18 design systems and ships 15 canonical component specs at `reference/components/`. Every spec follows a locked shape — Purpose · Anatomy · Variants · States · Sizing · Typography · Keyboard & a11y · Motion · Do/Don't · Anti-patterns · Citations · Grep signatures — making the corpus greppable, diffable, and agent-consumable.

#### Tooling

- **`agents/component-benchmark-harvester.md`** — given a component name, harvests per-source excerpts from 18 design systems (see `connections/design-corpora.md`), consumes Phase 15 impeccable salvage, emits raw harvest to `.planning/benchmarks/raw/<component>.md` with source-attributed excerpts and convergence pre-analysis.
- **`agents/component-benchmark-synthesizer.md`** — reads the raw harvest and emits a canonical `reference/components/<name>.md` using the locked TEMPLATE.md shape. Convergence analysis is explicit: NORM (≥4 systems agree) vs. DIVERGE (systems disagree with rationale).
- **`skills/benchmark/SKILL.md`** — new `/gdd:benchmark` command with 4 modes: `<component>` (single), `--wave <N>` (full wave), `--list` (coverage table), `--refresh <component>` (re-harvest on design-system version bump).
- **`connections/design-corpora.md`** — 18-system catalog with canonical URLs, licensing/attribution notes, and fallback chain (canonical → archive.org → Refero MCP → Pinterest MCP).
- **`reference/components/TEMPLATE.md`** — locked 12-section spec shape. All future component specs must conform.
- **`reference/components/README.md`** — corpus index with category tables (Wave 1–5) and coverage summary.

#### Wave 1 — Inputs (8 specs)

- **`reference/components/button.md`** — primary/secondary/ghost/destructive/icon-only variants, 96% press scale norm, WAI-ARIA button keyboard contract, `transition:all` BAN, non-descriptive-label anti-pattern.
- **`reference/components/input.md`** — text/search/password/number, placeholder-as-label anti-pattern, floating vs. static label trade-off (static preferred), `aria-describedby` error linking, WAI-ARIA textbox contract.
- **`reference/components/select-combobox.md`** — native vs. custom decision tree, WAI-ARIA listbox + combobox contracts (verbatim), `aria-activedescendant` pattern, multi-select approaches, virtualised list note, async empty state.
- **`reference/components/checkbox.md`** — binary/indeterminate states, `fieldset`+`legend` group requirement, `.indeterminate` JS property, WAI-ARIA checkbox contract.
- **`reference/components/radio.md`** — arrow-key auto-advance behavior, Tab-as-group-unit pattern, single-radio anti-pattern, WAI-ARIA radiogroup contract.
- **`reference/components/switch.md`** — switch vs. checkbox semantic distinction (`role="switch"` not `role="checkbox"`), spring thumb animation, pill track (`border-radius: 9999px`), immediate-action rule.
- **`reference/components/link.md`** — link vs. button semantic boundary, underline requirement for inline links (WCAG 1.4.1), external-link disclosure, `rel="noopener noreferrer"`, non-descriptive link text anti-pattern.
- **`reference/components/label.md`** — four association methods ranked (`<label for>` → `aria-labelledby` → `aria-label` → `<legend>`), `.sr-only` CSS pattern, legend-for-groups rule, placeholder failure analysis.

#### Wave 2 — Containers (7 specs)

- **`reference/components/card.md`** — stretched-link pattern for nested interactivity, `<article>` vs `<div>` semantics, elevated/outlined/clickable variants, `aria-busy` skeleton state.
- **`reference/components/modal-dialog.md`** — focus trap, Escape contract, portal rendering, `aria-modal`+`aria-labelledby` requirement, `role="alertdialog"` for confirmations, scroll-lock, focus return on close.
- **`reference/components/drawer.md`** — focus trap (same as modal), swipe-to-close for bottom sheet, side direction routing, nav drawer vs. content drawer role distinction, slide-in motion.
- **`reference/components/popover.md`** — Floating UI positioning (flip+shift+arrow middlewares), non-modal vs. modal distinction, `aria-expanded`+`aria-controls` trigger contract, `role="tooltip"` on interactive content anti-pattern.
- **`reference/components/tooltip.md`** — no-interactive-content rule, hover+focus trigger (not hover-only), Escape dismiss, 300ms delay, `aria-describedby` contract, tooltip vs. popover boundary.
- **`reference/components/accordion.md`** — `h2`–`h6` header requirement, `aria-expanded`-on-trigger rule, `grid-template-rows` CSS height animation trick, `role="region"` landmark note (skip if >6 items).
- **`reference/components/tabs.md`** — roving tabindex pattern, arrow-key navigation (not Tab), automatic vs. manual activation modes, tablist label requirement, `hidden` on inactive panels.

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
