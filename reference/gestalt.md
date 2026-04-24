# Gestalt Principles

<!-- UUPM ux-guidelines.csv rows deduped into this file and heuristics.md/anti-patterns.md/priority-matrix.md — see .planning/research/uupm-import/ux-guidelines-reconciliation.md -->
<!-- Source: nextlevelbuilder/ui-ux-pro-max-skill (MIT) — data/ux-guidelines.csv (deduped) -->

Gestalt psychology explains how the human visual system automatically organizes individual elements into coherent wholes. Designers who understand Gestalt principles can use them intentionally — grouping what belongs together, separating what is distinct, directing attention flow, and reducing cognitive effort. Designers who ignore these principles will inadvertently create layouts that confuse perception, because the visual system will apply Gestalt organization regardless of the designer's intent.

The eight principles below are not rules to follow in isolation — they interact. A single design decision often activates multiple principles simultaneously. The audit checklist at the end of this file helps identify where principles are being violated or underutilized.

---

## 1. Proximity

**Definition:** Elements that are physically close to each other are perceived as belonging to the same group, regardless of their visual appearance. Distance communicates separation; closeness communicates relationship.

**Design application:** Related controls — a label and its input, an action button and its target, a heading and its body text — should be separated by no more than 8px. Unrelated elements should be separated by at least 32px. When this discipline is applied consistently, users read the layout's meaning before reading its content: the structure itself communicates relationships. Proximity is the most fundamental grouping tool available, and it costs nothing but intentionality.

Proximity violations are among the most common layout defects. The symptom is a layout where users do not immediately know which label belongs to which input, or which button acts on which content area. The fix is almost always to increase the distance between unrelated groups and decrease the distance within groups.

**Scoring rubric — audit by looking for:**
- Label-to-input gap: should be ≤8px; flag anything ≥16px
- Button-to-target gap: a button that acts on a specific element should be adjacent to it, not floating at a distance
- Section separation: distinct content sections should be separated by ≥32px; flag sections that bleed into each other
- Orphaned elements: any element that has equal distance to two different groups is ambiguous and should be assigned

**CSS/HTML grep signatures:**
```
gap-2   # ≤8px — appropriate for related elements
gap-8   # 32px — appropriate for section separation; flag if used between related elements
mb-8    # check if this is separating related or unrelated content
p-0     # elements with no internal padding may create proximity confusion at borders
```

---

## 2. Similarity

**Definition:** Elements that share visual properties — color, shape, size, texture, or orientation — are perceived as belonging to the same category. The visual system uses similarity as a shortcut for classification: if it looks the same, it is the same kind of thing.

**Design application:** Consistency in visual treatment is not merely an aesthetic preference — it communicates semantic meaning. All primary buttons should look identical: same size, same color, same weight. All destructive actions should look identical: same red, same border treatment, same position relative to the confirm/cancel pair. All secondary navigation items should be visually indistinguishable from each other. When similar-role elements look different, users assume they are different kinds of things, which creates confusion and erodes trust in the interface's logic.

Icon weight is one of the most commonly violated similarity contexts. Mixing outline icons with filled icons signals two different visual registers that users will try to interpret as meaningful — even when the mixing is accidental.

**Scoring rubric — audit by looking for:**
- Button variants: are all primary buttons identical? Are all secondary buttons identical? Flag mixed variants on the same screen.
- Icon weight: are all icons from the same weight family (all outline or all filled)? Flag mixing.
- List items: do all items in a list have identical visual treatment? Flag items that are visually distinct without a semantic reason.
- Form fields: are all text inputs styled identically? Flag inconsistencies.

**CSS/HTML grep signatures:**
```
btn-primary.*btn-secondary   # flag if both appear in same component with identical visual weight
icon-outline.*icon-filled    # flag mixed icon weight patterns
variant="primary"            # audit all variant prop usages for consistency
```

---

## 3. Continuity

**Definition:** The eye naturally follows lines, curves, and paths in the direction they are already moving. When elements are aligned along an invisible axis, the eye connects them into a continuous flow and expects the line to continue.

**Design application:** Use alignment to create invisible flow lines that direct the eye through the layout in the intended sequence. Left-aligned content columns create a strong left-edge flow line that the eye tracks downward. A row of icons creates a horizontal flow line. A step indicator with connected segments creates a continuous path that the eye follows from start to finish. Carousels and horizontal scrollers leverage continuity by partially revealing the next item — the visible edge implies that more content continues in the same direction.

Continuity is disrupted when elements break expected alignment without a purposeful reason. An element that juts out of an otherwise aligned column creates a visual interrupt — which can be used intentionally to draw attention, or accidentally to create confusion.

**Scoring rubric — audit by looking for:**
- Alignment consistency: are all left-aligned elements aligned to the same grid column? Flag arbitrary left-offset elements.
- Step indicators: does the visual path between steps flow clearly? Flag broken or visually interrupted step flows.
- Carousel edge reveals: does the last visible item partially reveal the next? Flag carousels that do not imply continuation.
- Broken columns: are there elements that break column alignment without a documented reason?

**CSS/HTML grep signatures:**
```
ml-auto    # right-alignment break — check if intentional
text-center # mixed with text-left in same flow — flag if alignment signal is inconsistent
translate-x # horizontal animation — verify it implies continuity, not arbitrary motion
```

---

## 4. Closure

**Definition:** The human visual system actively completes incomplete shapes, filling in missing information to perceive a whole. Users will "see" a rectangle even if its corners are open, or a circle even if its arc is broken, because the mind prefers complete, recognizable forms over fragments.

**Design application:** Closure is widely used in logos and icons to create forms that feel complete while being visually light. In UI, closure explains why partial borders can suggest containment without a full rectangle: a top border on a card, or a left border on a quoted text block, implies a region even without three additional sides. Progress indicators with open ends imply continuation; closed rings imply completion. Skeleton loading states use closure — partial shapes that the user's mind completes as content — to make loading feel purposeful rather than empty.

Closure can also be violated: a progress bar that ends before reaching the container's right edge correctly communicates incompletion, but if it ends at an arbitrary position with no visual context, users may perceive a broken UI rather than a progress state.

**Scoring rubric — audit by looking for:**
- Progress indicators: does the fill/track relationship clearly communicate completion percentage? Flag indicators where progress direction is ambiguous.
- Partial borders: do partial borders clearly imply the group they define? Flag partial borders that could be mistaken for decorative rules.
- Skeleton states: do skeleton shapes meaningfully correspond to the content they represent? Flag skeletons that are too abstract to prime recognition.
- Logo/icon edges: do open edges in icons close convincingly at standard display sizes?

**CSS/HTML grep signatures:**
```
border-l     # left-only border — check if closure context is clear
border-t     # top-only border — check if closure context is clear
rounded-full # complete closure (circle/pill) — appropriate for completion states
w-1/2        # partial fill — verify progress context is established by container
```

---

## 5. Figure-Ground

**Definition:** The visual system constantly distinguishes between a subject (figure) and its context (ground). Figures are perceived as having form, existing in front, and being the focus of attention. Ground is perceived as formless, behind, and non-focal. This distinction happens automatically and is fundamental to perceiving anything at all.

**Design application:** Every interactive element, content region, and overlay depends on successful figure-ground separation. Modal dialogs work because the scrim pushes the page content to ground and the dialog to figure. Buttons work because their filled background distinguishes them from the text-on-ground surrounding them. Navigation bars work because their elevated background separates them from the page content they sit above.

The practical rule: foreground elements must have at least 3:1 contrast ratio against their background, and for text, 4.5:1 for body text (WCAG AA). But figure-ground extends beyond contrast — blur, shadow, and opacity all contribute. A high-contrast element on a cluttered background may still fail to read as figure if the background is too visually active.

**Scoring rubric — audit by looking for:**
- Modal scrim: is the background content pushed to ground with sufficient opacity or blur? Flag modals where the page behind is at full visibility and full saturation.
- Button states: do buttons clearly read as figure against all surface colors they appear on? Flag buttons with insufficient background contrast.
- Active navigation items: are selected/active states clearly distinguished from non-selected? Flag flat navigation with only a color difference.
- Card separation: do cards separate from the page surface? Flag cards with no shadow, border, or background differentiation.

**CSS/HTML grep signatures:**
```
bg-white.*text-white    # invisibility risk — figure and ground collapsed
bg-black/50             # modal scrim — verify opacity is sufficient
z-index|z-[0-9]         # stacking context — verify figure-ground intent is preserved
opacity-0.*opacity-100  # transition — verify figure emerges cleanly from ground
```

---

## 6. Common Fate

**Definition:** Elements that move together — in the same direction, at the same speed, and with the same timing — are perceived as belonging to the same group, even if they are spatially separated. Movement is a powerful grouping signal precisely because it overrides static proximity and similarity cues.

**Design application:** When a group of elements should be perceived as a unit, animate them with shared timing. A card that expands while its child elements simultaneously rearrange communicates that the card and its contents are one object. A list that reorders with synchronized item movement communicates that the list is a coherent set. Conversely, animating elements at different speeds signals that they are independent objects — which can be used to establish hierarchy (parent first, then children) by staggering their entrance timing.

Staggered animation (where sub-elements enter sequentially with a small delay) is a specific application of common fate that establishes a visual hierarchy within a group: the first element that moves is perceived as most important, and the trailing elements are perceived as its dependents.

**Scoring rubric — audit by looking for:**
- Group animations: when a container appears or changes, do its children animate with it or independently? Flag children that animate on unrelated timings.
- List reorder: when items reorder, do they move with shared timing that communicates the reorder as one operation? Flag lists where individual items move asynchronously.
- Exit animations: when a group exits, do all elements leave together? Flag cases where parts of a group exit before the container.

**CSS/HTML grep signatures:**
```
transition-all          # check if used on group container vs. children separately
stagger                 # check stagger timing for hierarchy signal
animate-*.*animate-*    # multiple simultaneous animations — verify they share timing
delay-[0-9]             # stagger implementation — verify delay communicates hierarchy
```

---

## 7. Common Region

**Definition:** Elements enclosed within a clearly defined boundary — a border, a background color, a shadow, or any other perceptual container — are perceived as belonging to the same group, even if they are not close to each other. Common region overrides proximity: two elements far apart within the same bounded region are perceived as more related than two elements close together on either side of a region boundary.

**Design application:** Cards, panels, table rows, form field groups, and toolbars all leverage common region by using visual boundaries to say "these things go together." The boundary does not need to be a literal border — a distinct background color works equally well. This is why alternating row colors in a data table immediately communicate that each row is a distinct unit, and why a card with a white background on a grey page surface reads as a contained group without needing a border.

Common region is also useful for communicating hierarchy: nested regions (a card within a page, a sub-section within a card) communicate nested relationships. The visual boundary at each level tells the eye exactly how far a group extends.

**Scoring rubric — audit by looking for:**
- Card boundaries: do cards have a visible boundary (shadow, border, or background) that clearly separates them from their surroundings? Flag cards that blend into the page surface.
- Form groups: are related form fields visually grouped within a shared container? Flag forms where field groups are separated only by vertical spacing without a region signal.
- Table rows: are table rows distinguishable as individual regions? Flag tables with no row separation signal.
- Nested regions: are nested groupings visually distinguishable from their parent container?

**CSS/HTML grep signatures:**
```
rounded.*shadow         # card pattern — verify region boundary is sufficient
bg-gray-50.*bg-white    # alternating region backgrounds — appropriate for table rows, list items
border.*rounded         # explicit region boundary — verify visual weight is appropriate for nesting level
divide-y                # table row divider — check if combined with sufficient vertical padding
```

---

## 8. Prägnanz (Law of Simplicity)

**Definition:** The visual system always interprets ambiguous inputs in the simplest possible way. When multiple interpretations of a visual input are possible, the mind chooses the interpretation that requires the least cognitive work. Complexity is resolved toward simplicity automatically.

**Design application:** Prefer simple, recognizable shapes over complex, irregular ones. Remove any visual element that does not communicate something. Every decoration that does not carry meaning adds to the cognitive load the user must process before reaching the content that actually matters. This is the principle behind minimalism in UI design — not because minimalism is aesthetically superior, but because unnecessary visual complexity consumes perceptual resources that should be directed at the interface's actual purpose.

Prägnanz also implies that when two layouts can communicate the same information, the simpler one is better. A three-color palette is simpler to parse than a seven-color palette, even if the seven-color palette is "more interesting." A consistent component structure is simpler to navigate than a varied one, even if the variation is intentional.

**Scoring rubric — audit by looking for:**
- Decorative elements: identify any visual element that serves no communicative purpose. Flag gradients, textures, and ornamental icons that do not carry semantic meaning.
- Color count: how many distinct colors appear on a single screen? Flag screens with more than 4–5 distinct colors where the additional colors are not semantically required.
- Shadow and border redundancy: are both shadow and border used simultaneously on the same element without a reason? Flag redundant depth cues.
- Animation without purpose: identify any animation that does not communicate state change, progress, or relationship. Flag animations that exist for decoration alone.

**CSS/HTML grep signatures:**
```
bg-gradient             # decorative gradient — verify it communicates something
border.*shadow          # redundant boundary signals — flag unless both serve distinct purposes
animate-bounce          # decorative animation — flag if it does not communicate a meaningful state
after:.*before:         # pseudo-element decorations — verify each is communicative
```

---

## Gestalt Audit Checklist

Use this checklist when auditing a screen for Gestalt compliance. Each item maps to one or more principles.

1. **Proximity check:** Can you identify every visual group by spacing alone, without relying on borders or background colors? Related elements should cluster tightly (≤8px); unrelated groups should breathe apart (≥32px). Flag any element where group membership is ambiguous from spacing alone.

2. **Similarity check:** Do all elements of the same semantic role share identical visual treatment? Primary buttons match primary buttons. Destructive actions match destructive actions. Icons use consistent weight. Flag any visual inconsistency that users might interpret as a semantic difference.

3. **Continuity check:** Does the layout create a clear reading path through its most important content? Can you trace an invisible line — horizontal, vertical, or diagonal — that connects the primary focal points in intended viewing order? Flag layouts where the reading path requires backtracking.

4. **Closure check:** Are any incomplete shapes used? If so, do they close convincingly at the display size and resolution? Do progress indicators clearly communicate fill direction and completion scale? Flag ambiguous incomplete shapes.

5. **Figure-ground check:** Does every interactive element have sufficient contrast against its background? Do modals and overlays effectively push page content to ground? Are active navigation states clearly elevated above inactive ones? Flag anything where figure and ground are insufficiently distinct.

6. **Common fate check:** When elements animate, do grouped elements share timing? Is stagger used intentionally to signal hierarchy rather than arbitrarily? Flag groups where member elements animate independently with no shared timing.

7. **Common region check:** Are all logically related groups of elements contained within a visible boundary (card, panel, background, or border)? Can a user identify group membership from the region boundary alone? Flag groups that rely only on proximity without a region signal in contexts where the proximity alone is insufficient.

8. **Prägnanz check:** Remove one element at a time and ask: does the screen communicate less information without it? If the answer is no for any element, that element is decorative noise. Flag decorative elements, redundant visual signals, and any source of visual complexity that does not carry proportionate communicative value.
