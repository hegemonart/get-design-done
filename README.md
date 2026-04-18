<div align="center">

# GET DESIGN DONE

**Agent-orchestrated design pipeline for Claude Code. Five stages, thirty specialized agents, nine tool connections — from brief to verified shipping work.**

**Solves the "Claude made it look fine but nothing ties together" problem: no design system extraction, no reference grounding, no verification against the brief.**

[![npm version](https://img.shields.io/npm/v/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/get-design-done/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Plugin](https://img.shields.io/badge/plugin-v1.0.7-blue?style=for-the-badge)](https://github.com/hegemonart/get-design-done/releases/tag/v1.0.7)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

<br>

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

**Works on macOS, Linux, and Windows. Requires Claude Code + Node 22/24.**

<br>

*"Claude ships code fast. Get Design Done makes sure it ships design."*

<br>

[Why I Built This](#why-i-built-this) · [How It Works](#how-it-works) · [Commands](#commands) · [Connections](#connections) · [Why It Works](#why-it-works)

</div>

---

> [!IMPORTANT]
> ### Already have a Claude Design bundle?
>
> If you exported a design from [claude.ai/design](https://claude.ai/design), you can skip Stages 1–3 entirely:
>
> ```
> /gdd:handoff ./my-design.html
> ```
>
> This parses the bundle's CSS custom properties into D-XX design decisions, runs the verification pass with Handoff Faithfulness scoring, and optionally writes implementation status back to Figma. Full format at [`connections/claude-design.md`](connections/claude-design.md).

---

## Why I Built This

I'm a designer who ships with Claude Code. The code-side workflow (GSD, Speckit, BMAD) is mature. The design-side workflow is not.

What I kept running into: Claude happily generates UI, but the output is *disconnected*. Tokens don't match the existing system. Contrast ratios silently drift below WCAG. Hierarchy gets reinvented per screen. Anti-patterns from old stacks leak into new ones. And none of it is caught until the PR review, because nothing verified the output against the original design brief.

So I built Get Design Done. Same philosophy as GSD — **the complexity is in the system, not in your workflow**. Behind the scenes: thirty specialized agents, a queryable intel store, tier-aware model routing, connection probes across Figma/Refero/Pinterest/Storybook/Chromatic/Graphify/Preview, and a self-improvement loop that tunes itself from measured telemetry. What you see: a few commands that just work.

The pipeline does the work *and* verifies it. I trust the workflow. It gets design done.

— **Hegemon**

---

Design-side vibecoding has the same failure mode as code-side vibecoding: describe what you want, AI generates something, it looks plausible, it falls apart at scale because nothing tied the output back to the brief.

Get Design Done fixes that. It's the context engineering layer for design work in Claude Code. Capture the brief, inventory the system, ground in real references, decompose into atomic design tasks, verify against the brief — then ship.

---

## Who This Is For

Anyone shipping UI with Claude Code who expects the output to actually hold up — engineers, designers, design-engineers, solo founders. If you care that tokens match, contrast passes WCAG, and the result ties back to what you asked for, this is for you.

You don't need to be a designer. The pipeline carries the design expertise so you don't have to — it extracts the system, grounds in references, verifies against the brief, and catches the things people usually miss.

Built-in quality gates catch real problems: Handoff Faithfulness scoring on Claude Design bundles, contrast audits across the full palette × surface matrix, anti-pattern detection from the NNG catalog, dark-mode architecture verification, and motion-system consistency checks.

### v1.0.7 Highlights

- **Full CI/CD pipeline** — Five-job GitHub Actions matrix (lint → validate → test → security + size-budget) across Node 22/24 × Linux/macOS/Windows. Blocking markdownlint, link checker, JSON schema validation, frontmatter validator, stale-ref detector, shellcheck, gitleaks, injection scanner, agent size-budget enforcement. Release automation auto-tags and publishes GitHub Releases on manifest version bumps.
- **Self-improvement loop** — The `design-reflector` agent reads cycle telemetry and proposes concrete improvements: frontmatter tuning, reference additions, budget adjustments, question pruning, and global-skill promotion to `~/.claude/gdd/global-skills/`. Nothing auto-applies — you review and accept each proposal via `/gdd:apply-reflections`.
- **Cost optimization layer** — `gdd-router` + `gdd-cache-manager` + `budget-enforcer` hook + tier-aware agent frontmatter + lazy checker gates + streaming synthesizer. Target: 50–70% per-task token-cost reduction versus pre-layer baseline, with no regression on the design-quality floor.

---

## Getting Started

### Option A — Claude Code marketplace (recommended)

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

### Option B — npm / pnpm

Published as a scoped package. Works with any npm-compatible client:

```bash
npm  install -g @hegemonart/get-design-done
pnpm add     -g @hegemonart/get-design-done
```

Either path installs the pipeline skill and triggers a `SessionStart` bootstrap hook, which provisions the companion reference library `~/.claude/libs/awesome-design-md` on first run (idempotent — subsequent sessions run `git pull --ff-only`).

Verify with:

```
/gdd:help
```

> [!TIP]
> Run Claude Code with `--dangerously-skip-permissions` for the intended frictionless flow. GDD is built for autonomous multi-stage execution; approving every file read and `git commit` defeats the purpose.

---

## How It Works

> **New to the codebase?** Run `/gdd:map` first. It spawns 5 parallel specialist mappers (tokens, components, visual hierarchy, a11y, motion) and writes `.design/map/` — rich structured data the Explore stage consumes, much better than the grep-based fallback.

### 1. Brief

```
/gdd:brief
```

One command captures the design problem before any scanning or exploration. The skill asks five questions via `AskUserQuestion` — one at a time, only for unanswered sections:

1. **Problem** — The user-facing outcome you're solving
2. **Audience** — Primary user, device, context
3. **Constraints** — Tech stack, brand, time, a11y requirements
4. **Success Metrics** — How you'll know it worked
5. **Scope** — What's in, what's out

You approve the brief. Now the rest of the pipeline has something to verify against.

**Creates:** `.design/BRIEF.md`

---

### 2. Explore

```
/gdd:explore
```

**Unified inventory + interview.** (The old `scan` and `discover` commands are deprecated aliases that route here.)

The skill probes connection availability (Figma, Refero, Pinterest, Preview, Storybook, Chromatic, Graphify, Figma Writer, Claude Design), then:

1. **Inventory scan** — If `.design/map/` exists and is fresher than `src/`, consumes the structured map output. Otherwise runs a grep-based inventory pass
2. **Design interview** — Spawns `design-discussant`, which runs an adaptive interview grounded in the brief and what it found in the code
3. **Baseline audit** — Writes `DESIGN.md` (current state), `DESIGN-DEBT.md` (known gaps), and `DESIGN-CONTEXT.md` (decisions + architectural responsibility map + Mermaid flow diagram)

The deeper you engage in the interview, the more the downstream planner and executors build *your* vision rather than reasonable defaults.

**Creates:** `DESIGN.md`, `DESIGN-DEBT.md`, `DESIGN-CONTEXT.md`

---

### 3. Plan

```
/gdd:plan
```

The skill:

1. **Researches** — `design-phase-researcher` investigates how to implement, guided by `DESIGN-CONTEXT.md` decisions. Consults Graphify knowledge graph when available, so dependency queries are O(1) instead of grep-based guessing
2. **Plans** — `design-planner` decomposes into atomic tasks, annotates with Chromatic change-risk and Storybook component fan-out
3. **Verifies** — `design-plan-checker` validates the plan against the brief and context, loops until it passes

Each task is small enough to execute in a fresh context window. No degradation, no abbreviated outputs.

**Creates:** `DESIGN-PLAN.md`

---

### 4. Design

```
/gdd:design
```

The skill runs the plan. For each task:

1. **Fresh context per task** — Full context budget for implementation, zero accumulated garbage
2. **Tier-aware routing** — Each agent carries a `default-tier` frontmatter field (haiku/sonnet/opus); the router + `budget.json` override determine actual tier per spawn. Cheap work runs on Haiku; precise work on Opus
3. **Atomic commits per task** — Every task gets its own commit, keeping git history surgical
4. **Streaming synthesizer** — Parallel-agent outputs collapse through a single Haiku call before returning to main context, so the orchestrator stays cache-aligned

Walk away, come back to completed work with a clean commit history.

**Creates:** `DESIGN-SUMMARY.md`, plus per-task commits

---

### 5. Verify

```
/gdd:verify
```

**This is where the pipeline proves the output matches the brief.**

The skill spawns four agents in sequence, each with cheap-gate precursors:

1. **`design-verifier`** — Scores output against brief + context + plan. Runs Phase 4B visual evidence via Preview (Playwright screenshots) when available, plus Chromatic delta narration on the visual regression diff
2. **`design-auditor`** — Runs the NNG heuristic sweep, WCAG contrast pass across the full palette × surface matrix, typography system audit, motion framework audit, and anti-pattern detector
3. **`design-integration-checker`** — Cross-file consistency: token naming, component taxonomy, visual hierarchy, a11y labels
4. **`design-fixer`** — Proposes fixes for each gap, scoped and prioritized

If handoff mode (`/gdd:verify --post-handoff` or `/gdd:handoff <bundle>`), an additional **Handoff Faithfulness** section scores color / typography / spacing / component-structure adherence with PASS/WARN/FAIL thresholds.

**Creates:** `DESIGN-VERIFICATION.md`

---

### 6. Ship → Reflect → Next Cycle

```
/gdd:ship                    # Clean PR branch + gh pr create
/gdd:reflect                 # Post-cycle improvement proposals
/gdd:apply-reflections       # Review + selectively apply proposals
/gdd:complete-cycle          # Archive cycle to .design/archive/cycle-N/
/gdd:new-cycle               # Start next cycle with fresh STATE.md
```

Or let the router figure out the next step:

```
/gdd:next                    # Auto-detect state and run the next step
```

Loop **brief → explore → plan → design → verify → ship** per cycle. Each cycle reflects on itself and proposes improvements to the system — frontmatter estimates, tier assignments, reference additions, budget caps, question pruning, global-skill promotion. You decide what to accept.

---

### Standalone commands (no pipeline init required)

```
/gdd:handoff <bundle.html>   # Skip scan/discover/plan, route direct to verify
/gdd:style Button            # Generate component handoff doc
/gdd:darkmode                # Audit dark mode architecture + contrast
/gdd:compare                 # Delta between baseline and verification
/gdd:sketch                  # Multi-variant HTML exploration
/gdd:spike                   # Timeboxed feasibility experiment
/gdd:figma-write <mode>      # Write decisions back to Figma
/gdd:graphify <subcommand>   # Manage Graphify knowledge graph
```

---

## Why It Works

### Context Engineering

Claude Code does great design work *if* you give it the context it needs. Most workflows don't. GDD handles the context layer for you:

| File | What it does |
|------|--------------|
| `.design/BRIEF.md` | Problem, audience, constraints, metrics, scope — the verification target |
| `.design/DESIGN.md` | Current-state inventory: tokens, components, hierarchy, a11y, motion |
| `.design/DESIGN-DEBT.md` | Known gaps and technical-design debt |
| `.design/DESIGN-CONTEXT.md` | D-XX decisions, architectural responsibility map, Mermaid flow diagram |
| `.design/DESIGN-PLAN.md` | Atomic tasks with Touches:, Chromatic risk, Storybook fan-out |
| `.design/DESIGN-SUMMARY.md` | What happened per task, committed to history |
| `.design/DESIGN-VERIFICATION.md` | Scored audit against brief + context + plan |
| `.design/STATE.md` | Position, connections, handoff source, decisions — memory across sessions |
| `.design/intel/` | 10 queryable JSON slices: files, exports, symbols, tokens, components, patterns, dependencies, decisions, debt, cross-reference graph |
| `.design/CYCLES.md` | Cycle lifecycle + archived cycles in `.design/archive/` |

Size budgets are tiered per agent (XXL: 700, XL: 500, Large: 300, Default: 200 lines). Stay under, get consistent output. The `agent-size-budget` CI job blocks violations.

### 30 Specialized Agents

Every stage uses the same pattern: a thin orchestrator skill spawns specialized agents, collects results, routes to the next step.

| Stage | Orchestrator does | Agents do |
|-------|------------------|-----------|
| Brief | Runs interview, writes BRIEF.md | — |
| Map | Coordinates parallel spawn | 5 mappers investigate tokens, components, visual hierarchy, a11y, motion |
| Explore | Probes connections, runs inventory | `design-context-builder` + `design-context-checker` gate → full checker |
| Plan | Validates, manages iteration | `design-phase-researcher`, `design-planner`, `design-plan-checker` loop |
| Design | Dispatches tasks | `design-executor` per task, streaming-synthesizer merge |
| Verify | Presents results, routes fixes | `design-verifier`, `design-auditor`, `design-integration-checker`, `design-fixer` (each with cheap Haiku gate precursor) |
| Post-cycle | Review proposals | `design-reflector` reads telemetry + learnings, proposes improvements |

All agents carry `default-tier: haiku|sonnet|opus` + `tier-rationale` in frontmatter. Every agent opens with `@reference/shared-preamble.md` so the first agent in a session pays full cost and the rest ride Anthropic's 5-minute prompt cache.

### 8 Tool Connections

Every connection is optional. The pipeline degrades gracefully — a grep-based fallback exists for every missing tool.

| Connection | Type | Purpose |
|-----------|------|---------|
| Figma | MCP (`mcp__figma__*`, remote) | Token extraction, design context pre-population, write-back via `use_figma` (annotate, tokenize, Code Connect) |
| Refero | MCP (`mcp__refero__*`) | Reference design search during exploration |
| Pinterest | MCP (`mcp__mcp-pinterest__*`) | Visual inspiration boards alongside Refero |
| Preview (Playwright) | MCP (`mcp__Claude_Preview__*`) | Live page screenshots for visual verification |
| Storybook | HTTP (`localhost:6006`) | Component inventory, a11y per story, story stubs |
| Chromatic | CLI (`npx chromatic`) | Visual regression delta narration and change-risk scoping |
| Graphify | CLI (`graphify`) | Knowledge graph: component↔token↔decision relationships |
| Claude Design | Bundle adapter | Parse HTML export → D-XX decisions, Handoff Faithfulness scoring |

See [`connections/connections.md`](connections/connections.md) for the full index and capability matrix.

### Atomic Git Commits

Each task gets its own commit immediately after completion:

```bash
abc123f docs(cycle-1): DESIGN-CONTEXT.md decisions locked
def456g feat(cycle-1): unify button tokens across surfaces
hij789k feat(cycle-1): fix dark-mode contrast on CardMuted
lmn012o feat(cycle-1): motion tokens for modal presentation
```

> [!NOTE]
> **Benefits:** `git bisect` finds the exact task that broke contrast. Each task is independently revertable via `/gdd:undo`. Clear history for Claude in future sessions. `/gdd:pr-branch` strips `.design/` and `.planning/` commits for a clean code-review branch.

### Self-Improvement

After each design cycle, `/gdd:reflect` reads `.design/learnings/`, `.design/telemetry/costs.jsonl`, and `.design/agent-metrics.json` and proposes concrete improvements:

- **Frontmatter updates** — agent duration estimates and tier assignments from measured data
- **Reference additions** — anti-patterns and heuristics that appeared ≥3 cycles
- **Budget adjustments** — cost caps tuned from actual spend patterns
- **Question pruning** — discussant questions that consistently got low-value answers
- **Global skill promotion** — project findings promoted to `~/.claude/gdd/global-skills/` for cross-project use

**Nothing auto-applies.** Every proposal requires explicit review via `/gdd:apply-reflections` — diff, accept, skip, or edit each one. The discipline mirrors the `design-figma-writer` proposal→confirm pattern.

---

## Authority Watcher

Subscribe to a curated whitelist of design-authority sources, diff it against a snapshot, and feed only genuinely new, classified entries into the Self-Improvement reflector. Authority monitoring — not trend watching.

```bash
# On-demand diff + classify
/gdd:watch-authorities

# Force re-seed the snapshot (recovery for a corrupted snapshot)
/gdd:watch-authorities --refresh

# Surface backlog since a specific date
/gdd:watch-authorities --since 2026-01-01

# Limit to a single feed (debugging)
/gdd:watch-authorities --feed wai-aria-apg

# Schedule recurring runs (requires the scheduled-tasks MCP)
/gdd:watch-authorities --schedule weekly
```

### What the whitelist covers

See [`reference/authority-feeds.md`](reference/authority-feeds.md). 26 curated feeds grouped by kind:

- **Spec sources** — WAI-ARIA APG, Material 3, Apple HIG, Fluent 2, W3C Design Tokens CG
- **Component systems** — Radix, shadcn/ui, Polaris, Carbon, Primer, Atlassian, Ant, Mantine
- **Research institutions** — Nielsen Norman Group, Laws of UX, Baymard
- **Named practitioners** — 10 writers filtered for spec-adjacent, durable, original analysis
- **User-added Are.na channels** — extensibility point; add your own via a PR to the Are.na section, no config file or schema editing required

### What is explicitly rejected

No Dribbble. No Behance. No LinkedIn. No generic "trending" aggregators. See `reference/authority-feeds.md` §"Rejected kinds" — enforced structurally by `scripts/tests/test-authority-rejected-kinds.sh`, which greps the active whitelist for rejected hostnames and fails CI on any match. The anti-slop thesis is a test, not a comment.

### How the report feeds reflection

The watcher writes `.design/authority-report.md` — new entries classified into five buckets (`spec-change`, `heuristic-update`, `pattern-guidance`, `craft-tip`, `skip`) with a one-sentence rationale each. `/gdd:reflect` reads the report alongside internal telemetry and proposes reference-file updates. Nothing auto-ships — you review every proposal via `/gdd:apply-reflections`.

---

## Commands

All commands use the `/gdd:` namespace.

### Core pipeline

| Command | What it does |
|---------|--------------|
| `/gdd:brief` | Stage 1 — problem, audience, constraints, metrics, scope |
| `/gdd:explore [--skip-interview] [--skip-scan]` | Stage 2 — inventory scan + design interview |
| `/gdd:plan` | Stage 3 — research + decompose into atomic tasks + verify plan |
| `/gdd:design` | Stage 4 — execute tasks with fresh context per task |
| `/gdd:verify [--post-handoff]` | Stage 5 — verifier + auditor + integration checker + fixer |
| `/gdd:handoff <bundle>` | Skip scan/discover/plan, route direct to verify from Claude Design bundle |
| `/gdd:next` | Auto-detect pipeline state and run next step |
| `/gdd:map` | Parallel codebase mapping — 5 specialist mappers |

### Lifecycle

| Command | What it does |
|---------|--------------|
| `/gdd:new-project [--name]` | Initialize project — PROJECT.md + STATE.md + cycle-1 |
| `/gdd:new-cycle [<goal>]` | Start new design cycle |
| `/gdd:complete-cycle [<note>]` | Archive cycle to `.design/archive/cycle-N/` |
| `/gdd:ship [--draft]` | Clean PR branch + `gh pr create` |

### Standalone

| Command | What it does |
|---------|--------------|
| `/gdd:style [ComponentName]` | Generate component handoff doc |
| `/gdd:darkmode` | Audit dark mode architecture + contrast |
| `/gdd:compare` | Delta between DESIGN.md baseline and DESIGN-VERIFICATION.md |
| `/gdd:figma-write <mode>` | Write decisions back to Figma (annotate/tokenize/mappings) |
| `/gdd:graphify <subcommand>` | Manage Graphify knowledge graph (build/query/status/diff) |
| `/gdd:sketch [topic] [--variants N]` | Multi-variant HTML exploration |
| `/gdd:spike [hypothesis] [--timebox]` | Timeboxed feasibility experiment |
| `/gdd:sketch-wrap-up`, `/gdd:spike-wrap-up` | Distill winner + findings into project-local convention skills |

### Audit & Self-Improvement

| Command | What it does |
|---------|--------------|
| `/gdd:audit [--retroactive] [--quick]` | Wraps verifier + auditor + reflector |
| `/gdd:reflect [--dry-run] [--cycle]` | On-demand post-cycle reflection |
| `/gdd:apply-reflections [--filter]` | Review + selectively apply reflection proposals |
| `/gdd:optimize` | Emit cost-optimization recommendations from telemetry |
| `/gdd:warm-cache` | Pre-warm common agent prompts for prompt cache |

### Knowledge Layer

| Command | What it does |
|---------|--------------|
| `/gdd:analyze-dependencies [--slice]` | Token fan-out, component call-graph, decision traceability, circular dep detection |
| `/gdd:extract-learnings [--cycle]` | Extract decisions, lessons, patterns, surprises → LEARNINGS.md |
| `/gdd:skill-manifest [--refresh]` | Browse all registered skills + agents from intel store |

### Execution speed

| Command | What it does |
|---------|--------------|
| `/gdd:quick [--skip <agent>] [stage]` | Run pipeline skipping optional agents for speed |
| `/gdd:fast <task>` | Trivial inline task — no subagents, no pipeline, no artifacts |
| `/gdd:do <natural language>` | Natural-language router — parses intent, confirms, dispatches |
| `/gdd:discuss [topic] [--all]` | Adaptive design interview — appends D-XX decisions to STATE.md |

### Idea capture

| Command | What it does |
|---------|--------------|
| `/gdd:note <add\|list\|promote> [text]` | Zero-friction notes → NOTES.md |
| `/gdd:plant-seed [--trigger] [text]` | Forward-looking idea with trigger condition |
| `/gdd:add-backlog [text]` | Park an idea in backlog |
| `/gdd:review-backlog` | Promote or archive parked items |
| `/gdd:todo <add\|list\|pick>` | Design-scoped todo list |

### Session

| Command | What it does |
|---------|--------------|
| `/gdd:pause [context]` | Write session handoff to `.design/HANDOFF.md` |
| `/gdd:resume` | Restore context and route to next step |
| `/gdd:progress [--forensic]` | Pipeline position + recommended next action |
| `/gdd:health` | Artifact health report for `.design/` |
| `/gdd:stats` | Cycle metrics — decisions, commits, todos |
| `/gdd:help` | Full command list |

### Safety

| Command | What it does |
|---------|--------------|
| `/gdd:undo [<sha>]` | Safe revert with dependency check |
| `/gdd:pr-branch [<base>]` | Strip `.design/` + `.planning/` commits for clean code-review branch |
| `/gdd:debug [<symptom>]` | Symptom-driven design investigation with persistent state |
| `/gdd:list-assumptions [--area]` | Surface implicit design assumptions baked into the codebase |

### Configuration

| Command | What it does |
|---------|--------------|
| `/gdd:settings <profile\|parallelism\|cleanup\|show>` | Manage `.design/config.json` |
| `/gdd:update [--dry-run]` | Update plugin to latest release |
| `/gdd:reapply-patches [--dry-run]` | Reapply `reference/` customizations after an update |

Full command reference with argument specs: [`SKILL.md`](SKILL.md).

---

## Connections

All connections are optional — the pipeline degrades gracefully when any connection is unavailable.

### Figma MCP (reads + writes)

One remote MCP covers both reads and writes as of v1.0.7.1. When it is active, `explore` reads Figma variables and pre-populates design decisions from your file, and `design-figma-writer` writes decisions back via `use_figma` — annotates frames, tokenizes local styles, registers Code Connect mappings. Proposal → confirm discipline with `--dry-run` and `--confirm-shared` guards. Falls back to code-only analysis when the MCP is not configured. One install command unlocks both:

```
claude mcp add figma --transport http https://mcp.figma.com/v1/sse
```

Setup: [`connections/figma.md`](connections/figma.md). If you previously installed the local `figma-desktop` MCP, you can remove it — its read tools are now exposed on the remote server.

### Refero MCP

When Refero is active, `explore` pulls visual references to ground design decisions. Requires an API token in `~/.claude.json`:

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

Falls back to `~/.claude/libs/awesome-design-md/`. Setup: [`connections/refero.md`](connections/refero.md).

### Pinterest MCP

When the Pinterest MCP (`terryso/mcp-pinterest`) is active, `explore` pulls visual inspiration boards alongside Refero. ToolSearch-only probe — no API key required. Fallback chain: Pinterest → Refero → awesome-design-md. Setup: [`connections/pinterest.md`](connections/pinterest.md).

### Preview (Playwright)

When the Claude Preview MCP is active, `verify` runs live page screenshots on `? VISUAL` verification gaps, so the auditor grades actual rendered output rather than inferring from code. Setup: [`connections/preview.md`](connections/preview.md).

### Storybook

When Storybook is running on `localhost:6006`, `explore` pulls component inventory, `verify` runs per-story a11y passes, and `design` can generate `.stories.tsx` stubs. Setup: [`connections/storybook.md`](connections/storybook.md).

### Chromatic

When Chromatic CLI is available, `plan` uses `--trace-changed=expanded` for change-risk scoping and `verify` narrates visual regression deltas. Setup: [`connections/chromatic.md`](connections/chromatic.md).

### Graphify

When Graphify CLI is available, `plan` and `design-integration-checker` consult the component↔token↔decision knowledge graph before grep searches — dependency queries become O(1). Setup: [`connections/graphify.md`](connections/graphify.md).

### Claude Design

Drop a Claude Design bundle (HTML export from [claude.ai/design](https://claude.ai/design)) into your project root and run `/gdd:handoff <path>`. The pipeline skips Scan → Discover → Plan, parses the bundle CSS custom properties into D-XX design decisions, runs `verify --post-handoff` for Handoff Faithfulness scoring, and optionally writes implementation status back to Figma. Full format: [`connections/claude-design.md`](connections/claude-design.md).

---

## Configuration

GDD stores project settings in `.design/config.json`. Configure via `/gdd:settings` or edit directly.

### Core

| Setting | Options | Default | What it controls |
|---------|---------|---------|------------------|
| `mode` | `yolo`, `interactive` | `interactive` | Auto-approve vs confirm at each step |
| `profile` | `quality`, `balanced`, `budget`, `inherit` | `balanced` | Model tier policy (see below) |
| `parallelism` | `aggressive`, `conservative`, `off` | `conservative` | Wave parallelism for `design` stage |

### Model profiles

Each agent carries a `default-tier: haiku|sonnet|opus` in frontmatter. The active profile + `tier_overrides` in `budget.json` determine actual tier per spawn.

| Profile | Planning | Execution | Verification |
|---------|----------|-----------|--------------|
| `quality` | Opus | Opus | Sonnet |
| `balanced` (default) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | Inherit | Inherit | Inherit |

Use `inherit` when using non-Anthropic providers or to follow the current runtime model selection.

### Budget + optimization

`.design/budget.json` controls the cost layer:

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

`enforcement_mode`: `enforce` (hard-block on cap breach) | `warn` (warn + continue) | `log` (silent log). Use `log` during adoption to observe the hook's decisions without blocking.

Full schema: [`reference/config-schema.md`](reference/config-schema.md).

---

## Knowledge Layer

The knowledge layer gives the pipeline persistent memory and O(1) lookups across all design surface files.

### Intel store (`.design/intel/`)

Ten queryable JSON slices that index the design surface:

| Slice | Contents |
|-------|----------|
| `files.json` | All tracked files with mtime + git hash |
| `exports.json` | Named exports: skill commands + agent names |
| `symbols.json` | Markdown headings + section anchors |
| `tokens.json` | Design token references (color, spacing, typography, radius) |
| `components.json` | Component names + referencing files |
| `patterns.json` | Design pattern classifications by concern |
| `dependencies.json` | @-reference and reads-from relationships |
| `decisions.json` | Architectural decisions from DESIGN-CONTEXT.md |
| `debt.json` | Design debt items from DESIGN-DEBT.md |
| `graph.json` | Cross-reference graph: nodes + edges |

Build the intel store:

```bash
node scripts/build-intel.cjs --force
```

Incremental updates fire automatically via the `gdd-intel-updater` agent after file edits.

### Context exhaustion hook

`hooks/context-exhaustion.js` auto-records a `<paused>` resumption block in `.design/STATE.md` when session context reaches 85%. Run `/gdd:resume` in the next session to restore context.

---

## Optimization Layer

Every `/gdd:*` command and agent spawn passes through a cross-cutting optimization layer. Target: **50–70% per-task token-cost reduction** vs the pre-optimization baseline, with no regression on the design-quality floor.

- **`gdd-router` skill** — First-step intent router. Returns `{path: fast|quick|full, model_tier_overrides, estimated_cost_usd, cache_hits}`. Cheap Haiku call; gates every downstream spawn.
- **`gdd-cache-manager` skill + `/gdd:warm-cache`** — Maintains `.design/cache-manifest.json` and pre-warms common agent system prompts so Anthropic's 5-min prompt cache fires on the shared preamble.
- **`budget-enforcer` PreToolUse hook** — Intercepts every `Agent` spawn. Hard-blocks on cap breach (actionable error), auto-downgrades at 80% soft-threshold, short-circuits on cache hit. Without the hook, optimization is advisory; with it, violations are impossible.
- **Lazy checker gates** (`design-verifier-gate`, `design-integration-checker-gate`, `design-context-checker-gate`) — Cheap Haiku heuristic decides whether to spawn the expensive full checker.
- **Streaming synthesizer** (`skills/synthesize/`) — N parallel-mapper outputs collapse through a single Haiku call before returning to main context.
- **Cost telemetry** — `.design/telemetry/costs.jsonl` appends one row per spawn decision: `{ts, agent, tier, tokens_in, tokens_out, cache_hit, est_cost_usd, cycle, phase}`. Aggregated to `.design/agent-metrics.json`. Consumed by `/gdd:optimize` and `design-reflector`.

CI diffs against a locked cost baseline on every push to catch regressions.

---

## Testing & CI

GDD ships with a locked test suite. Every push and PR runs a five-job pipeline across a cross-platform matrix — Node 22/24 × Linux/macOS/Windows.

### Run tests locally

```bash
npm test
```

Zero third-party test dependencies — the runner is Node's built-in `node:test` + `node:assert/strict`.

### CI pipeline

```
lint → validate → test (matrix) → security + size-budget
```

- **Lint** — `markdownlint-cli2@0.13.0` (pinned), link checker via `lycheeverse/lychee-action@v2` (blocking)
- **Validate** — JSON schema validation (`plugin.schema.json`, `marketplace.schema.json`, `hooks.schema.json`, `config.schema.json`, `intel.schema.json`), agent frontmatter validator, stale-ref detector (fails on any `/design:*` legacy namespace or deprecated agent/stage names), `claude plugin validate .`
- **Test** — Node 22/24 × Linux/macOS/Windows, fail-fast disabled
- **Security** — `ludeeus/action-shellcheck@master` on `scripts/`, `gitleaks/gitleaks-action@v2` secrets scan with `.gitleaks.toml` allowlist, injection scanner over all shipped reference/skills/agents
- **Size-budget** — Blocking tier enforcement (XXL: 700, XL: 500, Large: 300, Default: 200 lines) with actionable override guidance

### What's covered

- **Agent hygiene** — frontmatter completeness, line-count tier budgets, required-reading path validity, `/gdd:` namespace consistency
- **System contracts** — config schema, command↔skill parity, hooks integrity, atomic writes to `.design/STATE.md`, frontmatter parser edge cases, model-profile resolution, `/gdd:health` output shape, worktree safety, semver bump sequence, STATE-TEMPLATE drift
- **Pipeline + data** — end-to-end smoke on `test-fixture/`, mapper JSON-schema validation (tokens, components, a11y, motion, hierarchy), parallelism-engine decision table, `Touches:` field parsing, cycle lifecycle, `.design/intel/` incremental-update correctness, regression-baseline drift detector
- **Feature correctness** — `/gdd:sketch` variant determinism, 8-connection probe contracts with mocked MCPs, `design-figma-writer` dry-run discipline, `design-reflector` proposal-only shape, deprecated-name redirects, NNG heuristic coverage, injection-scanner hook behavior, optimization-layer schema enforcement

### Release automation

`.github/workflows/release.yml` auto-tags and publishes a GitHub Release when `.claude-plugin/plugin.json` version changes. Release body is extracted from the matching `CHANGELOG.md` section. A release-time smoke test diffs a fresh checkout against a locked baseline before the release publishes.

Every PR must pass `npm test` before merging to `main`. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the re-lock procedure when baselines change.

---

## What ships with the plugin

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — manifest
- `SKILL.md` — root pipeline router
- `skills/` — 55 stage + standalone skills
- `agents/` — 30 specialized agent specs
- `connections/` — 9 connection specs
- `reference/` — curated design reference (shared preamble, model tiers, model prices, schemas, DEPRECATIONS, config schema)
- `hooks/`, `scripts/bootstrap.sh`

---

## Develop locally

```bash
git clone https://github.com/hegemonart/get-design-done.git
cd get-design-done
npm ci
npm test
claude --plugin-dir ./
```

From inside Claude Code:

```
/reload-plugins
claude plugin validate .
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch strategy, PR checklist, required checks, and baseline re-lock procedure.

---

## Troubleshooting

**Commands not found after install?**
- Restart Claude Code to reload commands/skills
- Verify files exist in `~/.claude/plugins/marketplaces/hegemonart/get-design-done/` or the npm install path
- Run `/gdd:help` to list registered commands

**Pipeline stuck or artifacts missing?**
```
/gdd:health
/gdd:progress --forensic
```
The forensic mode runs a 6-check integrity audit — stale artifacts, dangling decisions, unfinished handoffs, orphan cycles, schema drift, injection-scanner warnings.

**Want to see what the router and budget-enforcer are doing?**
Set `enforcement_mode: "log"` in `.design/budget.json` — the hook writes every decision to `.design/telemetry/costs.jsonl` without blocking.

**Updating to the latest version?**
```
/gdd:update
```
Previews the changelog before applying. Local customizations in `reference/` are preserved; use `/gdd:reapply-patches` if they need re-stitching after a structural update.

### Uninstall

```bash
claude plugin uninstall get-design-done@get-design-done
```

Or, if installed via npm:

```bash
npm uninstall -g @hegemonart/get-design-done
```

This removes all GDD skills, agents, hooks, and settings while preserving your other configurations and your `.design/` project artifacts.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Claude Code is powerful. Get Design Done makes it ship design.**

</div>
