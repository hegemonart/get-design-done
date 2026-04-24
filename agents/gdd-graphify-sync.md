---
name: gdd-graphify-sync
description: "Feeds the Graphify knowledge graph from .design/intel/ slices. Converts intel store graph.json nodes and edges into Graphify-compatible format and upserts them. Run after gdd-intel-updater to keep the semantic graph current."
tools: Bash, Read, Write
color: green
default-tier: haiku
tier-rationale: "Sync operation is deterministic JSON → graph DB — cheap Haiku is enough"
parallel-safe: false
typical-duration-seconds: 20
reads-only: false
writes:
  - .design/intel/graph.json
---

@reference/shared-preamble.md

# gdd-graphify-sync

**Role:** Bridge between the flat intel store and the Graphify semantic knowledge graph. Reads `graph.json` from the intel store and upserts nodes/edges into Graphify using the `gsd-tools.cjs graphify` CLI.

## When to invoke

- After `gdd-intel-updater` completes (intel store updated)
- After a phase plan that adds new skill/agent/reference files
- When semantic graph queries return stale results

## Protocol

### Step 1 — Check intel store graph slice

```bash
ls .design/intel/graph.json 2>/dev/null && echo "ready" || echo "missing"
```

If missing: print "Intel store graph.json not found — run node scripts/build-intel.cjs --force first." and stop.

### Step 2 — Check Graphify availability

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify status 2>/dev/null | head -5
```

If Graphify is unavailable or returns an error: print "Graphify unavailable — skipping sync. Intel store remains the primary lookup source." and stop gracefully (exit 0, do not fail).

### Step 3 — Read graph.json

Read `.design/intel/graph.json`. Extract `nodes` and `edges` arrays.

### Step 4 — Upsert nodes

For each node in `nodes`:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify upsert-node \
  --id "<node.id>" \
  --type "<node.type>" \
  --label "<node.name>" \
  --source "gdd-intel-store"
```

Batch in groups of 20 to avoid CLI argument limits. Report total nodes upserted.

### Step 5 — Upsert edges

For each edge in `edges`:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify upsert-edge \
  --from "<edge.from>" \
  --to "<edge.to>" \
  --kind "<edge.kind>" \
  --source "gdd-intel-store"
```

Batch in groups of 20. Report total edges upserted.

### Step 6 — Verify sync

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify status
```

Print the status response. Report node/edge counts in Graphify vs intel store.

### Step 7 — Summary

```
━━━ Graphify sync complete ━━━
Nodes upserted:  <N>
Edges upserted:  <M>
Graphify status: <status line>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Required reading (conditional)

@.design/intel/graph.json (if present)
@.design/intel/files.json (if present)

## GRAPHIFY-SYNC COMPLETE

## Record

At run-end, append one JSONL line to `.design/intel/insights.jsonl`:

```json
{"ts":"<ISO-8601>","agent":"<name>","cycle":"<cycle from STATE.md>","stage":"<stage from STATE.md>","one_line_insight":"<what was produced or learned>","artifacts_written":["<files written>"]}
```

Schema: `reference/schemas/insight-line.schema.json`. Use an empty `artifacts_written` array for read-only agents.

