# Alert / Banner — Benchmark Spec

**Harvested from**: Material 3 (Banner), Carbon (InlineNotification), Polaris (Banner), Atlassian (SectionMessage)
**Wave**: 3 · **Category**: Feedback

---

## Purpose

An alert (inline notification or banner) is a persistent in-page message that communicates status, warnings, or errors relevant to the current context. Unlike Toast, it does not auto-dismiss — it remains visible until the user dismisses it or the underlying condition resolves. Use alert for messages that require acknowledgement or that must remain visible for reference. *(Material 3, Carbon, Polaris, Atlassian agree: alert = persistent inline feedback)*

---

## Anatomy

```
┌─────────────────────────────────────────────────────────┐
│ [icon]  [Title (optional)]                   [✕ dismiss?]│
│         Message text                                     │
│         [Primary action?]  [Secondary action?]           │
└─────────────────────────────────────────────────────────┘
      ↑ role="alert" (error/warning) or role="status" (info/success)
```

| Part | Required | Notes |
|------|----------|-------|
| Container | Yes | `role="alert"` or `role="status"` per severity |
| Severity icon | Yes | Visual + semantic variant indicator; never color alone |
| Message text | Yes | Concise description of status or error |
| Title | No | Recommended for error/warning; provides quick scanning |
| Primary action | No | One CTA linking to resolution (e.g. "Retry", "Review") |
| Secondary action | No | Supplemental link; lower emphasis |
| Dismiss button | No | Required when alert can be resolved by user |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Info | Blue; neutral informational message; `role="status"` polite | All |
| Success | Green; completed action confirmation; `role="status"` polite | All |
| Warning | Amber; potentially harmful condition; `role="alert"` assertive | All |
| Error | Red; failure or blocking condition; `role="alert"` assertive | All |

**Norm** (≥4/18 systems agree): four-variant semantic model (info/success/warning/error) with matching color, icon, and role. Icon is REQUIRED — color alone violates WCAG 1.4.1.
**Diverge**: Atlassian names this "SectionMessage" and omits dismiss; Carbon always includes an X; Polaris supports titled and untitled variants; Material 3 "Banner" supports one CTA only.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| visible | render | Full opacity, inline position | `role="alert"` or `role="status"` |
| hover | pointer over action | Action underline / background change | — |
| focus | keyboard on action/dismiss | focus-visible ring on button | — |
| dismissed | click dismiss button | Collapsed / removed | Removed from DOM |

---

## Sizing & Spacing

| Placement | Width | Radius | Padding |
|-----------|-------|--------|---------|
| Full-width (page/section) | 100% of container | 0px | 16px 20px |
| Inline / card-contained | fit-to-container | 6–8px | 12px 16px |

| Property | Value | Notes |
|----------|-------|-------|
| Icon size | 20px | Aligned to first line of text |
| Gap (icon → text) | 12px | |
| Min height | 48px single-line | Grows with content |

**Norm**: Full-width placement in page-level contexts; rounded corners for component-level inline placement *(Material 3, Carbon, Atlassian)*.

---

## Typography

- Title: label-md (14px/600) — gives quick scannable context for complex errors
- Message: body-sm (14px/400) — readable at inline scale
- Action: label-sm (13px/500) — matches action button label weight

Cross-link: `reference/typography.md` — body-sm, label-md definitions

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `alert` (error/warning) or `status` (info/success)
> **Required attributes**: `role` on container; icon must have `aria-hidden="true"` + text-based variant reinforcement

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/alert/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Moves focus to action buttons or dismiss button in document order |
| Enter / Space | Activates focused action or dismiss button |
| Escape | No special behavior (unlike modal); alert stays visible |

The alert container itself is not focusable. Child buttons follow standard button keyboard contract.

### Accessibility Rules

- Icon MUST be `aria-hidden="true"` — the icon is decorative reinforcement; the `role` and text carry the semantic meaning *(WCAG 1.4.1)*
- Color MUST NOT be the sole differentiator between variants — icon shape and text label must also differ *(WCAG 1.4.1)*
- `role="alert"` causes immediate assertion by screen readers — only use for error and warning severity
- `role="status"` uses a polite live region — appropriate for info and success
- Dismiss button MUST have `aria-label` (e.g. `aria-label="Dismiss warning"`) *(WAI-ARIA APG)*
- Do NOT auto-dismiss alerts — that is Toast's job; alert stays until explicitly dismissed *(Carbon, Polaris)*

Cross-link: `reference/accessibility.md` — live-regions, color-contrast sections

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Enter (height expand + fade) | 200ms | ease-out | Pushes content down; avoids position:fixed |
| Exit (height collapse + fade) | 150ms | ease-in | Content reflows up as alert closes |
| Icon entrance | 0ms | — | No animation on icon; immediate |

**BAN**: Slide-in from edge (reserve for Toast). Alert is inline — it should feel like content appearing, not a notification arriving.

Cross-link: `reference/motion.md` — `prefers-reduced-motion`: skip height animation, instant show/hide

---

## Do / Don't

### Do
- Always include an icon matching the semantic variant *(WCAG 1.4.1 — color not sole differentiator)*
- Use `role="alert"` for warning/error (assertive) and `role="status"` for info/success (polite) *(WAI-ARIA APG)*
- Keep alert visible until the condition is resolved or user dismisses *(Carbon, Polaris)*
- Use full-width for page-level alerts; rounded inline for component-level *(Material 3, Carbon)*

### Don't
- Don't auto-dismiss alerts — use Toast for transient messages *(Material 3, Carbon)*
- Don't use color alone to distinguish severity — always include an icon and text label *(WCAG 1.4.1)*
- Don't stack more than 2 alerts in the same section — consolidate into a single summary *(Polaris)*
- Don't use `role="alert"` for info/success — overly assertive announcements desensitize users *(WAI-ARIA APG)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Color as sole variant differentiator | `reference/anti-patterns.md#ban-color-only` |
| role="alert" on info/success (over-announcing) | `reference/anti-patterns.md#ban-live-region` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Icon required; color not sole differentiator | WCAG 1.4.1; Material 3, Carbon, Polaris, Atlassian |
| role="alert" for error/warning; role="status" for info/success | WAI-ARIA APG, Carbon, Polaris |
| No auto-dismiss | Material 3, Carbon, Polaris, Atlassian |
| Full-width vs. rounded inline placement | Material 3, Carbon, Atlassian |
| Dismiss button requires aria-label | WAI-ARIA APG |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Alert missing role attribute entirely
grep -rn 'alert\|Alert\|banner\|Banner\|notification' src/ | grep 'class=\|className=' | grep -v 'role='

# Error/warning alert using role="status" instead of role="alert"
grep -rn 'role="status"' src/ | grep -i 'error\|warning\|danger'

# Color-only differentiation — severity class with no icon reference
grep -rn 'alert--error\|alert--warning\|alert-error\|alert-warning' src/ | grep -v 'icon\|Icon\|svg\|SVG'
```

---

## Failing Example

```html
<!-- BAD: alert using only color class — no icon, no role, no text variant label -->
<div class="alert alert--error">
  Your session has expired. Please log in again.
</div>
```

**Why it fails**: No `role="alert"` so screen readers do not announce the error message. Color class alone distinguishes severity — users with color blindness or high-contrast themes cannot distinguish this from a neutral message. No icon provides a shape-based cue.
**Grep detection**: `grep -rn 'class.*alert--error\|class.*alert-error' src/ | grep -v 'role='`
**Fix**: Add `role="alert"`, include an error icon with `aria-hidden="true"`, and ensure the variant is communicated through text or visually-hidden label in addition to color.
