---
name: storybook
kind: framework
composes_into: [component-taxonomy-mapper, visual-hierarchy-mapper]
phase: 54
---
<!-- Vendor docs: https://storybook.js.org/docs/writing-stories. -->

# Storybook

## Conventions

- The richest source of variant and state nodes. A `*.stories.tsx` file in CSF3 has a default export (the meta, typed `Meta<typeof X>`, with `component`, `title`, `args`, `argTypes`) and named exports (the stories, typed `StoryObj`, mostly `args`).
- Each named story is a concrete variant or state of one component (Primary, Disabled, Loading, Small).
- `argTypes` declares the controllable prop space; its enumerated `options` describe the full variant axis. `decorators` wrap a story; `play` scripts an interaction.

## File patterns

- `*.stories.@(tsx|jsx|ts|mdx)`, `.storybook/main.ts`, `.storybook/preview.ts` or `preview.tsx`.
- Identify via: @storybook/* in deps plus any `*.stories.*` file.

## Gotchas

- Map each named story to a variant node, or a state node when the name or args set hover, focus, disabled, active, or loading; link it back to `meta.component` via composes or extends.
- `argTypes.options` enumerates the full variant space and is richer than a source scan; prefer it.
- The meta default export is metadata, not a component; decorators are wrappers, not nodes.
- Handle CSF2 (a `template.bind({})` story) the same as CSF3.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "cmp.button", "type": "component", "name": "Button", "summary": "Component referenced by the stories meta.", "complexity": "moderate", "tags": ["interactive", "atom"] },
    { "id": "var.button.primary", "type": "variant", "name": "Primary", "summary": "Primary variant story of Button.", "complexity": "simple", "tags": ["interactive"] },
    { "id": "st.button.disabled", "type": "state", "name": "Disabled", "summary": "Disabled state story of Button.", "complexity": "simple", "tags": ["disabled", "state"] }
  ],
  "edges": [
    { "source": "var.button.primary", "target": "cmp.button", "type": "extends", "direction": "forward", "weight": 0.9 },
    { "source": "st.button.disabled", "target": "cmp.button", "type": "extends", "direction": "forward", "weight": 0.9 }
  ]
}
```
