<div align="center">

# GET DESIGN DONE

**English** · [简体中文](docs/i18n/README.zh-CN.md) · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [Français](docs/i18n/README.fr.md) · [Italiano](docs/i18n/README.it.md) · [Deutsch](docs/i18n/README.de.md)

**A design-quality pipeline for AI coding agents: brief -> explore -> plan -> design -> verify.**

**Get Design Done keeps AI-generated UI tied to your brief, your design system, your local design knowledge, and your quality gates. Built for Claude Code, and installs across Codex, Cursor, Gemini, OpenCode, Copilot, Windsurf, and more.**

[![npm version](https://img.shields.io/npm/v/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/get-design-done/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/get-design-done?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/get-design-done)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge)](LICENSE)

```bash
npx @hegemonart/get-design-done@latest
```

**Works on macOS, Linux, and Windows.**

[Install](#install) · [Quickstart](#quickstart) · [Use Cases](#use-cases) · [How It Works](#how-it-works) · [Commands](#commands) · [Connections](#connections) · [Safety](#safety-and-privacy)

</div>

---

## What It Is

Get Design Done helps AI coding agents ship UI that belongs in your product.

It turns loose requests like "make this screen better" into a traceable design workflow: brief, explore, plan, design, verify.

Instead of asking an agent to improvise from taste alone, GDD gives it a structured process, local design knowledge, project-specific memory, optional design-tool connections, and verification before the work ships.

## Why It Exists

AI agents are fast at producing UI. The hard part is making that UI coherent.

Without a design workflow, generated interfaces drift:

- colors and spacing stop matching the system
- components get reinvented
- contrast and accessibility regress
- hierarchy changes from screen to screen
- implementation no longer matches the original brief

GDD adds the missing design discipline around AI coding workflows. It captures the problem, maps the current design system, plans scoped changes, executes them in atomic steps, and verifies the result against the brief, tokens, accessibility, and design-quality rubrics.

Behind the scenes: 64 specialized agents, a queryable intel store, tier-aware model routing, and 39 optional tool connections. What you use day to day is a handful of `/gdd:*` commands.

## Install

### npm

```bash
npx @hegemonart/get-design-done@latest
```

### Claude Code

```bash
/plugin marketplace add hegemonart/hone
/plugin install get-design-done@get-design-done
/reload-plugins
```

### Codex

```bash
codex plugin marketplace add hegemonart/hone
```

### agentskills.io

Browse and install Get Design Done from the [agentskills.io](https://agentskills.io) skills registry.

### Direct runtime installer

```bash
# Claude Code
npx @hegemonart/get-design-done --claude --global
npx @hegemonart/get-design-done --claude --local

# Other runtimes
npx @hegemonart/get-design-done --codex --global
npx @hegemonart/get-design-done --cursor --global
npx @hegemonart/get-design-done --gemini --global

# Multi-runtime install
npx @hegemonart/get-design-done --all --global

# Preview without writing
npx @hegemonart/get-design-done --dry-run
```

## Quickstart

Run a lightweight first pass:

```bash
/gdd:start
```

Or run the full design cycle:

```bash
/gdd:brief
/gdd:explore
/gdd:plan
/gdd:design
/gdd:verify
```

For natural-language routing:

```bash
/gdd:do improve the checkout page hierarchy, spacing, and empty states
```

## Use Cases

### Improve An Existing Screen

Use GDD when a screen works technically but feels visually inconsistent, unclear, or under-designed.

```bash
/gdd:do improve the settings page layout and component hierarchy
```

### Bring AI Output Back To The Design System

Use it when an agent generated UI that looks plausible but does not match your tokens, spacing, states, or components.

```bash
/gdd:verify
```

### Audit Before Shipping

Run verification before a PR, release, or design handoff.

```bash
/gdd:audit
```

### Fix Dark Mode

```bash
/gdd:darkmode
```

### Import A Design Handoff

```bash
/gdd:handoff ./my-design.html
```

This parses a Claude Design bundle, extracts CSS custom properties into design decisions, and runs handoff faithfulness checks.

### Make A Small Focused Fix

```bash
/gdd:fast "fix contrast in pricing cards"
```

## What Makes It Different

### Local Design Knowledge

GDD ships with an extensive local reference library for design work. Agents can use it without relying on live web search for basic design judgment.

It covers accessibility, WCAG, typography, spacing, grids, color, contrast, surfaces, motion, UX writing, forms, empty states, visual hierarchy, dark mode, responsive behavior, i18n, research methods, audit scoring, and design anti-patterns.

The agent is not starting from a blank prompt. It has a shared design vocabulary and concrete standards it can apply during planning, implementation, and verification.

Full map: [docs/KNOWLEDGE-BASE.md](docs/KNOWLEDGE-BASE.md)

### Project-Specific Memory

GDD creates a `.design/` workspace that keeps each cycle grounded:

| Artifact | Purpose |
| --- | --- |
| `.design/BRIEF.md` | Problem, audience, scope, success metrics |
| `.design/DESIGN.md` | Current design-system snapshot |
| `.design/DESIGN-CONTEXT.md` | Decisions, constraints, references |
| `.design/DESIGN-PLAN.md` | Atomic implementation plan |
| `.design/DESIGN-VERIFICATION.md` | Final audit and gap report |
| `.design/intel/` | Queryable project knowledge: tokens, components, relationships, decisions |
| `.design/archive/` | Completed cycle history and learnings |

The longer you use it, the less the agent has to rediscover.

### Verification Before Shipping

GDD does not stop when the UI "looks done."

The verify stage checks whether the result still matches:

- the original brief
- design-system tokens
- accessibility thresholds
- component conventions
- visual hierarchy
- motion and interaction rules
- recorded design decisions

When gaps appear, GDD produces a structured fix list instead of leaving review to vibes.

### Skill behavior tests

GDD's own skills are exercised under adversarial pressure scenarios (time pressure, sunk-cost, authority, scope-minimization) to confirm they hold their discipline rather than caving. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a pressure scenario.

## How It Works

```text
Brief -> Explore -> Plan -> Design -> Verify -> Ship
```

| Stage | Command | Output |
| --- | --- | --- |
| Brief | `/gdd:brief` | Captures the design problem |
| Explore | `/gdd:explore` | Maps UI system, debt, tokens, components |
| Plan | `/gdd:plan` | Creates atomic design tasks |
| Design | `/gdd:design` | Executes tasks with validation |
| Verify | `/gdd:verify` | Audits final result |

### Core Outputs

| File | What it does |
| --- | --- |
| `.design/BRIEF.md` | The cycle's problem, audience, success metrics |
| `.design/DESIGN.md` | Current design-system snapshot |
| `.design/DESIGN-CONTEXT.md` | Design decisions and constraints |
| `.design/DESIGN-PLAN.md` | Atomic tasks, waves, dependencies |
| `.design/DESIGN-VERIFICATION.md` | Verification result and gap list |
| `.design/intel/` | Queryable knowledge layer for this project |

## Commands

GDD ships 96 skills. These are the ones most users need day to day. For the full reference see [SKILL.md](SKILL.md).

### Core Pipeline

| Command | Purpose |
| --- | --- |
| `/gdd:brief` | Capture the design brief |
| `/gdd:explore` | Inventory the current UI system |
| `/gdd:plan` | Produce the design plan |
| `/gdd:design` | Execute the plan |
| `/gdd:verify` | Verify the result |
| `/gdd:ship` | Prepare a clean PR branch |
| `/gdd:next` | Auto-route to the next stage |

### Daily Use

| Command | Purpose |
| --- | --- |
| `/gdd:do <task>` | Natural-language router |
| `/gdd:fast <task>` | Small focused fix |
| `/gdd:quick` | Lightweight task flow |
| `/gdd:audit` | Design quality audit |
| `/gdd:darkmode` | Dark-mode audit |
| `/gdd:style <component>` | Component style handoff |
| `/gdd:health` | Diagnose pipeline state |
| `/gdd:progress` | Show current cycle progress |
| `/gdd:resume` | Resume from checkpoint |

### Design Tools And Handoff

| Command | Purpose |
| --- | --- |
| `/gdd:connections` | Configure optional integrations |
| `/gdd:figma-extract` | Extract Figma design-system context |
| `/gdd:figma-write` | Write decisions and status back to Figma |
| `/gdd:handoff <bundle>` | Import a Claude Design bundle |
| `/gdd:sketch <idea>` | Generate multi-variant HTML mockups |
| `/gdd:spike <idea>` | Timeboxed feasibility pass |

Full command reference: [SKILL.md](SKILL.md)

## Connections

GDD works without external tools, but can connect to 39 optional integrations. All are optional; the pipeline degrades gracefully to fallbacks when any connection is unavailable.

The connection layer spans these categories:

- **Design surfaces** - Figma (read + write + Code Connect), paper.design, pencil.dev, Penpot, Framer, Webflow, Plasmic
- **Reference and research** - Refero, Pinterest, Lazyweb, Mobbin, Claude Design handoff
- **Component generation** - 21st.dev Magic, Magic Patterns, v0.dev, Builder.io
- **Component spec and visual QA** - Storybook, Chromatic, Preview (Playwright + Claude Preview MCP)
- **Knowledge graph** - Graphify
- **Native and non-web output** - Xcode Simulator, Android Emulator, Litmus / Email-on-Acid, print renderer
- **Motion verification** - Lottie, Rive
- **Team surfaces** - Slack, Discord, Linear, Jira, Notion, GitHub PR

Configure integrations with:

```bash
/gdd:connections
```

For the full connection list with probe patterns, see [connections/connections.md](connections/connections.md).

## Requirements

- Node.js 22 or 24
- Git
- A supported AI coding runtime

## Multi-Runtime Support

GDD installs across 14 AI coding runtimes: Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Kilo, Copilot, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, and Cline. The same source **skills** are compiled to each runtime's native layout (`skills/`, `command/`, or `.clinerules`) by per-runtime converters, so the skill pipeline travels with you across editors. The sub-agents and the hook layer are **Claude-specific** - they do not travel to the other runtimes (see the Agents/Hooks columns in [HARNESSES.md](HARNESSES.md)).

Claude Code is the flagship. The full experience runs there end to end: every sub-agent (installed via `--claude --local` into `agents/`), the defense-in-depth hooks, and the MCP-backed connections. On the other runtimes you get the same **skills** in their native shape, and MCP-backed connections light up on the MCP-capable hosts - but the sub-agents and the hook layer are Claude Code-only.

## Safety And Privacy

GDD is local-first by default. It writes project artifacts under `.design/`, uses optional integrations only when configured, and keeps issue reporting consent-gated.

The plugin includes defense-in-depth hooks for protected paths, dangerous-command blocking, injection scanning, MCP circuit breaking, and budget enforcement. GDD also exposes 13 read-only MCP tools for safe project introspection.

Add sensitive paths to your runtime's deny list:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

Read: [SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md)

## Updating

```bash
npx @hegemonart/get-design-done@latest
```

Or from inside Claude Code:

```bash
/gdd:update
```

For the full release history, see [CHANGELOG.md](CHANGELOG.md).

## Troubleshooting

### Commands Do Not Appear

Restart your runtime and run:

```bash
/gdd:help
```

### Pipeline Is Stuck

```bash
/gdd:health
/gdd:resume
```

### Cost Is Too High

```bash
/gdd:optimize
```

## Contributing

```bash
npm install
npm test
npm run typecheck
```

Read: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

Apache-2.0 License. See [LICENSE](LICENSE) for details. Third-party attributions are listed in [NOTICE](NOTICE).

---

<div align="center">

**Claude Code ships code. Get Design Done makes sure it ships design.**

</div>
