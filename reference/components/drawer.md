# Drawer / Sheet — Benchmark Spec

**Harvested from**: Material 3, Polaris (Sheet), Carbon, Atlassian, Mantine, shadcn/ui, Headless UI, Apple HIG
**Wave**: 2 · **Category**: Containers

---

## Purpose

A drawer (or sheet) is a panel that slides in from an edge of the viewport. It is less disruptive than a modal for workflows that benefit from co-existing with the background — detail panels, navigation menus, filter sidebars, multi-step flows. Like a modal, it traps focus and requires Escape to close. Unlike a modal, the backdrop is optional and can be semi-transparent. *(Material 3, Carbon, Polaris all position drawer as less disruptive than modal)*

---

## Anatomy

```
Side drawer (right):
┌────────────────┬──────────────┐
│                │ [✕] Title    │
│   Page         │──────────────│
│   content      │  Body        │
│   (inert)      │  content     │
│                │──────────────│
│                │  [Actions]   │
└────────────────┴──────────────┘

Bottom sheet (mobile):
┌──────────────────────────────┐
│   Page content               │
├──────────────────────────────┤  ← handle / drag indicator
│   Sheet content              │  ← slides up; partial height
└──────────────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| Panel container | Yes | `role="dialog"` + `aria-modal="true"` |
| Title | Yes | `id` → `aria-labelledby` on panel |
| Close button | Yes | Top-right; keyboard accessible |
| Backdrop | Conditional | Semi-transparent; may click-to-close (configurable) |
| Drag handle | No | Bottom sheet only; swipe gesture affordance |
| Scroll container | Conditional | Body scrollable when content exceeds height |

---

## Variants

| Variant | Direction | Use case | Systems |
|---------|-----------|----------|---------|
| Right side | Slides from right | Detail panels, settings | All |
| Left side | Slides from left | Navigation menus | Material 3, Carbon |
| Bottom sheet | Slides from bottom | Mobile actions, filters | Material 3, Apple HIG |
| Top | Slides from top | Notifications, alerts | Rare; avoid |
| Full-height | 100vh, pushes content | Persistent navigation | Material 3 |
| Partial height | 60–80vh, overlays | Mobile bottom sheet | Apple HIG, Material 3 |

**Norm** (≥5/18): right-side is default; bottom sheet for mobile.
**Diverge**: backdrop-click-to-close — same debate as modal; for navigation drawers, backdrop click should close; for form/detail drawers, configurable.

---

## States

Same as Modal/Dialog — see `modal-dialog.md`. Key differences:

| State | Drawer-specific |
|-------|-----------------|
| open | Slides in from edge; `aria-expanded="true"` on trigger (nav drawer) |
| closed | Slides out; `aria-expanded="false"` |
| partial (bottom sheet) | Dragged to partial height; swipe-up to expand |

---

## Sizing & Spacing

| Variant | Width / Height | Notes |
|---------|---------------|-------|
| Right side | 400–480px (desktop), 100% (mobile) | `min-width: 280px` |
| Left side (nav) | 240–320px | 256px is common (Carbon, Material 3) |
| Bottom sheet | 60–100vh | Drag handle at 12px × 36px |
| Padding | 20–24px | Match modal padding |

Cross-link: `reference/surfaces.md` — shadow on drawer edge (unilateral shadow)

---

## Typography

- Title: 16–18px/600
- Body: 14px/400
- Section headers within body: 12px/600 uppercase muted

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `dialog` (same as modal — drawer is a type of dialog)
> **Required attributes**: `aria-modal="true"`, `aria-labelledby` (title id)

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — W3C — 2024*

Same Tab/Shift+Tab/Escape contract as modal (see `modal-dialog.md`).

### Drawer-specific Accessibility Rules

- Focus trap: MUST trap focus inside the drawer while open — same as modal
- On open: focus moves to first focusable element (or close button if no primary action)
- On close: focus MUST return to the element that triggered the drawer open
- Navigation drawer (`role="navigation"`): if the drawer IS the main nav, use `role="navigation"` + `aria-label="Main"` instead of `role="dialog"`; different keyboard contract (no focus trap — it IS a landmark)
- Background `inert`: set `inert` attribute (or equivalent) on background content when drawer is open

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Slide in (right) | 250ms | ease-out (cubic-bezier 0.4,0,0.2,1) | |
| Slide out (right) | 200ms | ease-in | |
| Bottom sheet expand | 300ms | spring (bounce: 0) | |
| Backdrop fade | 200ms | ease | opacity 0→0.4 |

Swipe-to-close (bottom sheet): detect `pointerup` with velocity + displacement threshold.
Cross-link: `reference/motion.md` — spring bounce=0, `prefers-reduced-motion` (disable slide, instant toggle)

---

## Do / Don't

### Do
- Trap focus inside the drawer when open — same rule as modal *(WAI-ARIA APG)*
- Return focus to the trigger element on close *(WAI-ARIA APG, Radix, Mantine)*
- Use right-side drawer for content-detail panels; left-side for navigation *(Material 3, Carbon)*
- Support swipe-to-close on bottom sheets for mobile *(Apple HIG, Material 3)*

### Don't
- Don't use `role="navigation"` for content drawers — only for navigation-purpose drawers *(WAI-ARIA APG)*
- Don't let Tab escape the drawer while it's open *(WAI-ARIA APG)*
- Don't disable background scroll without setting `overflow:hidden` on body *(all systems)*
- Don't slide from top for content — top drawers conflict with browser UI and notifications *(Material 3)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Focus escaping drawer | `reference/anti-patterns.md` |
| No focus return on close | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| role="dialog" for content drawers | WAI-ARIA APG, Radix |
| Focus trap required | WAI-ARIA APG |
| Swipe-to-close on bottom sheet | Apple HIG, Material 3 |
| 256px left nav width | Carbon, Material 3 |
| ease-out 250ms slide-in | Material 3 motion spec |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Drawer without focus trap
grep -rn 'drawer\|sheet\|sidebar' src/ | grep -L 'FocusTrap\|focus-trap\|inert'

# Drawer missing aria-modal
grep -rn 'class.*drawer\|class.*sheet' src/ | grep 'role="dialog"' | grep -v 'aria-modal'

# Background scroll not prevented
grep -rn 'drawer.*open\|isOpen.*drawer' src/ | grep -v 'overflow\|body\.'
```

---

## Failing Example

```jsx
// BAD: drawer panel with no focus management — Tab escapes to background
function Drawer({ isOpen }) {
  return isOpen ? (
    <div className="drawer-panel">
      <button onClick={close}>✕</button>
      <h2>Settings</h2>
      <SettingsForm />
    </div>
  ) : null;
}
```

**Why it fails**: No `role="dialog"`, no `aria-modal`, no focus trap. Tab navigates freely into the background while the drawer is open. Escape does nothing.
**Grep detection**: `grep -rn 'class.*drawer\|class.*panel' src/ | grep -v 'role=\|aria-modal'`
**Fix**: Use Radix `<Dialog>` with `data-side` variant, or Vaul (drawer library), which handles focus trap, Escape, portal, and `aria-modal` automatically.
