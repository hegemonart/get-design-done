# Summary 11-01: design-reflector Agent + /gdd:reflect Command

**Status**: Complete  
**Date**: 2026-04-18

## Delivered

- **`agents/design-reflector.md`** — Orchestrator-class agent (purple, XL budget, parallel-safe: never). Reads STATE.md, DESIGN-VERIFICATION.md, learnings/, telemetry/costs.jsonl, agent-metrics.json, question-quality.jsonl. Produces `.design/reflections/<cycle-slug>.md` with 6 reflection sections + numbered proposals (FRONTMATTER/REFERENCE/BUDGET/QUESTION/GLOBAL-SKILL). Supports `--dry-run` mode.
- **`skills/reflect/SKILL.md`** — `/gdd:reflect` command. Resolves cycle slug from STATE.md or `--cycle` flag. Spawns design-reflector, prints proposal count summary, directs user to `/gdd:apply-reflections`.
- **`skills/audit/SKILL.md`** updated — Reflector wired into default + retroactive modes (step 5). Spawns after design-auditor + integration-checker when `.design/learnings/` exists. `--no-reflect` flag skips it. Registered audit agents table added.
- **`SKILL.md`** updated — `argument-hint` includes `reflect|apply-reflections`. Command table has both rows in Audit & Session section. Routing logic has both mappings.
- **`agents/README.md`** updated — `design-reflector` added to Orchestrator tier examples. Frontmatter extensibility note added to schema table. Note about reflector proposals going through `/gdd:apply-reflections`.

## Acceptance Criteria

- [x] `agents/design-reflector.md` exists with correct frontmatter and full role description
- [x] `skills/reflect/SKILL.md` exists with `--dry-run` and `--cycle` flag handling
- [x] `skills/audit/SKILL.md` has reflector integration wired in
- [x] `SKILL.md` command table has `reflect` and `apply-reflections` rows
- [x] `agents/README.md` has `design-reflector` registered
