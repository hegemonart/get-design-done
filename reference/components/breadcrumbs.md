# Breadcrumbs — Benchmark Spec

**Harvested from**: WAI-ARIA APG, Carbon, Polaris, Material 3, Atlassian
**Wave**: 4 · **Category**: Navigation

---

## Purpose

A breadcrumb trail shows a user's location within a hierarchical navigation structure, providing a supplemental path back to any ancestor page. It is not primary navigation — the current page is always the last item and is never a link. Breadcrumbs are most valuable in deep hierarchies (> 2 levels) and information-dense applications. *(WAI-ARIA APG breadcrumb pattern, Carbon, Polaris, Material 3, Atlassian all define breadcrumb as a supplemental location indicator)*

---

## Anatomy

```
<nav aria-label="Breadcrumb">
  <ol role="list">
    <li><a href="/">Home</a></li>
    <li><span aria-hidden="true">›</span><a href="/products">Products</a></li>
    <li><span aria-hidden="true">›</span><span aria-current="page">Widget Pro</span></li>
  </ol>
</nav>
```

| Part | Required | Notes |
|------|----------|-------|
| `<nav>` container | Yes | `role="navigation"` + `aria-label="Breadcrumb"` |
| `<ol>` list | Yes | Ordered list — sequence matters |
| `<li>` items | Yes | One per level in the path |
| Ancestor links | Yes | `<a href>` pointing to each ancestor URL |
| Current page | Yes | Plain text `<span>` (not a link) + `aria-current="page"` |
| Separator | Yes | `aria-hidden="true"` character or SVG icon; never in link text |
| Ellipsis (deep paths) | No | Truncate middle items at > 4 levels; always keep first + last 2 |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default | Inline trail, all items visible | All systems |
| Collapsed / truncated | Middle items replaced by "…" at > 4 levels | Carbon, Polaris, Atlassian |
| With icons | Leading icon per item (folder/page icon) | Material 3, Atlassian |
| Large / heading-inline | Larger type, sits beside or below a page title | Polaris, Atlassian |

**Norm** (≥4 systems agree): separator is `aria-hidden`; current page uses `aria-current="page"`; last item is never a link.
**Diverge**: Polaris uses `>` as separator; Carbon uses `/`; Material 3 uses `›` (chevron). All are acceptable — choose to match your product's visual language.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Ancestor links + muted separator + current page text | — |
| link-hover | pointer over ancestor | Underline or color shift | — |
| link-focus | keyboard focus on ancestor | 2px focus-visible ring | — |
| current | — | No underline; muted or bold treatment; not clickable | `aria-current="page"` |
| truncated | path > 4 levels | Middle items hidden; "…" button shown | `aria-label="Show full path"` on ellipsis button |

---

## Sizing & Spacing

| Element | Value | Notes |
|---------|-------|-------|
| Item font size | 13–14px (body-sm) | Smaller than page headings; supplemental context |
| Item height | 24–32px | Allow for comfortable touch targets on mobile |
| Separator spacing | 4–8px H padding each side | Optical breathing room |
| Max visible levels | 4 | Truncate middle items beyond 4 levels |
| Truncation rule | Keep: first + last 2 items | Never truncate the current page or the root |

**Norm**: 13–14px font size (Carbon, Polaris, Atlassian); items on a single line; no wrapping.

---

## Typography

- Ancestor links: body-sm, weight 400, `color: --text-link`; underline on hover
- Current page: body-sm, weight 500 or 600 (bold for emphasis), `color: --text-primary`; no underline
- Separator: body-sm, `color: --text-subtle`, `aria-hidden="true"`
- Do not use uppercase or letter-spacing on breadcrumb items — they should read as natural path segments

Cross-link: `reference/typography.md` — body-sm, link color tokens

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `navigation` (container)
> **Required attributes**: `aria-label="Breadcrumb"` on `<nav>`; `aria-current="page"` on last item; `aria-hidden="true"` on separators

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Moves focus to next focusable link in the breadcrumb trail |
| Shift+Tab | Moves focus to previous link |
| Enter | Activates the focused link (navigates to ancestor) |

### Accessibility Rules

- `aria-current="page"` MUST be on the last item (current page) — this is the primary AT signal
- Separators MUST be `aria-hidden="true"` — screen readers should announce "Home, Products, Widget Pro" not "Home › Products › Widget Pro"
- The current page item MUST NOT be a link — it is the user's current location
- `<ol>` conveys that order matters; do not use `<ul>` or a `<div>` list
- `aria-label="Breadcrumb"` distinguishes this nav from primary/secondary navigation landmarks

Cross-link: `reference/accessibility.md` — aria-current, landmark labelling

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Ellipsis expand | 150ms | ease-out | Reveal hidden items inline |
| Ellipsis collapse | 120ms | ease-in | Hide middle items |

**BAN**: Do not animate the breadcrumb trail on route change — route transitions are the page's responsibility, not the breadcrumb's.

Cross-link: `reference/motion.md` — layout transitions

---

## Do / Don't

### Do
- Use `<ol>` for the list — order is meaningful in a hierarchical path *(WAI-ARIA APG)*
- Mark the current page with `aria-current="page"` — not just a CSS class *(WAI-ARIA APG, Atlassian)*
- Hide separators with `aria-hidden="true"` *(WAI-ARIA APG, Carbon, Polaris)*
- Truncate middle items (not first/last) when path exceeds 4 levels *(Carbon, Polaris, Atlassian)*

### Don't
- Don't make the current page item a link — it creates a circular self-referential link *(WAI-ARIA APG)*
- Don't include separator text inside link labels — `aria-hidden` the separator element, not the link *(WAI-ARIA APG)*
- Don't use breadcrumbs as the only navigation method — they supplement; primary nav is required *(Material 3, Polaris)*
- Don't truncate the root or current page items — users need anchoring context at both ends *(Carbon, Atlassian)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-07 | Missing `aria-current` on active navigation items — `reference/anti-patterns.md#ban-07` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| aria-label="Breadcrumb" on nav container | WAI-ARIA APG breadcrumb pattern |
| Separator must be aria-hidden | WAI-ARIA APG, Carbon, Polaris, Atlassian |
| Last item not a link + aria-current="page" | WAI-ARIA APG, Carbon, Polaris, Material 3 |
| Ordered list (`<ol>`) for hierarchy | WAI-ARIA APG |
| Truncate middle at > 4 levels | Carbon, Polaris, Atlassian |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Last breadcrumb item is a link (should be plain text with aria-current)
grep -rn 'breadcrumb\|bread-crumb' src/ | grep -v 'aria-current="page"'

# Separator not aria-hidden
grep -rn 'breadcrumb' src/ | grep '›\|/\|>\|chevron' | grep -v 'aria-hidden'

# Using <ul> instead of <ol> for breadcrumb
grep -rn 'breadcrumb' src/ | grep '<ul'

# nav container missing aria-label
grep -rn 'breadcrumb' src/ | grep '<nav' | grep -v 'aria-label'
```

---

## Failing Example

```html
<!-- BAD: all items are links including the current page, separators not hidden -->
<nav>  <!-- missing aria-label="Breadcrumb" -->
  <a href="/">Home</a> /
  <a href="/products">Products</a> /
  <a href="/products/widget-pro">Widget Pro</a>  <!-- should NOT be a link; no aria-current -->
</nav>
```

**Why it fails**: Current page is a link (circular/confusing); separators `/` are announced by screen readers; `<nav>` has no label; no `aria-current="page"` to signal location to AT users; no `<ol>/<li>` structure loses hierarchy semantics.
**Grep detection**: `grep -rn 'breadcrumb' src/ | grep -v 'aria-current'`
**Fix**: Replace last `<a>` with `<span aria-current="page">Widget Pro</span>`; wrap separators in `<span aria-hidden="true">/</span>`; add `aria-label="Breadcrumb"` to `<nav>`; wrap items in `<ol><li>`.
