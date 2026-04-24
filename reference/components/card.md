# Card — Benchmark Spec

**Harvested from**: Material 3, Polaris, Carbon, Atlassian, Mantine, shadcn/ui, Ant Design, Fluent 2
**Wave**: 2 · **Category**: Containers

---

## Purpose

A card is a contained surface that groups related information and actions. It is a visual container, not a navigation element by default — only make the entire card clickable when the primary action is navigation and there is a single dominant action. Mixed-content cards with multiple actions should not be entirely clickable. *(Material 3, Polaris, Carbon all agree on this boundary)*

---

## Anatomy

```
┌────────────────────────────┐  ← card surface (border/shadow/background)
│ [Media / Image]            │  ← optional, always with alt text
│────────────────────────────│
│ Eyebrow / Category         │  ← optional; 12px/600 uppercase
│ Title                      │  ← primary label; ≥16px
│ Description                │  ← supporting text; 14px/400
│────────────────────────────│
│ [Action 1] [Action 2]      │  ← optional action area
└────────────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| Container | Yes | `<article>` for standalone content; `<div>` for layout |
| Title | Yes | Descriptive; h2/h3 depending on hierarchy |
| Content | Yes | Body text, metadata, or media |
| Media / image | No | Always provide `alt`; decorative images use `alt=""` |
| Actions | No | Keep ≤2 primary actions per card |
| Footer / metadata | No | 12px/400; secondary information |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Elevated | Drop shadow; floats above surface | Material 3, shadcn |
| Outlined | Border, no shadow | Material 3, Carbon, Polaris |
| Filled | Filled background, no shadow or border | Material 3, Mantine |
| Clickable / Interactive | Entire card is a link or button | Material 3, Polaris, Carbon |
| Horizontal | Media left, content right | Carbon, Polaris, Atlassian |
| Compact | Dense layout; no media | Carbon, Fluent |

**Norm** (≥5/18): outlined or elevated; ≤2 actions per card.
**Diverge**: elevation vs. outline — both are valid; use elevated for content that needs to float (dashboards), outlined for dense lists (tables of cards).

---

## States

| State | Trigger | Visual | ARIA/HTML |
|-------|---------|--------|-----------|
| default | — | Resting surface | — |
| hover (clickable) | pointer | Shadow deepens or border darkens | — |
| focus (clickable) | keyboard | 2px focus ring on outer card | — |
| active (clickable) | mousedown | Scale 0.99 | — |
| selected | programmatic | Border + background tint | `aria-selected="true"` |
| loading | async content | Skeleton placeholder | `aria-busy="true"` |
| disabled | programmatic | 38% opacity | `aria-disabled="true"` |

---

## Sizing & Spacing

| Property | Value | Notes |
|----------|-------|-------|
| Padding | 16px (sm), 20px (md), 24px (lg) | *(Carbon: 16px default, Material 3: 16px)* |
| Border radius | Use token; match `reference/surfaces.md` concentric rule | |
| Media aspect ratio | 16:9 (landscape), 1:1 (square) | `object-fit: cover` |
| Min width | 240px | Prevents content collapse |
| Max width | 480px (typical) | Grid controls actual width; max-width is a guideline |
| Gap between cards | 16px (sm grid), 24px (md grid) | |

Cross-link: `reference/surfaces.md` — concentric radius, 3-layer shadow formula, elevation tokens

---

## Typography

- Title: 16–20px/600 depending on card prominence (h2/h3 in DOM hierarchy)
- Eyebrow: 11px/600 uppercase, muted colour
- Body: 14px/400
- Metadata: 12px/400 muted

---

## Keyboard & Accessibility

> **WAI-ARIA role**: No specific card role. Use `<article>` for independent pieces of content; `<li>` in a list of cards; `<div>` for layout grouping.

### Clickable Card Rules

*Per WAI-ARIA APG link + button patterns — W3C — 2024*

| Invocation | Element | Key |
|------------|---------|-----|
| Navigate to new page | `<a href>` wrapping or inside card | Enter |
| Trigger action in context | `<button>` wrapping or inside card | Enter, Space |

- **Do not wrap an entire card in `<a>` if it contains other interactive elements** (links, buttons inside) — nested interactive elements are inaccessible by keyboard
- Use the "card with primary action + secondary actions" pattern: one `<a>` stretched via `::after` pseudo-element to fill the card; secondary action buttons sit above in stacking context

### Accessibility Rules

- Card with image: always provide `alt`; use `alt=""` for decorative images
- Clickable card: heading inside card should be the accessible name (via `aria-labelledby` or the stretched-link pattern)
- Card grid: use `role="list"` on the grid container and `role="listitem"` on each card, or a semantic `<ul>/<li>` structure, so screen readers announce item count
- Loading skeleton: add `aria-busy="true"` on the card container; remove when content loads

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| hover shadow | 150ms | ease-out | Elevation increase |
| press scale | 80ms | ease | 1→0.99 (subtle; card is large) |
| skeleton shimmer | 1.5s | linear loop | Respect `prefers-reduced-motion` |

Cross-link: `reference/motion.md` — Skeleton shimmer pattern, `prefers-reduced-motion`

---

## Do / Don't

### Do
- Use `<article>` when the card is an independent, self-contained piece of content *(Carbon, Polaris)*
- Keep clickable cards to a single primary action; surface secondary actions as explicit buttons *(Material 3, Polaris)*
- Use the stretched-link (`::after`) pattern for clickable cards with nested links/buttons *(Carbon, Bootstrap pattern)*
- Provide `alt` text for all card images, or `alt=""` for decorative images *(WCAG 1.1.1)*

### Don't
- Don't wrap the entire card in `<a>` if it contains other interactive elements *(WAI-ARIA APG)*
- Don't use `<div>` as a clickable card without `role="button"` or `role="link"` + keyboard handler *(WAI-ARIA APG)*
- Don't place the entire card title in a plain `<span>` when it could be `<h2>/<h3>` *(Atlassian, Carbon)*
- Don't use more than 2 primary actions per card — extract to a detail view *(Material 3, Polaris)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Nested interactive elements in clickable container | `reference/anti-patterns.md` |
| Missing alt on card media | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| ≤2 actions per card | Material 3, Polaris, Carbon |
| Stretched-link pattern for nested interactivity | Carbon, Bootstrap |
| article element for standalone card content | Carbon, Polaris |
| 16px default padding | Carbon, Material 3 |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Entire card wrapped in <a> with nested buttons/links
grep -rn '<a ' src/ | grep -i 'card' | xargs grep -l 'button\|<a ' 2>/dev/null

# Clickable div without role
grep -rn 'class.*card\|data-testid.*card' src/ | grep 'onClick\|on:click' | grep -v 'role='

# Card image without alt
grep -rn '<img' src/ | grep -i 'card' | grep -v 'alt='

# Missing heading hierarchy in card
grep -rn 'class.*card' src/ | xargs grep -L 'h[1-6]\|aria-label' 2>/dev/null
```

---

## Failing Example

```html
<!-- BAD: entire card is <a> but contains a button — button is inaccessible by keyboard in most AT -->
<a href="/product/42" class="card">
  <img src="product.jpg" />
  <h3>Product Name</h3>
  <p>Description…</p>
  <button onclick="addToCart(42)">Add to cart</button>
</a>
```

**Why it fails**: Nested `<button>` inside `<a>` is invalid HTML. Keyboard users pressing Tab inside the link may reach the button, but Enter on the button may also trigger the link. Screen reader behavior is unpredictable.
**Grep detection**: `grep -rn '<a.*href' src/ | xargs grep -l '<button' 2>/dev/null`
**Fix**: Use the stretched-link pattern — `<h3><a href="/product/42">Product Name</a></h3>` with `::after { position: absolute; inset: 0; }` on the `<a>`, and position the "Add to cart" button above via `position: relative; z-index: 1`.
