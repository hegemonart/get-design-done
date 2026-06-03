---
name: styled-components
kind: system
composes_into: [token-mapper, component-taxonomy-mapper]
phase: 54
---
<!-- Vendor docs: https://styled-components.com/docs/advanced#theming. -->

# styled-components

## Conventions

- Runtime CSS-in-JS via tagged templates: ``styled.div`...` `` and ``styled(Base)`...` ``.
- Tokens live in a plain JS theme passed through `<ThemeProvider theme={}>` and read by interpolation: `${p => p.theme.colors.primary}`.
- Variants are prop-conditional interpolation (`${p => p.$variant === 'primary' && css`...`}`); ``css`...` `` composes reusable blocks; transient `$`-props drive styles but are not forwarded to the DOM.

## File patterns

- `theme.ts` with the theme object; ThemeProvider at the root.
- `*.styles.ts` co-located; ``styled.X`...` ``, ``css`...` ``, ``createGlobalStyle`...` ``.
- Identify via: styled-components in deps plus ThemeProvider.

## Gotchas

- There is no token file format: infer subtype from the key path (`theme.colors.*` to color, `theme.space.*` to spacing).
- Variants are prop-conditional CSS; derive variant and state from the prop union plus `&:hover` and `&:disabled`.
- v6 adds createGlobalStyle and RSC createTheme emitting CSS vars; transient `$`-props never reach the DOM.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "tok.color.primary", "type": "token", "subtype": "color", "name": "theme.colors.primary", "summary": "Primary brand color read via theme interpolation.", "complexity": "simple", "tags": ["color", "brand", "theme"] },
    { "id": "cmp.button", "type": "component", "name": "Button", "summary": "Styled button reading theme.colors.", "complexity": "moderate", "tags": ["interactive", "atom"] },
    { "id": "st.button.hover", "type": "state", "name": "hover", "summary": "Hover state via the &:hover selector.", "complexity": "simple", "tags": ["hover", "state"] }
  ],
  "edges": [
    { "source": "cmp.button", "target": "tok.color.primary", "type": "uses-token", "direction": "forward", "weight": 0.9 },
    { "source": "cmp.button", "target": "st.button.hover", "type": "transitions-to", "direction": "forward", "weight": 0.5 }
  ]
}
```
