# Deprecations

This registry tracks renamed, split, or removed plugin concepts. Each entry names the deprecated name, the phase that deprecated it, the replacement, and a migration note.

**CI enforcement:** `scripts/detect-stale-refs.cjs` scans shipped `.md` files
for legacy tokens and fails the build on any occurrence. The scanner's pattern
list mirrors the tokens named below. When a new deprecation lands here, update
the scanner pattern list in lockstep.

## Namespaces

- **`/design:<cmd>`** → `/gdd:<cmd>` — deprecated in Phase 7 (namespace rename). All commands now use the `/gdd:` prefix. Migrated: every shipped skill invocation and agent reference now uses `/gdd:`.

## Agents

- **`design-context-builder`** — replaced by the Phase 3 agent split (design-context-reader + design-context-summarizer). Mentioned only in historical documentation; new work must spawn the split agents directly.
- **`design-pattern-mapper`** (monolithic) → split into 5 domain mappers in Phase 3 (migrated):
  - `token-mapper`
  - `component-taxonomy-mapper`
  - `a11y-mapper`
  - `motion-mapper`
  - `visual-hierarchy-mapper`

  The legacy `design-pattern-mapper.md` agent is retained as a compatibility shim pending full removal in a later phase. New work should spawn the domain mappers directly.

## Stages

- **`scan`** (stage name) → merged/renamed into `explore` in Phase 3. Migration: references to the `scan` stage in shipped skills and agents were replaced with `explore`.
- **`discover`** (stage name) → merged/renamed into `explore` in Phase 3. Migration: references to the `discover` stage in shipped skills and agents were replaced with `explore`.

## Scanner scope

`scripts/detect-stale-refs.cjs` flags these tokens (line-granular match):

- `/design:<cmd>` — any occurrence of the legacy namespace
- `design-context-builder` (standalone word)
- `design-pattern-mapper` (when not followed by `-<suffix>`)
- `scan/SKILL.md` and `discover/SKILL.md` path references

The scanner excludes `.planning/`, `.claude/`, `.design/`, `node_modules/`,
`test-fixture/`, and this file itself.

## Path migrations (machine-readable)

Phase 39.5 adds a machine-readable registry of **path** migrations — modules/files GDD moved or
removed. `scripts/lib/deprecation-registry.cjs` parses the table below; `/gdd:migrate` consults it to
help users update local references; `test/suite/deprecation-completeness.test.cjs` asserts every row
is honest (a `removed` row's `Old` path must be gone from the tree; a `deprecated` row's `Old` path
must still carry a shim).

### Status semantics

A row's status is derived from the running plugin version `v`:

- **pending** — `v` < `Since` (deprecation announced for a future version; rare).
- **deprecated** — `Since` ≤ `v` < `Removed in` (the old path still works via a shim; update at leisure).
- **removed** — `v` ≥ `Removed in` (the old path is gone; you MUST use the new path).

**Default shim lifetime is one minor version** (the Phase 31.5 precedent): a path deprecated in `x.y.z`
is removed in the next minor `x.(y+1).0`. The `Removed in` column is authoritative per row.

### Table

Columns: `Since` (version the move shipped) · `Removed in` (version the old path stops working;
blank = still shimmed) · `Old` (pre-move path) · `New` (current path) · `Migration hint`.

| Since | Removed in | Old | New | Migration hint |
|---|---|---|---|---|
| 1.31.5 | 1.33.0 | `scripts/lib/cli` | `sdk/cli` | Import the CLI barrel from `sdk/cli` instead of `scripts/lib/cli`. |
| 1.31.5 | 1.33.0 | `scripts/lib/event-stream` | `sdk/event-stream` | Import the event-stream barrel from `sdk/event-stream`. |
| 1.31.5 | 1.33.0 | `scripts/lib/gdd-state` | `sdk/state` | Import the STATE primitives from `sdk/state`. |
| 1.31.5 | 1.33.0 | `scripts/lib/gdd-errors` | `sdk/errors` | Import the error types from `sdk/errors`. |
| 1.31.5 | 1.33.0 | `scripts/lib/error-classifier.cjs` | `sdk/primitives/error-classifier.cjs` | Require `sdk/primitives/error-classifier.cjs`. |
| 1.31.5 | 1.33.0 | `scripts/lib/iteration-budget.cjs` | `sdk/primitives/iteration-budget.cjs` | Require `sdk/primitives/iteration-budget.cjs`. |
| 1.31.5 | 1.33.0 | `scripts/lib/jittered-backoff.cjs` | `sdk/primitives/jittered-backoff.cjs` | Require `sdk/primitives/jittered-backoff.cjs`. |
| 1.31.5 | 1.33.0 | `scripts/lib/lockfile.cjs` | `sdk/primitives/lockfile.cjs` | Require `sdk/primitives/lockfile.cjs`. |
| 1.31.5 | 1.33.0 | `scripts/mcp-servers/gdd-state/server.ts` | `sdk/mcp/gdd-state/server.ts` | Point the MCP server config at `sdk/mcp/gdd-state/server.ts`. |
| 1.31.5 | 1.33.0 | `scripts/mcp-servers/gdd-mcp/server.ts` | `sdk/mcp/gdd-mcp/server.ts` | Point the MCP server config at `sdk/mcp/gdd-mcp/server.ts`. |

All ten rows are **removed** as of the current release (the Phase 31.5 → `sdk/` reorg; shims removed
in v1.33.0). The completeness gate confirms none of the `Old` paths remain in the tree.
