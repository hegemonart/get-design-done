# Scenario: empty — 30.6-04 decoupling test fixture

Intel slice with zero nodes and zero edges. Smallest possible valid input.

## Expected bin/gdd-graph behavior

| Subcommand | Expected outcome |
|---|---|
| `build --intel intel.json --out <tmp>/g.json` | exit 0; produces a schema-valid `graph.json` with `nodes:[]`, `edges:[]`, `schemaVersion:"1.0"` |
| `status --graph <tmp>/g.json` | exit 0; `{configured:true, exists:true, nodeCount:0, edgeCount:0, schemaVersion:"1.0", stale:false}` |
| `query foo --graph <tmp>/g.json` | exit 0 (if 30.6-03 landed) or exit 2 with `not yet implemented` stub (otherwise); when implemented, returns `{matches:[], truncated:false}` |
| `diff <tmp>/g.json <tmp>/g.json` | exit 0; all five arrays length 0 |
| `upsert-node --id N --type t --graph <tmp>/g.json` | exit 0 (if 30.6-03 landed) or exit 2 with stub; when implemented, graph then has 1 node |
| `upsert-edge --from a --to b --kind k --graph <tmp>/g.json` | exit 0 (if 30.6-03 landed) or exit 2 with stub |

## Why this fixture exists

Edge-case anchor: confirms `build` does not crash on an empty input and that downstream `status`/`diff` handle zero-cardinality without dividing-by-zero anywhere. Keep this directory — the test runner enumerates `test-fixture/graph/scenarios/*` and asserts presence.
