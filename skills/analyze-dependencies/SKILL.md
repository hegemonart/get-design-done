---
name: gdd-analyze-dependencies
description: "Queries the intel store to surface token fan-out, component call-graphs, decision traceability, and circular dependency detection. Requires .design/intel/ to exist (run build-intel.cjs first)."
tools: Bash, Read, Glob, Grep
---

# /gdd:analyze-dependencies

**Role:** Surface dependency relationships, token usage spread, component graphs, and decision traceability using `.design/intel/`. All queries are O(1) reads against pre-built JSON slices — no file greps. See `./reference/heuristics.md` for the underlying dependency-analysis heuristics (fan-out thresholds, orphan-token criteria, cycle-detection bias).

## Pre-flight

Verify the intel store exists:

```bash
ls .design/intel/files.json 2>/dev/null && echo "ready" || echo "missing"
```

If missing, print:

```
Intel store not found. Build it first:
  node scripts/build-intel.cjs --force
Then re-run /gdd:analyze-dependencies.
```

## Usage modes

- `/gdd:analyze-dependencies` — run all four analyses and print a combined report
- `/gdd:analyze-dependencies tokens` — token fan-out only
- `/gdd:analyze-dependencies components` — component call-graph only
- `/gdd:analyze-dependencies decisions` — decision traceability only
- `/gdd:analyze-dependencies circular` — circular dependency detection only

## Analysis 1 — Token fan-out

Surfaces tokens referenced in many files + orphans (referenced exactly once).

1. Read `.design/intel/tokens.json`; group by `token` value; count distinct `file` values.
2. Sort descending; print top-20 with token / file count / category columns.
3. Append orphans list (token + file:line of the single reference).

Header: `━━━ Token fan-out ━━━` … `(top 20 shown)` … `Orphaned tokens (referenced in exactly 1 file):` … footer rule.

## Analysis 2 — Component call-graph

Surfaces widely-referenced components and the files referencing each.

1. Read `.design/intel/components.json`; group by `component` name; count distinct `file` values.
2. Sort descending; print top-20 with component / references / files columns.
3. If `components <Name>` is passed, print only that component's referencing files (one per line).

Header: `━━━ Component call-graph ━━━` … footer rule.

## Analysis 3 — Decision traceability

Maps decisions to skill/agent files that cite them.

1. Read `.design/intel/decisions.json` (decision IDs D-01, D-02, …).
2. Read `.design/intel/symbols.json` for heading anchors; `.design/intel/dependencies.json` for @-reference chains.
3. For each decision, cross-reference which files cite the ID.
4. Print per-decision block: `D-NN  <description>` then a 6-space-indented `Referenced by: <file:line>, …` line (or `(no explicit references found)`).
5. Footer: `Total: N decisions tracked, M with file references`.

Empty-state: `No decisions indexed. Run node scripts/build-intel.cjs after creating .design/DESIGN-CONTEXT.md.`

## Analysis 4 — Circular dependency detection

Detects cycles in the `@`-reference graph (File A → File B → File A). DFS with path-tracking detects back-edges; algorithm + adjacency-map shape detailed in `./reference/heuristics.md` §"Dependency-cycle detection".

1. Read `.design/intel/graph.json`; build adjacency map from `edges`.
2. Run DFS with path-tracking; collect back-edges as cycles.
3. Print each cycle with the node sequence + `<- CYCLE` marker on the closing node.
4. Footer: `Total cycles: N` (or `All clear — no circular dependencies detected.`).

## Combined report

When run without a mode argument, print all four analyses in sequence separated by blank lines, prefixed with:

```
━━━ Dependency Analysis ━━━
Intel store: .design/intel/
Generated:   <timestamp from files.json>
Files indexed: <count>
```

## Required reading (conditional)

@.design/intel/tokens.json (if present)
@.design/intel/components.json (if present)
@.design/intel/dependencies.json (if present)
@.design/intel/decisions.json (if present)
@.design/intel/graph.json (if present)

## ANALYZE-DEPENDENCIES COMPLETE
