# [Component Name] — Benchmark Spec

> **Template version**: 1.0 (Phase 16)
> Replace every placeholder in `[brackets]`. Delete this block before committing.
> Max 350 lines. Every section must be present even if brief.
> See `agents/component-benchmark-synthesizer.md` for authoring rules.

---

**Harvested from**: [N] design systems · [date]
**Wave**: [1 | 2 | 3 | 4 | 5] · **Category**: [Inputs | Containers | Feedback | Navigation | Advanced]
**Spec file**: `reference/components/[name].md`

---

## Purpose

[One paragraph: what this component is, its core job, and when to use it vs. alternatives.
Cite convergence: "(Material 3, Carbon, Polaris agree: …)"]

---

## Anatomy

[Describe the structural parts. Use a numbered or bulleted list of named elements.
Mark each as optional or required.]

```
[ASCII diagram or bulleted tree showing component structure]
```

| Part | Required | Notes |
|------|----------|-------|
| [part] | Yes/No | [brief description] |

---

## Variants

[List the canonical variant set. For each, note which systems define it and what
distinguishes it visually/behaviorally.]

| Variant | Description | Systems |
|---------|-------------|---------|
| [variant] | [what it is] | [Material 3, Carbon, …] |

**Norm** (≥4/18 systems agree): [what the majority agrees on for variant naming/behavior]
**Diverge**: [where systems meaningfully differ and why]

---

## States

[All interaction states the component must handle. Include visual and semantic description.]

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | [description] | — |
| hover | pointer over | [description] | — |
| focus | keyboard focus | focus-visible ring | — |
| active / pressed | mousedown / Space/Enter | [description] | — |
| disabled | `disabled` attr | [description] | `aria-disabled="true"` |
| loading | [if applicable] | [description] | `aria-busy="true"` |
| error | [if applicable] | [description] | `aria-invalid="true"` |

---

## Sizing & Spacing

[Token-based sizing guidance. Reference `reference/typography.md` and `reference/surfaces.md`
for typographic and radius rules.]

| Size | Height | Padding H | Font | Notes |
|------|--------|-----------|------|-------|
| sm | [value] | [value] | [value] | |
| md (default) | [value] | [value] | [value] | |
| lg | [value] | [value] | [value] | |

**Norm**: [what most systems agree on for sizing ratios]

---

## Typography

[Any typographic constraints: weight, size relative to body, line-height cap, truncation rules.]

Cross-link: `reference/typography.md` — [relevant section]

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `[role]`
> **Required attributes**: `[aria-* attrs]`

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — [pattern URL] — W3C — [access date]*

| Key | Action |
|-----|--------|
| [key] | [action] |

### Accessibility Rules

- [Rule 1 — e.g., must have visible label or `aria-label`]
- [Rule 2 — e.g., focus-visible ring must not be suppressed]
- [Rule 3 — e.g., disabled state uses `aria-disabled`, not `disabled` attr, if interactive]

Cross-link: `reference/accessibility.md` — [relevant section]

---

## Motion

[Animation guidance for entry, exit, state transitions. Reference `reference/motion.md`.]

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| [transition] | [ms] | [easing] | |

**BAN**: [any motion anti-patterns specific to this component]

Cross-link: `reference/motion.md` — [relevant section]

---

## Do / Don't

### Do
- [Positive practice 1] *([System])*
- [Positive practice 2] *([System])*
- [Positive practice 3] *([System])*

### Don't
- [Anti-practice 1] *(diverges from [N] systems)*
- [Anti-practice 2]
- [Anti-practice 3]

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| [BAN-XX] | [brief name] — `reference/anti-patterns.md#ban-xx` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| [claim] | [System1, System2, System3] |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

Patterns to detect common implementation failures (used by `design-auditor`):

```bash
# Missing accessible label on icon-only variant
grep -rn 'aria-label\|aria-labelledby' src/ | grep -v '[Component]'

# [Additional grep pattern with comment explaining what it detects]
```

---

## Failing Example

What a broken implementation of this component looks like, and how to detect it:

```[html|jsx|tsx]
<!-- BAD: [describe the failure] -->
[broken code snippet]
```

**Why it fails**: [explanation]
**Grep detection**: `grep -rn '[pattern]' src/`
**Fix**: [one-line fix or cross-link to reference]
