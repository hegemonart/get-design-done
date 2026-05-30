<div align="center">

# GET DESIGN DONE

**English** · [简体中文](docs/i18n/README.zh-CN.md) · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [Français](docs/i18n/README.fr.md) · [Italiano](docs/i18n/README.it.md) · [Deutsch](docs/i18n/README.de.md)

**A design-quality pipeline for AI coding agents: brief → explore → plan → implement → verify.**

**Get Design Done keeps AI-generated UI tied to your brief, your design system, your references, and your quality gates. Works with Claude Code, OpenCode, Gemini CLI, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, and Cline.**

[![npm version](https://img.shields.io/npm/v/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/get-design-done/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/get-design-done?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/get-design-done)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

<br>

```bash
npx @hegemonart/get-design-done@latest
```

**Works on macOS, Linux, and Windows.**

<br>

*"AI coding agents ship UI fast. Get Design Done makes sure it ships as design."*

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
> Parses the bundle's CSS custom properties into D-XX design decisions, runs the verification pass with Handoff Faithfulness scoring, and optionally writes implementation status back to Figma.

---

## Why I Built This

I'm a designer who ships with AI coding agents. The code-side workflow is mature: specs, tasks, tests, commits, review loops. The design-side workflow was not.

What I kept running into: the agent could generate a screen that looked fine in isolation, but the work was disconnected. Tokens did not match the existing system. Contrast ratios drifted below WCAG. Hierarchy got reinvented per screen. Old anti-patterns leaked into new components. And because nothing verified the output against the original brief, the problems usually surfaced late, in PR review or after handoff.

So I built Get Design Done: a design pipeline that gives AI coding agents the same kind of structure developers already expect from engineering workflows. It captures the brief, maps the current design system, grounds decisions in references, decomposes the work into atomic tasks, executes those tasks, and verifies the result before you ship.

Behind the scenes: 37 specialized agents, a queryable intel store, tier-aware model routing, 12 optional tool connections, atomic commits, and a no-regret adaptive layer that learns from solidify-with-rollback outcomes. What you use day to day: a few `/gdd:*` commands that keep design work coherent.

— **Hegemon**

---

AI-generated design has the same failure mode as AI-generated code: describe what you want, get something plausible, then watch it fall apart at scale because no system tied the output back to the brief.

Get Design Done is the context engineering layer for design work. It turns "make this UI better" into a traceable cycle: brief → inventory → references → plan → implementation → verification.

---

## What You Get

- **Brief-grounded design work** — every cycle starts with the problem, audience, constraints, success metrics, and must-haves.
- **Design-system extraction** — GDD inventories tokens, typography, spacing, components, motion, accessibility, dark mode, and design debt before planning changes.
- **Reference-backed decisions** — agents use embedded design references plus optional Figma, Refero, Pinterest, Storybook, Chromatic, Preview, Claude Design, paper.design, pencil.dev, Graphify, 21st.dev Magic, and Magic Patterns connections.
- **Atomic execution** — design tasks are decomposed by dependency, run in safe waves, and committed independently.
- **Verification before shipping** — audits check brief fit, token integration, WCAG contrast, component conformance, motion consistency, dark-mode architecture, and design anti-patterns.
- **Rollback on failed validation** — solidify-with-rollback validates each task before it sticks; failed work is automatically reverted.

---

## Who This Is For

GDD is for engineers, designers, design engineers, founders, and product builders who ship UI with AI coding agents and need the result to hold together beyond the first screenshot.

Use it when you care that tokens match, contrast passes WCAG, motion feels cohesive, components follow your system, and the final implementation still matches what you asked for.

You do not need to be a designer to benefit from it. The pipeline carries the design discipline into the agent workflow: it extracts context, asks only for missing decisions, grounds the work in references, and catches the issues people usually find too late.

### v1.27.0 Highlights — Peer-CLI Delegation Layer

Closes the **outbound** half of multi-runtime: gdd agents now OPTIONALLY delegate to local peer CLIs (Codex via App Server Protocol; Gemini/Cursor/Copilot/Qwen via Agent Client Protocol) when measurably cheaper or higher-quality for the role. Falls back to in-process Anthropic SDK when peer is unavailable. Honors v1.26.0's tier maps + v1.22.0's event chain + v1.23.5's bandit posterior — `delegate?` becomes another arm in `(agent_type × tier × delegate)` Thompson sampling.

- **ACP + ASP protocol clients** — `scripts/lib/peer-cli/{acp-client,asp-client}.cjs` ship line-delimited JSON-RPC over stdio with 16 MiB line-buffer overflow guards. ACP serves Gemini/Cursor/Copilot/Qwen; ASP serves Codex (thread-oriented, multi-turn). Protocol shapes adapted from `greenpolo/cc-multi-cli` (Apache 2.0, see `NOTICE`). Long-lived broker per `(peer, workspace)` over Unix socket / named pipe — cold-spawn cost amortized across delegated calls in a cycle.
- **5 per-peer adapters + central registry** — `scripts/lib/peer-cli/adapters/{codex,gemini,cursor,copilot,qwen}.cjs` thin-wrap the protocol clients with role→prompt-prefix maps and slash-command translation. Central dispatch via `registry.cjs#findPeerFor(role, tier)` consults the locked capability matrix (codex→execute; gemini→research/exploration; cursor→debug/plan; copilot→review/research; qwen→write).
- **`delegate_to:` agent frontmatter** — additive optional field; values are `<peer>-<role>` per matrix or `none` for explicit opt-out. Session-runner tries delegate first; transparent fallback on peer-absent OR peer-error. `peer_call_failed` event logs to `events.jsonl` for reflector telemetry. v1.27.0 ships the field but no agent in the fleet uses it yet — opt-in per agent via `/gdd:run-skill peer-cli-customize`.
- **Bandit posterior `delegate?` dimension** — Phase 23.5's `(agent_type, touches_size_bin)` arm space expands to `(agent_type, touches_size_bin, delegate)` where `delegate ∈ {none, gemini, codex, cursor, copilot, qwen}`. Existing priors carry forward as the `none` arm (no behavior change for unconfigured agents); 5 delegation arms start neutral. Reward signal unchanged (two-stage lexicographic). The bandit measures and learns which delegations actually pay off over cycles.
- **Event chain `runtime_role` + `peer_id` tags** — additive Phase 22 extension. `events.jsonl` rows optionally tag `runtime_role: "host" | "peer"` (defaults `"host"` for back-compat) and `peer_id`. 3 new event types: `peer_call_started`, `peer_call_complete`, `peer_call_failed`. costs.jsonl threads the same fields so v1.26's cross-runtime cost-arbitrage reflector extends to host-vs-peer arbitrage naturally.
- **`/gdd:peers` discoverability + skills for setup** — `/gdd:peers` shows a single-command capability matrix (peer × installed? × allowlisted? × claimed roles × posterior delta vs local). `peer-cli-customize` rewires per-agent `delegate_to:` mappings; `peer-cli-add` walks the verification ladder for adding a brand-new peer (model-ID `-preview`-suffix trap, Windows `.cmd` quirks, 3-file footprint). Install-time peer-detection helpers (`detectInstalledPeers()`) ship in `runtimes.cjs` ready for the interactive nudge (deferred to a 1.27.x patch).

See [docs/PEER-DELEGATION.md](docs/PEER-DELEGATION.md) for the ops guide (when delegation fires, fallback diagnostics, broker lifecycle, Windows quirks) and [reference/peer-protocols.md](reference/peer-protocols.md) for the ACP + ASP protocol cheat sheet.

### Previous releases

- **v1.26.0** — Headless Model Resolver (per-runtime tier→model map, `resolved_models` router field, per-runtime price tables, `reasoning-class` runtime-neutral alias).
- **v1.25.0** — Pipeline Hardening (prototype gate + STATE `<prototyping>` block, router S/M/L/XL `complexity_class`, quality-gate Stage 4.5, Stop-hook turn closeout).
- **v1.24.0** — Multi-Runtime Installer (`@clack/prompts` interactive multi-select for all 14 runtimes, idempotent + foreign-AGENTS.md-safe, scripted CI surface preserved 1:1).
- **v1.23.5** — No-Regret Adaptive Layer (Thompson sampling bandit + AdaNormalHedge ensemble + MMR rerank; single-user via informed-prior bootstrap, no opt-in telemetry).
- **v1.23.0** — SDK Domain Primitives (solidify-with-rollback gate, JSON output contracts, auto-crystallization of `Touches:` patterns).
- **v1.22.0** — SDK Observability (~24 typed event types, per-tool-call trajectory, append-only event chain, secret scrubber).
- **v1.21.0** — Headless SDK (`gdd-sdk` CLI runs full pipeline without Claude Code, parallel researchers, cross-harness MCP).
- **v1.20.0** — SDK Foundation (resilience primitives, lockfile-safe `STATE.md`, `gdd-state` MCP server with 11 typed tools, TypeScript foundation).

For full release notes see [CHANGELOG.md](CHANGELOG.md).

---

<p align="center">
  <strong>Supported by</strong>
</p>

<div align="center">
  <a href="https://www.humbleteam.com/" aria-label="Humbleteam">
    <img src="docs/assets/sponsors/humbleteam.svg" alt="Humbleteam logo" width="180">
  </a>
  <br>
  <sub>Product design partner for ambitious startups and AI products.</sub>
</div>

---

## Getting Started

```bash
npx @hegemonart/get-design-done@latest
```

The installer prompts you to choose:
1. **Runtime** — Claude Code, OpenCode, Gemini, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline, or all (interactive multi-select — pick multiple runtimes in a single session)
2. **Location** — Global (all projects) or local (current project only)

All 14 runtimes receive their native artifact layout (`skills/`, `command/`, `agents/`, or `.clinerules`) via per-runtime content converters — Claude SKILL.md sources are translated to each runtime's expected shape at install time (frontmatter pass-through, path rewrite, tool-name rewrite via the Phase 21 cross-harness maps). Architecture ported from `gsd-build/get-shit-done` (MIT — see `NOTICE`; upstream is now archived following the May 2026 $GSD token rug-pull, community continuation lives at [`open-gsd/get-shit-done-redux`](https://github.com/open-gsd/get-shit-done-redux)).

Verify with:

```
/gdd:help
```

> [!TIP]
> Run Claude Code with `--dangerously-skip-permissions` for a frictionless experience. GDD is designed for autonomous multi-stage execution — approving each Read and `git commit` defeats the purpose.

### Staying Updated

GDD ships often. Update by re-running the installer (it's idempotent — updates registered marketplace entries in place):

```bash
npx @hegemonart/get-design-done@latest
```

Or from inside Claude Code:

```
/gdd:update
```

`/gdd:update` previews the changelog before applying. Local modifications under `reference/` are preserved — if a structural update needs re-stitching, run `/gdd:reapply-patches`. When a new release lands, the SessionStart hook prints a one-line banner gated by state-machine logic so it never interrupts a running stage.

<details>
<summary><strong>Non-interactive Install (Docker, CI, Scripts)</strong></summary>

```bash
# Claude Code
npx @hegemonart/get-design-done --claude --global   # Install to ~/.claude/
npx @hegemonart/get-design-done --claude --local    # Install to ./.claude/

# OpenCode
npx @hegemonart/get-design-done --opencode --global # Install to ~/.config/opencode/

# Gemini CLI
npx @hegemonart/get-design-done --gemini --global   # Install to ~/.gemini/

# Kilo
npx @hegemonart/get-design-done --kilo --global     # Install to ~/.kilo/

# Codex
npx @hegemonart/get-design-done --codex --global    # Install to ~/.codex/

# Copilot
npx @hegemonart/get-design-done --copilot --global  # Install to ~/.copilot/

# Cursor
npx @hegemonart/get-design-done --cursor --global   # Install to ~/.cursor/

# Windsurf, Antigravity, Augment, Trae, Qwen, CodeBuddy, Cline
npx @hegemonart/get-design-done --windsurf --global
npx @hegemonart/get-design-done --antigravity --global
npx @hegemonart/get-design-done --augment --global
npx @hegemonart/get-design-done --trae --global
npx @hegemonart/get-design-done --qwen --global
npx @hegemonart/get-design-done --codebuddy --global
npx @hegemonart/get-design-done --cline --global

# All runtimes
npx @hegemonart/get-design-done --all --global

# Dry run (print diff, write nothing)
npx @hegemonart/get-design-done --dry-run

# Custom config dir (Docker, non-default Claude root)
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

</details>

<details>
<summary><strong>Alternative: Claude Code CLI</strong></summary>

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

This is what the npx installer does for you — `npx` just collapses two commands into one.

</details>

### Tier-2 Distribution Channels (v1.28.8+)

Beyond the Phase 28.7 file-drop install paths above (which remain the default and continue to work exactly as before), v1.28.8 adds three Tier-2 distribution channels for discovery-driven install:

- **agentskills.io cross-runtime portability.** Our `skills/` are spec-compliant per the [agentskills.io](https://agentskills.io) standard (lint-only path per Phase 28.8 D-13; Phase 28.5 frontmatter contract already matches the 2 required spec fields `name` + `description`; current lint score 38 PASS / 32 WARN / 0 FAIL). Runtimes that claim agentskills.io compatibility (Codex, Kilo, Augment, Hermes, Qwen) can consume our skills directly via that channel — see `.planning/research/agentskills-io-compat/<runtime>.md` for per-runtime verification reports.
- **Cursor Marketplace.** Install via Cursor's marketplace UI. Publisher application submitted to Cursor post-merge; live link pending Cursor team review approval (no published SLA) — see `docs/cursor-marketplace-field-test.md` for current status. Manifest at `.cursor-plugin/plugin.json`.
- **Codex Plugin.** Install via Codex's GitHub-URL plugin add:

  ```bash
  codex plugin marketplace add hegemonart/get-design-done
  ```

  Works today against any GitHub URL with `.codex-plugin/plugin.json`. Per Phase 28.8 D-14: catalog discovery reuses `.claude-plugin/marketplace.json` — no separate Codex catalog file required.

Tier-1 file-drop paths above and Tier-2 channels here are **additive opt-in** — both work independently per Phase 28.8 D-05 backward-compat discipline.

### Capability-Gap Telemetry + Self-Authoring (v1.29.0+)

The reflector loop now tracks "capability lookup failed" signals as first-class telemetry and — once enough recurring gaps surface — can draft new agents or skills as proposals for your review.

**Stage 0 — telemetry (ships immediately).**
Three lookup-fail points now emit typed `capability_gap` events: `skills/fast` no-skill-match paths, `gdd-router` unmatched-intent paths, and the reflector's pattern-detection pass (recurring `Touches:` clusters without a dedicated owner). The reflector aggregates per-cycle gap events into a `## Capability gaps observed` section in your reflection notes. View with `gdd-events --type capability_gap`. No authoring on Stage 0 — this just surfaces signal.

**Stage 1 — self-authoring (opt-in once data crosses the gate).**
When K=3 stable clusters surface across M=10 reflection cycles (defaults in `reference/capability-gap-stage-gate.md`), `/gdd:apply-reflections` prompts you once to enable Stage 1. With Stage 1 on, the reflector drafts incubator artifacts at `.design/reflections/incubator/<slug>/` — `SKILL.md` or `agents/<slug>.md` with full Phase 28.5-compliant frontmatter, originating events, computed usage frequency, and a suggested integration point. Drafts surface in `/gdd:apply-reflections` as a 5th proposal class with four actions: `accept` (promotes + registers), `reject`, `defer`, `edit`. Promoted arms enter the bandit with a conservative `Beta(2, 8)` prior so they don't get preferential selection until evidence accumulates. Drafts not promoted/refreshed within 30 days auto-archive.

**Scope guard.** Authoring is limited to `agents/` and `skills/` only — never runtimes, transports, connections, hooks, or CI workflows. `scripts/validate-incubator-scope.cjs` blocks promotion attempts outside scope.

**Discipline preserved.** Reflector authors nothing that auto-ships. `/gdd:apply-reflections` remains the single human gate (Phase 11 SC-8). Stage 1 never auto-flips — user opts in.


### Figma off-context extraction (v1.31.0+)

Pull an entire Figma design system into a compact, LLM-readable local digest — **without the raw JSON ever entering Claude's context**. One command extracts the file via the Figma REST API into a local raw cache; a separate digest stage reduces it to `DESIGN.md` + `tokens.json` + `components.json`.

```bash
# Stage 1 — raw pull (0 Claude tokens; writes a gitignored cache)
node scripts/lib/figma-extract/pull.cjs <figma-file-url-or-key>
# Stage 2 — digest (reads the cache, writes the compact spec)
node scripts/lib/figma-extract/digest.cjs --raw <cache>/raw/<key> --out .design/figma
```

**The economics.** A spike measured **898× compression** (223 MB raw → 254 KB digest) with a ~15.7K-token `DESIGN.md`, capturing 127 component sets + 40 singletons (variants, props, defaults) in ~33s — at **0 Claude tokens and 0 Figma MCP calls during extraction**. This is the cost-sane alternative to the Figma MCP for whole-design-system work, which can run tens of minutes and 50–500K+ tokens for the same data. (The Figma MCP remains the right tool for spot questions on a single component.)

- **Token-safe by construction.** `FIGMA_TOKEN` is read from the environment only and sent solely as a request header — never logged, never written to disk (a CI static-analysis test enforces this across the whole extract library). The digest never reads raw JSON into context.
- **Works on any Figma plan.** The optional **"GDD Sync"** Figma plugin (`figma-plugin/`) fills the Variables-API-Enterprise gap: it reads `figma.variables` from inside Figma and POSTs them to an ephemeral, 127.0.0.1-only receiver — so Free-tier users get full token coverage too.
- **Per-component slices.** `digest --component <name|glob>` renders a ~500-token slice of just the components you ask for, instead of the full digest.
- **Health-aware.** `/gdd:health` reports a `figma_extract` readiness line (token set / token missing / Free-tier plugin-sync needed).

See [`skills/figma-extract/SKILL.md`](skills/figma-extract/SKILL.md) and [`figma-plugin/README.md`](figma-plugin/README.md) for the full flow.

### Skill discipline bootstrap (v1.32.0+)

GDD ships 70+ skills, but a description-match skill router consults them opportunistically — easy to skip a stage under pressure. v1.32.0 adds the forcing function GDD lacked, porting the skill-discipline **mechanism** (not content) from [`obra/superpowers`](https://github.com/obra/superpowers) (MIT):

- **SessionStart inject.** A `using-gdd` bootstrap contract is injected at every session start / `/clear` / compact (`hooks/inject-using-gdd.sh`, per-harness: Cursor / Claude Code / SDK). It carries the **1%-rule** ("even a 1% chance a skill applies → invoke it"), a red-flags `Thought → Reality` table, and the skill-priority + instruction-priority order — so the agent is primed to find the right skill before it acts.
- **`<HARD-GATE>` at every stage transition.** Brief / Explore / Plan / Design / Verify each refuse to advance until the stage's artifact exists and is approved — no free-handing a stage.
- **Rationalization tables** in all 7 stage skills name the common "skip it" justifications and rebut each; **inline self-review** blocks gate the brief and plan specs.
- **`<SUBAGENT-STOP>` no-cascade.** The inject fires only on SessionStart, so the bootstrap never cascades into spawned subagents.
- **Portable + health-aware.** `AGENTS.md` + `GEMINI.md` carry the same discipline block for non-Claude-Code harnesses, and `/gdd:health` reports a `skill-discipline` readiness line.

See [`skills/using-gdd/SKILL.md`](skills/using-gdd/SKILL.md) and the `NOTICE` attribution for details.


## How It Works

> **New to an existing codebase?** Run `/gdd:map` first. It dispatches 5 specialist mappers in parallel (tokens, components, visual hierarchy, a11y, motion) and writes structured JSON to `.design/map/` — much higher signal than the grep-based fallback in Explore.

### 1. Brief

```
/gdd:brief
```

Captures the design problem before any scanning or exploration. The skill interviews via `AskUserQuestion`, one question at a time, only for unanswered sections: problem, audience, constraints, success metrics, scope.

**Creates:** `.design/BRIEF.md`

---

### 2. Explore

```
/gdd:explore
```

Inventories the current codebase's design system: colors, typography, spacing, components, motion, a11y, dark-mode. Five parallel mappers + a `design-discussant` interview produce three artifacts. Connection probes detect Figma, Refero, Storybook, Chromatic, Preview, Pinterest, Claude Design, paper.design, pencil.dev, Graphify, 21st.dev Magic, and Magic Patterns availability.

**Creates:** `.design/DESIGN.md`, `.design/DESIGN-DEBT.md`, `.design/DESIGN-CONTEXT.md`, `.design/map/{tokens,components,a11y,motion,visual-hierarchy}.{md,json}`

---

### 3. Plan

```
/gdd:plan
```

Decomposes Explore output into atomic, wave-coordinated, dependency-analyzed design tasks. Each task carries explicit `Touches:` paths, parallel-safety tags, and acceptance criteria. `design-planner` (opus) authors; `design-plan-checker` (haiku) gate-checks against the brief goal before execution.

**Creates:** `.design/DESIGN-PLAN.md`

---

### 4. Design

```
/gdd:design
```

Executes plan tasks in waves. Each task gets a dedicated `design-executor` agent with a fresh 200k context, atomic git commit, and automatic deviation handling per in-context rules. Parallel-safe tasks run in worktrees.

**Solidify-with-rollback** (v1.23.0) — every task validates (typecheck + build + targeted test) before locking in. Validation fails → `git stash` revert. Each task is atomic commit-or-revert.

**Creates:** `.design/tasks/task-NN.md` per task, atomic git commit per task

```
┌────────────────────────────────────────────────────────────────────┐
│  WAVE EXECUTION                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WAVE 1 (parallel)          WAVE 2 (parallel)         WAVE 3       │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Task 01 │ │ Task 02 │ →  │ Task 03 │ │ Task 04 │ →  │ Task 05 │ │
│  │ tokens  │ │ a11y    │    │ button  │ │ form    │    │ verify  │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑      │
│       └───────────┴──────────────┴───────────┴──────────────┘      │
│              Touches: paths drive dependency analysis              │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 5. Verify

```
/gdd:verify
```

Verifies against the brief — must-haves, NN/g heuristics, audit rubric, token integration. Three agents run in sequence: `design-auditor` (6-pillar 1–4 score), `design-verifier` (goal-backward), `design-integration-checker` (greps D-XX decisions back to code). On failures, produces a structured gap list and enters a verify→fix loop via `design-fixer`.

**Creates:** `.design/DESIGN-VERIFICATION.md`, gap-fix commits if issues found

---

### 6. Ship → Reflect → Next Cycle

```
/gdd:ship                    # Generate clean PR branch (filters .design/ commits)
/gdd:reflect                 # design-reflector reads telemetry + learnings
/gdd:apply-reflections       # Review and selectively apply reflector proposals
/gdd:complete-cycle          # Archive cycle artifacts, write EXPERIENCE.md
/gdd:new-cycle               # Open a new design cycle
```

Or auto-route:

```
/gdd:next                    # Auto-detect state and run the next step
```

Each cycle gets a brief, scan, plan, execution, verification, and a per-cycle `EXPERIENCE.md` (~100–200 lines: Goal / Decisions made / Learnings graduated / What died / Handoff to next cycle) that becomes the highest-priority source for the decision-injector hook.

---

### Fast Mode

```
/gdd:fast "<task>"
```

For trivial single-file fixes that don't need the full pipeline. Skips the router, cache-manager, and telemetry. Same atomic-commit guarantees.

```
/gdd:quick
```

For ad-hoc tasks that need GSD-style guarantees but skip optional gates (no phase-researcher, no assumptions analyzer, no integration-checker). Faster than the full pipeline; safer than `/gdd:fast`.

---

## Why It Works

### Context Engineering

AI coding CLIs are powerful **if** you feed them context. Most people don't.

GDD handles it for you:

| File | What it does |
|------|--------------|
| `.design/BRIEF.md` | The cycle's problem, audience, success metrics |
| `.design/DESIGN.md` | Current design-system snapshot (tokens, components, hierarchy) |
| `.design/DESIGN-CONTEXT.md` | D-XX decisions, interview answers, upstream/downstream constraints |
| `.design/DESIGN-PLAN.md` | Atomic tasks, wave choreography, dependencies |
| `.design/DESIGN-VERIFICATION.md` | Verification result, gap list, Handoff Faithfulness score |
| `.design/intel/` | Queryable knowledge layer: token fan-out, component call-graph, decision traceability |
| `.design/archive/cycle-N/EXPERIENCE.md` | Per-cycle retrospective for cross-cycle memory |
| `.design/telemetry/events.jsonl` | Typed event stream across stages |
| `.design/telemetry/posterior.json` | Bandit posterior (when `adaptive_mode != static`) |

Size limits where Claude's quality degrades. Stay under, get consistency.

### 37 Specialized Agents

Each stage is a thin orchestrator that spawns specialized agents. Heavy lifting happens in fresh 200k contexts, not your main session.

| Stage | Orchestrator does | Agents do |
|-------|-------------------|-----------|
| Brief | one-question interview | (no subagents — leaf skill) |
| Explore | spawns 5 mappers + discussant | 5 parallel mappers, design-discussant, research-synthesizer |
| Plan | spawns researcher + planner + checker | design-phase-researcher (optional), design-planner (opus), design-plan-checker (haiku) |
| Design | wave coordination + worktree isolation | design-executor per task, design-fixer on solidify failure |
| Verify | spawns auditor + verifier + checker | design-auditor (6-pillar score), design-verifier (goal-backward), design-integration-checker (D-XX → code) |
| Reflect | reads telemetry + learnings | design-reflector (opus), design-authority-watcher, design-update-checker |

### 12 Tool Connections

All optional — the pipeline degrades gracefully when any connection is unavailable:

- **Figma** (read + write + Code Connect) — annotations, token bindings, implementation status write-back
- **Refero** — design reference search
- **Pinterest** — visual reference grounding
- **Claude Design** — handoff bundle import (`/gdd:handoff`)
- **Storybook** — component-spec lookup
- **Chromatic** — visual regression baseline diff
- **Preview** — Playwright + Claude Preview MCP for runtime screenshots
- **paper.design** — MCP canvas read/write for round-trip verification
- **pencil.dev** — git-tracked `.pen` spec files
- **Graphify** — knowledge-graph export
- **21st.dev Magic** — prior-art component search before greenfield builds
- **Magic Patterns** — DS-aware component generation with `preview_url`

### Embedded Design References

The plugin ships **18+ reference files** covering every major design-knowledge domain. Agents have authoritative answers without web search:

- **Heuristics** — NN/g 10, Don Norman emotional design (visceral/behavioral/reflective), Dieter Rams 10, Disney 12 (motion), Sonner / Emil Kowalski component-authoring lens, Peak-End Rule, Loss Aversion, Cognitive Load Theory, Aesthetic-Usability Effect, Doherty Threshold, Flow.
- **Components** — 35 component specs (Material 3, Apple HIG, Radix, shadcn, Polaris, Carbon, Fluent, Atlassian, Ant, Mantine, Chakra, Base Web, Spectrum, Lightning, Evergreen, Gestalt) with locked spec template (Purpose · Anatomy · Variants · States · Sizing · Typography · Keyboard · Motion · Do/Don't · Anti-patterns · Citations · Grep signatures).
- **Visual + brand** — gestalt principles, visual-hierarchy, brand-voice, palette catalog (161 industry palettes), style vocabulary (67 UI aesthetics), iconography (Lucide / Phosphor / Heroicons / Radix Icons / Tabler / SF Symbols).
- **Motion** — 12 canonical easings (RN MIT) + 8 transition families (hyperframes Apache-2.0) + spring presets + interpolation taxonomy + advanced craft (gesture mechanics, clip-path, blur crossfades, View Transitions API, WAAPI).
- **Platform + a11y** — WCAG 2.1 AA thresholds, platforms (iOS / Android / web / visionOS / watchOS), RTL + CJK + cultural color, form patterns (Wroblewski label research, autocomplete taxonomy, CAPTCHA ethics).
- **Anti-patterns** — regex-signature catalog matched by `design-pattern-mapper`.

### Atomic Git Commits

Each design task gets its own commit immediately after completion:

```
abc123f docs(08-02): complete user-card token plan
def456g feat(08-02): unify card surface tokens with --color-bg-elevated
hij789k feat(08-02): replace inline padding with --space-* scale
lmn012o test(08-02): assert card.spec passes WCAG contrast 4.5:1
```

Git bisect finds exact failing task. Each task is independently revertable. Solidify-with-rollback adds a per-task validation gate so a broken task 3 never corrupts tasks 4–10 before verify runs.

### Self-Improvement Loop

After every cycle, `design-reflector` (opus) reads `events.jsonl`, `agent-metrics.json`, and `learnings/`, then proposes diffs:

- **Tier overrides** — "design-verifier on plans <300 lines: drop to haiku, no measured quality regression"
- **Parallelism rules** — "token-mapper + component-taxonomy-mapper conflict on `Touches: src/styles/`; serialize"
- **Reference additions** — "L-12 cited 9 times across cycles 3–5; promote to `reference/heuristics.md`"
- **Frontmatter updates** — "design-executor `typical-duration-seconds: 60` measured at 142s; propose 120s"

`/gdd:apply-reflections` shows the diff and asks before applying. Nothing auto-applies. The **No-Regret Adaptive Layer** (v1.23.5) layers a Thompson sampling bandit + AdaNormalHedge ensemble + MMR rerank on top, viable in single-user mode via informed-prior bootstrap.

### Cost Governance

- **`gdd-router` skill** — deterministic intent → fast / quick / full routing. No model call.
- **`gdd-cache-manager`** — Layer-B explicit cache with SHA-256 input-hash + 5-min TTL awareness.
- **`budget-enforcer` PreToolUse hook** — enforces tier overrides, hard caps, lazy-spawn gates from `.design/budget.json`.
- **Per-spawn cost telemetry** — `.design/telemetry/costs.jsonl` rows feed `/gdd:optimize` rule-based recommendations.

Targets 50–70% per-task token-cost reduction with no quality-floor regression.

---

## Commands

### Core Pipeline

| Command | What it does |
|---------|--------------|
| `/gdd:brief` | Stage 1 — capture the design brief |
| `/gdd:explore` | Stage 2 — codebase inventory + interview |
| `/gdd:plan` | Stage 3 — produce DESIGN-PLAN.md |
| `/gdd:design` | Stage 4 — execute plan in waves |
| `/gdd:verify` | Stage 5 — verify against brief |
| `/gdd:ship` | Generate clean PR branch (filters .design/ commits) |
| `/gdd:next` | Auto-route to the next stage based on STATE.md |
| `/gdd:do <text>` | Natural-language router — picks the right command |
| `/gdd:fast <text>` | One-shot trivial fix, no pipeline |
| `/gdd:quick` | Ad-hoc task with GDD guarantees but skipped optional gates |

### First-Run + Onboarding

| Command | What it does |
|---------|--------------|
| `/gdd:start` | First-run proof path — top-3 design issues in your repo (no `.design/` footprint until you opt in) |
| `/gdd:new-project` | Initialize a GDD project (PROJECT.md + STATE.md + first cycle) |
| `/gdd:connections` | Onboarding wizard for the 12 external integrations |

### Cycle Lifecycle

| Command | What it does |
|---------|--------------|
| `/gdd:new-cycle` | Open a new design cycle |
| `/gdd:complete-cycle` | Archive cycle artifacts + write per-cycle EXPERIENCE.md |
| `/gdd:pause` / `/gdd:resume` | Numbered checkpoints — pause mid-stage, resume from any saved checkpoint |
| `/gdd:continue` | Alias for `/gdd:resume` (latest checkpoint) |
| `/gdd:timeline` | Narrative retrospective across cycles + git log |

### Iteration + Decisions

| Command | What it does |
|---------|--------------|
| `/gdd:discuss [topic]` | Adaptive design interview — `--all` for batch gray areas, `--spec` for ambiguity scoring |
| `/gdd:list-assumptions` | Surface hidden design assumptions before planning |
| `/gdd:sketch [idea]` | Multi-variant HTML mockup exploration — browser-openable directly |
| `/gdd:spike [idea]` | Timeboxed feasibility experiment with hypothesis + verdict |
| `/gdd:sketch-wrap-up` / `/gdd:spike-wrap-up` | Package findings into project-local skill |
| `/gdd:audit` | Wraps `design-verifier` + `design-auditor` + `design-reflector`. `--retroactive` audits the full cycle |
| `/gdd:reflect` | Run `design-reflector` on demand — produces `.design/reflections/<cycle-slug>.md` |
| `/gdd:apply-reflections` | Review and selectively apply reflector proposals — diff before apply |

### Memory + Knowledge Layer

| Command | What it does |
|---------|--------------|
| `/gdd:recall <query>` | FTS5-backed search across cycle archives, learnings, decisions, EXPERIENCE.md files |
| `/gdd:extract-learnings` | Mine cycle artifacts for patterns + decisions + lessons |
| `/gdd:note <text>` | Zero-friction idea capture — append, list, promote to todo |
| `/gdd:plant-seed <idea>` | Forward-looking idea with trigger condition — surfaces at the right cycle |
| `/gdd:analyze-dependencies` | Token fan-out, component call-graphs, decision traceability, circular dependency detection |
| `/gdd:skill-manifest` | List all GDD skills + agents from the intel store |
| `/gdd:graphify` | Build, query, inspect, diff the project knowledge graph |
| `/gdd:watch-authorities` | Diff the design-authority feed whitelist + classify into 5 buckets |

### Connections

| Command | What it does |
|---------|--------------|
| `/gdd:figma-write` | Write design decisions back to Figma (annotate / tokenize / roundtrip) |
| `/gdd:handoff <bundle>` | Import a Claude Design bundle and skip Stages 1–3 |
| `/gdd:darkmode` | Audit dark-mode implementation (CSS custom props / Tailwind dark: / JS class toggle) |
| `/gdd:compare` | Compute delta between DESIGN.md baseline and DESIGN-VERIFICATION.md result |
| `/gdd:style <Component>` | Generate component handoff doc (DESIGN-STYLE-[Component].md) |

### Diagnostic + Forensic

| Command | What it does |
|---------|--------------|
| `/gdd:scan` | Codebase design-system inventory (no STATE.md write) |
| `/gdd:map` | 5 parallel codebase mappers (tokens / components / a11y / motion / visual-hierarchy) |
| `/gdd:debug [desc]` | Symptom-driven design investigation with persistent state |
| `/gdd:health` | Reports `.design/` artifact health — staleness, missing files, token drift |
| `/gdd:progress` | Show pipeline position; `--forensic` runs 6-check integrity audit |
| `/gdd:stats` | Cycle stats — decisions made, tasks completed, commits, timeline, git metrics |
| `/gdd:optimize` | Rule-based cost analysis + tier-override recommendations |
| `/gdd:warm-cache` | Pre-warm Anthropic prompt cache across all agents that import shared-preamble |

### Distribution + Update

| Command | What it does |
|---------|--------------|
| `/gdd:update` | Update GDD with changelog preview |
| `/gdd:reapply-patches` | Restitch local `reference/` modifications after structural updates |
| `/gdd:check-update` | Manual update check — `--refresh` bypasses 24h TTL, `--dismiss` hides nudge |
| `/gdd:settings` | Configure `.design/config.json` — profile / parallelism / cleanup |
| `/gdd:set-profile <profile>` | Switch model profile (quality / balanced / budget / inherit) |
| `/gdd:undo` | Safe design change revert — uses git log + dependency check |
| `/gdd:pr-branch` | Create clean PR branch by filtering out `.design/` and `.planning/` commits |

### Backlog + Notes

| Command | What it does |
|---------|--------------|
| `/gdd:todo` | Add / list / pick design tasks |
| `/gdd:add-backlog <idea>` | Park a design idea for a future cycle |
| `/gdd:review-backlog` | Review parked items + promote to active cycle todo |

### Help

| Command | What it does |
|---------|--------------|
| `/gdd:help` | Full command list + usage |
| `/gdd:bandit-reset` | Reset adaptive-layer posterior on Anthropic model release |

---

## Connections

GDD ships with 12 tool connections. All are optional; the pipeline degrades gracefully to fallbacks when any connection is unavailable. Configure with `/gdd:connections`.

| Connection | Purpose | Probe |
|------------|---------|-------|
| **Figma** | Read tokens, components, screenshots; write annotations, Code Connect, implementation status | `mcp__figma__get_metadata` + `use_figma` |
| **Refero** | Design reference search across catalogued sources | `mcp__refero__search` |
| **Pinterest** | Visual reference grounding for brand-voice + style | OAuth + MCP |
| **Claude Design** | Handoff bundle import (`/gdd:handoff`) — skip Stages 1–3 | URL or local file |
| **Storybook** | Component-spec lookup at port 6006 | HTTP probe |
| **Chromatic** | Visual regression baseline diff | API key |
| **Preview** | Playwright + Claude Preview MCP runtime screenshots | `mcp__Claude_Preview__preview_*` |
| **paper.design** | MCP canvas read/write for canvas → code → verify → canvas round-trip | `mcp__paper__use_paper` |
| **pencil.dev** | Git-tracked `.pen` spec files (no MCP required) | `.pen` files in repo |
| **Graphify** | Knowledge-graph export | `mcp__graphify__*` |
| **21st.dev Magic** | Prior-art component search before greenfield builds | `mcp__magic__search` |
| **Magic Patterns** | DS-aware component generation with `preview_url` | `mcp__magic-patterns__generate` |

For full connection details and probe patterns, see [`connections/connections.md`](connections/connections.md).

---

## Configuration

GDD stores project settings in `.design/config.json`. Configure during `/gdd:new-project` or update with `/gdd:settings`.

### Model Profiles

Control which Claude model each agent uses. Balance quality vs token spend.

| Profile | Planning | Execution | Verification |
|---------|----------|-----------|--------------|
| `quality` | Opus | Opus | Sonnet |
| `balanced` (default) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | Inherit | Inherit | Inherit |

Switch profiles:

```
/gdd:set-profile budget
```

Use `inherit` when using non-Anthropic providers or to follow the runtime's current model selection.

### Adaptive Mode

`.design/budget.json#adaptive_mode` ladder (v1.23.5):

| Mode | What it does |
|------|--------------|
| `static` (default) | Phase 10.1 behavior — static D-13 tier map |
| `hedge` | AdaNormalHedge ensemble + MMR rerank engaged. Bandit router still reads static map. Safest intro. |
| `full` | Bandit router + Hedge + MMR all active, reading/writing `.design/telemetry/posterior.json` |

### Parallelism

| Setting | Default | What it controls |
|---------|---------|------------------|
| `parallelism.enabled` | `true` | Run independent tasks in worktrees |
| `parallelism.min_estimated_savings_seconds` | `30` | Skip parallelization below this threshold |
| `parallelism.max_concurrent_workers` | `4` | Hard cap on simultaneous worktrees |

### Quality Gates

| Setting | Default | What it controls |
|---------|---------|------------------|
| `solidify.rollback_mode` | `"stash"` | `stash` / `hard` / `none` — how to revert on validation failure |
| `solidify.commands` | autodetect | Override typecheck / build / test commands |
| `verify.iterations_max` | `3` | Cap on verify→fix loop iterations |
| `connection.figma_writeback` | `proposal` | `proposal` / `auto` — confirm before writing |

---

## Security

### Built-in Hardening

GDD ships defense-in-depth security since Phase 14.5:

- **`hooks/gdd-bash-guard.js`** — PreToolUse:Bash blocks ~50 dangerous patterns (`rm -rf /`, `chmod 777`, `curl | sh`, `git reset --hard`, fork bombs) after Unicode NFKC + ANSI normalization.
- **`hooks/gdd-protected-paths.js`** — PreToolUse:Edit/Write/Bash enforces `protected_paths` glob list (defaults: `reference/**`, `.design/archive/**`, `skills/**`, `commands/**`, `hooks/**`, `.design/config.json`, `.design/telemetry/**`).
- **`hooks/gdd-read-injection-scanner.ts`** — scans inbound Read content for invisible-Unicode (zero-width, word-joiner, BOM, bidi overrides) + HTML-comment + secret-exfil patterns.
- **`scripts/lib/blast-radius.cjs`** — `design-executor` preflight refuses tasks above `max_files_per_task: 10` / `max_lines_per_task: 400`.
- **`hooks/gdd-mcp-circuit-breaker.js`** — breaks consecutive-timeout loops on `use_figma` / `use_paper` / `use_pencil`.

### Protecting Sensitive Files

Add sensitive paths to your runtime's deny list:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

> [!IMPORTANT]
> Because GDD generates markdown files that become LLM system prompts, any user-controlled text flowing into `.design/` artifacts is a potential indirect prompt-injection vector. The injection scanner catches such vectors at multiple layers — but defense-in-depth is best practice.

---

## Troubleshooting

**Commands not found after install?**
- Restart your runtime to reload commands/skills
- Verify files exist at `~/.claude/skills/get-design-done/` for global Claude Code installs
- For local installs, verify `./.claude/skills/get-design-done/`
- Run `/gdd:help` to confirm registration

**Pipeline stuck mid-stage?**
- `/gdd:resume` — restore from the most recent numbered checkpoint
- `/gdd:health` — diagnose `.design/` artifact issues
- `/gdd:progress --forensic` — 6-check integrity audit

**Cost overruns?**
- `/gdd:optimize` — rule-based recommendations
- `/gdd:set-profile budget` — switch to budget tier
- Set `adaptive_mode: "full"` in `.design/budget.json` — bandit will learn cheap-and-correct tier per agent over 5–10 cycles

**Updating to the latest version?**
```bash
npx @hegemonart/get-design-done@latest
```

**Using Docker / containers?**

```bash
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

### Uninstalling

```bash
# Global installs (per-runtime)
npx @hegemonart/get-design-done --claude --global --uninstall
npx @hegemonart/get-design-done --opencode --global --uninstall
npx @hegemonart/get-design-done --gemini --global --uninstall
npx @hegemonart/get-design-done --kilo --global --uninstall
npx @hegemonart/get-design-done --codex --global --uninstall
npx @hegemonart/get-design-done --copilot --global --uninstall
npx @hegemonart/get-design-done --cursor --global --uninstall
npx @hegemonart/get-design-done --windsurf --global --uninstall
npx @hegemonart/get-design-done --antigravity --global --uninstall
npx @hegemonart/get-design-done --augment --global --uninstall
npx @hegemonart/get-design-done --trae --global --uninstall
npx @hegemonart/get-design-done --qwen --global --uninstall
npx @hegemonart/get-design-done --codebuddy --global --uninstall
npx @hegemonart/get-design-done --cline --global --uninstall

# Multi-select interactive uninstall (no runtime flag)
npx @hegemonart/get-design-done --uninstall

# Local installs (current project)
npx @hegemonart/get-design-done --claude --local --uninstall
# ... same flags as above with --local
```

This removes all GDD commands, agents, hooks, and settings while preserving other configurations.

---

## Feedback Channel (v1.30.0+)

GDD now ships a consent-first GitHub issue reporter via the `/gdd:report-issue` slash command.

- **What it does.** Walks you through reporting an issue or a capability gap, with a payload preview before submission. Local-first, consent-gated, no auto-mode. Triages against `reference/known-failure-modes.md` first — many failures resolve without filing.
- **Pseudonymization, NOT anonymization.** Direct identifiers (your username, hostname, absolute paths, git identity, env-var values, emails, IPs) are replaced with stable pseudonyms — but internal correlation is preserved so maintainers can debug. Side-channel data (writing style, code patterns, repo fingerprints) may still re-identify. You see the full payload before submission and explicitly consent per-issue.
- **Kill-switch.** Set `GDD_DISABLE_ISSUE_REPORTER=1` (env) or add `{ "issue_reporter": false }` to `.design/config.json` to halt submission before any network call. `gsd-health` surfaces the disable line.
- **Hardcoded destination.** The reporter cannot be redirected at runtime; the destination repo is a frozen constant in `scripts/lib/issue-reporter/destination.cjs`.
- **`gh`-absent fallback.** If the GitHub CLI isn't installed, the payload is written to `.design/issue-drafts/` and the issue-template URL is copied to your clipboard (xclip / pbcopy / clip).

See [`reference/pseudonymization-rules.md`](reference/pseudonymization-rules.md) for the R1..R8 rule catalog and [`reference/known-failure-modes.md`](reference/known-failure-modes.md) for known anti-patterns the reporter detects.

**v1.30.5 update** — the catalogue now ships 22 entries (was 10 in v1.30.0), and a new deterministic fuzzy matcher (`scripts/lib/failure-mode-matcher.cjs`, top-N + threshold + confidence) returns ranked candidates for ambiguous symptoms. The reflector + authority-watcher can propose new entries via `/gdd:apply-reflections` (6th proposal class) — strictly proposal-only, every entry passes through user review.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Claude Code ships code. Get Design Done makes sure it ships design.**

</div>
