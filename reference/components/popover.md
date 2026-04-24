# Popover — Benchmark Spec

**Harvested from**: Radix UI Popover, Floating UI, Mantine, Atlassian, WAI-ARIA APG, shadcn/ui, Carbon, Material 3
**Wave**: 2 · **Category**: Containers

---

## Purpose

A popover is an anchored overlay that appears beside a trigger element, containing richer content than a tooltip (interactive content, forms, menus). It is dismissed by clicking outside, pressing Escape, or activating a close button. Unlike a modal, it does not trap focus (unless it contains a form that requires isolation). *(Radix, Floating UI, WAI-ARIA APG differentiate popover from both tooltip and modal)*

---

## Anatomy

```
[Trigger button]
        │
        ▼ (arrow / caret — optional)
┌───────────────────────┐
│ Title (opt.)  [✕]     │  ← optional close button
│───────────────────────│
│ Content / form        │
│                       │
│ [Action]              │
└───────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| Trigger | Yes | Button or interactive element that opens the popover |
| Popover container | Yes | `role="dialog"` OR no role for non-modal content |
| Content | Yes | Can include interactive elements (forms, links, buttons) |
| Arrow pointer | No | 8–12px; indicates anchor relationship |
| Close button | No | When popover contains a form (escape is always active) |
| Backdrop | No | Popovers typically dismiss on outside-click, not backdrop |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default | Anchored to trigger; dismisses on outside-click | All |
| With title | Title bar + close button for complex content | Radix, shadcn, Atlassian |
| Form popover | Contains inputs; focus trap optional | Radix, Mantine |
| Contextual menu | List of actions (see also: Dropdown Menu pattern) | Material 3, Carbon |
| Inline picker | Date, color, emoji picker | Material 3, Mantine |

**Norm** (≥5/18): Escape closes; outside-click closes; arrow pointer indicates anchor.
**Diverge**: focus trap — Radix Popover does NOT trap focus (non-modal); Radix Dialog DOES. Use Dialog-pattern when content isolation is required.

---

## States

| State | ARIA |
|-------|------|
| Closed | `aria-expanded="false"` on trigger |
| Open | `aria-expanded="true"` on trigger; `aria-controls="popover-id"` |
| Loading | `aria-busy="true"` on popover body |

---

## Positioning

*Per Floating UI — https://floating-ui.com — MIT — 2024*

| Property | Recommended Value | Notes |
|----------|-------------------|-------|
| Placement | `bottom` (default), `top`, `left`, `right` | Auto-flip on viewport edge |
| Auto-flip | `flip()` middleware | Flips to opposite side when space is insufficient |
| Auto-shift | `shift()` middleware | Shifts along the axis to stay in viewport |
| Offset | 8px from trigger | Gap between trigger and popover edge |
| Arrow | `arrow()` middleware | CSS custom property `--arrow-x`, `--arrow-y` |

Positioning must update on scroll and resize (`autoUpdate` from Floating UI).

---

## Sizing & Spacing

| Property | Value | Notes |
|----------|-------|-------|
| Min width | 200px | Prevents content collapse |
| Max width | 360px | Wider → use modal instead |
| Padding | 16px | |
| Arrow size | 8×8px | |
| Border radius | Match design token | `reference/surfaces.md` |

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `dialog` (when content requires focus isolation) OR no specific role
> **Trigger attributes**: `aria-expanded`, `aria-controls` (popover id), `aria-haspopup="dialog"` (when role="dialog")

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/dialogmodal/ (non-modal variant) — W3C — 2024*

| Key | Action |
|-----|--------|
| Escape | Closes the popover; returns focus to trigger |
| Tab (inside popover) | Moves focus through interactive elements inside popover |
| Tab (last element inside) | Closes popover; moves focus to next element after trigger |

### Accessibility Rules

- Trigger MUST have `aria-expanded` toggled on open/close
- Trigger MUST have `aria-controls` pointing to the popover's `id`
- When popover is dismissed, focus MUST return to the trigger element
- Non-modal popover: Tab MAY leave the popover (focus is not trapped)
- Modal popover (form isolation): add `role="dialog"` + `aria-modal="true"` + focus trap
- Popover with interactive content: do NOT use `role="tooltip"` — tooltip cannot contain interactive elements

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Open | 120ms | ease-out | scale 0.95→1 + fade; origin at trigger |
| Close | 80ms | ease-in | fade only |
| Position update | 0ms | — | No animation on reposition (prevents jank on scroll) |

Cross-link: `reference/motion.md` — `AnimatePresence`, `data-state` trigger for CSS transitions

---

## Do / Don't

### Do
- Use Floating UI or equivalent for positioning — manual positioning breaks on scroll and viewport edge *(Radix, Mantine, shadcn)*
- Dismiss on outside-click AND Escape *(WAI-ARIA APG, Radix, all systems)*
- Return focus to trigger on close *(WAI-ARIA APG)*
- Auto-flip and auto-shift so popover stays in viewport *(Floating UI)*

### Don't
- Don't use `role="tooltip"` for popovers with interactive content — tooltip has a different contract *(WAI-ARIA APG)*
- Don't position with `position: absolute` without a Floating UI — it will misalign on scroll *(Floating UI docs)*
- Don't make popovers wider than 360px — use a modal for complex content *(Atlassian, Carbon)*
- Don't auto-open popovers on hover — use tooltip for hover-triggered content *(Radix, WAI-ARIA APG)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| role="tooltip" on interactive content | `reference/anti-patterns.md` |
| Manual absolute positioning | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Escape closes popover | WAI-ARIA APG, Radix, all systems |
| aria-expanded on trigger | WAI-ARIA APG |
| Floating UI for positioning | Radix, Mantine, shadcn |
| No focus trap (non-modal) | Radix Popover docs |
| 8px offset from trigger | Floating UI default |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Popover trigger missing aria-expanded
grep -rn 'popover\|Popover' src/ | grep 'trigger\|button' | grep -v 'aria-expanded'

# role="tooltip" used for interactive popover
grep -rn 'role="tooltip"' src/ | xargs grep -l 'button\|input\|<a ' 2>/dev/null

# Manual absolute positioning (no Floating UI)
grep -rn 'position:\s*absolute' src/ | grep -i 'popover\|dropdown\|overlay'
```

---

## Failing Example

```html
<!-- BAD: popover with role="tooltip" containing a button — wrong role, keyboard broken -->
<div role="tooltip" id="popover" style="position:absolute;top:40px">
  <p>Quick actions</p>
  <button onclick="doAction()">Apply</button>
</div>
```

**Why it fails**: `role="tooltip"` cannot contain interactive elements per ARIA spec. The button is announced incorrectly. Escape may not close (tooltip close behavior differs from popover/dialog).
**Grep detection**: `grep -rn 'role="tooltip"' src/ | xargs grep -l 'button\|<a \|input' 2>/dev/null`
**Fix**: Use `role="dialog"` with `aria-modal="false"` (non-modal) for interactive popovers, or use Radix `<Popover>` which handles all ARIA and positioning automatically.
