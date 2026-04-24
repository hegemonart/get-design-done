# Pagination — Benchmark Spec

**Harvested from**: Carbon, Polaris, Atlassian, Mantine, Material 3, UUPM (app-interface, MIT)
**Wave**: 4 · **Category**: Navigation

---

## Purpose

Pagination divides a large dataset into discrete pages and provides controls to navigate between them. It is the preferred pattern for server-rendered or API-paginated datasets where loading all items at once is impractical. Use infinite scroll for feeds/social content; use pagination for tables, search results, and list views where users need to reference or return to a specific page. *(Carbon, Polaris, Atlassian, Mantine all define pagination as discrete page-set navigation)*

---

## Anatomy

```
<nav aria-label="Pagination">
  [‹ Previous]  [1]  [2]  [•3•]  [4]  [...]  [24]  [Next ›]
                                   ↑ aria-current="page"
  Items per page: [25 ▾]   Showing 51–75 of 587 items
</nav>
```

| Part | Required | Notes |
|------|----------|-------|
| `<nav>` container | Yes | `aria-label="Pagination"` |
| Previous button | Yes | `aria-label="Previous page"`; `disabled` on page 1 |
| Next button | Yes | `aria-label="Next page"`; `disabled` on last page |
| Page number buttons | Yes | Each button `aria-label="Page N"` |
| Current page indicator | Yes | `aria-current="page"` on active page button |
| Ellipsis | Conditional | At > 7 pages; `aria-hidden="true"` or `aria-label="More pages"` |
| Per-page selector | No | `<select>` with visible `<label>`; options: 10/25/50/100 |
| Results summary | No | "Showing 51–75 of 587 items"; `aria-live="polite"` on change |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Full | Previous + page numbers + Next | Carbon, Polaris, Atlassian, Mantine |
| Compact | Previous + "Page N of M" label + Next (no individual page buttons) | Carbon, Material 3 |
| Simple | Previous / Next only (no page numbers) | Polaris, Atlassian mobile |
| With per-page | Adds items-per-page selector below or beside | Carbon, Polaris, UUPM list-view (MIT) |
| Borderless | Text-only Previous/Next; no page number buttons | Mantine |

**Norm** (≥4 systems agree): show 5–7 page buttons max when not truncating; always show first, last, ±1 around current when truncating.
**Diverge**: Carbon combines per-page selector and result count into the pagination bar; Polaris separates them.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | All buttons enabled except current page | — |
| current-page | — | Filled/highlighted button | `aria-current="page"` |
| prev-disabled | page = 1 | Previous button dimmed | `disabled` or `aria-disabled="true"` |
| next-disabled | page = last | Next button dimmed | `disabled` or `aria-disabled="true"` |
| button-hover | pointer over | 8% overlay | — |
| button-focus | keyboard focus | 2px focus-visible ring | — |
| loading | page change in flight | Spinner overlay on content; buttons retain focus | `aria-busy="true"` on results region |

---

## Sizing & Spacing

| Element | Size | Notes |
|---------|------|-------|
| Page button | 36×36px (md) | 32×32px compact; min tap target 44px via padding |
| Prev/Next button | 36px height × auto | Label text + chevron icon |
| Button gap | 4px | Between adjacent page buttons |
| Per-page select | 80px width | 4 options: 10/25/50/100 |
| Container padding | 16px V | Breathing room above/below |

**Norm**: 36px button height (Carbon, Atlassian, Mantine). 4px gap between buttons.

---

## Typography

- Page number buttons: body-sm (13–14px), weight 400; active page weight 600
- Previous/Next labels: body-sm, weight 400
- Results summary: body-sm, `color: --text-subtle`
- Per-page label: label-sm (12px), always visible above or beside the select

Cross-link: `reference/typography.md` — body-sm, label scale

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `navigation` (container)
> **Required attributes**: `aria-label="Pagination"` on `<nav>`; `aria-current="page"` on active page button; `aria-label="Previous page"` / `"Next page"` on controls; `aria-label="Page N"` on each numbered button

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/landmark-regions/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Moves focus to next button in pagination |
| Shift+Tab | Moves focus to previous button |
| Enter / Space | Activates focused button (navigates to page or changes per-page count) |

### Accessibility Rules

- `aria-label="Pagination"` MUST be on the `<nav>` — distinguishes from other navigation landmarks on the page
- `aria-current="page"` MUST be on the currently active page button — screen readers announce "Page 3, current"
- Previous button on page 1 and Next button on last page MUST use `disabled` or `aria-disabled="true"` + visually dimmed
- `aria-label` on each page number button ("Page 1", "Page 2") prevents screen readers from just announcing the number alone
- Results summary text MUST use `aria-live="polite"` so screen reader users hear the count update after page change
- Per-page `<select>` MUST have a visible `<label>` — not just a placeholder

Cross-link: `reference/accessibility.md` — aria-current, landmark labelling, live regions

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Button hover | 80ms | ease-out | Background color only |
| Page change content transition | 150ms | ease-out | Fade the results region; managed by page, not pagination |
| Ellipsis expand (if interactive) | 120ms | ease-out | Reveal hidden page buttons |

**BAN**: Do not animate the pagination bar itself when a page changes — only the content region transitions.

Cross-link: `reference/motion.md` — content region transitions

---

## Do / Don't

### Do
- Label the `<nav>` with `aria-label="Pagination"` *(WAI-ARIA APG, Carbon, Polaris)*
- Use `aria-current="page"` on the active page button *(WAI-ARIA APG)*
- Provide visible per-page selector with a visible label *(Carbon, Polaris, Atlassian)*
- Show a results summary ("Showing 51–75 of 587") near the pagination controls *(Carbon, Polaris)*

### Don't
- Don't use `<a href>` with pushState without `aria-current` — screen readers won't know which page is current *(WAI-ARIA)*
- Don't show more than 7 page buttons without ellipsis truncation — visually overwhelming *(Carbon, Mantine)*
- Don't disable the Previous/Next buttons with only visual styling — use `disabled` attr or `aria-disabled` *(WCAG 1.4.3)*
- Don't place pagination at the top only — bottom placement is expected; both positions is acceptable *(Polaris, Carbon)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-07 | Missing `aria-current` on active navigation items — `reference/anti-patterns.md#ban-07` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| aria-label="Pagination" on nav container | WAI-ARIA APG, Carbon, Polaris |
| aria-current="page" on active page button | WAI-ARIA APG, Atlassian, Mantine |
| Ellipsis pattern: first + last + ±1 around current | Carbon, Polaris, Atlassian, Mantine |
| Per-page selector requires visible label | WCAG 1.3.1, Carbon, Polaris |
| aria-live="polite" on results summary | WCAG 4.1.3, Carbon |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Pagination nav missing aria-label
grep -rn 'pagination\|pager' src/ | grep '<nav' | grep -v 'aria-label'

# Active page button missing aria-current
grep -rn 'pagination\|pager' src/ | grep 'active\|current\|selected' | grep -v 'aria-current'

# Page buttons using <a> without aria-current
grep -rn '<a' src/ | grep -i 'page.*[0-9]\|pager' | grep -v 'aria-current'

# Per-page select missing label
grep -rn 'per.page\|items-per-page\|pageSize' src/ | grep '<select' | grep -v '<label\|aria-label'
```

---

## Failing Example

```html
<!-- BAD: page buttons using <a href> with pushState but no aria-current -->
<nav>  <!-- missing aria-label="Pagination" -->
  <a href="?page=2" class="prev">Previous</a>  <!-- no aria-label -->
  <a href="?page=1">1</a>
  <a href="?page=2">2</a>
  <a href="?page=3" class="active">3</a>  <!-- class active but no aria-current -->
  <a href="?page=4">4</a>
  <a href="?page=4" class="next">Next</a>  <!-- no aria-label -->
</nav>
```

**Why it fails**: No `aria-label` on `<nav>`; active page has CSS class but no `aria-current="page"` so AT announces "3" not "Page 3, current"; Previous/Next have no descriptive labels; no `aria-label="Page N"` on individual page links.
**Grep detection**: `grep -rn 'pagination' src/ | grep -v 'aria-current\|aria-label'`
**Fix**: Add `aria-label="Pagination"` to `<nav>`; add `aria-current="page"` to the active page button; add `aria-label="Previous page"` and `aria-label="Next page"`; add `aria-label="Page N"` to each numbered button.
