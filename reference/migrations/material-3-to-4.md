# Material Design Token Migration (M3 → next) - Rule Library

Honest framing: Google has **not** released a "Material Design 4" spec - Material publicly evolved M2 → M3 (Material You), and there is no public M4. This library is therefore a **forward-looking rule set for migrating a Material-token-based design system to the next Material major**, grounded entirely in the **real, well-documented M2 → M3 token migration** (the `--mdc-*` → `--md-sys-*` reshape, color-role expansion, reference-vs-system token split, typescale rename, and `mwc-*` → `md-*` component rename). Those concrete patterns are the migration *shape* the next major will most plausibly follow; nothing below invents tokens from a fictional spec. GDD never auto-applies - these rules feed `ds-migration-planner` and template `codemod-gen.cjs` output that the USER reviews and runs.

## Detection

Detect a Material-token design system from `package.json` **only** (no lockfile, no source scan at this stage):

- **Dependencies** (`dependencies` / `devDependencies` / `peerDependencies`):
  - `@material/web` - Material Web Components (M3-era; the forward-migration target surface).
  - `@material/*` MDC packages - `@material/button`, `@material/textfield`, `@material/theme`, `@material/typography`, etc. (M2-era MDC Web). Presence of many `@material/<component>` entries strongly signals an M2 MDC system.
  - `material-components-web` - the MDC Web umbrella package (M2-era).
  - `@angular/material` - read the **major** version: `<= 14` ≈ M2 theming API, `>= 15` ≈ M3 / MDC-backed components, `>= 17` ≈ M3 tokens default. Pair with `@angular/cdk` major as a cross-check.
- **Signal strength**: treat as a migration candidate when (a) at least one package above is present **and** (b) the manifest shows Material token usage intent - e.g. a `@material/theme` / `@material/tokens` dep, a `"material"` config block, or MDC/M3 packages pinned to a pre-target major. Manifest-only detection - defer actual token-occurrence scanning to the planner's codemod-gen pass.

## Migration rules

| Rule ID | Kind | From → To | Note |
|---------|------|-----------|------|
| MD-01 | token-rename | `--mdc-theme-primary` → `--md-sys-color-primary` | Core M2→M3 theme→system color reshape; root of most edits. |
| MD-02 | token-rename | `--mdc-theme-on-primary` → `--md-sys-color-on-primary` | "on-" foreground roles move under `md.sys.color`. |
| MD-03 | token-rename | `--mdc-theme-secondary` / `--mdc-theme-on-secondary` → `--md-sys-color-secondary` / `--md-sys-color-on-secondary` | Secondary role pair preserved across majors. |
| MD-04 | token-rename | `--mdc-theme-surface` → `--md-sys-color-surface` | Surface base role; precondition for the surface-container set (MD-05). |
| MD-05 | new-default | *(no M2 equivalent)* → `--md-sys-color-surface-container` / `-surface-container-high` / `-surface-container-highest` / `-surface-container-low` / `-surface-container-lowest` | M3 tonal surface-container roles; replace ad-hoc elevation overlays. High visual delta. |
| MD-06 | token-rename | `--mdc-theme-outline` (or hand-rolled border token) → `--md-sys-color-outline` | Outline promoted to a first-class system color role. |
| MD-07 | new-default | *(no M2 equivalent)* → `--md-sys-color-outline-variant` | Low-emphasis dividers/borders; previously a faded outline or custom value. |
| MD-08 | token-rename | `md.ref.palette.primary40` (reference tokens) → `md.sys.color.primary` (system tokens) | Enforce ref→sys indirection: components consume `md.sys.*`, never `md.ref.palette.*` directly. |
| MD-09 | token-rename | `--mdc-typography-headline6-*` → `--md-sys-typescale-title-large-*` | Typescale rename + remap (M2 named sizes → M3 role-based scale). Verify per-role size/weight mapping. |
| MD-10 | token-rename | `--mdc-typography-body1-*` / `body2-*` → `--md-sys-typescale-body-large-*` / `body-medium-*` | Body typescale remap; line-height and tracking values also shift. |
| MD-11 | token-rename | `--mdc-elevation-*` / elevation z-values → `--md-sys-elevation-level0..level5` | Numeric dp elevations become a 6-step token scale; pair with surface-container roles. |
| MD-12 | token-rename | `--mdc-shape-medium` / corner radii → `--md-sys-shape-corner-medium` (`-small` / `-large` / `-extra-large` / `-full`) | Shape scale renamed and bucketed into corner roles. |
| MD-13 | new-default | *(opt-in)* → dynamic color enabled (`md.sys.color.*` derived from a seed/source color) | M3 default theming model; replaces a static brand palette. Highest visual delta. |
| MD-14 | remove-component | `mwc-button` → `md-filled-button` (and `md-outlined-button` / `md-text-button` / `md-tonal-button`) | `@material/web` element rename; one MWC element fans out to explicit M3 variants - no clean 1:1 transform, pick a variant by hand (manual TODO). |
| MD-15 | remove-component | `mwc-textfield` → `md-filled-text-field` / `md-outlined-text-field` | `mwc-*` → `md-*` rename; one element fans out to 2 variants - appearance now encoded in the element name, choose by hand (manual TODO). |
| MD-16 | rename-prop | `?outlined` / `?raised` boolean attrs → variant element (per MD-14/MD-15) | Style-toggle props removed; pick the right `md-*` element instead of toggling a flag. |
| MD-17 | remove-component | `mwc-icon-button-toggle` → *(removed)* - compose `md-icon-button` + `toggle` selected state | Dedicated toggle element dropped; rebuild with base icon-button + selected state. |
| MD-18 | rename-class | `.mdc-button` / `.mdc-card` (BEM CSS classes) → web-component element + part styling | M3 Web moves from BEM-class theming to custom-element `::part()` / token styling. |

## Impact notes

**High visual delta - design + QA review required, do not ship blind:**
- **Dynamic color (MD-13)**: switching from a fixed brand palette to seed-derived `md.sys.color.*` changes nearly every on-screen color. Confirm seed source, contrast pairs (`on-*` roles), and light/dark tonal output before adopting.
- **Surface-container roles (MD-05, MD-07)**: replacing elevation-overlay surfaces with tonal containers visibly alters card/sheet/menu backgrounds and divider weight. Audit layering after migration.
- **Typescale (MD-09, MD-10)**: M2 named styles do not map 1:1 to M3 role sizes - size, weight, line-height, and tracking all move. Expect reflow; review dense text and truncation.

**Mechanical - codemod-templatable, low judgment per occurrence:**
- Pure custom-property renames (MD-01–MD-04, MD-06, MD-08, MD-11, MD-12) are string-substitution-shaped. `codemod-gen.cjs` can template these as find/replace with a token map; still diff-review for false positives in comments, strings, and unrelated `--mdc-*` namespaces.

**Manual-review items - never auto-apply:**
- **Component renames + fan-out (MD-14, MD-15)**: one source element maps to several target variants; the correct target depends on the original prop set - a human (or planner) must choose. Generated templates should emit a *candidate* mapping plus a TODO, not a committed rename.
- **Removed components (MD-17)** and **prop→variant collapse (MD-16)**: require reconstructing behavior (selected/toggle state, layout) - flag for hand-editing.
- **Class→element migration (MD-18)**: BEM-class theming → custom-element `::part()` is a structural rewrite, not a rename; scope as its own task.
- **Angular major bumps**: when detection keys off `@angular/material`, the framework upgrade (DI, theming mixins, component API) dwarfs the token rename - sequence the framework migration first, tokens second.
