# Table (Data Table / Data Grid) — Benchmark Spec

**Harvested from**: Carbon DataTable, Polaris DataTable, Atlassian DynamicTable, Ant Design Table, UUPM (app-interface, MIT)
**Wave**: 4 · **Category**: Navigation & Data

---

## Purpose

A data table presents structured, comparable information in rows and columns. It supports sorting, filtering, row selection, and pagination. Use `role="table"` for static display; use `role="grid"` for interactive tables where keyboard navigation between cells is needed (e.g., spreadsheet-like editing). Tables are distinct from Lists (unstructured items) and Cards (single-entity display). *(Carbon DataTable, Polaris DataTable, Atlassian DynamicTable, Ant Table all define table as the canonical multi-column data display)*

---

## Anatomy

```
┌─────────────────────────────────────────────────────┐
│ [☐] Name ↑      Status       Amount       Actions   │  <thead>
│─────────────────────────────────────────────────────│
│ [☐] Alice Chen  Active       $1,200.00    [···]     │  <tbody>
│ [☑] Bob Tanaka  Inactive     $850.00      [···]     │  aria-selected="true"
│ [☐] Carol Wu    Active       $2,400.00    [···]     │
│─────────────────────────────────────────────────────│
│ Showing 1–3 of 247    [‹ Prev]  1  2  3  [Next ›]  │  <tfoot>
└─────────────────────────────────────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| `<table>` | Yes | Semantic table element; `role="grid"` if interactive |
| `<caption>` | Yes (or `aria-label`) | Describes the table's purpose; `<caption>` preferred |
| `<thead>` | Yes | Column header row(s) |
| `<th scope="col">` | Yes | `scope="col"` on every column header |
| `<tbody>` | Yes | Data rows |
| `<th scope="row">` | No | Row header for the first cell if rows have identity |
| `<tfoot>` | No | Summary row, pagination, totals |
| Sortable header | No | `aria-sort="ascending|descending|none"` on `<th>` |
| Select-all checkbox | No | `<th scope="col">` with select-all; `aria-label="Select all rows"` |
| Row checkbox | No | `<td>` with checkbox; selected row has `aria-selected="true"` on `<tr>` |
| Scroll wrapper | Conditional | `overflow-x: auto` + `tabindex="0"` on wrapper for keyboard scroll |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Static / display | Read-only; `role="table"` | All systems |
| Sortable | Clickable column headers; `aria-sort` | Carbon, Polaris, Atlassian, Ant |
| Selectable | Row checkboxes; batch actions toolbar | Carbon, Polaris, Atlassian |
| Expandable rows | Toggle row detail panel | Carbon, Ant, Atlassian |
| Interactive / grid | Cell-level focus; `role="grid"` | Carbon, Ant |
| Sticky header | `position: sticky` on `<thead>` | Carbon, Ant, Polaris |
| Master-detail | Table + side detail pane | UUPM app-interface (MIT) |
| Dashboard data grid | Dense, compact variant for analytics dashboards | UUPM app-interface (MIT) |

**Norm** (≥4 systems agree): `<table>` with `<thead>`/`<tbody>`; `scope="col"` on all `<th>`; `aria-sort` on sortable columns.
**Diverge**: Carbon uses `role="grid"` by default for keyboard cell navigation; Polaris uses `role="table"` for read-only display.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Alternating row colors or border separators | — |
| row-hover | pointer over row | Subtle row highlight (4% overlay) | — |
| row-selected | checkbox checked | Row highlight; checkbox filled | `aria-selected="true"` on `<tr>` |
| header-sort-asc | sort click | Arrow indicator up; column highlight | `aria-sort="ascending"` on `<th>` |
| header-sort-desc | sort click again | Arrow indicator down | `aria-sort="descending"` on `<th>` |
| header-sort-none | default or reset | No indicator | `aria-sort="none"` on sortable `<th>` |
| header-focus | keyboard focus on sortable `<th>` | 2px focus-visible ring | — |
| loading | data fetch | Skeleton rows or spinner overlay | `aria-busy="true"` on table or container |
| empty | no results | Empty state illustration + message | — |

---

## Sizing & Spacing

| Density | Row height | Cell padding H | Cell padding V | Font |
|---------|------------|----------------|----------------|------|
| compact | 32px | 12px | 4px | 13px |
| default | 48px | 16px | 12px | 14px |
| comfortable | 56px | 20px | 16px | 14px |

**Norm**: 48px default row height (Carbon, Atlassian, Ant). Column min-width 80px; text columns flexible.
Virtualise rows when `rowCount > 200`; use TanStack Virtual or react-virtual.

---

## Typography

- Column header: body-sm or label-sm (12–13px), weight 600, `color: --text-secondary`
- Cell text: body-sm (13–14px), weight 400
- Numeric cells: `font-variant-numeric: tabular-nums` — column values align on decimal point
- Truncation: `text-overflow: ellipsis` on cells with `max-width`; tooltip reveals full value on hover

Cross-link: `reference/typography.md` — tabular-nums, body-sm

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `table` (static) or `grid` (interactive)
> **Required attributes**: `scope="col"` on all `<th>` headers; `aria-sort` on sortable columns; `aria-selected="true"` on selected `<tr>`; `<caption>` or `aria-label` on `<table>`

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/grid/ — W3C — 2024*

| Key | Action (role="grid") |
|-----|---------------------|
| ArrowRight | Moves focus to next cell in row |
| ArrowLeft | Moves focus to previous cell in row |
| ArrowDown | Moves focus to same cell in next row |
| ArrowUp | Moves focus to same cell in previous row |
| Home | Moves focus to first cell in row |
| End | Moves focus to last cell in row |
| Ctrl+Home | Moves focus to first cell in grid |
| Ctrl+End | Moves focus to last cell in grid |
| Enter / Space | Activates cell widget (checkbox, link, button) |
| Tab | Moves focus out of grid to next component |

### Accessibility Rules

- ALL `<th>` column headers MUST have `scope="col"` — missing scope breaks AT table navigation
- Sortable `<th>` elements MUST have `aria-sort` with value `ascending`, `descending`, or `none`
- Selected rows MUST use `aria-selected="true"` on `<tr>` — CSS class alone is invisible to AT
- `<table>` MUST have a `<caption>` or `aria-label` to announce the table's purpose
- The responsive scroll wrapper MUST have `tabindex="0"` so keyboard users can scroll horizontally
- `role="grid"` enables cell-level arrow-key navigation; use only when cells contain interactive controls

Cross-link: `reference/accessibility.md` — table semantics, grid pattern

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Row hover highlight | 80ms | ease-out | Background color only |
| Row select | 100ms | ease-out | Checkbox + row color |
| Sort indicator change | 120ms | ease-out | Arrow direction transition |
| Expandable row open | 150ms | ease-out | Height expand |
| Skeleton shimmer | 1500ms | linear loop | Loading placeholder |

**BAN**: Do not animate `width` on table columns — causes full table relayout on every frame.

Cross-link: `reference/motion.md` — layout-affecting transitions, skeleton shimmer

---

## Do / Don't

### Do
- Add `scope="col"` to every `<th>` — screen readers use this to announce column context *(WAI-ARIA, Carbon)*
- Use `aria-sort` on sortable headers — not just a visual arrow icon *(Carbon, Polaris, Atlassian)*
- Use `tabindex="0"` on horizontal scroll wrapper for keyboard accessibility *(WCAG 2.1.1)*
- Virtualise rows at > 200 items — prevents browser paint lag *(Carbon, Ant)*

### Don't
- Don't build a "table" with `<div>` elements and no ARIA grid roles — invisible to AT *(WCAG 1.3.1)*
- Don't use `aria-sort` on non-sortable columns — misleads users into clicking non-interactive headers *(WAI-ARIA)*
- Don't place `overflow-x: auto` on `<table>` directly — wrap in a `<div>` with `tabindex="0"` *(WCAG 2.1.1)*
- Don't use `display: contents` on `<thead>/<tbody>/<tr>` — breaks AT table parsing *(WCAG 1.3.1)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-04 | `transition: all` on table cells — `reference/anti-patterns.md#ban-04` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| scope="col" on all th headers | WAI-ARIA, Carbon DataTable, Polaris |
| aria-sort on sortable columns | WAI-ARIA APG grid pattern, Carbon, Atlassian |
| aria-selected="true" on selected rows | WAI-ARIA APG, Carbon, Ant |
| role="grid" for interactive cell navigation | WAI-ARIA APG, Carbon |
| Virtualise at > 200 rows | Carbon, Ant (TanStack Virtual recommendation) |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# <th> missing scope attribute
grep -rn '<th' src/ | grep -v 'scope='

# Sortable column missing aria-sort
grep -rn 'sortable\|sort-header\|on.*sort' src/ | grep '<th' | grep -v 'aria-sort'

# Selected row missing aria-selected
grep -rn 'row.*selected\|selected.*row\|isSelected' src/ | grep '<tr' | grep -v 'aria-selected'

# Table built with divs (no semantic markup)
grep -rn 'class.*table\|data-table' src/ | grep '<div' | grep -v 'role="table"\|role="grid"'
```

---

## Failing Example

```html
<!-- BAD: <div> table with no semantic markup and no ARIA grid roles -->
<div class="data-table">
  <div class="table-header">
    <div class="col-header" onclick="sortByName()">Name</div>  <!-- no aria-sort -->
    <div class="col-header">Status</div>
    <div class="col-header">Amount</div>
  </div>
  <div class="table-row selected">  <!-- no aria-selected -->
    <div class="cell">Alice Chen</div>
    <div class="cell">Active</div>
    <div class="cell">$1,200.00</div>
  </div>
</div>
```

**Why it fails**: No `<table>/<thead>/<tbody>/<th>/<td>` semantics; no `scope="col"` on headers; no `aria-sort` on sortable column; `selected` row uses CSS class without `aria-selected="true"`; screen readers cannot navigate by row/column; no caption/label.
**Grep detection**: `grep -rn 'data-table\|table.*container' src/ | grep '<div' | grep -v 'role='`
**Fix**: Replace with semantic `<table>` and `<th scope="col">` headers; add `aria-sort` to sortable headers; add `aria-selected="true"` to selected `<tr>`; add `<caption>` describing the table.
