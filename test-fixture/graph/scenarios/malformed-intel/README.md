# Scenario: malformed-intel — 30.6-04 decoupling test fixture

Schema-invalid intel: one node missing `id`, one edge missing `from`. The
`build.mjs` transform passes both fields through as `undefined`; Ajv
validation rejects with two errors:

- `nodes[0].id` — required field missing (or not a string)
- `edges[0].from` — required field missing (or not a string)

## Expected bin/gdd-graph behavior

| Subcommand | Expected outcome |
|---|---|
| `build --intel intel.json --out <tmp>/g.json` | exit code != 0 (non-zero); stderr contains JSON with `code: "SCHEMA_INVALID"`; `schemaErrors` array non-empty; NO uncaught exception; NO partial graph.json file written |
| `status --graph <bad-graph>` | exit 0; `{schemaInvalid:true, errors:[...]}` (if a malformed graph file is fed in directly) |
| `query`, `diff`, `upsert-node`, `upsert-edge` | n/a for this scenario (build is the gating step) |

## Why this fixture exists

Negative-path anchor: confirms the build pipeline rejects bad input
cleanly with structured error JSON (not a Node uncaught exception). This
is the contract dispatched callers will rely on after Wave C's callsite
migration — they need to distinguish "graph not built" from "graph crashed
the runtime."

Keep this directory.
