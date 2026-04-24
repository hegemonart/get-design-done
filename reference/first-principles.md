# First Principles — Invariant Design Constraints

> These are the three invariants that no design decision can override. They are facts about human biology and cognition, not preferences or conventions. Every design choice is downstream of these three constraints.

Use during the brief/discover stage (`design-discussant`) as a sanity check: does the proposed direction respect all three invariants? Use during verify as a reducibility check: can each element be removed without breaking the user's ability to complete their goal?

---

## Invariant 1: Body

The user has a physical body with physiological limits. No amount of design skill overrides human motor physiology.

**Principle → Code pairs:**

| Principle | Code Pattern |
|---|---|
| Touch targets must accommodate tremor and fat-finger error | `min-h-[44px] min-w-[44px]` on all interactive elements |
| Precision degrades with distance (Fitts's Law) | Destructive actions separated from primary actions by ≥24px or significantly smaller |
| Scroll fatigue is real | Sticky headers + back-to-top anchor for content > 3 viewport heights |
| Physical feedback confirms action | `scale(0.96)` press feedback on all clickable surfaces |
| Eye strain limits reading distance | Body text ≥16px; line-length 60–75ch |

**Reducibility check:** Can the user complete this task without a mouse? Without a precise pointer? On a 4-inch screen in a moving vehicle?

---

## Invariant 2: Attention

Attention is finite and non-renewable per unit of time. Every element on screen competes for the same fixed budget.

**Principle → Code pairs:**

| Principle | Code Pattern |
|---|---|
| Attention capacity: 5–9 items (Miller's Law) | Navigation: ≤7 top-level items; dropdown > 7 items gets search |
| Decision cost grows with choice count (Hick's Law) | Pricing: ≤3 tiers; feature lists: ≤4 items per group |
| One primary action per screen | Single `.btn-primary` per viewport; all others `.btn-secondary` or `.btn-ghost` |
| Animation hijacks attention | Motion only on state change; no decorative looping animations |
| Progressive disclosure reduces overload | Advanced options behind disclosure trigger, not visible by default |

**Reducibility check:** If you removed 30% of the elements on this screen, would task completion rate drop? If not, remove them.

---

## Invariant 3: Memory

Working memory holds approximately 7 items and degrades rapidly within seconds. Design that requires users to remember things between screens fails.

**Principle → Code pairs:**

| Principle | Code Pattern |
|---|---|
| Recognition over recall (H-06) | Visible navigation labels, not icon-only; breadcrumbs on deep paths |
| Context must be preserved | Multi-step forms: prior-step summary visible; form state not cleared on back-navigate |
| Error memory fades fast | Inline validation: errors adjacent to the field that caused them |
| Completion status reduces anxiety | Progress indicators: `Step 2 of 4`; Zeigarnik Effect — show percentage done |
| Last action should be reversible | Undo available for destructive/irreversible actions within 5 seconds |

**Reducibility check:** Does this screen require the user to remember something from a previous screen? If yes, surface that context inline.

---

## The Reducibility Test

For any proposed design element, apply in order:

1. **Body test** — Is this element reachable by a person with limited motor precision on a small screen?
2. **Attention test** — Does this element earn its place by directly supporting the primary task?
3. **Memory test** — Does this element surface context the user would otherwise need to remember?

If an element fails all three tests, it is purely decorative. Decorative elements are not forbidden — but they are not invariant-justified, and they are the first candidates for removal when performance or clarity is at risk.

---

## Wiring to Design Discussant

When `design-discussant` runs the brief stage, it prepends this invariants question before the main interview:

> "Before we discuss the design direction, let me confirm three constraints: (1) Are there any accessibility requirements for motor-impaired users? (2) Is the primary use case on mobile or desktop — or both? (3) Are there any multi-step flows where the user must carry context between screens?"

Answers are recorded as D-XX decisions prefixed `[Invariant]` in STATE.md.

---

## Relationship to Other References

- `reference/heuristics.md` — H-01 through H-10 are the behavioral-level expression of Invariants 2 and 3
- `reference/emotional-design.md` — Invariant 1 (Body) maps to the Visceral level; Invariants 2–3 map to the Behavioral level
- `reference/component-authoring.md` — P-01 through P-06 are the component-level expression of all three invariants
