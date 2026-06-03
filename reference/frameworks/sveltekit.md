---
name: sveltekit
kind: framework
composes_into: [component-taxonomy-mapper, visual-hierarchy-mapper]
phase: 54
---
<!-- Vendor docs: https://svelte.dev/docs/kit/routing. -->

# SvelteKit

## Conventions

- `src/routes/` uses file routing: `+page.svelte` is a screen, `+layout.svelte` is a wrapper (hierarchical, via `<slot/>` or `{@render children()}`), `+page.ts`/`+page.server.ts` hold `load`, and `+server.ts` is an endpoint.
- `<style>` in a `.svelte` file is auto-scoped; `:global()` escapes the scope.
- Shared code lives in `src/lib/` behind the `$lib` alias. Global CSS (`app.css`) is imported once in the root `+layout.svelte`. `src/app.html` is the document shell.

## File patterns

- `src/routes/**/+page.svelte`, `+layout.svelte`, `src/lib/`, `src/app.css`, `svelte.config.js`.
- Identify via: @sveltejs/kit in deps plus a `src/routes/` directory.

## Gotchas

- Only `+page`-prefixed and `+layout`-prefixed files are routes; a sibling `+page.server.ts` is data, not a screen.
- Layout nesting follows directory depth; emit one composes edge per level from layout to page.
- Scoped styles are component-local; do not promote those class names to global tokens.
- Tokens live in `app.css` under `:root` or a `$lib` theme module; a `$lib` import is a depends-on edge.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "scr.home", "type": "screen", "name": "/", "summary": "Home screen from src/routes/+page.svelte.", "complexity": "simple", "tags": ["navigation"] },
    { "id": "lay.root", "type": "layer", "subtype": "Template", "name": "RootLayout", "summary": "Root +layout.svelte wrapping pages, imports app.css.", "complexity": "moderate", "tags": ["template", "layout"] },
    { "id": "tok.color.bg", "type": "token", "subtype": "color", "name": "--bg", "summary": "Surface color token declared in app.css :root.", "complexity": "simple", "tags": ["color", "surface"] }
  ],
  "edges": [
    { "source": "lay.root", "target": "scr.home", "type": "composes", "direction": "forward", "weight": 0.9 }
  ]
}
```
