---
name: vanilla-extract
kind: system
composes_into: [token-mapper, component-taxonomy-mapper]
phase: 54
---
<!-- Vendor docs: https://vanilla-extract.style/documentation/theming/. -->

# vanilla-extract

## Conventions

- Zero-runtime CSS-in-TS: `*.css.ts` files are extracted to static CSS at build time.
- `createTheme(tokens)` returns `[themeClass, vars]`. `createThemeContract(shape)` declares a typed token CONTRACT (null leaves) that several `createTheme(contract, values)` implement, the canonical light and dark multi-theme pattern.
- `style({})` defines a class; `styleVariants({})` and `recipe()` produce variant APIs; sprinkles add atomic utilities.

## File patterns

- `*.css.ts` such as `theme.css.ts`, `contract.css.ts`, `sprinkles.css.ts`.
- `@vanilla-extract/vite-plugin` (or webpack) in config.
- Identify via: @vanilla-extract/css in deps plus a `*.css.ts` file.

## Gotchas

- Tokens are the vars from createTheme or contract keys, NOT the literal values in the generated CSS.
- The contract is the source of truth; each theme mirrors or extends it (model with mirrors or extends edges).
- styleVariants and recipe are variants. Read the `.css.ts` source, not the generated `.css`.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "tok.color.brand", "type": "token", "subtype": "color", "name": "vars.color.brand", "summary": "Brand color slot declared in the theme contract.", "complexity": "simple", "tags": ["color", "brand", "theme"] },
    { "id": "tok.space.md", "type": "token", "subtype": "spacing", "name": "vars.space.md", "summary": "Medium spacing scale step.", "complexity": "simple", "tags": ["spacing", "gap"] },
    { "id": "cmp.button", "type": "component", "name": "Button", "summary": "Recipe-driven button consuming contract vars.", "complexity": "moderate", "tags": ["interactive", "atom"] }
  ],
  "edges": [
    { "source": "cmp.button", "target": "tok.color.brand", "type": "uses-token", "direction": "forward", "weight": 0.9 },
    { "source": "cmp.button", "target": "tok.space.md", "type": "uses-token", "direction": "forward", "weight": 0.5 }
  ]
}
```
