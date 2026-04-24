# Sidebar (Collapsible Side Navigation Panel) — Benchmark Spec

**Harvested from**: Material 3, Carbon, Polaris, Atlassian, UUPM (app-interface, MIT)
**Wave**: 4 · **Category**: Navigation

---

## Purpose

A sidebar provides persistent or collapsible secondary navigation along the vertical axis of an application. In expanded state it shows icon + label; in collapsed state it shows icon only (with a tooltip). It is distinct from a Drawer (which is a modal overlay — see `drawer.md`) and from a Navbar (primary horizontal navigation). Use a sidebar for application-level section switching and hierarchical settings navigation. *(Material 3 Navigation Drawer, Carbon UI Shell Left Nav, Atlassian SideNavigation, Polaris Navigation agree)*

---

## Anatomy

```
┌─────────────────┐         ┌────┐
│ [≡] App Name    │  ◄──►   │[≡] │  collapsed (icon-only)
│─────────────────│         │────│
│ 🏠 Dashboard    │         │[🏠]│  tooltip: "Dashboard"
│ 📊 Analytics    │         │[📊]│
│ ▾ Settings      │         │[⚙] │
│   Account       │         └────┘
│   Privacy       │
│   Security      │
└─────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| `<nav>` wrapper | Yes | `role="navigation"` + `aria-label="Secondary"` |
| Toggle button | Yes | `aria-expanded` + `aria-controls` pointing to nav |
| Nav item | Yes | `<a>` for routing; `<button>` for non-routing actions |
| Sub-section toggle | No | `<button>` with `aria-expanded`; chevron icon rotates |
| Sub-section items | No | Indented child items; hidden when parent collapsed |
| Tooltip | Conditional | On icon-only items in collapsed state; `role="tooltip"` |
| Active indicator | Yes | `aria-current="page"` on active item |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Expanded | Icon + label visible; full width (240–280px) | All systems |
| Collapsed / mini | Icon only; 48–64px wide; tooltips on hover/focus | Material 3, Carbon, Atlassian |
| Floating / overlay | Overlay on top of content (mobile drawer pattern) | Material 3, Polaris |
| Settings nav | Category tree: Settings › Account › Privacy › Security | UUPM app-interface (MIT) |
| Dashboard nav | Section switcher: Dashboard / Analytics / Users / Settings | UUPM app-interface (MIT) |

**Norm** (≥4 systems agree): expanded width 240–280px; collapsed width 48–64px; toggle button at top or bottom.
**Diverge**: Carbon collapses to a rail (16px) with hover-expand; Material 3 differentiates between NavigationDrawer (permanent) and ModalNavigationDrawer (mobile).

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| expanded | default or toggle | Full width, labels visible | `aria-expanded="true"` on toggle |
| collapsed | toggle click | Icon-only, labels hidden | `aria-expanded="false"` on toggle |
| item-default | — | Resting fill | — |
| item-hover | pointer over | 8% overlay | — |
| item-focus | keyboard focus | 2px focus-visible ring | — |
| item-active | current route | Filled pill or left indicator bar | `aria-current="page"` |
| subsection-open | button click | Children visible; chevron rotated 180° | `aria-expanded="true"` on section button |
| subsection-closed | button click | Children hidden | `aria-expanded="false"` on section button |

---

## Sizing & Spacing

| State | Width | Item height | Item padding H |
|-------|-------|-------------|----------------|
| Expanded | 240–280px | 40px | 16px |
| Collapsed | 48–64px | 40px | 12px (centered icon) |
| Sub-item indent | — | 36px | 32px (16px base + 16px indent) |

**Norm**: 240px expanded width (Carbon, Atlassian, Polaris). 40px item height matches button defaults.

---

## Typography

- Nav item label: body-sm (13–14px), weight 400; active item weight 500 or 600
- Sub-section heading (if present): label-xs (11–12px), uppercase, weight 600, `color: --text-subtle`
- Tooltip: body-xs (11–12px) — concise, matches item label exactly in collapsed state
- Never truncate nav item labels — resize the sidebar or abbreviate the label intentionally

Cross-link: `reference/typography.md` — label scale, body-sm

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `navigation` (wrapper)
> **Required attributes**: `aria-label="Secondary"` on `<nav>`; `aria-expanded` on toggle button and collapsible section buttons; `aria-current="page"` on active item

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab / Shift+Tab | Moves focus through focusable items in DOM order |
| Enter / Space | Activates focused link (navigates) or button (toggles section/sidebar) |
| ArrowDown | Moves focus to next visible nav item (optional enhancement) |
| ArrowUp | Moves focus to previous visible nav item (optional enhancement) |
| Escape | Closes mobile overlay sidebar; returns focus to toggle |

### Accessibility Rules

- `<nav>` MUST have `aria-label="Secondary"` to distinguish from the primary navbar landmark
- Every collapsible sub-section MUST have `aria-expanded` on its toggle button
- Items that navigate (routing) MUST be `<a href>` links; items that only toggle state MUST be `<button>` (not `<a href="#">`)
- In collapsed state, each icon-only item MUST have a tooltip AND `aria-label` (tooltip is not a substitute for accessible name)
- `aria-current="page"` MUST be present on the currently active item

Cross-link: `reference/accessibility.md` — landmark labelling, disclosure pattern

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Expand / collapse sidebar | 200ms | ease-in-out | Width transition; respect `prefers-reduced-motion` |
| Sub-section open | 150ms | ease-out | Height expand; `overflow: hidden` clip |
| Sub-section close | 120ms | ease-in | Height collapse |
| Chevron rotate | 150ms | ease-in-out | 0° → 180° on open |
| Label fade in | 100ms | ease-out | Delay until width ≥ 140px to prevent overlap |

**BAN**: Animating sidebar width using `transition: all` — catches unrelated property changes and causes jank.

Cross-link: `reference/motion.md` — layout transitions, BAN-04

---

## Do / Don't

### Do
- Use `<a href>` for routing nav items and `<button>` for non-routing actions *(Carbon, WAI-ARIA APG)*
- Label the `<nav>` with `aria-label="Secondary"` *(WAI-ARIA APG landmark regions)*
- Show tooltips on icon-only items in collapsed state *(Material 3, Carbon, Atlassian)*
- Use `aria-expanded` on sub-section toggles *(WAI-ARIA APG disclosure pattern)*

### Don't
- Don't use `<a href="#">` for items that don't navigate — breaks bookmark/open-in-new-tab expectations *(Carbon, WAI-ARIA)*
- Don't hide sub-items with `display: none` without also removing them from tab order *(WCAG 2.1.1)*
- Don't use the same `aria-label` on both sidebar nav and top navbar *(WAI-ARIA landmark uniqueness)*
- Don't collapse the sidebar below 44px touch target width on mobile *(WCAG 2.5.5)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-04 | `transition: all` on interactive elements — `reference/anti-patterns.md#ban-04` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| aria-label="Secondary" distinct from Primary | WAI-ARIA APG landmark regions, WCAG 4.1.2 |
| `<button>` for non-routing, `<a>` for routing | Carbon, WAI-ARIA APG, Primer |
| aria-expanded on collapsible sections | WAI-ARIA APG disclosure pattern |
| 240px expanded / 48–64px collapsed widths | Carbon, Atlassian, Polaris |
| Tooltip on icon-only collapsed items | Material 3, Carbon, Atlassian |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# nav element missing aria-label
grep -rn '<nav' src/ | grep -v 'aria-label\|aria-labelledby'

# Collapsible section missing aria-expanded
grep -rn 'sidebar\|sidenav\|side-nav' src/ | grep 'collapsible\|expandable\|toggle' | grep -v 'aria-expanded'

# href="#" on nav items (non-routing anchor misuse)
grep -rn 'href="#"' src/ | grep -i 'nav\|sidebar\|menu'

# Active item missing aria-current
grep -rn 'class.*active\|isActive\|is-active' src/ | grep -i 'nav.*item\|sidebar.*item' | grep -v 'aria-current'
```

---

## Failing Example

```html
<!-- BAD: sidebar items using <a href="#"> for non-routing actions -->
<nav>  <!-- missing aria-label -->
  <a href="#">Dashboard</a>
  <a href="#">Analytics</a>
  <a href="#" class="active">Settings</a>  <!-- no aria-current -->
  <a href="#">
    Account  <!-- subsection, but no aria-expanded -->
  </a>
</nav>
```

**Why it fails**: `<nav>` has no label (ambiguous landmark); `<a href="#">` creates false navigation expectations and adds to browser history; active state uses CSS class only; no `aria-current="page"`; no `aria-expanded` for the sub-section.
**Grep detection**: `grep -rn 'href="#"' src/ | grep -i 'nav\|sidebar'`
**Fix**: Replace `<a href="#">` with `<button>` for non-routing items; add `aria-label="Secondary"` to `<nav>`; add `aria-current="page"` to active item; add `aria-expanded` to sub-section toggles.
