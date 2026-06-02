# Skill Placeholders - Multi-Harness Source Compilation

> Phase 42. Skills are authored once in `source/skills/` with placeholders and compiled per-harness into
> `dist/<bundle>/<config-dir>/skills/...` by `scripts/build-skills.cjs` (the pure transform lives in
> `scripts/lib/build/factory.cjs`; the per-harness values in `scripts/lib/build/harness-configs.cjs`,
> which reads the Phase 41.5 manifest root `scripts/lib/manifest/harnesses.json`). The Claude-Code
> compile target is the committed `skills/` tree; CI asserts `committed === generated` (the drift gate).

## The four placeholders

| Placeholder           | Meaning                                              | Claude value (round-trip anchor) |
|-----------------------|------------------------------------------------------|----------------------------------|
| `{{command_prefix}}`  | The slash-command invocation prefix before a verb.   | `/gdd:` (so `{{command_prefix}}audit` -> `/gdd:audit`) |
| `{{model}}`           | How the skill refers to the active model.            | `your configured Claude model`   |
| `{{config_file}}`     | The harness's settings/config file path.             | `.claude/settings.json`          |
| `{{ask_instruction}}` | How the skill tells the user to query the agent.     | `ask Claude Code`                |

Only `{{command_prefix}}` is currently woven through the migrated source (every literal `/gdd:` became
`{{command_prefix}}`); the other three are documented + factory-supported for authors who need them.
Because Claude's `command_prefix` is exactly `/gdd:`, `compile(source, claude)` reproduces `skills/`
byte-for-byte - that pure-inverse property is what makes the drift gate safe.

## Per-harness substitution table

| Harness id    | `{{command_prefix}}` | `{{config_file}}`           |
|---------------|----------------------|-----------------------------|
| `claude`      | `/gdd:`              | `.claude/settings.json`     |
| `codex`       | `/gdd-`             | `.codex/config.toml`        |
| `gemini`      | `/gdd:`              | `.gemini/settings.json`     |
| `qwen`        | `/gdd:`              | `.qwen/settings.json`       |
| `kilo`        | `/gdd:`              | `.kilo/config.json`         |
| `copilot`     | `/gdd:`              | `.copilot/config.json`      |
| `cursor`      | `/gdd:`              | `.cursor/settings.json`     |
| `windsurf`    | `/gdd:`              | `.windsurf/settings.json`   |
| `antigravity` | `/gdd:`              | `.antigravity/config.json`  |
| `augment`     | `/gdd:`              | `.augment/config.json`      |
| `trae`        | `/gdd:`              | `.trae/config.json`         |
| `codebuddy`   | `/gdd:`              | `.codebuddy/config.json`    |
| `cline`       | `/gdd:`              | `.cline/config.json`        |
| `opencode`    | `/gdd:`              | `.opencode/config.json`     |

`codex` is the deliberate outlier: its custom-prompt grammar is flat (`/gdd-audit`), not the namespaced
`/gdd:audit`. `{{model}}` and `{{ask_instruction}}` follow the pattern `your configured <Name> model` and
`ask <Name>` respectively (see `harness-configs.cjs` for exact strings). Adding a 15th harness is one new
entry in `scripts/lib/manifest/harnesses.json` plus an optional row in `harness-configs.cjs`.

## Escaping a literal placeholder

To emit a literal `{{command_prefix}}` (or any `{{...}}`) without substitution, backslash-escape the
opening braces: write `\{{command_prefix}}`. The factory strips the backslash and leaves the braces
untouched. Use this only when documenting the placeholder syntax itself.

## Harness-only blocks

To include a span of content for specific harnesses only, wrap it in an HTML-comment fence (it survives
Markdown and is easy to grep):

```
<!-- harness-only: cursor,codex -->
This sentence ships only in the Cursor and Codex bundles.
<!-- /harness-only -->
```

The block body is kept iff the compiling harness's `id` appears in the comma list; otherwise it is removed
entirely. Full per-harness content forking beyond placeholders and these blocks is intentionally out of
scope (a maintenance trap) - see the Phase 42 CONTEXT.

## Validation

`test/suite/phase-42-placeholders.test.cjs` asserts that every placeholder actually used across
`source/skills/` is documented in this file, and that `source/skills/` mirrors the `skills/` skill count.
