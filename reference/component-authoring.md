# Component Authoring Principles

Source: Emil Kowalski's work on Sonner, Vaul, and cmdk — synthesised from his published writing and talks. See also: `reference/framer-motion-patterns.md`, `reference/motion-advanced.md`.

Use this file when authoring, reviewing, or auditing UI components. The 6 principles apply as a lens during code review and design verification. Each principle has a grep-able audit signal.

---

## The 6 Principles

### P-01: Minimal API Surface

> Expose only what the consumer needs. Every prop is a contract you must maintain forever.

A component with the right API surface works in 1 line for 80% of cases and 3 lines for 95% of cases. A component that requires 7 props for basic usage has too much surface.

**Audit signal:**
```bash
# Count required (non-optional) props in a component interface
grep -E "^\s+\w+: " src/components/Button.tsx | grep -v "?" | wc -l
```

**Thresholds:**
- ≤5 props total: excellent
- 6–9 props total: acceptable if logically grouped
- ≥10 props: flag for decomposition

**Pattern — variant over prop explosion:**
```tsx
// BAD — prop explosion
<Button color="blue" size="md" rounded={true} shadow={true} uppercase={false} />

// GOOD — variant collapses 5 props to 1
<Button variant="primary" size="md" />
```

---

### P-02: Composability Over Configuration

> Components should compose, not configure. Accepting `backgroundColor` or `textColor` is a sign the abstraction boundary is wrong.

The right abstraction lets consumers build what they need by combining small pieces, not by passing increasingly specific configuration. Slot-based APIs > configuration-object APIs.

**Audit signal:**
```bash
# Configuration props that should be design tokens instead
grep -rE "(backgroundColor|textColor|borderRadius|fontSize)=" src/components/ --include="*.tsx"
```

**Pattern — slot composition:**
```tsx
// BAD — too much configuration
<Card title="Hello" subtitle="World" icon="user" rightContent={<Badge />} />

// GOOD — slot composition; parent controls layout
<Card>
  <Card.Header>
    <Card.Icon><UserIcon /></Card.Icon>
    <Card.Title>Hello</Card.Title>
    <Card.Subtitle>World</Card.Subtitle>
    <Badge />
  </Card.Header>
</Card>
```

---

### P-03: Sensible Defaults

> The zero-config case should work and look correct. Options are for exceptions.

A component with sensible defaults doesn't require the consumer to know its internals. The defaults encode the design system's opinion about what "normal" looks like.

**Audit signal:**
```bash
# Props with no default values (every prop is required = red flag)
grep -E "^\s+\w+: " src/components/Toast.tsx | grep -v "?" | wc -l
```

**The Sonner model:** `<Toaster />` with zero props renders a toast system that follows the OS color scheme, positions correctly on all viewports, stacks properly, and auto-dismisses at a sensible duration. All options exist — but the zero-prop case works.

**Anti-pattern:** Required props for things with a logical default (e.g., `position` on a modal that should always default to `center`).

---

### P-04: Animation as State Communication

> Transitions communicate state change. They are not decoration. An animation that fires without a state change is noise.

Every motion in a component should answer: "What did the system just do?" If the animation doesn't have a clear answer, remove it.

**Audit signal:**
```bash
# Animations not tied to state change (decorative loops = red flag)
grep -rE "animate.*loop|animation.*infinite|keyframes.*repeat" src/components/ --include="*.tsx"
```

**The Sonner model:**
- Toast enters → communicates: "event occurred"
- Toast stacks → communicates: "multiple events queued"
- Toast exits → communicates: "event acknowledged or expired"
- No animation fires without a state change triggering it

**Thresholds:**
- All animations tied to state: excellent
- ≤1 decorative animation (e.g., a loading shimmer): acceptable
- ≥2 decorative animations: flag for review

See `reference/motion-advanced.md` for implementation patterns.

---

### P-05: Accessibility Before Visuals

> If a component isn't accessible by keyboard and screen reader, it isn't done. Accessibility is not a post-processing step.

Build the ARIA contract before the visual. The visual is a rendering of the semantic layer, not the other way around.

**Audit signal:**
```bash
# Interactive divs/spans without ARIA role (missing semantic contract)
grep -rE "<(div|span)[^>]*onClick" src/components/ --include="*.tsx" | grep -v "role="
```

**Required ARIA contracts by component type:**

| Component | Required attributes |
|---|---|
| Dialog / Modal | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` |
| Combobox / Select | `role="combobox"`, `aria-expanded`, `aria-controls` |
| Menu | `role="menu"`, `role="menuitem"`, keyboard trap |
| Toast / Alert | `role="status"` (polite) or `role="alert"` (assertive) |
| Toggle / Switch | `role="switch"`, `aria-checked` |
| Tabs | `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected` |
| Tooltip | `role="tooltip"`, `aria-describedby` on trigger |

---

### P-06: Edge Case Honesty

> Document the cases where the component fails. If you know it breaks with strings longer than 30 characters, say so.

Undocumented edge cases become production bugs. A component spec that acknowledges failure modes is more trustworthy than one that claims universal correctness.

**Audit signal:**
```bash
# Look for documented edge cases
grep -rE "// KNOWN:|// EDGE:|// LIMIT:" src/components/ --include="*.tsx"
```

**Template for component edge case documentation:**
```tsx
// KNOWN: Toast title truncates at ~80 chars on 320px viewport; use short titles
// KNOWN: Stacking > 5 toasts simultaneously is unsupported; excess toasts are queued
// EDGE: If `duration` is set to Infinity, a visible dismiss button is required
```

The presence of these comments is a quality signal, not a code smell. It means the author thought about the boundary conditions.

---

## Lens Application in Audits

When auditing a component, apply these six principles as a checklist:

| Principle | Pass condition | Fail condition |
|---|---|---|
| P-01 Minimal API | ≤9 props; zero-config case works | ≥10 props; required props for things with defaults |
| P-02 Composability | Slot-based composition; no style props | `backgroundColor`/`textColor` props present |
| P-03 Defaults | Zero-prop case renders correctly | Most props required for basic usage |
| P-04 Animation | All motion tied to state change | Decorative loops or orphaned animations present |
| P-05 Accessibility | ARIA contract complete; keyboard navigable | `onClick` on `div`; missing `role`; no keyboard trap |
| P-06 Edge honesty | Known limits documented with `// KNOWN:` | No documentation of failure modes |

---

## Wiring

**design-auditor:** Apply as an optional sub-check within Pillar 7 (Micro-Polish) for component-heavy UIs. Cite principle ID (P-01 through P-06) in findings.

**design-discussant:** In `--spec` mode, ask one component-authoring question per component under review: "For [ComponentName]: does the API surface expose only what consumers need, or are there configuration props that reveal implementation details?"

**design-verifier:** When verifying component-library phases, include P-01 through P-06 in the must-have checklist as a component quality gate.
