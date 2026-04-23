# Figma Plugin Sandbox — Hard Rules

The `use_figma` MCP runs every script inside the Figma plugin sandbox with a **~5–10s per-call budget**. Four pitfalls repeatedly burn quota in docs-authoring loops. Treat these as hard rules.

**Rule 1 — `loadFontAsync` does NOT cache across `use_figma` calls.** Every new call re-fetches font metadata. Preload every style ONCE at the top of a script; clone existing text nodes via `node.clone()` or `figma.createText().fontName = ...` rather than calling `loadFontAsync` again.

**Rule 2 — `figma.root.findOne()` is O(tree-size) per call.** On a real file with thousands of frames this alone eats the budget. When you already know the node you want to act on, pass the node ID directly and call `figma.getNodeById(id)`. Never call `findOne` in a loop.

**Rule 3 — `appendChild` on a large attached tree triggers full AutoLayout recomputation.** Build subtrees off-tree (on a detached parent) and attach the completed subtree once at the end. This avoids N + N-1 + ... + 1 full layout passes.

**Rule 4 — per-call timeout is ~5–10s.** For docs-authoring (multi-row layouts populating from a library), budget **≤2 row-equivalents per `use_figma` call**. Exceeding this puts the script in the hill-climb-against-timeout failure mode: you retry with less content per call, each retry wastes another 5–10s, and MCP quota vanishes.

---

## When to skip `use_figma` entirely

For **authoring new content** — creating pages, populating with library components, building documentation layouts from scratch — prefer `figma:figma-generate-design` from the Figma plugin. It runs outside the sandbox and has no per-call timeout.

`use_figma` (and `/gdd:figma-write`) remain the right tools for **decision-writing**: attaching annotations, binding local-style tokens, registering Code Connect mappings, writing back implementation-status. Small, bounded, read-then-write operations where the four pitfalls don't apply.
