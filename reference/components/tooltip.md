# Tooltip — Benchmark Spec

**Harvested from**: WAI-ARIA APG, Radix UI, Material 3, Carbon, Mantine, Fluent 2, Atlassian, Apple HIG
**Wave**: 2 · **Category**: Containers

---

## Purpose

A tooltip is a small, non-interactive label that appears on hover or keyboard focus to provide supplemental context for an element (typically an icon button or truncated text). It disappears on mouse-out, blur, or Escape. Tooltips MUST NOT contain interactive content (buttons, links, form elements). For interactive overlay content, use Popover. *(WAI-ARIA APG, Radix, Carbon all enforce this boundary)*

---

## Anatomy

```
[Icon button]  ← hover or focus triggers tooltip
      │
      ▼  (after 300ms delay)
┌────────────┐
│  Label     │  ← role="tooltip"; 12px; no interactive content
└────────────┘
     ▲  (optional 6px arrow caret)
```

| Part | Required | Notes |
|------|----------|-------|
| Trigger | Yes | Usually a button or interactive element |
| Tooltip container | Yes | `role="tooltip"` + unique `id` |
| Label text | Yes | Short (≤60 chars), descriptive |
| Arrow | No | 6–8px caret indicating anchor |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default | Hover + focus triggered | All |
| Delayed | 300ms show delay; 0ms hide | All (WAI-ARIA APG recommended) |
| Instant | No delay (icon toolbars, dense UIs) | Material 3, Carbon |
| Dark | Dark background regardless of theme | Most systems |
| Light | Light background | Mantine (inverted) |

**Norm** (≥7/18): 300ms show delay, 0ms hide; max-width 240px; never interactive content.
**Diverge**: delay duration — Carbon recommends 100ms for toolbars; WAI-ARIA APG recommends ≤500ms. 300ms is the safe default.

---

## States

| State | Trigger | ARIA |
|-------|---------|------|
| hidden | default | `role="tooltip"` hidden (not in tab order) |
| visible (hover) | `mouseenter` (after delay) | `aria-describedby` on trigger points to tooltip id |
| visible (focus) | `focusin` on trigger | same |
| dismissed | `mouseleave`, `blur`, Escape | Tooltip hidden |

---

## Sizing & Spacing

| Property | Value | Notes |
|----------|-------|-------|
| Max width | 240px | *(Material 3: 200px, Carbon: 288px, Fluent: 240px)* |
| Padding | 6px 12px | |
| Font size | 12px/400 | Smaller than body to signal supplemental role |
| Border radius | 4–6px | Tight radius vs. card; feels like label |
| Offset from trigger | 6–8px | |

---

## Typography

- 12px/400 — tooltip text is supplemental; smaller weight and size distinguish it from primary content
- No bold, no headings inside tooltip — it is a single line of text (≤60 chars preferred)
- Multi-line: allowed if content genuinely requires it; still no interactive elements

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `tooltip`
> **Trigger attributes**: `aria-describedby="tooltip-id"` — links the supplemental label

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | (on trigger) Shows tooltip when trigger receives focus |
| Escape | Hides the tooltip |
| Tab / Shift+Tab | Hides tooltip when focus leaves the trigger |

Tooltip does NOT receive focus. It is purely a visual label attached to the trigger.

### Accessibility Rules

- Trigger MUST have `aria-describedby` pointing to the tooltip's `id` — screen readers read tooltip content as supplemental description
- Tooltip is `role="tooltip"` — NOT `role="dialog"` (no interactivity, no focus trap)
- Tooltip MUST appear on keyboard focus, not only on hover — keyboard-only users need access too *(WCAG 1.3.3, 2.1.1)*
- Do NOT put interactive content inside a tooltip — use Popover (`reference/components/popover.md`)
- Do NOT use tooltip as the only accessible name for a control — use `aria-label` on the trigger instead; tooltip supplements, not replaces, the accessible name
- Escape MUST dismiss the tooltip without removing focus from the trigger *(WAI-ARIA APG)*

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Show | 100ms | ease-out | Fade only; no scale (too flashy for a label) |
| Hide | 80ms | ease | Fade only; immediate on Escape |
| Delay | 300ms | — | CSS `transition-delay` or JS timeout |

Cross-link: `reference/motion.md` — `prefers-reduced-motion`: skip fade, instant show/hide

---

## Do / Don't

### Do
- Show on keyboard focus AND hover — not hover-only *(WAI-ARIA APG, WCAG 2.1.1)*
- Use `aria-describedby` to link trigger to tooltip *(WAI-ARIA APG)*
- Limit tooltip content to ≤60 chars — longer content belongs in a popover *(Carbon, Material 3)*
- Apply 300ms show delay to prevent accidental triggers while cursor passes *(WAI-ARIA APG, Carbon)*

### Don't
- Don't put interactive elements inside a tooltip *(WAI-ARIA APG — this makes it a popover)*
- Don't use tooltip as the only accessible name — `aria-describedby` supplements, not replaces, `aria-label` *(WAI-ARIA APG)*
- Don't trigger tooltip on click — use a popover *(Radix, WAI-ARIA APG)*
- Don't use tooltip for critical information — it's supplemental; users on touch devices may miss it *(Material 3, Polaris)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Interactive content inside tooltip | `reference/anti-patterns.md` |
| Hover-only tooltip (not focus-triggered) | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| role="tooltip" not role="dialog" | WAI-ARIA APG |
| Show on focus AND hover | WAI-ARIA APG, WCAG 2.1.1 |
| Escape dismisses without removing focus | WAI-ARIA APG §3.2 |
| 300ms delay | WAI-ARIA APG, Carbon |
| 240px max-width | Material 3, Fluent 2 |
| No interactive content | WAI-ARIA APG (all systems agree) |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Tooltip triggered only on hover (not focus) — missing focusin handler
grep -rn 'tooltip\|Tooltip' src/ | grep 'mouseenter\|onHover' | grep -v 'focus\|onFocus'

# Interactive content inside tooltip
grep -rn 'role="tooltip"' src/ | xargs grep -l 'button\|<a \|input' 2>/dev/null

# Trigger missing aria-describedby
grep -rn 'role="tooltip"' src/ | grep -v 'aria-describedby'

# Tooltip without id (aria-describedby target requires id)
grep -rn 'role="tooltip"' src/ | grep -v ' id='
```

---

## Failing Example

```html
<!-- BAD: tooltip shows on hover only, no focus trigger, no ARIA linkage -->
<button class="icon-btn" onmouseenter="showTooltip()" onmouseleave="hideTooltip()">
  <svg><!-- settings icon --></svg>
</button>
<div class="tooltip">Settings</div>
```

**Why it fails**: Keyboard users never see the tooltip. Screen readers receive no supplemental description. The `<div>` has no `role="tooltip"` and no `id`, so `aria-describedby` cannot link to it.
**Grep detection**: `grep -rn 'mouseenter\|onHover' src/ | grep -i 'tooltip' | grep -v 'focus'`
**Fix**:
```html
<button aria-describedby="settings-tip"
        onmouseenter="show()" onmouseleave="hide()"
        onfocusin="show()" onfocusout="hide()"
        onkeydown="e.key==='Escape'&&hide()">
  <svg aria-hidden="true"><!-- icon --></svg>
  <span class="sr-only">Settings</span>
</button>
<div role="tooltip" id="settings-tip">Manage account settings</div>
```
