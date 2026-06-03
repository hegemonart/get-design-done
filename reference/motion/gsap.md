---
name: gsap
kind: motion
composes_into: [motion-mapper]
phase: 54
---
<!-- Vendor docs: https://gsap.com/docs/v3/GSAP/Tween. -->

# GSAP

## Conventions

- Imperative, no component model: `gsap.to(target, { duration, ease, ... })` plus `.from` / `.fromTo` / `.set`.
- `gsap.timeline({ defaults })` sequences tweens; children inherit the timeline defaults.
- Eases are strings `"<name>.<inOut>"`: power0 through power4, none (linear), sine / expo / circ / back / elastic / bounce / steps(); default is `power1.out`.
- `ScrollTrigger` (registered via `gsap.registerPlugin`) binds a tween to scroll. The core has no spring.

## File patterns

- `import gsap from "gsap"`; `import { ScrollTrigger } from "gsap/ScrollTrigger"`.
- Markers: `gsap.to(`, `gsap.timeline(`, `registerPlugin`, often inside `useGSAP` or `useEffect`.
- Identify via: the `gsap` import plus a `gsap.to` / `gsap.timeline` call.

## Gotchas

- Unit trap: `duration` is SECONDS, so multiply by 1000 BEFORE bucketing.
- Extract a duration bucket via the taxonomy: instant <100ms, quick 100-200, standard 200-300, slow 300-500, narrative 500+.
- Easing class: every ease string is a tween (named or eased); GSAP core has no native spring.
- Gesture vs tween: a `ScrollTrigger`-bound tween is a scroll-linked fragment; a bare `timeline` is an orchestrated transition.
- Targets are selectors or refs, so link each fragment to the component that owns the ref.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "mf.hero.reveal", "type": "motion-fragment", "name": "Hero scroll reveal", "summary": "Slow eased tween bound to ScrollTrigger.", "complexity": "moderate", "tags": ["motion", "transition", "duration", "easing"] },
    { "id": "mf.list.stagger", "type": "motion-fragment", "name": "List stagger", "summary": "Timeline staggering item entrances.", "complexity": "moderate", "tags": ["motion", "transition", "enter"] }
  ],
  "edges": [
    { "source": "mf.list.stagger", "target": "mf.hero.reveal", "type": "transitions-to", "direction": "forward", "weight": 0.4 }
  ]
}
```
