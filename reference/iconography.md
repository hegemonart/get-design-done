# Iconography — Reference Guide

Icons are a precise visual language. Every sizing, weight, metaphor, and accessibility decision either reinforces or undermines the system's communicative intent. This reference establishes canonical rules for icon usage across the get-design-done framework.

---

## 1. Optical Sizing & Stroke Weight

Icons are not scalable art objects that merely get bigger — they are optical instruments tuned to specific viewing contexts. A 16px icon rendered with the same stroke weight as a 32px icon will look fragile and thin at small sizes, because the eye perceives stroke weight relative to the overall icon bounding box.

**Canonical stroke weights by icon size:**

| Icon size | Recommended stroke | Why |
|-----------|-------------------|-----|
| 16px | 1.5px | At 16px, a 1px stroke disappears on most non-retina displays; 1.5px gives enough mass without filling the internal counter spaces |
| 20px | 1.5–2px | Transition size — match the body text weight; if using medium-weight body copy, lean toward 2px |
| 24px | 2px | The most common "default" icon grid. 2px is the industry convention (Lucide, Heroicons, Feather all default here) |
| 32px | 2–2.5px | Larger icons need more weight to avoid looking drawn with a fine pen against the heavier surrounding UI |
| 48px+ | 2.5–3px | Display-size icons (app icons, hero illustrations) should be optically balanced to read boldly at distance |

**Pixel alignment rules:** Icons on an even grid (16px, 24px, 32px) align their strokes to whole pixels. Icons on an odd grid (20px, 28px) should have strokes centered on 0.5px boundaries to avoid sub-pixel blur on non-retina displays. For SVG exports, always set `shape-rendering: crispEdges` on icon wrappers, and center the viewBox exactly on the pixel grid (e.g., `viewBox="0 0 24 24"`, not `"0.5 0.5 23 23"`). A stroke centered on the path boundary will anti-alias; a stroke offset by 0.5px will render sharply.

---

## 2. Weight & Stroke Consistency

Never mix stroke weights within the same UI surface. Mixing a 1.5px outline icon next to a 2px icon in the same toolbar creates a visual discord that users register as "something feels off" even if they cannot articulate why. The eye calibrates to a baseline weight, and deviations feel like errors.

**The typography matching principle:** Icon weight should correspond to the surrounding text weight. A regular-weight body paragraph (400) pairs with a regular or medium icon (1.5–2px stroke). A bold heading (700) pairs with a bold or filled icon variant. This alignment creates a perception of visual kinship — the icon "belongs" to the text alongside it rather than floating in from a different design register.

**Practical rule:** Choose one icon library per product surface and use it exclusively. If a specific icon is unavailable in your chosen library, draw it using the same stroke grammar rather than importing a single icon from a different library. The visual inconsistency of mixing libraries is nearly always worse than an imperfect icon from the right library.

---

## 3. Metaphor Taxonomy

Icons communicate meaning through shared cultural metaphors. Understanding the four functional categories prevents category errors — using a navigation metaphor for an action, or a status metaphor for wayfinding.

### Functional (Action) Icons

Functional icons represent user-initiated operations: save, delete, copy, filter, sort, upload, download. They answer the question "what can I do here?" Their metaphors must be action-verifiable — a user looking at the icon should be able to predict the outcome of clicking it. The floppy disk for "save" is a dead metaphor that persists by convention, not visual logic; prefer more literal representations (cloud-upload for cloud save, checkmark-circle for "mark complete") where the action is unambiguous without cultural baggage.

**Recognition test:** Cover the label. Can a first-time user accurately predict what clicking this icon will do? If fewer than 80% of testers answer correctly in usability studies, pair the icon with a text label.

### Status Icons

Status icons communicate system state: success, warning, error, loading, offline, syncing. They answer "what is the system telling me?" Their metaphors are highly convention-bound: green circle-check for success, yellow triangle-exclamation for warning, red circle-X for error. Deviating from these conventions introduces cognitive load — users must re-learn your system's visual language rather than drawing on years of software experience.

**When to use:** Status icons appear adjacent to data fields, system messages, toast notifications, and form validation. They must never be used as the sole indicator of status for users with color vision deficiency — always pair with a distinct shape and a text description.

### Navigation (Wayfinding) Icons

Navigation icons orient users within an information space: home, back, forward, menu, close, external-link, settings. They answer "where am I and how do I move?" Their metaphors are cartographic and gestural — arrows indicate direction of travel, the house represents the origin point, the hamburger menu represents a collapsed list.

**When to use:** Navigation icons appear in navbars, breadcrumbs, sidebars, and dialog controls. Because wayfinding is critical to task completion, navigation icons should almost always be paired with visible labels until the product has established enough user familiarity to support icon-only navigation (typically after repeated-use screens with power users).

### Brand Icons

Brand icons represent identity: logos, product wordmarks, social platform logos, and payment method marks. They follow the brand owner's guidelines, not the product's icon system. Never apply your system's stroke weight or color palette to third-party brand marks — use the official SVG assets. Brand icons communicate "who or what" rather than action, status, or direction.

**Source: nextlevelbuilder/ui-ux-pro-max-skill (MIT) — data/icons.csv**

---

## 4. Dark-Mode Icon Variants

A common mistake is inverting an icon library's default black strokes to `#FFFFFF` in dark mode. Pure white icons on dark backgrounds produce harsh contrast that reads as aggressive, particularly for secondary and tertiary actions. More importantly, pure white does not participate in the opacity token system that controls visual hierarchy.

**Use opacity tokens, not white fills.** The correct approach is to define icon colors using a semantic token (`--icon-default`, `--icon-secondary`, `--icon-disabled`) and resolve those tokens differently per color scheme:

```css
:root {
  --icon-default: oklch(0.15 0 0);       /* near-black */
  --icon-secondary: oklch(0.45 0 0);     /* mid-gray */
  --icon-disabled: oklch(0.70 0 0 / 0.4);
}

[data-theme="dark"] {
  --icon-default: oklch(0.92 0 0);       /* near-white, not pure */
  --icon-secondary: oklch(0.65 0 0);
  --icon-disabled: oklch(0.40 0 0 / 0.4);
}
```

**Icon-on-color contrast rules:** When placing a white icon on a brand primary background (e.g., a white checkmark inside a colored button), the contrast ratio between the icon color and the background must meet WCAG 2.1 AA minimum of 4.5:1 for icons associated with text-size equivalents, and 3:1 for large-scale graphical elements (per WCAG 1.4.11 Non-text Contrast). Use the APCA method for more perceptually accurate contrast estimation in complex color environments.

---

## 5. Icon Animation Guidelines

Animated icons communicate state transitions — they are not decorative flourishes. Every animation should signal a specific semantic event: a state change the user caused, a process completing, or feedback confirming an action.

**Morphing between states (cross-fade pattern):**

When transitioning between two icons (e.g., play → pause, bookmark-outline → bookmark-filled), use the following three-property animation. The outgoing icon exits while the incoming icon enters simultaneously:

```css
/* Outgoing icon */
.icon-exit {
  animation: icon-exit 150ms ease-in forwards;
}
@keyframes icon-exit {
  from { opacity: 1; transform: scale(1); filter: blur(0px); }
  to   { opacity: 0; transform: scale(0.75); filter: blur(4px); }
}

/* Incoming icon */
.icon-enter {
  animation: icon-enter 200ms ease-out forwards;
  animation-delay: 100ms;
}
@keyframes icon-enter {
  from { opacity: 0; transform: scale(0.25); filter: blur(4px); }
  to   { opacity: 1; transform: scale(1); filter: blur(0px); }
}
```

This pattern (scale 0.25→1, opacity 0→1, blur 4→0) creates a "materialization" feel that communicates emergence — the new state is coming into existence rather than simply swapping. Duration should be 150–200ms; shorter feels mechanical, longer feels sluggish.

**Rotation for loading states:** A continuous 360° rotation at 700–900ms per revolution communicates "waiting for external process." Use `animation-timing-function: linear` — easing causes visual pulsing that reads as multiple distinct events rather than a continuous state. The rotation axis must be the center of the icon's bounding box.

**Entrance for success states:** A success icon (checkmark, circle-check) should entrance with a brief overshoot — scale from 0 to 1.1 then settle to 1.0 — over 250–300ms using a spring-like timing function (`cubic-bezier(0.175, 0.885, 0.32, 1.275)`). This micro-bounce communicates "confirmed" rather than merely "appeared."

**Respect prefers-reduced-motion:** All icon animations must be disabled or reduced to an instant opacity transition when `@media (prefers-reduced-motion: reduce)` is active.

---

## 6. Semantic vs. Decorative Labeling

The single most common accessibility error in icon implementation is failing to distinguish between semantic icons (conveying meaning) and decorative icons (providing visual accompaniment to text that already conveys the meaning).

**Semantic (interactive standalone) icons require `aria-label`:**

```html
<!-- Icon-only button — meaning conveyed solely by icon -->
<button aria-label="Delete item">
  <svg aria-hidden="true" focusable="false"><!-- trash icon --></svg>
</button>
```

The `aria-label` on the button describes the action. The SVG itself receives `aria-hidden="true"` to prevent screen readers from announcing "svg" or the icon's internal text elements. Never rely on `title` elements within SVG for accessible names in interactive contexts — browser support is inconsistent.

**Decorative icons require `aria-hidden="true"`:**

```html
<!-- Icon accompanies visible label — purely decorative -->
<button>
  <svg aria-hidden="true" focusable="false"><!-- search icon --></svg>
  Search
</button>
```

When visible text already conveys the full meaning, the icon is decorative. Hiding it from the accessibility tree prevents redundant announcements ("search graphic, search button").

**Never use a standalone icon as the sole affordance for critical or destructive actions.** Even if the icon is well-recognized (trash = delete), critical actions like permanent deletion, payment confirmation, or account changes must always pair the icon with a visible text label. The cost of an unclear icon on a destructive action is irreversible user harm.

---

## 7. Touch Target Pairing

Visual icon size and interactive touch target size are different concerns. A 16px icon is visually appropriate for compact UI contexts, but an interactive area of 16×16px fails accessibility and usability standards — fingers are much larger than icons.

**Minimum interactive touch targets:**

| Context | Minimum target | Rationale |
|---------|---------------|-----------|
| Standard interactive icon | 40×40px | WCAG 2.5.5 Target Size AAA; Apple HIG minimum |
| Primary action icon | 48×48px | Material Design 3 recommendation for primary actions |
| Dense data tables | 32×32px | Acceptable for expert-user interfaces with high density requirements |

**Implementation with `::after` pseudo-element:**

This technique extends the clickable area without changing the visual icon size:

```css
.icon-button {
  position: relative;
  width: 20px;
  height: 20px;
}

.icon-button::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  /* Optionally: background: transparent; border-radius: 50%; */
}
```

The visual icon remains 20px; the interactive zone expands to 40px. On touch devices, this satisfies pointer accuracy requirements without creating visual padding that disrupts layout density.

---

## 8. Public Icon Library Catalog

Choosing an icon library is an architectural decision — all icons in a product surface should come from a single library to ensure stroke weight and visual grammar consistency. These are the major open-source libraries with their key characteristics.

### Lucide Icons
Over 1,000 icons under the MIT license. Stroke-based with a consistent 2px stroke weight on a 24px grid. This is the default icon library for shadcn/ui components and has become the de facto standard for React-based design systems. Strong community maintenance with frequent additions. Import individual icons by name to enable tree-shaking: `import { ChevronRight } from 'lucide-react'`. Never import the entire library — the barrel export will bloat bundles.

### Phosphor Icons
Available in six weights — thin, light, regular, bold, fill, and duotone — making it one of the most expressive icon systems available. MIT licensed. Ideal for products where visual hierarchy needs to be communicated through icon weight variation (e.g., active nav item uses bold, inactive uses regular). The duotone variant provides a two-tone fill that works well in marketing and onboarding contexts.

### Heroicons
Produced by the Tailwind CSS team. Available in outline and solid variants on a 24px grid. MIT licensed. The outline variant is a 1.5px stroke, which is slightly lighter than Lucide's 2px — choose based on whether your typography leans toward light or regular weight. First-class Tailwind integration and React/Vue packages available.

### Radix Icons
Designed specifically for the 15px grid rather than the standard 24px grid, making Radix Icons uniquely suited for dense, compact UI contexts — form fields, inline badges, data table actions. They pair directly with Radix UI primitives and share the same design philosophy: functional, unobtrusive, and predictable. MIT licensed.

### Tabler Icons
Over 3,000 icons with a consistent 2px stroke on a 24px grid. The largest coherent stroke-based icon set available. MIT licensed. Excellent for applications requiring coverage of unusual domains (medical, scientific, geographic) that other libraries do not address. Actively maintained with SVG optimization.

### Iconoir
Clean, minimal line icons on a 24px grid. MIT licensed. Characterized by a slightly rounded stroke termination that gives it a friendlier character than more angular systems. Well-suited for consumer-facing applications where the brand tonality is approachable and modern rather than corporate or technical.

### Remix Icon
Open-source with filled and line variants in each icon, organized into semantic categories (system, business, media, communication, etc.). The parallel line/filled pairing makes it straightforward to communicate active vs. inactive states without switching libraries.

### SF Symbols
Apple's system-native icon library, available exclusively on Apple platforms (iOS, macOS, watchOS, visionOS). Variable weights that match the San Francisco typeface — when the user adjusts text size or boldness in system settings, SF Symbols adjust proportionally. Not available for web or Android; use only in native Swift/SwiftUI or UIKit contexts. Access via `Image(systemName:)` in SwiftUI.

### Feather
A minimal, classic icon set with 287 icons on a 24px grid at a 2px stroke. MIT licensed. Feather is older than many alternatives on this list and receives fewer updates, but its visual grammar is exceptionally clean and it remains a reliable choice for products that prioritize restraint. The limited catalog means it works best for simple, focused applications rather than complex dashboards.

---

*This reference governs all icon decisions within the get-design-done framework. Deviations require explicit justification in `.design/DESIGN-CONTEXT.md` as a C-XX constraint.*
