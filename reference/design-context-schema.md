---
name: design-context-schema
type: reference
version: 1.0.0
phase: 52
tags: [design-context, knowledge-graph, schema, nodes, edges, mapper, two-phase]
last_updated: 2026-06-03
---

# DesignContext Graph Schema

The DesignContext graph is the typed knowledge graph of a design system. It records design
entities as `nodes` and the relationships between them as `edges`, so an agent can reason about
a system the way an engineer reads a dependency graph: which token a component consumes, which
screen a flow transitions to, which pattern an anti-pattern conflicts with. The canonical graph
lives at `.design/context-graph.json`. It is validated by `scripts/validate-design-context.cjs`
and queried by `scripts/lib/design-context-query.cjs`.

This file documents the four shapes (Node, Edge, Fragment, Graph), the ten node types, the twelve
edge types, and the two-phase mapper pattern that builds the graph. The controlled `tags[]`
vocabulary lives in `./design-context-tag-vocab.md`; the JSON Schema lives at
`./schemas/design-context.schema.json`.

## Shapes

Four shapes make up the contract. A Graph is the assembled whole; a Fragment is one mapper's
contribution before merge; Nodes and Edges are the parts.

### Node

```
{ id, type, name, summary, tags[], complexity }
```

- `id`: stable unique string; edges reference it. A duplicate id is a hard error.
- `type`: one of the ten node types below.
- `name`: human-readable name of the entity.
- `summary`: a one-line description of what the entity is and does. The deterministic pass may
  leave this empty; the summary pass fills it. An empty summary, or one identical to `name`, is a
  soft warning (a stub).
- `tags[]`: strings from the controlled vocabulary. An unknown tag is a soft warning.
- `complexity`: one of `simple`, `moderate`, `complex`.
- `subtype` *(optional)*: a finer class. For a `token` node one of
  `color / spacing / typography / radius / shadow`; for a `layer` node one of
  `Atomic / Molecular / Organism / Template`.

### Edge

```
{ source, target, type, direction, weight }
```

- `source`, `target`: node ids. Both must resolve to an existing node; a dangling endpoint is a
  hard error.
- `type`: one of the twelve edge types below.
- `direction`: one of `forward`, `backward`, `bidirectional`. A forward edge reads
  source-to-target; a backward edge reads target-to-source; a bidirectional edge reads both ways.
  Traversal in the query library honors direction.
- `weight`: a number in the inclusive range 0 to 1. It expresses relationship strength, not
  distance, so a stronger tie has a higher weight.

### Fragment

```
{ schema_version, mapper, generated_at, nodes[], edges[] }
```

A Fragment is the output of a single mapper (the Figma mapper, the codebase mapper, the docs
mapper). It carries a `mapper` field naming its origin and is merged into the Graph by union on
node `id`. Fragments let mappers run independently and write narrow outputs that later combine.

### Graph

```
{ schema_version, generated_at, nodes[], edges[] }
```

The Graph is the merged, canonical document at `.design/context-graph.json`. `schema_version` is
required; `generated_at` is an optional ISO-8601 timestamp recording when the graph was assembled.

## Node types

Ten node types cover the entities a design system holds. Each entry states what the type is and
when a mapper emits it.

- **token**: a design-token leaf such as a color, a spacing step, or a type ramp value. Emitted
  for every resolvable token; carries a `subtype` naming the token family.
- **component**: a reusable UI unit (a button, a card, an input). Emitted once per component
  regardless of how many variants it has.
- **variant**: a named configuration of a component (a button's `primary` or `ghost`). Emitted
  when a component exposes distinct variants worth addressing on their own.
- **state**: an interaction or lifecycle state of a component (`hover`, `disabled`, `loading`).
  Emitted when state changes carry their own styling or behavior.
- **motion-fragment**: a reusable motion unit (an enter transition, an easing curve, a loop).
  Emitted when motion is named and reused rather than ad hoc.
- **a11y-pattern**: an accessibility pattern (a focus-trap, a skip-link, an aria-live region).
  Emitted when a component participates in a named accessibility contract.
- **screen**: a full page or view in a product flow. Emitted once per distinct screen.
- **layer**: a composition layer in the atomic taxonomy. Carries a `subtype` of `Atomic`,
  `Molecular`, `Organism`, or `Template`. Emitted to record where an entity sits in the hierarchy.
- **pattern**: a recurring solution that spans components (a master-detail layout, a wizard).
  Emitted when a shape repeats across the system and earns a name.
- **anti-pattern**: a recurring shape the system wants to retire (a one-off color, a duplicated
  control). Emitted so the graph can point at debt and the edges can mark conflicts.

## Edge types

Twelve edge types cover how entities relate. Each entry states the relationship and when it
applies.

- **uses-token**: a component or variant consumes a token. Source is the consumer, target is the
  token.
- **composes**: a larger entity is built from a smaller one (a card composes a button). Source is
  the whole, target is the part.
- **extends**: a variant or component specializes another (a `primary` button extends the base
  button). Source is the specialization.
- **transitions-to**: a screen or state moves to another in a flow. Used for navigation graphs
  and state machines.
- **depends-on**: a generic dependency where the more specific edge types do not fit. Source
  needs target to function.
- **mirrors**: two entities are intentional reflections of each other (a light-mode and dark-mode
  pair). Usually bidirectional.
- **conflicts-with**: two entities collide or duplicate intent (an anti-pattern conflicts with a
  sanctioned pattern). Used to surface debt.
- **referenced-by**: an inbound citation: the target points at the source from outside the graph
  core (a doc or a ticket references this entity). Often backward.
- **tested-by**: an entity is covered by a test. Source is the entity, target is the test node.
- **documented-by**: an entity is described by a doc. Source is the entity, target is the doc.
- **consumes-context**: an entity reads shared context provided elsewhere (a component reads a
  theme provider). Source is the reader.
- **provides-context**: an entity supplies shared context to others (a theme provider supplies a
  palette). Source is the provider; the matching reader uses `consumes-context`.

## The two-phase mapper pattern

A mapper builds the graph in two passes so the cheap, deterministic work is separate from the
costly, judgment-bearing work.

1. **Deterministic extract.** A pure pass walks the source (a Figma file, a component tree, a docs
   set) and emits node and edge skeletons: ids, types, names, tags, complexity, and every edge it
   can prove. Summaries are left empty. This pass is reproducible and dependency-free, so a graph
   can be rebuilt the same way every run.
2. **LLM summary.** A second pass fills each node `summary` with a one-line description an agent
   can read. Only the `summary` field changes; ids, types, and edges stay fixed from the extract
   pass. This keeps the expensive pass narrow and lets the validator flag any node the summary
   pass missed as a stub.

Splitting the work this way means the structure of the graph is deterministic and auditable, while
the prose layer can be regenerated on its own without disturbing the topology. A mapper writes a
Fragment; the assembler merges fragments into the canonical Graph.

## Cross-references

- Controlled `tags[]` vocabulary the validator enforces: see `./design-context-tag-vocab.md`.
- The JSON Schema (Draft-07) for the Graph: see `./schemas/design-context.schema.json`.
- The validator (structural, referential, completeness, tag checks):
  `scripts/validate-design-context.cjs`.
- The query library (filters, BFS path, consumers, orphans, cycles, coverage):
  `scripts/lib/design-context-query.cjs`.
