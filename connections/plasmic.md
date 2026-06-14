# Plasmic — Connection Specification

This file is the connection specification for Plasmic within the hone pipeline. Plasmic is a **dual-category** tool: it is both a **visual canvas** (a hosted design/builder surface whose pages and components can be read as a design source, like Figma) **and** a **code generator** (it emits real component code via its codegen loader/API). Because of this, Plasmic earns entries in **both** the `canvas` column **and** the `generator` column of the capability matrix. It integrates via the Plasmic MCP (preferred) or via a project token + loader/codegen API. See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

### Prerequisites

**Path A — Plasmic MCP (preferred):**
- The Plasmic MCP enabled in your Claude environment
- A Plasmic project (the design lives at [plasmic.app](https://plasmic.app))
- No additional manual setup when the MCP is present

**Path B — Token + loader/codegen API fallback:**
- A Plasmic account and a project at [plasmic.app](https://plasmic.app)
- A project ID + API token (project tokens, found in the project's Code/Configure panel)
- `PLASMIC_PROJECT_ID` and `PLASMIC_API_TOKEN` environment variables set
- Loader/codegen access per the docs at [docs.plasmic.app](https://docs.plasmic.app)

### Verification

```
ToolSearch({ query: "plasmic", max_results: 5 })
```

Non-empty results (canvas-read + codegen tools) → Plasmic MCP available (Path A).
Empty → check `PLASMIC_PROJECT_ID` / `PLASMIC_API_TOKEN` and use Path B, then restart the Claude Code session.

---

## Probe Pattern

Plasmic uses an MCP-first, two-path probe. Check the MCP first; fall back to the token env path.

```
ToolSearch({ query: "plasmic", max_results: 5 })
→ Non-empty  → plasmic: available (mcp)
→ Empty      → check PLASMIC_PROJECT_ID + PLASMIC_API_TOKEN env vars
               both set → plasmic: available (token)
               either unset → plasmic: not_configured
```

Write the three-value result to `.design/STATE.md` `<connections>`: `plasmic: <status>`
where `<status>` ∈ { `available (mcp)`, `available (token)`, `not_configured` }.

Because Plasmic is dual-category, a single `available` status enables **both** roles at once — the canvas read **and** the generator emit. The pipeline decides which role to invoke per stage (see Pipeline Integration); the probe does not split the status.

---

## Plasmic Tools

Plasmic exposes tools spanning **both** capability columns. Describe them generically — exact tool names resolve at probe time via `ToolSearch`.

| Tool (generic) | Column | Stage | Purpose |
|----------------|--------|-------|---------|
| `plasmic_list_projects` / `plasmic_get_project` | canvas | canvas | Enumerate Plasmic projects and read project/page/component metadata |
| `plasmic_read_component` / `plasmic_get_design` | canvas | canvas | Read a page or component from the visual canvas as a design source (structure, props, tokens) |
| `plasmic_get_tokens` | canvas | canvas | Extract design tokens (color, spacing, typography) defined in the Plasmic project |
| `plasmic_generate_code` / `plasmic_emit_component` | generator | generator | Emit real component code for a canvas component (codegen / loader) |
| `plasmic_sync` | generator | generator | Sync/regenerate emitted code after canvas changes (roundtrip) |

Token-path equivalents: the loader/codegen API at [docs.plasmic.app](https://docs.plasmic.app) provides the same two roles — read the project (canvas) and pull generated component code (generator) — when the MCP is absent.

---

## Pipeline Integration

Plasmic plugs into **two distinct stages**, one per capability column. This is the explicit dual-column behavior (SC#5): the same connection is a design **source** at the canvas stage and a code **emitter** at the generator stage.

| Stage | Column | What Plasmic provides |
|-------|--------|-----------------------|
| canvas | canvas | **Read the Plasmic design as a source** — pages, components, and tokens, the same way Figma is read. Feeds DESIGN.md and `.design/STATE.md` `<design_system>` token blocks. |
| generator | generator | **Emit component code** — via `agents/design-component-generator.md`'s `<!-- impl: plasmic -->` section. Returns component source the generator stage writes into the project. |

### Canvas stage — design as source

When `plasmic: available`, the canvas stage may treat a Plasmic project as a first-class design source (peer to Figma):

1. `plasmic_list_projects` → resolve the target project (or read `PLASMIC_PROJECT_ID`).
2. `plasmic_read_component` / `plasmic_get_design` → pull the page/component structure into the design read.
3. `plasmic_get_tokens` → extract tokens into `.design/STATE.md` `<design_system>` for downstream generator targeting.

This is a **read** — no code is emitted at this stage. The canvas read is what later stages reason about.

### Generator stage — emit code

The generator stage delegates to `agents/design-component-generator.md`. That agent's `<!-- impl: plasmic -->` section calls the Plasmic codegen path:

1. The agent resolves the canvas component to emit (from the canvas-stage read).
2. It calls `plasmic_generate_code` / `plasmic_emit_component` (or the loader/codegen API on the token path).
3. The emitted source is surfaced as a **proposal**, not auto-inserted.

### Proposal → Confirm

Both roles are non-destructive. The canvas read is informational; the generator emit is a **proposal**. The design-executor surfaces the proposed component code to the user/executor, who confirms before any code is written into the project. No automatic insertion, no automatic overwrite of existing components.

---

## Fallback Behavior

When `plasmic: not_configured`:
- Print: `Plasmic not configured — canvas read and code emit skipped.`
- **Canvas role** degrades gracefully: the canvas stage falls back to other available design sources (e.g. Figma); Plasmic is simply not offered as a source.
- **Generator role** degrades to code-only: the generator stage falls back to other available generators (Magic Patterns if `magic-patterns: available`, then 21st.dev if `21st-dev: available` — see `connections/21st-dev.md`), and finally to a manual component build.

Plasmic is **additive and never blocks**: with neither role configured, the pipeline proceeds on its existing canvas source and existing generators exactly as before.

---

Do NOT edit the connection index here — the 37.1 wiring plan adds the Active-Connections row + matrix entries (canvas + generator).
