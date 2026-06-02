# Responsive Design - Domain Index

This is the domain entry-point for responsive design. Load this file when the
interface will render in more than one locale, platform, or viewport condition.
It covers i18n engineering primitives, RTL and CJK cultural adaptation,
platform-specific conventions, native token bridging, and performance budgets.
It does not cover the CSS Grid implementation of responsive layouts (see
`reference/spatial.md` for container queries and `clamp()`); it does not cover
copy tone for localized content (see `reference/ux-writing.md`).

---

## Fragment Index

→ **`reference/i18n.md`** (Phase 28) - use when localizing text: expansion
budgets (+30-40%), CSS logical props, `Intl.*` APIs, ICU MessageFormat,
bidi isolation, Unicode normalization, multi-script font stacks

→ **`reference/rtl-cjk-cultural.md`** (Phase 28) - use when targeting RTL
locales or CJK audiences: layout mirroring rules, bidirectional text isolation,
Arabic/Hebrew/Devanagari rendering, cultural color meanings and imagery norms

→ **`reference/platforms.md`** (Phase 19) - use when targeting multiple
platforms: iOS/Android/web/visionOS/watchOS nav patterns, safe area insets,
gesture vocabularies, haptics, native typography conventions

→ **`reference/native-platforms.md`** (Phase 34.1) - use when bridging design
tokens to native code: canonical CSS token to SwiftUI Color / Compose Color /
Flutter ThemeData mapping, precision contract for the round-trip

→ **`reference/performance.md`** (Phase 19) - use for any production
responsive build: Core Web Vitals budgets by project type, JS/font/image
budgets, React runtime perf rules

→ **`reference/css-grid-layout.md`** (Phase 18) - load the container-queries
and `clamp()` sections only: fluid responsive components, safe-area insets,
logical CSS props in Grid context

---

## Rules of Thumb

**1. Size containers for the worst-case expansion locale.**
Russian and Finnish strings expand +40% from an English baseline. Any text
container designed at English width will overflow in those locales. Build for
`EN base x 1.4` as the standard layout-budget rule; top-aligned labels absorb
expansion without horizontal breakage.

**2. CSS logical properties are the implementation primitive for RTL.**
Never use `left`/`right` in a layout that will need to mirror. Replace
`margin-left` with `margin-inline-start`, `padding-right` with
`padding-inline-end`, and positioned `left` with `inset-inline-start`. The full
mapping is in `reference/rtl-cjk-cultural.md`.

**3. `prefers-reduced-motion` is a responsive property, not optional.**
Any animation behind a media query must resolve to `transition: none` or
`animation-duration: 0.01ms` when the user has set OS-level reduced-motion.
The CSS reset pattern is in `reference/motion.md`.

**4. Native token precision contract: no re-derivation in component code.**
Color hex values bridge to native at 8-bit channel precision (no rounding).
Dimension px values bridge as integer dp/pt. The token-bridge round-trip in
`reference/native-platforms.md` is the source of truth - any re-derivation
in component code will drift from the canonical value.

---

## Cross-Domain See Also

- i18n text expansion affects type container sizing: `reference/typography.md`
- Touch targets differ from pointer targets: `reference/interaction.md`
- Layout shifts at breakpoints: `reference/spatial.md`
- OS-level reduced-motion links to animation rules: `reference/motion.md`
- Civic multi-language government forms: `reference/domains/civic-patterns.md`
