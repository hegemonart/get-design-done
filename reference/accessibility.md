# Accessibility — Thresholds and Requirements

These are concrete, measurable standards. WCAG 2.1 AA is the minimum baseline for all design work unless the client explicitly requires AAA or specifies otherwise.

---

## WCAG 2.1 AA — Required Thresholds

### Color Contrast

| Text type | Minimum ratio (AA) | Enhanced (AAA) |
|---|---|---|
| Normal text (< 18pt / < 14pt bold) | **4.5 : 1** | 7 : 1 |
| Large text (≥ 18pt or ≥ 14pt bold) | **3 : 1** | 4.5 : 1 |
| UI components and graphical objects | **3 : 1** | — |
| Decorative elements | No requirement | — |

**Calculate contrast**: `(L1 + 0.05) / (L2 + 0.05)` where L1 is the lighter luminance.

Common pitfalls:
- Placeholder text in inputs: must meet 4.5:1 (often doesn't — gray placeholders fail)
- Disabled state text: WCAG exempts disabled elements, but aim for ≥ 3:1 anyway
- Link color vs body text: must be distinguishable by more than color alone (underline or 3:1 ratio vs background)
- Focus ring color vs its background: must meet 3:1

Tools: Use browser DevTools > Accessibility tab, or pass hex values through contrast calculation.

### Touch Target Size

| Platform | Minimum tap target |
|---|---|
| iOS (Apple HIG) | **44 × 44 pt** |
| Android (Material Design) | **48 × 48 dp** |
| Web (WCAG 2.5.5 AAA) | **44 × 44 px** |
| Web (WCAG 2.5.8 AA — WCAG 2.2) | **24 × 24 px** (minimum, with spacing) |

Recommended target: 44 × 44 px on all platforms. Never smaller for primary actions.

Minimum spacing between targets: **8px** to prevent accidental taps.

Use `hitSlop` in React Native to expand tap area beyond visual bounds:
```js
hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
```

### Focus States

All interactive elements must have a visible focus indicator.

**Required for WCAG 2.4.11 (AA — WCAG 2.2):**
- Focus indicator at minimum: **2px solid** outline, encloses the component
- Contrast between focused and unfocused: **3:1**
- Focus indicator doesn't overlap component content

**Best practice:**
```css
:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

/* Never remove focus without replacement */
:focus:not(:focus-visible) {
  outline: none; /* OK — only removes keyboard focus ring for mouse users */
}
```

Recommended focus ring: **3px solid**, `2px offset`, brand primary or `#2563eb`.

### Semantic Structure

- One `<h1>` per page. Headings are sequential: `h1` → `h2` → `h3` — never skip levels.
- Interactive elements are focusable: use `<button>` for buttons, `<a href>` for links — never `<div onClick>`.
- Form inputs have associated `<label for="id">` — not just placeholder text.
- Images have descriptive `alt=""` for meaningful images; `alt=""` for decorative.
- Icon-only buttons have `aria-label`: `<button aria-label="Close dialog">×</button>`.

### Color Must Not Be The Only Differentiator

Error states: red color + error icon + text message (not just red border).
Required fields: asterisk (*) + visible label (not just red label).
Charts: color + pattern/texture + direct labels.

### Keyboard Navigation

All functionality reachable via keyboard:
- Tab order matches visual reading order (top-left → bottom-right)
- Focus never trapped except in modals (where it SHOULD be trapped)
- `Escape` closes any overlay (modal, dropdown, drawer)
- Enter/Space activates focused button/link
- Arrow keys navigate within component groups (radio buttons, tabs, menus)

---

## ARIA Patterns (Common)

### Modal Dialog
```html
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Confirm Deletion</h2>
  <!-- content -->
  <button>Cancel</button>
  <button>Delete</button>
</div>
```
On open: move focus to first focusable element or dialog title.
On close: return focus to the trigger element.

### Live Regions
```html
<!-- For dynamic content updates (toasts, status messages) -->
<div aria-live="polite" aria-atomic="true">
  <!-- Status messages injected here -->
</div>

<!-- For urgent updates (errors) -->
<div aria-live="assertive">
  <!-- Error messages injected here -->
</div>
```

### Loading States
```html
<button aria-disabled="true" aria-busy="true">
  <span aria-hidden="true">⟳</span>
  Saving...
</button>
```

---

## Responsive and Dynamic Type

- Base font size: minimum **16px** on mobile (smaller = pinch-zoom for many users)
- Honor system text scaling: don't lock font sizes in px when users have increased system font size
- In React Native: use `Text` component which respects Dynamic Type automatically
- In web: use `rem` units for font sizes, not `px`

```css
/* GOOD — scales with user preference */
font-size: 1rem; /* = 16px at default, scales if user sets larger system font */

/* RISKY — overrides user preference */
font-size: 16px;
```

---

## Motion Accessibility

All animations must respect `prefers-reduced-motion: reduce`. See `reference/motion.md`.

The `prefers-reduced-motion` check is an accessibility requirement (WCAG 2.3.3 AAA; WCAG 2.2 reduces to recommendation — but implement it regardless).

---

## Quick Accessibility Audit Checklist

Run through this before marking any design complete:

**Contrast:**
- [ ] All body text ≥ 4.5:1 against background
- [ ] Large text ≥ 3:1
- [ ] UI components (inputs, buttons) ≥ 3:1
- [ ] Placeholder text ≥ 4.5:1
- [ ] Focus rings ≥ 3:1 against adjacent colors

**Interaction:**
- [ ] All tap targets ≥ 44×44px
- [ ] 8px minimum gap between targets
- [ ] Focus ring visible on all interactive elements
- [ ] Tab order is logical
- [ ] Escape closes overlays
- [ ] No keyboard traps outside modals

**Semantics:**
- [ ] One h1 per page, heading hierarchy is sequential
- [ ] All images have meaningful alt text or alt=""
- [ ] Form labels associated with inputs
- [ ] Icon buttons have aria-label
- [ ] Error messages associated with fields (aria-describedby)
- [ ] Live regions for dynamic content

**Color:**
- [ ] No color-only meaning (+ icon, pattern, or text)
- [ ] Error states have visual indicator beyond color

**Motion:**
- [ ] prefers-reduced-motion handled
- [ ] Auto-playing video can be paused
