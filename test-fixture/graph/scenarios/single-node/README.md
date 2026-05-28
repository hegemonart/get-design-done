# Scenario: single-node — 30.6-04 decoupling test fixture

Exactly one node, zero edges. The minimum non-empty case — proves
`intel.name → graph.label` rename and `source` stamping fire on a node.

## Expected bin/gdd-graph behavior

| Subcommand | Expected outcome |
|---|---|
| `build --intel intel.json --out <tmp>/g.json` | exit 0; `{ok:true, nodeCount:1, edgeCount:0}`; written graph has 1 node `id:"component:Button"`, `label:"Button"`, `source:"gdd-intel-store"` |
| `status --graph <tmp>/g.json` | exit 0; `{configured:true, exists:true, nodeCount:1, edgeCount:0, schemaVersion:"1.0", stale:false}` |
| `query Button --graph <tmp>/g.json` | exit 0 (if 30.6-03 landed) or exit 2 with stub; when implemented, returns the single node in `matches` |
| `diff <tmp>/g.json <tmp>/g.json` | exit 0; empty diff |
| `upsert-node --id component:Card --type component --graph <tmp>/g.json` | exit 0 (if 30.6-03 landed) or exit 2 with stub; when implemented, graph grows to 2 nodes |
| `upsert-edge --from component:Button --to component:Card --kind renders --graph <tmp>/g.json` | exit 0 (if 30.6-03 landed) or exit 2 with stub |

## Why this fixture exists

Smallest case exercising the `name → label` field rename in `build.mjs`'s
`transformNode`. Used by the decoupling test as the "happy path on one
node" anchor. Keep this directory.
