# List (Interactive & Display) — Benchmark Spec

**Harvested from**: Carbon, Polaris, Material 3, Mantine, WAI-ARIA APG, UUPM (app-interface, MIT)
**Wave**: 4 · **Category**: Navigation & Data

---

## Purpose

A list component handles two distinct patterns: (1) a display list renders a series of items using semantic `<ul>/<ol>/<li>` HTML — no ARIA needed; (2) an interactive list (listbox) presents selectable options with keyboard navigation and selection state. Use a display list for content; use an interactive listbox when users choose one or more items from a set. *(Carbon, Polaris, Material 3 all define separate display and interactive list patterns)*

---

## Anatomy

```
Display list:              Interactive listbox:
<ul>                       <div role="listbox"
  <li>Item one</li>              aria-multiselectable="false"
  <li>Item two</li>              aria-label="Assignees">
  <li>Item three</li>       <div role="option"
</ul>                              aria-selected="true">Alice</div>
                             <div role="option"
                                   aria-selected="false">Bob</div>
                           </div>
```

| Part | Required | Notes |
|------|----------|-------|
| List container | Yes | `<ul>` / `<ol>` (display) or `role="listbox"` (interactive) |
| List item | Yes | `<li>` (display) or `role="option"` (interactive) |
| `aria-selected` | Interactive only | `true`/`false` on each `role="option"` |
| `aria-multiselectable` | Interactive only | `true` if multi-select; default `false` |
| `aria-label` / `aria-labelledby` | Interactive only | Describes the listbox purpose |
| Empty state | No | Min 200px height; illustration + message + optional CTA |
| Virtual scroll | Conditional | At > 100 items; TanStack Virtual or react-virtual |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Unordered display | `<ul>` bullet list; purely semantic | All systems |
| Ordered display | `<ol>` numbered list; sequential content | All systems |
| Single-select listbox | One item selectable at a time | Carbon, Polaris, Material 3 |
| Multi-select listbox | Multiple items selectable (Shift+Click, Ctrl+Click) | Carbon, Material 3, Mantine |
| List / detail panel | Left-panel list + right detail pane | UUPM app-interface (MIT) |
| Recent-items list | Time-ordered recent items with timestamps | UUPM app-interface (MIT) |
| Virtualized | Windowed rendering for large datasets (> 100 items) | Carbon, Mantine |

**Norm** (≥4 systems agree): `role="listbox"` + `role="option"` for interactive; native `<ul>/<li>` for display.
**Diverge**: Material 3 calls the interactive variant "ListItem with selectable state"; Carbon uses "ContentSwitcher" for small sets and "MultiSelect" for large. Pattern semantics are identical.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Items visible; none selected | `aria-selected="false"` on all options |
| option-hover | pointer over | 8% overlay | — |
| option-focus | keyboard focus | 2px focus-visible ring | managed via `tabindex` |
| option-selected | click or Enter/Space | Filled highlight; checkmark for multi-select | `aria-selected="true"` |
| option-disabled | disabled prop | 38% opacity; cursor: default | `aria-disabled="true"` |
| empty | no items | Empty state (illustration + text + CTA) | `aria-label` on empty container |
| loading | data fetch | Skeleton items | `aria-busy="true"` on listbox container |

---

## Sizing & Spacing

| Element | Value | Notes |
|---------|-------|-------|
| Item height | 40px (default) | 32px compact; 48px comfortable |
| Item padding H | 12–16px | Icon + 8px gap if icon present |
| Empty state min-height | 200px | Prevents visually collapsed empty container |
| Virtual viewport | ~400–600px | Clip height for virtualised scroll |
| List max-height | 400px default | Scroll within list container |

**Norm**: 40px item height (Carbon, Polaris, Mantine). Max-height + internal scroll for contained lists.

---

## Typography

- Display list: inherits parent body text; `<li>` marker via `list-style-type`
- Interactive option label: body-sm (13–14px), weight 400; selected weight 500
- Secondary text / metadata: label-xs (11–12px), `color: --text-subtle`
- Empty state heading: heading-sm, center-aligned
- Empty state body: body-sm, `color: --text-subtle`

Cross-link: `reference/typography.md` — body-sm, heading scale

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `listbox` (interactive container), `option` (each item)
> **Required attributes**: `aria-selected` on each `role="option"`; `aria-label` or `aria-labelledby` on `role="listbox"`; `aria-multiselectable="true"` for multi-select

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/listbox/ — W3C — 2024*

| Key | Action |
|-----|--------|
| ArrowDown | Moves focus to next option (wraps to first) |
| ArrowUp | Moves focus to previous option (wraps to last) |
| Home | Moves focus to first option |
| End | Moves focus to last option |
| Enter / Space | Selects the focused option (single-select) |
| Shift+ArrowDown | Extends selection downward (multi-select) |
| Shift+ArrowUp | Extends selection upward (multi-select) |
| Ctrl+A | Selects all options (multi-select) |
| A–Z | Moves focus to next option starting with typed character |

### Accessibility Rules

- Display lists use native `<ul>/<li>` — no ARIA roles needed; they are already accessible
- Interactive lists MUST use `role="listbox"` + `role="option"` — not `<ul>/<li>` with click handlers
- `aria-selected` MUST be present on every `role="option"` (either `true` or `false`)
- Multi-select listbox MUST declare `aria-multiselectable="true"` on the container
- Virtual scroll: all options in the virtualised window must have correct `aria-posinset` and `aria-setsize` attributes
- Empty state container MUST have `aria-label` or `aria-live` so AT announces the empty state

Cross-link: `reference/accessibility.md` — listbox pattern, virtual list accessibility

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Option selection highlight | 100ms | ease-out | Background color only |
| Skeleton item shimmer | 1500ms | linear loop | Loading placeholder |
| Empty state entry | 150ms | ease-out | Fade in |

**BAN**: Do not animate item reordering unless using a deliberate drag-and-drop library — unsolicited reordering causes disorientation.

Cross-link: `reference/motion.md` — skeleton shimmer, list animations

---

## Do / Don't

### Do
- Use native `<ul>/<ol>/<li>` for display-only lists — no ARIA needed *(WAI-ARIA APG)*
- Use `role="listbox"` + `role="option"` for selectable lists *(WAI-ARIA APG, Carbon, Polaris)*
- Virtualise at > 100 items to prevent DOM bloat *(Carbon, Mantine)*
- Provide a meaningful empty state with a CTA when the list can be populated *(Polaris, Material 3)*

### Don't
- Don't use `<div onClick>` list items without `role="option"` — keyboard-inaccessible *(WCAG 2.1.1)*
- Don't omit `aria-selected` on options — AT cannot determine what is selected *(WAI-ARIA APG)*
- Don't use `<ul>/<li>` with `role="option"` — mixing native list semantics and listbox ARIA creates conflicts *(WAI-ARIA)*
- Don't load all items at once when count > 100 — renders slowly and wastes memory *(Carbon, Mantine)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-04 | `transition: all` on interactive elements — `reference/anti-patterns.md#ban-04` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| role="listbox" + role="option" for interactive lists | WAI-ARIA APG listbox pattern |
| aria-selected required on every option | WAI-ARIA APG, Carbon, Polaris |
| aria-multiselectable="true" for multi-select | WAI-ARIA APG |
| Virtualise at > 100 items | Carbon, Mantine (TanStack Virtual) |
| 200px min empty state height | Carbon, Polaris HIG |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Interactive list items using <div> without role="option"
grep -rn '<div' src/ | grep -i 'list.*item\|list-item\|listitem' | grep 'onClick\|on:click' | grep -v 'role='

# Missing aria-selected on option elements
grep -rn 'role="option"' src/ | grep -v 'aria-selected'

# Listbox missing aria-label
grep -rn 'role="listbox"' src/ | grep -v 'aria-label\|aria-labelledby'

# <ul>/<li> used with role="option" (semantics conflict)
grep -rn 'role="option"' src/ | grep '<li'
```

---

## Failing Example

```html
<!-- BAD: interactive list items using <div onClick> with no keyboard support -->
<div class="user-list">  <!-- no role="listbox" -->
  <div class="list-item selected" onclick="selectUser('alice')">
    Alice Chen
  </div>
  <div class="list-item" onclick="selectUser('bob')">
    Bob Tanaka
  </div>
</div>
```

**Why it fails**: No `role="listbox"` on container; no `role="option"` on items; no `aria-selected`; items not keyboard-focusable (no `tabindex`); arrow-key navigation does nothing; screen readers see two unlabelled `<div>` elements.
**Grep detection**: `grep -rn '<div.*onClick\|<div.*on:click' src/ | grep -i 'list.*item\|listitem'`
**Fix**: Use `<div role="listbox" aria-label="Users">` with `<div role="option" tabindex="-1" aria-selected="false">` items; implement roving `tabindex` and arrow-key handlers.
