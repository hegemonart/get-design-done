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
