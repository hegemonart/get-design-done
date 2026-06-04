---
name: connections-onboarding
type: meta-rules
version: 1.0.0
phase: 28.5
tags: [connections, onboarding, probes, mcp, wizard, procedure, extracted]
last_updated: 2026-05-18
---

Source: extracted from `skills/connections/SKILL.md` (Phase 28.5 rework - D-10 extract-then-link).
The skill's essential routing + invocation-mode dispatch stays in `../skills/connections/SKILL.md`;
this file holds the 33 probe scripts, bucket categorization, per-connection setup screen,
auto-run eligibility matrix, value-prop one-liners, and STATE.md / config.json write contracts.

# Connections Onboarding Procedure

Detailed procedure for the `{{command_prefix}}connections` interactive wizard - companion to
`../skills/connections/SKILL.md`. Read this file when executing a specific probe, deciding
auto-run vs manual, writing config.json, or merging STATE.md `<connections>`. The SKILL.md
keeps the essential top-level flow + AskUserQuestion routing; this file holds the deep
methodology + per-connection detail.

For the cross-skill probe pattern + connection handshake (ToolSearch → live call → STATE.md
write), see `./shared-preamble.md#connection-handshake-summary`. The canonical per-connection
specs (setup commands, OAuth flows, capability matrix) live in `../connections/<name>.md` -
this file does NOT duplicate them; it points at them by name.

---

## Step 1 - Probe all 33 connections

Run every probe below in order. MCP probes call `ToolSearch` first (deferred tools fail silently without it). Write every result to `STATE.md <connections>` when done.

### MCP-based probes

**figma:**
```
ToolSearch({ query: "select:mcp__figma__get_metadata", max_results: 1 })
→ Empty       → figma: not_configured
→ Non-empty   → call mcp__figma__get_metadata
                Success → figma: available
                Error   → figma: unavailable
```

**refero:**
```
ToolSearch({ query: "refero", max_results: 5 })
→ Empty → refero: not_configured
→ Non-empty → refero: available
```

**preview:**
```
ToolSearch({ query: "Claude_Preview", max_results: 5 })
→ Empty → preview: not_configured
→ Non-empty → call mcp__Claude_Preview__preview_list
              Success → preview: available
              Error   → preview: unavailable
```

**pinterest:**
```
ToolSearch({ query: "mcp-pinterest", max_results: 5 })
→ Empty → pinterest: not_configured
→ Non-empty → pinterest: available
```

**paper-design:**
```
ToolSearch({ query: "mcp__paper", max_results: 5 })
→ Empty → paper_design: not_configured
→ Non-empty → paper_design: available
```

**21st-dev:**
```
ToolSearch({ query: "mcp__21st", max_results: 5 })
→ Empty → twenty_first: not_configured
→ Non-empty → twenty_first: available
```

**magic-patterns:**
```
ToolSearch({ query: "mcp__magic_patterns", max_results: 5 })
→ Empty → magic_patterns: not_configured
→ Non-empty → magic_patterns: available
```

**lazyweb:** (discover Tier 1 - free, tried first; D-01)
```
ToolSearch({ query: "lazyweb", max_results: 5 })
→ Empty → lazyweb: not_configured
→ Non-empty → lazyweb: available
```

**mobbin:** (discover Tier 2 - paid, mobile/flow-level; D-01)
```
ToolSearch({ query: "mobbin", max_results: 5 })
→ Empty → mobbin: not_configured
→ Non-empty → mobbin: available
```

**slack:** (notify - Team Surfaces, env-based)
```
Bash: test -n "$SLACK_WEBHOOK_URL"  (and GDD_DISABLE_SLACK != 1)
→ empty / disabled → slack: not_configured
→ non-empty        → slack: available
```

**discord:** (notify - parity, env-based)
```
Bash: test -n "$DISCORD_WEBHOOK_URL"  (and GDD_DISABLE_DISCORD != 1)
→ empty / disabled → discord: not_configured
→ non-empty        → discord: available
```

**linear:** (ticket-sync - MCP)
```
ToolSearch({ query: "linear", max_results: 5 })
→ Empty / GDD_DISABLE_LINEAR=1 → linear: not_configured
→ Non-empty                    → linear: available
```

**jira:** (ticket-sync - Atlassian MCP)
```
ToolSearch({ query: "atlassian jira", max_results: 5 })
→ Empty / GDD_DISABLE_JIRA=1   → jira: not_configured
→ Non-empty                    → jira: available
```

**notion:** (export write-path - MCP)
```
ToolSearch({ query: "notion", max_results: 5 })
→ Empty / GDD_DISABLE_NOTION=1 → notion: not_configured
→ Non-empty                    → notion: available
```

### Non-MCP probes

**storybook** (HTTP):
```
Bash: curl -sf http://localhost:6006/index.json 2>/dev/null
  → Success → storybook: available
  → Fail    → curl -sf http://localhost:6006/stories.json 2>/dev/null
              Success → storybook: available
              Fail    → storybook: not_configured
```

**chromatic** (CLI + env):
```
Bash: command -v chromatic >/dev/null 2>&1 || npx --yes chromatic --version 2>/dev/null
  → Fail (non-zero) → chromatic: not_configured
  → Success         → check env CHROMATIC_PROJECT_TOKEN
                      Empty → chromatic: unavailable
                      Set   → chromatic: available
```

**graphify** (native CLI + file):
```
Bash: node -e "try{const c=JSON.parse(require('fs').readFileSync('.design/config.json','utf8'));process.stdout.write(String(c.graphify?.enabled===true))}catch{process.stdout.write('false')}"
  → false → graphify: not_configured
  → true  → Bash: node bin/gdd-graph status --format json
                   → { configured: true, exists: false } → graphify: unavailable
                   → { configured: true, exists: true }  → graphify: available
```

**pencil-dev** (file probe):
```
Bash: find . -name "*.pen" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -1
  → Empty       → pencil_dev: not_configured
  → Non-empty   → pencil_dev: available
```

**claude-design** (file probe - handoff bundle):
```
Bash: ls .design/handoff/ 2>/dev/null || find . -maxdepth 3 \
        \( -name "*.claude-design.html" -o -name "*.claude-design.zip" \
           -o -name "claude-design-*.html" \) 2>/dev/null | head -1
  → Empty     → claude_design: not_configured
  → Non-empty → claude_design: available
```

**lottie** (file probe - Lottie JSON motion export):
```
Bash: find . -name "*.json" -not -path "*/node_modules/*" 2>/dev/null | head   (confirm the Lottie signature: top-level v / fr / layers)
      grep -lE '"lottie-web"|@lottiefiles|lottie-react' package.json 2>/dev/null
  → Lottie exports or a lottie dep found → lottie: available
  → none                                → lottie: not_configured
```

**rive** (file probe - Rive .riv motion export):
```
Bash: find . -name "*.riv" -not -path "*/node_modules/*" 2>/dev/null | head
      grep -E '@rive-app|rive-react' package.json 2>/dev/null
  → .riv files or a @rive-app dep found → rive: available
  → none                               → rive: not_configured
```

**framer:** (AI-native Wave 2 - canvas; MCP or API token)
```
ToolSearch({ query: "framer", max_results: 5 })
→ Empty → framer: not_configured
→ Non-empty → framer: available
```

**penpot:** (AI-native Wave 2 - canvas; self-hosted URL/token or cloud)
```
ToolSearch({ query: "penpot", max_results: 5 })
→ Empty → penpot: not_configured
→ Non-empty → penpot: available
```

**webflow:** (AI-native Wave 2 - generator; MCP or WEBFLOW token)
```
ToolSearch({ query: "webflow", max_results: 5 })
→ Empty → webflow: not_configured
→ Non-empty → webflow: available
```

**v0-dev:** (AI-native Wave 2 - generator; MCP-first, else V0_API_KEY)
```
ToolSearch({ query: "v0", max_results: 5 })
→ Empty → v0-dev: not_configured
→ Non-empty → v0-dev: available
```

**plasmic:** (AI-native Wave 2 - generator+canvas; MCP or token)
```
ToolSearch({ query: "plasmic", max_results: 5 })
→ Empty → plasmic: not_configured
→ Non-empty → plasmic: available
```

**builder-io:** (AI-native Wave 2 - generator; MCP-first, else BUILDER_API_KEY)
```
ToolSearch({ query: "builder", max_results: 5 })
→ Empty → builder-io: not_configured
→ Non-empty → builder-io: available
```

**launchdarkly:** (Outcome - experiment-source; read-only A/B)
```
ToolSearch({ query: "launchdarkly", max_results: 5 })  (else check the platform API-key env)
→ Empty / GDD_DISABLE_LAUNCHDARKLY=1 → launchdarkly: not_configured
→ Non-empty / key set                       → launchdarkly: available
```

**statsig:** (Outcome - experiment-source; read-only)
```
ToolSearch({ query: "statsig", max_results: 5 })  (else check the platform API-key env)
→ Empty / GDD_DISABLE_STATSIG=1 → statsig: not_configured
→ Non-empty / key set                       → statsig: available
```

**growthbook:** (Outcome - experiment-source; self-host/cloud)
```
ToolSearch({ query: "growthbook", max_results: 5 })  (else check the platform API-key env)
→ Empty / GDD_DISABLE_GROWTHBOOK=1 → growthbook: not_configured
→ Non-empty / key set                       → growthbook: available
```

**usertesting:** (Outcome - user-research; pseudonymize-first)
```
ToolSearch({ query: "usertesting", max_results: 5 })  (else check the platform API-key env)
→ Empty / GDD_DISABLE_USERTESTING=1 → usertesting: not_configured
→ Non-empty / key set                       → usertesting: available
```

**maze:** (Outcome - user-research; pseudonymize-first)
```
ToolSearch({ query: "maze", max_results: 5 })  (else check the platform API-key env)
→ Empty / GDD_DISABLE_MAZE=1 → maze: not_configured
→ Non-empty / key set                       → maze: available
```

**hotjar:** (Outcome - user-research; indexed insights only)
```
ToolSearch({ query: "hotjar", max_results: 5 })  (else check the platform API-key env)
→ Empty / GDD_DISABLE_HOTJAR=1 → hotjar: not_configured
→ Non-empty / key set                       → hotjar: available
```

After all 33 probes complete, merge results into `STATE.md <connections>`. Preserve the three-value schema verbatim (`available | unavailable | not_configured`). Do not add new values.

---

## Step 2 - Bucket categorization

### Project-hint detection

Run once, cache in-memory:

```bash
HAS_TAILWIND=$( ls tailwind.config.* 2>/dev/null | head -1 )
HAS_STORYBOOK_DIR=$( test -d .storybook && echo yes )
HAS_PEN_FILES=$( find . -name "*.pen" -not -path "*/node_modules/*" 2>/dev/null | head -1 )
HAS_REACT=$( grep -l '"react"' package.json 2>/dev/null )
HAS_FIGMA_HINT=$( grep -r "figma\.com/file" -l . --include="*.md" 2>/dev/null | head -1 )
```

### Bucketing rules

| Bucket | Criteria |
|---|---|
| **available** | probe returned `available` |
| **recommended** | probe returned `not_configured` AND matches a project hint below |
| **optional** | probe returned `not_configured` AND no project hint match |
| **skipped** | name appears in `config.json connections.skip[]` |
| **unavailable** | probe returned `unavailable` (configured but broken - needs attention) |

### Recommendation mapping

| Project hint | Recommend |
|---|---|
| `HAS_TAILWIND` or `HAS_FIGMA_HINT` | figma |
| `HAS_STORYBOOK_DIR` or storybook available | storybook, chromatic |
| `HAS_PEN_FILES` | pencil-dev |
| `HAS_REACT` | 21st-dev, magic-patterns |
| Always | refero, preview, lazyweb (free - cost-aware default, D-01) |

---

## Step 3 - Summary table

```
┌── Connections ──────────────────────────
Available (<N>)
  • <name>             <one-line detail from probe>
  ...

Unavailable (<N>) — configured but not responding
  ⚠ <name>             <reason>
  ...

Recommended for this project (<N>)
  ▸ <name>             <one-line value prop>
  ...

Optional (<N>)
  ▸ <name>             <one-line value prop>
  ...

Skipped by you (<N>)
  · <name>             (re-enable: {{command_prefix}}connections <name>)
─────────────────────────────────────────
```

One-line value props (use verbatim):

| Name | Value prop |
|---|---|
| figma | design-token extraction, annotations, Code Connect |
| refero | design reference search for discover stage |
| preview | live browser screenshots for verify visual checks |
| storybook | component inventory + per-story a11y |
| chromatic | visual regression against your Storybook baseline |
| graphify | knowledge-graph queries over component–token–decision |
| pinterest | visual inspiration collection |
| claude-design | Claude Design handoff bundle ingestion |
| paper-design | bidirectional canvas (free tier: 100 calls/week) |
| pencil-dev | `.pen` spec files as canonical design source |
| 21st-dev | AI component generator (marketplace search) |
| magic-patterns | AI component generator (DS-aware) |
| lazyweb | free design reference search (pricing/onboarding/redesign) - discover Tier 1 |
| mobbin | curated mobile + flow-level references (paid) - discover Tier 2 |
| slack | notify - route verify-fail/audit-pass/ship to a Slack channel (redacted) |
| discord | notify - route pipeline events to a Discord channel (redacted) |
| linear | ticket-sync - link a cycle to a Linear issue; read comments + transition on completion |
| jira | ticket-sync - parity with Linear via the Atlassian MCP |
| notion | export - `{{command_prefix}}export --format notion` writes a stakeholder page (degrade-to-HTML) |
| lottie | verify - Lottie JSON motion check (frame-rate / duration / bloat / perf-budget), WARN-never-block |
| rive | verify - Rive `.riv` motion check (size + state-machine reachability via the opt-in runtime), WARN-never-block |
| framer | design - read Framer frames + write proposals (canvas, Wave 2) |
| penpot | design - open-source Figma alt; read boards (self-hosted or cloud) |
| webflow | design - read site structure as an adaptation source (Wave 2) |
| v0-dev | generator - Vercel v0 prompt→component (MCP-first → REST + V0_API_KEY) |
| plasmic | generator + canvas - emit code + read the Plasmic canvas |
| builder-io | generator - Builder.io Visual Copilot (pull-only this phase) |
| launchdarkly | outcome - read A/B results → design_arms posterior (experiment-source) |
| statsig | outcome - read experiment/pulse results → design_arms (experiment-source) |
| growthbook | outcome - read experiment results → design_arms (experiment-source; OSS) |
| usertesting | outcome - read test reports → brief findings (user-research; pseudonymized) |
| maze | outcome - read usability metrics → brief findings (user-research; pseudonymized) |
| hotjar | outcome - read indexed insights → brief findings (user-research; pseudonymized) |

---

## Step 4 - Route by mode

### Mode: `list` or `--auto`

After printing the summary, write STATE.md, append one-line hint: `Run {{command_prefix}}connections to configure.` Emit `## CONNECTIONS COMPLETE`. Exit.

### Mode: `<connection-name>`

Skip the top-level AskUserQuestion. Jump directly to Step 5 for that single connection.

### Mode: interactive (default)

AskUserQuestion:

```
question: "What would you like to do?"
options:
  - "Configure recommended (<N>)"     → loop Step 5 over recommended bucket
  - "Pick one by one"                 → loop Step 5 over all not_configured
  - "Configure all optional"          → loop Step 5 over optional bucket
  - "Re-check a specific connection"  → prompt for name, run Step 1 for it only
  - "Exit"                            → emit ## CONNECTIONS COMPLETE, exit
```

If recommended bucket is empty, swap that option for "Show all 33 and pick."

---

## Step 5 - Per-connection setup screen

### 5.1 Read the spec

Read `connections/<name>.md`. Extract:
- The "Setup" section (prerequisites + install command)
- The "Contributes at" row from the capability matrix (stages affected)

### 5.2 Present the screen

Print:

```
┌─ <name> ────────────────────────────────────────
│ Status: <current probe result>
│ Contributes: <one-line value prop from Step 3>
│ Stages affected: <list from capability matrix>
│ Requires: <prereqs line from spec>
│
│ Setup command:
│   <install command from spec>
└─────────────────────────────────────────────────
```

### 5.3 AskUserQuestion

```
question: "Install <name>?"
options:
  - "Run install command now"       → 5.4a (auto-run path)
  - "Copy command — I'll run it"    → 5.4b (manual path)
  - "Skip for now"                  → 5.4c (no config change)
  - "Never ask again"               → 5.4d (add to skip list)
```

### 5.4 Auto-run eligibility matrix

**Only auto-run if the install command is reversible.** The matrix:

| Connection | Install kind | Auto-run? | Rationale |
|---|---|---|---|
| figma | `claude mcp add` (remote MCP) | ✓ yes | Reversible via `claude mcp remove` |
| preview | built-in, no install | - | Already present or not - no command to run |
| paper-design | `claude mcp add` | ✓ yes | Reversible |
| magic-patterns | `claude mcp add` | ✓ yes | Reversible |
| pinterest | `npx -y @smithery/cli install` | ✓ yes | Smithery CLI manages entry |
| refero | vendor-specific install | ✗ no | Vendor doesn't document a stable CLI - print link only |
| storybook | `npx storybook init` | ✗ no | Mutates repo files - force manual |
| chromatic | `npm install --save-dev chromatic` + env var | ✗ no | Writes package.json + needs `CHROMATIC_PROJECT_TOKEN` - force manual |
| graphify | `pip install` + `gsd-tools config-set` | ✗ no | Python install + cross-tool config - force manual |
| 21st-dev | `npx @21st-dev/magic init` + env var | ✗ no | Env var required - force manual |
| pencil-dev | VS Code extension | ✗ no | IDE-level install - force manual |
| claude-design | handoff bundle drop | ✗ no | User-driven file drop - force manual |
| mobbin | `claude mcp add mobbin --transport http https://api.mobbin.com/mcp` | ✓ yes | Reversible MCP add; no credential filesystem-write (OAuth on first call) |
| lazyweb | `claude plugin install lazyweb@lazyweb` (after token write to `~/.lazyweb/`) | ✗ no | Writes a bearer token to disk - force manual (user-consent step) |
| slack | set `SLACK_WEBHOOK_URL` env (Slack Incoming Webhook URL) | ✗ no | Env credential - user sets it; no install command (degrade-to-noop when unset) |
| discord | set `DISCORD_WEBHOOK_URL` env (Discord channel Webhook URL) | ✗ no | Env credential - user sets it; no install command (degrade-to-noop when unset) |
| linear | `claude mcp add linear ...` (Linear MCP) | ✓ yes | Reversible MCP add; OAuth on first call, no credential filesystem-write |
| jira | `claude mcp add atlassian ...` (Atlassian MCP) | ✓ yes | Reversible MCP add; OAuth on first call |
| notion | `claude mcp add notion ...` (Notion MCP) | ✓ yes | Reversible MCP add; OAuth on first call |
| lottie | (file-based - no install; drop a Lottie `.json` export in the repo) | n/a | Detected from Lottie exports / a `lottie-web` dep; live player opt-in |
| rive | (file-based - no install; add a `.riv` export / `@rive-app` dep) | n/a | Detected from `.riv` files / a `@rive-app` dep; Rive runtime opt-in |
| framer | `claude mcp add framer ...` (or API token) | ✓ yes | Reversible MCP add; canvas-category |
| penpot | `claude mcp add penpot ...` (self-hosted URL or cloud + token) | ✓ yes | Reversible; self-host vs cloud |
| webflow | `claude mcp add webflow ...` (or WEBFLOW token) | ✓ yes | Reversible; reads structure, not CMS authoring |
| v0-dev | `claude mcp add v0 ...` (or V0_API_KEY) | ✓ yes | Reversible; MCP-first → REST fallback |
| plasmic | `claude mcp add plasmic ...` (or token) | ✓ yes | Reversible; dual canvas+generator |
| builder-io | `claude mcp add builder ...` (or BUILDER_API_KEY) | ✓ yes | Reversible; pull-only this phase |
| launchdarkly | (set `LAUNCHDARKLY_API_KEY` / add the LaunchDarkly MCP) | ✓ yes | Reversible; read-only experiment-source |
| statsig | (set `STATSIG_API_KEY` / add the Statsig MCP) | ✓ yes | Reversible; read-only experiment-source |
| growthbook | (set `GROWTHBOOK_API_KEY` [+ host] / add the MCP) | ✓ yes | Reversible; self-host or cloud |
| usertesting | (set `USERTESTING_API_KEY` / add the MCP) | ✓ yes | Reversible; read-only; pseudonymize-first |
| maze | (set `MAZE_API_KEY` / add the MCP) | ✓ yes | Reversible; read-only; pseudonymize-first |
| hotjar | (set `HOTJAR_API_KEY` / add the MCP) | ✓ yes | Reversible; indexed insights only; pseudonymize-first |

For non-auto-run connections, hide the "Run install command now" option entirely in 5.3.

### 5.4a - Auto-run path

Bash the install command. On success: print stdout, print `"Installed. Session restart required before <name> is usable."`, append `<name>` to `.design/config.json > connections_onboarding.pending_verification[]`.

On failure: print stderr, print `"Install failed. Copy the command and run it manually, then rerun {{command_prefix}}connections <name> to verify."` Do not record pending_verification.

### 5.4b - Manual path

Print the install command inside a fenced code block for easy copy. Print: `"After installing, restart the session and run {{command_prefix}}connections <name> to verify."` Append `<name>` to `connections_onboarding.pending_verification[]`.

### 5.4c - Skip for now

No config change. Continue loop.

### 5.4d - Never ask again

Read `.design/config.json`. Ensure `connections.skip` is an array. Append `<name>` if not present. Write back.

### 5.5 After every per-connection screen

If mode is `<connection-name>` (single-target invocation), skip straight to Step 6. Otherwise continue the loop.

---

## Step 6 - Verification pass

Re-probe every connection whose name appears in `connections_onboarding.pending_verification[]`. For each:

- Now `available` → remove from `pending_verification[]`. Update STATE.md.
- Still `not_configured` → leave in `pending_verification[]`. User probably needs a session restart.
- Now `unavailable` → leave in `pending_verification[]`, print: `"<name> installed but probe errored — OAuth or auth may be required."`

Write STATE.md `<connections>` and `.design/config.json`.

### Print summary

```
┌── Setup complete ──
Newly available: <list>
Still pending (needs session restart): <list>
Skipped permanently: <list>
─────────────────────
```

If any pending remain, print: `"After restarting the session, run {{command_prefix}}connections to verify remaining."`

If no pending remain and at least one install happened, print: `"Run {{command_prefix}}scan to start your first cycle, or {{command_prefix}}brief to capture a design problem."`

---

## Resumability

If `.design/config.json > connections_onboarding.pending_verification[]` is non-empty at entry, this is a resumed session (most likely after a restart for a just-installed MCP):

1. Print: `"Resuming — <N> connections pending verification: <list>"`
2. Run Step 6 (verification pass) immediately.
3. If resumption completes cleanly (empty pending list), emit `## CONNECTIONS COMPLETE` and exit - do not re-enter the wizard.
4. Otherwise, fall through to Step 3 (summary) with the still-pending connections visible as `unavailable`.

---

## Config file writes

### `.design/config.json > connections.skip[]`

Pattern: read whole file, merge one field, write back (matches `{{command_prefix}}settings` pattern).

```json
{
  "model_profile": "balanced",
  "parallelism": { ... },
  "connections": {
    "skip": ["pinterest", "graphify"]
  }
}
```

### `.design/config.json > connections_onboarding` (scratch block)

Deleted automatically when empty after a verification pass:

```json
{
  "connections_onboarding": {
    "started_at": "<ISO 8601>",
    "pending_verification": ["figma", "chromatic"]
  }
}
```

### `STATE.md <connections>` write

Always merge, never replace - other stages may have written entries this skill did not probe.

Key normalization:
- `21st-dev` → `twenty_first` in STATE.md (no leading digit in XML-ish key).
- `magic-patterns` → `magic_patterns`.
- `paper-design` → `paper_design`.
- `pencil-dev` → `pencil_dev`.
- `claude-design` → `claude_design`.
- All other names map 1:1.

---

## Do Not

- Never run `npm install -g` globals automatically. Always force manual path for globals.
- Never write to `~/.bashrc`, `~/.zshrc`, or shell RC files. Env-var setup is always manual.
- Never run `claude mcp add` without explicit `"Run install command now"` confirmation.
- Never auto-restart the Claude Code session. Print the instruction and let the user act.
- Never re-prompt for names in `connections.skip[]`. If the user wants to re-enable, they invoke `{{command_prefix}}connections <name>` explicitly.
- Never overwrite existing `<connections>` entries that this skill did not probe. Merge only.

---

*Imported by: `../skills/connections/SKILL.md`. Maintained as part of Phase 28.5 (Bucket 2 rework - D-10).*
