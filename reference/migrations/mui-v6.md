# MUI (Material UI) v5 → v6 - Migration Rule Library

A proposal-only rule library that `agents/ds-migration-planner.md` reads to draft a v5→v6 migration plan, and that the pure `scripts/lib/migration/codemod-gen.cjs` uses to template codemods the USER reviews and runs. GDD never auto-applies any rule here - every entry is a *proposal* with a human in the loop. v6 is mostly mechanical (import + prefix renames) with two high-visual-delta areas: the `Grid` overhaul and the CSS-theme-variables adoption.

## Detection

Detect MUI and the v5→v6 boundary from `package.json` only - no lockfile read, no source scan. The planner classifies the project from the dependency graph alone:

- **Is MUI?** `dependencies` / `devDependencies` contains `@mui/material`. Treat the presence of any of these companion packages as corroborating evidence: `@mui/system`, `@mui/icons-material`, `@mui/lab`, `@mui/styled-engine` (or the styled-components variant `@mui/styled-engine-sc`), `@mui/base`.
- **On v5 (migration applies)?** The `@mui/material` semver range resolves to a `^5` / `5.x` major. Treat `~5`, `>=5 <6`, and a pinned `5.x.y` the same way. A `^6` / `6.x` range means the project is already on v6 - emit no rules. A `^7` range means it has moved past the scope of this library (defer to a v6→v7 library).
- **Companion-major skew (flag, do not migrate):** if `@mui/material` is `^5` but `@mui/system` or `@mui/styled-engine` resolves to `^6` (or vice-versa), the install is half-upgraded. Surface this as a blocker for the planner - every rule below assumes a coherent v5 baseline, and a mixed graph produces unreliable codemod output.
- **Peer majors to record** (planner notes, not rules in this library): `@mui/x-data-grid`, `@mui/x-date-pickers`, `@mui/x-charts`, `@mui/x-tree-view`. MUI X tracks its own v5→v6/v7 line on a separate cadence, but a Core v6 bump usually forces an X major bump too. Flag the Core/X pair so the planner sequences both migrations together rather than leaving the graph inconsistent.
- **Styled engine:** record whether `@mui/styled-engine-sc` (styled-components) is present - it changes how MUI6-19 (`styled`/`deepmerge`) is reviewed versus the default Emotion engine.
- **Runtime gates:** read `engines.node` and the `typescript` devDependency. v6 requires Node 14+ and TypeScript 4.7+ and drops IE 11 (see MUI6-17); a lower floor in `package.json` is itself a migration task.

## Migration rules

Kinds are constrained to: `rename-class`, `rename-prop`, `remove-component`, `token-rename`, `new-default`.

| Rule ID | Kind | From → To | Note |
|---|---|---|---|
| MUI6-01 | rename-class | `import { Unstable_Grid2 as Grid2 } from '@mui/material'` → `import { Grid2 } from '@mui/material'` | The `Unstable_` prefix is dropped; `Grid2` is now stable and is slated to become the default `Grid` in the next major. |
| MUI6-02 | rename-prop | `<Grid item xs={12} sm={6}>` → `<Grid size={{ xs: 12, sm: 6 }}>` | Grid2's per-breakpoint props collapse into one object `size` prop; the standalone `item` prop is gone (every non-container is implicitly an item). |
| MUI6-03 | rename-prop | `<Grid xs={6}>` → `<Grid size={6}>` | When the value is identical across breakpoints, `size` takes a single number instead of an object - shorthand for the MUI6-02 object form. |
| MUI6-04 | rename-prop | `xsOffset={2} smOffset={3}` → `offset={{ xs: 2, sm: 3 }}` | Per-breakpoint `*Offset` props collapse into one object `offset` prop (single-value form `offset={2}` also allowed). |
| MUI6-05 | new-default | `<Grid xs>` (boolean auto-grow) → `<Grid size="grow">` | The boolean `true` size value is renamed to the string `"grow"`; a bare boolean breakpoint prop no longer compiles. |
| MUI6-06 | new-default | `<Grid2 disableEqualOverflow>` → (prop removed) | `disableEqualOverflow` is deleted; v6 Grid2 lays out spacing with CSS `gap`, so the old negative-margin overflow workaround is unnecessary. |
| MUI6-07 | rename-class | `experimental_extendTheme` → `extendTheme` (from `@mui/material/styles`) | The CSS-vars theme factory leaves experimental status; import the stable name. The `experimental_` alias is removed, not deprecated-with-shim. |
| MUI6-08 | rename-class | `Experimental_CssVarsProvider as CssVarsProvider` → `CssVarsProvider` | Drop the `Experimental_` prefix. Preferred end-state: v6 `ThemeProvider` now subsumes every CssVarsProvider feature, so consolidating onto a single `ThemeProvider` is the recommended target. |
| MUI6-09 | new-default | `createTheme({ ... })` → `createTheme({ cssVariables: true, ... })` | Opt-in flag that emits CSS custom properties for the theme; required to read `theme.vars.*` and to get SSR-safe, flash-free dark mode. Off by default - adding it is a proposal, never automatic. |
| MUI6-10 | token-rename | `theme.palette.primary.main` (in `styled`/`sx`) → `theme.vars.palette.primary.main` | Under `cssVariables: true`, read palette tokens through `theme.vars.*` (CSS-var references) so values resolve per color scheme at runtime instead of being baked in at build time. Plain `theme.palette.*` still returns a value but won't switch schemes via CSS. |
| MUI6-11 | token-rename | `theme.palette.mode === 'dark' ? a : b` → `theme.applyStyles('dark', { ... })` | Replace color-mode ternaries in `styled`/`sx` with `applyStyles`; ternaries break under CSS-vars dark mode because both schemes are emitted into one stylesheet and the JS branch resolves only once. |
| MUI6-12 | remove-component | `import { LoadingButton } from '@mui/lab'` → `import { Button } from '@mui/material'` + `loading` / `loadingPosition` props | `LoadingButton` is merged into the core `Button`; the `@mui/lab` export is deprecated. Move `loading`, `loadingPosition`, and `loadingIndicator` onto `Button`. |
| MUI6-13 | remove-component | `<ListItem button autoFocus disabled selected>` → `<ListItem disablePadding><ListItemButton autoFocus disabled selected>…</ListItemButton></ListItem>` | The interactive `button` behavior and its `autoFocus` / `disabled` / `selected` props are removed from `ListItem`; wrap the content in `ListItemButton`. |
| MUI6-14 | rename-class | `listItemClasses` (e.g. `.Mui-selected`, `.Mui-focusVisible` keys) → `listItemButtonClasses` | Companion to MUI6-13: the interactive state class keys move from the `ListItem` class object to `ListItemButton`, so any `styleOverrides` or CSS targeting those keys must be re-pointed. |
| MUI6-15 | new-default | `<Divider orientation="vertical" />` renders an `hr` element → renders a `div` | A vertical `Divider` now emits a `div` carrying a separator ARIA role (an `hr` cannot be vertical/inline). Update any CSS or test selector that assumed an `hr` element. |
| MUI6-16 | new-default | `AccordionSummary` content is bare → wrapped in an `h3` heading element | The summary is wrapped in a heading by default; override the level via `slotProps={{ heading: { component: 'h4' } }}`. Affects heading-order audits and heading-based selectors/queries. |
| MUI6-17 | new-default | Node 12 / TS 3.5 / IE 11 baseline → Node 14+, TS 4.7+, IE 11 dropped | Raise `engines.node`, bump the `typescript` devDependency, and remove IE-11 polyfills / transpile targets. Pure compatibility surface - no component code shape change. |
| MUI6-18 | remove-component | UMD bundle (`@mui/material/umd`, CDN `<script>` usage) → (removed) | The pre-bundled UMD build is dropped (~2.5 MB saved). Move CDN/`<script>` consumers to a bundler or native ESM; pure-ESM package `exports` are enforced, so deep internal `lib/` import paths also stop resolving. |
| MUI6-19 | token-rename | `import { deepmerge } from '@mui/utils'`; deep-spread of `theme.palette` in `styleOverrides` → re-verify against `@mui/utils` v6 | `styled` and `deepmerge` internals were reworked for the CSS-vars theme. Custom `styleOverrides` that mutated or deep-merged `theme.palette` should be re-tested (especially alongside MUI6-10). Flag for manual review; do not auto-rewrite - behavior, not just the import path, may differ. |
| MUI6-20 | rename-prop | `components={{ ... }}` / `componentsProps={{ ... }}` (on slotted components) → `slots={{ ... }}` / `slotProps={{ ... }}` | v6 finalizes the slot-API standardization: the legacy `components`/`componentsProps` pair is deprecated in favor of `slots`/`slotProps` across Modal, Popper, Autocomplete, Badge, Tooltip, and friends. Note that slot *names* are lowercased (e.g. `Backdrop` → `backdrop`). |
| MUI6-21 | remove-component | `import { Hidden } from '@mui/material'` → `sx` display utilities or `useMediaQuery` | The `Hidden` helper is removed; replace `<Hidden smDown>` with responsive `sx={{ display: { xs: 'none', sm: 'block' } }}` or a `useMediaQuery` guard. There is no drop-in component - this is a manual rewrite. |
| MUI6-22 | rename-class | `createMuiTheme` / `adaptV4Theme` (lingering v4 aliases) → `createTheme` | Any remaining v4-era `createMuiTheme` alias and the `adaptV4Theme` shim are removed in v6; collapse onto `createTheme`. Surfaces mainly in codebases that did a partial v4→v5 pass and left the aliases in place. |

## Impact notes

High visual delta - these require human review of the rendered result, not just a green diff:

- **Grid overhaul (MUI6-01…06):** moving off the `item xs={}` layout model to `size={{}}` *plus* the switch to CSS `gap` spacing can shift column widths, gutters, and wrap behavior. Generate the codemod proposal, then require a side-by-side visual diff before accepting. The official `v6.0.0/grid-v2-props` codemod covers the prop rename but not bespoke spacing/negative-margin math.
- **CSS theme variables (MUI6-09…11):** enabling `cssVariables: true` together with the `theme.vars.*` and `applyStyles` migration changes how *every* themed color resolves and how dark mode flips. This touches the whole surface at once - stage it behind a feature flag and review color and contrast holistically, not file-by-file.
- **Structural DOM rules (MUI6-13…16):** `ListItemButton` nesting, the vertical `Divider` → `div`, and the Accordion `h3` wrap all change the rendered DOM and heading order. Re-run accessibility and heading-order audits and fix brittle element/heading selectors in tests.

Mechanical - low risk, but still proposal-only (the USER reviews every generated patch):

- **Import / prefix / class renames** (MUI6-01, MUI6-07, MUI6-08, MUI6-12, MUI6-14) and the **engine bumps** (MUI6-17) are find-and-replace–class changes that `codemod-gen.cjs` can template safely. MUI6-18 is mechanical to detect but its *fix* (re-tooling a CDN consumer onto a bundler) is a build-system change, so route it to manual.
- **MUI6-19** looks mechanical (one import) but hides a behavior change - always tag it manual-review, never auto-apply.

Sequencing: do the prefix/import/class renames first (smallest blast radius), then the Grid pass, then the CSS-vars pass last (largest blast radius, and it interacts with MUI6-19). Resolve any companion-major skew and the peer MUI X majors surfaced in Detection *before* starting - a Core v6 bump typically drags an `@mui/x-*` major along with it.
