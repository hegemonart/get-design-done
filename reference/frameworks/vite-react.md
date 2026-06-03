---
name: vite-react
kind: framework
composes_into: [component-taxonomy-mapper, visual-hierarchy-mapper]
phase: 54
---
<!-- Vendor docs: https://vite.dev/guide and https://reactrouter.com. -->

# Vite + React

## Conventions

- No built-in routing. `index.html` is the entry and loads `src/main.tsx`, which mounts `<App/>` into the `#root` element.
- Routing is opt-in via react-router-dom: either `createBrowserRouter([{ path, element }])` with `<RouterProvider>`, or JSX `<Routes>`/`<Route>`. Screens are config objects, not files.
- Layout is convention only (`src/components`, `src/pages`). Global CSS imports live in `main.tsx` or `App.tsx`. Path aliases come from `vite.config` `resolve.alias` (such as `@/`).

## File patterns

- `index.html`, `src/main.tsx` (`createRoot().render`), `vite.config.ts`.
- Identify via: vite plus react in deps and a `src/main.tsx` entry.

## Gotchas

- Screens come from the router config, not the filesystem; parse `createBrowserRouter` or `<Route path>` to recover them.
- `src/pages/*` is a convention, not a route source; do not infer screens from that folder alone.
- The entry is `main.tsx`; treat its mounted `<App/>` as the tree root.
- There is no server or client split; everything is client, so any component can be a motion or hover candidate.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "scr.home", "type": "screen", "name": "/", "summary": "Home screen from a createBrowserRouter route element.", "complexity": "simple", "tags": ["navigation"] },
    { "id": "lay.app", "type": "layer", "subtype": "Template", "name": "App", "summary": "Root App mounted into #root by main.tsx.", "complexity": "moderate", "tags": ["template", "layout"] },
    { "id": "scr.settings", "type": "screen", "name": "/settings", "summary": "Settings screen declared in the router config.", "complexity": "moderate", "tags": ["navigation", "form"] }
  ],
  "edges": [
    { "source": "lay.app", "target": "scr.home", "type": "composes", "direction": "forward", "weight": 0.8 }
  ]
}
```
