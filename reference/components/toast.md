# Toast / Snackbar — Benchmark Spec

**Harvested from**: Radix UI Toast, Material 3 (Snackbar), Polaris (Toast), Carbon (Notification Toast)
**Wave**: 3 · **Category**: Feedback

---

## Purpose

A toast (snackbar) is a transient, non-blocking notification that appears briefly to confirm a completed action or communicate a system status. It auto-dismisses after 4–8 seconds (configurable) and does not require user acknowledgement for info/success variants. Use toast for low-urgency, time-sensitive feedback (save-confirmation, settings-saved). For persistent in-page messaging that demands attention, use Alert. *(Radix, Material 3, Polaris, Carbon agree: toast = ephemeral, non-blocking)*

---

## Anatomy

```
┌──────────────────────────────────────────────┐
│ [icon?]  Message text              [Action?] [✕?] │
└──────────────────────────────────────────────┘
         ↑ role="status" or role="alert"
         ↑ positioned: bottom-right (default)
```

| Part | Required | Notes |
|------|----------|-------|
| Container | Yes | Positioned overlay; `role="status"` or `role="alert"` |
| Message text | Yes | Concise (≤80 chars); describes what happened |
| Severity icon | No | Reinforces variant; never sole differentiator |
| Action button | No | Single CTA, max 2 words (e.g. "Undo", "View") |
| Dismiss button | No | Required when auto-dismiss is disabled or severity is error |
| Progress indicator | No | Optional strip showing remaining display time |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Info | Neutral status update; `role="status"` polite | Radix, Material 3, Polaris, Carbon |
| Success | Confirmed completion; `role="status"` polite | All |
| Warning | Action may have side effects; `role="alert"` assertive | Material 3, Carbon, Polaris |
| Error | Failure requiring attention; `role="alert"` assertive; persistent | All |

**Norm** (≥4/18 systems agree): info/success use polite live region; warning/error use assertive; error variant is persistent (no auto-dismiss) or has explicit dismiss.
**Diverge**: Material 3 calls this "Snackbar" (single action, no icon); Carbon calls it "Toast notification" (icon required). Polaris uses icon + title for structured variant. All converge on the transient + positioned pattern.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| entering | mount | Slide-in from bottom-right + fade-in, 200ms ease-out | Live region populated |
| visible | auto | Full opacity, static position | `role="status"` or `role="alert"` |
| hover / focus | pointer/keyboard | Auto-dismiss timer paused | — |
| exiting | dismiss / timeout | Slide-out + fade-out, 150ms ease-in | Removed from DOM |
| queued | >3 toasts active | Off-screen; waits for visible slot | Not yet in DOM |

---

## Sizing & Spacing

| Property | Value | Notes |
|----------|-------|-------|
| Min width | 288px | Prevents squished single-word toasts |
| Max width | 400px | *(Material 3: 344px, Carbon: 480px)* |
| Padding | 12px 16px | |
| Gap between stacked | 8px | Toasts stack vertically; max 3 visible |
| Border radius | 8px | *(Material 3: 4px, Polaris: 8px, Carbon: 0px)* |
| Position (default) | bottom-right | 16–24px from viewport edge |

**Norm**: Stack vertically with 8px gap; max 3 visible, queue the rest *(Radix, Polaris, Carbon)*.

---

## Typography

- Message: body-sm (14px/400) — same as body to ensure readability at a glance
- Action label: label-sm (13px/500) — slightly heavier to signal interactivity
- No wrapping beyond 2 lines — if message exceeds 2 lines, use Alert instead

Cross-link: `reference/typography.md` — body-sm, label-sm definitions

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `status` (info/success) or `alert` (warning/error)
> **Required attributes**: `role` on container; `aria-label` on dismiss button; `aria-live` region must be pre-mounted in DOM

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/alert/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Moves focus to action button or dismiss button if present |
| Enter / Space | Activates focused action or dismiss button |
| Escape | Dismisses the toast (pauses timer first if hovering) |

Toast container itself is not focusable. Only interactive children (action, dismiss) receive focus.

### Accessibility Rules

- `role="alert"` on warning/error toasts causes immediate announcement by screen readers — do NOT use for info/success (too noisy)
- `role="status"` on info/success uses a polite live region — announced at next opportunity
- The live region container MUST be present in the DOM before the toast text is injected — injecting `role="alert"` dynamically may not announce *(WCAG 4.1.3)*
- Dismiss button MUST have `aria-label="Dismiss notification"` or similar — the ✕ icon alone is not an accessible name
- Auto-dismiss timer MUST pause when the toast is hovered or focused *(WCAG 2.2.1 — Timing Adjustable)*
- Error toasts MUST either be persistent or have an explicit dismiss mechanism *(Polaris, Carbon)*

Cross-link: `reference/accessibility.md` — live-regions section

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Enter (slide-in + fade) | 200ms | ease-out | Slides from bottom-right edge inward |
| Exit (slide-out + fade) | 150ms | ease-in | Reverse direction on dismiss |
| Stack reflow | 150ms | ease-out | Other toasts shift position when one exits |

**BAN**: Bouncing or spring physics on enter — toast is informational, not celebratory. Avoid `transition: all` (catches layout shifts during stack reflow).

Cross-link: `reference/motion.md` — `prefers-reduced-motion`: skip slide, use fade-only at 100ms

---

## Do / Don't

### Do
- Use `role="status"` for info/success and `role="alert"` for warning/error *(WAI-ARIA APG)*
- Pre-mount the live region container in the DOM before injecting toast content *(WCAG 4.1.3)*
- Pause auto-dismiss timer on hover and focus *(WCAG 2.2.1)*
- Keep message text ≤80 characters; use action button for follow-up *(Material 3, Polaris)*

### Don't
- Don't use toast for errors that require user action — use a modal or alert *(Material 3, Carbon)*
- Don't stack more than 3 toasts — queue the rest *(Radix, Polaris)*
- Don't put more than one action in a toast — use a modal for complex decisions *(Material 3)*
- Don't rely on toast alone for critical status — supplement with in-page feedback *(Carbon)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Missing live region role | `reference/anti-patterns.md#ban-live-region` |
| Auto-dismiss without pause on hover | `reference/anti-patterns.md#ban-timing` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| role="alert" for error/warning; role="status" for info/success | WAI-ARIA APG, Material 3, Carbon, Polaris |
| Auto-dismiss 4–8s; error toasts persistent | Radix, Material 3, Polaris, Carbon |
| Max 3 visible toasts, queue rest | Radix, Polaris |
| Pause timer on hover/focus (WCAG 2.2.1) | WAI-ARIA APG |
| Pre-mount live region before injecting text | WCAG 4.1.3 |
| UUPM save-confirmation / settings-saved patterns | UUPM app-interface (MIT) |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Error toast missing role="alert" — uses role="status" instead
grep -rn 'toast\|Toast\|snackbar' src/ | grep 'error\|Error\|danger' | grep -v 'role="alert"'

# Toast missing any role attribute
grep -rn 'toast\|Toast\|snackbar' src/ | grep -v 'role='

# Missing aria-live region (live region not pre-mounted)
grep -rn 'toast\|Toast' src/ | grep -v 'aria-live\|role="status"\|role="alert"'

# Dismiss button missing aria-label
grep -rn 'toast.*close\|toast.*dismiss\|close.*toast' src/ | grep -v 'aria-label'
```

---

## Failing Example

```html
<!-- BAD: toast with no role — screen readers receive no announcement -->
<div class="toast toast--error">
  Settings failed to save.
  <button class="toast__close">✕</button>
</div>
```

**Why it fails**: No `role="alert"` so screen readers do not announce the error. The ✕ dismiss button has no `aria-label`. There is no live region for the text injection.
**Grep detection**: `grep -rn 'class.*toast' src/ | grep -v 'role='`
**Fix**: Add `role="alert"` for error severity; add `aria-label="Dismiss notification"` to the close button; pre-mount `<div role="alert" aria-live="assertive">` in the document and inject content into it.
