# Scenario: dense — 30.6-04 decoupling test fixture

12 nodes, 20 edges, mixed node `type` values (`component`, `token-color`,
`token-space`, `decision`, `concept`, `file`) and mixed edge `kind` values
(`uses`, `renders`, `extends`, `references`, `affects`, `implemented_by`,
`depends_on`). Designed to exercise scoring/ranking in any subcommand that
walks the graph (e.g., `query`).

## Expected bin/hone-graph behavior

| Subcommand | Expected outcome |
|---|---|
| `build --intel intel.json --out <tmp>/g.json` | exit 0; `{ok:true, nodeCount:12, edgeCount:20}` |
| `status --graph <tmp>/g.json` | exit 0; `{configured:true, exists:true, nodeCount:12, edgeCount:20, schemaVersion:"1.0", stale:false}` |
| `query Button --graph <tmp>/g.json` | exit 0 (if 30.6-03 landed) or exit 2 stub; when implemented, top-1 match is `component:Button` (substring + label match); neighbour walk surfaces `token:color/primary/500`, `token:spacing/4`, `component:Modal`, `component:Toolbar`, `decision:D-03` |
| `diff <tmp>/g.json <tmp>/g.json` | exit 0; empty diff (identical args) |
| `diff <built-dense> <built-single-node>` | exit 0; reports 11 removedNodes, 20 removedEdges (single-node has 1 node 0 edges) |
| `upsert-node --id concept:new --type concept --graph <tmp>/g.json` | exit 0 stub (if 30.6-03 landed); graph then has 13 nodes |
| `upsert-edge --from component:Button --to concept:atomic-write --kind references --graph <tmp>/g.json` | exit 0 stub (if 30.6-03 landed); graph then has 21 edges |

## Why this fixture exists

Realistic-shape input — the test runner verifies counts (12/20) round-trip
through `build` → `status` → `diff` consistently. Also used as the larger
input in `diff` against `single-node` to assert non-empty diff shape.
Keep this directory.
