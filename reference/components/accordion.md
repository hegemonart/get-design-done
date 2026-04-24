# Accordion — Benchmark Spec

**Harvested from**: WAI-ARIA APG, Radix UI, Carbon, Chakra UI, Material 3, Mantine, shadcn/ui, Atlassian
**Wave**: 2 · **Category**: Containers

---

## Purpose

An accordion is a vertically stacked set of headers that each reveal or conceal an associated section of content when activated. It reduces visual clutter by hiding content that is not immediately relevant. The header MUST be a button (or have `role="button"`) — users must be able to activate sections by keyboard. *(WAI-ARIA APG, Radix, Carbon all agree)*

---

## Anatomy

```
┌──────────────────────────────┬──┐
│ Section 1 header (button)    │ ▾│  ← aria-expanded="true"
└──────────────────────────────┴──┘
  ┌────────────────────────────┐
  │ Section 1 content          │  ← aria-hidden="false"
  └────────────────────────────┘
┌──────────────────────────────┬──┐
│ Section 2 header (button)    │ ▾│  ← aria-expanded="false"
└──────────────────────────────┴──┘
  (Section 2 content hidden)
```

| Part | Required | Notes |
|------|----------|-------|
| Header (h2–h6) | Yes | Wraps the trigger button; maintains document outline |
| Trigger button | Yes | `<button>` with `aria-expanded` + `aria-controls` |
| Panel | Yes | `id` referenced by `aria-controls`; `role="region"` + `aria-labelledby` |
| Chevron / icon | No | Rotates 180° on open; `aria-hidden="true"` |
| Divider | No | Border between items |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Single-open | Only one panel open at a time | Material 3, Mantine (default) |
| Multi-open | Multiple panels can be open simultaneously | Radix (default), Carbon, shadcn |
| Bordered | Each item has a border/card appearance | All |
| Flush / ghost | No border; full-width dividers only | shadcn, Material 3 |
| With icon | Leading icon per header | Carbon, Atlassian |

**Norm** (≥5/18): chevron icon rotates on open (180°); panel animates height.
**Diverge**: single-open vs. multi-open — Radix defaults to multi-open (more flexible); Material 3 defaults to single-open (simpler UX). Multi-open is safer for long FAQ pages where users may want to compare sections.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| collapsed | default | Panel hidden | `aria-expanded="false"` on button |
| expanded | button activated | Panel visible | `aria-expanded="true"` on button |
| hover | pointer over header | Header background tint | — |
| focus | keyboard | 2px focus ring on button | — |
| disabled | programmatic | 38% opacity; non-interactive | `aria-disabled="true"` on button |

---

## Sizing & Spacing

| Property | Value | Notes |
|----------|-------|-------|
| Header height | 48px (md default) | Touch-friendly |
| Padding H (header) | 16px | |
| Padding (panel) | 16px | |
| Icon size | 16–20px | Chevron; gap from label: 8px |
| Item border | 1px `border-bottom` | Flush style |

---

## Typography

- Header: 14–16px/500 — slightly heavier than panel body
- Panel body: 14px/400
- Disabled header: same size, 38% opacity

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `button` on header trigger (implicit if `<button>`); `region` on panel
> **Header trigger attributes**: `aria-expanded`, `aria-controls` (panel id)
> **Panel attributes**: `id`, `role="region"`, `aria-labelledby` (header button id)

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/accordion/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Enter / Space | When focus is on the accordion header, toggles the associated panel |
| Tab | Moves focus to the next focusable element |
| Shift+Tab | Moves focus to the previous focusable element |
| Arrow Down | (Optional) Moves focus to the next accordion header |
| Arrow Up | (Optional) Moves focus to the previous accordion header |
| Home | (Optional) Moves focus to the first accordion header |
| End | (Optional) Moves focus to the last accordion header |

Arrow/Home/End navigation is optional; Tab navigation between headers is always required.

### Accessibility Rules

- Header MUST be wrapped in an `<h2>`–`<h6>` tag to maintain document outline — the heading level should match the surrounding page hierarchy
- The trigger MUST be a `<button>` (or `role="button"`) — `<div>` headers are inaccessible by keyboard
- `aria-expanded` MUST be on the trigger button, not the panel
- Panel SHOULD have `role="region"` + `aria-labelledby` referencing the trigger button id — this creates a named region for landmark navigation
- `role="region"` should be omitted if there are more than 6 accordions (too many regions = noisy landmark nav)
- Avoid `display:none` for the panel in open state — use `hidden` or height animation

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Panel expand | 200ms | ease-out | Height 0→auto via `grid-template-rows` trick |
| Panel collapse | 150ms | ease-in | |
| Chevron rotate | 200ms | ease | 0→180deg |

**Height animation trick** (CSS-only, no JS measurement):
```css
.panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 200ms ease; }
.panel.open { grid-template-rows: 1fr; }
.panel > div { overflow: hidden; }
```

Cross-link: `reference/motion.md` — `prefers-reduced-motion`: skip height animation, instant toggle

---

## Do / Don't

### Do
- Wrap header triggers in proper heading tags (`<h2>`–`<h6>`) *(WAI-ARIA APG, Carbon)*
- Use `aria-expanded` on the trigger button, not on the panel *(WAI-ARIA APG)*
- Animate height with `grid-template-rows` trick — no JS height measurement needed *(CSS-only pattern)*
- Support Tab navigation between accordion headers at minimum *(WAI-ARIA APG)*

### Don't
- Don't use `<div>` as the accordion header without `role="button"` *(WAI-ARIA APG)*
- Don't use `display:none` to hide the panel in collapsed state if you want animation — use CSS grid trick *(CSS pattern)*
- Don't use `role="region"` for more than 6 accordions — excessive landmarks harm screen reader navigation *(WAI-ARIA APG note)*
- Don't auto-close other panels in a "single-open" accordion without announcing the change *(Atlassian)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| div header without role="button" | `reference/anti-patterns.md` |
| aria-expanded on panel instead of button | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Header in h2–h6 required | WAI-ARIA APG, Carbon |
| aria-expanded on trigger (not panel) | WAI-ARIA APG §3.1 |
| role="region" + aria-labelledby on panel | WAI-ARIA APG |
| Enter/Space to toggle | WAI-ARIA APG §3.1 |
| grid-template-rows for height animation | CSS-only pattern (no system-specific) |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Accordion header not a button
grep -rn 'accordion\|Accordion' src/ | grep 'header\|trigger' | grep -v '<button\|role="button"'

# aria-expanded on wrong element (panel instead of trigger)
grep -rn 'aria-expanded' src/ | grep 'panel\|content\|body'

# display:none used on accordion panel (breaks animation)
grep -rn 'accordion.*panel\|panel.*accordion' src/ | grep 'display.*none'
```

---

## Failing Example

```html
<!-- BAD: div header — no keyboard access, no aria-expanded -->
<div class="accordion-header" onclick="toggle(1)">
  What is the return policy?
</div>
<div id="panel-1" class="accordion-panel" style="display:none">
  Our return policy is 30 days…
</div>
```

**Why it fails**: `<div>` is not keyboard-operable (no Tab stop). No `aria-expanded`. Screen reader cannot determine expanded state. `display:none` prevents CSS animation.
**Grep detection**: `grep -rn 'class.*accordion.*header\|accordion-header' src/ | grep -v '<button\|role="button"'`
**Fix**:
```html
<h3>
  <button aria-expanded="false" aria-controls="panel-1" id="header-1">
    What is the return policy?
    <svg aria-hidden="true"><!-- chevron --></svg>
  </button>
</h3>
<div id="panel-1" role="region" aria-labelledby="header-1" class="panel">
  <div>Our return policy is 30 days…</div>
</div>
```
