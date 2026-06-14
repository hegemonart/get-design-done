# Scenario: with-cycles — 30.6-04 decoupling test fixture

5 nodes total: a 3-node cycle (A→B, B→A, B→C, C→A) plus one self-loop
(A→A) plus 2 unconnected isolated nodes (`isolated-1`, `isolated-2`).

## Expected bin/hone-graph behavior

| Subcommand | Expected outcome |
|---|---|
| `build --intel intel.json --out <tmp>/g.json` | exit 0 within 5 seconds (bounded — cycles must not infinite-loop); `{ok:true, nodeCount:5, edgeCount:5}` |
| `status --graph <tmp>/g.json` | exit 0; `{configured:true, exists:true, nodeCount:5, edgeCount:5, schemaVersion:"1.0"}` |
| `query node:A --graph <tmp>/g.json` | exit 0 (if 30.6-03 landed) or exit 2 stub; when implemented, returns in bounded time (no infinite walk despite reciprocal edges) |
| `diff <tmp>/g.json <tmp>/g.json` | exit 0; empty diff |
| `upsert-node --id node:D --type concept --graph <tmp>/g.json` | exit 0 stub (if 30.6-03 landed); graph then has 6 nodes |
| `upsert-edge --from node:D --to node:A --kind links_to --graph <tmp>/g.json` | exit 0 stub (if 30.6-03 landed); graph then has 6 edges, new cycle introduced |

## Why this fixture exists

The schema does not assert acyclicity. The current `build` algorithm is a
shallow transform (no graph walk) so cycles are safe by construction —
but defense-in-depth: this fixture pins the contract that `build` runs in
bounded time on cyclic input, so a future refactor that adds graph
walking gets a regression gate.

`query` is the likely future violator (BFS/DFS in 30.6-03). When 30.6-03
lands, the decoupled test asserts query completes within timeout on this
input.

Keep this directory.
