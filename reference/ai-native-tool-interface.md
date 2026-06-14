# AI-Native Design Tool Interface - Capability Contract

This file defines the capability-based contract that AI-native design tools must implement to integrate with the hone pipeline. Two sub-categories are defined: **canvas** and **component-generator**. Future tools implement one sub-category and plug in via the same probe/read/write or probe/generate/adopt surface.

---

## Sub-Categories

### Canvas Tools

Canvas tools treat the design canvas as both source AND destination. They expose a bidirectional read+write surface.

**Contract:**

```
probe()  → { available | unavailable | not_configured }

read(selection) → {
  jsx:        string,      // React JSX of component tree
  styles:     object,      // computed CSS styles
  screenshot: base64_png,  // visual snapshot
  metadata:   object       // component name, bounds, id
}

write(proposal) → { confirmed | rejected }
```

**Implementations:**
- `connections/paper-design.md` - MCP-based; 24-tool server; budget: 100 calls/week (free)
- `connections/pencil-dev.md` - file-based; `.pen` YAML spec files; git-tracked; no MCP

**Pipeline stages:** `explore` (read) + `verify` (screenshot) + `design` (write via writer agent)

---

### Component Generators

Component generators produce UI component code from a natural-language description and an optional design-system target. They expose a generative one-way (or roundtrip) surface.

**Contract:**

```
probe() → { available | unavailable | not_configured }

generate(description: string, ds: "shadcn"|"tailwind"|"mantine"|"chakra") → {
  code:        string,   // component source code
  preview_url: string,   // hosted preview URL
  variants:    array,    // multiple generated variations
  component_id: string   // for adopt/annotate operations
}

adopt(variant: object) → { confirmed | rejected }
```

**Implementations:**
- `connections/21st-dev.md` - Magic MCP; `npx @21st-dev/magic@latest init`; marketplace prior-art gate
- `connections/magic-patterns.md` - Claude connector (`mcp__magic_patterns*`) + API key fallback; DS-aware generation

**Pipeline stages:** `explore` (prior-art gate for 21st.dev) + `design` (generate + adopt)

---

## Shared Probe Pattern

All AI-native tools use the three-value status schema from `connections/connections.md`:

| Status | Meaning |
|--------|---------|
| `available` | Tool confirmed present and responsive |
| `unavailable` | Tool present but errored (rate-limited, auth failure) |
| `not_configured` | ToolSearch returned empty or no .pen files found |

STATE.md format: `<tool-name>: <status>` in the `<connections>` block.

---

## Extending with Future Tools

To add a new AI-native design tool:

1. Determine sub-category: **canvas** (bidirectional design source) or **component-generator** (code generator).
2. Create `connections/<tool-name>.md` following the frozen template in `connections/figma.md`.
3. Implement `probe()` using ToolSearch or file-based check. Write status to STATE.md.
4. For **canvas**: expose `read()` and `write()` surfaces via the corresponding agent.
5. For **component-generator**: implement `generate()` and `adopt()` in `agents/design-component-generator.md` as a new `<!-- impl: <tool> -->` section.
6. Add a row to `connections/connections.md` capability matrix with `canvas` or `generator` column marked.
7. Append to `test-fixture/baselines/current/connection-list.txt` in sorted order.

---

## Candidate Tools (Backlog)

| Tool | Sub-category | Priority | Notes |
|------|-------------|----------|-------|
| Subframe | canvas | high | MCP-based; production-ready components; check for `mcp__subframe*` |
| v0.dev | generator | high | Vercel product; generates shadcn/tailwind; check for `mcp__v0*` |
| Galileo AI | generator | medium | Enterprise DS generation; API key required |
| Builder.io Visual Copilot | canvas + generator | medium | Figma plugin + code export; check for `mcp__builder*` |
| Locofy | generator | low | Figma→React/Next.js; Figma plugin-based |
| Anima | canvas | low | Figma→React; Figma plugin-based |
| Plasmic | generator | medium | Headless CMS + visual builder; `mcp__plasmic*` |
| TeleportHQ | generator | low | Code export + collaboration |
