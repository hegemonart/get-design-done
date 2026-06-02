# HARNESSES.md - Harness Capability Matrix

> GENERATED FILE. Do not edit by hand. Source: scripts/lib/manifest/harnesses.json. Regenerate: npm run build:harnesses; CI drift-gates it.

**Last verified:** 2026-06-02

## Capability matrix

| Harness | Status | Command syntax | Skill discovery | Frontmatter fields | MCP | Placeholders | Install path |
|---------|--------|---------------|-----------------|-------------------|-----|-------------|-------------|
| Claude Code (`claude`) | tested | /gdd:<skill> | yes | name, description, argument-hint, tools, disable-model-invocation | yes | yes | dist/claude-code/.claude/skills/ |
| OpenAI Codex CLI (`codex`) | experimental | /gdd-<skill> | yes | name, description, tools | yes | yes | dist/codex/.codex/skills/ |
| Gemini CLI (`gemini`) | experimental | /gdd:<skill> | yes | name, description, tools | yes | yes | dist/gemini/.gemini/skills/ |
| Qwen Code (`qwen`) | experimental | /gdd:<skill> | yes | name, description, tools | no | yes | dist/qwen/.qwen/skills/ |
| Kilo Code (`kilo`) | untested | /gdd:<skill> | yes | name, description, tools | no | yes | dist/kilo/.kilo/skills/ |
| GitHub Copilot CLI (`copilot`) | experimental | /gdd:<skill> | yes | name, description, tools | no | yes | dist/copilot/.copilot/skills/ |
| Cursor (`cursor`) | experimental | /gdd:<skill> | yes | name, description, tools | no | yes | dist/cursor/.cursor/skills/ |
| Windsurf (Cascade) (`windsurf`) | untested | /gdd:<skill> | yes | name, description, tools | no | yes | dist/windsurf/.windsurf/skills/ |
| Antigravity (`antigravity`) | untested | /gdd:<skill> | yes | name, description, tools | no | yes | dist/antigravity/.antigravity/skills/ |
| Augment (`augment`) | untested | /gdd:<skill> | yes | name, description, tools | no | yes | dist/augment/.augment/skills/ |
| Trae (`trae`) | untested | /gdd:<skill> | yes | name, description, tools | no | yes | dist/trae/.trae/skills/ |
| CodeBuddy (`codebuddy`) | untested | /gdd:<skill> | yes | name, description, tools | no | yes | dist/codebuddy/.codebuddy/skills/ |
| Cline (`cline`) | untested | /gdd:<skill> | yes | name, description, tools | no | yes | dist/cline/.cline/skills/ |
| OpenCode (`opencode`) | untested | /gdd:<skill> | yes | name, description, tools | no | yes | dist/opencode/.opencode/skills/ |

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
- **Notes:** Host runtime. Marketplace-registered, end-to-end documented, Phase 42 golden baseline.
- **Deep dives:** [claude---claude-code](reference/runtime-models.md#claude---claude-code)

### OpenAI Codex CLI (`codex`)

- **Status:** experimental
- **Install path:** `dist/codex/.codex/skills/`
- **Notes:** Peer-CLI delegation target (ASP). Flat /gdd- command namespace. MCP auto-registered.
- **Deep dives:** [codex---openai-codex-cli](reference/runtime-models.md#codex---openai-codex-cli), [tool-name-mapping](reference/codex-tools.md#tool-name-mapping), [codex-asp](reference/peer-cli-capabilities.md#codex-asp), [asp---app-server-protocol-codex](reference/peer-protocols.md#asp---app-server-protocol-codex)

### Gemini CLI (`gemini`)

- **Status:** experimental
- **Install path:** `dist/gemini/.gemini/skills/`
- **Deep dives:** [gemini---gemini-cli](reference/runtime-models.md#gemini---gemini-cli), [tool-name-mapping](reference/gemini-tools.md#tool-name-mapping), [gemini-acp](reference/peer-cli-capabilities.md#gemini-acp), [acp---agent-client-protocol](reference/peer-protocols.md#acp---agent-client-protocol)

### Qwen Code (`qwen`)

- **Status:** experimental
- **Install path:** `dist/qwen/.qwen/skills/`
- **Deep dives:** [qwen---qwen-code](reference/runtime-models.md#qwen---qwen-code), [qwen-acp](reference/peer-cli-capabilities.md#qwen-acp), [acp---agent-client-protocol](reference/peer-protocols.md#acp---agent-client-protocol)

### Kilo Code (`kilo`)

- **Status:** untested
- **Install path:** `dist/kilo/.kilo/skills/`
- **Deep dives:** [kilo---kilo-code](reference/runtime-models.md#kilo---kilo-code)

### GitHub Copilot CLI (`copilot`)

- **Status:** experimental
- **Install path:** `dist/copilot/.copilot/skills/`
- **Deep dives:** [copilot---github-copilot-cli](reference/runtime-models.md#copilot---github-copilot-cli), [copilot-acp](reference/peer-cli-capabilities.md#copilot-acp), [acp---agent-client-protocol](reference/peer-protocols.md#acp---agent-client-protocol)

### Cursor (`cursor`)

- **Status:** experimental
- **Install path:** `dist/cursor/.cursor/skills/`
- **Deep dives:** [cursor---cursor](reference/runtime-models.md#cursor---cursor), [cursor-acp](reference/peer-cli-capabilities.md#cursor-acp), [acp---agent-client-protocol](reference/peer-protocols.md#acp---agent-client-protocol)

### Windsurf (Cascade) (`windsurf`)

- **Status:** untested
- **Install path:** `dist/windsurf/.windsurf/skills/`
- **Deep dives:** [windsurf---windsurf](reference/runtime-models.md#windsurf---windsurf)

### Antigravity (`antigravity`)

- **Status:** untested
- **Install path:** `dist/antigravity/.antigravity/skills/`
- **Deep dives:** [antigravity---antigravity](reference/runtime-models.md#antigravity---antigravity)

### Augment (`augment`)

- **Status:** untested
- **Install path:** `dist/augment/.augment/skills/`
- **Deep dives:** [augment---augment](reference/runtime-models.md#augment---augment)

### Trae (`trae`)

- **Status:** untested
- **Install path:** `dist/trae/.trae/skills/`
- **Deep dives:** [trae---trae](reference/runtime-models.md#trae---trae)

### CodeBuddy (`codebuddy`)

- **Status:** untested
- **Install path:** `dist/codebuddy/.codebuddy/skills/`
- **Deep dives:** [codebuddy---codebuddy](reference/runtime-models.md#codebuddy---codebuddy)

### Cline (`cline`)

- **Status:** untested
- **Install path:** `dist/cline/.cline/skills/`
- **Notes:** Installs into .clinerules at install time (clinerules-embed special case); dist/cline/ is the compile artifact only.
- **Deep dives:** [cline---cline](reference/runtime-models.md#cline---cline)

### OpenCode (`opencode`)

- **Status:** untested
- **Install path:** `dist/opencode/.opencode/skills/`
- **Deep dives:** [opencode---opencode](reference/runtime-models.md#opencode---opencode)
