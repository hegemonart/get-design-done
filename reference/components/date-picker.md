# Date Picker — Benchmark Spec

**Harvested from**: Material 3, Carbon Design System, Atlassian Design System, Mantine DatePicker
**Wave**: 5 · **Category**: Advanced
**Spec file**: `reference/components/date-picker.md`

---

## Purpose

A Date Picker lets users select a single date or a date range through a calendar popover attached to a text input. It combines a formatted text field (for direct keyboard entry) with a visual month grid (for pointer or keyboard navigation). Use Date Picker when the date is human-meaningful and users may want to browse relative to a calendar context. Use a plain `<input type="date">` when native behavior is sufficient or a mobile-first audience is expected. *(Material 3, Carbon, Atlassian, Mantine agree: calendar popover + text input pairing is the canonical desktop pattern.)*

---

## Anatomy

```
[ Input field "MM/DD/YYYY" ] [ Calendar icon button ]
         │
         └── Popover (role="dialog", aria-modal="true")
               ├── Header: [ ← ] [ Month Year ] [ → ]
               ├── Day-of-week row (aria-hidden="true")
               └── Month grid (role="grid")
                     └── Week rows (role="row")
                           └── Day cells (role="gridcell")
                                 └── Day button (role="button")

Range variant adds a second input field for end date.
```

| Part | Required | Notes |
|------|----------|-------|
| Text input | Yes | Shows selected date; accepts direct keyboard entry |
| Format hint label | Yes | Visible "MM/DD/YYYY" supplement — NOT placeholder only |
| Calendar trigger button | Yes | Opens/closes popover; `aria-label="Open calendar"` |
| Popover (dialog) | Yes | `role="dialog"` + `aria-modal="true"` + focus trap |
| Month navigation | Yes | Previous/next month buttons; keyboard Page Up/Down |
| Month grid | Yes | `role="grid"` |
| Day cell | Yes | `role="gridcell"` containing `role="button"` for selectable days |
| Range highlight | No (range variant only) | Visual fill between start and end dates |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Single date | One input + calendar popover | Material 3, Carbon, Atlassian, Mantine |
| Date range | Start + end input pair sharing one calendar | Carbon (DateRangePicker), Mantine (DateRangePicker), Atlassian |
| Date-time | Date selection + time selector panel | Material 3 (DateTimePicker), Mantine |
| Inline calendar | Calendar always visible, no popover | Mantine (Calendar), Material 3 (docked) |

**Norm** (≥3/4 systems agree): popover calendar attached to a text input is the dominant pattern; range uses two inputs sharing one calendar panel.
**Diverge**: Material 3 uses a modal dialog for mobile; Carbon and Mantine use an anchored popover for all viewports.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Resting input + trigger icon | — |
| open | Trigger click or input focus + Enter | Popover visible, focus moves inside | `aria-expanded="true"` on trigger |
| day hover | Pointer over day | Background highlight | — |
| day focus | Keyboard navigation | Focus-visible ring on day button | — |
| day selected | Enter/Space or click | Filled background (brand color) | `aria-pressed="true"` on day button |
| range-in-progress | Start selected, end not yet | Partial fill from start | — |
| range-complete | Both start and end selected | Full highlight between dates | — |
| disabled date | Date excluded by min/max/filter | Muted; `tabindex="-1"` | `aria-disabled="true"` on day button |
| error | Invalid date typed | Red border + error message | `aria-invalid="true"` on input |

---

## Sizing & Spacing

| Size | Input Height | Popover Width | Day Cell Size | Font |
|------|-------------|---------------|---------------|------|
| sm | 32px | 256px | 32px | 13px |
| md (default) | 40px | 288px | 40px | 14px |
| lg | 48px | 320px | 44px | 16px |

**Norm**: 288px popover width fits a standard 7-column month grid with comfortable padding *(Carbon, Mantine)*.
Day cells must be ≥32px to meet minimum touch-target guidance; prefer 40px for mixed pointer/touch contexts.

Cross-link: `reference/surfaces.md` — minimum 44×44px accessible tap target via padding.

---

## Typography

- Input text: body-md weight 400; monospace or tabular-nums variant for date digits aids alignment
- Day numbers: body-sm, center-aligned within cell
- Month/year header: body-md weight 600
- Format hint ("MM/DD/YYYY"): caption-sm, secondary color — attached as visible `<label>` supplement or `<span aria-hidden="true">` paired with `aria-describedby` on the input

Cross-link: `reference/typography.md` — tabular-nums for date/time fields.

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `dialog` (popover), `grid` (month table), `button` (day cells)
> **Required attributes**: `role="dialog"` + `aria-modal="true"` + `aria-label="Choose date"` on popover; `role="grid"` on month table; `role="gridcell"` + `role="button"` on each day

### Keyboard Contract

*Adapted from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ and grid pattern — W3C — 2024*

| Key | Action |
|-----|--------|
| Enter / Space | Open calendar when focus is on trigger; select focused day |
| Arrow Left / Right | Move focus to previous / next day |
| Arrow Up / Down | Move focus to same day in previous / next week |
| Page Up | Navigate to previous month |
| Page Down | Navigate to next month |
| Ctrl + Page Up | Navigate to previous year |
| Ctrl + Page Down | Navigate to next year |
| Home | Move focus to first day of current week |
| End | Move focus to last day of current week |
| Escape | Close calendar popover; return focus to trigger button |
| Tab | Move focus through interactive elements inside popover |

### Accessibility Rules

- Calendar popover MUST use `role="dialog"` + `aria-modal="true"` — do not use a plain `<div>` overlay
- Focus MUST be trapped inside the open calendar; Escape closes and returns focus to the trigger
- Each selectable day MUST be a `<button>` (or element with `role="button"`) so keyboard and AT users can activate it
- Date format hint MUST be visible text, not only a placeholder (placeholder disappears on input and is not consistently announced)
- Disabled dates MUST use `aria-disabled="true"` and `tabindex="-1"` so they are skipped but still communicated to AT
- Range variant: announce selected range via `aria-label` on day buttons (e.g., `aria-label="April 15, 2025, start of range"`)
- Mobile: provide native `<input type="date">` fallback when touch device detected or user preference set

Cross-link: `reference/accessibility.md` — focus-trap pattern, dialog role requirements.

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Popover open | 150ms | ease-out | Fade + subtle scale from trigger |
| Popover close | 100ms | ease-in | Fade out |
| Month change | 200ms | ease-in-out | Slide left/right or cross-fade |
| Day selection | 80ms | ease-out | Fill background color |
| Range fill | 150ms | ease-out | Animate fill between dates |

**BAN**: Do not animate the calendar grid with a full-page slide — disorienting for keyboard users navigating by month.

Cross-link: `reference/motion.md` — reduced-motion: omit slide, keep instant day selection.

---

## Do / Don't

### Do
- Show the date format as visible text ("MM/DD/YYYY") near the input *(Carbon, Atlassian)*
- Ensure keyboard users can navigate the entire calendar without a pointer *(WAI-ARIA APG)*
- Allow direct text entry in the input field — some users know the date and do not need the calendar *(Mantine, Carbon)*
- Support locale-aware first day of week (Sunday vs. Monday) and locale month/day names *(Material 3, Mantine)*

### Don't
- Don't use `<table>` with click-only cells — add `role="grid"` and full keyboard navigation *(WCAG 2.1 §2.1.1)*
- Don't use placeholder text alone to convey the date format — placeholder vanishes on input *(Carbon, Atlassian)*
- Don't trap focus permanently — Escape must always close the popover and restore focus *(WAI-ARIA APG)*
- Don't omit the native `<input type="date">` for mobile — custom calendars are unusable on small touch screens *(Material 3)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-07 | Placeholder as only label/hint — `reference/anti-patterns.md#ban-07` |
| BAN-12 | Custom overlay without focus trap — `reference/anti-patterns.md#ban-12` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Popover uses role="dialog" + aria-modal | WAI-ARIA APG dialog pattern, Carbon, Atlassian |
| Month grid uses role="grid" | WAI-ARIA APG grid pattern, Mantine docs |
| Arrow keys navigate days; Page Up/Down change month | WAI-ARIA APG, Carbon DatePicker keyboard docs |
| Format hint must be visible text, not only placeholder | Carbon, Atlassian design guidelines |
| Native input fallback for mobile | Material 3, Mantine (mobile prop) |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Calendar popover missing role="dialog" (uses plain div overlay)
grep -rn 'calendar\|datepicker\|date-picker' src/ | grep -v 'role="dialog"'

# Day buttons missing keyboard handler (click-only calendar)
grep -rn 'role="gridcell"\|\.day\|\.calendar-day' src/ | grep -v 'onKeyDown\|on:keydown\|handleKey'

# Date input using placeholder for format hint only (no visible label supplement)
grep -rn '<input.*type="text".*date\|DateInput' src/ | grep 'placeholder.*MM\|placeholder.*dd' | grep -v 'aria-describedby\|<label\|hint'

# Missing aria-modal on calendar popover
grep -rn 'role="dialog"' src/ | grep -v 'aria-modal'
```

---

## Failing Example

```html
<!-- BAD: calendar using <table> with click-only day cells, no keyboard navigation -->
<table class="calendar">
  <tbody>
    <tr>
      <td class="day" onclick="selectDate('2025-04-01')">1</td>
      <td class="day" onclick="selectDate('2025-04-02')">2</td>
      <!-- ... -->
    </tr>
  </tbody>
</table>
```

**Why it fails**: `<td>` cells are not focusable by default; no keyboard navigation; AT users cannot select dates; no `role="grid"` or `role="gridcell"`; click handler is the only interaction path.
**Grep detection**: `grep -rn '<table.*calendar\|<td.*onclick.*date\|<td.*selectDate' src/`
**Fix**: Replace with `<table role="grid">`, `<td role="gridcell">`, `<button>` inside each cell, and full Arrow/Page/Home/End keyboard handlers. Add `role="dialog"` + `aria-modal="true"` + focus trap on the popover wrapper.
