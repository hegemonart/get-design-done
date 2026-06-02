# UX Writing - Domain Index

This is the domain entry-point for UX writing. Load this file when the task
involves voice, tone, or the copy standards that govern text a user reads in
the product: button labels, error messages, empty states, onboarding copy, and
microcopy. It does not cover the engineering side of localization (see
`reference/responsive.md` for string expansion budgets and `Intl.*` APIs); it
does not cover label position in forms or information architecture (see
`reference/interaction.md`).

---

## Fragment Index

→ **`reference/brand-voice.md`** (Phase 24) - use when establishing or
auditing tone: 6 voice axes (Formal-Casual, Serious-Playful, etc.), 12
archetypes, tone-by-context matrix, industry-context palettes

→ **`reference/style-vocabulary.md`** (Phase 24) - use when confirming an
aesthetic direction has a compatible voice register: the `Avoid For` column
cross-checks brand fit; `Best For` confirms product-type alignment

→ **`reference/anti-patterns.md`** - use when auditing existing copy: the
BAN/SLOP grep patterns surface copy violations (AI-tells, filler phrases)
alongside visual ones

---

## Rules of Thumb

**1. Voice axes are independent from archetypes.**
Pick a position on each of the 6 axes first (Formal-Casual, Serious-Playful,
Authoritative-Supportive, and so on), then layer an archetype on top. The
archetype does not determine the axis position - they are orthogonal dimensions
in `reference/brand-voice.md`.

**2. Never use placeholder text as the sole label for a form field.**
It disappears on focus, fails WCAG 1.3.5, and collapses under translation.
Top-aligned labels are the only position that absorbs localization expansion
without breaking layout.

**3. Error messages follow a three-clause structure: what happened, why, what
to do.**
State the event in past tense, explain the cause in one clause, give a present
tense imperative for recovery. No tech jargon. Never blame the user.

**4. Shift toward supportive tone during error, empty-state, and onboarding
moments.**
Even a formally-voiced product should move on the axis toward supportive when
the user is at risk of abandonment. The per-context tone matrix in
`reference/brand-voice.md` provides the exact adjustment.

---

## Cross-Domain See Also

- String expansion budgets constrain copy length: `reference/responsive.md`
- Error copy paired with form patterns: `reference/interaction.md`
- Empty-state copy pairs with onboarding pattern: `reference/interaction.md`
- Style direction voice register cross-check: `reference/style-vocabulary.md`
