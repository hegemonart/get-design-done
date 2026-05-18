---
name: contrast-advanced
type: heuristic
version: 1.0.0
phase: 28
tags: [contrast, apca, wcag-3, accessibility]
last_updated: 2026-05-18
---

# Contrast Advanced — APCA (WCAG 3 Draft)

WCAG 2.1 / 2.2 contrast (4.5:1 body, 3:1 large text and non-text UI) is owned by [`./accessibility.md`](./accessibility.md) §WCAG 2.1 AA — Required Thresholds. This file owns APCA — the WCAG 3 draft perceptual contrast model — which materially misranks WCAG 2.1 verdicts on thin, large, and colored text. APCA is currently part of the WCAG 3 draft (Silver), not yet at candidate-recommendation stage; threshold values and the math can shift before ratification. Treat APCA as a **design-quality layer** that you stack on top of WCAG 2.1 AA certification, not as a replacement for it.

This is the file an agent should consult any time it is auditing a contrast pair that fails perceptually despite passing WCAG 2.1, or passes WCAG 2.1 with a margin that "feels wrong" — almost always one of: thin body text in a mid-gray, large colored text on white, or saturated text on a saturated background. Where WCAG 2.1 says "compute the luminance ratio and check the threshold", this file replaces that hand-wave with explicit perceptual thresholds, three worked misrank cases, and a heuristic mapping back to the legacy ratio so a single audit can satisfy both standards.

---

## APCA Lc Thresholds

APCA reports contrast as **Lc** — a perceptual lightness-contrast score on a scale that runs roughly **−108 to +106**. The sign carries directional meaning: a **positive Lc** denotes darker text on a lighter background (the common case for body copy), and a **negative Lc** denotes lighter text on a darker background (the common case for white-on-dark UI). Many practitioners report the **absolute value** `|Lc|` against the threshold — that is the convention this file uses below. Always confirm whether a calculator reports signed or unsigned Lc before comparing to a threshold.

The threshold ladder mirrors the WCAG-2.1 floor-by-use-case structure, but the breakpoints are set against perceptual contrast rather than luminance ratio, so the rank ordering between pairs sometimes flips relative to a WCAG-2.1 audit.

| Lc threshold | Use case               | Rationale                                                                  |
| ------------ | ---------------------- | -------------------------------------------------------------------------- |
| `Lc 75`      | Body text (small)      | Small glyphs at body weight need the most perceptual lift to remain legible |
| `Lc 60`      | Large text             | Larger glyph area tolerates lower perceptual contrast without legibility loss |
| `Lc 45`      | Non-text UI            | Buttons, borders, icons; functional but not body copy                       |
| `Lc 30`      | Decorative / accent    | Logos, accent dividers, brand marks; non-essential to comprehension         |

A few practical notes on reading the ladder:

- **Sign convention.** `|Lc 75|` is the standard target whether the pair is dark-on-light (positive) or light-on-dark (negative). Do not confuse a calculator that returns `Lc −75` with one returning `Lc 75` — the magnitude is the same; only the polarity differs.
- **Weight and size sensitivity.** APCA's body-text threshold (`Lc 75`) is calibrated for small text at regular weight. Larger or heavier glyphs may legitimately pass at lower magnitudes; APCA's published lookup tables map exact weight × size cells to minimum Lc, with `Lc 60` and `Lc 45` covering the common "large text" and "non-text UI" buckets respectively.
- **Decorative is not "exempt".** `Lc 30` is the floor for elements where comprehension is not required (a brand watermark, a divider hairline). Anything a user must read or interact with belongs at `Lc 45` or above.

### Worked anchor pairs at each threshold

Holding the threshold ladder in mind is easier with one canonical pair anchoring each row. These pairs are reference points only — the calculator should always be consulted before shipping:

```txt
Lc 75 body:        #1A1A1A on #FFFFFF   → APCA ~|95|, WCAG ~17:1   (over-clears both standards)
Lc 60 large:       #333333 on #FFFFFF   → APCA ~|85|, WCAG ~12.6:1 (clears both standards)
Lc 45 non-text UI: #5C5C5C on #FFFFFF   → APCA ~|68|, WCAG ~7:1    (clears both; tightens at colored variants)
Lc 30 decorative:  #888888 on #FFFFFF   → APCA ~|48|, WCAG ~4.5:1  (clears WCAG body; APCA-decorative only)
```

The pattern is monotonic on neutral pairs — darker foregrounds raise both WCAG ratio and APCA Lc together. The interesting divergences only appear once color, weight, or size enters the comparison, which is the subject of the next section.

---

## Why 4.5:1 Misranks Thin / Large / Colored Text

WCAG 2.1's `4.5:1` is a **luminance contrast ratio**: a log-based ratio of the relative luminances of the lighter and darker pixels, calibrated against a perfectly white-vs-perfectly-black comparison. The formula is `(L1 + 0.05) / (L2 + 0.05)` where `L1`/`L2` are sRGB relative luminances, and it knows nothing about font weight, glyph size, or the hue of either side of the pair.

APCA models perceptual contrast: lightness on a perceptually uniform scale, with adjustments for font weight, glyph area, and the directional bias of human contrast sensitivity (we read dark-on-light differently from light-on-dark). The two models agree most of the time on solid black-on-white body copy. They **disagree** in three predictable failure modes — and in each case it is APCA that tracks the human-readable reality:

- **Thin mid-grays on white** read worse than the ratio suggests (APCA flags; WCAG passes).
- **Large saturated text on white** reads better than the ratio suggests (WCAG passes by a wide margin; APCA still passes but the margin is much narrower).
- **Saturated-on-saturated pairs** read worse than the ratio suggests, because human contrast sensitivity collapses when both sides carry strong hue at similar luminance (APCA flags clearly; WCAG sits ambiguously near the line).

Three worked examples make the math concrete. Ratios and Lc values below are **illustrative reference points** from the published APCA calculator at `apcacontrast.com` and a standard WCAG 2.1 contrast checker; production audits MUST recompute against a maintained calculator (APCA's tables update as the WCAG 3 draft advances) and MUST cite the calculator version + spec snapshot date for reproducibility.

### Example 1 — Thin mid-gray on white

```txt
Foreground:    #666666  (rgb 102, 102, 102)
Background:    #FFFFFF
Glyph context: body text, 16px, regular weight

WCAG 2.1 ratio: ~5.74:1   → PASSES 4.5:1 (body)
APCA Lc:        ~|62|     → FAILS Lc 75 (body)
```

The luminance ratio crosses the 4.5:1 floor comfortably; on paper this pair is compliant. Perceptually, mid-gray body text on white runs out of lift well before the ratio would predict: the dark side is too light to anchor the glyph edges, and at body weight the strokes are thin enough that the eye loses crisp edge contrast. APCA's `Lc 75` body threshold catches this; WCAG 2.1's flat ratio does not. The fix is to darken the foreground (toward `#5A5A5A` or lower) or thicken the weight; both raise Lc.

### Example 2 — Large colored text on white

```txt
Foreground:    #0066CC  (rgb 0, 102, 204)
Background:    #FFFFFF
Glyph context: large heading, 24px, bold

WCAG 2.1 ratio: ~6.72:1   → PASSES 4.5:1 and 3:1
APCA Lc:        ~|78|     → PASSES Lc 60 (large)
Disagreement:   margin direction
```

Both standards pass this pair, but they disagree on **how much margin** the design has. WCAG 2.1 reports a comfortable 6.72:1 — well above the 3:1 large-text floor and even above the 4.5:1 body floor — which encourages the designer to read this as "high contrast, plenty of headroom". APCA reports `|Lc 78|`, which clears the large-text threshold (`Lc 60`) but is only marginally above the body threshold (`Lc 75`). The simple luminance ratio over-rates saturated blue against white because the formula collapses chroma into luminance; APCA tracks the perceptual reality that the blue glyph edges read with less crispness than a pure black would at the same ratio. The audit lesson is: WCAG ratios on saturated colored text systematically overstate available contrast, and a designer who reduces saturation or shifts the hue trusting the ratio will erode legibility before the ratio reports a problem.

### Example 3 — Saturated text on saturated background

```txt
Foreground:    #FF6600  (rgb 255, 102, 0)
Background:    #0033AA  (rgb 0, 51, 170)
Glyph context: large UI label, 18px, semibold

WCAG 2.1 ratio: ~3.39:1   → FAILS 4.5:1; marginally PASSES 3:1 (large/UI)
APCA Lc:        ~|42|     → FAILS Lc 45 (non-text UI)
```

The luminance ratio sits in the ambiguous gap: it fails body but marginally clears the large-text/UI floor. A WCAG-2.1-only audit might accept this for a button label or a chip. APCA reports `|Lc 42|`, below the `Lc 45` non-text UI threshold and well below the `Lc 60` large-text threshold — the pair is **not** safe for either use. The simple ratio over-rates this pair because two highly saturated colors at similar perceived lightness produce strong chromatic difference but weak lightness contrast; human contrast sensitivity for reading depends primarily on lightness, so the eye reads the boundary as fuzzier than the ratio suggests. APCA exposes the perceptual deficit; WCAG 2.1 hides it.

The three examples generalise to a heuristic an auditor can apply by hand: **when a pair involves thin text, large colored text, or saturated-on-saturated, distrust the WCAG ratio and re-check with APCA.** When both standards agree (solid black on white, dark navy on white, white on solid black) the ratio is reliable.

### Why the math diverges

The structural reason the two models disagree on the three failure modes above is worth naming explicitly, because it explains why the disagreement is **predictable**, not random.

- **WCAG 2.1 uses sRGB relative luminance.** The ratio formula collapses each color's R/G/B channels into a single luminance value via a fixed gamma-decoded weighting (`0.2126·R + 0.7152·G + 0.0722·B` after sRGB-to-linear). That luminance is then compared as a log ratio with the `+0.05` offset. The formula is hue-blind: a saturated blue and a mid-gray of equal luminance produce the same ratio against any background. It is also weight-blind and size-blind: a 4.5:1 pair is reported as 4.5:1 whether the text is 8px hairline or 96px black.
- **APCA uses perceptually weighted lightness.** It first transforms both colors into a perceptually uniform lightness space, then computes a signed contrast that accounts for the directional bias (dark-on-light vs light-on-dark) of human contrast sensitivity. Critically, the **threshold** APCA compares to is not a single number — it is a lookup keyed on the font weight × glyph size at which the pair will be rendered. A 16px regular-weight body pair targets `Lc 75`; a 24px bold pair targets `Lc 60`; a 14px hairline pair targets a value higher than `Lc 75` because the strokes are thinner.

The three failure modes line up against this structural difference: thin text fails because WCAG is weight-blind, large colored text passes-with-overstated-margin because WCAG is hue-blind, and saturated-on-saturated fails because the simple luminance ratio aliases strong chromatic contrast with lightness contrast. These are not edge cases the spec authors missed — they are the cost of the simpler 2.1 model in exchange for cheaper computation and easier hand-audit. APCA pays the perceptual cost; WCAG 2.1 pays the simplicity dividend.

---

## When to Use APCA vs WCAG 2.1 AA

The two standards are **not** an either/or choice for production work. APCA is informationally better on perceptual edge cases; WCAG 2.1 AA is the contractually enforceable baseline for accessibility compliance. The defensible production pattern is **dual-target compliance**: ship designs that satisfy both, fall back to a principled tiebreaker only when the two disagree.

### Dual-target compliance pattern

1. **Default audit floor: WCAG 2.1 AA.** Body text ≥ 4.5:1, large text and non-text UI ≥ 3:1. This is the floor for accessibility certification, procurement contracts, public-sector compliance, and any audit a third party will run.
2. **Design-quality layer: APCA Lc thresholds.** Body `Lc 75`, large `Lc 60`, non-text UI `Lc 45`, decorative `Lc 30`. This is the floor for perceptual quality and for the three misrank cases above (thin, large-colored, colored-on-colored).
3. **Tiebreaker when the two disagree.** Prefer **satisfying both** — almost every pair has a small foreground or background adjustment that clears both simultaneously. When forced to choose, prefer APCA for **body text** (perceptual legibility matters more than the legacy ratio when a user is reading) and prefer WCAG 2.1 AA for **non-text UI** (focus rings, button borders, icon glyphs — where contractual certification matters more than the perceptual edge case).

The order is intentional. The WCAG 2.1 AA floor is the legally and contractually defensible baseline; treating APCA as a *replacement* would shrink the compliance surface and break audits run by third parties using legacy tools. Treating APCA as an *additive* design-quality layer expands the design surface without breaking compliance.

### Common audit-finding patterns

When the dual-target pattern is applied in practice, a small set of finding patterns surfaces repeatedly. Naming them lets an audit triage the result rather than re-deriving the verdict from raw numbers each time.

- **`apca-flags-thin-body`** — WCAG 2.1 body passes (≥ 4.5:1), APCA fails `Lc 75`. Mid-gray body copy on white; the dominant fix is darkening the foreground by 1-2 modular steps on the lightness axis.
- **`wcag-margin-overstated`** — both standards pass, but APCA reports a margin substantially narrower than the WCAG ratio implies. Common on saturated colored text on white. Action: do not lean further into the apparent WCAG headroom (e.g., by lowering chroma or shifting hue toward background); the perceptual margin is already thinner than the ratio reports.
- **`saturated-on-saturated-trap`** — WCAG 2.1 sits ambiguously in the 3:1-to-4.5:1 band, APCA fails clearly. High-saturation color-on-color pairs. The dominant fix is widening the lightness gap (push foreground darker or background lighter), not adjusting the hue choice.
- **`focus-ring-wcag-pass-apca-borderline`** — non-text UI pair clears WCAG 2.1 `3:1` but sits at or just below APCA `Lc 45`. Common on light-gray focus rings around white inputs. Action: APCA-aware designers raise the ring contrast even though WCAG would let it ship.
- **`light-on-dark-asymmetry`** — same `|Lc|` magnitude reads differently dark-on-light vs light-on-dark; pairs that pass dark-mode body can fail when polarity-flipped to light-mode body. Audit both polarities independently rather than assuming symmetry.

These patterns are useful labels for the dual-target dashboard view: an audit can report "3 `apca-flags-thin-body` findings, 1 `saturated-on-saturated-trap` finding, 0 hard WCAG 2.1 fails" and the design team immediately knows the corrective work concentrates on the body-text color choice, not on the WCAG-side certification.

### Draft-status caveat

APCA is currently in the WCAG 3 draft. The threshold values cited above (`Lc 75 / 60 / 45 / 30`), the calculator implementation, and the lookup-table mapping of weight × size to minimum Lc can all shift before WCAG 3 reaches candidate recommendation. Reproducible audits MUST cite:

- The APCA calculator version used (e.g., `apcacontrast.com` build `0.1.9 W3`)
- The WCAG 3 draft snapshot date used as the spec reference
- The conversion table version used (the table in the next section is heuristic and approximate)

Any audit that does not cite these is not reproducible — a re-audit six months later may produce different verdicts on the same pairs, not because the design changed but because the underlying spec advanced.

---

## Lc ↔ WCAG 2.1 Conversion Table

The table below is an **approximate heuristic** for legacy interop — it lets an auditor running a WCAG 2.1 contrast checker spot which pairs are likely to satisfy APCA-equivalent perceptual contrast and which are likely to fall short. APCA and WCAG 2.1 measure fundamentally different things (perceptual lightness contrast vs luminance ratio), so a precise one-to-one mapping does not exist; the table is calibrated against the common case of solid neutral text on a solid neutral background, and drifts in either direction once saturated hue enters the pair.

| APCA Lc threshold | WCAG 2.1 ratio (approx) | Common case                       |
| ----------------- | ----------------------- | --------------------------------- |
| `Lc 75`           | `~7:1`                  | Body text, strict (AAA-equivalent) |
| `Lc 60`           | `~4.5:1`                | Body text minimum (AA body floor)  |
| `Lc 45`           | `~3:1`                  | Large text / non-text UI            |
| `Lc 30`           | `~2:1`                  | Decorative / accent                  |

Use this table in two directions:

- **WCAG-pass-to-APCA check.** A pair that satisfies WCAG 2.1 AA body (`4.5:1`) maps to roughly `Lc 60` — which is APCA's *large text* floor, not its body floor. A WCAG-2.1 body-compliant design is **not** automatically APCA body-compliant. Re-check body text against `Lc 75`.
- **APCA-pass-to-WCAG check.** A pair that satisfies APCA body (`Lc 75`) maps to roughly `7:1` — well above WCAG 2.1 AA's `4.5:1` floor. APCA body-compliant designs are almost always WCAG 2.1 AA body-compliant; the reverse is not true.

The asymmetry is the practical lesson: **APCA is the stricter floor for body text.** A design that targets APCA body and ships through a WCAG 2.1 AA audit will pass both with margin. A design that targets WCAG 2.1 AA body and is then APCA-audited will frequently surface "passes WCAG, fails APCA Lc 75" findings on thin and colored text — those findings are real, not noise.

The conversion drifts at the saturated-hue edges. On saturated-on-saturated pairs (Example 3 above), the WCAG ratio over-rates contrast relative to APCA Lc; the heuristic ratio in the table reads optimistic. On thin gray body text (Example 1), the WCAG ratio also over-rates — `5.74:1` maps to `~Lc 62` in the table-extrapolated direction, but the measured Lc was `~62` and the threshold was `75`, so the pair still fails APCA body despite passing the table-implied WCAG-equivalent. **Treat the table as a screening tool, not as a substitute for re-running the actual APCA calculator on the actual pair.**

### Applying the table to the three worked examples

Walking the three misrank cases through the conversion table makes the screening-tool behaviour explicit:

```txt
Example 1 — #666666 on #FFFFFF (thin body)
  WCAG ratio: ~5.74:1   → table-row ~Lc 60 (just above body floor)
  APCA Lc:    ~|62|     → matches the table row
  Verdict:    APCA body threshold is Lc 75; the table-mapped Lc 60 fails body
  Reading:    table screening agrees with the direct APCA measurement here

Example 2 — #0066CC on #FFFFFF (large colored)
  WCAG ratio: ~6.72:1   → table-row ~Lc 75 (body-strict)
  APCA Lc:    ~|78|     → close to the table row
  Verdict:    Both standards pass; APCA margin tighter than ratio suggests
  Reading:    table screening would have caught this had body been the target

Example 3 — #FF6600 on #0033AA (saturated-on-saturated)
  WCAG ratio: ~3.39:1   → table-row between Lc 30 and Lc 45 (decorative-to-UI)
  APCA Lc:    ~|42|     → matches the lower end of that band
  Verdict:    APCA non-text UI threshold is Lc 45; this falls below
  Reading:    table screening flags this as risky; direct APCA confirms
```

In two of the three cases the table screening converges on the same verdict the direct APCA calculator produces. In the third (large colored text), the table screening *would* have caught the tight margin had the target been body text rather than large text — exactly the kind of design-quality consideration the dual-target pattern is designed to surface. The table is therefore a useful first-pass filter for designers working in a WCAG-2.1-centric tool stack, with the explicit understanding that any pair the screening surfaces as borderline must be re-run against the actual APCA calculator before a decision ships.

---

## Cross-References

- [`./accessibility.md`](./accessibility.md) §WCAG 2.1 AA — Required Thresholds: legacy luminance-ratio floor; pair with APCA Lc for dual-target compliance.

> The reciprocal inbound cross-link from [`./accessibility.md`](./accessibility.md) (a "see also: APCA / WCAG 3 draft" pointer into the §WCAG 2.1 / 2.2 section) lands in Phase 28-06 (additive-only, per D-06) and is not present at the time this file ships.
