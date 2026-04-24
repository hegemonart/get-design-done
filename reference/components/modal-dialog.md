# Modal / Dialog — Benchmark Spec

**Harvested from**: Radix UI Dialog, WAI-ARIA APG, Material 3, Atlassian, Carbon, Mantine, shadcn/ui, Fluent 2
**Wave**: 2 · **Category**: Containers

---

## Purpose

A modal dialog is a blocking overlay that requires user interaction before returning to the main content. It is rendered in a portal above the page, traps keyboard focus within itself, prevents interaction with the background, and closes on Escape. Use modals sparingly — they interrupt flow. Prefer inline feedback or slide-out drawers for non-critical workflows. *(Material 3, Atlassian, Polaris all advise modal restraint)*

---

## Anatomy

```
┌─ Backdrop (aria-hidden) ──────────────────────────────────┐
│                                                            │
│  ┌─ Dialog (role="dialog") ───────────────────────────┐   │
│  │  Title (aria-labelledby)           [✕ Close]        │   │
│  │─────────────────────────────────────────────────────│   │
│  │  Content / Body                                     │   │
│  │─────────────────────────────────────────────────────│   │
│  │  [Cancel]  [Confirm action]  ← action footer        │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| Backdrop | Yes | `aria-hidden="true"` overlay; blocks pointer |
| Dialog container | Yes | `role="dialog"` + `aria-modal="true"` |
| Title / heading | Yes | `id` referenced by `aria-labelledby` on dialog |
| Close button | Yes | Keyboard accessible; returns focus to trigger |
| Body content | Yes | Scrollable if content exceeds viewport |
| Action footer | Conditional | Confirm + cancel pattern |
| Portal | Yes | Rendered outside normal DOM flow; `document.body` target |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default | Centered, backdrop, standard size | All |
| Alert dialog | Blocking confirmation; `role="alertdialog"` | WAI-ARIA APG, Material 3, Carbon |
| Full-page | Mobile-first; occupies full viewport | Material 3, Atlassian |
| Small / confirm | Narrow; 2-button pattern | Material 3, Carbon, shadcn |
| Large / content | Wide; for complex forms or media | Atlassian, Fluent |
| Scrollable content | Body scrolls; header/footer sticky | All |

**Norm** (≥6/18): Escape closes; backdrop click may close (configurable); focus trapped inside.
**Diverge**: backdrop-click-to-close — Material 3 and shadcn default to close; Atlassian and Carbon recommend NOT closing on backdrop click to prevent accidental dismissal of forms.

---

## States

| State | ARIA |
|-------|------|
| Open | `aria-modal="true"` on dialog; `inert` on `<body>` content (or equivalent) |
| Closed | Dialog removed from DOM or `display:none`; focus returned to trigger |
| Loading content | `aria-busy="true"` on dialog body |

---

## Sizing & Spacing

| Size | Width | Max height | Notes |
|------|-------|------------|-------|
| sm | 400px | 80vh | Confirm dialogs |
| md (default) | 560px | 80vh | Standard |
| lg | 720px | 90vh | Complex forms |
| full | 100vw/100vh | — | Mobile sheet pattern |

Padding: 24px (header/footer), 24px (body horizontal), 20px (body vertical).
Body scroll: `overflow-y: auto` with `overscroll-behavior: contain`.

Cross-link: `reference/surfaces.md` — concentric radius, elevation (shadow-as-border)

---

## Typography

- Title: 18–20px/600; `id` attribute set for `aria-labelledby`
- Body: 14–16px/400
- Description (if separate from body): 14px/400 muted; linked via `aria-describedby` on dialog

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `dialog` (or `alertdialog` for blocking confirmations)
> **Required attributes**: `aria-modal="true"`, `aria-labelledby` (dialog title id), optionally `aria-describedby`

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Moves focus to next focusable element inside dialog (wraps from last to first) |
| Shift+Tab | Moves focus to previous focusable element inside dialog (wraps from first to last) |
| Escape | Closes the dialog and returns focus to the element that opened it |

### Focus Management

1. **On open**: focus moves to the first focusable element inside the dialog (or to the dialog itself if no focusable children)
2. **While open**: Tab/Shift+Tab cycle only within the dialog — focus MUST NOT leave the dialog
3. **On close**: focus MUST return to the element that triggered the dialog open

### Accessibility Rules

- `aria-modal="true"` MUST be set — tells AT to ignore background content (supplement with `inert` attribute on background for browsers without full `aria-modal` support)
- Dialog title MUST have an `id` referenced by `aria-labelledby` — screen reader announces "Dialog: [title]" on open
- `role="alertdialog"` for confirmation dialogs where the user must respond (delete confirmations, logout confirmation)
- Scroll-lock: prevent `<body>` scroll when dialog is open (`overflow: hidden` on `<body>`)
- Portal: render dialog in `document.body` to escape stacking context issues (z-index isolation)

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Backdrop fade in | 200ms | ease-out | opacity 0→0.5 |
| Dialog enter | 200ms | ease-out | scale 0.95→1 + fade |
| Dialog exit | 150ms | ease-in | scale 1→0.95 + fade |
| Backdrop fade out | 150ms | ease-in | — |

Use `AnimatePresence` (Framer Motion) or `data-state` + CSS for mount/unmount animation.
Cross-link: `reference/motion.md` — `AnimatePresence initial={false}`, `prefers-reduced-motion`

---

## Do / Don't

### Do
- Return focus to the triggering element on close *(WAI-ARIA APG, all systems)*
- Trap focus inside the dialog while open *(WAI-ARIA APG)*
- Render in a portal at `document.body` *(Radix, Mantine, shadcn)*
- Set `overflow:hidden` on `<body>` to prevent background scroll *(Material 3, Carbon)*

### Don't
- Don't close on backdrop click for dialogs with form input — data loss risk *(Atlassian, Carbon)*
- Don't use `role="dialog"` without `aria-labelledby` — dialog is announced without a name *(WAI-ARIA APG)*
- Don't use `display:none` to hide a dialog — use DOM removal or `hidden` attribute for correct AT behavior *(WAI-ARIA APG)*
- Don't stack more than 2 dialogs — use a single dialog with internal step navigation *(Material 3, Atlassian)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Focus not trapped in modal | `reference/anti-patterns.md` |
| No focus return on close | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Escape closes dialog | WAI-ARIA APG §4.1, all 8 systems |
| Focus trap (Tab wraps inside) | WAI-ARIA APG §4.1 |
| aria-modal="true" required | WAI-ARIA APG |
| Portal at document.body | Radix, Mantine, shadcn |
| role="alertdialog" for confirmations | WAI-ARIA APG, Material 3 |
| backdrop-click: configurable | Material 3, shadcn (default: close); Atlassian, Carbon (default: stay) |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Dialog without aria-labelledby
grep -rn 'role="dialog"\|role="alertdialog"' src/ | grep -v 'aria-labelledby'

# Dialog missing aria-modal
grep -rn 'role="dialog"' src/ | grep -v 'aria-modal'

# Modal without focus trap
grep -rn 'modal\|dialog' src/ | grep -L 'FocusTrap\|useFocusTrap\|focus-trap\|inert'

# Body scroll not locked on modal open
grep -rn 'modal.*open\|isOpen.*modal' src/ | grep -v 'overflow\|scroll-lock\|body\.'
```

---

## Failing Example

```html
<!-- BAD: dialog with no focus trap, no aria-modal, no aria-labelledby -->
<div class="modal" style="display:block">
  <div class="modal-content">
    <h2>Confirm deletion</h2>
    <p>This action cannot be undone.</p>
    <button onclick="close()">Cancel</button>
    <button onclick="confirm()">Delete</button>
  </div>
</div>
```

**Why it fails**: No `role="dialog"`, no `aria-modal`, no `aria-labelledby` — screen readers cannot announce the dialog name or suppress background content. Tab escapes the modal. Escape does nothing.
**Grep detection**: `grep -rn 'class.*modal\|class.*dialog' src/ | grep -v 'role=\|aria-'`
**Fix**: Use Radix `<Dialog>` or implement WAI-ARIA dialog pattern with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap, Escape handler, and portal rendering.
