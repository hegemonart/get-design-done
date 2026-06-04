# `source/skills/` - Canonical Skill BODY Source

This directory is the **canonical home for skill body content**. Every `SKILL.md` under
`source/skills/<slug>/` is the editable truth: the per-skill prose, examples, procedure files,
and any sibling docs (`*-procedure.md`, `*-rules.md`, emitters, etc.) live here.

`skills/` (the sibling at the repo root) is a **built artifact**, regenerated from this directory
by `npm run build:skills`. Do not hand-edit `skills/<slug>/SKILL.md` - your edit will be wiped on
the next build and the CI drift gate (`build:skills:check`) will fail.

## Source-of-truth split (what lives where)

| Concern | Source of truth | How it reaches `skills/` |
|---|---|---|
| **Body content** (everything below the frontmatter) | `source/skills/<slug>/SKILL.md` | `scripts/build-skills.cjs` walks `source/skills/`, applies per-harness placeholder substitution, writes to `skills/` |
| **Universal frontmatter** (`name`, `description`, `argument-hint`, `tools`, `user-invocable`, `disable-model-invocation`) | `scripts/lib/manifest/skills.json` | `scripts/generate-skill-frontmatter.cjs` writes the managed block into `source/skills/<slug>/SKILL.md`, then `build:skills` copies it onward |
| **Non-managed frontmatter** (e.g. `color`, `model`, custom keys) | `source/skills/<slug>/SKILL.md` itself (preserved verbatim) | carried through both generators unchanged |

The forward direction is **`skills.json` -> `source/skills/` -> `skills/`**.
Treat that direction as canonical; the `--extract` mode of `generate-skill-frontmatter.cjs` exists
only to seed the manifest from current sources when reconciling drift.

## Editing protocol

1. **Edit body** -> modify `source/skills/<slug>/SKILL.md` (anything below the frontmatter delimiter).
2. **Edit universal frontmatter** -> modify `scripts/lib/manifest/skills.json`, then run
   `npm run generate:skill-frontmatter`.
3. **Edit non-managed frontmatter** -> modify `source/skills/<slug>/SKILL.md` directly; the generator
   preserves it.
4. **Regenerate the built surface** -> `npm run build:skills`. This rewrites `skills/<slug>/SKILL.md`
   byte-for-byte.
5. **Verify no drift** -> `npm run build:skills:check` (CI gate) and `npm run generate:skill-frontmatter:check`.

## What npm ships

`package.json` `files` lists `skills/` (the built surface); `source/skills/` is repo-only and is
**not** distributed via npm. Users running `npm install @hegemonart/get-design-done` get the
compiled skills; only contributors editing this repo touch `source/skills/`.

## Cross-references

- `scripts/build-skills.cjs` - the multi-harness orchestrator that compiles this directory.
- `scripts/lib/build/factory.cjs` - the pure transformer applied per-harness.
- `scripts/lib/manifest/README.md` - explains why `skills.json` is the universal-frontmatter SoT.
- `scripts/generate-skill-frontmatter.cjs` - manifest -> source-frontmatter generator (with
  `--check` drift gate and `--extract` reverse mode).
