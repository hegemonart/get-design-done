# Priority Matrix — 10 Categories, CRITICAL → LOW

Adapted from `ui-ux-pro-max`. Use this to rank findings when auditing, critiquing, or deciding fix order.

| # | Category | Severity | Must-have checks | Anti-patterns (avoid) |
|---|---|---|---|---|
| 1 | **Accessibility** | CRITICAL | Contrast 4.5:1 body / 3:1 UI / 7:1 AAA; alt text; keyboard nav; aria-labels; visible focus rings; `prefers-reduced-motion`; no color-only meaning; sequential heading hierarchy | Removed focus rings; icon-only buttons without labels; placeholder as label; red/green only as meaning |
| 2 | **Touch & Interaction** | CRITICAL | Min 44×44pt iOS / 48×48dp Android; 8px+ spacing between targets; loading feedback on async; error near field; visible press feedback | Hover-only interactions; instant (0ms) state changes; gesture-only critical actions; custom back overriding swipe |
| 3 | **Performance** | HIGH | WebP/AVIF + `srcset`; lazy loading below fold; reserve space (CLS < 0.1); animate transform/opacity only; `touch-action: manipulation` | Layout thrashing; animating width/height; no reduced-motion respect; heavy blur > 20px in Safari |
| 4 | **Style Selection** | HIGH | Committed aesthetic direction; consistency across surfaces; SVG icons only; max 2 font families; palette has dominant + accent (not rainbow) | Mixing flat + skeuomorphic; emoji as icons; 3+ font families; every element equally weighted |
| 5 | **Layout & Responsive** | HIGH | Mobile-first min-width queries; viewport meta; safe-area insets; no horizontal scroll; container queries for components; 3 breakpoints usually enough | Fixed px widths; desktop-first max-width; disable-zoom viewport; ignoring notch / Dynamic Island |
| 6 | **Typography & Color** | MEDIUM | Base 16px; line-height 1.5 (1.55 for light-on-dark); 65–75ch measure; OKLCH with tinted neutrals; semantic tokens, no raw hex; 5-step scale with 1.25+ ratio | Body < 12px; gray-on-gray; raw hex in components; Inter+purple+gradient default; pure gray neutrals; 8 sizes × 1.1 ratio |
| 7 | **Animation** | MEDIUM | Duration 100–300ms UI, 300–500ms layout; ease-out for entry, ease-in for exit, exits ~75% of enter; purposeful; `prefers-reduced-motion` | Decorative-only animation; `transition: all`; `ease-in` on UI; `scale(0)` entry; bounce/elastic curves; animating keyboard-initiated actions |
| 8 | **Forms & Feedback** | MEDIUM | Visible labels above fields; errors below with `aria-describedby`; helper text; validate on blur; progressive disclosure; single column | Placeholder-only label; errors only at top of form; overwhelming all fields upfront; validating every keystroke |
| 9 | **Navigation Patterns** | HIGH | Predictable back; bottom nav ≤5 items; deep linking; breadcrumbs for deep IA; command palette ⌘K on web/desktop | Overloaded nav; broken back behavior; no deep links; hamburger as primary on desktop; FAB on iOS |
| 10 | **Charts & Data** | LOW–MED | Legends; tooltips; accessible color palette; right-align numbers; tabular-nums; include axis labels | Color-only meaning; 3D effects; pie charts with > 5 slices; sparkline-as-decoration; missing units |

## Severity definitions (P0–P3)

- **P0 (block ship)**: Any CRITICAL failure, any legal/compliance issue, broken primary flow
- **P1 (fix this sprint)**: HIGH severity, broken secondary flow, significant UX confusion
- **P2 (backlog)**: MEDIUM, polish, non-blocking inconsistencies
- **P3 (nice-to-have)**: LOW, micro-improvements, aesthetic refinements

## How to use this table in audits

1. Run the discover stage audit or a manual grep pass using `reference/anti-patterns.md` patterns.
2. For each finding, assign a category (1–10) from above.
3. Sort by severity descending.
4. Fix P0s before shipping — never ship with one open.
5. Map each P0/P1 to a task type in the Design stage: color findings → `color` task, typography → `typography` task, accessibility → `accessibility` task.
