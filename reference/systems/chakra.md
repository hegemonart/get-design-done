---
name: chakra
kind: system
composes_into: [token-mapper, component-taxonomy-mapper]
phase: 54
---
<!-- Vendor docs: https://chakra-ui.com/docs/theming/customization/colors. -->

# Chakra UI

## Conventions

- v3 builds a system via `createSystem(defineConfig({ theme: { tokens, semanticTokens, recipes, slotRecipes } }))` (Panda-inspired).
- Two tiers: raw `tokens` are `{value}`-wrapped (for example `colors.brand.500.value`); `semanticTokens` are condition-aware via `_light` and `_dark` and form the real consistency layer.
- Style props (bg, px, color, rounded) bind to tokens. v2 uses extendTheme plus useColorModeValue(light, dark).

## File patterns

- `theme.ts` or `system.ts` with createSystem.
- `<ChakraProvider value={system}>` at the root.
- Identify via: @chakra-ui/react in deps plus createSystem.

## Gotchas

- v3 tokens are `{value}`-wrapped; the leaf is `.value`.
- Prefer semanticTokens as the token nodes (they encode light and dark) and treat raw tokens as the backing palette.
- recipes and slotRecipes are variants; style props are usage, not token nodes.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "tok.color.bg", "type": "token", "subtype": "color", "name": "semanticTokens.colors.bg", "summary": "Condition-aware surface color across light and dark.", "complexity": "simple", "tags": ["color", "surface", "dark-mode", "light-mode"] },
    { "id": "tok.color.brand-500", "type": "token", "subtype": "color", "name": "colors.brand.500", "summary": "Raw brand palette step backing the semantic tokens.", "complexity": "simple", "tags": ["color", "brand", "palette"] },
    { "id": "cmp.button", "type": "component", "name": "Button", "summary": "Button recipe bound to semantic surface tokens.", "complexity": "moderate", "tags": ["interactive", "atom"] }
  ],
  "edges": [
    { "source": "tok.color.bg", "target": "tok.color.brand-500", "type": "uses-token", "direction": "forward", "weight": 0.6 },
    { "source": "cmp.button", "target": "tok.color.bg", "type": "uses-token", "direction": "forward", "weight": 0.8 }
  ]
}
```
