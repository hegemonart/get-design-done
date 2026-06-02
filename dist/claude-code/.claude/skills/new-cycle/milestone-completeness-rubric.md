---
name: milestone-completeness-rubric
type: heuristic
version: 1.0.0
phase: 28.5
tags: [milestone, closeout, rubric, completion, turn-closeout, new-cycle, complete-cycle]
last_updated: 2026-05-18
---

# Milestone Completeness Rubric

What "complete" means at each layer of the gdd lifecycle. Used by `skills/turn-closeout/`,
`skills/new-cycle/`, `skills/complete-cycle/`, the phase closeout discipline (Plan -12 of
every phase), and the cycle wrap-up flow. Centralized here so the rubric stays consistent
across consumers and updates land in one place rather than fanning out across N skills.

## Layers

The lifecycle has four nested layers. A layer is complete only when EVERY criterion at
that layer is satisfied. Layers above can only flip complete when every layer below has
flipped complete first — closeout walks bottom-up.

### Task level

The smallest unit of work — one row in a PLAN.md `<tasks>` list.

- Verify command runs with exit 0 (the `<verify>` block's command).
- The `<done>` criterion is observable (the file exists, the test passes, the output
  matches the contract).
- If the task is `tdd="true"`: tests pass after the GREEN step; tests fail before it.
- File diff is scoped to the declared `files_modified` only — no collateral damage.
- A single commit per task in conventional form `{type}({phase}-{plan}): {description}`.
- Deviations (Rules 1, 2, 3) tracked for the SUMMARY.md "Deviations" section.

### Plan level

A self-contained chunk of work — one `XX-YY-PLAN.md`.

- All tasks complete (per task level above).
- Plan-level validator passes (e.g. `validate-skill-length.cjs` for Phase 28.5 buckets;
  `validate-frontmatter.ts` for agent-frontmatter plans).
- SUMMARY.md written at `.planning/phases/XX-name/XX-YY-SUMMARY.md` with the canonical
  shape: deviations, files-modified table, commits, verification result, decisions.
- No collateral damage outside the plan's declared `files_modified` list — out-of-scope
  edits are forbidden (executor Rule 5 boundary).
- A final docs commit aggregates `SUMMARY.md`, `STATE.md`, `ROADMAP.md`, and
  `REQUIREMENTS.md` updates.

### Phase level

A coherent batch of plans — one `XX-name/` directory under `.planning/phases/`.

- All plans complete (per plan level above).
- Phase-level verification ALL pass (`<verification>` block in each PLAN.md).
- ROADMAP.md flipped `[ ]` → `[x]` for all plans in this phase (rule #14: scoped flip
  only — never flip plans outside this phase).
- Phase SUMMARY ladder coherent — each `XX-YY-SUMMARY.md` exists and reads top-to-bottom
  as a single story.
- All decisions surfaced through the SUMMARY frontmatter and rolled up into STATE.md's
  `<decisions>` block.

### Cycle level

A shipping milestone — typically one minor version bump in the gdd project.

- All phases for the cycle's target version complete (per phase level above).
- 4 manifests version-aligned: `plugin.json`, `marketplace.json`, `package.json`, and
  the phase-20 manifests-version baseline (`test-fixture/baselines/phase-XX/manifests-version.txt`).
- CHANGELOG.md entry written for the new version with one block per phase.
- Off-cadence registration if applicable — `tests/semver-compare.test.cjs` adds
  `OFF_CADENCE_VERSIONS.add('<version>')` for `.5`/`.6`/`.7` insertion-style versions.
- Regression baseline at `test-fixture/baselines/phase-XX/` exists and the
  `tests/phase-XX-baseline.test.cjs` suite passes (version-agnostic — reads
  `package.json#version`).
- NOTICE attribution updated if any third-party content was adopted in this cycle.
- Closeout plan's scoped ROADMAP flip touches only this cycle's checkboxes (precedent:
  Phase 28 closeout flipped exactly 7 inline + 1 overview entry).

## Cross-references

- `./STATE-TEMPLATE.md` — STATE.md schema; closeout updates the `<position>` block's
  `last_checkpoint` field.
- `../skills/turn-closeout/SKILL.md` — consumer at the turn boundary (within a stage).
- `../skills/new-cycle/SKILL.md` — consumer at cycle ingress.
- `../skills/complete-cycle/SKILL.md` — consumer at cycle egress.
- `../skills/quality-gate/SKILL.md` — Stage 4.5 gate that gates the plan-level "verify
  command runs with exit 0" criterion when project tooling exists.
