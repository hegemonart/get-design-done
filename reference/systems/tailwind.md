---
name: tailwind
kind: system
composes_into: [token-mapper, component-taxonomy-mapper]
phase: 54
---
<!-- Vendor docs: https://tailwindcss.com/docs/theme. -->

# Tailwind

## Conventions

- v4 inverts the model: tokens are namespaced CSS custom properties in an `@theme {}` block in the CSS entry. Tailwind generates utilities from token names.
- Namespaces map to subtypes: `--color-*` to color (drives bg/text/border), `--spacing-*` to spacing, `--font-*` to typography, `--radius-*` to radius.
- v3 defines tokens in `tailwind.config.{js,ts}` under `theme` or `theme.extend`.
- Utility-class clusters on one element are that component's variants.

## File patterns

- v4: `app.css` or `globals.css` with `@import "tailwindcss"` plus an `@theme` block. May ship NO js config.
- v3: `tailwind.config.{js,ts,cjs,mjs}`.
- Identify via: tailwindcss in deps plus either config file or `@theme`.

## Gotchas

- The resolved `--color-*` and `--spacing-*` values are the tokens; utility classes are usage, not token nodes.
- Arbitrary values `bg-[#1da1f2]` and `p-[3px]` bypass tokens. Flag them as an anti-pattern node, not a token.
- `@apply` inlines utilities; it is not a token definition.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "tok.color.primary", "type": "token", "subtype": "color", "name": "--color-primary", "summary": "Brand primary color token from @theme.", "complexity": "simple", "tags": ["color", "brand", "theme"] },
    { "id": "cmp.button", "type": "component", "name": "Button", "summary": "Primary action button styled with utility clusters.", "complexity": "moderate", "tags": ["interactive", "atom"] },
    { "id": "ap.arbitrary-bg", "type": "anti-pattern", "name": "Arbitrary bg-[#1da1f2]", "summary": "Hardcoded color bypasses the token system.", "complexity": "simple", "tags": ["anti-pattern", "color"] }
  ],
  "edges": [
    { "source": "cmp.button", "target": "tok.color.primary", "type": "uses-token", "direction": "forward", "weight": 0.9 }
  ]
}
```
