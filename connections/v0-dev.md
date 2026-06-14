# v0.dev — Connection Specification

This file is the connection specification for v0.dev within the hone pipeline. v0.dev is Vercel's generative-UI tool (AI-native, Wave 2): prompt in, React/Tailwind/shadcn component code out. It is a **generator-category** connection — same family as [21st.dev](21st-dev.md) and [Magic Patterns](magic-patterns.md) — and plugs into the shared component-generator agent as a new implementation (Phase 14 pattern). See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

### Prerequisites

**Path A — MCP (preferred):**
- A v0.dev MCP server reachable from your Claude environment (probe surfaces the tools).
- No additional setup once the server is registered and the session is restarted.

**Path B — REST + API key (fallback, phase default):**
- A v0.dev account and API key from [v0.dev](https://v0.dev) (Vercel's **v0 Platform API**).
- `V0_API_KEY` environment variable set.
- Calls hit the v0 Platform API over HTTPS; no local server required.

Per the phase default, **probe MCP first, then fall back to REST + `V0_API_KEY`**. The Platform API is the stable contract; MCP tool names may evolve, so treat MCP as the fast path and the key as the durable one.

### Verification

```
ToolSearch({ query: "v0", max_results: 5 })
```

Non-empty results including a v0 generate tool → MCP available (Path A).
Empty → check `V0_API_KEY`; if set, Path B is active. If unset, v0.dev is not configured.

---

## Probe Pattern

v0.dev uses a two-path probe — MCP-first, then API key.

```
ToolSearch({ query: "v0", max_results: 5 })
→ Non-empty  → v0: available (mcp)
→ Empty      → check V0_API_KEY env var
               set   → v0: available (api)
               unset → v0: not_configured
```

This resolves to a **three-value** status. Write the result to `.design/STATE.md` `<connections>`:

```
v0: <not_configured | available (mcp) | available (api)>
```

The generator stage reads this value to decide whether the v0 implementation path is selectable.

---

## v0.dev Tools / API

v0.dev contributes a single core capability at the generator stage: **generate a component from a prompt plus design-system context**. Exact tool/endpoint names are not pinned here — verify them at runtime via the probe (MCP) or the current Platform API docs (REST).

| Capability | Stage | Purpose |
|------------|-------|---------|
| generate component | generator | Prompt + DS context → React/Tailwind/shadcn source; returns `{ code, preview_url }` (shape verified at runtime) |
| iterate / refine | generator | Follow-up prompt against a prior generation to refine output before any write |

**MCP path:** call the discovered generate tool with the DS-aware prompt; read code + preview from its response.
**REST path:** POST the prompt to the v0 Platform API generate endpoint with `Authorization: Bearer ${V0_API_KEY}`; parse code + preview from the JSON response.

Both paths return generated source plus (typically) a hosted preview URL. Field names differ by transport — resolve them at runtime, do not hardcode against this table.

---

## Pipeline Integration

v0.dev is **generator-category**: it contributes at the **generator** stage only, as one implementation inside the shared generator agent. The agent's `<!-- impl: v0 -->` section in `agents/design-component-generator.md` holds the v0-specific prompt assembly and response handling.

| Stage | What v0.dev provides |
|-------|----------------------|
| generator | Prompt + DS context → component source via the `<!-- impl: v0 -->` path in `agents/design-component-generator.md` |
| generator | `preview_url` (when returned) written to `.design/STATE.md` `<generator>` block for the verify stage |

### DS-Aware Prompting

Before invoking v0.dev, the generator reads the detected design system from `.design/STATE.md` `<design_system>` (populated upstream — see [Magic Patterns](magic-patterns.md) for the shared DS-detection logic). The `<!-- impl: v0 -->` section folds that context into the prompt: target framework (React), styling (Tailwind), and component library (shadcn/ui when present), plus any token or convention notes. v0.dev is shadcn-native, so a shadcn target maps cleanly; other systems are passed as explicit prompt constraints.

### Proposal → Confirm

v0.dev output is **proposed, never auto-written**. The generator surfaces the generated code (and preview, if any) as a proposal; the executor confirms with the user before anything lands in `src/`. This matches the prior-art and proposal gates used by the sibling generator implementations — no automatic code insertion.

---

## Fallback Behavior

When `v0: not_configured`:
- Print: `v0.dev not configured — generator impl skipped.`
- Falls back to another generator implementation if available: [21st.dev](21st-dev.md) or [Magic Patterns](magic-patterns.md).
- If no generator is configured, the generator stage proceeds with a code-only manual build.
- v0.dev **never blocks** the pipeline — it degrades to a sibling generator or to manual code, and the stage continues either way.

---

Do NOT edit the connection index here — the 37.1 wiring plan adds the Active-Connections row + matrix entry.
