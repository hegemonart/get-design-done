---
name: gdd-analyze-dependencies
description: "Queries the intel store to surface token fan-out, component call-graphs, decision traceability, and circular dependency detection. Requires .design/intel/ to exist (run build-intel.cjs first)."
tools: Bash, Read, Glob, Grep
---

# /gdd:analyze-dependencies

**Role:** Surface dependency relationships, token usage spread, component graphs, and decision traceability using the `.design/intel/` store. No file greps — all queries are O(1) reads against pre-built JSON slices.

## Pre-flight check

Before any analysis, verify the intel store exists:

```bash
ls .design/intel/files.json 2>/dev/null && echo "ready" || echo "missing"
```

If missing: print the following and stop:

```
Intel store not found. Build it first:
  node scripts/build-intel.cjs --force
Then re-run /gdd:analyze-dependencies.
```

## Usage modes

`/gdd:analyze-dependencies` — run all four analyses and print a combined report
`/gdd:analyze-dependencies tokens` — token fan-out only
`/gdd:analyze-dependencies components` — component call-graph only
`/gdd:analyze-dependencies decisions` — decision traceability only
`/gdd:analyze-dependencies circular` — circular dependency detection only

## Analysis 1 — Token fan-out

**What:** Which design tokens are referenced in the most files? Which are orphaned (defined but never used)?

**Protocol:**

1. Read `.design/intel/tokens.json`
2. Group entries by `token` value
3. Count distinct `file` values per token
4. Sort descending by file count
5. Print top-20 most-referenced tokens:

```
━━━ Token fan-out ━━━
Token                        Files  Category
--color-primary              12     color
--space-4                    9      spacing
--font-size-body             7      typography
...
(top 20 shown)

Orphaned tokens (referenced in exactly 1 file):
  --shadow-card-hover (skills/design/SKILL.md:44)
━━━━━━━━━━━━━━━━━━━━━
```

## Analysis 2 — Component call-graph

**What:** Which components are referenced most widely? Which files reference a given component?

**Protocol:**

1. Read `.design/intel/components.json`
2. Group by `component` name
3. Count distinct `file` values per component
4. Sort descending by reference count
5. Print top-20 most-referenced components with their source files:

```
━━━ Component call-graph ━━━
Component      References  Files
Button         14          skills/design/SKILL.md, agents/design-executor.md, ...
Card           9           skills/verify/SKILL.md, reference/heuristics.md, ...
...
(top 20 shown)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If a specific component name is passed as a second argument (e.g., `/gdd:analyze-dependencies components Button`), show only that component's referencing files, one per line.

## Analysis 3 — Decision traceability

**What:** Which decisions from DESIGN-CONTEXT.md are referenced by which skill/agent files?

**Protocol:**

1. Read `.design/intel/decisions.json` to get known decision IDs (D-01, D-02, ...)
2. Read `.design/intel/symbols.json` to find files that contain decision headings
3. Read `.design/intel/dependencies.json` for @-reference chains
4. For each decision in decisions.json, grep the intel store's files index:

```bash
grep -r "D-[0-9][0-9]*" .design/intel/decisions.json | head -20
```

5. Cross-reference with which skill/agent files cite that decision ID (look in symbols.json for heading anchors matching decision patterns)

6. Print:

```
━━━ Decision traceability ━━━
D-01  Use Figma MCP for token extraction
      Referenced by: skills/scan/SKILL.md:12, agents/design-executor.md:7

D-02  Merge-not-replace pattern for Figma tokens
      Referenced by: (no explicit references found)

Total: 3 decisions tracked, 2 with file references
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If `.design/intel/decisions.json` contains no entries (e.g., no DESIGN-CONTEXT.md exists yet), print:
```
No decisions indexed. Run node scripts/build-intel.cjs after creating .design/DESIGN-CONTEXT.md.
```

## Analysis 4 — Circular dependency detection

**What:** Detect cycles in the `@`-reference graph (File A -> File B -> File A).

**Protocol:**

1. Read `.design/intel/graph.json`
2. Build an adjacency map from `edges` array: `{ from -> [to, to, ...] }`
3. Run depth-first search with path tracking to detect back-edges (cycles)
4. Algorithm:

```
visited = {}
path = []
cycles = []

function dfs(node):
  if node in path:
    cycle_start = path.index(node)
    cycles.append(path[cycle_start:] + [node])
    return
  if node in visited: return
  visited.add(node)
  path.append(node)
  for neighbor in adjacency[node]:
    dfs(neighbor)
  path.pop()
```

5. Print detected cycles (or "No circular dependencies detected"):

```
━━━ Circular dependency detection ━━━
Cycle 1:
  skills/verify/SKILL.md
  -> reference/accessibility.md
  -> skills/verify/SKILL.md   <- CYCLE

Total cycles: 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If no cycles: `All clear — no circular dependencies detected.`

## Combined report format

When run without a mode argument, print all four analyses in sequence separated by blank lines. Prefix the overall report with:

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
