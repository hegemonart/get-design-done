---
name: gdd-context
description: "Queries the typed DesignContext graph at .design/context-graph.json - the design-semantic map of tokens, components, variants, states, motion, a11y patterns, screens, layers, and design patterns plus the edges between them. Lists and filters nodes and edges, traces a path between two nodes, finds the consumers of a node, and reports unreachable nodes, dependency cycles, and coverage. Use when the user wants to inspect the design graph, find what depends on a token or component, trace how one node reaches another, or check graph health. Activates for requests involving the design context graph, design dependencies, token consumers, component composition, unreachable design nodes, design cycles, or design coverage."
argument-hint: "[nodes --type X | edges --type Z | path <a> <b> | consumers-of <id> | unreachable | cycles | coverage]"
tools: Read, Bash
user-invocable: true
---

# {{command_prefix}}context

**Role:** Read-only front end for the typed DesignContext graph. The graph is a design-semantic map: nodes are tokens, components, variants, states, motion fragments, a11y patterns, screens, layers, and design patterns; edges connect them (uses-token, composes, extends, transitions-to, depends-on, mirrors, conflicts-with, referenced-by, tested-by, documented-by, consumes-context, provides-context). This skill queries that graph. It never writes to it. The graph is authored by the mapper agents plus the design-research-synthesizer; this skill only reads.

The query engine ships at `scripts/lib/design-context-query.cjs` (authored elsewhere; this skill only calls it). It is pure and dep-free, exposing `load`, `nodes`, `edges`, `path`, `consumersOf`, `unreachable`, `cycles`, and `coverage`. The merged graph lives at `.design/context-graph.json` with the shape `{ schema_version, generated_at, nodes[], edges[] }`.

If `.design/context-graph.json` is absent, print: `No DesignContext graph yet. Run the design research pipeline (mappers plus {{command_prefix}}synthesize) to generate .design/context-graph.json.` Then STOP. Do not invent a graph.

The engine exposes a module API rather than a CLI, so drive it from a short `node -e` script, the same way other skills call a `scripts/lib` helper:

```bash
node -e "const q=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-context-query.cjs'); \
  const g=q.load('.design/context-graph.json'); \
  console.log(JSON.stringify(q.nodes(g, { type: process.env.NODE_TYPE || undefined, tag: process.env.TAG || undefined })));"
```

## Invocation Modes

| Command | Behavior |
|---|---|
| `{{command_prefix}}context nodes` | List graph nodes, optionally filtered by `--type` and `--tag` (default mode). |
| `{{command_prefix}}context edges` | List graph edges, optionally filtered by `--type`. |
| `{{command_prefix}}context path <a> <b>` | Trace a path from node `<a>` to node `<b>`. |
| `{{command_prefix}}context consumers-of <id>` | List the nodes that consume node `<id>`. |
| `{{command_prefix}}context unreachable` | List nodes no edge reaches. |
| `{{command_prefix}}context cycles` | List dependency cycles in the graph. |
| `{{command_prefix}}context coverage` | Report graph coverage (typed and tagged ratios). |

Output discipline: emit JSON when a tool or another skill is the caller; render a compact table when a person is at the terminal.

## nodes

List nodes. `--type <t>` filters by node type (token, component, variant, state, motion-fragment, a11y-pattern, screen, layer, pattern, anti-pattern). `--tag <tag>` filters by a controlled tag. Call `nodes(graph, { type, tag })`:

```bash
node -e "const q=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-context-query.cjs'); \
  const g=q.load('.design/context-graph.json'); \
  console.log(JSON.stringify(q.nodes(g, { type: process.env.NODE_TYPE || undefined, tag: process.env.TAG || undefined })));"
```

Render one row per node. Keep it scannable:

```
ID                  TYPE        COMPLEXITY  NAME
token:color/brand   token       simple      Brand primary
component:Button    component   moderate    Button
```

If no nodes match, say so plainly and suggest a broader filter.

## edges

List edges. `--type <t>` filters by edge type (uses-token, composes, extends, transitions-to, depends-on, mirrors, conflicts-with, referenced-by, tested-by, documented-by, consumes-context, provides-context). Call `edges(graph, { type })`:

```bash
node -e "const q=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-context-query.cjs'); \
  const g=q.load('.design/context-graph.json'); \
  console.log(JSON.stringify(q.edges(g, { type: process.env.EDGE_TYPE || undefined })));"
```

Render `source -> target (type, weight)` per row. If none match, report it and suggest dropping the filter.

## path

Trace a path between two node ids. Call `path(graph, from, to)`:

```bash
node -e "const q=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-context-query.cjs'); \
  const g=q.load('.design/context-graph.json'); \
  console.log(JSON.stringify(q.path(g, process.env.FROM, process.env.TO)));"
```

Print the ordered node ids joined by arrows. If no path exists, print `No path from <a> to <b>.` Do not fabricate intermediate nodes.

## consumers-of

List the nodes that consume a given node (the inbound side). Call `consumersOf(graph, id)`:

```bash
node -e "const q=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-context-query.cjs'); \
  const g=q.load('.design/context-graph.json'); \
  console.log(JSON.stringify(q.consumersOf(g, process.env.ID)));"
```

Render the consumer ids one per row. If the id is unknown, print `No node <id> in the graph.` and suggest `{{command_prefix}}context nodes`.

## unreachable

List nodes that no edge reaches (orphans). Call `unreachable(graph)`:

```bash
node -e "const q=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-context-query.cjs'); \
  const g=q.load('.design/context-graph.json'); \
  console.log(JSON.stringify(q.unreachable(g)));"
```

If the list is empty, print `Every node is reachable.`

## cycles

List dependency cycles. Call `cycles(graph)`:

```bash
node -e "const q=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-context-query.cjs'); \
  const g=q.load('.design/context-graph.json'); \
  console.log(JSON.stringify(q.cycles(g)));"
```

Print each cycle as its ordered node ids. If there are none, print `No cycles detected.`

## coverage

Report graph coverage. Call `coverage(graph)`:

```bash
node -e "const q=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-context-query.cjs'); \
  const g=q.load('.design/context-graph.json'); \
  console.log(JSON.stringify(q.coverage(g)));"
```

Surface the returned ratios (for example typed and tagged coverage and node and edge counts) as a short summary.

## Do Not

- Do not edit `.design/context-graph.json` or the fragments under `.design/fragments/`. All writes go through the mapper agents and the synthesizer.
- Do not invent nodes, edges, or paths. If a query returns nothing, report it plainly.
- Do not modify `scripts/lib/design-context-query.cjs` or the DesignContext schema.

## CONTEXT COMPLETE
