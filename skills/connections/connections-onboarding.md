---
name: connections-onboarding
type: meta-rules
version: 1.0.0
phase: 28.5
tags: [connections, onboarding, probes, mcp, wizard, procedure, extracted]
last_updated: 2026-05-18
---

Source: extracted from `skills/connections/SKILL.md` (Phase 28.5 rework — D-10 extract-then-link).
The skill's load-bearing routing + invocation-mode dispatch stays in `../skills/connections/SKILL.md`;
this file holds the 12 probe scripts, bucket categorization, per-connection setup screen,
auto-run eligibility matrix, value-prop one-liners, and STATE.md / config.json write contracts.

# Connections Onboarding Procedure

Detailed procedure for the `/gdd:connections` interactive wizard — companion to
`../skills/connections/SKILL.md`. Read this file when executing a specific probe, deciding
auto-run vs manual, writing config.json, or merging STATE.md `<connections>`. The SKILL.md
keeps the load-bearing top-level flow + AskUserQuestion routing; this file holds the deep
methodology + per-connection detail.

For the cross-skill probe pattern + connection handshake (ToolSearch → live call → STATE.md
write), see `./shared-preamble.md#connection-handshake-summary`. The canonical per-connection
specs (setup commands, OAuth flows, capability matrix) live in `../connections/<name>.md` —
this file does NOT duplicate them; it points at them by name.

---

## Step 1 — Probe all 12 connections

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

**graphify** (CLI + file):
```
Bash: node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify status 2>/dev/null
  → Error or enabled:false → graphify: not_configured
  → enabled:true → check graphify-out/graph.json exists
                   Absent  → graphify: unavailable
                   Present → graphify: available
```

**pencil-dev** (file probe):
```
Bash: find . -name "*.pen" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -1
  → Empty       → pencil_dev: not_configured
  → Non-empty   → pencil_dev: available
```

**claude-design** (file probe — handoff bundle):
```
Bash: ls .design/handoff/ 2>/dev/null || find . -maxdepth 3 \
        \( -name "*.claude-design.html" -o -name "*.claude-design.zip" \
           -o -name "claude-design-*.html" \) 2>/dev/null | head -1
  → Empty     → claude_design: not_configured
  → Non-empty → claude_design: available
```

After all 12 probes complete, merge results into `STATE.md <connections>`. Preserve the three-value schema verbatim (`available | unavailable | not_configured`). Do not add new values.

---

## Step 2 — Bucket categorization

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
| **unavailable** | probe returned `unavailable` (configured but broken — needs attention) |

### Recommendation mapping

| Project hint | Recommend |
|---|---|
| `HAS_TAILWIND` or `HAS_FIGMA_HINT` | figma |
| `HAS_STORYBOOK_DIR` or storybook available | storybook, chromatic |
| `HAS_PEN_FILES` | pencil-dev |
| `HAS_REACT` | 21st-dev, magic-patterns |
| Always | refero, preview |

---

## Step 3 — Summary table

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
  · <name>             (re-enable: /gdd:connections <name>)
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

---

## Step 4 — Route by mode

### Mode: `list` or `--auto`

After printing the summary, write STATE.md, append one-line hint: `Run /gdd:connections to configure.` Emit `## CONNECTIONS COMPLETE`. Exit.

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

If recommended bucket is empty, swap that option for "Show all 12 and pick."

---

## Step 5 — Per-connection setup screen

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
| preview | built-in, no install | — | Already present or not — no command to run |
| paper-design | `claude mcp add` | ✓ yes | Reversible |
| magic-patterns | `claude mcp add` | ✓ yes | Reversible |
| pinterest | `npx -y @smithery/cli install` | ✓ yes | Smithery CLI manages entry |
| refero | vendor-specific install | ✗ no | Vendor doesn't document a stable CLI — print link only |
| storybook | `npx storybook init` | ✗ no | Mutates repo files — force manual |
| chromatic | `npm install --save-dev chromatic` + env var | ✗ no | Writes package.json + needs `CHROMATIC_PROJECT_TOKEN` — force manual |
| graphify | `pip install` + `gsd-tools config-set` | ✗ no | Python install + cross-tool config — force manual |
| 21st-dev | `npx @21st-dev/magic init` + env var | ✗ no | Env var required — force manual |
| pencil-dev | VS Code extension | ✗ no | IDE-level install — force manual |
| claude-design | handoff bundle drop | ✗ no | User-driven file drop — force manual |

For non-auto-run connections, hide the "Run install command now" option entirely in 5.3.

### 5.4a — Auto-run path

Bash the install command. On success: print stdout, print `"Installed. Session restart required before <name> is usable."`, append `<name>` to `.design/config.json > connections_onboarding.pending_verification[]`.

On failure: print stderr, print `"Install failed. Copy the command and run it manually, then rerun /gdd:connections <name> to verify."` Do not record pending_verification.

### 5.4b — Manual path

Print the install command inside a fenced code block for easy copy. Print: `"After installing, restart the session and run /gdd:connections <name> to verify."` Append `<name>` to `connections_onboarding.pending_verification[]`.

### 5.4c — Skip for now

No config change. Continue loop.

### 5.4d — Never ask again

Read `.design/config.json`. Ensure `connections.skip` is an array. Append `<name>` if not present. Write back.

### 5.5 After every per-connection screen

If mode is `<connection-name>` (single-target invocation), skip straight to Step 6. Otherwise continue the loop.

---

## Step 6 — Verification pass

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

If any pending remain, print: `"After restarting the session, run /gdd:connections to verify remaining."`

If no pending remain and at least one install happened, print: `"Run /gdd:scan to start your first cycle, or /gdd:brief to capture a design problem."`

---

## Resumability

If `.design/config.json > connections_onboarding.pending_verification[]` is non-empty at entry, this is a resumed session (most likely after a restart for a just-installed MCP):

1. Print: `"Resuming — <N> connections pending verification: <list>"`
2. Run Step 6 (verification pass) immediately.
3. If resumption completes cleanly (empty pending list), emit `## CONNECTIONS COMPLETE` and exit — do not re-enter the wizard.
4. Otherwise, fall through to Step 3 (summary) with the still-pending connections visible as `unavailable`.

---

## Config file writes

### `.design/config.json > connections.skip[]`

Pattern: read whole file, merge one field, write back (matches `/gdd:settings` pattern).

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

Always merge, never replace — other stages may have written entries this skill did not probe.

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
- Never re-prompt for names in `connections.skip[]`. If the user wants to re-enable, they invoke `/gdd:connections <name>` explicitly.
- Never overwrite existing `<connections>` entries that this skill did not probe. Merge only.

---

*Imported by: `../skills/connections/SKILL.md`. Maintained as part of Phase 28.5 (Bucket 2 rework — D-10).*
