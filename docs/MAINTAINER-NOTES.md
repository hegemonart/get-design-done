# Maintainer Notes

Internal documentation for plugin maintainers. Not shipped to user runtimes - this lives
in `docs/` precisely so it does NOT end up in `skills/` or `dist/<harness>/`.

If you are a user of the plugin, you can stop reading here.

---

## Milestone Completeness Rubric

What "complete" means at each layer of the plugin's own internal release lifecycle. This
is about how we ship `hone` itself - phases, plans, tasks, cycle releases - NOT
about the user-facing design cycle (which is a separate concept covered by the
`new-cycle` / `complete-cycle` skills).

### Layers

The internal lifecycle has four nested layers. A layer is complete only when EVERY
criterion at that layer is satisfied. Layers above can only flip complete when every
layer below has flipped complete first - closeout walks bottom-up.

#### Task level

The smallest unit of work - one row in a plan's task list.

- Verify command runs with exit 0.
- The `<done>` criterion is observable (the file exists, the test passes, the output
  matches the contract).
- If the task is `tdd="true"`: tests pass after the GREEN step; tests fail before it.
- File diff is scoped to the declared `files_modified` only - no collateral damage.
- A single commit per task in conventional form.
- Deviations tracked for the run summary's "Deviations" section.

#### Plan level

A self-contained chunk of work - one plan file.

- All tasks complete (per task level above).
- Plan-level validator passes (e.g. `validate-skill-length.cjs` for skill-length
  buckets; `validate-frontmatter.ts` for agent-frontmatter plans).
- Run summary written with the canonical shape: deviations, files-modified table,
  commits, verification result, decisions.
- No collateral damage outside the plan's declared `files_modified` list - out-of-scope
  edits are forbidden.
- A final docs commit aggregates the run summary and any roadmap/state updates.

#### Phase level

A coherent batch of plans - one phase directory.

- All plans complete (per plan level above).
- Phase-level verification ALL pass (each plan's `<verification>` block).
- Roadmap flipped `[ ]` -> `[x]` for all plans in this phase (scoped flip only - never
  flip plans outside this phase).
- Phase run-summary ladder coherent - each summary exists and reads top-to-bottom as a
  single story.
- All decisions surfaced through the summary frontmatter and rolled up into the
  state's decisions block.

#### Cycle level (plugin release)

A shipping milestone - typically one minor version bump in the plugin itself.

- All phases for the target version complete (per phase level above).
- 4 manifests version-aligned: `plugin.json`, `marketplace.json`, `package.json`, and
  the manifests-version baseline (`test/fixtures/baselines/phase-XX/manifests-version.txt`).
- CHANGELOG entry written for the new version with one block per phase.
- Off-cadence registration if applicable - `test/suite/semver-compare.test.cjs` adds
  `OFF_CADENCE_VERSIONS.add('<version>')` for `.5` / `.6` / `.7` insertion-style versions.
- Regression baseline at `test/fixtures/baselines/phase-XX/` exists and the matching
  baseline suite passes (version-agnostic - reads `package.json#version`).
- NOTICE attribution updated if any third-party content was adopted in this cycle.
- Closeout plan's scoped roadmap flip touches only this cycle's checkboxes.

### Where this used to live

This rubric previously shipped as `skills/new-cycle/milestone-completeness-rubric.md`,
but its content speaks to plugin-developer concerns (internal phases, manifest lockstep,
off-cadence registration) rather than the user-facing design cycle. It was relocated to
this maintainer-only document so it no longer ships to user runtimes.

The user-facing `new-cycle` skill remains focused on starting a design cycle and the
`complete-cycle` skill on archiving one - neither relies on this internal rubric.
