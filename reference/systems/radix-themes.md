---
name: radix-themes
kind: system
composes_into: [token-mapper, component-taxonomy-mapper]
phase: 54
---
<!-- Vendor docs: https://www.radix-ui.com/themes/docs/theme/color. -->

# Radix Themes

## Conventions

- `@radix-ui/themes` is the styled layer, distinct from the headless `@radix-ui/react-*` primitives.
- Each hue exposes a 12-step color scale per step role: steps 1 to 2 are backgrounds, 3 to 5 component backgrounds, 6 to 8 borders, 9 is solid, 11 is low-contrast text, 12 is high-contrast text.
- Global config lives on `<Theme>` props: accentColor, grayColor, radius, scaling, appearance.

## File patterns

- `import "@radix-ui/themes/styles.css"` plus a `<Theme>` at the app root.
- Per-step vars `--<accent>-1` through `--<accent>-12`.
- Identify via: @radix-ui/themes in deps plus styles.css import.

## Gotchas

- Map the 12 steps as one scale with step roles; the step number encodes intent, so tag accordingly.
- Do not confuse `@radix-ui/themes` (themed) with `@radix-ui/react-*` (headless, the shadcn substrate).
- radius and accentColor are theme-level config, not per-component tokens.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "tok.color.accent-9", "type": "token", "subtype": "color", "name": "--accent-9", "summary": "Solid accent step 9 used for filled actions.", "complexity": "simple", "tags": ["color", "brand", "theme"] },
    { "id": "tok.color.accent-11", "type": "token", "subtype": "color", "name": "--accent-11", "summary": "Low-contrast accent text, step 11.", "complexity": "simple", "tags": ["color", "contrast", "body-text"] },
    { "id": "cmp.button", "type": "component", "name": "Button", "summary": "Themed solid button using accent step 9.", "complexity": "moderate", "tags": ["interactive", "atom"] }
  ],
  "edges": [
    { "source": "cmp.button", "target": "tok.color.accent-9", "type": "uses-token", "direction": "forward", "weight": 0.9 }
  ]
}
```
