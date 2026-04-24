# Design Corpora — Component Benchmark Sources

This file is the canonical source list for `agents/component-benchmark-harvester.md`.
It catalogs the 18 design systems used when harvesting per-component benchmarks,
with licensing notes and a documented fallback chain.

## Fallback Chain

When a primary URL is unreachable, try in order:

1. **Canonical URL** — documented per-system below
2. **archive.org snapshot** — `https://web.archive.org/web/*/` + canonical URL
3. **Refero MCP search** — `mcp__refero__search` with component name + system name
4. **Pinterest MCP visual search** — `mcp__pinterest__search` with component name + system name

Document which tier was used in the raw harvest file under `Source tier:`.

---

## Design Systems Catalog

### 1. Material Design 3 (Google)
- **Canonical**: https://m3.material.io/components
- **License**: Apache 2.0 (docs: Creative Commons BY 4.0)
- **Coverage**: Full component set with anatomy, variants, accessibility, theming tokens
- **Notes**: Use `/components/<slug>` path. Best for density, motion, and adaptive layout guidance.

### 2. Apple HIG
- **Canonical**: https://developer.apple.com/design/human-interface-guidelines/
- **License**: © Apple Inc. — educational fair use for benchmarking
- **Coverage**: iOS, macOS, visionOS, watchOS; focus on a11y, gestures, platform norms
- **Notes**: Crawl per-platform variant pages. Best for accessibility contracts and iOS-native patterns.

### 3. Radix UI Primitives + WAI-ARIA APG
- **Canonical (Radix)**: https://www.radix-ui.com/primitives/docs/components/
- **Canonical (WAI-ARIA APG)**: https://www.w3.org/WAI/ARIA/apg/patterns/
- **License**: MIT (Radix); W3C (WAI-ARIA APG — freely usable)
- **Coverage**: Unstyled primitives + full ARIA keyboard contracts
- **Notes**: WAI-ARIA APG keyboard contracts should be quoted verbatim. Radix wraps them with implementation detail.

### 4. shadcn/ui
- **Canonical**: https://ui.shadcn.com/docs/components/
- **License**: MIT
- **Coverage**: Radix-based, Tailwind-styled components; real-world usage patterns
- **Notes**: Best for "what real teams ship" convergence signal alongside spec systems.

### 5. Polaris (Shopify)
- **Canonical**: https://polaris.shopify.com/components/
- **License**: Creative Commons BY-NC-SA 4.0 (docs)
- **Coverage**: E-commerce-optimised components; excellent do/don't examples
- **Notes**: Polaris has unusually detailed do/don't guidance — mine it for anti-pattern blocks.

### 6. Carbon Design System (IBM)
- **Canonical**: https://carbondesignsystem.com/components/
- **License**: Apache 2.0
- **Coverage**: Enterprise UI; data-heavy components; full accessibility matrix
- **Notes**: Best for data-dense table/form contexts and enterprise accessibility contracts.

### 7. Fluent 2 (Microsoft)
- **Canonical**: https://fluent2.microsoft.design/components/web/
- **License**: MIT
- **Coverage**: Windows / Microsoft 365 design language; dense information hierarchy
- **Notes**: Good for focus-management patterns in complex workflows.

### 8. Primer (GitHub)
- **Canonical**: https://primer.style/components/
- **License**: MIT
- **Coverage**: Developer tools UI; markdown + code contexts; icon integration
- **Notes**: Best for developer-tool and productivity-app component norms.

### 9. Atlassian Design System
- **Canonical**: https://atlassian.design/components/
- **License**: Atlassian Design System License (educational fair use)
- **Coverage**: Collaboration software; complex overlays; strong focus management
- **Notes**: Excellent focus-trap and dialog accessibility guidance.

### 10. Ant Design
- **Canonical**: https://ant.design/components/
- **License**: MIT
- **Coverage**: Large enterprise component set; Asian market conventions
- **Notes**: High component density; useful for form and data-table convergence.

### 11. Mantine
- **Canonical**: https://mantine.dev/
- **License**: MIT
- **Coverage**: Full-featured React library; excellent composability patterns
- **Notes**: Good for controlled vs uncontrolled patterns and React-idiomatic API design.

### 12. Chakra UI
- **Canonical**: https://chakra-ui.com/docs/components/
- **License**: MIT
- **Coverage**: Accessible by default; strong theming; popular in SaaS
- **Notes**: Good accessibility defaults baseline; useful for theming-token convergence.

### 13. Base Web (Uber)
- **Canonical**: https://baseweb.design/components/
- **License**: MIT
- **Coverage**: High-density, internationalization-aware components
- **Notes**: Good for RTL, i18n, and high-density layout patterns.

### 14. Nord Design System (Trivago)
- **Canonical**: https://nordhealth.design/components/
- **License**: MIT
- **Coverage**: Healthcare / hospitality UI; strong accessibility focus
- **Notes**: Smaller corpus; useful for healthcare context accessibility norms.

### 15. Spectrum (Adobe)
- **Canonical**: https://spectrum.adobe.com/page/component-list/
- **License**: Apache 2.0
- **Coverage**: Creative tools UI; multi-surface (web, mobile, desktop)
- **Notes**: Best for creative-tool contexts and platform-adaptive component behavior.

### 16. Lightning Design System (Salesforce)
- **Canonical**: https://www.lightningdesignsystem.com/components/
- **License**: BSD 3-Clause (Salesforce SLDS license)
- **Coverage**: CRM / enterprise SaaS; dense forms; complex data grids
- **Notes**: Good for enterprise form validation patterns and data-heavy contexts.

### 17. Evergreen (Segment)
- **Canonical**: https://evergreen.segment.com/components/
- **License**: MIT
- **Coverage**: Analytics / data SaaS; compact components
- **Notes**: Small system; useful as a convergence signal for SaaS-optimised defaults.

### 18. Gestalt (Pinterest)
- **Canonical**: https://gestalt.pinterest.systems/
- **License**: Apache 2.0
- **Coverage**: Visual-content feed; strong image + card patterns
- **Notes**: Best for card / masonry / visual-content component norms.

---

## Supplemental Source

### Phase 15 Impeccable Salvage
- **Path**: `.planning/research/impeccable-salvage/`
- **License**: MIT (internal port)
- **Notes**: Harvested design-knowledge prose from the pre-Phase-15 impeccable plugin.
  The harvester should consume this directory for any component-relevant excerpts before
  reaching out to external URLs.

---

## Attribution Convention

Every excerpt written to `.planning/benchmarks/raw/<component>.md` must carry a
source-attribution line in the format:

```
> Source: [System Name](<canonical-url>) — [license] — accessed <date>
```

For WAI-ARIA APG keyboard contracts quoted verbatim, use:

```
> Source: WAI-ARIA Authoring Practices Guide (<url>) — W3C — accessed <date>
> Quoted verbatim per W3C document license.
```
