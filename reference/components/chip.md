# Chip / Tag — Benchmark Spec

**Harvested from**: Material 3, Carbon, Atlassian, Mantine
**Wave**: 3 · **Category**: Feedback

---

## Purpose

A chip (or tag) is a compact, interactive label that represents an attribute, filter, or selection. It is commonly used for multi-select filter interfaces, tag-input fields (user-generated labels), one-time suggestion prompts, and static display labels. Each variant has distinct interaction semantics — filter chips toggle on/off, input chips are removable, suggestion chips trigger a one-time action, and display chips are static. *(Material 3, Carbon, Atlassian, Mantine agree on the four-variant taxonomy)*

*UUPM app-interface: filter chips in search/filter UIs and tag input patterns (MIT attribution)*

---

## Anatomy

```
┌───────────────────────────────┐
│ [icon?]  Label text  [✕ remove?] │
└───────────────────────────────┘
↑ role varies by variant
↑ touch target ≥ 32px height
```

| Part | Required | Notes |
|------|----------|-------|
| Label text | Yes | Concise (1–3 words typical) |
| Container | Yes | Interactive element; role/type depends on variant |
| Leading icon | No | 16px; left-aligned; 8px gap to label |
| Remove button | Conditional | Required on input/tag chips; independent focusable element |
| Selected state indicator | Conditional | Checkmark or filled style on toggled filter chips |

---

## Variants

| Variant | Interaction | Role | Systems |
|---------|-------------|------|---------|
| Filter | Toggleable; multi-select | `aria-pressed` or `role="option"` in `role="listbox"` | Material 3, Carbon, Atlassian, Mantine |
| Input / Tag | User-generated; removable via × button | `role="option"` in combobox; or `role="listbox"` child | Material 3, Atlassian, Mantine |
| Suggestion | One-time select; fires an action then typically disappears | `role="button"` | Material 3, Mantine |
| Display | Static label; no interaction | No role needed (or `role="listitem"`) | Atlassian (Lozenge), Carbon (Tag), Mantine |

**Norm** (≥4/18 systems agree): filter chip uses `aria-pressed` for standalone toggles; input chip requires independent remove button with its own `aria-label`; display chip is decorative/static.
**Diverge**: Material 3 calls static chips "Suggestion chips" when one-time-action and "Assist chips" for shortcut actions; Atlassian separates "Tag" (removable) from "Lozenge" (static status label); Carbon calls them "Tag" uniformly with a `filter` prop.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Rest fill + label | — |
| hover | pointer over chip | Background tint (+8%) | — |
| focus | keyboard focus on chip | focus-visible ring (2px) | — |
| selected (filter) | click / Enter / Space | Filled background; checkmark icon | `aria-pressed="true"` |
| unselected (filter) | click / Enter / Space | Outline style | `aria-pressed="false"` |
| disabled | `disabled` / `aria-disabled` | 38% opacity; cursor not-allowed | `aria-disabled="true"` |
| remove focus | Tab to × button | Focus ring on × | — |

---

## Sizing & Spacing

| Property | Value | Notes |
|----------|-------|-------|
| Height | 32px (min touch target) | Do not reduce below 32px |
| Padding-x | 12px | Each side; 8px when leading icon present |
| Gap (icon → label) | 8px | |
| Gap (label → remove ×) | 4px | |
| Remove button size | 20×20px (visual); 32×32px (touch) | Extend touch area with padding |
| Border radius | 16–20px (full pill) | *(Material 3: full-radius pill; Carbon: 4px; Atlassian: 2px)* |
| Font size | 13–14px / 400 | |

**Norm**: pill shape (full-radius) for filter and input chips *(Material 3, Mantine)*; Touch target ≥ 32px height *(WCAG 2.5.5, Material 3)*.

---

## Typography

- Label: body-sm (13–14px/400) — same scale as form labels
- No bold weight — chip label is a tag, not a heading or CTA
- Truncate with ellipsis only when chip is in a fixed-width container; prefer wrapping chip set to natural width

Cross-link: `reference/typography.md` — body-sm definition

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `button` (filter standalone, suggestion); `option` inside `listbox` (filter group, input chips)
> **Required attributes**: `aria-pressed` on standalone filter chip; `aria-label` on remove button; `aria-selected` if `role="option"`

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/listbox/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Moves focus to the chip or to the remove (×) button |
| Enter / Space | Toggles filter chip (pressed/unpressed); activates suggestion chip |
| Delete / Backspace | Removes an input/tag chip (when chip or its remove button has focus) |
| Arrow Left / Right | Navigates between chips when inside a `role="listbox"` group |
| Escape | Collapses chip group if it was expanded (e.g. overflow +N pattern) |

### Accessibility Rules

- Filter chip used as standalone toggle MUST have `aria-pressed="true|false"` — absence means screen readers cannot report toggle state *(WAI-ARIA APG)*
- Filter chips inside a multi-select group SHOULD use `role="option"` inside `role="listbox"` with `aria-multiselectable="true"` *(WAI-ARIA APG)*
- Remove button MUST have an independent `aria-label` describing what it removes: `aria-label="Remove Python tag"` — the × glyph alone is not an accessible name *(WAI-ARIA APG, Material 3)*
- Remove button MUST be a separate focusable element, NOT a click handler on the chip label *(Carbon, Atlassian)*
- Touch target for remove button MUST be ≥ 32×32px via padding even if the visual × is 16–20px *(WCAG 2.5.5)*
- Display chips have no role — they are presentational; if they carry meaningful status, use `role="status"` or integrate into an Alert *(Atlassian Lozenge guidance)*

Cross-link: `reference/accessibility.md` — `aria-pressed`, `listbox`, touch targets

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Toggle selected (background fill) | 100ms | ease-out | Background + checkmark appear |
| Chip remove (collapse width) | 150ms | ease-in | Width collapses to 0, siblings shift |
| Chip add (expand width) | 150ms | ease-out | Width expands from 0 |
| Hover background | 80ms | ease-out | Subtle tint only |

**BAN**: Full-page reflow animation when removing a chip — collapse width inline; do not shift unrelated page sections. Do not use `transition: all` (catches unintended border/shadow changes).

Cross-link: `reference/motion.md` — `prefers-reduced-motion`: skip width animation, instant add/remove

---

## Do / Don't

### Do
- Add `aria-pressed` to standalone filter chips *(WAI-ARIA APG)*
- Give remove buttons an independent `aria-label`: "Remove [label] tag" *(WAI-ARIA APG, Material 3)*
- Use `role="listbox"` + `role="option"` for multi-select filter chip groups *(WAI-ARIA APG)*
- Ensure touch target ≥ 32px height; extend remove button via padding *(WCAG 2.5.5)*

### Don't
- Don't put filter chips without `aria-pressed` — screen readers cannot report selected state *(WAI-ARIA APG)*
- Don't use the same click handler for chip label and remove — remove must be independently focusable *(Carbon, Atlassian)*
- Don't truncate chip label in narrow containers without a tooltip — truncated tags lose meaning *(Polaris, Mantine)*
- Don't use display chips for dynamic statuses that change — use Alert or Badge instead *(Atlassian)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Filter chip without aria-pressed | `reference/anti-patterns.md#ban-aria-pressed` |
| Remove button without aria-label | `reference/anti-patterns.md#ban-aria-label` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| aria-pressed on standalone filter chip | WAI-ARIA APG, Material 3, Carbon |
| Remove button independent aria-label | WAI-ARIA APG, Material 3, Atlassian |
| role="option" inside role="listbox" for group | WAI-ARIA APG |
| Touch target ≥ 32px height | WCAG 2.5.5, Material 3 |
| Delete/Backspace removes input chip | Material 3, Atlassian, Mantine |
| UUPM filter/tag-input patterns | UUPM app-interface (MIT) |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Filter chip missing aria-pressed
grep -rn 'chip\|Chip\|filter-tag\|filterChip' src/ | grep -i 'filter\|toggle' | grep -v 'aria-pressed'

# Remove button on chip missing aria-label
grep -rn 'chip.*remove\|tag.*remove\|remove.*chip\|remove.*tag' src/ | grep -v 'aria-label'

# Chip remove button without independent tab stop (not a separate button element)
grep -rn 'chip\|tag' src/ | grep '×\|&times;\|✕\|close' | grep -v '<button\|role="button"'
```

---

## Failing Example

```html
<!-- BAD: filter chip with no aria-pressed — screen readers cannot report toggle state -->
<div class="chip chip--filter" onclick="toggleFilter(this)">
  Python
</div>
```

**Why it fails**: `<div>` is not keyboard reachable. No `aria-pressed` means screen readers cannot determine if the filter is active or inactive. No `role="button"` or `tabindex` so keyboard users skip it entirely. No focus-visible ring.
**Grep detection**: `grep -rn 'chip--filter\|filterChip\|chip.*filter' src/ | grep -v 'aria-pressed'`
**Fix**:
```html
<button class="chip chip--filter"
        aria-pressed="false"
        onclick="toggleFilter(this)">
  Python
</button>
```
Update `aria-pressed` to `"true"` when selected.
