---
name: shadcn
kind: system
composes_into: [token-mapper, component-taxonomy-mapper]
phase: 54
---
<!-- Vendor docs: https://ui.shadcn.com/docs/theming. -->

# shadcn/ui

## Conventions

- Not an npm dependency: components are copied INTO the repo (you own the source), built on Radix primitives plus Tailwind.
- Color tokens are CSS vars in `globals.css`, semantic and paired: `--background`/`--foreground`, `--primary`, `--muted`, `--border`, `--ring` with `-foreground` partners. Values are HSL channel triplets (newer installs use OKLCH).
- Variants come from cva with variant and size axes.

## File patterns

- `components.json` (style, tailwind.baseColor, cssVariables, aliases).
- `lib/utils.ts` exporting the cn() helper (clsx plus tailwind-merge).
- `components/ui/` source files; `app/globals.css` with `:root` and `.dark`.
- Identify via: components.json plus lib/utils.ts cn().

## Gotchas

- Components are first-party source: model relationships to Radix as composes or extends, NOT an external depends-on.
- Bare channel triplets like `240 10% 4%` are token values; capture them as tokens.
- cn() is plumbing, not a component node.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "tok.color.primary", "type": "token", "subtype": "color", "name": "--primary", "summary": "Semantic primary color, HSL channel triplet.", "complexity": "simple", "tags": ["color", "brand", "theme"] },
    { "id": "cmp.button", "type": "component", "name": "Button", "summary": "Owned button source wrapping Radix Slot.", "complexity": "moderate", "tags": ["interactive", "atom"] },
    { "id": "var.button.destructive", "type": "variant", "name": "destructive", "summary": "cva destructive variant of Button.", "complexity": "simple", "tags": ["destructive", "state"] }
  ],
  "edges": [
    { "source": "cmp.button", "target": "tok.color.primary", "type": "uses-token", "direction": "forward", "weight": 0.8 },
    { "source": "var.button.destructive", "target": "cmp.button", "type": "extends", "direction": "forward", "weight": 0.7 }
  ]
}
```
