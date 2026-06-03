---
name: nextjs
kind: framework
composes_into: [component-taxonomy-mapper, visual-hierarchy-mapper]
phase: 54
---
<!-- Vendor docs: https://nextjs.org/docs/app. -->

# Next.js

## Conventions

- Two routers. App Router (`app/`): folder names are URL segments; `page.tsx` is the routable surface (a screen node). `layout.tsx` wraps and nests its segment; the root layout owns `<html>`/`<body>` and imports `globals.css`.
- Special files: `loading`, `error`, `template`, `route`. Server Components are the default; `'use client'` marks the client boundary, and only client components are interactive.
- Pages Router (legacy `pages/`): one file is one route; `_app`/`_document` are shells; data via `getServerSideProps`/`getStaticProps`.

## File patterns

- App Router: `app/**/page.tsx`, `app/**/layout.tsx`, `app/globals.css`.
- Pages Router: `pages/**`, `pages/_app.tsx`, `pages/_document.tsx`.
- Identify via: next in deps plus an `app/` or `pages/` directory.

## Gotchas

- Screen nodes are `page.tsx` files; set the node path to the route, not the file path.
- A `layout.tsx` plus `page.tsx` in one folder is one screen and its layout; emit a composes edge layout to page.
- Without `'use client'`, a component is not a motion or hover candidate; the boundary gates interactivity.
- Global tokens enter at the root-layout `globals.css`.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "scr.dashboard", "type": "screen", "name": "/dashboard", "summary": "Routable dashboard page from app/dashboard/page.tsx.", "complexity": "moderate", "tags": ["navigation", "layout"] },
    { "id": "lay.root", "type": "layer", "subtype": "Template", "name": "RootLayout", "summary": "Root layout owning html and body, imports global tokens.", "complexity": "moderate", "tags": ["template", "layout"] },
    { "id": "cmp.chart", "type": "component", "name": "Chart", "summary": "Client component marked use client, interactive.", "complexity": "complex", "tags": ["interactive", "data-display"] }
  ],
  "edges": [
    { "source": "lay.root", "target": "scr.dashboard", "type": "composes", "direction": "forward", "weight": 0.9 }
  ]
}
```
