# Figma MCP — Connection Specification

This file is the connection specification for the Figma MCP within the get-design-done pipeline. Figma publishes two MCP variants, both officially supported:

- **Remote MCP** (`https://mcp.figma.com/mcp`) — full read + write. Exposes read tools (`get_metadata`, `get_design_context`, `get_variable_defs`, `get_screenshot`, `get_figjam`, `search_design_system`) and remote-only write tools (`use_figma`, `generate_figma_design`, `create_new_file`, `whoami`).
- **Desktop MCP** (local HTTP, served by the Figma desktop app in Dev Mode) — reads only. Exposes the same read tools but not `use_figma`. Useful for offline/no-network reads.

The pipeline auto-detects any server whose name matches `/figma/i` (e.g., `figma`, `Figma`, `figma-desktop`, UUID-prefixed instances) and records the resolved prefix plus `writes` capability in `STATE.md`. See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

**Prerequisites:**

- A Figma account (OAuth on first use at `mcp.figma.com`).
- Figma file access for any file you intend to read or write.
- (Optional for desktop variant) Figma desktop app running with the target file open in Dev Mode.

### Option A — Claude Code plugin (preferred)

Anthropic publishes an official Figma plugin that bundles the MCP configuration plus Figma's agent skills:

```
claude plugin install figma@claude-plugins-official
```

Restart the Claude Code session after install. OAuth prompts on first tool call.

### Option B — Manual remote MCP install

```
claude mcp add --transport http figma https://mcp.figma.com/mcp
```

Restart the session. OAuth prompts on first tool call. One install unlocks both reads and writes.

> **Note:** The legacy server URL `https://mcp.figma.com/v1/sse` is superseded. Current canonical URL is `https://mcp.figma.com/mcp` (Streamable HTTP). Remove any prior registration using the old URL: `claude mcp remove figma` then re-run the install command above.

### Option C — Desktop MCP (reads only)

The Figma desktop app exposes a local MCP server on Dev Mode. This path is useful when writes are not needed and network access is restricted. Desktop MCP is typically registered under the server name `figma-desktop` — follow the Figma desktop app's Dev Mode instructions for your Figma version.

**Verification:**

After session restart, run:

```
ToolSearch({ query: "figma get_metadata use_figma", max_results: 10 })
```

The probe accepts any server prefix matching `/figma/i`. At least one result with a `get_metadata` tool is required for reads. A matching `use_figma` tool is required for writes (remote only).

**Migration from older plugin versions:**

Plugin versions before v1.0.7.1 used two separate Figma MCPs — `figma-desktop` (reads) and `figma` (writes). As of v1.0.7.1, the remote MCP exposes full read parity, so a single remote install is sufficient for most users. The desktop MCP remains supported as a reads-only fallback and is auto-detected alongside remote. If you only want the remote path, remove desktop:

```
claude mcp remove figma-desktop
```

No data is lost — the remote MCP reads the same Figma files.

---

> ⚠︎ **Authoring-redirect** — `/gdd:figma-write` (and the `design-figma-writer` agent behind it) is a *decision-writer*: annotations, token bindings, Code Connect mappings, implementation-status write-back. For **authoring new Figma content** — create pages, populate with library components, build doc layouts from scratch — use `figma:figma-generate-design` from the Figma plugin. It runs outside the plugin sandbox and has no per-call timeout.
>
> **Four sandbox pitfalls `use_figma` hits in authoring loops (see `reference/figma-sandbox.md`):**
> 1. `loadFontAsync` does not cache across calls — preload once, clone existing nodes.
> 2. `figma.root.findOne()` is O(tree-size) — pass node IDs and use `getNodeById`.
> 3. `appendChild` on large trees forces full AutoLayout recomputation — build subtrees off-tree.
> 4. Per-call timeout is ~5–10s — budget ≤2 row-equivalents per call for docs-authoring.
>
> The MCP circuit-breaker (`hooks/gdd-mcp-circuit-breaker.js`) enforces a per-task ceiling of 30 calls and 3 consecutive timeouts by default; see `reference/mcp-budget.default.json`.

## Tools

Tool names take the form `mcp__<prefix>__<tool>` where `<prefix>` is the resolved server name from the probe (commonly `figma` for remote or `figma-desktop` for local). The pipeline discovers the prefix at runtime — see **Availability Probe** below. The `mcp__figma__` examples shown here assume a server registered as `figma`.

**Reads (available on remote and desktop):**

| Tool | Returns | Pipeline use |
|------|---------|--------------|
| `get_metadata` | Lightweight outline: node IDs, names, types, position/size. Also the availability probe. | **In scope** — probe (works without a selection); metadata snapshot for figma-write proposal review |
| `get_variable_defs` | Variable collection tree: collection ID, mode names, variable names (hierarchical, e.g. `colors/primary/500`), resolved values, descriptions, scopes | **In scope** — scan: token augmentation (CONN-03); discover: decisions pre-population (CONN-04); figma-write: tokenize mode source |
| `get_design_context` | Structured React+Tailwind component tree of the current Figma selection | **In scope (secondary)** — discover: existing design decisions for established Figma systems |
| `get_screenshot` | Screenshot image of the selected Figma layer or frame | **In scope (opt-in)** — visual reference capture for discovery; not invoked by default |
| `get_figjam` | FigJam diagram metadata (XML) plus node screenshots | Out of scope this phase (not part of the design pipeline) |
| `search_design_system` | Matching components, variables, and styles across connected libraries for a text query | Out of scope this phase (reserved for future Code Connect work) |
| `get_code_connect_map` | Maps Figma component instances to code file paths | Out of scope this phase (reserved for future Code Connect work) |
| `add_code_connect_map` | Adds Code Connect mapping entries | Out of scope this phase (reserved for future Code Connect work) |
| `get_code_connect_suggestions` | Suggested Code Connect mappings between Figma and code components | Out of scope this phase |
| `send_code_connect_mappings` | Confirms and finalizes Code Connect mappings | Out of scope this phase |
| `create_design_system_rules` | Generates rule files for design system alignment during code generation | Out of scope this phase |

**Writes (remote only):**

| Tool | Returns | Pipeline use |
|------|---------|--------------|
| `use_figma` | Write operation result | **In scope** — figma-write: all three modes (annotate, tokenize, mappings) |
| `generate_figma_design` | Imports/converts a web page into Figma design layers | Out of scope this phase |
| `generate_diagram` | Generates a FigJam diagram from Mermaid syntax | Out of scope this phase |
| `create_new_file` | Creates a new blank Figma Design or FigJam file | Out of scope this phase |
| `whoami` | Authenticated user identity, plans, and seat types | Optional — useful for surfacing Dev seat status before a write |

`get_metadata` is preferred for probing because it works without a file or selection open, keeping the probe lightweight. `get_variable_defs` is the primary workhorse for token extraction and decisions pre-population. `use_figma` is the single entry point for every write.

**Remote-only tools** (`use_figma`, `generate_figma_design`, `create_new_file`, `whoami`, `generate_diagram`): absent from the desktop MCP. When the probe resolves to a desktop-only prefix, stages that require these tools either STOP (figma-write) or fall back silently.

---

## Writes (`use_figma`)

`use_figma` is the single write tool and is **remote only**. The `design-figma-writer` agent (`agents/design-figma-writer.md`) wraps it in a **proposal → confirm** UX — it builds a numbered operation list and presents it to the user before executing any write. The user must confirm before `use_figma` is called.

If the resolved probe prefix points to a desktop variant (no `use_figma`), figma-write STOPs early and instructs the user to register the remote MCP. No partial writes, no silent failures.

### Three Modes

The figma-writer operates in one of three modes per invocation:

| Mode | Description | Source data | Figma target |
|------|-------------|-------------|--------------|
| `annotate` | Write design-decision annotations onto Figma layer comments | D-XX decisions from DESIGN-CONTEXT.md | Layer comments on affected frames/components |
| `tokenize` | Replace hard-coded color/spacing/type literals with Figma variable references | Color/spacing/typography values from DESIGN-CONTEXT.md; existing variables from `get_variable_defs` | Variable bindings on layer fill/stroke/spacing properties |
| `mappings` | Write Code Connect mappings linking component instances to code file paths | Component names and file paths from DESIGN-CONTEXT.md | Code Connect entries on Figma component nodes |

### Write-Time Safety

1. **`--dry-run`** — emit the full operation list without calling `use_figma`. Safe to run on production Figma files.
2. **`--confirm-shared`** — when the proposal includes shared team-library components, the agent halts and requires this flag. Prevents accidental team-wide token modification.
3. **Sequential, not atomic execution.** If one operation fails mid-sequence, the agent logs the error and continues with remaining operations. The summary lists all failures for manual follow-up. The Figma file may be left in a partially-updated state — this is a property of `use_figma`, not of the wrapper.

---

## Which Stages Use This Connection

| Stage | Skill/Agent | Tool used | Purpose |
|-------|------------|-----------|---------|
| scan | `skills/scan/SKILL.md` | `get_variable_defs` | Token augmentation — supplements grep-based CSS token extraction with Figma variable definitions (CONN-03) |
| discover | `agents/design-context-builder.md` | `get_variable_defs`, `get_design_context` | Decisions pre-population — pre-fills D-XX color/spacing/typography decisions from Figma variables before the interview (CONN-04) |
| design | `skills/design/SKILL.md` (dispatch only) | — | Offer to spawn design-figma-writer after design-executor completes, when `figma: available` |
| figma-write | `agents/design-figma-writer.md` | `use_figma` (writes), `get_metadata` + `get_variable_defs` (proposal-time reads) | Write design decisions back to Figma in three modes (annotate / tokenize / mappings) |
| plan | — | — | Not used |
| verify | — | — | Not used |

Both scan and discover call `get_variable_defs` with no explicit selection to retrieve all variables in the active Figma file. If no file is open, the call errors and the stage falls back to its non-Figma path.

---

## Availability Probe

**Call ToolSearch first — always.** In Claude Code sessions with many MCP servers, Figma tools may be in the deferred tool set (not loaded into context at session start). Calling a deferred tool directly fails silently or errors. ToolSearch loads the tools into context and confirms their presence in a single call.

The probe is **variant-agnostic**: it accepts any server prefix matching `/figma/i` (e.g., `figma`, `Figma`, `figma-desktop`, `3860b164-...` UUID-prefixed remote instances) and records both the resolved prefix and the writes capability.

**Figma probe sequence:**

```
Step 1 — Keyword ToolSearch:
  ToolSearch({ query: "figma get_metadata use_figma", max_results: 10 })

  Parse results for tool names matching:
    - /^mcp__([^_]*figma[^_]*)__get_metadata$/i  → captures read-capable prefixes
    - /^mcp__([^_]*figma[^_]*)__use_figma$/i     → captures write-capable prefixes

  No read match       → figma: not_configured (no Figma MCP registered)
  One or more matches → proceed to Step 2

Step 2 — Tiebreaker selection:
  Preference order when multiple prefixes match:
    1. Prefer prefixes that appear in BOTH the read set and the write set
    2. Among remaining prefixes, prefer `figma` (canonical remote server name)
    3. Among remaining prefixes, prefer non-`figma-desktop`
    4. Alphabetical

Step 3 — Live tool call on resolved prefix:
  call mcp__<prefix>__get_metadata
  → Success → figma: available (prefix=mcp__<prefix>__, writes=<true|false>)
  → Error   → figma: unavailable (auth expired, rate-limited, or no file open)
```

Write the result to `.design/STATE.md` `<connections>` immediately after probing.

---

## Fallback Behavior

When `figma` is `not_configured` or `unavailable`, stages degrade gracefully — no error is raised.

**scan stage:**

- Skip Step 2A (Figma Token Augmentation)
- Rely on grep-based CSS custom property extraction alone
- DESIGN.md token section uses `source: CSS custom properties` (not `source: figma-variables`)
- `figma_variables_used: false` in DESIGN.md frontmatter

**discover stage (design-context-builder):**

- Skip Step 0 (Figma Pre-population)
- Populate D-XX decisions via interview only (manual elicitation from the user)
- DESIGN-CONTEXT.md omits the "Token decisions pre-populated from Figma variables" note

**design stage + figma-write:**

- `figma: not_configured` or `figma: unavailable` → skip the figma-write dispatch offer entirely (no prompt, no output)
- `figma: available` → offer opt-in prompt after design-executor completes
- Standalone `/gdd:figma-write` invocation against `figma: not_configured` → STOP with install note

Stages do not append a `<blocker>` for a missing Figma connection — Figma is an enhancement, not a requirement. If a `must_have` explicitly requires Figma data (reads or writes), THEN append a blocker.

---

## STATE.md Integration

Every stage writes its probe result to `.design/STATE.md` under the `<connections>` section. The format carries three fields for Figma: status, resolved tool prefix, and writes capability.

```xml
<connections>
figma: available (prefix=mcp__figma__, writes=true)
refero: not_configured
</connections>
```

Other examples:

```
figma: available (prefix=mcp__figma-desktop__, writes=false)
figma: available (prefix=mcp__Figma__, writes=false)
figma: unavailable
figma: not_configured
```

**Status values:**

| Value | Meaning |
|-------|---------|
| `available` | A matching `get_metadata` tool was resolved and the live call succeeded. The `writes=` flag indicates whether `use_figma` is also present on the same prefix. |
| `unavailable` | Tool is in the session but errored (auth expired, no file open, rate-limited) |
| `not_configured` | No server matching `/figma/i` exposes `get_metadata` — MCP not registered |

**Consumer contract.** Agents that call Figma tools MUST read the resolved prefix from STATE.md and construct tool names dynamically (`{prefix}get_variable_defs`, `{prefix}use_figma`), rather than hardcoding `mcp__figma__`. Agents that need writes MUST additionally check `writes=true` and STOP early with a clear message when false.

The `<connections>` schema is minimal by design. Traceability of which outputs came from Figma is handled via source annotations in DESIGN.md (`source: figma-variables`) and DESIGN-CONTEXT.md ("pre-populated from Figma variables"), not via richer STATE.md fields.

---

## Caveats and Pitfalls

- **`get_variable_defs` returns resolved values, not alias chains.** If a semantic token (`colors/semantic/brand`) aliases a primitive (`colors/blue/500`), only the resolved hex is returned. When recording variables in DESIGN.md, use the variable NAME alongside the hex: `colors/semantic/brand = #3B82F6`. Add a note: "resolved value — may alias a primitive; verify in Figma if the token layer matters."

- **`get_variable_defs` requires an open Figma file.** If no file is open or none is in the current context, the call errors. The probe falls to `unavailable` in this case — the stage skips Figma steps and continues with non-Figma fallbacks.

- **Multi-mode variables (Light/Dark).** Variables may carry values for multiple modes. When present, extract both: `#3B82F6 (light) / #60A5FA (dark)`. DESIGN.md can note dark-mode token existence in the color section.

- **Deferred-tool loading.** Always call `ToolSearch` before any Figma tool invocation. This applies at every stage entry, even if Figma was `available` in a previous run — tool availability and the resolved prefix can change between sessions.

- **All writes require user confirmation.** The proposal→confirm UX in `design-figma-writer` ensures the user reviews all operations before any write is executed. There is no auto-approve mode. See `agents/design-figma-writer.md` for the proposal contract.

- **OAuth re-auth.** If `get_metadata` starts returning auth errors after previously working, the OAuth session expired. Re-running the MCP install command is not required — the session refreshes on the next tool call that returns a `reauth` hint. A clean `claude mcp remove figma && claude mcp add ...` is always safe.

- **Desktop MCP reads-only.** The desktop MCP (typically `figma-desktop`) exposes read tools only. It is auto-detected by the probe and is a supported fallback when writes are not needed. Stages that require writes (figma-write) STOP with an instruction to register the remote MCP.
