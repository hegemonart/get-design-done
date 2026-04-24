# Skeleton — Benchmark Spec

**Harvested from**: Polaris, Carbon, Atlassian, Mantine
**Wave**: 3 · **Category**: Feedback

---

## Purpose

A skeleton screen is a loading placeholder that mirrors the shape of the content it will replace — text lines, images, cards, avatars. It reduces perceived wait time by showing the structural layout before real data arrives, preventing the jarring reflow that occurs when content suddenly appears. Use skeleton when the content shape is known; use an indeterminate spinner or progress bar when shape is unknown. *(Polaris, Carbon, Atlassian, Mantine agree: skeleton = shape-matched placeholder, not generic spinner)*

---

## Anatomy

```
┌──────────────────────────────────┐
│  ████ (avatar-circle, 40px)      │  ← aria-hidden="true"
│  ██████████████████ (text-line)  │
│  █████████████ (text-line 75%)   │
│  ████████████████████ (text-line)│
└──────────────────────────────────┘
↑ container: aria-busy="true" aria-label="Loading…"
```

| Part | Required | Notes |
|------|----------|-------|
| Container | Yes | `aria-busy="true"` + `aria-label="Loading…"` or `aria-labelledby` |
| Skeleton elements | Yes | `aria-hidden="true"` on each shape element |
| Text-line shape | No | Width 60–90% (varied) to mimic text flow |
| Image/card block | No | Fixed aspect-ratio; fills the same space as the loaded image |
| Avatar circle | No | Circular shape; diameter matches the final avatar size |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Text lines | One or more lines at varying widths (60–90%) | All |
| Image block | Rectangular/aspect-ratio shape for images | Polaris, Carbon, Mantine |
| Avatar | Circular placeholder at avatar diameter | Polaris, Atlassian, Mantine |
| Card | Full card-sized block with text-line children | All |
| Table row | Row-shaped block with column-width children | Carbon, Mantine |

**Norm** (≥4/18 systems agree): shimmer animation (left-to-right gradient sweep); vary text-line widths 60–90%; `aria-hidden` on skeleton elements; `aria-busy` on container.
**Diverge**: Polaris renders skeleton as named sub-components (`SkeletonBodyText`, `SkeletonDisplayText`); Carbon uses CSS class modifiers; Mantine uses a generic `Skeleton` with width/height props; Atlassian uses a shape prop.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| loading | data fetch in progress | Shimmer animation looping | `aria-busy="true"` on container |
| loaded | data resolves | Skeleton removed, real content appears | `aria-busy="false"` or remove attr |

---

## Sizing & Spacing

| Shape | Default sizing | Notes |
|-------|----------------|-------|
| Text-line | 16px height | Matches body line-height slot |
| Text-line (heading) | 24–28px height | Matches h2/h3 slot |
| Avatar | Match target avatar diameter | 32px, 40px, 48px common |
| Image block | Match target image aspect ratio | 16:9, 1:1, 4:3 common |
| Gap between text lines | 8px | Matches body line-height rhythm |

**Norm**: Match exact pixel dimensions of the content being replaced — layout shift score is zero when skeleton matches final content size *(Polaris, Mantine)*.

---

## Typography

Skeleton shapes are purely visual — no typography content. However:
- Text-line height should match the `line-height` of the real text it replaces
- Heading skeleton height should match the heading's `font-size` + leading
- Do NOT use placeholder text ("Loading…") inside skeleton shapes — use `aria-label` on the container instead

Cross-link: `reference/typography.md` — line-height scale for matching skeleton dimensions

---

## Keyboard & Accessibility

> **WAI-ARIA role**: no role on skeleton shapes; container uses `aria-busy`
> **Required attributes**: `aria-hidden="true"` on each skeleton element; `aria-busy="true"` + `aria-label="Loading…"` on container

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/ — W3C — 2024*

| Key | Action |
|-----|--------|
| (none) | Skeleton shapes are not interactive; no keyboard interaction |

Skeleton elements must not receive focus. The container is not focusable unless it wraps focusable content that appears after loading.

### Accessibility Rules

- Every skeleton shape element MUST have `aria-hidden="true"` — blank shapes announced by screen readers ("image", "text") confuse users *(Polaris, Carbon)*
- The container MUST have `aria-busy="true"` while loading, set to `false` (or removed) when content appears *(WAI-ARIA APG)*
- The container MUST have `aria-label="Loading…"` or equivalent — this is what screen readers announce while `aria-busy="true"` *(WAI-ARIA APG)*
- Do NOT use skeleton as the only loading indicator for screen reader users — announce loading state via live region if the transition is programmatic *(Carbon)*
- Shimmer animation MUST be suppressed under `prefers-reduced-motion` — use static fill instead *(WCAG 2.3.3)*

Cross-link: `reference/accessibility.md` — `aria-busy`, `prefers-reduced-motion`

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Shimmer sweep | 1.5s | ease-in-out | 130° gradient: transparent → surface-highlight → transparent |
| Loop delay | 0.5s | — | Pause between sweeps to avoid strobing |
| Skeleton → content | 200ms | ease-out | Fade-in real content over skeleton |

Shimmer gradient direction: 130 degrees (roughly top-left to bottom-right) — matches natural reading direction.
Background: `surface-variant` token (slightly darker than background surface, lighter than border).

**BAN**: High-contrast shimmer (e.g. white → gray on dark) — too visually noisy. Do NOT use spinner animation inside a skeleton shape. Under `prefers-reduced-motion`, remove the sweep entirely and use static fill.

Cross-link: `reference/motion.md` — `prefers-reduced-motion`: static fill, no gradient sweep

---

## Do / Don't

### Do
- Match skeleton dimensions exactly to target content to avoid layout shift *(Polaris, Mantine)*
- Vary text-line widths 60–90% to simulate natural text flow *(Carbon, Atlassian)*
- Set `aria-hidden="true"` on every skeleton shape element *(WAI-ARIA APG, Polaris)*
- Set `aria-busy="true"` + `aria-label="Loading…"` on the container *(WAI-ARIA APG)*

### Don't
- Don't use a spinner when content shape is known — skeleton is always preferred for layout-bearing slots *(Carbon, Polaris)*
- Don't use strong contrast for shimmer — use `surface-variant` (low contrast) *(Atlassian, Mantine)*
- Don't animate shimmer under `prefers-reduced-motion` — use static fill *(WCAG 2.3.3)*
- Don't add visible "Loading…" text inside skeleton shapes — put it on the container via `aria-label` *(Carbon)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Spinner used when content shape is known | `reference/anti-patterns.md#ban-spinner-overuse` |
| Missing aria-hidden on visual-only elements | `reference/anti-patterns.md#ban-aria-hidden` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| aria-hidden="true" on skeleton shapes | WAI-ARIA APG, Polaris, Carbon |
| aria-busy="true" on container | WAI-ARIA APG |
| Text-line widths 60–90% varied | Carbon, Atlassian, Mantine |
| Shimmer 130° gradient sweep 1.5s | Polaris, Mantine |
| Suppress shimmer under prefers-reduced-motion | WCAG 2.3.3 |
| Match exact target dimensions to prevent layout shift | Polaris, Mantine |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Skeleton shapes missing aria-hidden
grep -rn 'skeleton\|Skeleton' src/ | grep -v 'aria-hidden="true"' | grep -v 'aria-busy\|container'

# Skeleton container missing aria-busy
grep -rn 'skeleton\|Skeleton' src/ | grep 'container\|wrapper\|section' | grep -v 'aria-busy'

# Shimmer animation without prefers-reduced-motion guard
grep -rn 'shimmer\|skeleton.*animation\|@keyframes.*skeleton' src/ | grep -v 'prefers-reduced-motion'
```

---

## Failing Example

```html
<!-- BAD: skeleton shapes with no aria-hidden, container with no aria-busy -->
<div class="card-skeleton">
  <div class="skeleton-avatar"></div>
  <div class="skeleton-line skeleton-line--80"></div>
  <div class="skeleton-line skeleton-line--60"></div>
</div>
```

**Why it fails**: Screen readers traverse the skeleton shapes and announce them as empty elements ("image", unlabeled regions). There is no `aria-busy="true"` to signal a loading state. No `aria-label` tells the user what is loading. When content loads, no `aria-busy="false"` transition signals completion.
**Grep detection**: `grep -rn 'skeleton' src/ | grep -v 'aria-hidden\|aria-busy'`
**Fix**: Add `aria-busy="true" aria-label="Loading card content"` to the container; add `aria-hidden="true"` to every skeleton child shape.
