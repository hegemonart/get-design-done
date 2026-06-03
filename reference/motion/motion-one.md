---
name: motion-one
kind: motion
composes_into: [motion-mapper]
phase: 54
---
<!-- Vendor docs: https://motion.dev/docs/animate. -->

# Motion One

## Conventions

- Tiny WAAPI core: `animate(element, keyframes, options)` where options carry `duration`, `ease` (named, cubic-bezier, or fn) OR `type: "spring"`.
- A spring is compiled to a `linear()` easing from stiffness/damping/mass/bounce; `spring()` and `glide()` generators exist (glide carries velocity).
- `inView()` runs on viewport entry, `scroll()` is scroll-linked, `stagger()` sequences a set.
- Imperative with no JSX; the React wrapper IS Framer Motion, so JSX absence is the tell.

## File patterns

- `import { animate, inView, scroll, stagger, spring } from "motion"` (or `"motion/mini"`).
- Markers: `animate(`, `inView(`, `scroll(`, plus a small-footprint import list.
- Identify via: those imports with NO `motion.*` JSX (which would mean Framer Motion).

## Gotchas

- Unit trap: `duration` is SECONDS, so multiply by 1000 BEFORE bucketing.
- Extract a duration bucket via the taxonomy: instant <100ms, quick 100-200, standard 200-300, slow 300-500, narrative 500+.
- Easing class: `type: "spring"` or a `spring()` / `glide()` generator is physics; a named or cubic-bezier `ease` is a tween.
- Gesture vs tween: `inView()` is an entrance, `scroll()` is scroll-linked, a direct `animate` from an event handler is a gesture fragment.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "mf.section.inview", "type": "motion-fragment", "name": "Section inView", "summary": "Standard tween fade on viewport entry.", "complexity": "simple", "tags": ["motion", "transition", "enter", "duration"] },
    { "id": "mf.banner.scroll", "type": "motion-fragment", "name": "Banner scroll-link", "summary": "Scroll-linked parallax via scroll().", "complexity": "moderate", "tags": ["motion", "animation", "gesture"] }
  ],
  "edges": [
    { "source": "mf.section.inview", "target": "mf.banner.scroll", "type": "composes", "direction": "forward", "weight": 0.4 }
  ]
}
```
