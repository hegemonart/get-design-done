# Get Design Done

[![CI](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/plugin-v1.0.7-blue)](https://github.com/hegemonart/get-design-done/releases/tag/v1.0.7)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/hegemonart/get-design-done/blob/main/LICENSE)

Agent-orchestrated design pipeline for Claude Code. One entry point that routes design work through a 5-stage workflow — **Scan → Discover → Plan → Design → Verify** — using 22 specialized agents, Figma + Refero + Pinterest MCP connections, and Claude Design handoff integration.

## Install

### Option A — Claude Code marketplace (recommended)

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

### Option B — npm / pnpm

Published as a scoped package on npm. Works with any npm-compatible client (npm, pnpm, yarn, bun):

```bash
npm  install -g @hegemonart/get-design-done
pnpm add     -g @hegemonart/get-design-done
```

Either path installs the pipeline skill and triggers the bootstrap hook, which provisions the companion library `~/.claude/libs/awesome-design-md` on first run.

## Usage

Run in any project directory:

```
@get-design-done scan          — Map existing design system → DESIGN.md + debt roadmap
@get-design-done discover      — Discovery interview + baseline audit → DESIGN-CONTEXT.md
@get-design-done plan          — Decompose into tasks → DESIGN-PLAN.md
@get-design-done design        — Execute tasks → DESIGN-SUMMARY.md
@get-design-done verify        — Score + audit → DESIGN-VERIFICATION.md
```

Invoke without arguments for pipeline status and auto-routing to the next stage.

### Standalone commands (work without running the pipeline first)

```
@get-design-done handoff <path>  — Skip pipeline; parse Claude Design bundle → verify → optional Figma write-back
@get-design-done style Button    — Generate component handoff doc → .design/DESIGN-STYLE-Button.md
@get-design-done darkmode        — Audit dark mode architecture + contrast → .design/DARKMODE-AUDIT.md
@get-design-done compare         — Delta between baseline and verification result → .design/COMPARE-REPORT.md
```

## Commands

All commands are invoked as `/gdd:<name>`.

**Pipeline stages**: `brief`, `explore`, `plan`, `design`, `verify`, `audit`

**Lifecycle**: `new-project`, `new-cycle`, `complete-cycle`

**Ergonomics**: `progress`, `health`, `todo`, `stats`, `next`, `help`

**Capture**: `note`, `plant-seed`, `add-backlog`, `review-backlog`

**Exploration**: `sketch`, `sketch-wrap-up`, `spike`, `spike-wrap-up`, `map`

**Execution**: `do`, `fast`, `quick`, `ship`, `undo`, `pr-branch`, `debug`

**Session**: `pause`, `resume`, `list-assumptions`, `discuss`

**Standalone**: `style`, `darkmode`, `compare`, `handoff`

**Settings**: `settings`, `update`, `reapply-patches`

See the root `SKILL.md` for one-line descriptions of each command.

## Pipeline overview

Each stage is orchestrated by a thin skill that spawns specialized agents:

| Stage | Agents spawned | Output |
|-------|----------------|--------|
| scan | — (direct analysis) | DESIGN.md, DESIGN-DEBT.md |
| discover | design-context-builder, design-context-checker | DESIGN-CONTEXT.md |
| plan | design-phase-researcher, design-planner, design-plan-checker | DESIGN-PLAN.md |
| design | design-executor (per task) | DESIGN-SUMMARY.md |
| verify | design-verifier, design-auditor, design-integration-checker, design-fixer | DESIGN-VERIFICATION.md |

All pipeline artifacts are written to `.design/` inside your project.

## Knowledge Layer (v1.0.4)

The knowledge layer gives the design pipeline persistent memory and O(1) lookups
across all design surface files.

### Intel Store (`.design/intel/`)

A queryable set of JSON slices that index the design surface:

| Slice | Contents |
|-------|----------|
| `files.json` | All tracked skill/agent/reference/script/hook files with mtime and git hash |
| `exports.json` | Named exports: skill commands and agent names |
| `symbols.json` | Markdown headings and section anchors |
| `tokens.json` | Design token references (color, spacing, typography, radius) |
| `components.json` | Component names and their referencing files |
| `patterns.json` | Design pattern classifications by concern |
| `dependencies.json` | @-reference and reads-from relationships |
| `decisions.json` | Architectural decisions from DESIGN-CONTEXT.md |
| `debt.json` | Design debt items from DESIGN-DEBT.md |
| `graph.json` | Cross-reference graph: nodes (files) + edges (dependencies) |

Build the intel store: `node scripts/build-intel.cjs --force`
Incremental updates: invoke the `gdd-intel-updater` agent after any file edits.

### New Commands

| Command | Purpose |
|---------|---------|
| `/gdd:analyze-dependencies` | Token fan-out, component call-graph, decision traceability, circular dep detection |
| `/gdd:skill-manifest` | Browse all registered skills and agents from the intel store |
| `/gdd:extract-learnings` | Extract project patterns from `.design/` artifacts → propose reference updates |

### New Agents

| Agent | Purpose |
|-------|---------|
| `gdd-intel-updater` | Incremental intel store rebuilder |
| `gdd-learnings-extractor` | Structured learning entry extractor |
| `gdd-graphify-sync` | Feeds Graphify knowledge graph from intel store |

### Context Exhaustion Hook

A `PostToolUse` hook (`hooks/context-exhaustion.js`) auto-records a `<paused>` resumption
block in `.design/STATE.md` when session context reaches 85%. Run `/gdd:resume` in the next
session to restore context.

### Architectural Responsibility Map

`design-phase-researcher` now produces two new sections in every `DESIGN-CONTEXT.md`:
- **Architectural Responsibility Map** — file/module → tier → responsibility table
- **Flow Diagram** — Mermaid flowchart of the main user workflow

## Optimization Layer (v1.0.4.1)

Phase 10.1 added a cross-cutting optimization layer that every `/gdd:*` command and agent spawn passes through. Target: **50–70% per-task token-cost reduction** versus the pre-optimization baseline — with no regression on the design-quality floor. Shipped as an off-cadence patch (v1.0.4.1) retroactively after Phases 10 and 11.

### What's in it

- **`gdd-router` skill** — first-step intent router. Given task intent and target artifacts, returns `{path: fast|quick|full, model_tier_overrides, estimated_cost_usd, cache_hits}`. Cheap Haiku call; gates every downstream spawn.
- **`gdd-cache-manager` skill** + **`/gdd:warm-cache`** command — maintains `.design/cache-manifest.json` and pre-warms common agent system prompts so Anthropic's 5-minute prompt cache fires on the shared preamble.
- **`.design/budget.json`** config — per-task + per-phase USD caps, per-agent tier overrides, auto-downgrade on soft-threshold, cache TTL, and enforcement mode. Schema: [`reference/config-schema.md`](reference/config-schema.md).
- **PreToolUse `budget-enforcer` hook** — intercepts every `Agent` tool spawn: consults router, cache-manifest, and budget.json. Hard-blocks on cap breach (with an actionable error), auto-downgrades at the 80% soft-threshold, short-circuits on cache hit. Without the hook, optimization is advisory; with it, violations are impossible.
- **Model-tier system** — every agent now carries `default-tier: haiku|sonnet|opus` + `tier-rationale` in its frontmatter. Overridden by `budget.json tier_overrides`. Policy: [`reference/model-tiers.md`](reference/model-tiers.md).
- **Shared preamble** at [`reference/shared-preamble.md`](reference/shared-preamble.md) — extracted common agent framework content. All agents import it first; first agent in a session pays full cost, rest ride the 5-min prompt cache.
- **Lazy checker gates** (`design-verifier-gate`, `design-integration-checker-gate`, `design-context-checker-gate`) — cheap Haiku heuristic agents that decide whether to spawn the expensive full checker.
- **Streaming synthesizer** (`skills/synthesize/`) — parallel-mapper and parallel-researcher outputs are collapsed by a single Haiku call before returning to main context.
- **Cost telemetry** — `.design/telemetry/costs.jsonl` appends one row per agent spawn decision: `{ts, agent, tier, tokens_in, tokens_out, cache_hit, est_cost_usd, cycle, phase}`. Aggregated to `.design/agent-metrics.json`.
- **`/gdd:optimize`** advisory command — reads telemetry + metrics and emits recommendations to `.design/OPTIMIZE-RECOMMENDATIONS.md`. Pure advisory; no auto-apply. Phase 11's reflector consumes the same data for frontmatter-update proposals.

### Using it

```bash
# One-shot cache warm-up before a design sprint
/gdd:warm-cache

# Run any /gdd:* command — the hook enforces budget.json automatically
/gdd:scan .

# Review cost recommendations after a run
/gdd:optimize
```

### Configuration

Edit `.design/budget.json` to tune limits per project:

```json
{
  "per_task_cap_usd": 2.00,
  "per_phase_cap_usd": 20.00,
  "tier_overrides": {
    "design-planner": "opus",
    "design-verifier": "haiku"
  },
  "auto_downgrade_on_cap": true,
  "cache_ttl_seconds": 3600,
  "enforcement_mode": "enforce"
}
```

`enforcement_mode` takes `enforce | warn | log` — use `log` during adoption to see the hook's decisions without blocking.

### Baselines

Regression baselines for Phase 10.1 live at [`test-fixture/baselines/phase-10.1/`](test-fixture/baselines/phase-10.1/) — methodology in that directory's README. Phase 12's test suite diffs against `cost-report.md` to catch regressions.

---

## Connections (optional)

The pipeline integrates with seven external tools and MCPs. All connections are optional — the pipeline degrades gracefully when any connection is unavailable.

| Connection | Type | Purpose |
|-----------|------|---------|
| Figma Desktop | MCP (`mcp__figma-desktop__*`) | Token extraction, design context pre-population |
| Figma Writer | MCP (`mcp__figma__use_figma`) | Write decisions back to Figma (annotate, tokenize, Code Connect) |
| Refero | MCP (`mcp__refero__*`) | Reference design search during discovery |
| Preview (Playwright) | MCP (`mcp__Claude_Preview__*`) | Live page screenshots for visual verification |
| Storybook | HTTP (`localhost:6006`) | Component inventory, a11y per story, story stubs |
| Chromatic | CLI (`npx chromatic`) | Visual regression delta narration and change-risk scoping |
| Graphify | CLI (`graphify`) | Knowledge graph: component↔token↔decision relationships |

See [`connections/connections.md`](./connections/connections.md) for the full index, capability matrix, and probe patterns.

### Figma MCP

When the official Figma Desktop MCP is active, `scan` reads Figma variables and `discover` pre-populates design decisions from your Figma file. Falls back to code-only analysis when not available. See [`connections/figma.md`](./connections/figma.md) for setup.

### Refero MCP

When Refero is active, `discover` pulls visual references to ground design decisions. Requires an API token:

```json
{
  "mcpServers": {
    "refero": {
      "type": "http",
      "url": "https://mcp.refero.design/mcp",
      "headers": { "Authorization": "Bearer YOUR_REFERO_TOKEN" }
    }
  }
}
```

Falls back to `~/.claude/libs/awesome-design-md/` when unavailable. See [`connections/refero.md`](./connections/refero.md) for setup.

### Pinterest MCP

When the Pinterest MCP (`terryso/mcp-pinterest`) is active, `discover` pulls visual inspiration boards to ground design decisions alongside Refero references. ToolSearch-only probe — no API key required. Falls back to Refero → awesome-design-md when unavailable. See [`connections/pinterest.md`](./connections/pinterest.md) for setup.

### Claude Design handoff

Drop a Claude Design bundle (HTML export from claude.ai/design) into your project root and run `/gdd:handoff <path>`. The pipeline skips Scan → Discover → Plan, parses the bundle CSS custom properties into D-XX design decisions, runs `verify --post-handoff` for Handoff Faithfulness scoring, and optionally writes implementation status back to Figma. See [`connections/claude-design.md`](./connections/claude-design.md) for the full bundle format and adapter pattern.

## Bootstrap hook

On `SessionStart`, the plugin provisions the companion library if missing:

| Resource | Location | Source |
|----------|----------|--------|
| awesome-design-md | `~/.claude/libs/awesome-design-md/` | [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) |

Idempotent — skips work if already present, runs `git pull --ff-only` on subsequent sessions.

## Self-Improvement

After each design cycle, `get-design-done` reflects on what happened and proposes concrete improvements — no vague retros, no auto-applied changes.

### How it works
1. Run `/gdd:audit` at cycle end → automatically triggers `design-reflector`
2. Or run `/gdd:reflect` on demand at any time
3. Reflector reads `.design/learnings/`, telemetry, and agent-metrics to produce `.design/reflections/<cycle-slug>.md`
4. Review proposals with `/gdd:apply-reflections` — diff, accept, skip, or edit each one

### What gets proposed
- **Frontmatter updates** — agent duration estimates and tier assignments from measured data
- **Reference additions** — anti-patterns and heuristics that appeared ≥3 cycles
- **Budget adjustments** — cost caps tuned from actual spend patterns
- **Question pruning** — discussant questions that consistently get low-value answers
- **Global skill promotion** — project findings promoted to `~/.claude/gdd/global-skills/` for cross-project use

### Nothing auto-applies
Every proposal requires explicit user review via `/gdd:apply-reflections`. The discipline mirrors figma-writer's proposal→confirm pattern — the plugin proposes, you decide.

### Global skills
Cross-project conventions live in `~/.claude/gdd/global-skills/`. Once you accept a `[GLOBAL-SKILL]` proposal, that convention auto-loads in every future gdd session across all projects.

## Testing

`get-design-done` ships with a locked test suite. Every push and PR runs the full suite across a cross-platform matrix — Node 22/24 × Linux/macOS/Windows.

### Run tests locally

```bash
npm test
```

The test runner is Node's built-in `node:test` + `node:assert/strict` — zero third-party test dependencies.

### What's covered

- **Infrastructure** — test runner, CI workflow, shared helpers, regression baselines locked per phase
- **Agent hygiene** — frontmatter completeness, line-count tier budgets (XXL/XL/LARGE/DEFAULT), `Required Reading` path validity, `/gdd:` namespace consistency (no stale `/design:` references)
- **System contracts** — `.design/config.json` schema, command↔skill parity, hooks integrity, atomic writes to `.design/STATE.md`, frontmatter parser edge cases, model-profile resolution, `/gdd:health` output shape, worktree safety, semver bump sequence, STATE-TEMPLATE drift
- **Pipeline + data** — end-to-end pipeline smoke on `test-fixture/`, mapper JSON-schema validation (tokens, components, a11y, motion, hierarchy), parallelism-engine decision table, `Touches:` field parsing, cycle lifecycle (`/gdd:new-cycle` → stage progression → `/gdd:complete-cycle`), `.design/intel/` incremental-update correctness, regression-baseline drift detector
- **Feature correctness** — `/gdd:sketch` variant determinism, 8-connection probe contracts with mocked MCPs (figma / refero / preview / storybook / chromatic / graphify / claude-design / pinterest), `design-figma-writer` dry-run discipline, `design-reflector` proposal-only shape, deprecated-name redirects, NNG heuristic coverage, `gdd-read-injection-scanner` hook behavior, optimization-layer schema enforcement

### CI

GitHub Actions runs the suite on every push and every PR. A green build is required before merge — see `.github/workflows/ci.yml` for the exact matrix.

From v1.0.6 forward, every PR MUST pass `npm test` before it merges to `main`. Baselines in `test-fixture/baselines/phase-<N>/` lock each phase's structural state; if a PR introduces drift, re-lock explicitly (see `test-fixture/baselines/phase-6/README.md` for the re-lock procedure) rather than relaxing the test.

## Distribution

**Ships with the plugin:**
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — manifest
- `SKILL.md` — root pipeline router
- `skills/` — stage skills (scan, discover, plan, design, verify, style, darkmode, compare)
- `agents/` — 22 specialized agent specs
- `connections/` — Figma, Refero, Pinterest, Claude Design connection specs
- `reference/` — curated design reference material
- `hooks/`, `scripts/bootstrap.sh`

**Dev-only (gitignored, not distributed):**
- `.planning/` — GSD planning artifacts
- `.claude/memory/` — session-level memory
- `.claude/settings.local.json`

## Develop locally

```bash
claude --plugin-dir ./get-design-done
/reload-plugins
claude plugin validate .
```

## Uninstall

```bash
claude plugin uninstall get-design-done@get-design-done
```

## License

MIT.
