# Visual Hierarchy & Layout

<!-- Source: nextlevelbuilder/ui-ux-pro-max-skill (MIT) — data/landing.csv -->

Visual hierarchy is the system by which a design communicates importance before the user consciously processes it. Every element in a layout has a perceived rank — determined by size, contrast, position, spacing, and depth — and that rank tells the eye where to go and in what order. A layout without deliberate hierarchy forces the user to negotiate with the design rather than work through it. The principles in this file apply to screens, components, and marketing pages equally.

---

## Z-Order and Depth Cues

Shadow is the primary depth signal in modern flat design, because it mimics the physical relationship between surfaces at different altitudes. Shadows do not decorate — they locate. A surface with more shadow sits higher in the visual stack, which means it is more foregrounded and more important.

### Three-Layer Shadow System

The standard three-layer system maps to real UI altitude needs:

| Layer | Shadow Spec | Use |
|-------|------------|-----|
| Base (elevation 0) | No shadow | Default page surface, cards at rest |
| Raised (elevation 1) | `box-shadow: 0 2px 4px rgba(0,0,0,0.08)` | Hover states, interactive cards, sticky headers |
| Floating (elevation 2) | `box-shadow: 0 8px 16px rgba(0,0,0,0.12)` | Dropdowns, tooltips, popovers |
| Overlay (elevation 3) | `box-shadow: 0 16px 32px rgba(0,0,0,0.18)` | Modals, drawers, sheets |

Using only these four levels prevents visual noise from competed shadows and keeps the depth hierarchy readable. An element should never sit at the same shadow level as an element it is meant to overlay — that collapses the depth relationship.

### Blur-as-Scrim for Modal Depth

When a modal or drawer is open, applying a backdrop blur (`backdrop-filter: blur(4px)` or a semi-transparent dark overlay) on the content beneath reinforces that the modal is spatially in front of it. This is a figure-ground manipulation (see Gestalt principles). The scrim communicates "this content is currently inaccessible" without hiding it entirely, preserving orientation.

### Z-Index Scale

A consistent z-index scale prevents the stacking context chaos that makes UI debugging painful. Each level exists for a reason:

| Level | Value | Purpose |
|-------|-------|---------|
| Base | 0 | Static page content — no stacking context needed |
| Sticky | 100 | Sticky headers and footers that must stay above scrolled content |
| Dropdown | 200 | Menus and autocomplete dropdowns that overlay adjacent content |
| Modal | 300 | Dialogs and drawers that overlay the entire page |
| Toast | 400 | Notifications that must appear above even open modals |

Gaps of 100 between levels exist so intermediate values can be inserted without renumbering. Never assign z-index values outside this scale without a documented reason, because arbitrary z-index values signal that someone solved a specificity problem instead of understanding the stacking architecture.

---

## Whitespace as Design Element

Whitespace is not empty space — it is the space that gives meaning to what surrounds it. Without whitespace, elements cannot be perceived as distinct objects; they collapse into visual noise. With intentional whitespace, proximity becomes a communication tool: elements that are close together are related, and elements that are far apart are not.

### Micro-Spacing (Related Elements)

Elements that belong together — a label and its input, an icon and its caption, a list item and its supporting text — should be separated by 4–8px. This distance signals "these are one thing" without fusing them visually. Tighter than 4px feels merged; looser than 8px starts to break the association.

### Macro-Spacing (Section Separation)

Distinct content sections — hero to features, features to testimonials, nav to page content — benefit from 32–64px of separation. This spacing creates visual "chapters" in the layout, giving the eye a moment to land before beginning the next section. Without this spacing, the page feels like one undifferentiated mass regardless of the visual variation within it.

### Premium vs. Compact

More whitespace signals premium and confidence: the brand is not anxious about showing off everything at once. Less whitespace signals density and efficiency: the product respects the user's time and assumes they have a specific goal. Neither is universally correct — a data dashboard should be compact because users came to see data, while a luxury product landing page should be expansive because users came to be immersed.

The rule of thumb: **match whitespace density to the pace at which users should move through the content.** Fast task completion → compact. Consideration and exploration → generous.

---

## Asymmetry and Rhythm

Symmetric layouts feel stable, balanced, and trustworthy — which makes them appropriate for institutional, financial, and governmental contexts where those qualities matter. They also feel static, because perfect balance has no direction and creates no tension.

Asymmetric layouts create tension and visual interest by violating the expectation of balance. When used purposefully, asymmetry directs the eye along a path — a large element on the left creates pressure toward the right, a heavy top creates pressure downward. This directed attention is why most effective marketing layouts use asymmetry: the imbalance leads the user's eye toward the CTA.

The key discipline is intentionality. Asymmetry that emerges from neglect — uneven margins, inconsistent column widths — reads as incompetence, not dynamism. Asymmetry that is designed — a deliberate large/small pairing, a grid that breaks at one exact point — reads as craft. Always be able to explain why a layout is asymmetric in terms of what attention it is directing.

### Rhythm

Rhythm in layout means that repetition creates a predictable visual beat that the eye can lock onto and traverse quickly. A card grid has rhythm. A consistent heading-body-space pattern has rhythm. Rhythm is not uniformity — it is the reliable expectation that similar content will appear in similar visual form. Break rhythm only to signal importance: a featured item in a grid that is twice the size says "this one matters."

---

## Compositional Grids

Grids are not aesthetic choices — they are coordination mechanisms. A grid aligns elements to invisible reference lines, which means users can scan a layout without actively negotiating where each element sits.

### Responsive Column Grid

| Breakpoint | Columns | Gutter | Margin |
|------------|---------|--------|--------|
| Mobile (≤767px) | 4 | 16px | 16px |
| Tablet (768–1023px) | 8 | 24px | 24px |
| Desktop (1024–1439px) | 12 | 24px | 32px |
| Ultra-wide (≥1440px) | 16 | 32px | 48px |

12-column desktop is the most common grid because it divides evenly into halves (6), thirds (4), quarters (3), sixths (2), and twelfths (1), giving layouts maximum compositional flexibility. 16-column ultra-wide grids are appropriate for dashboards because they accommodate more simultaneously visible data columns without collapsing to tiny widths.

### Baseline Grid

A baseline grid aligns text and element heights to a consistent vertical increment — typically 4px or 8px. Every element's height, padding, and margin should be a multiple of this increment. The baseline grid is what makes a layout feel "settled" rather than arbitrarily positioned, because every vertical decision relates to a shared rhythm. In practice, use 8px as the primary increment and 4px for sub-increments only (e.g., within a component's internal padding).

---

## Figure-Ground Manipulation

Figure-ground perception is the visual system's ability to separate a subject (figure) from its context (ground). Design relies on this to make interactive elements pop out of the background, modal overlays recede the page behind them, and navigation items separate from the content they sit above.

The primary tools for establishing figure-ground relationships are:

- **Color contrast:** The figure must have at least 3:1 contrast ratio against the ground (WCAG AA for large text; perceived separation requires at least this even for decorative elements).
- **Size:** Larger elements naturally read as foreground.
- **Shadow:** Elements with elevation shadows read as physically in front of flat elements.
- **Blur:** Blurred elements recede perceptually, making sharp elements read as foreground.

Never rely on a single cue alone — a foreground element established only by shadow may become invisible in certain display contexts. Combining contrast + shadow + position creates a robust figure-ground relationship.

---

## Reading-Order Scoring

Users do not read UIs — they scan them. Understanding the scan pattern users will apply to a layout allows designers to place information where the eye will naturally encounter it in the intended order.

### F-Pattern

Users scan the top horizontally, then move down the left side, occasionally scanning horizontally partway across the middle. This pattern dominates text-heavy content: documentation, long-form reads, dense lists. In an F-pattern layout, the most important content belongs at the top and along the left edge. Midline content will receive partial attention; right-column and lower-left content will frequently be missed.

**Implication:** In F-pattern contexts, do not place critical information or CTAs in the right column or below the visible horizontal sweeps.

### Z-Pattern

Users scan the top-left, move horizontally to the top-right, then diagonally across to the bottom-left, then horizontally to the bottom-right. This pattern dominates sparse layouts with clear visual anchors — marketing pages with a headline, an image, and a CTA. The Z traces through the key moments of the layout, which is why placing a CTA at the Z-terminal (bottom-right) is effective for conversion-optimized pages.

**Implication:** In Z-pattern contexts, place the brand/logo at top-left, the most compelling claim at top-right, the value summary along the diagonal, and the CTA at bottom-right.

### Inverted Triangle

The layout starts wide at the top (a full-width headline), narrows through supporting content, and terminates at a focused CTA. This pattern concentrates user attention progressively, mimicking an argument structure: here is the claim (wide), here is the evidence (mid-width), here is the action (narrow and high-contrast).

**Implication:** The inverted triangle is one of the strongest conversion patterns because it naturally channels the user's attention from awareness to action without requiring a deliberate scan path.

---

## Progressive Disclosure Hooks

Progressive disclosure is the principle that interface complexity should be revealed in proportion to user readiness and need. Showing all complexity at once overwhelms; hiding complexity aggressively creates friction. The correct level of disclosure depends on what the user is trying to do right now.

**Accordion:** Use for dense but not immediately required information. FAQs, advanced settings, and multi-section forms benefit from accordions because users can navigate to the section they need without reading everything. Never hide primary actions behind an accordion — only secondary and contextual content belongs there.

**Tooltip:** Use for inline definitions and contextual help that would interrupt reading flow if placed in line. Tooltips are appropriate for technical terms, icon meanings, and field constraints. They should appear on hover (not click) for desktop, and on tap for mobile. Tooltip copy must be brief — if the explanation requires more than two sentences, it belongs in documentation, not a tooltip.

**Drill-down:** Use for hierarchical data exploration where showing all levels simultaneously would be overwhelming. File browsers, category navigation, and data dashboards with sub-dimension exploration are appropriate drill-down contexts. Each level should clearly communicate where the user is in the hierarchy and how to return.

**The invariant:** Never hide primary actions behind any disclosure pattern. If a user must open an accordion to find the main CTA, the information architecture is broken. Disclosure patterns are for secondary information only.

---

## Landing-Page Archetypes

<!-- Source: nextlevelbuilder/ui-ux-pro-max-skill (MIT) — data/landing.csv -->

A landing-page archetype is a proven structural pattern — a specific order of sections, CTA placement rule, and visual approach — calibrated to a specific conversion goal and audience state. Matching the archetype to the product's vertical and the visitor's awareness level dramatically improves conversion without requiring creative originality at every decision.

The 24 archetypes below are ordered by section sequence. "CTA placement rule" describes where to place the primary call to action relative to page content.

---

### 1. Hero-Centric
**Section order:** Full-viewport hero → brief feature highlights → footer  
**CTA placement rule:** Above the fold, within the hero — the primary action is visible without scrolling  
**Best for:** SaaS product launches, single-purpose apps, brand launches where one conversion goal dominates  
**Key visual pattern:** Large image or video background, single headline, single CTA button — nothing competes with the hero

### 2. Conversion-Optimized
**Section order:** Headline → CTA → minimal social proof → secondary CTA  
**CTA placement rule:** Within 200px of the top of the page; repeated on scroll at a consistent interval  
**Best for:** Lead generation, email capture, high-intent landing pages where the visitor already knows what they want  
**Key visual pattern:** Minimal distraction — no navigation, no secondary offers; everything serves the single conversion action

### 3. Feature-Rich Showcase
**Section order:** Hero → feature grid → social proof → pricing summary → CTA  
**CTA placement rule:** Mid-page, after the feature grid has established value  
**Best for:** Complex products with multiple differentiated capabilities that need explaining before the user will convert  
**Key visual pattern:** Icon cards with short descriptions arranged in a grid; screenshots or product mockups for each feature

### 4. Minimal and Direct
**Section order:** Logo → tagline → single CTA → optional supporting line  
**CTA placement rule:** Above the fold; the page is essentially nothing but the CTA  
**Best for:** Luxury brands, exclusive invitations, invite-only launches, products where restraint signals quality  
**Key visual pattern:** White space is the dominant visual element; typography carries the entire design load; photography is secondary

### 5. Social-Proof-Focused
**Section order:** Hero → testimonial prominences → customer logo wall → case study summary → CTA  
**CTA placement rule:** After the social proof block — conversion happens once trust is established  
**Best for:** Products where credibility is the primary conversion barrier: enterprise software, high-ticket services, health products  
**Key visual pattern:** Real face photography accompanying testimonials; recognizable logos displayed at full opacity; specific measurable results quoted

### 6. Interactive Product Demo
**Section order:** Hero with embedded live demo or interactive preview → feature explanation → CTA  
**CTA placement rule:** Inline with the demo; allow the user to try before committing  
**Best for:** Developer tools, SaaS products, any product where the experience is the best argument for conversion  
**Key visual pattern:** Live code editor, interactive prototype, or animated walkthrough embedded directly in the page — not behind a click

### 7. Trust and Authority
**Section order:** Credentials and certifications → case study highlights → team or methodology → CTA  
**CTA placement rule:** Conservative — placed after all trust signals have been presented; below the fold is acceptable  
**Best for:** B2B enterprise sales, consulting services, legal and compliance products where buying risk is high  
**Key visual pattern:** Logo wall with named clients; specific metrics from case studies; certifications and awards displayed prominently

### 8. Storytelling-Driven
**Section order:** Narrative introduction → problem acknowledgment → solution journey → outcome → CTA  
**CTA placement rule:** End of story — the CTA is the natural conclusion of the narrative arc  
**Best for:** Mission-driven brands, founder-led companies, products where the origin story creates emotional investment  
**Key visual pattern:** Full-bleed photography that advances the narrative; minimal UI chrome; scroll-triggered reveals that pace the story

### 9. Comparison/Competitive
**Section order:** Positioning headline → feature comparison matrix → pricing → CTA  
**CTA placement rule:** After the comparison matrix — once the product has won the comparison  
**Best for:** Competitive category entries, products explicitly positioning against a named incumbent, switching-cost contexts  
**Key visual pattern:** Side-by-side comparison table with clear visual wins; checkmarks vs. X marks; pricing presented as a conclusion, not an opener

### 10. Problem-Solution
**Section order:** Pain point articulation → solution introduction → specific benefits → social proof → CTA  
**CTA placement rule:** Mid-page, after the solution and benefits have been presented  
**Best for:** Products solving a well-understood pain that users actively feel but haven't found a solution for  
**Key visual pattern:** Before/after contrast; language that mirrors how users describe the problem to themselves; solution reveal that feels like relief

### 11. Community-Led
**Section order:** Community value proposition → user-generated content grid → join CTA → community stats  
**CTA placement rule:** After seeing the community in action — conversion is to join, not to buy  
**Best for:** Social apps, creator platforms, forums, any product whose value scales with network size  
**Key visual pattern:** Real user content grid; community size metrics; faces and usernames to signal that real people are already here

### 12. Free-Tool
**Section order:** Tool embedded directly at top → output or result preview → upgrade value proposition → CTA  
**CTA placement rule:** After tool use — show the upgrade CTA once the user has experienced the value  
**Best for:** Freemium SaaS products where the tool itself is the best acquisition mechanism  
**Key visual pattern:** Functional tool widget inline in the page; results visible without signup; upgrade gate triggered by usage limit or advanced feature

### 13. Event/Launch
**Section order:** Event name and date → countdown timer → value proposition → registration form  
**CTA placement rule:** Above the fold alongside the countdown — urgency and action together  
**Best for:** Product launches, webinars, conferences, limited-availability events  
**Key visual pattern:** Countdown timer as the hero element; date and time prominently displayed; registration form short enough to complete immediately

### 14. Portfolio/Agency
**Section order:** Brand positioning → selected work grid → process or approach → contact CTA  
**CTA placement rule:** Bottom of page — the portfolio is the argument; the CTA is the conclusion  
**Best for:** Creative agencies, freelancers, design studios, any service business where the work speaks for itself  
**Key visual pattern:** Full-bleed project images; minimal copy; case study depth available on click; contact form or email rather than a purchase CTA

### 15. E-commerce Category
**Section order:** Category headline → filter controls → product grid → individual product CTAs  
**CTA placement rule:** Per-product — each product card has its own CTA  
**Best for:** Retail product categories, marketplace verticals, any browsing-first commerce context  
**Key visual pattern:** Masonry or uniform grid layout; filter/sort controls accessible without page navigation; product image as the primary communication vehicle

### 16. Mobile-App Download
**Section order:** App value proposition → device mockup → key screens → app store badges → social proof  
**CTA placement rule:** Above the fold with app store badge buttons; repeated at bottom  
**Best for:** Consumer mobile apps, games, utilities targeting smartphone-first audiences  
**Key visual pattern:** Phone frame showing the app in use; platform-specific badges (App Store / Google Play) as primary CTAs; optional rating and download count as social proof

### 17. Video-First
**Section order:** Autoplay background video → overlaid headline and CTA → supporting content below  
**CTA placement rule:** Overlaid on the video — visible immediately on page load  
**Best for:** Experiential brands, travel companies, premium consumer products where atmosphere is the argument  
**Key visual pattern:** Full-screen video autoplay (muted); minimal text overlay; the video carries the emotional and brand argument

### 18. Pricing-Forward
**Section order:** Brief positioning → pricing table with tier comparison → per-tier CTA → FAQ  
**CTA placement rule:** Per-tier — each pricing column has its own conversion action  
**Best for:** Products with transparent, self-serve pricing; SaaS with clear tier differentiation; subscription businesses  
**Key visual pattern:** Three-tier layout with middle tier highlighted as recommended; feature comparison below price; annual/monthly toggle

### 19. Newsletter/Content
**Section order:** Value proposition → email capture form → sample content or recent issues → social proof subscriber count  
**CTA placement rule:** Above the fold — the form is the entire purpose of the page  
**Best for:** Media companies, content creators, thought leaders, any subscription email product  
**Key visual pattern:** Minimal design that does not compete with the form; preview of content quality as the primary trust signal

### 20. Data/Analytics Showcase
**Section order:** Positioning headline → live or animated dashboard preview → capability explanation → CTA  
**CTA placement rule:** After the demo — once the data quality has been demonstrated  
**Best for:** Analytics platforms, BI tools, data products where the output is the proof  
**Key visual pattern:** Interactive chart or live dashboard preview embedded in the page; real-seeming data rather than placeholders; metric definitions visible to signal depth

### 21. Long-Form Sales Page
**Section order:** Headline → problem → agitation → solution → proof → benefits → objection handling → CTA → guarantee → repeated CTA  
**CTA placement rule:** Repeated multiple times throughout — after each major argument and at the end  
**Best for:** High-ticket items, coaching programs, courses, any product requiring significant commitment  
**Key visual pattern:** Text-heavy with strategic visual breaks; testimonials woven throughout rather than grouped; guarantee section near the final CTA to reduce last-minute drop-off

### 22. Waitlist/Pre-launch
**Section order:** Teaser headline → product promise → email capture form → optional: social sharing incentive  
**CTA placement rule:** Above the fold — the form is the entire conversion goal  
**Best for:** Pre-launch products, invite-only launches, limited-release products  
**Key visual pattern:** Intentional information scarcity; anticipation over explanation; social proof through waitlist size if available

### 23. Marketplace
**Section order:** Search bar → category navigation → featured listings → browse grid  
**CTA placement rule:** Search-first — the search bar is the primary CTA; per-listing CTAs secondary  
**Best for:** Two-sided platforms, classified marketplaces, any product where supply browsing is the primary user behavior  
**Key visual pattern:** Search prominence above everything else; category browsing as primary navigation; featured/promoted listings visually distinct but not intrusive

### 24. Documentation Hub
**Section order:** Search bar → quick-start links → navigation tree → content area  
**CTA placement rule:** No primary marketing CTA — navigation is the only action  
**Best for:** Developer documentation, product help centers, API references, any knowledge base  
**Key visual pattern:** Navigation-heavy layout; dense information with strong typographic hierarchy; search is the dominant entry point; no marketing chrome competing with the content
