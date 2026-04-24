# Progress — Benchmark Spec

**Harvested from**: Material 3, Carbon (ProgressIndicator), Polaris, Mantine
**Wave**: 3 · **Category**: Feedback

---

## Purpose

A progress indicator communicates the status of an ongoing operation. Determinate variants show a known percentage of completion (0–100%); indeterminate variants signal ongoing work when duration is unknown. Linear bars are suited to step-based or file-based progress; circular (spinner-ring) variants are suited to inline or compact contexts. *(Material 3, Carbon, Polaris, Mantine agree: separate determinate vs. indeterminate; linear vs. circular)*

---

## Anatomy

**Linear**
```
[track ──────────────────────────────────]
[fill ◼◼◼◼◼◼◼◼◼◼◼◼◼◼·····················]
      ↑ role="progressbar" aria-valuenow="45"
```

**Circular**
```
    ╭──╮
   ╭    ╮
   ╰    ╯ ← SVG stroke-dashoffset ring
    ╰──╯
  role="progressbar"
```

| Part | Required | Notes |
|------|----------|-------|
| Track | Yes | Background rail (linear) or ring background (circular) |
| Fill / indicator | Yes | Foreground showing progress amount |
| Label (visually hidden ok) | Yes | `aria-label` or `aria-labelledby` — describes what is loading |
| Value text | No | Rendered percentage (e.g. "45%") — supplement to ARIA value |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Linear determinate | Bar fills left-to-right proportionally | Material 3, Carbon, Polaris, Mantine |
| Linear indeterminate | Bar animates in loop (shimmer or sweep) | Material 3, Carbon, Polaris, Mantine |
| Circular determinate | SVG ring fills by stroke-dashoffset | Material 3, Carbon, Mantine |
| Circular indeterminate | SVG ring rotates in loop | Material 3, Carbon, Mantine |

**Norm** (≥4/18 systems agree): `role="progressbar"` on all variants; `aria-valuenow` only on determinate; `aria-valuemin=0` + `aria-valuemax=100` always.
**Diverge**: Polaris calls the circular variant "Spinner" (single indeterminate state only); Material 3 distinguishes "linear progress indicator" and "circular progress indicator" as separate component families; Carbon offers multi-step linear progress ("ProgressStep") as a distinct component.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| determinate (0–100%) | known progress value | Fill width/stroke = percentage | `aria-valuenow={n}` |
| indeterminate | unknown duration | Looping animation | `aria-valuetext="Loading"` |
| complete | value reaches 100% | Full fill; brief hold before removal | `aria-valuenow="100"` |
| paused | operation suspended | Static fill; muted color | `aria-valuetext="Paused"` |

---

## Sizing & Spacing

**Linear**

| Size | Height | Notes |
|------|--------|-------|
| sm | 4px (default) | Decorative; thin above content |
| md | 8px | Accessible minimum — recommended when bar is the primary indicator |
| lg | 12px | High-emphasis; file upload, step progress |

**Circular**

| Size | Diameter | Stroke width | Notes |
|------|----------|-------------|-------|
| sm | 20px | 2px | Inline within text/button |
| md | 32px | 3px | Component-level loading |
| lg | 48px | 4px | Page/section loading |

**Norm**: 4px linear height default (Material 3); 8px recommended for standalone accessibility *(Carbon)*; circular diameter 20–48px *(Material 3, Mantine)*.

---

## Typography

- Value label (if shown): numeric-sm (12px/tabular-nums) — percentage readability
- Associated label (if visible): body-sm (14px/400) — describes what is loading
- Do not truncate the associated label; use a visually-hidden version if space is constrained

Cross-link: `reference/typography.md` — tabular-nums for percentage values

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `progressbar`
> **Required attributes**: `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label` or `aria-labelledby`; `aria-valuenow` on determinate only

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/meter/ — W3C — 2024*

| Key | Action |
|-----|--------|
| (none) | Progress bar is not interactive; no keyboard interaction required |

Progress indicators are read-only status elements. They receive no keyboard focus unless embedded in a larger focusable region.

### Accessibility Rules

- `aria-label` or `aria-labelledby` MUST describe what is loading (e.g. "Uploading file", "Loading results") — a bare `role="progressbar"` with no label is announced as empty *(WAI-ARIA APG)*
- Determinate bars MUST include `aria-valuenow` matching the current integer percentage *(WAI-ARIA APG)*
- Indeterminate bars MUST omit `aria-valuenow` and instead set `aria-valuetext="Loading"` or similar *(WAI-ARIA APG)*
- `aria-valuemin` and `aria-valuemax` MUST be present on all progress bars (default 0 and 100)
- Indeterminate animation MUST respect `prefers-reduced-motion` — reduce to opacity pulse or static indicator *(WCAG 2.3.3)*
- Color contrast of fill vs. track MUST meet 3:1 minimum for non-text UI components *(WCAG 1.4.11)*

Cross-link: `reference/accessibility.md` — `prefers-reduced-motion`, WCAG 1.4.11

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Determinate fill advance | 300ms | ease-out | Smooth value update on change |
| Indeterminate linear sweep | 1.2s | ease-in-out | Infinite loop; reverse direction at 50% |
| Circular spin | 1.2s | linear | Single full rotation per cycle |
| Complete → remove | 400ms | ease-in | Brief hold at 100% then fade/collapse |

**BAN**: Bouncing or elasticity on indeterminate loop — communicates false progress rhythm. Do not use `transition: all` (catches color changes during theme swap).

Cross-link: `reference/motion.md` — `prefers-reduced-motion`: replace sweep with opacity 0.5→1 pulse

---

## Do / Don't

### Do
- Always provide `aria-label` describing what is loading *(WAI-ARIA APG)*
- Use `aria-valuenow` on determinate variants and omit on indeterminate *(WAI-ARIA APG)*
- Use 8px+ height for standalone linear bars — 4px bars lack sufficient touch and visual target *(Carbon)*
- Transition fill smoothly (300ms ease-out) when value updates *(Material 3, Mantine)*

### Don't
- Don't use `aria-valuenow` on indeterminate bars — it implies a known value *(WAI-ARIA APG)*
- Don't show a spinner (circular indeterminate) when content shape is known — use Skeleton instead *(Carbon, Polaris)*
- Don't remove the progress bar the instant it hits 100% — hold briefly so the completion is registered *(Material 3)*
- Don't animate with infinite bounce — implies bouncing progress rhythm *(Carbon, Mantine)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Indeterminate bar with aria-valuenow | `reference/anti-patterns.md#ban-aria-value` |
| Spinner used when content shape is known | `reference/anti-patterns.md#ban-spinner-overuse` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| role="progressbar" on all variants | WAI-ARIA APG |
| aria-valuenow only on determinate | WAI-ARIA APG, Material 3, Carbon |
| aria-label required (what is loading) | WAI-ARIA APG |
| 8px accessible minimum height | Carbon |
| 1.2s animation loop duration | Material 3, Mantine |
| Respect prefers-reduced-motion | WCAG 2.3.3 |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Progress bar missing aria-label or aria-labelledby
grep -rn 'role="progressbar"' src/ | grep -v 'aria-label\|aria-labelledby'

# Determinate progress missing aria-valuenow
grep -rn 'role="progressbar"' src/ | grep -v 'aria-valuenow\|indeterminate'

# Progress missing valuemin/valuemax
grep -rn 'role="progressbar"' src/ | grep -v 'aria-valuemin\|aria-valuemax'

# Indeterminate with aria-valuenow (invalid pattern)
grep -rn 'indeterminate' src/ | grep 'aria-valuenow'
```

---

## Failing Example

```html
<!-- BAD: progress bar with no accessible label and no value attributes -->
<div class="progress-bar">
  <div class="progress-bar__fill" style="width: 45%"></div>
</div>
```

**Why it fails**: No `role="progressbar"` so screen readers do not recognize this as a progress indicator. No `aria-label` so there is no description of what is loading. No `aria-valuenow`, `aria-valuemin`, or `aria-valuemax` so screen readers cannot read the percentage even if the role were present.
**Grep detection**: `grep -rn 'progress-bar\|progressBar\|progress__fill' src/ | grep -v 'role="progressbar"'`
**Fix**: `<div role="progressbar" aria-valuenow="45" aria-valuemin="0" aria-valuemax="100" aria-label="Uploading file"><div style="width:45%"></div></div>`
