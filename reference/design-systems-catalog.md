# Design Systems Catalog — Quick Reference

An opinionated index of the 18 major design systems most relevant to digital product work. For each system, the entry covers core philosophy, distinctive strengths, canonical documentation URL, and the clearest signal for when to reach for it. This catalog is not exhaustive — it is a decision aid for the planning and research phases.

---

## 1. Material Design 3 (Google)

Material Design 3 (M3) is Google's most expressive design system to date, built around dynamic color — an algorithm that generates a full 5-palette color scheme (primary, secondary, tertiary, error, neutral) from a single seed color, enabling personalization and accessibility without manual token work. M3 introduced the concept of "tonal surfaces," where elevation is communicated through color tint rather than shadow depth, producing designs that work well in both light and dark environments. The component library is built on tokens and roles rather than hardcoded values, making it straightforward to implement across Android, web, and Flutter from a single specification. Reach for M3 when building products that will ship on Android, need to feel native to the Google ecosystem, or require automatic dark mode with a systematic color science approach.

**Canonical URL:** https://m3.material.io

---

## 2. Apple Human Interface Guidelines (HIG)

The Apple HIG is the definitive authority for UI on iOS, macOS, watchOS, visionOS, and tvOS. Unlike most design systems, the HIG is primarily a platform-convention guide — it documents the standard behaviors, controls, and interaction patterns that users expect on Apple hardware, rather than providing a token-based component system. Its core philosophy is that software should feel native to the platform: tapping into system behaviors (swipe-to-go-back, live text, share sheets) creates immediate familiarity that no custom UI can replicate as efficiently. The HIG is essential reading for any team building native Swift applications, and it also informs the right abstraction level for cross-platform apps — understanding platform conventions before deciding which to override.

**Canonical URL:** https://developer.apple.com/design/human-interface-guidelines

---

## 3. Radix UI + WAI-ARIA Authoring Practices Guide

Radix UI is a headless React component library built on the principle that accessibility should be the floor, not a feature to add later. Every Radix primitive — Dialog, Dropdown Menu, Tooltip, Select, Combobox — implements the corresponding WAI-ARIA authoring pattern exactly, including full keyboard navigation, focus management, and ARIA attribute wiring. Because Radix is headless (no styles included), it gives design teams complete visual control while eliminating the most error-prone aspect of component development: the accessibility behavior layer. The WAI-ARIA Authoring Practices Guide (APG) from the W3C is the authoritative specification that Radix implements — reading both together gives the complete picture of why each interaction pattern is designed as it is. Reach for Radix when building a custom design system from scratch, adopting shadcn/ui, or needing confidence that interactive components will pass WCAG 2.1 AA audit without custom accessibility engineering.

**Canonical URLs:** https://www.radix-ui.com / https://www.w3.org/WAI/ARIA/apg

---

## 4. shadcn/ui

shadcn/ui is not a traditional component library — it is a collection of copy-paste components built on Radix UI primitives, styled with Tailwind CSS, and distributed as source files rather than npm packages. The key insight is ownership: when you install a shadcn component, you own the code and can modify it freely without forking a library. Components are pre-wired with Radix's accessible behaviors and follow a consistent theming system using CSS custom properties for color tokens. The default aesthetic is clean, modern, and neutral — intentionally generic so that a brand layer can be applied on top. It has become the de facto starting point for new React applications that need accessible, customizable components quickly. Reach for shadcn/ui for SaaS products, dashboards, and admin interfaces where Tailwind is already in use and rapid iteration on component behavior is needed.

**Canonical URL:** https://ui.shadcn.com

---

## 5. Polaris (Shopify)

Polaris is Shopify's design system for merchant-facing admin interfaces. Its core philosophy is that merchant clarity always wins over visual novelty — Polaris components are deliberately conservative in style to ensure that merchants can focus on their tasks rather than learning a new UI language. The system has deep expertise in e-commerce-specific patterns: product data tables with bulk actions, multi-step onboarding flows, fee and pricing displays, order status timelines, and multi-currency number formatting. Polaris's React components have granular TypeScript props that encode business logic (e.g., `criticalAction`, `destructive`, `loading`) as semantic variants rather than styling choices. Reach for Polaris when building Shopify apps or when the product domain is merchant-facing e-commerce operations — its patterns encode years of learnings about how merchants process information and make decisions.

**Canonical URL:** https://polaris.shopify.com

---

## 6. Carbon Design System (IBM)

Carbon is IBM's enterprise design system, optimized for data-heavy, information-dense interfaces in business, analytics, and scientific computing contexts. Its defining strength is the data table — Carbon's data table component supports sorting, filtering, batch actions, inline editing, pagination, and nested rows with a level of completeness that other systems do not approach. The system is built on a strict 8-column responsive grid and a precise 4px base-8 spacing scale, which makes pixel-perfect implementation across breakpoints reliable. Carbon has comprehensive dark theme support and strong accessibility compliance across its entire component set. Reach for Carbon when building enterprise dashboards, admin consoles, analytics platforms, or any interface where users will spend hours per day working with structured data at high information density.

**Canonical URL:** https://carbondesignsystem.com

---

## 7. Fluent 2 (Microsoft)

Fluent 2 is Microsoft's design language for Office 365, Windows 11, and cross-platform Microsoft products. It represents the evolution of the Fluent Design System toward a more expressive, accessible, and motion-rich visual language — particularly notable for its implementation of "emotional design" through subtle depth, layering, and light effects. Fluent 2's component library covers the full complexity of Office-class applications: ribbon toolbars, multi-pane layouts, collaborative presence indicators, and right-to-left language support. It ships implementations for React, Web Components, Blazor, iOS, and Android. Reach for Fluent 2 when building Microsoft Teams extensions, Office Add-ins, Microsoft 365 integrations, or Windows application software where visual alignment with the Microsoft ecosystem creates credibility and user familiarity.

**Canonical URL:** https://fluent2.microsoft.design

---

## 8. Primer (GitHub)

Primer is GitHub's design system, optimized for developer tools, code review interfaces, and markdown-heavy content rendering. Its core philosophy is density with clarity — GitHub's users are experts who value information density and resent unnecessary visual chrome, so Primer components lean toward compact spacing and minimal decoration. Primer has particularly strong implementations of code-related components: syntax-highlighted code blocks, diff views, commit graphs, and inline comment threads. The markdown rendering system is comprehensive and well-tested across edge cases that arise in developer content. Primer also has deep investment in color accessibility — its color system was designed to meet WCAG AA across all combinations. Reach for Primer when building developer tools, code hosting features, documentation systems, or any product whose primary users are software engineers.

**Canonical URL:** https://primer.style

---

## 9. Atlassian Design System

The Atlassian Design System governs the visual and interaction language of JIRA, Confluence, Trello, and Bitbucket — a family of products built around complex project management and collaborative workflows. Its defining expertise is in high-complexity form patterns: multi-step wizards, permission matrices, workflow configuration editors, and nested task hierarchies. The system provides comprehensive guidance on progressive disclosure — how to surface advanced configuration options without overwhelming occasional users — as well as patterns for collaborative real-time interfaces where multiple users edit the same content simultaneously. Atlassian's design tokens are production-ready and cover light and dark modes. Reach for the Atlassian system when designing products with JIRA-like complexity: multiple user roles, configurable workflows, permission systems, and nested content hierarchies.

**Canonical URL:** https://atlassian.design

---

## 10. Ant Design

Ant Design is China's most widely deployed enterprise React component library, produced by Alibaba's Ant Group. It is extraordinarily feature-complete — the component library contains over 60 components covering every conceivable enterprise UI pattern, from complex data pickers and cascader inputs to statistical charts and map integrations. The visual language is formal and structured, with a consistent use of gray, blue, and red that reads as professional in enterprise business software contexts. Ant Design has dedicated design guidance for Chinese business conventions (date formats, number systems, address fields, bank card inputs) that is not available in Western-focused systems. Reach for Ant Design when building enterprise SaaS for business users, when the development team is comfortable with a mature but opinionated React API, or when the product targets Chinese markets where Ant Design patterns carry high recognition.

**Canonical URL:** https://ant.design

---

## 11. Mantine

Mantine is a full-featured React component and hooks library notable for the quality and breadth of its custom hooks alongside its component library. Beyond standard UI components, Mantine provides production-ready hooks for form management, clipboard access, scroll state, viewport detection, and OS-level preferences detection — hooks that typically require separate libraries. The component library has strong TypeScript support, a flexible theming system based on CSS custom properties, and first-class dark mode. Mantine's Form library is one of its differentiators: type-safe, nested form support with async validation without the boilerplate of React Hook Form or Formik. Reach for Mantine when building complex form-driven applications or data entry tools where the hook ecosystem adds as much value as the component library.

**Canonical URL:** https://mantine.dev

---

## 12. Chakra UI

Chakra UI is a modular, accessible React component library built on the constraint-based styling principle: every layout and spacing prop maps to a design token, making it difficult to use arbitrary values that break the system. Its style props API (`mt`, `px`, `bg`, `color`) creates a tight coupling between design tokens and component props that enforces consistency at the implementation layer without requiring linter rules. Chakra has strong accessibility defaults across its component set and a straightforward theme extension system. Its dark mode implementation is one of the simplest in the ecosystem — toggling color mode is a one-line API call. Reach for Chakra UI when the design system's token enforcement needs to happen at the component-API level rather than in a separate linting layer, or when rapid prototyping with token-constrained styling is the priority.

**Canonical URL:** https://chakra-ui.com

---

## 13. Base Web (Uber)

Base Web is Uber's open-source React component library, built for applications that prioritize data density, table-heavy interfaces, and complex form patterns at production scale. Its defining architectural feature is the "Overrides" pattern — every component exposes an override prop that allows any internal sub-component to be replaced or styled without forking the library. This makes Base Web uniquely flexible for organizations that need a coherent component system but have strict visual requirements that differ from any library's defaults. The data grid component is particularly capable, supporting row virtualization, column pinning, inline editing, and multi-sort. Reach for Base Web when building operations dashboards, logistics interfaces, or any data-intensive application where table density and performance at 10,000+ rows are primary requirements.

**Canonical URL:** https://baseweb.design

---

## 14. Nord (Trivago)

Nord is Trivago's clean, minimal design system for travel and hospitality product interfaces. It is characterized by a restrained visual palette (predominantly white, light gray, and a single accent color), generous whitespace, and a focus on content legibility — appropriate for interfaces where the primary job is helping users compare options and make decisions. Nord's component documentation is exceptionally clear and includes detailed usage rationale and anti-pattern guidance alongside component specs. The system is smaller than enterprise-scale alternatives but is well-suited to consumer-facing products where visual sophistication and content clarity are more important than component count. Reach for Nord when building consumer products in travel, hospitality, or marketplace contexts where the brand aesthetic is premium, minimal, and content-forward.

**Canonical URL:** https://norddesignsystem.com

---

## 15. Spectrum (Adobe)

Spectrum is Adobe's design system for Creative Cloud applications — Photoshop, Illustrator, Acrobat, XD, and the broader Adobe ecosystem. Its core philosophy is "density over decoration" — creative tool users need maximum canvas space and minimal chrome, so Spectrum components are compact, keyboard-navigable, and optimized for expert-user workflows rather than onboarding. Spectrum has particularly strong guidance for non-destructive editing patterns, panel layouts, property inspector interfaces, and contextual toolbars — patterns that rarely appear in general-purpose design systems. The Web Components implementation allows Spectrum to work across frameworks. Reach for Spectrum when building creative tools, editing interfaces, or professional applications where users are domain experts who value speed and control over visual novelty.

**Canonical URL:** https://spectrum.adobe.com

---

## 16. Lightning Design System (Salesforce)

The Salesforce Lightning Design System governs the visual and behavioral language of Salesforce CRM and the Force.com platform. It is purpose-built for complex CRM patterns: record detail layouts, activity timelines, relationship panels, approval workflows, and configurable page builders. The system has deep guidance on form layout for dense data entry, which is the core user task in CRM — entering leads, logging calls, updating opportunity stages. Lightning's component implementations are available for Aura (Salesforce's older component model), LWC (Lightning Web Components), and React. Reach for Lightning when building Salesforce AppExchange products, Salesforce platform integrations, or CRM-adjacent applications where users switch between Salesforce and your product and visual consistency reduces cognitive switching cost.

**Canonical URL:** https://lightningdesignsystem.com

---

## 17. Evergreen (Segment)

Evergreen is Segment's React UI framework for building B2B SaaS products. It was built to serve the Segment customer data platform — a product used by technical users (engineers and data analysts) who need to configure data pipelines, schema mappings, and integrations. Evergreen's components have a clean, professional aesthetic that signals "serious business tool" without the heaviness of traditional enterprise systems like Carbon or Lightning. The library is smaller and more focused than many alternatives, which makes it easier to learn completely and extend systematically. Reach for Evergreen when building developer-adjacent B2B SaaS — products used by technical business users who want a professional, efficient interface without the complexity of a full enterprise framework.

**Canonical URL:** https://evergreen.segment.com

---

## 18. Gestalt (Pinterest)

Gestalt is Pinterest's design system, purpose-built for visual discovery and image-heavy content interfaces. Its defining expertise is in masonry grid layouts, image card components, and the interaction patterns around visual content — save, collection, board management, and visual search. Gestalt's pin component and board grid are among the most refined implementations of image-based browsing patterns in any open-source design system. The system also has strong documentation of hover and focus states in image-grid contexts, which are notoriously difficult to implement accessibly without disrupting visual flow. Reach for Gestalt when building visual discovery products, mood board tools, image collection managers, or any interface where the primary content unit is an image in a variable-height masonry grid.

**Canonical URL:** https://gestalt.pinterest.systems

---

*Use this catalog during the research phase to identify precedent, adapt established patterns, and avoid reinventing solutions that major organizations have already refined at scale.*
