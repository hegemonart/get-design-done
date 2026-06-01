# Framer — Connection Specification

This file is the connection specification for **Framer** within the get-design-done pipeline. Framer is an AI-native canvas design tool (Wave 2). Like Figma, it is a **canvas-category** connection: GDD reads the current Framer selection/frames as a design source and writes annotated design proposals back. It is **not** a code generator — the pipeline never asks Framer to emit production components. See `connections/connections.md` for the full connection index and capability matrix.

This is an **opt-in, user-connected** tool. There is no bundled dependency — GDD ships no Framer client. The connection only activates when the user has independently registered a Framer MCP (or plugin bridge) in their session.

---

## Setup

### Prerequisites
- A [Framer](https://www.framer.com) account with edit access to the target project.
- A Framer API token (or plugin authorization) — generated from the Framer account/workspace settings and scoped to the projects GDD may read or propose against.
- A Framer MCP server **or** the Framer plugin bridge registered in the Claude Code session. Framer's surface evolves quickly; resolve the exact transport at runtime via the probe below rather than hardcoding it.

### How to connect

**Option A — Framer MCP (preferred).** Register the Framer MCP over HTTP transport, supplying the API token via environment:

```
claude mcp add --transport http framer https://<framer-mcp-endpoint>
```

Set the token in the session environment (name as documented by the Framer MCP — commonly `FRAMER_API_TOKEN`). Restart the Claude Code session after registering. Auth prompts on first tool call.

**Option B — Framer plugin bridge.** If Framer exposes a desktop/plugin bridge instead of a hosted MCP, install that plugin inside Framer and register its local endpoint as an MCP server named `framer`. This path mirrors Figma's desktop Dev Mode bridge: it serves the current open project to the session over local HTTP.

The pipeline auto-detects any server whose name matches `/framer/i` (e.g., `framer`, `Framer`, UUID-prefixed instances) and records the resolved tool prefix in `STATE.md`. Exact tool names are **not** assumed — they are discovered at runtime.

### Verification

After session restart, run:

```
ToolSearch({ query: "framer", max_results: 10 })
```

Expect non-empty results under a `/framer/i` prefix, including at least one read tool (selection/frame reader) and, for write-back, a proposal/annotation tool. If empty, re-register the MCP and restart the session.

---

## Probe Pattern

**MCP-first. Call `ToolSearch` before any Framer tool — always.** Framer tools are commonly in the deferred tool set and are not loaded into context at session start. Calling a deferred tool directly fails. `ToolSearch` loads the tools and confirms their presence in one call.

```
ToolSearch({ query: "framer", max_results: 10 })
→ Empty       → framer: not_configured   (no Framer MCP registered; skip all Framer steps)
→ Non-empty   → resolve prefix matching /framer/i, then live-probe a read tool:
                 → read tool succeeds  → framer: available (prefix=mcp__<prefix>__)
                 → read tool errors    → framer: unavailable (auth expired / no project open / rate-limited)
```

Three-value schema written to `.design/STATE.md` under `<connections>`:

| Value | Meaning |
|-------|---------|
| `available` | A `/framer/i` read tool resolved and the live call succeeded. |
| `unavailable` | A Framer tool is in the session but errored (auth expired, no project open, rate-limited). |
| `not_configured` | No server matching `/framer/i` — MCP not registered. |

Example STATE block:

```xml
<connections>
framer: available (prefix=mcp__framer__)
figma: not_configured
</connections>
```

Re-probe at every stage entry, even if Framer was `available` previously — the resolved prefix and availability can change between sessions.

---

## Framer Tools

Tool names take the form `mcp__<prefix>__<tool>` where `<prefix>` is the resolved server name from the probe (commonly `framer`). **Verify exact tool names via `ToolSearch` at runtime** — the table below describes capabilities generically, not literal identifiers.

**Reads (design source):**

| Capability | Returns | Pipeline use |
|------------|---------|--------------|
| Selection reader | The currently selected frame(s)/layer(s): node IDs, names, types, geometry | **In scope** — design source for the current selection; also the availability probe |
| Frame / canvas reader | Frame tree for the open project or page: hierarchy, layout, component instances | **In scope** — reads frames as a design source for the design stage |
| Token / style reader | Color, spacing, typography, and shared-style definitions used in the project | **In scope (when present)** — supplements token extraction, mirroring Figma `get_variable_defs` |
| Screenshot / preview | Rendered image of the selected frame | **In scope (opt-in)** — visual reference capture; not invoked by default |

**Writes (design proposals):**

| Capability | Returns | Pipeline use |
|------------|---------|--------------|
| Annotation / proposal writer | Write operation result | **In scope** — writes annotated design proposals (notes, decision callouts) back onto frames |

GDD only ever writes **annotated proposals** — design-decision notes and callouts attached to frames. It does not author production components or replace user content. Every write goes through a **proposal → confirm** UX: the agent builds a numbered operation list and the user confirms before any write tool is called. There is no auto-approve path.

---

## Pipeline Integration

Framer is a **canvas-category** connection. It contributes at the **design** stage exactly as Figma and paper.design do (see `connections/figma.md`): read frames as a design source, write annotated proposals back. It does not participate in `scan`, `plan`, or `verify` as a code authority.

| Stage | What Framer provides |
|-------|----------------------|
| design (read) | Read the current selection/frames as a **design source** — geometry, hierarchy, and (when present) token/style definitions feed the design proposal. |
| design (write) | After the design proposal is built, offer to write **annotated proposals** back onto Framer frames via the proposal → confirm UX — only when `framer: available`. |
| scan / plan / verify | Not used. Framer is a design-stage source, not a code authority. |

The read path requires an open Framer project/selection. If nothing is selected, the frame reader is used for the open page; if no project is open, the live probe falls to `unavailable` and the stage continues on its non-Framer path. The write offer appears only when `framer: available` — never on `unavailable` or `not_configured`.

---

## Fallback Behavior

When `framer` is `not_configured` or `unavailable`, the pipeline **degrades to code-only** and **never blocks**:

- **design (read):** skip the Framer design-source step. Proceed with code-derived context and any other available canvas connection. No error is raised.
- **design (write):** skip the proposal write-back offer entirely — no prompt, no output — on both `not_configured` and `unavailable`.
- A standalone request to write proposals to Framer against `framer: not_configured` STOPs with a short install note (point the user at the Setup section above).

Framer is an **enhancement, not a requirement**. Stages do not append a `<blocker>` for a missing Framer connection. Only if a `must_have` explicitly requires Framer data (reads or writes) should a blocker be appended.

**Consumer contract.** Agents that call Framer tools MUST read the resolved prefix from `STATE.md` and construct tool names dynamically (`{prefix}<read_tool>`, `{prefix}<write_tool>`) rather than hardcoding `mcp__framer__`, and MUST treat `unavailable` and `not_configured` identically for the purpose of skipping Framer steps.

---

> ⚠︎ **Do NOT edit the connection index here** — the Active-Connections row and the capability-matrix entry in `connections/connections.md` are added by the **37.1 wiring plan**, not by this spec. This file documents the Framer connection in isolation; wiring it into the index is a separate, tracked step.
