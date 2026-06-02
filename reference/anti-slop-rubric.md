---
name: anti-slop-rubric
type: reference
version: 1.0.0
phase: 50
tags: [anti-slop, verb-axes, lens-tag, orthogonal, aesthetic-slop, directness, distinctness, hierarchy, authenticity, density]
last_updated: 2026-06-03
---

# Anti-slop Rubric (Verb Axes)

The 7-pillar audit in `reference/audit-scoring.md` answers "is the typography wrong,
is the contrast failing, is the spacing off-grid?". This rubric answers a different
question: "is the work generically AI-default, even when every pillar passes?". A
screen can clear all seven pillars and still read as a template a model produced
without a brief. These five axes name that gap.

## Orthogonal by design

This is an ORTHOGONAL lens, not a new pillar. It mirrors the lens-tag pattern that
`emotion_levels`, `composition_alignment`, and `i18n_readiness` already follow in
`reference/audit-scoring.md`. Adding these axes does NOT:

- add an eighth scored pillar (the reserved Pillar 8 stays unscored),
- change any pillar weight,
- change the qualitative /28 total in `agents/design-auditor.md`,
- change the weighted 0-100 score in `reference/audit-scoring.md`.

The axes attach to existing findings as a label. They produce one routing signal (a
sum threshold) and nothing else touches the scoring math. The `verb_axes` lens-tag is
registered in `reference/audit-scoring.md` under Lens-Tags (Orthogonal).

## How to score

Score each axis 1-10 against its scale, after the pillar pass. Ten is specific,
chosen, and defensible in three sentences against the brand. One is the move a model
makes when no brief exists. Read the diagnostic question first, then place the work on
the scale, then record the number. Each axis below carries three paired before/after
examples drawn from design-domain content so the boundary between a 3 and an 8 is
concrete, not a vibe.

The five scores are independent of the 1-4 pillar scores and never change them.

---

## Axis 1: Directness

**Diagnostic question:** Does the copy and the call to action name the specific
product, verb, and outcome, or does it fall back to a label that would fit any app?

| Score | Criteria |
|-------|----------|
| 9-10 | Every primary action names its object and outcome; the headline carries a verb and a specific promise |
| 7-8 | Most actions are specific; one generic label remains on a reversible secondary action |
| 4-6 | A mix of specific and generic; the hero leans on a template opener |
| 1-3 | Bare "Get Started", "Submit", "Welcome to [Product]"; no subject, no product-specific verb |

Paired examples:

1. Before: button reads "Get Started". After: "Start a free audit".
2. Before: headline "Welcome to the platform". After: "Ship your first design pass in ten minutes".
3. Before: empty state "No data". After: "No audits yet. Run your first audit to see findings here."

---

## Axis 2: Distinctness

**Diagnostic question:** Would this surface be recognizable as this product, or is it
the default palette, the default typeface, and the default decoration any model reaches
for first?

| Score | Criteria |
|-------|----------|
| 9-10 | Palette and type record a brand decision in tokens; decoration earns its place |
| 7-8 | A clear identity with one or two default-leaning choices left undocumented |
| 4-6 | Recognizable in places, generic in others; tokens partly present |
| 1-3 | Purple-violet accent, Inter alone, gradient and glass standing in for identity |

Paired examples:

1. Before: `bg-violet-600` hardcoded on every primary button. After: `bg-primary` routed to a documented brand hue token.
2. Before: Inter set on the root with no second face and no token. After: a defended display face paired with a body face, both as `--font-*` tokens.
3. Before: three gradients and frosted glass carrying the hero. After: one solid surface with weight and spacing carrying hierarchy.

---

## Axis 3: Hierarchy

**Diagnostic question:** Does the eye land on one clear focal point and follow an
obvious reading order, or does every block compete on the same axis with the same
weight?

| Score | Criteria |
|-------|----------|
| 9-10 | One primary action per view; reading order is instant; weight and spacing group meaning |
| 7-8 | Mostly clear; one or two competing priorities |
| 4-6 | The primary action must be hunted; several blocks share equal weight |
| 1-3 | Centered-everything; flat weight throughout; no discernible focal point |

Paired examples:

1. Before: hero, feature grid, and testimonial all centered with `mx-auto text-center`. After: the hero line centered, body and lists left-aligned on a shared reading edge.
2. Before: three buttons styled as primary on one view. After: one primary action, the rest demoted to secondary or text.
3. Before: every heading at `font-weight: 400`, same size as body. After: bold headings, regular body, medium labels in a deliberate weight ladder.

---

## Axis 4: Authenticity

**Diagnostic question:** Does the surface show the real product, or does it lean on
stock scenes, placeholder copy, and badge decoration that signal nothing was actually
built yet?

| Score | Criteria |
|-------|----------|
| 9-10 | Real screenshots or purpose-drawn art; copy is shipped, not placeholder; badges carry true status |
| 7-8 | Mostly real with one stock asset or one stray placeholder |
| 4-6 | A mix of real and stock; some lorem ipsum survives past mockup |
| 1-3 | Undraw isometric scenes, lorem ipsum, "New" and "AI-powered" badge spam |

Paired examples:

1. Before: `undraw_dashboard.svg` in the empty state. After: a real screenshot of the populated dashboard.
2. Before: "Lorem ipsum dolor sit amet" in a shipped card body. After: the actual feature description in product voice.
3. Before: a row of "New", "Beta", "AI-powered" badges with no state behind them. After: one badge that reflects a real, current status.

---

## Axis 5: Density

**Diagnostic question:** Is the information density chosen for the content and the
reader, or is everything inflated to fill space with oversized single words and airy
padding that says nothing?

| Score | Criteria |
|-------|----------|
| 9-10 | Density fits the content; spacing rides the scale; type sizes serve reading, not decoration |
| 7-8 | Mostly considered; one oversized display moment that could earn its size |
| 4-6 | Uneven density; some off-scale padding; a few sizes chosen for drama over meaning |
| 1-3 | One giant word per section, vast empty padding, no content to justify the scale |

Paired examples:

1. Before: a single word at `text-9xl` filling a section with nothing else. After: a sized headline plus the supporting sentence the word was standing in for.
2. Before: card padding at arbitrary `p-[37px]` off the scale. After: padding snapped to the 8pt step the rest of the layout uses.
3. Before: a feature grid where each tile holds three words and 200px of air. After: tiles sized to their content with rhythm matched across siblings.

---

## Threshold and routing

Sum the five axis scores for one finding. The maximum is 50 (five axes times ten).

```
verb_axes_sum = directness + distinctness + hierarchy + authenticity + density
```

When `verb_axes_sum < 35` (out of 50), the work reads as generically AI-default even
if the pillars pass. Route that finding to `agents/design-debt-crawler.md` as a debt
item with `category: aesthetic-slop` (see `reference/debt-categories.md`). The auditor
attaches the per-axis scores as the `verb_axes_scored` lens-tag and records which
visual-tells categories matched (see `reference/visual-tells.md`).

A sum at or above 35 is not a pass on the pillars; the pillars carry their own scores.
The threshold is a routing rule for the aesthetic-slop debt class only. It changes no
pillar weight and no total.

## What this is not

This rubric does not replace the pillar audit, does not gate a write, and does not
produce a 0-100 number. It is a verb-based lens that sits beside the pillars and emits
one tag plus one routing decision. Real review still applies the full rubric in
`reference/audit-scoring.md` and the BAN / SLOP catalog in `reference/anti-patterns.md`.
