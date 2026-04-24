# Select / Combobox — Benchmark Spec

**Harvested from**: Radix UI, WAI-ARIA APG, Carbon, Headless UI, Mantine, Material 3, Ant Design, shadcn/ui
**Wave**: 1 · **Category**: Inputs

---

## Purpose

A select allows the user to choose one (or multiple) options from a predefined list presented in a dropdown. A combobox extends this with a text filter input. Use native `<select>` when styling flexibility is not required and options are static; use a custom combobox when filtering, grouping, async loading, or complex option rendering is needed. *(Radix, Headless UI, WAI-ARIA APG agree on this decision tree)*

---

## Anatomy

```
Label *
┌────────────────────────┬──┐
│ Selected value         │ ▾│  ← trigger button (role="combobox" + aria-haspopup)
└────────────────────────┴──┘
  ┌──────────────────────────┐
  │ [search input]           │  ← combobox only; role="textbox"
  │──────────────────────────│
  │ ○ Option A               │  ← role="option" in role="listbox"
  │ ○ Option B               │
  │ ○ Option C               │
  └──────────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| Label | Yes | `<label>` or `aria-label` on trigger |
| Trigger button | Yes | Announces selected value; opens dropdown on Enter/Space |
| Dropdown list | Yes | `role="listbox"` container |
| Option items | Yes | `role="option"` with `aria-selected` |
| Filter input | No | Combobox only; `role="combobox"` with `aria-controls` |
| Group headings | No | `role="group"` with `aria-label` |
| Empty state | Conditional | Required when async/filter can return zero results |
| Clear button | No | Clears selection; keyboard accessible |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Native select | `<select>` — minimal, accessible, no custom styling | All (as baseline) |
| Custom select | Styled trigger + listbox; no filter | Radix, Carbon, shadcn |
| Combobox | Trigger + text filter + listbox | Radix, Mantine, Headless UI, Ant |
| Multi-select | Multiple `aria-selected="true"` options; tag display | Mantine, Ant, Carbon |
| Async / searchable | Options loaded on query; loading state in listbox | Mantine, Ant, shadcn |

**Norm** (≥5/18): custom select must replicate native keyboard behavior exactly.
**Diverge**: tag vs. chip display for multi-select — Mantine uses tags, Ant uses chips, Carbon uses checkboxes in dropdown. Checkbox approach is most accessible (state is visible without removing focus from listbox).

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Resting trigger | `aria-expanded="false"` |
| open | trigger activated | Dropdown visible | `aria-expanded="true"` |
| option hovered | pointer | Option highlighted | `aria-activedescendant` updated |
| option selected | Enter / click | Checkmark or filled circle | `aria-selected="true"` |
| disabled | `disabled` attr | 38% opacity; pointer-events: none | `aria-disabled="true"` |
| error | validation | Red border + error message | `aria-invalid="true"` |
| loading | async fetch | Spinner inside listbox | `aria-busy="true"` on listbox |
| empty | filter = zero results | "No results" message in listbox | `aria-live="polite"` |

---

## Sizing & Spacing

| Size | Trigger height | Option height | Padding H |
|------|---------------|---------------|-----------|
| sm | 32px | 28px | 12px |
| md (default) | 40px | 36px | 16px |
| lg | 48px | 44px | 16px |

Max dropdown height: 240px with internal scroll — prevents viewport overflow without pagination.
Option min-height: 36px (md) for touch targets *(Material 3, Polaris)*

---

## Typography

- Trigger value: same weight/size as input (14px/400)
- Option text: 14px/400; selected option: 14px/500
- Group label: 11px/600 uppercase, muted colour — not an option, not focusable

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `combobox` on trigger (select pattern); `listbox` on dropdown; `option` on items
> **Required attributes**: `aria-expanded`, `aria-haspopup="listbox"`, `aria-controls` (trigger→listbox), `aria-activedescendant` (updated on option focus)

### Keyboard Contract — Select (Listbox Pattern)

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/listbox/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Enter / Space | Opens listbox when trigger is focused |
| Escape | Closes listbox; returns focus to trigger |
| Arrow Down | Opens listbox (if closed) or moves focus to next option |
| Arrow Up | Opens listbox (if closed) or moves focus to previous option |
| Home | Moves focus to first option |
| End | Moves focus to last option |
| Enter (option focused) | Selects option; closes listbox |
| Tab | Closes listbox; moves focus to next element |
| Printable character | (Type-ahead) Moves focus to next option starting with typed character |

### Keyboard Contract — Combobox

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Any printable character | Filters option list; opens popup |
| Escape | Clears filter (if any); closes popup |
| Arrow Down | Moves focus into listbox (first or previously focused option) |
| Arrow Up | Moves focus to last option |
| Enter | Selects focused option; closes popup |
| Alt + Arrow Down | Opens popup without moving focus |
| Alt + Arrow Up | Closes popup; returns focus to textbox |

### Accessibility Rules

- `aria-activedescendant` on trigger MUST update as options are highlighted — screen readers follow this, not DOM focus
- Options must have unique `id` attributes (for `aria-activedescendant` reference)
- Grouping: `role="group"` with `aria-label` wrapping grouped `role="option"` items
- Empty state: announce via `aria-live="polite"` region when filter returns no results
- Virtualised lists: keep rendered DOM options in sync with `aria-activedescendant` pointer

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Dropdown open | 120ms | ease-out | Scale 0.95→1 + fade; origin at trigger |
| Dropdown close | 80ms | ease-in | Fade only |
| Option highlight | 60ms | ease | Background colour only |

Cross-link: `reference/motion.md` — `AnimatePresence` pattern for mount/unmount

---

## Do / Don't

### Do
- Replicate native `<select>` keyboard behavior exactly in custom implementations *(WAI-ARIA APG, Radix)*
- Show a "No results" state (not empty dropdown) when filter has no matches *(Mantine, shadcn, Carbon)*
- Update `aria-activedescendant` on every option focus change *(WAI-ARIA APG)*
- Limit dropdown height to ~6–8 options; add scroll for more *(Carbon, Material 3)*

### Don't
- Don't close the dropdown on every keystroke in combobox mode — only on selection or Escape *(WAI-ARIA APG)*
- Don't use a select for navigation — use a nav + router *(Carbon, Primer)*
- Don't disable scroll inside the listbox — virtualise instead for large lists *(Mantine, Ant)*
- Don't place interactive elements (links, buttons) inside `role="option"` *(WAI-ARIA APG)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Custom select without ARIA | `reference/anti-patterns.md` — ARIA role omission pattern |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| aria-activedescendant pattern | WAI-ARIA APG combobox §4.1 |
| Escape closes + returns focus | WAI-ARIA APG listbox §3.4 |
| 240px max dropdown height | Carbon, Material 3 |
| Checkbox approach for multi-select a11y | Carbon, WAI-ARIA APG |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Custom select/combobox missing aria-expanded
grep -rn 'role="combobox"\|role="listbox"' src/ | grep -v 'aria-expanded'

# Options missing aria-selected
grep -rn 'role="option"' src/ | grep -v 'aria-selected'

# Missing aria-activedescendant on trigger
grep -rn 'role="combobox"' src/ | grep -v 'aria-activedescendant'

# Dropdown closed on every keypress (bad UX in combobox)
grep -rn 'onKeyDown\|on:keydown' src/ | grep -i 'select\|combobox\|dropdown'
```

---

## Failing Example

```html
<!-- BAD: custom dropdown with no ARIA — keyboard users and screen readers are stranded -->
<div class="select-trigger" onclick="toggleDropdown()">Choose option</div>
<ul class="dropdown">
  <li onclick="selectOption('a')">Option A</li>
  <li onclick="selectOption('b')">Option B</li>
</ul>
```

**Why it fails**: No role, no aria-expanded, no keyboard navigation, no focus management.
**Grep detection**: `grep -rn 'class.*dropdown\|class.*select' src/ | grep -v 'role='`
**Fix**: Use Radix `<Select>` or implement WAI-ARIA listbox pattern with `role="combobox"`, `role="listbox"`, `role="option"`, `aria-expanded`, and `aria-activedescendant`.
