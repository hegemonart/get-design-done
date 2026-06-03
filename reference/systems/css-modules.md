---
name: css-modules
kind: system
composes_into: [token-mapper, component-taxonomy-mapper]
phase: 54
---
<!-- Vendor docs: https://github.com/css-modules/css-modules. -->

# CSS Modules

## Conventions

- `*.module.css` files scope class names locally (hashed) and import as a JS object (`styles.button`).
- No JS theme: tokens are CSS custom properties on `:root` in a shared global stylesheet, or `@value` build-time constants.
- `composes: base from './x.module.css'` merges classes (the composition signal). `.button--primary` is a variant; `&:hover` and `.button:disabled` are states.

## File patterns

- `Component.module.css` next to `Component.tsx`.
- `tokens.css` or `theme.css` with `:root`; `composes:` and `@value` declarations.
- Identify via: a `*.module.css` import plus a `:root` token sheet.

## Gotchas

- The `:root` custom properties ARE the tokens; infer subtype from the name and value.
- `composes:` is a cross-file edge; model it as extends or composes.
- Read the source `.module.css`, not the hashed output; `@value` constants are tokens too.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "tok.color.primary", "type": "token", "subtype": "color", "name": "--color-primary", "summary": "Primary brand color custom property on :root.", "complexity": "simple", "tags": ["color", "brand", "theme"] },
    { "id": "cmp.button-base", "type": "component", "name": "button base", "summary": "Base button class others compose from.", "complexity": "simple", "tags": ["primitive", "interactive"] },
    { "id": "var.button-primary", "type": "variant", "name": "button--primary", "summary": "Primary variant composing the base class.", "complexity": "simple", "tags": ["brand", "state"] }
  ],
  "edges": [
    { "source": "var.button-primary", "target": "cmp.button-base", "type": "composes", "direction": "forward", "weight": 0.8 },
    { "source": "var.button-primary", "target": "tok.color.primary", "type": "uses-token", "direction": "forward", "weight": 0.9 }
  ]
}
```
