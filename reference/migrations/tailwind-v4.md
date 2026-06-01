# Tailwind CSS v3 → v4 — Migration Rule Library

This is a **proposal-only** rule library consumed by `agents/ds-migration-planner.md` and the pure `scripts/lib/migration/codemod-gen.cjs`. It encodes the concrete, mechanical changes between Tailwind CSS v3 and v4 so the planner can template codemods. GDD never auto-applies any rule below — every codemod is surfaced as a reviewable diff the USER inspects and runs.

A note the planner should carry into any plan it writes: v4 raised its browser baseline (it targets modern Safari / Chrome / Firefox and leans on native CSS cascade layers, `@property`, and `color-mix()`). A project that must support older browsers is **not** a clean migration target — the planner should surface that as a blocker rather than emitting codemods, since no class rename below can recover the dropped baseline.

## Detection

Detect Tailwind and the v3→v4 boundary from `package.json` **alone** — no file-content scanning is required for the gate. The planner reads `dependencies` + `devDependencies` and classifies:

- **Tailwind present** — a `tailwindcss` key appears under `dependencies` or `devDependencies`. If absent, the project is out of scope and no rules apply.

- **On v3** — the `tailwindcss` semver range resolves to `^3` / `~3` / `3.x`. Corroborating signals:
  - a `tailwind.config.js` (or `.cjs` / `.mjs` / `.ts`) referenced by the build config, and
  - a PostCSS pipeline that lists the bare `tailwindcss` plugin (in v3 the PostCSS plugin ships *inside* the core package).

- **On v4** — the `tailwindcss` range resolves to `^4` / `4.x`, **and/or** one of the dedicated build packages is present:
  - `@tailwindcss/postcss` — the PostCSS plugin, which **moved out of core** into its own package in v4 (a high-confidence v4 marker), or
  - `@tailwindcss/vite` — the first-party Vite plugin (used instead of PostCSS in Vite projects).

- **Migration candidate** — `tailwindcss@^3` with **no** `@tailwindcss/postcss` and **no** `@tailwindcss/vite`. A `tailwind.config.js` that survives the version bump is the signal that the JS-config → CSS-first migration (TW4-02) has not yet run.

- **Build-tool target** — a `vite` dependency steers the planner toward the `@tailwindcss/vite` install target; otherwise assume the `@tailwindcss/postcss` PostCSS target. Do **not** infer Tailwind from a lockfile alone — require the manifest entry so the gate stays deterministic.

Reading the semver range: treat a leading `^3` / `~3` / `3` / `3.x` as v3, and `^4` / `4` / `4.x` as v4. A wildcard (`*`) or git/`file:` specifier is **ambiguous** — the planner should fall back to the corroborating signals above (presence of `@tailwindcss/postcss`, a surviving `tailwind.config.js`) and, if still unresolved, mark detection as inconclusive rather than guessing. Detection is package.json-only by design; the per-class renames in the table are confirmed later against source by the codemod step, not by this gate.

## Migration rules

Rule IDs are stable. `Kind ∈ rename-class | rename-prop | remove-component | token-rename | new-default`.

| Rule ID | Kind | From → To | Note |
|---------|------|-----------|------|
| TW4-01 | rename-prop | `@tailwind base; @tailwind components; @tailwind utilities;` → `@import "tailwindcss";` | The three v3 directives collapse into a single CSS import. Fully mechanical; affects the one entry CSS file. |
| TW4-02 | token-rename | `tailwind.config.js` (JS `theme`) → `@theme { … }` (CSS-first) | Theme moves into CSS custom properties under `@theme`. The JS config is still loadable via an `@config "./tailwind.config.js";` bridge, but the native v4 target is CSS. Highest-effort rule in the set. |
| TW4-03 | token-rename | `theme(colors.red.500)` in CSS → `var(--color-red-500)` | `@theme` tokens are emitted as real CSS variables, so `theme()` lookups and arbitrary values resolve to `var(--…)` references instead. |
| TW4-04 | rename-class | `shadow-sm` → `shadow-xs` | Box-shadow scale shifted one step down. **High visual delta** — every `shadow-sm` renders visibly smaller after the bump. |
| TW4-05 | rename-class | `shadow` → `shadow-sm` | The bare `shadow` alias is removed; the old default maps to the new explicit `shadow-sm`. |
| TW4-06 | rename-class | `drop-shadow` → `drop-shadow-sm` | Same bare-alias removal as TW4-05, applied across the `drop-shadow-*` filter scale. |
| TW4-07 | rename-class | `blur-sm` → `blur-xs` | Blur scale shifted one step down, mirroring the shadow scale. |
| TW4-08 | rename-class | `blur` → `blur-sm` | Bare `blur` alias removed; the old default becomes the explicit `blur-sm`. |
| TW4-09 | rename-class | `rounded-sm` → `rounded-xs` | Border-radius scale shifted one step down. |
| TW4-10 | rename-class | `rounded` → `rounded-sm` | Bare `rounded` alias removed; the old default becomes the explicit `rounded-sm`. |
| TW4-11 | rename-class | `ring` → `ring-3` | The default ring **width changed 3px → 1px** in v4. To preserve the v3 look the bare `ring` must become `ring-3`. **High visual delta** if skipped. |
| TW4-12 | new-default | bare `ring` color `blue-500` → `currentColor` | v4's bare `ring` now derives from `currentColor`, not `blue-500`. Where the blue was intentional, add an explicit `ring-blue-500`. |
| TW4-13 | rename-class | `outline-none` → `outline-hidden` | `outline-none` now emits a real `outline: none` (it was a transparent-outline a11y shim in v3). The old shim behavior is renamed `outline-hidden`; audit focus-visible styling when applying. |
| TW4-14 | rename-class | `bg-opacity-50` / `text-opacity-*` / `border-opacity-*` → `bg-black/50` (slash) | The `*-opacity-*` utilities are removed in favor of color/opacity slash syntax (`bg-black/50`, `text-white/70`). The numeric opacity value carries over directly. |
| TW4-15 | rename-class | `flex-shrink-0` / `flex-grow` → `shrink-0` / `grow` | The `flex-` prefix on shrink/grow was already deprecated in v3 and is removed in v4. Pure prefix strip, no value change. |
| TW4-16 | new-default | default border / divide color `gray-200` → `currentColor` | v4 borders and dividers default to `currentColor`, not `gray-200`. To preserve the v3 look, set `@theme { --color-border: …; }` or add explicit `border-gray-200`. **High visual delta.** |
| TW4-17 | rename-prop | `@layer utilities { … }` (custom utility) → `@utility name { … }` | Registering custom utilities now uses the `@utility` API; plain `@layer utilities` blocks no longer register sortable utilities. `@layer base` for resets still works. |
| TW4-18 | rename-prop | `corePlugins` / `safelist` (JS config) → `@source inline(…)` + CSS theme | v4 has no `corePlugins` toggle and content detection is automatic; explicit safelisting moves to `@source inline(...)`. Flag for manual handling — not a 1:1 token swap. |

## Impact notes

**High visual delta — require manual review and a screenshot diff before accepting:**

- **Scale shifts (TW4-04 through TW4-10).** Shadow, blur, and radius scales all shifted one step down. A blanket find/replace is correct *only if* the project used the default scale. Any project that overrode these in `tailwind.config.js` must reconcile against TW4-02 first, or the rename compounds with a custom scale and yields wrong sizes. Treat these seven rules as one coordinated set, not independent edits.
- **Ring width + color (TW4-11, TW4-12).** The default ring went from 3px/blue to 1px/currentColor. Focus rings are an accessibility surface, so both the width (`ring-3`) and color (`ring-blue-500`) rewrites should be reviewed against focus-visible states rather than applied silently.
- **Default border / divide color (TW4-16) and outline (TW4-13).** The `currentColor` border default and the `outline-none` → `outline-hidden` rename change visible chrome and focus behavior across the whole app. These are the two rules most likely to look "broken" immediately post-migration; verify against a representative page set.

**Mechanical — low risk, still proposal-only:**

- **Import directive (TW4-01)** and **flex-prefix strip (TW4-15)** are deterministic textual swaps with no visual consequence — safe to batch, but still emitted as a reviewable diff.
- **Opacity slash syntax (TW4-14)** is mechanical per-utility, but the codemod must pair the correct color literal with the opacity value — confirm it preserves the original color when expanding `bg-opacity-50` into `bg-<color>/50`.

**Needs a human design decision — not auto-templatable:**

- **CSS-first theme (TW4-02), `theme()` rewrites (TW4-03), custom-utility migration (TW4-17), and config-feature removal (TW4-18)** depend on the project's actual theme shape and custom utilities. The planner should emit a scaffold (an `@theme` block skeleton plus an `@config` bridge note) and hand the remainder to the USER rather than attempting a full automatic translation. The `@config` directive is the recommended interim bridge so a project can adopt the v4 build packages *before* fully porting its JS theme.

**Application order and idempotency (for `codemod-gen.cjs`):**

- The shadow, blur, and radius scales each contain a **shift hazard**: renaming the bare alias up one step (e.g. TW4-05 `shadow` → `shadow-sm`) and shifting the named step down (TW4-04 `shadow-sm` → `shadow-xs`) target overlapping tokens. A naive two-pass run can double-apply — `shadow` becomes `shadow-sm` becomes `shadow-xs`. Templates must rename in a **single atomic pass** (match the original token, map to its final value) so each utility is rewritten exactly once. The same hazard applies to the `blur-*` (TW4-07/08) and `rounded-*` (TW4-09/10) pairs.
- Run the entry-CSS rules (**TW4-01**, then the **TW4-02 / TW4-03 / TW4-17** theme scaffold) before the class renames, so the build is parseable under v4 before utility classes change. Class renames (TW4-04 through TW4-16) operate on template/markup files and are independent of each other once the single-pass rule above is respected.
- Every generated codemod should be **idempotent** — re-running it on already-migrated source must be a no-op. The planner surfaces the full set as one reviewable changeset; the USER applies it, not GDD.
