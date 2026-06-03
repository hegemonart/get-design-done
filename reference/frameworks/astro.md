---
name: astro
kind: framework
composes_into: [component-taxonomy-mapper, visual-hierarchy-mapper]
phase: 54
---
<!-- Vendor docs: https://docs.astro.build. -->

# Astro

## Conventions

- An `.astro` file is a script fence (the `---` code fence runs at build or on the server) plus an HTML template; props arrive via `Astro.props`.
- File routing lives in `src/pages/` (`.astro` and `.md`). Framework components are static by default; `client:load`, `client:idle`, `client:visible`, and `client:only` directives mark hydration, which is the interactivity signal.
- `<style>` is scoped by default; `is:global` or `:global()` escapes the scope. Content collections are typed Markdown or MDX in `src/content/`, configured by `content.config.ts` with Zod.

## File patterns

- `src/pages/**/*.astro`, `src/layouts/*.astro`, `src/components/*.astro`, `content.config.ts`, `astro.config.mjs`.
- Identify via: astro in deps plus a `src/pages/` directory.

## Gotchas

- Most `.astro` files ship zero js; only `client:*`-directed islands are interactive, so motion attaches only to hydrated islands.
- Scoped `<style>` rewrites class names locally; treat those names as component-local, not global tokens.
- `src/pages/*.astro` files are screens; layouts wrap them via a `<slot/>` (emit a composes edge).
- Global tokens enter via an `is:global` block or a stylesheet imported in a layout.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "scr.index", "type": "screen", "name": "/", "summary": "Home page from src/pages/index.astro.", "complexity": "simple", "tags": ["navigation"] },
    { "id": "lay.base", "type": "layer", "subtype": "Template", "name": "BaseLayout", "summary": "Layout wrapping pages via slot, holds global styles.", "complexity": "moderate", "tags": ["template", "layout"] },
    { "id": "cmp.counter", "type": "component", "name": "Counter", "summary": "Hydrated island marked client:visible, interactive.", "complexity": "moderate", "tags": ["interactive"] }
  ],
  "edges": [
    { "source": "lay.base", "target": "scr.index", "type": "composes", "direction": "forward", "weight": 0.9 }
  ]
}
```
