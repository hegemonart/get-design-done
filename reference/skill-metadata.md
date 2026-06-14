---
name: skill-metadata
type: meta-rules
version: 1.0.0
phase: 46
tags: [skill, metadata, frontmatter, single-source-of-truth, generator, description-budget]
last_updated: 2026-06-02
---

# Skill Metadata Single Source of Truth

`scripts/lib/manifest/skills.json` is the one place skill frontmatter is authored. A
generator projects it onto every `scripts/skill-templates/<id>/SKILL.md`, the build step compiles
those into the shipped trees, and CI gates keep the three copies identical. This doc
explains the file, the generator, and the description budget. For the structural rules a
SKILL.md body must follow (line cap, progressive disclosure, frontmatter required fields),
see `./skill-authoring-contract.md`.

## What skills.json is

The file is a JSON object: a `schema_version` integer and a `skills` array. Each array
element is one skill record. Only `name` is required (it must equal the
`scripts/skill-templates/<id>/` directory name); every other field is optional and omitted when it
has no value.

```json
{
  "schema_version": 1,
  "skills": [
    {
      "name": "health",
      "description": "Reports .design/ artifact health - staleness, missing files, token drift, broken state transitions.",
      "tools": "Read, Bash, Glob, Grep, mcp__hone_state__get",
      "disable_model_invocation": true
    }
  ]
}
```

Recognized record fields: `name`, `description`, `argument_hint`, `tools`,
`user_invocable`, `disable_model_invocation`, `frontmatter_name` (the `name:` value when it
is not the default `hone-<id>`), `extra_frontmatter` (see below), plus `registered_in_phase`
and `aliases`, which live only in the manifest and never round-trip to frontmatter. The
schema at `scripts/lib/manifest/schemas/skills.schema.json` validates the shape.

## The build chain

Metadata flows in one direction, and a `*:check` gate guards each hop:

```text
skills.json
  -> generate-skill-frontmatter      (npm run generate:skill-frontmatter)
  -> scripts/skill-templates/<id>/SKILL.md
  -> build:skills                     (npm run build:skills)
  -> skills/  +  dist/claude-code/
```

`scripts/generate-skill-frontmatter.cjs` rewrites only the frontmatter block of each
`SKILL.md`, never the markdown body. It has three modes:

- forward (no flag): manifest to frontmatter. The default.
- `--extract`: the reverse direction, reading current frontmatter back into `skills.json`
  to seed or refresh the source of truth. Idempotent with forward.
- `--check`: the CI drift gate. It writes nothing and exits non-zero when any committed
  frontmatter differs from what the manifest would generate.

`scripts/build-skills.cjs` then propagates `scripts/skill-templates/` into the committed `skills/`
tree and `dist/claude-code/`; its own check mode asserts that the built output equals the
committed output. So the contract is: edit `skills.json`, regenerate, build. Never
hand-edit a managed frontmatter line in `SKILL.md`, because the drift gate will fail.

## Managed vs preserved fields

The generator owns six frontmatter keys and emits them in this canonical order whenever the
record carries a value:

1. `name`
2. `description`
3. `argument-hint`
4. `tools`
5. `user-invocable`
6. `disable-model-invocation`

String values for `description` and `argument-hint` are always double-quoted on emit, so
quoting stays uniform across every skill. Anything outside these six keys is not managed.
The generator carries it verbatim in the record's `extra_frontmatter` array and re-emits it
after the managed block. The `quality-gate` skill is the working example: its `color`,
`model`, `default-tier`, `size_budget`, `parallel-safe`, `typical-duration-seconds`,
`reads-only`, and multi-line `writes:` block all live in `extra_frontmatter` and survive
every regeneration untouched.

## Description budget

Every `description` must be at least 20 and at most 1024 characters. Two validators enforce
the ceiling in CI:

- `scripts/validate-skill-length.cjs` treats `DESC_MAX = 1024` as a blocker (it also blocks
  under 20 characters as under-specification) and is the Phase 28.5 authoring-contract gate.
- `scripts/lint-agentskills-spec.cjs` rule R4 applies the same 1024-character hard cap from
  the agentskills.io spec angle, and warns past 200 characters.

Phase 46 keeps that contract intact and wires `npm run lint:agentskills` in as its own
explicit CI gate, so the spec lint runs on every change rather than only in-process via the
doctor aggregator.

## How pin consumes it

The `pin`, `unpin`, and `list-pins` skills shipping in this phase read `description`,
`argument_hint`, and `tools` straight from `skills.json`. That manifest is the pin metadata
catalogue: the pin surface never live-scrapes a `SKILL.md` or re-derives a description at
runtime. Reading one structured file keeps pin output consistent with what the generator
emits, and the `aliases` array is reserved for the pin shortcuts those skills honor.

## See also

- `./skill-authoring-contract.md` for the SKILL.md line cap, description-format guidance,
  required frontmatter fields, and progressive-disclosure rule.
