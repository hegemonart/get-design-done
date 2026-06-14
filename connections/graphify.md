# Graphify — Connection Specification

This file is the connection specification for **Graphify** within the get-design-done pipeline. Graphify builds a queryable knowledge graph over the codebase and design intel — mapping component↔token↔decision relationships from `.design/intel/` slices. See `connections/connections.md` for the full connection index and capability matrix.

> **Native, no external dependency.** Phase 30.6 (v1.30.6) replaced the previous runtime dispatch to `~/.claude/get-shit-done/bin/gsd-tools.cjs graphify *` with a native CLI shipped in this repo at `bin/gdd-graph`. No Python, no separate install — just Node ≥22.

---

## Setup

**Prerequisites:**
- Node ≥22 (per `package.json` engines)
- get-design-done installed (provides `bin/gdd-graph`)

**Enable in project config** (per D-09 — direct file edit, no CLI subcommand):

Edit `.design/config.json` and set:
```json
{
  "graphify": {
    "enabled": true
  }
}
```

If `.design/config.json` does not exist, create it. Missing file = disabled.

**Build the graph (initial):**
```
node bin/gdd-graph build
```
Produces `.design/graph/graph.json` (Ajv-validated against `scripts/lib/graph/schema.json`).

**Verification:**
```
node bin/gdd-graph status --format json
```
Expect: `{ configured: true, exists: true, node_count: N, edge_count: M, built_at: "<iso>", schema_version: "1.0" }`.

**Note:** Graphify is optional. It is a pre-search oracle for planner and verifier agents, never a hard requirement. All stages MUST degrade gracefully when graphify is `unavailable` or `not_configured`.

---

## Graph Schema

### Node Types

| Node type | Source | ID pattern |
|-----------|--------|-----------|
| component | `.stories.tsx` / `src/components/*.tsx` (via intel slices) | `component:<name>` |
| token:color | CSS custom properties / Figma variables | `token:color/<name>` |
| token:spacing | CSS custom properties | `token:spacing/<name>` |
| token:typography | CSS custom properties | `token:typography/<name>` |
| token:motion | CSS animation variables | `token:motion/<name>` |
| page/route | `src/app/` or `src/pages/` | `page:<path>` |
| decision | DESIGN-CONTEXT.md D-XX entries | `decision:D-<nn>` |
| must-have | DESIGN-CONTEXT.md M-XX entries | `must-have:M-<nn>` |
| debt-item | DESIGN-DEBT.md entries | `debt:<id>` |
| anti-pattern | DESIGN-CONTEXT.md anti-patterns | `antipattern:<name>` |
| a11y-finding | DESIGN-VERIFICATION.md violations | `a11y:<rule-name>` |
| figma-variable | Figma `get_variable_defs` output | `figma-var:<name>` |

### Edge Types

| Edge kind | From | To | Meaning |
|------|------|-----|---------|
| `uses` | component | token | Component references this token |
| `renders` | page | component | Page renders this component |
| `violates` | debt-item | decision | Debt item contradicts this decision |
| `derives-from` | a11y-finding | component | A11y finding originates in this component |
| `maps-to` | figma-variable | token | Figma variable corresponds to CSS token |
| `detected-at` | anti-pattern | component | Anti-pattern found in this component |

### graph.json structure (schema v1.0)

```json
{
  "schema_version": "1.0",
  "built_at": "2026-05-28T12:00:00.000Z",
  "nodes": [
    {
      "id": "component:Button",
      "type": "component",
      "label": "Button",
      "attrs": { "source": "src/components/Button.tsx" }
    }
  ],
  "edges": [
    {
      "from": "component:Button",
      "to": "token:color/primary/500",
      "kind": "uses",
      "weight": 0.95
    }
  ]
}
```

Edges use the `{from, to, kind, weight?}` shape (per D-03.b — matches intel-store schema verbatim, no translation layer). The optional `weight: number` replaces the upstream three-tier confidence enum (per D-03.c).

---

## Which Stages Use This Connection

| Stage | Agent | Usage | Purpose |
|-------|-------|-------|---------|
| plan | `agents/design-planner.md` | Pre-scope token query | Count affected components before scoping a token change task |
| verify | `agents/design-integration-checker.md` | Pre-search D-XX query | Find components and tokens connected to each decision before grep |

Graphify is NOT called during scan, discover, or design. It is a read-only pre-search oracle for planner and verifier agents.

---

## Availability Probe

Unlike MCP connections, Graphify has no ToolSearch check. The probe is file-existence + config-flag based.

**Graphify probe sequence (execute at agent entry, before using graph):**

Step G1 — Config check (per D-09 — direct read, no CLI subcommand):
```
node -e "try{const c=JSON.parse(require('fs').readFileSync('.design/config.json','utf8'));process.stdout.write(String(c.graphify?.enabled===true))}catch{process.stdout.write('false')}"
→ false → graphify: not_configured  (skip all graph steps)
→ true  → proceed to Step G2
```

Step G2 — Graph status check (native CLI):
```
node bin/gdd-graph status --format json
→ { configured: true, exists: true }  → graphify: available
→ { configured: true, exists: false } → graphify: unavailable  (graph not built yet)
→ { configured: false, ... }          → graphify: not_configured  (mirrors G1; defensive)
```

Write graphify status to `.design/STATE.md` `<connections>`.

**Note:** Agents check `.design/STATE.md` `<connections>` FIRST before running the probe. If a prior stage already wrote `graphify: available`, skip the probe and use the cached status.

---

## Pre-Search Consultation Pattern

This is the canonical pre-search pattern for agents. Copy inline — SKILL.md and agent files have no include mechanism.

**For decision-based queries (design-integration-checker):**

Step 1: Query graph for decision node and its neighbors
```
node bin/gdd-graph query "decision:D-<nn>" --budget 1500
→ Returns: ranked match list — connected components + tokens as JSON
→ Use returned component IDs as grep seed list (reduces false-negative "not found")
```

Step 2: Grep each returned component for the decision pattern
(then continue to standard grep behavior if graph returned nothing)

**For token-based queries (design-planner):**

Step 1: Query graph for token node and its neighbors
```
node bin/gdd-graph query "<token-name>" --budget 1500
→ Returns: all components that reference this token (ranked by D-04.a score)
→ Annotate planned task with "N components affected" before scoping
```

Step 2: Include component list in the task description
(then continue standard planning behavior)

**Budget note:** Use `--budget 1500` for pre-search queries. Higher-weight edges (`weight >= 0.8`) are more reliable; lower-weight edges are hints only.

---

## Fallback

| Status | Behavior |
|--------|----------|
| `graphify: available` | Agents query graph before grep; annotate results with graph context |
| `graphify: unavailable` | Agents skip graph steps; log "graphify query skipped — graph not built" in output; fall back to grep |
| `graphify: not_configured` | Same as unavailable; no user-visible error (opt-in feature) |

The graph is a performance optimization and accuracy enhancer. It is never a hard requirement. All agents MUST produce valid output via grep alone.

---

## Anti-Patterns

- **Do NOT use graphify to replace grep.** The graph is a seed list, not a complete index. Always grep after querying the graph.
- **Do NOT embed `graph.json` contents in agent context.** Query specific nodes via `bin/gdd-graph query`; never read `graph.json` directly.
- **Do NOT query the graph during scan or design stages.** The graph is read-only and only useful when decisions already exist (plan, verify).
- **Do NOT block on graph build time.** If `gdd-graph build` takes >30 seconds mid-session, log "graphify build deferred — run /gdd:graphify build manually" and continue without graph.
- **Do NOT assume graph covers `.design/` artifacts.** The build walks `.design/intel/` slices and project source; arbitrary planning docs are not graph nodes unless explicitly indexed.

---

## /gdd:graphify Commands

| Subcommand | Native CLI call | Purpose |
|------------|----------------|---------|
| `build` | `node bin/gdd-graph build` | Build or rebuild the knowledge graph |
| `query <term>` | `node bin/gdd-graph query "<term>" --budget 2000` | Query the graph for a node and its neighbors |
| `status` | `node bin/gdd-graph status` | Check graph age, node count, enabled status |
| `diff` | `node bin/gdd-graph diff` | Show topology changes since last build |
| `upsert-node` | `node bin/gdd-graph upsert-node --id X --type T --label L` | Programmatic single-node insert (used by hone-graph-refresh agent) |
| `upsert-edge` | `node bin/gdd-graph upsert-edge --from A --to B --kind R` | Programmatic single-edge insert (used by hone-graph-refresh agent) |

If `graphify.enabled` is `false` (or `.design/config.json` is missing), the `bin/gdd-graph` subcommands graceful-degrade — `status` returns `{ configured: false, exists: false }`, other subcommands no-op with exit 0 and a one-line stderr notice.

To enable: edit `.design/config.json` and set `graphify.enabled: true`, then `node bin/gdd-graph build`.
