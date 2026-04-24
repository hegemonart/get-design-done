# Navbar (Top Navigation Bar) — Benchmark Spec

**Harvested from**: Material 3, Carbon, Polaris, Atlassian, Primer, UUPM (app-interface, MIT)
**Wave**: 4 · **Category**: Navigation

---

## Purpose

A navbar is the primary horizontal navigation surface at the top of an application. It houses the logo/home link, primary navigation destinations, and secondary actions (search, notifications, profile). It communicates the application's identity and provides always-visible wayfinding. Differs from a Sidebar (vertical, secondary nav) and Breadcrumb (trail-based context). *(Material 3, Carbon, Polaris, Atlassian agree: top navbar = primary navigation + brand identity)*

---

## Anatomy

```
┌──────────────────────────────────────────────────────┐  role="banner"
│ [Skip to main]  (visually hidden, focus-visible)     │
│ [Logo/Home] | Nav Item · Nav Item · Nav Item | [🔍][👤]│  role="navigation" aria-label="Primary"
└──────────────────────────────────────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| `<header>` wrapper | Yes | `role="banner"` — one per page |
| `<nav>` | Yes | `role="navigation"` + `aria-label="Primary"` |
| Skip-to-main link | Yes | First focusable element; `href="#main-content"`; visible on focus |
| Logo / home link | Yes | `<a href="/">` with `aria-label="[App name] home"` |
| Nav items | Yes | `<a>` for routing; `aria-current="page"` on active item |
| Secondary actions | No | Icon buttons (search, notifications, profile) |
| Hamburger button | Conditional | Mobile only; `aria-expanded` + `aria-controls` |
| Scroll shadow | No | `box-shadow` appears on scroll > 0px |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default / static | Fixed in document flow; scrolls with page | Carbon, Polaris |
| Sticky / fixed | `position: sticky` or `fixed`; stays at top on scroll | Material 3, Atlassian, Primer |
| Transparent hero | Transparent over hero image; becomes opaque on scroll | Material 3, Polaris |
| Compact / dense | Reduced height (48px) for data-heavy apps | Carbon, UUPM app-interface |
| Dashboard navbar | App-switcher + user avatar + notifications | UUPM app-interface (MIT) |
| Settings navbar | Breadcrumb-style subtitle below app name | UUPM app-interface (MIT) |

**Norm** (≥4 systems agree): 56–64px height; logo left-aligned; secondary actions right-aligned.
**Diverge**: Material 3 distinguishes "Top app bar" (mobile) from "Navigation bar" (desktop) as separate components; other systems use a single responsive navbar.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Full nav visible, no shadow | — |
| scrolled | scroll > 0 | `box-shadow` bottom border appears | — |
| nav-item-hover | pointer over item | underline or bg highlight | — |
| nav-item-focus | keyboard focus | 2px focus-visible ring | — |
| nav-item-active | current route | `font-weight: 600` + indicator underline or pill | `aria-current="page"` |
| mobile-collapsed | viewport < breakpoint | Nav items hidden; hamburger visible | `aria-expanded="false"` on hamburger |
| mobile-expanded | hamburger activated | Nav items shown as vertical list | `aria-expanded="true"` on hamburger |

---

## Sizing & Spacing

| Size | Height | Logo H | Item padding H | Font |
|------|--------|--------|----------------|------|
| compact | 48px | 24px | 12px | 13px/500 |
| default | 56px | 28px | 16px | 14px/500 |
| comfortable | 64px | 32px | 20px | 15px/500 |

**Norm**: 56px default height (Material 3, Carbon, Polaris, Atlassian all converge here).
Mobile breakpoint: collapse at ≤768px (Carbon, Polaris); ≤960px for complex navbars (Atlassian).

---

## Typography

- Nav item labels: body-sm to body-md (13–15px), weight 500 for active, 400 for inactive
- Active item visual distinction must not rely on color alone (add font-weight or underline indicator)
- Secondary action icons: 20px, with `aria-label` on each button
- Skip link text: `body-sm`, matches surrounding text — it only needs to be visible on focus

Cross-link: `reference/typography.md` — body scale, weight tokens

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `banner` (header), `navigation` (nav)
> **Required attributes**: `aria-label="Primary"` on `<nav>`; `aria-current="page"` on active item; `aria-expanded` + `aria-controls` on hamburger

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/landmark-regions/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Moves focus through focusable nav elements in DOM order |
| Shift+Tab | Moves focus backwards |
| Enter / Space | Activates focused link or button |
| Escape | Closes mobile expanded menu; returns focus to hamburger |

### Accessibility Rules

- `<nav>` MUST have `aria-label="Primary"` — multiple `<nav>` landmarks on a page must all be distinctly labelled
- Skip-to-main link MUST be the first focusable element on the page — keyboard users need to bypass repetitive nav
- Active nav item MUST use `aria-current="page"` — color alone is insufficient for AT users
- Hamburger button MUST have `aria-expanded` and `aria-controls` — AT users need to know the nav state
- `role="banner"` MUST appear only once per page (one `<header>` at page level)

Cross-link: `reference/accessibility.md` — landmark regions, skip navigation

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Scroll shadow appear | 150ms | ease-out | `box-shadow` opacity only |
| Mobile menu open | 200ms | ease-out | Height expand or slide-down |
| Mobile menu close | 150ms | ease-in | Collapse |
| Transparent → opaque on scroll | 200ms | ease-out | Background-color transition |

**BAN**: Animating navbar height on scroll — causes layout reflow and jank on every scroll event.

Cross-link: `reference/motion.md` — layout-affecting transitions

---

## Do / Don't

### Do
- Include a visible skip-to-main link as the first focusable element *(WCAG 2.4.1, Carbon, Polaris)*
- Label `<nav>` with `aria-label="Primary"` *(WAI-ARIA APG landmark regions)*
- Use `aria-current="page"` on the active nav item *(WAI-ARIA, Atlassian)*
- Manage z-index explicitly on sticky navbars to prevent overlap issues *(Material 3, Carbon)*

### Don't
- Don't use multiple unlabelled `<nav>` landmarks — screen reader users can't distinguish them *(WCAG 4.1.2)*
- Don't rely on color alone to indicate the active nav item *(WCAG 1.4.1)*
- Don't put more than 7 primary nav items — overwhelming and hard to scan *(Carbon, Polaris HIG)*
- Don't use `position: fixed` on mobile without accounting for virtual keyboard displacement

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-04 | `transition: all` on interactive elements — `reference/anti-patterns.md#ban-04` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| role="banner" on outer header | WAI-ARIA APG landmark regions |
| aria-label="Primary" required on nav | WAI-ARIA APG, WCAG 4.1.2 |
| Skip-to-main as first focusable element | WCAG 2.4.1, Carbon, Polaris |
| aria-current="page" on active item | WAI-ARIA APG, Atlassian, Primer |
| 56px default navbar height | Material 3, Carbon, Polaris, Atlassian |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# nav element missing aria-label
grep -rn '<nav' src/ | grep -v 'aria-label\|aria-labelledby'

# Active nav item missing aria-current
grep -rn 'active\|current\|selected' src/ | grep -i 'nav.*item\|navitem\|nav-link' | grep -v 'aria-current'

# Missing skip link
grep -rn 'skip.*main\|skip.*content\|skipnav' src/ | grep -v 'href'
# If the above returns nothing, no skip link exists
grep -rn 'id="main\|id="main-content"' src/ | head -5

# Multiple unlabelled nav landmarks
grep -rn '<nav' src/ | grep -v 'aria-label\|aria-labelledby'
```

---

## Failing Example

```html
<!-- BAD: multiple <nav> elements without aria-label -->
<header>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact" class="active">Contact</a>  <!-- no aria-current -->
  </nav>
</header>
<aside>
  <nav>  <!-- second nav, also unlabelled — ambiguous for AT users -->
    <a href="/settings">Settings</a>
  </nav>
</aside>
```

**Why it fails**: Screen readers announce "navigation" twice with no way to distinguish them; active state relies on CSS class only (not `aria-current="page"`); no skip link; `<header>` lacks landmark context.
**Grep detection**: `grep -rn '<nav' src/ | grep -v 'aria-label'`
**Fix**: Add `aria-label="Primary"` and `aria-label="Secondary"` to each `<nav>`; add `aria-current="page"` to active link; add skip link as first child of `<header>`.
