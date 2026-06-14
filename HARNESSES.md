# HARNESSES.md - Harness Capability Matrix

> GENERATED FILE. Do not edit by hand. Source: scripts/lib/manifest/harnesses.json. Regenerate: npm run build:harnesses; CI drift-gates it.

**Last verified:** 2026-06-02

## Capability matrix

| Harness | Status | Command syntax | Skill discovery | Frontmatter fields | MCP | Placeholders | Agents | Hooks | Install path |
|---------|--------|---------------|-----------------|-------------------|-----|-------------|--------|-------|-------------|
| Claude Code (`claude`) | tested | /hone:<skill> | yes | name, description, argument-hint, tools, disable-model-invocation | yes | yes | yes | yes | dist/claude-code/.claude/skills/ |
| OpenAI Codex CLI (`codex`) | experimental | /hone-<skill> | yes | name, description, tools | yes | yes | no | no | dist/codex/.codex/skills/ |
| Gemini CLI (`gemini`) | experimental | /hone:<skill> | yes | name, description, tools | yes | yes | no | no | dist/gemini/.gemini/skills/ |
| Qwen Code (`qwen`) | experimental | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/qwen/.qwen/skills/ |
| Kilo Code (`kilo`) | untested | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/kilo/.kilo/skills/ |
| GitHub Copilot CLI (`copilot`) | experimental | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/copilot/.copilot/skills/ |
| Cursor (`cursor`) | experimental | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/cursor/.cursor/skills/ |
| Windsurf (Cascade) (`windsurf`) | untested | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/windsurf/.windsurf/skills/ |
| Antigravity (`antigravity`) | untested | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/antigravity/.antigravity/skills/ |
| Augment (`augment`) | untested | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/augment/.augment/skills/ |
| Trae (`trae`) | untested | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/trae/.trae/skills/ |
| CodeBuddy (`codebuddy`) | untested | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/codebuddy/.codebuddy/skills/ |
| Cline (`cline`) | untested | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/cline/.cline/skills/ |
| OpenCode (`opencode`) | untested | /hone:<skill> | yes | name, description, tools | no | yes | no | no | dist/opencode/.opencode/skills/ |

> **Agents / Hooks columns:** the GDD sub-agents and the hook layer are
> **Claude-specific**. Only Claude Code receives the 64 sub-agents (via
> `--claude --local`, which installs `agents/`) and the hooks
> (SessionStart / PostToolUse / statusLine). Every other runtime receives the
> compiled **skills only** — its source agents and hooks do not travel. The
> shared skill sources are what get compiled to each runtime; agents and hooks
> are not.

## Status legend

The following status values describe the confidence level for each harness entry:

- **tested** - regression baseline established and independently verified within the last 60 days. Only `tested` harnesses carry a freshness guarantee.
- **experimental** - compiles and has been manually confirmed to work at least once, but no independent regression baseline exists.
- **untested** - configuration compiles and passes static validation, but has never been run end-to-end.
- **known-broken** - known open issues prevent reliable operation.

Note: only `tested` harnesses carry a freshness guarantee. All other statuses indicate varying degrees of uncertainty about real-world behavior.

## Per-harness details

### Claude Code (`claude`)

- **Status:** tested
- **Install path:** `dist/claude-code/.claude/skills/`
- **Agents:** yes
- **Hooks:** yes
- **Notes:** Host runtime. Marketplace-registered, end-to-end documented, Phase 42 golden baseline. Sole runtime that receives the 64 sub-agents (claude --local installs agents/) and the hook layer (SessionStart / PostToolUse / statusLine).
- **Deep dives:** [claude---claude-code-status-verified](reference/runtime-models.md#claude---claude-code-status-verified)

### OpenAI Codex CLI (`codex`)

- **Status:** experimental
- **Install path:** `dist/codex/.codex/skills/`
- **Agents:** no
- **Hooks:** no
- **Notes:** Peer-CLI delegation target (ASP). Flat /hone- command namespace. MCP auto-registered.
- **Deep dives:** [codex---openai-codex-cli-status-verified](reference/runtime-models.md#codex---openai-codex-cli-status-verified), [tool-name-mapping](reference/codex-tools.md#tool-name-mapping), [codex-asp](reference/peer-cli-capabilities.md#codex-asp), [asp---app-server-protocol-codex](reference/peer-protocols.md#asp---app-server-protocol-codex)

### Gemini CLI (`gemini`)

- **Status:** experimental
- **Install path:** `dist/gemini/.gemini/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [gemini---gemini-cli-status-verified](reference/runtime-models.md#gemini---gemini-cli-status-verified), [tool-name-mapping](reference/gemini-tools.md#tool-name-mapping), [gemini-acp](reference/peer-cli-capabilities.md#gemini-acp), [acp---agent-client-protocol](reference/peer-protocols.md#acp---agent-client-protocol)

### Qwen Code (`qwen`)

- **Status:** experimental
- **Install path:** `dist/qwen/.qwen/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [qwen---qwen-code-status-verified](reference/runtime-models.md#qwen---qwen-code-status-verified), [qwen-acp](reference/peer-cli-capabilities.md#qwen-acp), [acp---agent-client-protocol](reference/peer-protocols.md#acp---agent-client-protocol)

### Kilo Code (`kilo`)

- **Status:** untested
- **Install path:** `dist/kilo/.kilo/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [kilo---kilo-code-status-byok](reference/runtime-models.md#kilo---kilo-code-status-byok)

### GitHub Copilot CLI (`copilot`)

- **Status:** experimental
- **Install path:** `dist/copilot/.copilot/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [copilot---github-copilot-cli-status-byok](reference/runtime-models.md#copilot---github-copilot-cli-status-byok), [copilot-acp](reference/peer-cli-capabilities.md#copilot-acp), [acp---agent-client-protocol](reference/peer-protocols.md#acp---agent-client-protocol)

### Cursor (`cursor`)

- **Status:** experimental
- **Install path:** `dist/cursor/.cursor/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [cursor---cursor-status-byok](reference/runtime-models.md#cursor---cursor-status-byok), [cursor-acp](reference/peer-cli-capabilities.md#cursor-acp), [acp---agent-client-protocol](reference/peer-protocols.md#acp---agent-client-protocol)

### Windsurf (Cascade) (`windsurf`)

- **Status:** untested
- **Install path:** `dist/windsurf/.windsurf/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [windsurf---windsurf-status-byok](reference/runtime-models.md#windsurf---windsurf-status-byok)

### Antigravity (`antigravity`)

- **Status:** untested
- **Install path:** `dist/antigravity/.antigravity/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [antigravity---antigravity-status-unverified](reference/runtime-models.md#antigravity---antigravity-status-unverified)

### Augment (`augment`)

- **Status:** untested
- **Install path:** `dist/augment/.augment/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [augment---augment-status-byok](reference/runtime-models.md#augment---augment-status-byok)

### Trae (`trae`)

- **Status:** untested
- **Install path:** `dist/trae/.trae/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [trae---trae-status-unverified](reference/runtime-models.md#trae---trae-status-unverified)

### CodeBuddy (`codebuddy`)

- **Status:** untested
- **Install path:** `dist/codebuddy/.codebuddy/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [codebuddy---codebuddy-status-byok](reference/runtime-models.md#codebuddy---codebuddy-status-byok)

### Cline (`cline`)

- **Status:** untested
- **Install path:** `dist/cline/.cline/skills/`
- **Agents:** no
- **Hooks:** no
- **Notes:** Installs into .clinerules at install time (clinerules-embed special case); dist/cline/ is the compile artifact only.
- **Deep dives:** [cline---cline-status-byok](reference/runtime-models.md#cline---cline-status-byok)

### OpenCode (`opencode`)

- **Status:** untested
- **Install path:** `dist/opencode/.opencode/skills/`
- **Agents:** no
- **Hooks:** no
- **Deep dives:** [opencode---opencode-status-byok](reference/runtime-models.md#opencode---opencode-status-byok)
