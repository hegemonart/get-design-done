---
name: mui
kind: system
composes_into: [token-mapper, component-taxonomy-mapper]
phase: 54
---
<!-- Vendor docs: https://mui.com/material-ui/customization/theming/. -->

# MUI (Material UI)

## Conventions

- Tokens live in a JS theme via `createTheme({ palette, typography, spacing, breakpoints, shape, shadows, components })` applied through `<ThemeProvider>`.
- palette.primary holds main, light, dark, contrastText. spacing is a multiplier function: `theme.spacing(2)` returns 16px. shadows is a 25-entry elevation array. typography variants run h1 through caption.
- Styling uses sx (one-off), styled() (reusable), and theme.components (per-component variants).

## File patterns

- `theme.ts` with createTheme and ThemeProvider.
- sx props inline; styled() factories co-located with components.
- CssVarsProvider or extendTheme emit `--mui-*` vars.
- Identify via: @mui/material in deps plus createTheme.

## Gotchas

- spacing is a multiplier, not a px value; resolve before recording a spacing token.
- Customization splits across sx, styled(), and theme.components; gather all three.
- A shadow is an array index, and `@mui/joy` is not `@mui/material`.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "tok.color.primary-main", "type": "token", "subtype": "color", "name": "palette.primary.main", "summary": "Primary brand color from the MUI palette.", "complexity": "simple", "tags": ["color", "brand", "theme"] },
    { "id": "tok.shadow.elev-4", "type": "token", "subtype": "shadow", "name": "shadows[4]", "summary": "Elevation level 4 box-shadow.", "complexity": "simple", "tags": ["shadow", "elevation", "depth"] },
    { "id": "cmp.button", "type": "component", "name": "Button", "summary": "Contained button bound to primary palette.", "complexity": "moderate", "tags": ["interactive", "atom"] }
  ],
  "edges": [
    { "source": "cmp.button", "target": "tok.color.primary-main", "type": "uses-token", "direction": "forward", "weight": 0.9 }
  ]
}
```
