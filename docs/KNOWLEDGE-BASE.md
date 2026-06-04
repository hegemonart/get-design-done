# GDD Local Design Knowledge Base

Get Design Done is not just an agent orchestrator. It gives AI coding agents a local design brain.

The plugin ships a broad design reference library under `reference/`. The repository contains 189 reference files covering design systems, interaction patterns, accessibility, visual quality, platform conventions, implementation guidance, and verification rubrics.

Agents use this material during the pipeline so they do not have to rediscover basic design rules from scratch or rely on live web search for every judgment.

## What The Knowledge Base Covers

### Accessibility And Inclusion

- WCAG 2.1 AA thresholds
- contrast requirements
- target sizes
- focus visibility
- keyboard navigation
- reduced motion
- i18n and text expansion
- screen-reader language handling

Representative files:

- `reference/accessibility.md`
- `reference/contrast-advanced.md`
- `reference/i18n.md`
- `reference/responsive.md`

### Visual Design Foundations

- color systems
- typography
- spacing
- grids
- composition
- visual hierarchy
- surfaces and elevation
- iconography

Representative files:

- `reference/color.md`
- `reference/color-theory.md`
- `reference/typography.md`
- `reference/proportion-systems.md`
- `reference/visual-hierarchy-layout.md`
- `reference/composition.md`
- `reference/surfaces.md`

### Interaction And Product UX

- forms
- empty states
- onboarding
- error recovery
- conversational UI
- information architecture
- data visualization
- UX writing

Representative files:

- `reference/interaction.md`
- `reference/form-patterns.md`
- `reference/error-recovery.md`
- `reference/ux-writing.md`
- `reference/copy-quality.md`
- `reference/information-architecture.md`
- `reference/data-visualization.md`

### Component Guidance

GDD includes component-level references for common UI primitives, so agents can reason about expected states, anatomy, accessibility, and implementation details.

Examples:

- `reference/components/button.md`
- `reference/components/input.md`
- `reference/components/modal-dialog.md`
- `reference/components/select-combobox.md`
- `reference/components/table.md`
- `reference/components/tabs.md`
- `reference/components/toast.md`
- `reference/components/tooltip.md`

### Design Systems And Frameworks

The reference library includes system-specific implementation guidance for common frontend stacks and design-system patterns.

Representative files:

- `reference/design-system-guidance.md`
- `reference/design-systems-catalog.md`
- `reference/systems/shadcn.md`
- `reference/systems/tailwind.md`
- `reference/frameworks/nextjs.md`
- `reference/frameworks/vite-react.md`
- `reference/frameworks/storybook.md`

### Motion And Polish

- timing
- easing
- animation constraints
- reduced-motion behavior
- visual tells of low-quality AI UI

Representative files:

- `reference/motion.md`
- `reference/framer-motion-patterns.md`
- `reference/visual-tells.md`
- `reference/anti-slop-rubric.md`

### Quality Rubrics And Anti-Patterns

GDD gives agents explicit rubrics for judging whether a design is coherent, accessible, and production-ready.

Representative files:

- `reference/audit-scoring.md`
- `reference/checklists.md`
- `reference/heuristics.md`
- `reference/anti-patterns.md`
- `reference/anti-slop-rubric.md`
- `reference/known-failure-modes.md`

### Domain Patterns

GDD includes domain-specific guidance for common product categories.

Representative files:

- `reference/domains/finance-patterns.md`
- `reference/domains/healthcare-patterns.md`
- `reference/domains/gaming-patterns.md`
- `reference/domains/civic-patterns.md`

## How Agents Use It

### During Brief

The brief stage captures the problem, audience, constraints, success metrics, and scope. The knowledge base gives the agent a vocabulary for asking better questions and spotting missing design constraints.

### During Explore

Explore maps the current UI system and compares it against known design-system, accessibility, motion, and component patterns.

### During Plan

Plan turns findings into atomic tasks with clear acceptance criteria. The reference library helps the planner avoid vague tasks such as "make it modern" and produce concrete work such as "replace hardcoded spacing with the existing 8px token ladder."

### During Design

Design executors use the references to implement changes that fit the product instead of inventing a new visual language.

### During Verify

Verify uses the audit rubrics, accessibility thresholds, anti-pattern catalog, and recorded project decisions to check whether the final UI actually satisfies the brief.

## Project-Specific Intel

The bundled reference library is general. GDD also builds local project knowledge under `.design/intel/`.

That intel can include:

- token fan-out
- component relationships
- design decisions
- file-to-surface mappings
- code references
- archived learnings
- integration status

This gives agents fast access to the design context of the current repo. Over time, the project becomes easier to work on because GDD does not have to rediscover the same design facts every cycle.

## Why This Matters

Most AI UI generation starts with a prompt and a model's general taste.

GDD starts with:

- the user's brief
- the existing product system
- a local design reference library
- project-specific intel
- verification criteria

That is the difference between a plausible mockup and a design change that can survive production review.
