# Emotional Design — Norman's Three Levels

Source: Don Norman, *Emotional Design: Why We Love (or Hate) Everyday Things* (2004). See also: `jnd.org`.

Use this file as a **cross-cutting scoring lens** in design audits and reflections. The three levels apply simultaneously to every design decision — they are not sequential stages.

---

## The Three Levels

### Visceral Level

> The immediate, pre-cognitive, automatic reaction to sensory input.

The visceral level operates before the user thinks. It is driven by appearance, proportion, colour, texture — the aesthetic surface. A user who says "I don't know why, but this feels cheap" is responding at the visceral level.

**What it governs:**
- First impression within 50ms of page load (aesthetic-usability effect)
- Color palettes and their emotional valence
- Typography weight, roundness, and whitespace generosity
- Illustration style, photography tone, iconography personality
- Whether motion feels fluid or mechanical

**Audit signals:**
- Does the visual system convey the intended emotional register within 3 seconds?
- Are there conflicting visceral signals? (e.g., playful illustration + harsh red error banners)
- Does the `style-vocabulary.md` aesthetic type match the product's emotional promise?

**Scoring rubric (visceral):**

| Score | Evidence |
|---|---|
| 4 | Emotional register clear within 3s; no conflicting signals; references a named design authority |
| 3 | Clear emotional intent; 1–2 minor conflicts (e.g., one off-brand icon) |
| 2 | Ambiguous emotional register; mixed signals across surfaces |
| 1 | No discernible emotional intent; generic or template appearance |

---

### Behavioral Level

> The experience of use — whether actions feel controllable, predictable, and rewarding.

The behavioral level is what UX heuristics primarily address. It covers usability, feedback, error recovery, and responsiveness. A user who says "This is frustrating to use" is responding at the behavioral level.

**What it governs:**
- Interaction feedback (loading states, error messages, success confirmations)
- Control and reversibility (undo, cancel, back navigation)
- Response latency — the Doherty Threshold: feedback within 400ms
- Error prevention and recovery
- Learnability and consistency across screens

**Audit signals:**
- Can the user always tell what the system is doing? (H-01 Visibility)
- Are errors expressed as human problems with solutions? (H-09 Error Recovery)
- Is every action reversible within 5 seconds?
- Does the system respond within 400ms (Doherty Threshold)?

**Scoring rubric (behavioral):**

| Score | Evidence |
|---|---|
| 4 | All states visible; errors human + actionable; Doherty Threshold met; all destructive actions reversible |
| 3 | Most states covered; 1–2 feedback gaps that don't block task completion |
| 2 | Notable feedback gaps; some irreversible actions without warning |
| 1 | System status invisible; errors developer-facing; no undo for destructive actions |

---

### Reflective Level

> The conscious, post-use evaluation — meaning, narrative, and self-image.

The reflective level is where brand identity, storytelling, and pride of ownership live. A user who says "I love showing this tool to colleagues" is responding at the reflective level. This level takes the longest to build and the longest to repair when damaged.

**What it governs:**
- Whether the product aligns with the user's self-image
- Brand narrative consistency across all touchpoints
- Delight and surprise moments — not gimmicks; earned moments
- The **Peak** moment in the Peak-End Rule: the highest positive moment in the flow
- Long-term loyalty and word-of-mouth referral

**Audit signals:**
- Is there an identifiable "peak" moment in the primary user flow?
- Does the brand voice (from `brand-voice.md`) carry through to microcopy and empty states?
- Is there a designed completion state that communicates personality?
- Does the product give users a story to tell? (e.g., a completion screen, an achievement, a shareable output)

**Scoring rubric (reflective):**

| Score | Evidence |
|---|---|
| 4 | Identifiable designed peak moment; brand voice consistent from entry to completion; users have a story to tell |
| 3 | Brand voice present in most surfaces; peak moment implicit but not deliberately designed |
| 2 | Brand voice inconsistent; no designed peak; product is functional but forgettable |
| 1 | Generic experience; no emotional arc; could be any product in the category |

---

## Cross-Cutting Lens Application

Apply this lens as a **secondary overlay** after scoring the primary audit pillars. For each of the three levels:

1. Identify 1–2 evidence items from the primary audit (e.g., Pillar 3 Color → Visceral Level)
2. Note conflicts between levels (e.g., Behavioral score 4 but Visceral score 1 = technically functional but aesthetically repellent)
3. Flag the weakest level as the highest-leverage improvement opportunity

**Common cross-level conflict patterns:**

| Conflict pattern | Diagnosis | Remedy |
|---|---|---|
| High behavioral, low visceral | Technically usable but aesthetically generic | Audit against `style-vocabulary.md`; commit to a stronger aesthetic type |
| High visceral, low behavioral | Beautiful but broken | Fix H-01, H-09 violations first — UX before aesthetics |
| High visceral + behavioral, low reflective | Polished but forgettable | Design a peak moment; review `brand-voice.md` emotional arc |

---

## Wiring

**design-auditor:** After pillar scoring, apply emotional-design lens as a cross-cutting overlay. Add `## Emotional Design Overlay` section to `DESIGN-AUDIT.md` with scores for all three levels and any cross-level conflict notes.

**design-reflector:** In Section 1 (What Surprised Us), flag if visceral vs behavioral scores diverge by ≥2 points — this is a leading indicator of the "beautiful but broken" pattern.

**design-discussant:** In `--spec` mode, include one reflective-level confidence-scored question: "What story does this product help the user tell about themselves?"
