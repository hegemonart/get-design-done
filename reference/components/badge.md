# Badge — Benchmark Spec

**Harvested from**: Material 3, Polaris, Carbon, Radix
**Wave**: 3 · **Category**: Feedback

---

## Purpose

A badge is a compact numeric counter or status indicator overlaid on or beside a parent element (icon, avatar, button) to communicate a count (unread messages, notification count) or status (online, offline, busy). It is purely decorative — the accessible count or status is surfaced through the parent element's `aria-label`. *(Material 3, Polaris, Carbon, Radix agree: badge is decorative; parent carries accessible state)*

---

## Anatomy

**Attached (overlay)**
```
┌──────────────────────┐
│    [icon/avatar]     │
│                  ┌──┐│
│                  │ 3││  ← badge, position: absolute top-right
│                  └──┘│
└──────────────────────┘
↑ parent: aria-label="Messages, 3 unread"
```

**Standalone**
```
  ┌──────┐
  │  99+ │  ← badge standalone (rare; decorative in a list)
  └──────┘
```

| Part | Required | Notes |
|------|----------|-------|
| Badge element | Yes | Pill or circle shape containing count or dot |
| Count / label text | Conditional | Present for count/icon variants; absent for dot |
| Parent element | Yes (for attached) | Carries `aria-label` with accessible count |
| Dot indicator | No | Status dot variant — no number, pure color/shape |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Count | Numeric; shows integer up to 99, then "99+" | Material 3, Polaris, Carbon, Radix |
| Dot | Status indicator; no number; color/position only | Material 3, Polaris, Radix |
| Icon overlay | Small icon inside badge shape (rare) | Material 3 |

**Norm** (≥4/18 systems agree): count badges cap display at "99+"; zero count hidden by default; dot variant uses the same position/size slot as count but without text.
**Diverge**: Material 3 calls the dot variant "small badge" (8px, no content) vs. "large badge" (16px+, with number); Polaris uses "badge" exclusively for text status labels (not overlaid); Carbon uses "tag" for text labels, "notification badge" for counts. Radix provides a headless primitive suitable for all variants.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | count > 0 | Badge visible, pill shape | Parent `aria-label` updated |
| zero | count = 0 | Badge hidden (default); visible if `showZero` prop | Parent `aria-label` reflects 0 or omits count |
| max overflow | count > 99 | Renders "99+" | Parent `aria-label` says "99 or more unread" |
| dot status | status active | Dot visible; colored by status | Parent `aria-label` includes status text |

---

## Sizing & Spacing

| Variant | Min height | Min width | Font size | Notes |
|---------|-----------|-----------|-----------|-------|
| Count (sm) | 16px | 16px (= height) | 10px/500 | Single digit fills circle |
| Count (md) | 20px | 20px (= height) | 12px/500 | Two-digit + "99+" |
| Dot | 8px | 8px | — | No text; absolute top-right |

- **Shape**: pill when width > height; circle when width = height (single digit)
- **Position** (attached): `position: absolute; top: -4px; right: -4px` relative to parent
- **Min-width = height** (pill rule): ensures pill does not compress on 2-digit counts

**Norm**: 16–20px height; 10–12px font-size; min-width equals height *(Material 3, Polaris, Carbon)*.

---

## Typography

- Count text: 10–12px / 500 (medium weight) — legible at small scale
- No wrapping; never truncate count text; use "99+" cap instead
- Letter-spacing: 0 — tight spacing at 10–12px scale

Cross-link: `reference/typography.md` — small label scale (10–12px)

---

## Keyboard & Accessibility

> **WAI-ARIA role**: none (decorative); parent element carries accessible count via `aria-label`
> **Required attributes**: none on badge itself; `aria-label` on parent with count embedded

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/ — W3C — 2024*

| Key | Action |
|-----|--------|
| (none) | Badge is non-interactive; no keyboard behavior |

Badge never receives focus. It is a purely visual overlay. All keyboard interaction is on the parent element.

### Accessibility Rules

- Badge element itself MUST have `aria-hidden="true"` — screen readers should not announce the badge number separately; they read it as part of the parent's `aria-label`
- Parent element MUST have an `aria-label` that includes the count: `aria-label="Messages, 3 unread"` *(WAI-ARIA APG, Material 3)*
- Parent `aria-label` MUST be updated dynamically when count changes — use `aria-live` on the parent if the count changes while the page is rendered *(WCAG 4.1.3)*
- Zero badge: if badge is hidden at zero, remove it from DOM (or `display: none`) — do NOT leave it with empty text in the DOM *(Polaris)*
- Dot variant: parent `aria-label` MUST include the status: `aria-label="User profile, status: online"` *(Radix)*
- Never rely on badge color alone to communicate status — include text in parent `aria-label` *(WCAG 1.4.1)*

Cross-link: `reference/accessibility.md` — dynamic label updates, aria-live

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Count increment (scale pulse) | 150ms | ease-out | Brief scale 1.2 → 1.0 on value change |
| Badge appear | 100ms | ease-out | Fade + scale from 0.5 |
| Badge disappear (at zero) | 80ms | ease-in | Fade + scale to 0 |

**BAN**: Continuous bounce animation on badge — implies urgency and is distracting; one-shot pulse on value change is acceptable.

Cross-link: `reference/motion.md` — scale-in/scale-out; `prefers-reduced-motion`: skip all badge animation

---

## Do / Don't

### Do
- Include count in parent `aria-label`: `aria-label="Inbox, 5 unread messages"` *(WAI-ARIA APG)*
- Add `aria-hidden="true"` to the badge element itself *(WAI-ARIA APG)*
- Cap numeric display at "99+" and update parent label to "99 or more" *(Material 3, Carbon)*
- Hide badge when count is 0 by default; offer `showZero` prop for product preference *(Polaris, Radix)*

### Don't
- Don't surface badge count only through color (dot badge without parent label) *(WCAG 1.4.1)*
- Don't put interactive content in a badge — it is always decorative *(Material 3, Carbon)*
- Don't animate badge continuously — one-shot pulse on value change only *(Polaris)*
- Don't use badge text as the only accessible notification — always update parent `aria-label` *(WAI-ARIA APG)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Color as sole status differentiator | `reference/anti-patterns.md#ban-color-only` |
| Missing aria-label on parent with count | `reference/anti-patterns.md#ban-aria-label` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Badge is decorative; parent carries aria-label | Material 3, Polaris, Carbon, Radix |
| Count capped at "99+" | Material 3, Carbon, Radix |
| 16–20px height; min-width = height | Material 3, Polaris, Carbon |
| Zero badge hidden by default | Polaris, Radix |
| aria-hidden="true" on badge element | WAI-ARIA APG |
| Parent aria-label updated on count change | WCAG 4.1.3 |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Badge count not surfaced in parent aria-label
grep -rn 'badge\|Badge' src/ | grep -v 'aria-label' | grep -v 'aria-hidden'

# Badge element missing aria-hidden
grep -rn 'class.*badge\|className.*badge' src/ | grep -v 'aria-hidden="true"'

# Parent with badge but no aria-label
grep -rn 'badge\|Badge' src/ -l | xargs grep -l 'button\|icon\|avatar' | xargs grep -L 'aria-label'
```

---

## Failing Example

```html
<!-- BAD: badge count visible but parent has no aria-label for screen readers -->
<button class="icon-btn">
  <svg aria-hidden="true"><!-- bell icon --></svg>
  <span class="badge">3</span>
</button>
```

**Why it fails**: Screen readers announce "button" with no mention of the count. The `<span class="badge">3</span>` may be announced as isolated "3" out of context, or the badge text is read before the button label, producing confusing output. The button has no accessible name describing its purpose or the notification count.
**Grep detection**: `grep -rn 'class.*badge' src/ | xargs grep -B2 -A2 'button\|icon' | grep -v 'aria-label'`
**Fix**: `<button class="icon-btn" aria-label="Notifications, 3 unread"><svg aria-hidden="true">…</svg><span class="badge" aria-hidden="true">3</span></button>`
