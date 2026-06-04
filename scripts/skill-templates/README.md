# `scripts/skill-templates/` - Editable Skill Source (Single Source of Truth)

This directory is the **only** place to edit skill content. Every `SKILL.md` and sibling
doc here is the editable truth - the per-skill prose, examples, procedure files
(`*-procedure.md`, `*-rules.md`, emitters, etc.) all live here.

The user-facing `skills/` directory at the repo root is a **build artifact**, not source.
It's gitignored and regenerated automatically:

- on `npm install` (via the `prepare` lifecycle script) - so developer clones work immediately
- on `npm pack` / `npm publish` (via `prepack`) - so the published tarball ships pre-built skills

End users installing `@hegemonart/get-design-done` from the npm registry receive a tarball
with `skills/` already built; no build step runs on their machine.

## Why two directories, not one

Claude Code reads `./skills/<slug>/SKILL.md` raw. If we kept `{{command_prefix}}` placeholders
in the file Claude reads, the literal text `{{command_prefix}}` would show up in the prompt.
So the editable templates need to live separately from the rendered output.

The previous layout (Phase 42) put templates under `source/skills/` AND committed the
rendered `skills/` alongside. That meant 232 tracked files for 116 distinct skills with
identical content modulo a single placeholder substitution. Pure git churn.

v1.58.0 fixes this: templates are tracked once at `scripts/skill-templates/`, the rendered output
is generated on demand.

## Source-of-truth split (what lives where)

| Concern | Source of truth | How it reaches `skills/` |
|---|---|---|
| **Body content** (everything below the frontmatter) | `scripts/skill-templates/<slug>/SKILL.md` | `scripts/build-skills.cjs` walks `scripts/skill-templates/`, applies per-harness placeholder substitution, writes to `skills/` |
| **Universal frontmatter** (`name`, `description`, `argument-hint`, `tools`, `user-invocable`, `disable-model-invocation`) | `scripts/lib/manifest/skills.json` | `scripts/generate-skill-frontmatter.cjs` writes the managed block into `scripts/skill-templates/<slug>/SKILL.md`, then `build:skills` copies it onward |
| **Non-managed frontmatter** (e.g. `color`, `model`, custom keys) | `scripts/skill-templates/<slug>/SKILL.md` itself (preserved verbatim) | carried through both generators unchanged |

The forward direction is **`skills.json` -> `scripts/skill-templates/` -> `skills/`**.
Treat that direction as canonical; the `--extract` mode of `generate-skill-frontmatter.cjs` exists
only to seed the manifest from current sources when reconciling drift.

## Editing protocol

1. **Edit body** -> modify `scripts/skill-templates/<slug>/SKILL.md` (anything below the frontmatter delimiter).
2. **Edit universal frontmatter** -> modify `scripts/lib/manifest/skills.json`, then run
   `npm run generate:skill-frontmatter`.
3. **Edit non-managed frontmatter** -> modify `scripts/skill-templates/<slug>/SKILL.md` directly; the generator
   preserves it.
4. **Regenerate the built surface** -> `npm run build:skills`. This rewrites the gitignored
   `skills/<slug>/SKILL.md` byte-for-byte from the templates.
5. **Verify the build** -> `npm run build:skills:check` (CI gate) confirms compile determinism
   and that the on-disk `skills/` matches what `scripts/skill-templates/` would generate.

## Placeholders

Four substitution slots are supported by `scripts/lib/build/factory.cjs`:

- `{{command_prefix}}` - slash-command prefix (`/gdd:` for Claude, `/gdd-` for Codex, etc.)
- `{{model}}` - human-readable model phrase ("your configured Claude model", etc.)
- `{{config_file}}` - per-harness config path (`.claude/settings.json`, `.codex/config.toml`, ...)
- `{{ask_instruction}}` - "ask Claude Code", "ask Codex", etc.

Plus conditional blocks: `<!-- harness-only: claude,codex -->BODY<!-- /harness-only -->` keeps
`BODY` only when the active harness id is in the listed set.

Escape with `\{{ ... }}` to emit a literal `{{...}}` in the output (never substituted).

Full grammar + the per-harness substitution table: `reference/skill-placeholders.md`.

## What npm ships

`package.json` `files` lists `skills/` (the built surface); `scripts/skill-templates/` is repo-only and
is **not** distributed via npm. The `prepack` lifecycle runs `npm run build:skills` so the tarball
always contains a freshly-built `skills/`.

## Cross-references

- `scripts/build-skills.cjs` - the multi-harness orchestrator that compiles this directory.
- `scripts/lib/build/factory.cjs` - the pure transformer applied per-harness.
- `scripts/lib/manifest/README.md` - explains why `skills.json` is the universal-frontmatter SoT.
- `scripts/generate-skill-frontmatter.cjs` - manifest -> source-frontmatter generator (with
  `--check` drift gate and `--extract` reverse mode).
- `reference/skill-placeholders.md` - placeholder grammar + per-harness substitution table.
