# Design System Guidance

A design system is not a component library. A component library is a collection of UI building blocks. A design system is the governing architecture that makes those components consistent, maintainable, and scalable across teams, products, and time. The difference matters because design systems require governance, versioning, and documentation infrastructure that component libraries do not. This file provides the principles and practices for building, evolving, and governing a design system at any maturity level.

---

## Token Versioning and Deprecation Policy

Design tokens are an API. Like any API, they must be versioned, because the components and applications that consume them will break if tokens are renamed or removed without notice. Treating tokens as implementation details — things that can be changed quietly — is the single most common cause of unexpected visual regressions in design systems.

**Semantic versioning for token APIs:** Token changes should follow SemVer semantics. Adding a new token is a minor release. Changing a token's value (e.g., updating `--color-brand-primary` from `#1a73e8` to `#1557b0`) is a minor release if the semantic meaning is preserved, or a major release if it changes the intent. Renaming or removing a token is always a major release.

**Deprecation warnings before removal:** A token should never be removed without a deprecation period of at least one major version. During the deprecation period, the old token continues to work but emits a warning in development mode (or in Figma via variable mode annotation). The deprecation notice must include the replacement token and a migration date. Consumers who are warned well in advance can migrate on their own timeline; consumers who are surprised by breakage lose trust in the system.

**Migration guides required:** Every major release that removes or renames tokens must include a migration guide. The guide must list every changed token, its old name, its new name, and a search-and-replace pattern that can be applied programmatically. A migration that requires consumers to manually discover what changed is not a migration — it is a breakage.

**Never rename without aliasing:** When a token must be renamed — because the original name violated naming conventions, was ambiguous, or referred to a value rather than a purpose — the old name must be preserved as an alias pointing to the new name. The alias is deprecated and removed in the next major release after a documented migration window. This rule exists because token names propagate into codebases at scale: a rename without aliasing breaks every downstream consumer simultaneously.

---

## Multi-Brand Token Architecture

A multi-brand token architecture allows a single component library to support multiple brand expressions — different color palettes, typography scales, and spacing densities — without forking the component code. The architecture achieves this through three distinct token layers, each with a specific responsibility.

### Base Layer (Primitives)

The base layer contains raw values with no semantic meaning. These are the atoms from which all other tokens are composed. A primitive token describes what the value is, not what it means or where it is used.

Examples:
- `--color-blue-500: #1a73e8`
- `--color-blue-600: #1557b0`
- `--space-4: 4px`
- `--space-8: 8px`
- `--font-size-16: 16px`

Primitive tokens should never be used directly in component code. They exist only to feed the semantic layer. This constraint is essential: if components reference primitive tokens directly, you lose the ability to theme them without modifying component code.

### Semantic Layer (Roles)

The semantic layer maps primitive values to design roles. These tokens describe what a value is *for*, not what it *is*. The semantic layer is the theming boundary: swapping this layer changes the brand without touching components.

Examples:
- `--color-brand-primary: var(--color-blue-500)`
- `--color-interactive-default: var(--color-brand-primary)`
- `--color-surface-default: var(--color-white)`
- `--color-text-primary: var(--color-grey-900)`

Theme switching works by replacing the semantic layer. In practice, each brand defines its own semantic-layer token file that references its own base-layer primitives. Components import only semantic tokens; they have no knowledge of which primitive values are currently active.

### Component Layer (Scoped Tokens)

The component layer scopes semantic tokens to specific component contexts. Component-layer tokens exist because some components need values that differ from their semantic parents in specific states, variants, or sizes — but those differences should still be expressed as token relationships, not hardcoded values.

Examples:
- `--button-bg-primary: var(--color-interactive-default)`
- `--button-bg-primary-hover: var(--color-interactive-hover)`
- `--button-radius: var(--radius-md)`
- `--card-shadow: var(--shadow-sm)`

The component layer allows per-component overrides without polluting the semantic layer. It also makes the relationship between a component's visual properties and the broader token system explicit and auditable.

---

## Platform Translation

The token architecture is only valuable if it can be consumed by all the platforms where the design system is deployed. Token translation tools convert the source-of-truth token definitions into platform-native formats.

**Style Dictionary** is the standard open-source tool for token transformation. It reads a JSON or YAML token definition and transforms it into CSS custom properties, iOS Swift constants, Android XML resources, or any other format through a configurable pipeline. Style Dictionary is the right choice for most organizations because it is well-documented, widely adopted, and extensible. The transform pipeline should be version-controlled alongside the token definitions.

**Tokens Studio (Figma plugin)** enables the design-to-code handoff by syncing Figma variables and styles to a JSON format that Style Dictionary can consume. When Tokens Studio is integrated with the CI pipeline — so that token changes in Figma trigger a transform and publish cycle — the design-to-code gap closes. Designers change tokens in Figma; engineers receive the updated CSS variables in the next publish. Without this integration, token values diverge between design and code, which is the root cause of most "the design says one thing but the code does another" defects.

**Terrazzo** provides advanced token transform capabilities for organizations with complex multi-platform, multi-brand requirements. It handles cases that Style Dictionary handles awkwardly: mathematically derived scales (e.g., a spacing scale generated from a base value), conditional token resolution (different values for different contexts), and schema validation at the token definition level.

---

## Semantic-Layer Design

The semantic layer is the design system's most consequential architectural decision. Naming tokens by value — `--color-red`, `--color-blue-700`, `--font-size-14` — produces a token API that is fragile under theming and misleading to consumers. Naming tokens by purpose produces an API that survives brand evolution, makes component intent explicit, and is safe to search and audit.

**The cardinal rule:** Name tokens by PURPOSE, not by VALUE.

Wrong: `--color-red` (a value name — breaks if the brand switches to orange for danger)  
Right: `--color-surface-danger` (a purpose name — survives any palette change)

Wrong: `--font-size-14` (a value name — breaks if the scale changes)  
Right: `--font-size-caption` (a purpose name — survives a scale adjustment)

**Tokens should survive theme changes without rename.** A token that must be renamed every time the palette changes is not a semantic token — it is a named value. The test: if you change the value of `--color-surface-danger` from red to orange, does the name still accurately describe its purpose? If yes, the name is semantic. If no, the name was value-based.

**Hierarchical naming:** Semantic tokens should follow a consistent naming convention that expresses category, role, and variant:

```
--[category]-[role]-[variant]

--color-surface-default
--color-surface-subtle
--color-surface-danger
--color-text-primary
--color-text-secondary
--color-text-on-danger
--shadow-elevation-sm
--shadow-elevation-md
```

This convention makes the token vocabulary predictable: anyone who knows the convention can guess token names without consulting the documentation.

---

## Component API Conventions

Component APIs are the contract between the design system and its consumers. An inconsistent or poorly designed API creates confusion, increases adoption friction, and makes migration painful. These conventions should be enforced in code review and documented in every component's API reference.

**The `size` prop:** Always use named sizes — `sm`, `md`, `lg` — never raw pixel values. Pixel values expose implementation details and break the abstraction. Named sizes allow the design system to change the underlying pixel values across a version without requiring component consumers to update their code. `xs` and `xl` are acceptable additions when genuinely needed; avoid open-ended numeric scales that invite inconsistency.

**The `variant` prop:** Use a fixed vocabulary: `primary`, `secondary`, `ghost`, `destructive`. Additional variants should be exceptional and documented with rationale. Never create variants that duplicate semantic roles (e.g., `danger` alongside `destructive`) — this fragments the vocabulary and creates consumer confusion about which to use.

**Never expose internal implementation details as props.** A component whose API includes `backgroundColor`, `borderRadius`, or `fontWeight` props is not a component — it is a styled div. Internal visual properties should be determined by the component's variant and size, expressed through tokens. If a consumer needs visual customization beyond the declared variants, the appropriate tool is either a new variant (with a contribution RFC) or composition, not an escape hatch prop.

---

## Governance and Contribution Model

A design system without governance is a suggestion library. Governance is what transforms a collection of shared components into a system with a consistent, predictable trajectory that teams can plan around.

**RFC process for new tokens:** Any new semantic token must go through a Request for Comment process before being added to the system. The RFC must specify the token's name, its value, its purpose, which components will consume it, and whether it can be derived from existing tokens. The RFC process exists because new tokens are permanent: removing them requires a deprecation cycle, and adding unnecessary tokens pollutes the vocabulary.

**Voting quorum for breaking changes:** Changes that remove or rename tokens, alter component API signatures, or change default visual behavior require a minimum quorum of token stakeholders (typically design leads and engineering leads from all consuming products) to review and approve. The quorum threshold and voting period should be documented and consistent. This prevents one team's urgency from creating breakage for other teams.

**Single-owner per component:** Every component must have a named owner — a person who is responsible for its API, its documentation, its accessibility compliance, and its migration support. Ownerless components decay: they accumulate inconsistencies, miss accessibility regressions, and fall behind the token system evolution. Ownership should transfer explicitly when team members change roles.

**Design and engineering sign-off both required:** No component ships without explicit sign-off from both the design lead (verifying that it matches the designed spec and has appropriate variant coverage) and the engineering lead (verifying that the API is correct, the implementation is idiomatic, and the tests cover the declared states). This dual sign-off is not bureaucracy — it is the minimal process that prevents the design-code gap from re-opening on every release.

---

## Documentation Standard

A design system component that lacks complete documentation is not ready to ship. "Work in progress" documentation creates more confusion than no documentation at all, because it implies incomplete information without flagging what is missing. Every component must meet the documentation standard before it is published.

The documentation standard for every component requires all of the following:

**Purpose:** One or two sentences explaining what problem the component solves and when to use it rather than a different component. This is the most important section because it guides correct component selection.

**Anatomy:** A labeled diagram or description of every visual element within the component: the container, the label, the icon, the state indicator. Anatomy documentation prevents implementers from modifying internal structure and creating visual inconsistencies.

**Variants:** A complete catalog of all `variant` prop values with rendered examples and usage guidance. This section should answer "which variant should I use for X?" explicitly, not by inference.

**States:** All interactive and conditional states the component can occupy: default, hover, active, focus, disabled, loading, error. Each state must be documented with a rendered example. Missing state documentation is the primary cause of inconsistent state implementation across consuming applications.

**Do/Don't:** Paired examples showing correct and incorrect usage. Do/Don't documentation makes best practices concrete and prevents the most common misuse patterns.

**Code example:** A minimal, copy-paste-ready code example for the most common usage. Consumers should be able to get to a correct implementation in under two minutes.

**Accessibility notes:** The ARIA role, relevant ARIA attributes, keyboard interaction pattern, and focus management behavior. This section is not optional — every interactive component has accessibility requirements that cannot be inferred from the visual design alone.

---

## Design System Maturity Rubric

Design systems evolve through recognizable maturity stages. Understanding where a system currently sits determines what investments are most impactful, and prevents organizations from attempting Level 4 governance without first establishing Level 3 token infrastructure.

### Level 0: Ad-Hoc
Components are built per project with no shared library. Each application makes its own visual decisions about color, typography, and spacing. There is no coordination mechanism, no shared vocabulary, and no reuse. Visual inconsistency across products is structural, not accidental. The cost of this level is paid in designer and engineer time spent rediscovering the same decisions on every project.

### Level 1: Shared UI Kit
A Figma component library exists and is used by designers. Components have documented variants and states in Figma. There is no code counterpart — developers implement from designs directly. The design-to-code gap is the defining problem at this level: the Figma library and the code diverge over time because there is no synchronization mechanism.

### Level 2: Component Library
Coded components exist and are shared across applications as a package. The library has basic documentation. There are no design tokens — visual values are hardcoded in component styles. Theming is not possible without forking the library. The code-to-design gap is still present because Figma and code are not synchronized.

### Level 3: Token-Driven
Design tokens exist in both Figma and code, synchronized through an automated pipeline (Tokens Studio + Style Dictionary). A semantic layer separates component implementations from raw values. Basic theming is possible by swapping the semantic layer. This is the first level where multi-brand support becomes practical. Most organizations that have invested in a design system are at Level 2 or approaching Level 3.

### Level 4: Governed
The system has a documented contribution process, semantic versioning, a deprecation policy, and migration guides. Every component has a named owner and complete documentation meeting the standard described in this file. Design and engineering sign-off is required for all releases. The system is reliable enough that consuming teams plan roadmaps around it rather than working around it.

### Level 5: Platform
The system supports multiple brands, multiple platforms (web, iOS, Android, potentially desktop), and automated quality enforcement. Accessibility compliance is verified in CI (automated contrast checking, ARIA validation). Visual regression testing catches unintended changes before release. Token transforms produce platform-native output. The system is itself a product with a roadmap, a changelog, a support channel, and a measured adoption rate across consuming products.
