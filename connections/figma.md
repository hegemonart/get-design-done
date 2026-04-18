# Figma MCP — Connection Specification

This file is the connection specification for the Figma MCP (remote, read + write) within the get-design-done pipeline. One server exposes both read tools (`get_metadata`, `get_design_context`, `get_variable_defs`, `get_screenshot`) and the write tool `use_figma`. See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

**Prerequisites:**

- A Figma account (OAuth on first use at `mcp.figma.com`).
- Figma file access for any file you intend to read or write. No desktop app install required.

**Install command (Claude Code):**

```
claude mcp add figma --transport http https://mcp.figma.com/v1/sse
```

After running this command, restart the Claude Code session. On first use, Claude Code prompts you to complete the OAuth flow at `mcp.figma.com`. One `claude mcp add` unlocks both reads and writes — there is no separate writer MCP.

**Verification:**

After session restart, run:

```
ToolSearch({ query: "select:mcp__figma__get_metadata,mcp__figma__use_figma", max_results: 2 })
```

Expect two non-empty results. If results are empty, the remote MCP is not registered — re-run the install command above and restart the session.

**Migration from the legacy dual-MCP setup:**

Earlier versions of this plugin used two separate Figma MCPs — `figma-desktop` (local HTTP, read-only) and `figma` (remote, writes-only). As of **v1.0.7.1**, the remote MCP exposes full read parity and is the single supported Figma connection. If you installed `figma-desktop` previously, you can remove it:

```
claude mcp remove figma-desktop
```

No data is lost — the remote MCP reads the same Figma files.

---

## Tools

All tools use the `mcp__figma__` prefix (remote MCP).

| Tool | Full name | Returns | Pipeline use |
|------|-----------|---------|--------------|
| `get_metadata` | `mcp__figma__get_metadata` | Lightweight outline: node IDs, names, types, position/size. Also the availability probe. | **In scope** — probe (works without a selection); metadata snapshot for figma-write proposal review |
| `get_variable_defs` | `mcp__figma__get_variable_defs` | Variable collection tree: collection ID, mode names, variable names (hierarchical, e.g. `colors/primary/500`), resolved values, descriptions, scopes | **In scope** — scan: token augmentation (CONN-03); discover: decisions pre-population (CONN-04); figma-write: tokenize mode source |
| `get_design_context` | `mcp__figma__get_design_context` | Structured React+Tailwind component tree of the current Figma selection | **In scope (secondary)** — discover: existing design decisions for established Figma systems |
| `get_screenshot` | `mcp__figma__get_screenshot` | Screenshot image of the selected Figma layer or frame | **In scope (opt-in)** — visual reference capture for discovery; not invoked by default |
| `use_figma` | `mcp__figma__use_figma` | Write operation result | **In scope** — figma-write: all three modes (annotate, tokenize, mappings) |
| `get_code_connect_map` | `mcp__figma__get_code_connect_map` | Maps Figma component instances to code file paths | Out of scope this phase (reserved for future Code Connect work) |
| `add_code_connect_map` | `mcp__figma__add_code_connect_map` | Adds Code Connect mapping entries | Out of scope this phase (reserved for future Code Connect work) |
| `create_design_system_rules` | `mcp__figma__create_design_system_rules` | Generates rule files for design system alignment during code generation | Out of scope this phase |

`get_metadata` is preferred for probing because it works without a file or selection open, keeping the probe lightweight. `get_variable_defs` is the primary workhorse for token extraction and decisions pre-population. `use_figma` is the single entry point for every write.

---

## Writes (`use_figma`)

`use_figma` is the single write tool. The `design-figma-writer` agent (`agents/design-figma-writer.md`) wraps it in a **proposal → confirm** UX — it builds a numbered operation list and presents it to the user before executing any write. The user must confirm before `use_figma` is called.

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

**Call ToolSearch first — always.** In Claude Code sessions with many MCP servers, `mcp__figma__*` tools may be in the deferred tool set (not loaded into context at session start). Calling a deferred tool directly fails silently or errors. ToolSearch loads the tools into context and confirms their presence in a single call.

One probe covers both reads and writes — the remote MCP is a single server that exposes `get_metadata`, `get_variable_defs`, `get_design_context`, `get_screenshot`, and `use_figma` together. Presence of `get_metadata` implies `use_figma` is available on the same server.

**Figma probe sequence:**

```
Step 1 — ToolSearch check:
  ToolSearch({ query: "select:mcp__figma__get_metadata", max_results: 1 })
  → Empty result      → figma: not_configured  (MCP not registered; OAuth not completed)
  → Non-empty result  → proceed to Step 2

Step 2 — Live tool call:
  call mcp__figma__get_metadata
  → Success           → figma: available   (reads AND writes both available on this server)
  → Error             → figma: unavailable (auth expired, rate-limited, or no file open)
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

Every stage writes its probe result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
figma: available
refero: not_configured
</connections>
```

**Status values:**

| Value | Meaning |
|-------|---------|
| `available` | `get_metadata` returned a successful response; both reads and `use_figma` writes are expected to work |
| `unavailable` | Tool is in the session but errored (auth expired, no file open, rate-limited) |
| `not_configured` | ToolSearch returned empty for `mcp__figma__*` — MCP not registered |

The `<connections>` schema is minimal by design. Traceability of which outputs came from Figma is handled via source annotations in DESIGN.md (`source: figma-variables`) and DESIGN-CONTEXT.md ("pre-populated from Figma variables"), not via richer STATE.md fields. There is no separate `figma_writer:` key — one remote server, one status.

---

## Caveats and Pitfalls

- **`get_variable_defs` returns resolved values, not alias chains.** If a semantic token (`colors/semantic/brand`) aliases a primitive (`colors/blue/500`), only the resolved hex is returned. When recording variables in DESIGN.md, use the variable NAME alongside the hex: `colors/semantic/brand = #3B82F6`. Add a note: "resolved value — may alias a primitive; verify in Figma if the token layer matters."

- **`get_variable_defs` requires an open Figma file.** If no file is open or none is in the current context, the call errors. The probe falls to `unavailable` in this case — the stage skips Figma steps and continues with non-Figma fallbacks.

- **Multi-mode variables (Light/Dark).** Variables may carry values for multiple modes. When present, extract both: `#3B82F6 (light) / #60A5FA (dark)`. DESIGN.md can note dark-mode token existence in the color section.

- **Deferred-tool loading.** Always call `ToolSearch` before any `mcp__figma__*` tool invocation. This applies at every stage entry, even if Figma was `available` in a previous run — tool availability can change between sessions.

- **All writes require user confirmation.** The proposal→confirm UX in `design-figma-writer` ensures the user reviews all operations before any write is executed. There is no auto-approve mode. See `agents/design-figma-writer.md` for the proposal contract.

- **OAuth re-auth.** If `get_metadata` starts returning auth errors after previously working, the OAuth session expired. Re-running the MCP install command is not required — the session refreshes on the next tool call that returns a `reauth` hint. A clean `claude mcp remove figma && claude mcp add ...` is always safe.

- **No `figma-desktop` fallback.** As of v1.0.7.1 the desktop MCP is no longer a supported read path. If you need offline/no-network reads for some reason, run the pipeline's non-Figma fallbacks (grep-based token extraction, interview-only decisions).
