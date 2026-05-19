---
name: gdd-graphify
description: Manage the Graphify knowledge graph for the current project. Build, query, status, diff. When available, design-planner and design-integration-checker use the graph for pre-search consultation.
---

# get-design-done:graphify

Thin command wrapper around the GSD graphify tools integration.

## Usage

```
/get-design-done graphify build          # Build or rebuild the knowledge graph
/get-design-done graphify query <term>   # Query graph for a node and neighbors
/get-design-done graphify status         # Check graph age, enabled, node count
/get-design-done graphify diff           # Show topology changes since last build
```

## Behavior

1. Read `.design/STATE.md` to check `graphify` status in `<connections>`.
2. Check `graphify.enabled` in `.planning/config.json` via:
   ```
   node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get graphify.enabled
   ```
3. If not enabled, print:
   ```
   "Graphify is not enabled. Enable with: node gsd-tools.cjs config-set graphify.enabled true"
   "Then run /gdd:graphify build to generate the knowledge graph."
   ```
   STOP.
4. Execute the requested subcommand via GSD tools:
   - build:  `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify build`
   - query:  `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify query "<term>" --budget 2000`
   - status: `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify status`
   - diff:   `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify diff`
5. After `build` completes, update `.design/STATE.md` `<connections>`: `graphify: available`

## Required Reading

- `.design/STATE.md` — for graphify status in `<connections>`
- `.planning/config.json` — for `graphify.enabled` flag

## Notes

- Graphify is optional. If the binary is not installed (`pip install graphifyy`), the build subcommand will fail with an install prompt.
- Graph covers source code (`src/`, `components/`). It does NOT index `.design/` artifacts by default.
- Use `query` with node IDs from the graph schema: `component:<name>`, `token:color/<name>`, `decision:D-<nn>`, etc.
