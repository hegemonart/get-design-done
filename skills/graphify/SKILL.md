---
name: gdd-graphify
description: Manage the Graphify knowledge graph for the current project. Build, query, status, diff. When available, design-planner and design-integration-checker use the graph for pre-search consultation.
---

# gdd-graphify

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
2. Check `graphify.enabled` in `.design/config.json` via a direct file read (per D-09 - no `config-get` CLI subcommand):
   ```
   node -e "try{const c=JSON.parse(require('fs').readFileSync('.design/config.json','utf8'));process.stdout.write(String(c.graphify?.enabled===true))}catch{process.stdout.write('false')}"
   ```
3. If not enabled, print:
   ```
   "Graphify is not enabled. Edit `.design/config.json` to set `graphify.enabled: true`."
   "Then run /gdd:graphify build to generate the knowledge graph."
   ```
   STOP.
4. Execute the requested subcommand via the native CLI:
   - build:  `node bin/gdd-graph build`
   - query:  `node bin/gdd-graph query "<term>" --budget 2000`
   - status: `node bin/gdd-graph status`
   - diff:   `node bin/gdd-graph diff`
5. After `build` completes, update `.design/STATE.md` `<connections>`: `graphify: available`

## Required Reading

- `.design/STATE.md` - for graphify status in `<connections>`
- `.design/config.json` - for `graphify.enabled` flag

## Notes

- Graphify is optional. The native CLI ships in this repo at `bin/gdd-graph` (no external install - Node only).
- Graph is stored at `.design/graph/graph.json` (Ajv-validated against `scripts/lib/graph/schema.json`).
- Graph covers source code (`src/`, `components/`). It does NOT index `.design/` artifacts by default.
- Use `query` with node IDs from the graph schema: `component:<name>`, `token:color/<name>`, `decision:D-<nn>`, etc.
