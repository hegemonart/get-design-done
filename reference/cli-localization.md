# CLI Localization - GDD's Own Surface

Phase 40.5 contract. `reference/i18n.md` covers internationalizing *user designs*; this file covers
**GDD's own CLI** - `--help`, the common error messages, and skill prompt headers. The goal is the
lowest-effort, highest-impact subset; full skill-body translation is deferred (per-locale demand).

## Resolution

`scripts/lib/i18n/index.cjs` resolves the active locale with this precedence:

1. **`.design/config.json#locale`** - an explicit per-project override (set via `/gdd:locale <code>`).
2. **`process.env`** - `LC_ALL` / `LC_MESSAGES` / `LANG` / `LANGUAGE` (normalized: `ru_RU.UTF-8` → `ru`).
3. **`en`** - the default.

A `C` / `POSIX` env locale resolves to `en`. The resolved code then drives a **fallback chain**
`locale → base → en` (e.g. `de-DE → de → en`), so a regional locale degrades to its base and finally
to English - the complete source table.

## Message tables

Flat-JSON tables live at `scripts/lib/i18n/messages/<locale>.json` (chosen over ICU MessageFormat for
simplicity). Each is `{ "_meta": { locale, coverage, fallback }, "<key>": "<string>", ... }`. Keys are
namespaced: `help.*` (usage + section headers), `error.*` (the common CLI errors), `prompt.*` (skill
prompt headers), `status.*`.

- **`en.json`** - the **complete source of truth**; every key lives here.
- **`ru.json`** - a complete second-locale translation (covers every `en` key).
- **`uk.json` / `de.json` / `fr.json` / `zh.json` / `ja.json`** - **placeholders**: a `_meta` marker
  (`coverage: "placeholder"`) plus a starter subset. Any missing key falls back to `en` per the chain.

`translate(tables, key, locale)` walks the chain and returns the first hit, or the key itself if no
table has it (a missing key is always visible, never a crash).

## Frontmatter `description_i18n`

Skills and agents may carry an **opt-in** `description_i18n: { <locale>: "<description>" }` map.
`descriptionFor(frontmatter, locale)` returns the localized description via the fallback chain, or the
plain English `description` when the locale is absent. The field is fully backward-compatible - a
skill/agent without it is unaffected, and the Phase 28.5 contract only validates it (as an object of
locale→string) when present.

## Completeness policy

The completeness gate is **warn-only**. Only `en` (source) and `ru` (full) are expected to be 100%; the
five placeholder locales are intentionally partial and rely on the English fallback. A locale is never
required to be complete to ship - partial is better than English-only, and fallback guarantees no key
is ever missing at runtime.

## Adding or completing a locale (contribution path)

1. Edit `scripts/lib/i18n/messages/<locale>.json` - add the keys you can translate (any `en` key is
   fair game; you do not need 100%).
2. Set `_meta.coverage` to `"complete"` once every `en` key is present, else leave `"placeholder"`.
3. Add a translator-credit line to `NOTICE` under the attributions section (name/handle + locale).
4. Open a PR. The warn-only gate reports coverage; it does not block on partial locales.

## Boundaries

`--help` + common errors + skill prompt headers only - not full skill bodies (deferred per demand),
not RTL terminal rendering (a terminal concern), not voice/conversational localization. English is
always the final fallback, so the CLI is never broken by a partial translation.
