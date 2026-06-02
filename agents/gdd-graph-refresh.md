---
name: gdd-graph-refresh
description: "Refreshes the knowledge graph at .design/graph/graph.json from .design/intel/ slices using the native bin/gdd-graph CLI. Run after gdd-intel-updater to keep the semantic graph current. Phase 30.6 simplified this agent: intel and graph now share a single {from,to,kind,weight?} schema, so no translation step is needed."
tools: Bash, Read, Write
color: green
default-tier: haiku
tier-rationale: "Refresh is a deterministic file-walk + atomic write - cheap Haiku is enough"
parallel-safe: false
typical-duration-seconds: 20
reads-only: false
writes:
  - .design/graph/graph.json
---

@reference/shared-preamble.md

# gdd-graph-refresh

**Role:** Refresh the project knowledge graph at `.design/graph/graph.json` from the intel store at `.design/intel/`. Reads intel slices and (re)builds the graph via the native `bin/gdd-graph build` command. Phase 30.6 simplification: intel and graph share a single `{from,to,kind,weight?}` edge schema (D-03.b), so there is no longer a translation step - `gdd-graph build` ingests intel slices directly.

## When to invoke

- After `gdd-intel-updater` completes (intel store updated)
- After a phase plan that adds new skill/agent/reference files
- When semantic graph queries return stale results

## Protocol

### Step 1 - Check intel store

```bash
test -d .design/intel/ && echo "ready" || echo "missing"
```

If missing: print "Intel store not found - run node scripts/build-intel.cjs `--force` first." and stop.

### Step 2 - Check graphify enabled

```bash
node -e "try{const c=JSON.parse(require('fs').readFileSync('.design/config.json','utf8'));process.stdout.write(String(c.graphify?.enabled===true))}catch{process.stdout.write('false')}"
```

If `false`: print "Graphify not enabled in .design/config.json - skipping refresh. To enable, set `graphify.enabled: true` in .design/config.json." and stop gracefully (exit 0, do not fail).

### Step 3 - Rebuild graph from intel slices

Phase 30.6 simplification: with shared `{from,to,kind,weight?}` schema between intel and graph (D-03.b), the canonical refresh is a single `build` invocation. No per-node iteration, no translation step.

```bash
node bin/gdd-graph build
```

Exit code 0 indicates success; non-zero with stderr indicates a schema violation in an intel slice - report and stop.

### Step 4 - Verify the rebuilt graph

```bash
node bin/gdd-graph status --format json
```

Capture `{ node_count, edge_count, built_at, schema_version }` from the JSON output.

### Step 5 - Summary

```
━━━ Graph refresh complete ━━━
Graph path:      .design/graph/graph.json
Nodes:           <node_count>
Edges:           <edge_count>
Schema version:  <schema_version>
Built at:        <built_at>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Required reading (conditional)

@.design/intel/graph.json (if present)
@.design/intel/files.json (if present)

## GRAPH-REFRESH COMPLETE

## Record

At run-end, append one JSONL line to `.design/intel/insights.jsonl`:

```json
{"ts":"<ISO-8601>","agent":"<name>","cycle":"<cycle from STATE.md>","stage":"<stage from STATE.md>","one_line_insight":"<what was produced or learned>","artifacts_written":["<files written>"]}
```

Schema: `reference/schemas/insight-line.schema.json`. Use an empty `artifacts_written` array for read-only agents.
