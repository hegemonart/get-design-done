<!-- Source: hyperframes registry/blocks/transitions-* (Apache License 2.0) -->
<!-- See: reference/external/NOTICE.hyperframes for full attribution -->

# Motion Transition Taxonomy

Eight controlled transition families derived from the hyperframes registry. Each family describes a distinct visual strategy for moving between UI states. Use this taxonomy to select, name, and constrain transitions consistently across the design system.

---

## 1. 3d

The 3d family covers transitions driven by depth and perspective. Elements rotate or flip along a spatial axis so the viewer perceives them moving through three-dimensional space rather than sliding across a flat surface. The visual character is physical and mechanical — content feels like it has mass, faces, and hinge points. Timing curves should emphasize the acceleration and deceleration of a real object rotating under gravity.

**Canonical examples:** `flip-x`, `flip-y`, `rotate-3d-left`, `cube-left`

### When to use

- **Page flips in book or document viewers** — the metaphor of a literal page turning reinforces the reading model.
- **Card flip interactions** — revealing the back of a card (e.g., a flashcard, a product tile showing detail) benefits from the physical flip metaphor.
- **Onboarding carousel slides** — a cube or rotating panel transition communicates sequential steps with a stronger sense of progression than a flat slide.

---

## 2. blur

The blur family transitions content by shifting focus: the outgoing element loses sharpness while the incoming element sharpens into clarity. The motion resembles a camera rack-focus — attention narrows onto a single point and then expands to the new content. Unlike most transition families, blur operates in the depth-of-field axis rather than the spatial or temporal axis, making it feel intimate and selective.

**Canonical examples:** `blur-in`, `blur-out`, `blur-in-up`, `blur-in-down`

### When to use

- **Focus-mode overlays** — blurring underlying content when a modal, drawer, or spotlight opens communicates that the rest of the UI has receded.
- **Photo gallery lightbox opens** — racking focus from thumbnail to full image reinforces the zoom metaphor without a disorienting scale jump.
- **Loading skeleton to content** — blurring out a skeleton and sharpening in the real content feels more organic than an abrupt swap or a flat cross-fade.

---

## 3. cover

The cover family uses a fill or wipe that expands from one edge to conceal the outgoing content and simultaneously reveal the incoming content behind it. The transition is directional — left, right, up, or down — giving users a strong spatial cue about where they are navigating. The incoming content is already fully rendered beneath the cover layer, so there is no compositional ambiguity mid-transition.

**Canonical examples:** `cover-left`, `cover-right`, `cover-up`, `cover-down`

### When to use

- **Route transitions in marketing sites** — a cover wipe from the current page edge toward the next reinforces the left-to-right or top-to-bottom navigation model.
- **Section reveals on scroll** — covering the previous section as the next one rises into view creates a satisfying page-turning rhythm for long-form content.
- **Slide-panel opens** — a drawer or side panel that covers the main content from its natural edge feels grounded rather than floating.

---

## 4. destruction

The destruction family fragments outgoing content before new content appears. Elements shatter, explode, pixelate, or break apart into constituent pieces that scatter or dissolve. The transition is intentionally dramatic and high-entropy — it signals a decisive, irreversible state change rather than a soft navigation event. Because of its visual weight, destruction transitions should be reserved for moments where the drama is earned.

**Canonical examples:** `shatter`, `explode`, `pixelate-out`, `break-apart`

### When to use

- **Onboarding celebrations** — completing a significant setup milestone (connecting an account, finishing a profile) can warrant a brief destruction-style break of the previous step.
- **Error states (use sparingly)** — a pixelate-out or shatter on a failed action can reinforce the severity of the error without a generic fade, but overuse deadens the signal.
- **Game-style transitions** — level completions, score reveals, or achievement unlocks in game-adjacent products match the genre conventions users already associate with this visual language.

---

## 5. dissolve

The dissolve family cross-fades both the outgoing and incoming content so they overlap during the transition period. Neither element is hidden at the midpoint — the viewer sees a superimposition of both states. This creates a sense of continuity and blending rather than replacement. Dissolves feel gentle and temporal: time is passing, but the context is preserved.

**Canonical examples:** `dissolve`, `fade-through-black`, `fade-through-white`, `morph-dissolve`

### When to use

- **Content replacement where continuity matters** — updating a detail panel or a card's content without navigating away benefits from dissolve so the user understands they are still in the same location.
- **Photo slideshows** — the classic cross-dissolve between images preserves the sense of a continuous viewing experience.
- **Wizard step changes** — stepping through a multi-step form where each step occupies the same spatial region reads more clearly with a dissolve than a directional slide, because the user has not navigated anywhere.

---

## 6. distortion

The distortion family applies mesh warping, ripple, stretch, or liquid deformation to content during the transition. Rather than moving content spatially or temporally, distortion transitions make the pixels themselves behave like a physical medium — rubber, water, or fabric — that stretches and snaps back. The effect is visceral and tactile. Used well, it adds a signature moment that makes a product feel materially distinct.

**Canonical examples:** `warp`, `ripple`, `stretch-in`, `liquid`

### When to use

- **Creative and editorial contexts** — design portfolios, editorial publications, and art-directed landing pages where differentiation is a primary goal.
- **Unique brand moments** — a single, well-timed warp or ripple on a hero image transition can become a brand signature without overwhelming the interface.
- **Hero section transitions on marketing sites** — distortion applied at the seam between a full-bleed hero and the next section creates a visceral scroll reward that flat transitions cannot match.

---

## 7. grid

The grid family breaks content into a regular matrix of tiles that animate independently — entering, exiting, flipping, or fading in a choreographed sequence. The grid subdivision can be dense (many small tiles for a mosaic effect) or coarse (a few large panels). The transition communicates that the content is composed of discrete pieces, which suits imagery and portfolio work where the grid metaphor is already meaningful.

**Canonical examples:** `grid-in`, `grid-out`, `checkerboard`, `tile-flip`

### When to use

- **Portfolio galleries** — revealing a new set of work by animating each thumbnail cell independently reinforces the gallery grid metaphor.
- **Image reveals** — a grid-in where tiles appear in a wave pattern draws the eye across the composition before the full image settles.
- **Dramatic content transitions in editorial contexts** — a checkerboard or tile-flip between major sections of an editorial layout creates a theatrical reveal suited to magazine-style layouts.

---

## 8. light

The light family uses luminosity effects — flash, glow, lens flare, or bloom — to punctuate the moment of transition. Rather than moving content spatially, light transitions overwhelm the frame briefly with brightness or radiant energy before the new content resolves. The effect is momentary and climactic, borrowed from cinematic language where a burst of light signals a revelation, a completion, or the passage of significance.

**Canonical examples:** `flash`, `whiteout`, `bloom`, `lens-flare`

### When to use

- **Onboarding completions** — a flash or bloom when the user finishes setup signals that something important has happened.
- **Achievement unlocks** — reward moments in any product (reaching a milestone, earning a badge) suit light transitions because brightness is universally read as positive and celebratory.
- **Brand-moment animations and moments of delight** — a subtle lens-flare or glow on a signature interaction (e.g., hitting a streak, confirming a purchase) adds warmth without disrupting flow.

---

## Choosing a Family

Quick-reference guide for selecting the right transition family based on visual weight and primary use context.

| Family | Visual Weight | Best For |
|-------------|--------------|--------------------------------------------------|
| 3d | Medium–Heavy | Physical metaphors, card reveals, sequential steps |
| blur | Light–Medium | Focus shifts, depth cues, content materialising |
| cover | Light–Medium | Directional navigation, drawer/panel opens |
| destruction | Heavy | Celebratory moments, dramatic state changes |
| dissolve | Light | Soft content replacement, continuity of place |
| distortion | Medium–Heavy | Brand signatures, editorial hero moments |
| grid | Medium | Gallery reveals, tile-based image layouts |
| light | Medium–Heavy | Reward moments, completions, delight beats |

---

## Combining with Duration Classes

Transition family choice constrains the appropriate duration range. The duration system (defined in `reference/motion.md`) maps timing to semantic classes: narrative, slow, standard, quick, and instant.

**3d and destruction** require slow-to-narrative durations (400–700 ms). Their visual complexity — rotating geometry, fragmenting particles — needs time to resolve clearly. At quick durations they read as broken or glitchy rather than intentional.

**distortion** works best in the slow-to-standard range (300–500 ms). Warping too fast looks like an artifact; too slow it becomes self-indulgent. The sweet spot is long enough to feel physical but short enough to feel responsive.

**grid** tolerates a wider range depending on tile count. Coarse grids (2×2 or 3×3) can run at standard (200–300 ms); dense mosaics need slow (350–500 ms) so individual tile motion is legible.

**light** transitions are typically the shortest of the heavy-weight families. A flash or whiteout at 150–250 ms (standard-to-quick) feels like a camera flash — instantaneous and climactic. Extending it past 400 ms turns a flash into a fade.

**dissolve and cover** are the workhorses of the system. Both operate comfortably at standard (200–300 ms) and can be compressed to quick (100–150 ms) for secondary navigation without losing legibility. They are the default choice when in doubt.

**blur** sits in the quick-to-standard range (150–300 ms). Longer blur transitions feel like a loading state rather than a deliberate motion.

When stacking a transition family choice against the rest of the design: if the moment warrants narrative pacing (slow, deliberate), reach for 3d, destruction, or distortion. If the moment should feel effortless and recede from attention, dissolve and cover at quick or standard are correct. Blur is the right default for focus-management transitions at any speed.
