<div align="center">

# GET DESIGN DONE

**English** · [简体中文](docs/i18n/README.zh-CN.md) · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [Français](docs/i18n/README.fr.md) · [Italiano](docs/i18n/README.it.md) · [Deutsch](docs/i18n/README.de.md)

**A design-quality pipeline for AI coding agents: brief → explore → plan → design → verify.**

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

Behind the scenes: 64 specialized agents, a queryable intel store, tier-aware model routing, 42 optional tool connections, atomic commits, and a no-regret adaptive layer that learns from solidify-with-rollback outcomes. What you use day to day: a few `/gdd:*` commands that keep design work coherent.

- **Hegemon**

---

AI-generated design has the same failure mode as AI-generated code: describe what you want, get something plausible, then watch it fall apart at scale because no system tied the output back to the brief.

Get Design Done is the context engineering layer for design work. It turns "make this UI better" into a traceable cycle: brief → explore → plan → design → verify.

---

## What You Get

- **Brief-grounded design work** - every cycle starts with the problem, audience, constraints, success metrics, and must-haves.
- **Design-system extraction** - GDD inventories tokens, typography, spacing, components, motion, accessibility, dark mode, and design debt before planning changes.
- **Reference-backed decisions** - agents use embedded design references plus optional Figma, Refero, Pinterest, Storybook, Chromatic, Preview, Claude Design, paper.design, pencil.dev, Graphify, 21st.dev Magic, and Magic Patterns connections.
- **Atomic execution** - design tasks are decomposed by dependency, run in safe waves, and committed independently.
- **Verification before shipping** - audits check brief fit, token integration, WCAG contrast, component conformance, motion consistency, dark-mode architecture, and design anti-patterns.
- **Rollback on failed validation** - solidify-with-rollback validates each task before it sticks; failed work is automatically reverted.

---

## Who This Is For

GDD is for engineers, designers, design engineers, founders, and product builders who ship UI with AI coding agents and need the result to hold together beyond the first screenshot.

Use it when you care that tokens match, contrast passes WCAG, motion feels cohesive, components follow your system, and the final implementation still matches what you asked for.

You do not need to be a designer to benefit from it. The pipeline carries the design discipline into the agent workflow: it extracts context, asks only for missing decisions, grounds the work in references, and catches the issues people usually find too late.

For the full release history (every version from v1.0.0 onwards), see [CHANGELOG.md](CHANGELOG.md).

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

## How It Works

> **New to an existing codebase?** Run `/gdd:map` first. It dispatches 5 specialist mappers in parallel (tokens, components, visual hierarchy, a11y, motion) and writes structured JSON to `.design/map/` - much higher signal than the grep-based fallback in Explore.

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

**Solidify-with-rollback** - every task validates (typecheck + build + targeted test) before locking in. Validation fails → `git stash` revert. Each task is atomic commit-or-revert.

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

Verifies against the brief - must-haves, NN/g heuristics, audit rubric, token integration. Three agents run in sequence: `design-auditor` (6-pillar 1–4 score), `design-verifier` (goal-backward), `design-integration-checker` (greps D-XX decisions back to code). On failures, produces a structured gap list and enters a verify→fix loop via `design-fixer`.

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

### 64 Specialized Agents

Each stage is a thin orchestrator that spawns specialized agents. Heavy lifting happens in fresh 200k contexts, not your main session.

| Stage | Orchestrator does | Agents do |
|-------|-------------------|-----------|
| Brief | one-question interview | (no subagents - leaf skill) |
| Explore | spawns 5 mappers + discussant | 5 parallel mappers, design-discussant, research-synthesizer |
| Plan | spawns researcher + planner + checker | design-phase-researcher (optional), design-planner (opus), design-plan-checker (haiku) |
| Design | wave coordination + worktree isolation | design-executor per task, design-fixer on solidify failure |
| Verify | spawns auditor + verifier + checker | design-auditor (6-pillar score), design-verifier (goal-backward), design-integration-checker (D-XX → code) |
| Reflect | reads telemetry + learnings | design-reflector (opus), design-authority-watcher, design-update-checker |

### Embedded Design References

The plugin ships 18+ reference files covering every major design-knowledge domain. Agents have authoritative answers without web search:

- **Heuristics** - NN/g 10, Don Norman emotional design (visceral/behavioral/reflective), Dieter Rams 10, Disney 12 (motion), Sonner / Emil Kowalski component-authoring lens, Peak-End Rule, Loss Aversion, Cognitive Load Theory, Aesthetic-Usability Effect, Doherty Threshold, Flow.
- **Components** - 35 component specs (Material 3, Apple HIG, Radix, shadcn, Polaris, Carbon, Fluent, Atlassian, Ant, Mantine, Chakra, Base Web, Spectrum, Lightning, Evergreen, Gestalt) with locked spec template (Purpose · Anatomy · Variants · States · Sizing · Typography · Keyboard · Motion · Do/Don't · Anti-patterns · Citations · Grep signatures).
- **Visual + brand** - gestalt principles, visual-hierarchy, brand-voice, palette catalog (161 industry palettes), style vocabulary (67 UI aesthetics), iconography (Lucide / Phosphor / Heroicons / Radix Icons / Tabler / SF Symbols).
- **Motion** - 12 canonical easings (RN MIT) + 8 transition families (hyperframes Apache-2.0) + spring presets + interpolation taxonomy + advanced craft (gesture mechanics, clip-path, blur crossfades, View Transitions API, WAAPI).
- **Platform + a11y** - WCAG 2.1 AA thresholds, platforms (iOS / Android / web / visionOS / watchOS), RTL + CJK + cultural color, form patterns (Wroblewski label research, autocomplete taxonomy, CAPTCHA ethics).
- **Anti-patterns** - regex-signature catalog matched by `design-pattern-mapper`.

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

- **Tier overrides** - "design-verifier on plans <300 lines: drop to haiku, no measured quality regression"
- **Parallelism rules** - "token-mapper + component-taxonomy-mapper conflict on `Touches: src/styles/`; serialize"
- **Reference additions** - "L-12 cited 9 times across cycles 3–5; promote to `reference/heuristics.md`"
- **Frontmatter updates** - "design-executor `typical-duration-seconds: 60` measured at 142s; propose 120s"

`/gdd:apply-reflections` shows the diff and asks before applying. Nothing auto-applies. The **No-Regret Adaptive Layer** layers a Thompson sampling bandit + AdaNormalHedge ensemble + MMR rerank on top, viable in single-user mode via informed-prior bootstrap.

### Cost Governance

- **`gdd-router` skill** - deterministic intent → fast / quick / full routing. No model call.
- **`gdd-cache-manager`** - Layer-B explicit cache with SHA-256 input-hash + 5-min TTL awareness.
- **`budget-enforcer` PreToolUse hook** - enforces tier overrides, hard caps, lazy-spawn gates from `.design/budget.json`.
- **Per-spawn cost telemetry** - `.design/telemetry/costs.jsonl` rows feed `/gdd:optimize` rule-based recommendations.

Targets 50–70% per-task token-cost reduction with no quality-floor regression.

---

## Commands

GDD ships 95 skills. The most common ones are below; for the full reference see [SKILL.md](SKILL.md).

### Core Pipeline

| Command | What it does |
|---------|--------------|
| `/gdd:brief` | Stage 1 - capture the design brief |
| `/gdd:explore` | Stage 2 - codebase inventory + interview |
| `/gdd:plan` | Stage 3 - produce DESIGN-PLAN.md |
| `/gdd:design` | Stage 4 - execute plan in waves |
| `/gdd:verify` | Stage 5 - verify against brief |
| `/gdd:ship` | Generate clean PR branch (filters .design/ commits) |
| `/gdd:next` | Auto-route to the next stage based on STATE.md |
| `/gdd:do <text>` | Natural-language router - picks the right command |
| `/gdd:fast <text>` | One-shot trivial fix, no pipeline |
| `/gdd:quick` | Ad-hoc task with GDD guarantees but skipped optional gates |

### Cycle + Iteration

| Command | What it does |
|---------|--------------|
| `/gdd:start` | First-run proof path - top-3 design issues in your repo (no `.design/` footprint until you opt in) |
| `/gdd:new-project` | Initialize a GDD project (PROJECT.md + STATE.md + first cycle) |
| `/gdd:new-cycle` / `/gdd:complete-cycle` | Open / archive a design cycle |
| `/gdd:pause` / `/gdd:resume` | Numbered checkpoints - pause mid-stage, resume from any saved checkpoint |
| `/gdd:discuss [topic]` | Adaptive design interview |
| `/gdd:sketch [idea]` / `/gdd:spike [idea]` | Multi-variant HTML mockups + timeboxed feasibility |
| `/gdd:audit` | Wraps `design-verifier` + `design-auditor` + `design-reflector` |

### Memory + Diagnostics

| Command | What it does |
|---------|--------------|
| `/gdd:recall <query>` | FTS5-backed search across cycle archives, learnings, decisions |
| `/gdd:note <text>` / `/gdd:plant-seed <idea>` | Idea capture - append, list, promote, surface at the right cycle |
| `/gdd:scan` / `/gdd:map` | Codebase design-system inventory + 5 parallel mappers |
| `/gdd:health` / `/gdd:progress` | Artifact health, pipeline position, integrity audit |
| `/gdd:stats` / `/gdd:optimize` | Cycle stats, rule-based cost analysis, tier recommendations |

### Connections

| Command | What it does |
|---------|--------------|
| `/gdd:connections` | Onboarding wizard for the external integrations |
| `/gdd:figma-write` | Write design decisions back to Figma (annotate / tokenize / roundtrip) |
| `/gdd:handoff <bundle>` | Import a Claude Design bundle and skip Stages 1–3 |
| `/gdd:darkmode` | Audit dark-mode implementation |
| `/gdd:style <Component>` | Generate component handoff doc |

### Help

```
/gdd:help
```

The full per-command reference, including the long tail of memory, distribution, backlog, and forensic commands, lives in [SKILL.md](SKILL.md).

---

## Connections

GDD ships 39 tool connections. All are optional; the pipeline degrades gracefully to fallbacks when any connection is unavailable. Configure with `/gdd:connections`.

The connection layer spans these categories:

- **Design surfaces** - Figma (read + write + Code Connect), paper.design, pencil.dev, Penpot, Framer, Webflow, Plasmic
- **Reference + research** - Refero, Pinterest, Lazyweb, Mobbin, Claude Design handoff
- **Component generation** - 21st.dev Magic, Magic Patterns, v0.dev, Builder.io
- **Component spec + visual QA** - Storybook, Chromatic, Preview (Playwright + Claude Preview MCP)
- **Knowledge graph** - Graphify
- **Native + non-web output** - Xcode Simulator, Android Emulator, Litmus / Email-on-Acid, print renderer
- **Motion verification** - Lottie, Rive
- **Experiment + research signal** - LaunchDarkly, Statsig, GrowthBook, UserTesting, Maze, Hotjar
- **Team surfaces** - Slack, Discord, Linear, Jira, Notion, GitHub PR (`pr-commenter`)
- **Provider aggregation** - OpenRouter (opt-in alongside native provider auth)

For the full connection list with probe patterns and degraded-mode behaviour, see [connections/connections.md](connections/connections.md). Each connection is also a SKILL.md file under `skills/connections/` once enabled.

---

## Install

```bash
npx @hegemonart/get-design-done@latest
```

The installer prompts you to choose:

1. **Runtime** - Claude Code, OpenCode, Gemini, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline, or all (interactive multi-select - pick multiple runtimes in a single session).
2. **Location** - Global (all projects) or local (current project only).

All 14 runtimes receive their native artifact layout (`skills/`, `command/`, `agents/`, or `.clinerules`) via per-runtime content converters - source skills are translated to each runtime's expected shape at install time (frontmatter pass-through, path rewrite, tool-name rewrite via the cross-harness maps).

Verify:

```
/gdd:help
```

> [!TIP]
> Run Claude Code with `--dangerously-skip-permissions` for a frictionless experience. GDD is designed for autonomous multi-stage execution - approving each Read and `git commit` defeats the purpose.

### Staying Updated

GDD ships often. Update by re-running the installer (it is idempotent and updates registered marketplace entries in place):

```bash
npx @hegemonart/get-design-done@latest
```

Or from inside Claude Code:

```
/gdd:update
```

`/gdd:update` previews the changelog before applying. Local modifications under `reference/` are preserved - if a structural update needs re-stitching, run `/gdd:reapply-patches`. When a new release lands, the SessionStart hook prints a one-line banner gated by state-machine logic so it never interrupts a running stage.

<details>
<summary><strong>Non-interactive Install (Docker, CI, Scripts)</strong></summary>

```bash
# Claude Code
npx @hegemonart/get-design-done --claude --global   # Install to ~/.claude/
npx @hegemonart/get-design-done --claude --local    # Install to ./.claude/

# Per-runtime
npx @hegemonart/get-design-done --opencode --global # Install to ~/.config/opencode/
npx @hegemonart/get-design-done --gemini --global   # Install to ~/.gemini/
# ... same pattern for: kilo, codex, copilot, cursor, windsurf, antigravity,
# augment, trae, qwen, codebuddy, cline

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

This is what the npx installer does for you - `npx` just collapses two commands into one.

</details>

<details>
<summary><strong>Alternative: Tier-2 Distribution Channels</strong></summary>

Beyond the file-drop install paths above (which remain the default), three additional discovery-driven channels are supported:

- **agentskills.io** - skills are spec-compliant per the [agentskills.io](https://agentskills.io) standard, consumable by any agentskills.io-compatible runtime (Codex, Kilo, Augment, Hermes, Qwen).
- **Cursor Marketplace** - install via Cursor's marketplace UI (manifest at `.cursor-plugin/plugin.json`).
- **Codex Plugin** - `codex plugin marketplace add hegemonart/get-design-done` (manifest at `.codex-plugin/plugin.json`).

</details>

---

## Configure

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

`.design/budget.json#adaptive_mode` ladder:

| Mode | What it does |
|------|--------------|
| `static` (default) | Static tier-map behaviour |
| `hedge` | AdaNormalHedge ensemble + MMR rerank engaged. Bandit router still reads static map. Safest intro. |
| `full` | Bandit router + Hedge + MMR all active, reading/writing `.design/telemetry/posterior.json` |

### Parallelism + Quality Gates

| Setting | Default | What it controls |
|---------|---------|------------------|
| `parallelism.enabled` | `true` | Run independent tasks in worktrees |
| `parallelism.max_concurrent_workers` | `4` | Hard cap on simultaneous worktrees |
| `solidify.rollback_mode` | `"stash"` | `stash` / `hard` / `none` - how to revert on validation failure |
| `verify.iterations_max` | `3` | Cap on verify→fix loop iterations |
| `connection.figma_writeback` | `proposal` | `proposal` / `auto` - confirm before writing |

### Peer-CLI Delegation

GDD agents can optionally delegate to local peer CLIs (Codex via App Server Protocol; Gemini, Cursor, Copilot, Qwen via Agent Client Protocol) when measurably cheaper or higher-quality for the role. Falls back to in-process Anthropic SDK when no peer is available. Configure per-agent via `/gdd:peers` and `/gdd:run-skill peer-cli-customize`. Full ops guide: [docs/PEER-DELEGATION.md](docs/PEER-DELEGATION.md).

### Skill behavior tests

Static validators check a skill's shape; behavior tests check that it holds under pressure. A manifest-driven pressure-scenario harness drives 8 scenarios (7 stage skills + `using-gdd`) through time / sunk-cost / authority / exhaustion / scope-minimization pressure and scores responses against a compliance rubric. Behavior tests are opt-in and key-gated (the default `npm test` covers the harness structurally and stays CI-green):

```bash
# Skips + exits 0 when ANTHROPIC_API_KEY is unset.
ANTHROPIC_API_KEY=sk-... GDD_BEHAVIOR_INVOKER=./path/to/invoker.cjs npm run test:behavior
```

See [CONTRIBUTING.md](CONTRIBUTING.md) ("How to add a pressure scenario") for the authoring path.

---

## Security

GDD ships defense-in-depth security:

- **`hooks/gdd-bash-guard.js`** - PreToolUse:Bash blocks ~50 dangerous patterns (`rm -rf /`, `chmod 777`, `curl | sh`, `git reset --hard`, fork bombs) after Unicode NFKC + ANSI normalization.
- **`hooks/gdd-protected-paths.js`** - PreToolUse:Edit/Write/Bash enforces the `protected_paths` glob list.
- **`hooks/gdd-risk-gate.js`** - scores each writer action and blocks only the genuinely dangerous ones.
- **`hooks/gdd-fact-force.js`** - holds the first write to a file until its DesignContext consumers and recorded decisions have been read this session.
- **`hooks/gdd-read-injection-scanner.ts`** - scans inbound Read content for invisible-Unicode + HTML-comment + secret-exfil patterns.
- **`scripts/lib/blast-radius.cjs`** - `design-executor` preflight refuses tasks above `max_files_per_task: 10` / `max_lines_per_task: 400`.
- **`hooks/gdd-mcp-circuit-breaker.js`** - breaks consecutive-timeout loops on MCP-backed connections.

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
> Because GDD generates markdown files that become LLM system prompts, any user-controlled text flowing into `.design/` artifacts is a potential indirect prompt-injection vector. The injection scanner catches such vectors at multiple layers - but defense-in-depth is best practice.

---

## Troubleshooting

**Commands not found after install?** Restart your runtime to reload commands/skills. Verify files exist at `~/.claude/skills/get-design-done/` for global Claude Code installs (or `./.claude/skills/get-design-done/` for local). Run `/gdd:help` to confirm registration.

**Pipeline stuck mid-stage?** `/gdd:resume` restores from the most recent numbered checkpoint. `/gdd:health` diagnoses `.design/` artifact issues. `/gdd:progress --forensic` runs the 6-check integrity audit.

**Cost overruns?** `/gdd:optimize` gives rule-based recommendations. `/gdd:set-profile budget` switches to the budget tier. Set `adaptive_mode: "full"` in `.design/budget.json` so the bandit learns cheap-and-correct tier per agent over 5–10 cycles.

**Using Docker / containers?**

```bash
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

### Uninstalling

```bash
# Per-runtime (replace --claude with any runtime flag)
npx @hegemonart/get-design-done --claude --global --uninstall

# Multi-select interactive uninstall (no runtime flag)
npx @hegemonart/get-design-done --uninstall
```

This removes all GDD commands, agents, hooks, and settings while preserving other configurations.

---

## Feedback

GDD ships a consent-first GitHub issue reporter via the `/gdd:report-issue` slash command. It walks you through reporting an issue or capability gap with a payload preview before submission, local-first and consent-gated. Direct identifiers are replaced with stable pseudonyms (your username, hostname, absolute paths, git identity, env-var values, emails, IPs) - but internal correlation is preserved so maintainers can debug. Set `GDD_DISABLE_ISSUE_REPORTER=1` or add `{ "issue_reporter": false }` to `.design/config.json` to halt submission before any network call.

See [reference/pseudonymization-rules.md](reference/pseudonymization-rules.md) for the rule catalog.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

Architecture ported from `gsd-build/get-shit-done` (MIT - see `NOTICE`). Peer-CLI protocol shapes adapted from `greenpolo/cc-multi-cli` (Apache 2.0). Skill-discipline mechanism ported from [`obra/superpowers`](https://github.com/obra/superpowers) (MIT).

For the full release history, see [CHANGELOG.md](CHANGELOG.md). For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

---

<div align="center">

**Claude Code ships code. Get Design Done makes sure it ships design.**

</div>
