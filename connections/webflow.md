# Webflow — Connection Specification

This file is the connection specification for Webflow within the get-design-done (GDD) pipeline. Webflow is an AI-native Wave 2 generator-category, code-capable canvas: GDD reads a Webflow site's structure and styles and uses them as a **design-adaptation source** — it reads the site's existing design language and emits it as a source for adaptation. GDD does **not** author Webflow CMS schemas, publish content, or write back to the site. See `connections/21st-dev.md` for the structural template this spec follows, and `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

### Prerequisites

You need a Webflow site to read from, plus one read path:

**Path A — Webflow MCP (preferred):**
- The Webflow MCP server registered in your Claude environment (exposes the Webflow Data API as tools).
- No additional env setup required once the connector is enabled.

**Path B — API token fallback:**
- A Webflow account with at least one site, at [webflow.com](https://webflow.com).
- A Data API token (Site settings → Apps & integrations → API access) scoped read-only.
- `WEBFLOW_API_TOKEN` environment variable set, used against the Data API at [developers.webflow.com](https://developers.webflow.com).

### Verification

```
ToolSearch({ query: "webflow", max_results: 5 })
```

Non-empty results (e.g. a site-list / pages / styles read tool) → Webflow MCP available (Path A).
Empty → check `WEBFLOW_API_TOKEN` and fall back to direct Data API reads (Path B), then restart the Claude Code session if you just registered the connector.

---

## Probe Pattern

Webflow uses an MCP-first probe with an API-token env fallback. Resolve to one of three values and write it to `.design/STATE.md` `<connections>`.

```
ToolSearch({ query: "webflow", max_results: 5 })
→ Non-empty  → webflow: available        (MCP path)
→ Empty      → check WEBFLOW_API_TOKEN env var
               set    → webflow: available     (API-token path)
               unset  → webflow: not_configured
```

A separate `unavailable` status is reserved for the case where the MCP tool is present in the session but errors on probe (auth failure, site offline, rate-limited) — treat it the same as `not_configured` for gating (skip Webflow steps), but record it distinctly.

Three-value status schema (mirrors `connections/connections.md`):

| Status | Meaning |
|--------|---------|
| `available` | Webflow read path confirmed (MCP tool responsive, or `WEBFLOW_API_TOKEN` set) |
| `unavailable` | MCP tool present but errored on probe (auth/site/rate-limit) |
| `not_configured` | No MCP tool and no API token — Webflow not wired in this session |

Write result to STATE.md `<connections>`: `webflow: <status>`

---

## Webflow Tools

Tools are described generically — exact names depend on the registered MCP server (Path A) or are equivalent Data API read calls (Path B). All are **read-only** in GDD's usage.

| Tool (generic) | Stage | Purpose |
|----------------|-------|---------|
| read site structure | design | Enumerate the site's pages and DOM/element hierarchy — the structural skeleton of the existing design |
| read styles | design | Read style classes, typography, color, spacing, and breakpoint definitions — the site's existing design language |
| read components | design | Read reusable components / symbols and their composition, for pattern adaptation |

These reads supply raw material for adaptation. GDD never calls a Webflow write/publish/CMS-mutation tool, even when the registered MCP server exposes one.

---

## Pipeline Integration

Webflow is a **generator-category** connection that contributes at the **design** stage as a structure/adaptation source.

| Stage | What Webflow provides |
|-------|------------------------|
| design | **Adaptation source**: read the existing site's structure, styles, and components; emit the design language as a source the design stage adapts from |

### Adaptation-source flow (design stage)

1. Probe resolves `webflow: available`.
2. Read site structure + styles (+ components) via the available path.
3. Emit the extracted design language as an **adaptation source** for the design stage — structure and style become reference material the generator adapts, alongside other sources (e.g. the project design system, 21st.dev prior art).
4. The design-executor produces GDD-native output (code / DESIGN.md) informed by that source. Nothing is written back to Webflow.

This is a **read-and-adapt** integration, not a round trip. The Webflow site is treated as inspiration and structural reference; GDD owns the emitted output.

### Explicitly out of scope

- GDD reads structure; it does **not** author or mutate Webflow **CMS schemas** (collections, fields, items). It is a design-adaptation source, not a CMS authoring tool.
- No publishing, no content writes, no site mutations of any kind.

---

## Fallback Behavior

When `webflow: not_configured` (or `unavailable`):

- Print: `Webflow not configured — adaptation source skipped, proceeding code-only.`
- The design stage **degrades to code-only**: it proceeds from the project design system and any other available sources without the Webflow design language.
- Webflow never blocks the pipeline. A missing Webflow connection only removes one optional adaptation source; the design stage continues normally.

---

Do NOT edit the connection index here — the 37.1 wiring plan adds the Active-Connections row + matrix entry.
