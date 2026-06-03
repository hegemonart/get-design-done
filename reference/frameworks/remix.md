---
name: remix
kind: framework
composes_into: [component-taxonomy-mapper, visual-hierarchy-mapper]
phase: 54
---
<!-- Vendor docs: https://remix.run/docs/en/main/file-conventions/routes (Remix v2 / React Router v7 framework mode). -->

# Remix

## Conventions

- `app/routes/` uses file conventions; `app/root.tsx` is the root layout and renders an `Outlet`.
- Flat-routes v2: dot-delimited filenames nest, so `concerts.$city.tsx` is a child of `concerts.tsx` and renders inside its `Outlet`. A trailing `_` opts a segment out of layout nesting; a leading `_` marks a pathless layout.
- Each route module co-locates a `loader` (server read), an `action` (server mutation), and a default-export component (the screen).
- Global styles ship via an exported `links` array or a CSS import in `root.tsx`.

## File patterns

- `app/root.tsx`, `app/routes/*.tsx` (dot-segment names).
- Identify via: @remix-run/* or react-router in deps plus an `app/routes/` directory.

## Gotchas

- A route file is a screen; parse the dot-naming to recover the layout tree and emit composes edges parent to child.
- `loader` and `action` are server data functions, not components; do not map them as nodes.
- A trailing `_` breaks visual nesting even when the dot path looks nested; respect it when building edges.
- Tokens enter via the `root.tsx` global stylesheet.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "lay.root", "type": "layer", "subtype": "Template", "name": "Root", "summary": "Root layout with Outlet and global links.", "complexity": "moderate", "tags": ["template", "layout"] },
    { "id": "scr.concerts", "type": "screen", "name": "concerts", "summary": "Parent route screen rendering nested city Outlet.", "complexity": "moderate", "tags": ["navigation"] },
    { "id": "scr.concerts.city", "type": "screen", "name": "concerts.$city", "summary": "Child route screen nested in concerts via dot naming.", "complexity": "simple", "tags": ["navigation"] }
  ],
  "edges": [
    { "source": "scr.concerts", "target": "scr.concerts.city", "type": "composes", "direction": "forward", "weight": 0.8 }
  ]
}
```
