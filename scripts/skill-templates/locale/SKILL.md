---
name: hone-locale
description: "Inspects or sets the GDD CLI locale for this project. With no argument, reports the resolved locale (config.locale > env LANG > en), the fallback chain, and per-locale coverage (which message tables are complete vs placeholder). With a <code> (en/ru/uk/de/fr/zh/ja), sets .design/config.json#locale after previewing the change. Localizes --help, common error messages, and skill prompt headers via scripts/lib/i18n/; missing keys fall back to English, so a partial locale never breaks the CLI. Use to switch GDD's own output language."
argument-hint: "[<code>]"
user-invocable: true
tools: Read, Write, Bash, Grep, Glob
---

# {{command_prefix}}locale

Closes the English-only CLI gap: GDD's README is multilingual, but `--help`, errors, and skill prompt
headers spoke English until now. This skill inspects or sets the project's locale. Contract:
`../../reference/cli-localization.md`.

## Invocation

| Command | Behavior |
|---|---|
| `{{command_prefix}}locale` | Report the resolved locale, the fallback chain, and per-locale coverage. |
| `{{command_prefix}}locale <code>` | Set `.design/config.json#locale` to `<code>` (en/ru/uk/de/fr/zh/ja), after preview. |

## Steps

1. **Resolve current.** Read `.design/config.json#locale` (if any) and the environment, then call the
   resolver to report the active locale + chain:

   ```bash
   node -e '
     const i = require("./scripts/lib/i18n/index.cjs");
     let cfg = {}; try { cfg = JSON.parse(require("fs").readFileSync(".design/config.json","utf8")); } catch {}
     const loc = i.resolveLocale({ env: process.env, configLocale: cfg.locale });
     const cov = i.KNOWN_LOCALES.map((l) => `${l}:${(i.loadTable(l)._meta||{}).coverage||"?"}`).join("  ");
     console.log(JSON.stringify({ resolved: loc, chain: i.fallbackChain(loc), coverage: cov }));
   '
   ```

2. **No argument** → print the resolved locale, the fallback chain, and the coverage line (which
   tables are `complete` vs `placeholder`). Stop.
3. **`<code>` argument** → validate it is in `KNOWN_LOCALES` (en/ru/uk/de/fr/zh/ja). Unknown → print the
   `error.invalid_locale` message + the known list, change nothing.
4. **Preview + set.** Show `locale: <old> -> <code>`, then write `locale` into `.design/config.json`
   (create the file if absent, preserving any existing keys). Confirm, and note that missing keys in a
   placeholder locale fall back to English.

## Output

End with:

```
## LOCALE COMPLETE
```
