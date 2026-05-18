---
name: architecture-vocabulary
type: principles
version: 1.0.0
phase: 28.5
tags: [architecture, ousterhout, module, interface, depth, seam, adapter, leverage, locality]
last_updated: 2026-05-18
---

Source: mattpocock/skills (MIT) via Ousterhout, *A Philosophy of Software Design* — adapted with permission. See `../NOTICE` for the full attribution block.

# Architecture Vocabulary

A shared vocabulary for architectural reasoning across GDD skills. Same words mean the same things across `zoom-out`, `debug`, `analyze-dependencies`, `map`, `quality-gate`, and the planning skills — so agents and humans do not re-litigate "what did you mean by *module*" every conversation. Drawn from John Ousterhout's *A Philosophy of Software Design* via mattpocock's `improve-codebase-architecture/LANGUAGE.md`. GDD design-engineering analogs are surfaced where applicable — a UI component is a module, a design-token API is an interface, a token theme is an adapter.

This file is the canonical reference; skills cite it instead of re-defining terms inline.

## Module

A unit of code that hides implementation behind an interface. The module's value to its caller is everything inside that the caller no longer has to think about.

- A React component is a module — props are the interface, internal state and effects are the implementation.
- A skill is a module — frontmatter + workflow are the interface, the SKILL.md body is the implementation.
- See `./design-system-guidance.md` for the design-system-level analog: a component is a module; the token contract is its interface.

## Interface

What a module exposes to callers — function signatures, props, return types, error contracts, side-effect promises. The interface is what callers depend on; everything else they must NOT depend on. Small, stable interfaces are the goal.

- `function fetchUser(id: string): Promise<User>` is the interface. How `fetchUser` calls the database is implementation.
- A React component's `props` plus its rendered DOM contract is the interface; useState, useEffect, internal helpers are not.
- See `./component-authoring.md` (6-principle quality standard, esp. "Minimal API" and "Composability") for the component-library-level analog.

## Implementation

What the module hides — the code that does the work. Callers must not depend on it. Implementation is free to change as long as the interface holds.

- Switching `fetchUser` from REST to GraphQL without changing the call site = implementation change without interface change. Healthy.
- Renaming a private helper inside a React component does not break callers. Healthy.
- Exposing a class's "private" field that callers started reading turns implementation into de-facto interface. Unhealthy — fix by either formalizing the field as interface or stopping the leak.

## Depth

A module is **deep** when the interface is simple and the implementation hides genuine complexity. A module is **shallow** when the interface is as complex as the implementation — the wrapper adds no leverage and just shuffles the caller's mental load sideways.

- `Array.sort()` is deep — one method name hides ~50 lines of comparison-sort logic plus stable-ordering guarantees.
- `class Wrapper { getX() { return this.x; } }` is shallow — the wrapper adds no leverage; the caller has to know about `Wrapper` AND `x`.
- Asymmetry in the caller's favor is the goal. Shallow modules cost the caller mental complexity without paying it back.
- See `./component-authoring.md` "Minimal API" — a 1-prop `<Image src=... />` that handles preload, lazy load, srcset, blur placeholder, error fallback is the depth principle applied to component design.

## Seam

The boundary where two abstractions meet — where one module's interface is consumed by another. Seams are where you can replace one side without touching the other.

- **Hypothetical seam.** Only one implementation exists behind the boundary. Nothing yet validates the abstraction is meaningful — the seam is a possibility statement.
- **Real seam.** Two or more implementations exist; the boundary has been proved load-bearing by actual substitution. The seam is evidence.
- "One adapter = hypothetical seam; two adapters = real seam." See `## Principles` below.
- A `fetchUser` function backed only by Postgres is hypothetical; once a test double + a Postgres impl coexist, the seam is real.

## Adapter

A module that transforms one interface into another to enable substitution behind a seam. Adapters create seams; the count of distinct adapters approximates the seam's realism.

- A Redux-to-Zustand adapter exposes Redux's `store.dispatch` while wrapping a Zustand store underneath — callers keep their Redux API; the implementation moved.
- A design-token theme is an adapter: it transforms one token contract (`--color-bg`) into specific concrete values (`oklch(98% 0 0)` in light theme, `oklch(15% 0 0)` in dark).
- An `acp-client` plus an `asp-client` are two adapters over the same "peer-CLI" seam — the second one proves the seam is meaningful (Phase 27).

## Leverage

The ratio of work-the-system-does to interface-the-caller-touches. High leverage = high depth = the caller buys a lot of work for a little API. Architectural choices that maximize leverage reduce future cost across all callers.

- `<Image />` with a `src` prop that handles preload, lazy load, srcset generation, blur placeholder, error fallback — high leverage from a 1-prop API. Every caller benefits.
- A 5-prop `<Button variant size leftIcon rightIcon onClick />` that only renders a styled `<button>` — low leverage; the caller is still doing most of the configuration work.
- Leverage compounds. A high-leverage primitive used by 20 components multiplies the original investment 20×.

## Locality

Related changes happen in the same place; unrelated changes do not ripple. Spatial cohesion of the change footprint. Locality is what makes a codebase "easy to modify" — you can find the thing and change just the thing.

- Healthy: adding a new chart type touches `chart-types/<new-type>.ts` only.
- Broken: adding a new chart type touches `chart-types.ts` AND `chart-renderer.ts` AND `chart-config.ts` AND `chart-styles.css` AND `chart-icons.svg`. The system is forcing the author to remember 5 files for a 1-concept change.
- Test it with the **deletion test** (see `## Principles`) — if removing the feature requires touching the same N files, locality is asymmetric and the abstraction is leaking.

## Principles

Three load-bearing rules that operationalize the vocabulary above. Each one is a question you can ask during review.

- **Deletion test.** Can you delete the implementation and the interface still tells callers what they could do? If yes, the interface is well-defined and the module is properly encapsulated. If no, the interface is leaking implementation — callers are reaching past the abstraction. Apply this when reviewing a new module: imagine deleting the body; can a reader still describe the surface from the signature alone?
- **Interface is the test surface.** Tests target the interface; implementation churn does not churn tests. If a refactor that preserves behavior breaks tests, the test was implementation-coupled — fix the test, not the refactor. This is also the diagnostic for whether you have a real interface at all: if you cannot test through it, the interface is too narrow or the implementation is leaking.
- **One adapter = hypothetical seam; two adapters = real seam.** One substitution is a possibility statement; two substitutions are evidence the boundary is meaningful. Do not over-design seams without ≥2 implementations — the second one teaches you what the seam actually needs. This is YAGNI for boundaries: ship the first impl, extract the seam when the second one arrives.

## How this applies to skill authoring

Skills are modules. The frontmatter (`name`, `description`, `tags`) plus the workflow signature is the interface; the SKILL.md body is the implementation. A deep skill has a small, predictable interface (clear when to invoke, clear output shape) hiding genuine workflow value. A shallow skill is one whose body adds little beyond what the frontmatter already implies — those skills should be either deepened or deleted. The skill-authoring contract's 100-line cap is the depth principle applied to skills: if the implementation cannot fit in 100 lines, either the workflow is too broad (split it) or supporting domain content should move to `reference/*.md` (extract-then-link, D-10). See `./skill-authoring-contract.md` for the full spec.

## Cross-references

- Design-system-level analog — component-as-module, design-token-as-interface: see `./design-system-guidance.md`.
- Component-library-level analog — the 6-principle quality standard (Minimal API, Composability, ...): see `./component-authoring.md`.
- Skill-authoring application — extract-then-link, 100-line cap, refs-one-level-deep: see `./skill-authoring-contract.md`.
- `CONTEXT.md` glossary format (project-scoped ubiquitous language alongside this vocabulary): see `./context-md-format.md`.
- ADR format (heavier project-scoped decisions about architectural seams): see `./adr-format.md`.
