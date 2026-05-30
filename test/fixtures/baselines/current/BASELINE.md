# Current Regression Baseline

**Locked:** 2026-04-19
**Plugin version:** 1.0.7

## What this baseline locks

The deterministic output of `/gdd:explore` on `test-fixture/src/` at the current release,
plus the structural inventory of agents, skills, and connections. The release-time smoke test
diffs against this baseline on every tag creation.

## Smoke test behavior

The fixture (`test-fixture/src/App.jsx`, `App.css`, `index.css`) is small enough that
`build-intel.cjs` produces no deterministic intel slices — the baseline is a manifest-only
lock. `scripts/release-smoke-test.cjs` treats missing artifacts as informational; only
byte-level diffs fail the build.

## Structural invariants

- Agents: 21 `design-*.md` files (see `agent-list.txt`)
- Skill directories: 55 (see `skill-list.txt`)
- Connections: 10 `connections/*.md` files (see `connection-list.txt`)
- All agents carry required frontmatter fields: `name`, `description`, `tools`, `color`

## Relock trigger

Relock when a change adds, renames, or removes agents / skills / connections, changes
agent frontmatter shape, or changes `scripts/build-intel.cjs` output on `test-fixture/src/`.
See `README.md` in this directory for the one-shot procedure.
