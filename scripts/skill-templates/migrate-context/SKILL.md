---
name: hone-migrate-context
description: "Migrates a pre-Phase-52 project from the flat .design/map/*.md mapper notes to the typed DesignContext graph at .design/context-graph.json. Reads the old map notes, runs the deterministic extract-*.mjs passes to build mapper fragments, merges them with merge-fragments.mjs, validates the result with validate-design-context.cjs, and flags every low-confidence transform for human review before anything is trusted. Read-first and reversible; --dry-run previews the plan without writing. Use when upgrading a project to the DesignContext graph and .design/map/*.md still holds the only structured design notes. Activates for requests involving migrating design maps, building the context graph from old notes, or DesignContext graph migration."
argument-hint: "[--dry-run]"
tools: Read, Write, Bash
user-invocable: true
---

# {{command_prefix}}migrate-context

Closes the pre-graph gap: before Phase 52 a project recorded its structured design knowledge as flat
`.design/map/*.md` mapper notes (token map, component taxonomy, motion map, a11y map, visual-hierarchy
map). Phase 52 introduced the typed DesignContext graph at `.design/context-graph.json`. This skill
carries a project across that boundary: it reads the old map notes, rebuilds the graph deterministically
from source, validates it, and surfaces anything it could not transform with confidence so a human can
confirm it. It never trusts a low-confidence guess silently.

Contracts: `../../reference/design-context-schema.md` (the Node / Edge / Fragment / Graph shapes) and
`../../reference/design-context-tag-vocab.md` (the controlled `tags[]` vocabulary).

## Invocation

| Command | Behavior |
|---|---|
| `{{command_prefix}}migrate-context` | Run the full migration: read old maps, extract fragments, merge, validate, then report the low-confidence items for review. |
| `{{command_prefix}}migrate-context --dry-run` | Preview only. Print the migration plan and what each step would write, change nothing on disk. |

## Step 1 - Detect the pre-52 state

Read the project layout before touching anything.

1. List `.design/map/*.md`. These are the pre-52 mapper notes (for example `token-map.md`,
   `component-taxonomy.md`, `motion-map.md`, `a11y-map.md`, `visual-hierarchy.md`). If the directory is
   absent or empty, there is nothing to migrate: print `No .design/map/*.md notes found; nothing to
   migrate.` and stop.
2. Check whether `.design/context-graph.json` already exists. If it does, this is a re-run: keep the
   existing graph as a backup reference and report that the migration will rebuild it. Do not delete it.
3. In `--dry-run`, print the file list and the planned outputs (`.design/fragments/<mapper>.json` per
   mapper, then `.design/context-graph.json`) and stop before Step 2.

## Step 2 - Rebuild fragments deterministically

The graph topology comes from the source tree, not from prose. Run each deterministic extractor over the
configured source roots (default `src/`; read `source_roots` from `.design/STATE.md` if present). Each
extractor is pure, dependency-free, and prints a schema-valid Fragment to stdout.

```bash
mkdir -p .design/fragments
for mapper in tokens components motion a11y visual-hierarchy; do
  node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/lib/design-context/extract-${mapper}.mjs" src/ \
    > ".design/fragments/extract-${mapper}.json"
done
```

The extractors fill `id / type / name / subtype / tags / complexity` and every edge they can prove; they
leave each node `summary` empty for the summary pass. Use the old `.design/map/*.md` notes as the source
of the human-authored `summary` text and any tags the extractor could not infer: for each node whose name
matches a map entry, copy that note's one-line description into the node `summary` and add any vocabulary
tags it implies. This is the only place prose feeds the graph.

## Step 3 - Merge into the canonical graph

Merge the fragments into the single graph. The merger dedupes nodes by `id`, unions tags, prefers a
non-stub summary over the empty stub, and keeps an edge only when both endpoints resolve to a node in some
fragment. Dropped dangling edges are reported on stderr as `could-not-fix:` lines.

```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/lib/design-context/merge-fragments.mjs" \
  .design/fragments --out .design/context-graph.json
```

Capture the stderr `could-not-fix:` lines. Each one is a transform the merge could not complete (a map
note referenced an entity the extractor never found in source). These are low-confidence items for Step 5,
not silent drops.

## Step 4 - Validate

Validate the merged graph. The validator checks structure, referential integrity (no dangling edges),
unique ids, non-stub summaries (soft warning), and the controlled tag vocabulary (soft warning).

```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/validate-design-context.cjs" .design/context-graph.json
```

Exit `0` is clean, `1` is warnings only (stub summaries or unknown tags to tidy later), `2` is a hard
error (a dangling edge or duplicate id) that must be fixed before the graph is trusted. On exit `2`, do
not present the graph as migrated: report the errors and stop so a human can resolve them.

## Step 5 - Flag low-confidence transforms

Collect everything that needs human eyes and present it as one review list rather than applying it:

- every `could-not-fix:` line from the merge (an unresolved or dropped edge);
- every node still carrying an empty `summary` after Step 2 (a map note had no matching entity, or no
  note existed);
- every validator `WARN` (stub summary, tag outside the controlled vocabulary).

Print the list with a clear heading and ask the user to confirm or correct each item. Do not auto-resolve
a low-confidence transform: a wrong edge or a mislabeled node poisons every later graph query.

## Step 6 - Deprecate the old map notes

The flat `.design/map/*.md` notes stay readable for one minor version so nothing breaks mid-upgrade. Add a
one-line deprecation banner to the top of each migrated map note (do not delete the file):

```text
> Deprecated: superseded by the DesignContext graph (.design/context-graph.json) as of Phase 52.
> Read-only for one minor version; regenerate the graph with {{command_prefix}}migrate-context.
```

In `--dry-run`, describe this banner instead of writing it. Announce that the next minor version may remove
the `.design/map/*.md` notes, and that the graph is now the source of truth.

## Do Not

- Do not trust a low-confidence transform silently. Every `could-not-fix:` line and every stub goes on the
  Step 5 review list.
- Do not delete `.design/map/*.md`. Add the deprecation banner and keep the notes for one minor version.
- Do not hand-edit `.design/context-graph.json` to force validation green. Fix the fragment or the source,
  then re-merge.
- Do not edit the extractors, the merger, or the validator. This skill only calls them.

## MIGRATE-CONTEXT COMPLETE
