# STYLE.md - Editorial Quality Floor

> GENERATED FILE. Do not edit by hand. Source of truth: `scripts/lib/manifest/prose-denylist.json`
> (the Phase 41.5 manifest root). Regenerate with `npm run build:style`; CI drift-gates it.

Get Design Done audits design quality. Phase 43 holds the project's OWN prose to the same floor: a
build-time linter (`scripts/lint-prose.cjs`, `npm run lint:prose`) fails CI on em dashes, double
hyphens, and AI-prose tells in user-facing documentation. Trust in a quality tool erodes when its own
surface reads like unedited model output.

## Banned tokens

| Token | Why |
|-------|-----|
| em dash (`—`) | Em dash - banned in the project's own user-facing prose (Phase 43). |
| double hyphen (`--`) | Double hyphen (often an em-dash surrogate). |

Replace an em dash with a spaced hyphen, a comma, a colon, or parentheses. Replace a double hyphen the
same way (CLI flags belong in `code` spans, which are skipped).

## Banned phrases (AI-prose tells)

These words cluster in model output and read as generic. Prefer the plain alternative.

| Phrase | Why |
|--------|-----|
| `load-bearing` | AI-prose tell (training-set monoculture). |
| `highest-leverage` | AI-prose tell (training-set monoculture). |
| `delve` | AI-prose tell (training-set monoculture). |
| `delves` | AI-prose tell (training-set monoculture). |
| `seamless` | AI-prose tell (training-set monoculture). |
| `seamlessly` | AI-prose tell (training-set monoculture). |
| `robust` | AI-prose tell (training-set monoculture). |
| `elevate` | AI-prose tell (training-set monoculture). |
| `empower` | AI-prose tell (training-set monoculture). |
| `underscore` | AI-prose tell (training-set monoculture). |
| `underscores` | AI-prose tell (training-set monoculture). |
| `in today's` | AI-prose tell (training-set monoculture). |
| `let's dive in` | AI-prose tell (training-set monoculture). |
| `moreover` | AI-prose tell (training-set monoculture). |
| `furthermore` | AI-prose tell (training-set monoculture). |
| `tapestry` | AI-prose tell (training-set monoculture). |
| `a testament to` | AI-prose tell (training-set monoculture). |
| `navigating the` | AI-prose tell (training-set monoculture). |
| `in the realm of` | AI-prose tell (training-set monoculture). |
| `unlock the power` | AI-prose tell (training-set monoculture). |
| `game-changer` | AI-prose tell (training-set monoculture). |
| `leverage` | AI-prose tell (training-set monoculture). |

## Scope

`lint:prose` scans: `README.md`, `README.*.md`, `SKILL.md`, `scripts/skill-templates/**/*.md`,
`agents/**/*.md`, `CHANGELOG.md`, `reference/**/*.md`. The generated `skills/` and `dist/`
trees are NOT scanned (`scripts/skill-templates/` is the authored copy). Files that are majority Cyrillic are
skipped (the denylist is English-only in v1).

## Skipped (not linted)

- Fenced code blocks (``` and `~~~`, any indentation) and inline `code` spans.
- YAML frontmatter and HTML comments.
- Content inside a disable block (see below).

## Escaping a genuine occurrence

For a real quote or example that must contain a banned token, wrap it:

```
<!-- prose-lint-disable -->
"It was the best of times — it was the worst of times."
<!-- prose-lint-enable -->
```

## Frontmatter

`validate-frontmatter` applies the same denylist to skill `description` fields (the highest-impact
prose surface). Keep descriptions plain.
