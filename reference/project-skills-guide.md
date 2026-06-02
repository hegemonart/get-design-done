# Project-Local Skills Guide

Project-local skills live at `./.claude/skills/` within the user's project (not the plugin install). They are auto-loaded by gdd pipeline stages (explore, plan, design) as additional design context.

## Auto-loaded patterns

Files matching `./.claude/skills/design-*-conventions.md` are read by:
- `explore` - included in DESIGN-CONTEXT.md synthesis under a `<project_conventions>` section
- `plan` - passed to design-planner as `<required_reading>`
- `design` - passed to the executor as `<required_reading>`

## File format

```markdown
# Design <Area> Conventions (Project-Local)

Auto-loaded in gdd sessions.

## Decision from sketch: <slug> (YYYY-MM-DD)
**Winner**: variant-2
**Rationale**: ...
**Token implications**: ...
```

## Typical areas

- `design-typography-conventions.md`
- `design-color-conventions.md`
- `design-layout-conventions.md`
- `design-motion-conventions.md`
- `design-component-conventions.md`
- `design-interaction-conventions.md`

## Writers

- `/gdd:sketch-wrap-up` appends winner rationale to the appropriate file
- User edits directly
- `/gdd:spike-wrap-up` may append to the relevant file when adopted

## Why this layer?

Design decisions accumulate across cycles. Without a project-local layer, `explore` would re-discover the same conventions each cycle and `plan` would lack continuity. This directory persists decisions and feeds them back into the pipeline automatically.
