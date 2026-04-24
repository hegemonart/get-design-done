# Authority Feeds — Whitelist

> **Scope:** Curated whitelist of **design authorities** — sources that ship specs, guidelines, or named-practitioner curation. Consumed by `agents/design-authority-watcher.md` at runtime. Rejected kinds are listed explicitly below and enforced by `scripts/tests/test-authority-rejected-kinds.sh`.
>
> **Anti-slop thesis:** No Dribbble. No Behance. No LinkedIn. No generic trending aggregators. See `.planning/PROJECT.md` and `.planning/phases/13.2-external-authority-watcher/13.2-CONTEXT.md` §D-08.

**Last reviewed:** 2026-04-24
**Feed count:** 28 (updated each time a feed is added or removed)

---

## Spec sources (4-5 feeds)

- **[WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)** — `kind: spec-source` · `url: https://github.com/w3c/aria-practices/releases.atom` · `cadence-hint: monthly` · *Normative accessibility patterns from the W3C ARIA working group; release-tagged on each APG update.*
- **[Material Design 3](https://m3.material.io/)** — `kind: spec-source` · `url: https://github.com/material-components/material-web/releases.atom` · `cadence-hint: weekly` · *Google's design system release notes; new tokens and components land here first.*
- **[Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)** — `kind: spec-source` · `url: https://developer.apple.com/news/releases/rss/releases.rss` · `cadence-hint: irregular` · *Apple developer release feed — HIG updates ship alongside SDK announcements.*
- **[Fluent 2 Design System](https://fluent2.microsoft.design/)** — `kind: spec-source` · `url: https://github.com/microsoft/fluentui/releases.atom` · `cadence-hint: weekly` · *Microsoft's cross-platform design system; normative component API and token changes.*
- **[W3C Design Tokens Community Group](https://www.w3.org/community/design-tokens/)** — `kind: spec-source` · `url: https://github.com/design-tokens/community-group/commits/main.atom` · `cadence-hint: monthly` · *Draft tokens format spec; commit feed surfaces spec edits before formal publication.*

## Component systems (6-8 feeds)

- **[Radix UI](https://www.radix-ui.com/)** — `kind: component-system` · `url: https://github.com/radix-ui/primitives/releases.atom` · `cadence-hint: weekly` · *Unstyled accessible primitives; release notes document ARIA behavior changes.*
- **[shadcn/ui](https://ui.shadcn.com/)** — `kind: component-system` · `url: https://github.com/shadcn-ui/ui/releases.atom` · `cadence-hint: weekly` · *Copy-paste component library built on Radix + Tailwind; release notes map to new patterns.*
- **[Shopify Polaris](https://polaris.shopify.com/)** — `kind: component-system` · `url: https://github.com/Shopify/polaris/releases.atom` · `cadence-hint: weekly` · *Shopify admin design system; commerce-tuned component patterns.*
- **[IBM Carbon](https://carbondesignsystem.com/)** — `kind: component-system` · `url: https://github.com/carbon-design-system/carbon/releases.atom` · `cadence-hint: weekly` · *IBM's enterprise design system; strong on data-dense patterns and accessibility.*
- **[GitHub Primer](https://primer.style/)** — `kind: component-system` · `url: https://github.com/primer/react/releases.atom` · `cadence-hint: weekly` · *GitHub's design system; opinionated developer-tool patterns.*
- **[Atlassian Design System](https://atlassian.design/)** — `kind: component-system` · `url: https://github.com/atlassian/design-system/releases.atom` · `cadence-hint: weekly` · *Jira/Confluence design system; strong on collaboration and editor patterns.*
- **[Ant Design](https://ant.design/)** — `kind: component-system` · `url: https://github.com/ant-design/ant-design/releases.atom` · `cadence-hint: weekly` · *Enterprise React component library with deep form and table patterns.*
- **[Mantine](https://mantine.dev/)** — `kind: component-system` · `url: https://github.com/mantinedev/mantine/releases.atom` · `cadence-hint: weekly` · *React components with hooks-first architecture; strong accessibility defaults.*

## Research institutions (2-3 feeds)

- **[Nielsen Norman Group Articles](https://www.nngroup.com/articles/)** — `kind: research` · `url: https://www.nngroup.com/feed/rss/` · `cadence-hint: weekly` · *UX research articles from the Nielsen Norman Group; heuristic updates and usability findings ship here.*
- **[Laws of UX](https://lawsofux.com/)** — `kind: research` · `url: https://github.com/jonyablonski/laws-of-ux/releases.atom` · `cadence-hint: monthly` · *Jon Yablonski's curated catalogue of psychology-rooted UX principles; release feed tracks new laws and revisions.*
- **[Baymard Institute](https://baymard.com/)** — `kind: research` · `url: https://baymard.com/blog/rss` · `cadence-hint: monthly` · *E-commerce UX research with empirical benchmarks; public surface of their large-scale usability studies.*

## Named practitioners (10-12 feeds)

- **[Adam Wathan](https://adamwathan.me/)** — `kind: named-practitioner` · `url: https://adamwathan.me/feed.xml` · `cadence-hint: monthly` · *Tailwind creator; utility-first CSS, component API design, refactoring patterns.*
- **[Ryan Mulligan](https://ryanmulligan.dev/)** — `kind: named-practitioner` · `url: https://ryanmulligan.dev/feed.xml` · `cadence-hint: monthly` · *CSS craft at spec-adjacent depth; cascade layers, container queries, color functions.*
- **[Rachel Andrew](https://rachelandrew.co.uk/)** — `kind: named-practitioner` · `url: https://rachelandrew.co.uk/feed/atom` · `cadence-hint: monthly` · *CSS Working Group member; grid, layout, and evolving layout-engine features.*
- **[Josh W. Comeau](https://www.joshwcomeau.com/)** — `kind: named-practitioner` · `url: https://www.joshwcomeau.com/rss.xml` · `cadence-hint: monthly` · *Interactive explainers on CSS, animation, and React rendering; durable reference-quality deep dives.*
- **[Ahmad Shadeed](https://ishadeed.com/)** — `kind: named-practitioner` · `url: https://ishadeed.com/rss.xml` · `cadence-hint: monthly` · *CSS layout and component articles grounded in real interface patterns.*
- **[Sara Soueidan](https://www.sarasoueidan.com/)** — `kind: named-practitioner` · `url: https://www.sarasoueidan.com/feed.xml` · `cadence-hint: quarterly` · *SVG, accessibility, and inclusive design with spec-level rigor.*
- **[Lea Verou](https://lea.verou.me/)** — `kind: named-practitioner` · `url: https://lea.verou.me/feed/atom` · `cadence-hint: quarterly` · *CSS Working Group invited expert; writes about the spec surface before it ships.*
- **[Scott Jehl](https://scottjehl.com/)** — `kind: named-practitioner` · `url: https://scottjehl.com/feed/` · `cadence-hint: monthly` · *Progressive enhancement and web performance; long-form durable analysis.*
- **[Heydon Pickering](https://heydonworks.com/)** — `kind: named-practitioner` · `url: https://heydonworks.com/feed.xml` · `cadence-hint: irregular` · *Accessibility-first component design; Inclusive Components author.*
- **[Una Kravets](https://una.im/)** — `kind: named-practitioner` · `url: https://una.im/feed.xml` · `cadence-hint: monthly` · *Chrome DevRel on CSS; surfaces and explains new platform capabilities.*
- **[Don Norman — jnd.org](https://jnd.org/)** — `kind: named-practitioner` · `url: https://jnd.org/feed/` · `cadence-hint: monthly` · *Don Norman's essays on emotional design, affordances, cognitive design, and human-centered AI. Primary source for `reference/emotional-design.md`.*
- **[Vitsœ — Dieter Rams](https://www.vitsoe.com/gb/about/good-design)** — `kind: named-practitioner` · `url: https://www.vitsoe.com/feed` · `cadence-hint: irregular` · *Canonical source for Rams's 10 Principles of Good Design. Published by Vitsœ, who worked directly with Rams at Braun. Primary source for the Rams Lens in `reference/checklists.md`.*

## User-added Are.na channels (user-extensible)

Are.na channels are user-curated reference collections. Add your own channel by appending an entry to this section following the schema shown in the commented template below. The watcher fetches `https://api.are.na/v2/channels/<slug>/contents` and treats each block addition as a new entry.

<!--
- **[My Design Refs](https://are.na/my-handle/my-design-refs)** — `kind: arena` · `url: https://api.are.na/v2/channels/my-design-refs/contents` · `cadence-hint: irregular` · *Personal channel of pattern references.*
-->

## Rejected kinds

The following hosts and feed kinds are **explicitly rejected** from this whitelist. This list is enforced by `scripts/tests/test-authority-rejected-kinds.sh` — any merge that adds a matching URL fails CI.

- **dribbble.com** — visual-trend aggregator; no normative content, no named-practitioner curation.
- **behance.net** — portfolio aggregator; same category.
- **linkedin.com** — social feed; signal-to-noise ratio incompatible with the plugin's anti-slop thesis.
- **medium.com/topic/\*** — generic topic feeds; named Medium authors may appear as `named-practitioner` entries, but topic-level feeds are rejected wholesale.
- **"trending"-style aggregators** (e.g., product-hunt daily digests, "top 10 UI" roundups) — curatorial output indistinguishable from advertising.

Rationale: the whitelist is restricted to sources that ship specs, guidelines, or named-practitioner curation (PROJECT.md, ROADMAP.md SC 8, CONTEXT.md D-08).

---

**How to propose a new feed:** open a PR that adds an entry to the appropriate `## <kind>` section. Are.na channel additions go in the Are.na section and do not require approval beyond CI-green. All other additions are reviewed against the anti-slop thesis.
