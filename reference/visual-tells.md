# Visual Tells Catalog (v2)

The default-AI aesthetic has a fingerprint. When a model generates a front-end
without a brand brief, it falls back to the same handful of moves it saw most in
its training set. This catalog names those moves so the cheap regex floor in
`hooks/gdd-design-quality-check.js` can flag them on every `.tsx` / `.vue` /
`.svelte` / `.astro` write.

This catalog grows commit by commit. The v1 floor named the eight loudest tells the
hook matches today; v2 adds five more identified through hands-on usage. Newer
categories may be catalog-only (documented and cross-linked, not yet wired to a hook
rule) until a regex earns its place. Each entry below names a **primary axis** from
`reference/anti-slop-rubric.md`, so a tell connects to the verb axis it most degrades.

Severity here is WARN (advisory), in the vocabulary of `reference/audit-scoring.md`.
A WARN is not a FLAG: it does not block the write and it does not fail a gate. It
is a nudge that asks "did you choose this, or did the model default to it?" Each
category below maps 1:1 to a rule id in the hook. For the harder bans behind some
of these tells, see `reference/anti-patterns.md` (BAN-NN and SLOP-NN).

How to read each entry: a short description, three to five concrete instances of
the tell in the wild, the diagnostic regex the hook runs (where one applies), and
a remediation pattern you can paste in.

---

## default-AI-hero

Rule id: `generic-cta`

The stock landing-page hero: a centered headline, one line of filler subtext, and
a button that says "Get Started". The copy carries no subject and no verb specific
to the product. It reads like every template because it is every template.

Instances:

1. Button label "Get Started" with no object ("Get started with what?").
2. Headline opener "Welcome to [Product]" instead of a value statement.
3. "Learn More" as the secondary call to action, pointing nowhere specific.
4. "Lorem ipsum" body copy shipped past the mockup stage.
5. The triplet subhead with no verb (see SLOP-11 in `reference/anti-patterns.md`).

Diagnostic regex (hook): `\b(?:Get Started|Welcome to|Lorem ipsum|Learn More)\b`
(case-insensitive, word-boundaried).

Remediation: write the specific promise and the specific next step. "Start a free
trial" beats "Get Started". "Ship your first audit in ten minutes" beats "Welcome
to GDD". Name the noun and the verb. Delete placeholder copy before review.

---

## gradient-spam

Rule id: `gradient-spam`

One tasteful gradient can anchor a page. Three or more on a single screen reads as
decoration standing in for hierarchy. The model reaches for `bg-gradient-to-r` on
the hero, again on the cards, again on the footer, because gradients look busy and
busy looks "designed".

Instances:

1. Hero background, card backgrounds, and a CTA all using a direction gradient.
2. `bg-gradient-to-br` on every feature tile in a grid.
3. A gradient on text plus a gradient on its container (double application).
4. Gradient borders faked with a gradient background and an inset child.

Diagnostic regex (hook): `\bbg-gradient-to-(?:r|br|tr|b|bl|l|tl|t)\b`, flagged at
a count of three or more occurrences in one file.

Remediation: pick one surface to carry a gradient and make the rest solid. Use
weight, size, and spacing for hierarchy instead of color washes. If you keep a
gradient, give it a documented role (one hero, one accent) rather than spraying it.
For the gradient-text ban specifically, see BAN-02.

---

## isometric-illustration-fallback

Rule id: `isometric-illustration-fallback`

Pastel isometric scenes with floating icons, usually pulled straight from a free
clip-art set. The undraw.co style is the strongest tell: flat shapes, two-tone
palette, no brand character. It signals that no real screenshot or photography was
available, so a stock scene filled the hole.

Instances:

1. `src="/illustrations/undraw_dashboard.svg"` in an empty state.
2. An `isometric-hero.png` asset behind the headline.
3. A row of undraw spot illustrations as feature icons.
4. The same illustration set reused across unrelated products.

Diagnostic regex (hook): `\b(?:undraw|isometric)[\w./-]*` (matches the marker in an
asset path or `src`).

Remediation: show the actual product. A real screenshot, a short screen capture,
or a purpose-drawn illustration with brand character all beat stock clip art. See
SLOP-12 in `reference/anti-patterns.md` for the longer argument.

---

## centered-everything-syndrome

Rule id: `centered-everything-syndrome`

`mx-auto` plus `text-center` on block after block. Centered text is fine for a
single short hero line. Applied to body copy, feature lists, and multi-line cards
it destroys the reading edge: the eye loses the left margin it scans against, and
every block competes for the same axis.

Instances:

1. A hero, a feature grid, and a testimonial section all centered.
2. Centered multi-line paragraphs longer than two lines.
3. A centered card with centered heading, centered body, and a centered button.
4. Centered form labels above left-aligned inputs (axis mismatch).

Diagnostic regex (hook): a quoted class string containing both `mx-auto` and
`text-center`, in either order.

Remediation: center the hero line only. Left-align body copy and lists so they
share a reading edge. Reserve centering for short, single-line, high-emphasis text.
Center the container for width control, but left-align its text content.

---

## inter-everything

Rule id: `inter-everything`

Inter as the default with no documented reason. Inter is a fine typeface, which is
exactly why it is the safe pick a model makes when no brand font is specified. The
tell is not Inter itself: it is Inter used alone, with no second font and no token
that records a choice.

Instances:

1. `font-inter` on the root with no display or brand font anywhere.
2. `font-family: 'Inter'` in CSS with no second family in the stack file.
3. Inter paired with no `--font-display` or `--font-body` token.
4. DM Sans, Space Grotesk, or Plus Jakarta Sans in the same role (see SLOP-05).

Diagnostic regex (hook): `\bfont-inter\b` or `font-family:\s*['"]?Inter`, warned
only when no sibling custom-font token (a `font-<name>` utility, a `--font-*`
variable, or a second `font-family`) appears in the same file.

Remediation: choose a typeface you can defend in three sentences against the brand,
and record it as a token (`--font-display`, `--font-body`). If Inter is the right
call, pair it with a distinct display face or a deliberate weight system so the
choice is visible. Keeping the token is what turns a default into a decision.

---

## purple-violet-default

Rule id: `purple-violet-default`

`bg-purple-600` and `bg-violet-600` are the colors a model picks when no palette is
given. Combined with indigo and cyan they form the exact accent set that ships on a
large share of generated UIs (SLOP-01). The tell is the raw Tailwind shade used as
the brand color with no theme token in sight.

Instances:

1. `bg-violet-600` on the primary button with no `bg-primary` token defined.
2. `bg-purple-500` headers across the app, hardcoded per component.
3. Purple-to-blue accent pairing on hero plus buttons (SLOP-02).
4. `text-violet-600` links with no semantic link color.

Diagnostic regex (hook): `\bbg-(?:purple|violet)-(?:500|600|700)\b`, warned only
when no theme-token class (`bg-primary`, `bg-brand`, `bg-accent`, or a
`bg-[var(--...)]` / `oklch` / `hsl` arbitrary value) is present in the file.

Remediation: route color through a token (`bg-primary`, `--color-accent`) so the
brand hue lives in one place. If purple is genuinely the brand, define it as the
token and reference the token, not the raw shade. Pick one primary accent and apply
it consistently. See the Color System rubric in `reference/audit-scoring.md`.

---

## glassmorphism-spam

Rule id: `glassmorphism-spam`

Frosted-glass panels stacked everywhere: `backdrop-blur` on cards, on the nav, on
modals, plus `bg-white/10` fills. One blurred overlay over busy content is a valid
move. Three or more blur or low-alpha-white treatments in one file is glass used as
the default surface, which hides the fact that no real layout system exists.

Instances:

1. `backdrop-blur-lg` on every card in a grid.
2. `bg-white/10` panels layered three deep.
3. A blurred nav over a blurred hero over a blurred section.
4. Glass cards on a flat background where there is nothing to blur.

Diagnostic regex (hook): `\bbackdrop-blur(?:-\w+)?\b` or `\bbg-white\/(?:10|20|30)\b`,
flagged at a count of three or more occurrences in one file.

Remediation: keep blur for cases where it has a job, such as a modal dimming the
content behind it, a floating command palette, or a sticky header over scrolling
content. Give other surfaces solid fills and a real elevation system. See SLOP-04
for the valid-use list.

---

## decorative-motion-without-intent

Rule id: `decorative-motion-without-intent`

`animate-pulse`, `animate-bounce`, and `animate-spin` are loading affordances. The
tell is using them as ambient decoration: a pulsing hero badge, a bouncing arrow
that never stops, a spinning accent that encodes no progress. Motion that loops
forever with no state behind it reads as filler and fights `prefers-reduced-motion`.

Instances:

1. `animate-pulse` on a static "New" badge in the hero.
2. `animate-bounce` on a scroll-down chevron looping with no end.
3. `animate-spin` on a decorative ring that is not a spinner.
4. A pulsing gradient blob behind the headline.

Diagnostic regex (hook, conservative): a quoted class string containing
`animate-(pulse|bounce|spin)` that does not also contain a loading signal
(`loading`, `loader`, `spinner`, `skeleton`, `icon`, `i-`, or `sr-only`).

Remediation: tie motion to a state. Use `animate-pulse` on skeletons while data
loads, `animate-spin` on a real spinner during a request, and drop ambient loops.
Respect `prefers-reduced-motion`. Enter with `ease-out`, exit shorter than enter,
and never animate keyboard-driven actions. See the Motion Anti-Patterns section of
`reference/anti-patterns.md`.

---

## stock-photo-people

Rule id: `stock-photo-people` (catalog-only)

Generic smiling-team and handshake stock photography dropped in where a real product
view belongs. The diverse-team-around-a-laptop shot, the lone founder gazing out a
window, the abstract handshake: these read as filler the moment a viewer asks what the
product actually does. Like the isometric fallback, the tell is that no real screen was
available, so a stock human filled the hole.

Instances:

1. A hero photo of four people laughing at one laptop, captioned with a value prop.
2. `src="/images/team-meeting.jpg"` standing in for a product screenshot.
3. A testimonial section using stock headshots instead of real customer faces.
4. An unsplash or shutterstock asset path in a primary marketing surface.
5. The same stock photo reused across unrelated sections of one page.

Diagnostic regex (where applicable): `\b(?:unsplash|shutterstock|istockphoto|gettyimages|stock[-_]?photo)[\w./-]*` in an asset path or `src`.

Remediation: show the real product or real people connected to it. A genuine screenshot,
a real customer portrait with permission, or a purpose-shot photo all beat a stock human.
If no real asset exists yet, a clean illustration with brand character beats a stock smile.

Primary axis: Authenticity.

---

## badge-spam

Rule id: `badge-spam` (catalog-only)

Decorative pills stacked to manufacture importance: "New", "Beta", "Pro", "AI-powered",
"v2" scattered across cards and nav with no state behind them. One badge that reflects a
real status orients the user. Four badges in a row are noise that the model adds because
badges look like product maturity. The tell is a cluster of status pills none of which
encode a true, current state.

Instances:

1. A card carrying "New", "Hot", and "AI-powered" badges at once.
2. A nav item with a permanent "Beta" pill that has shipped for a year.
3. Every feature tile in a grid wearing the same "Pro" badge.
4. An "AI-powered" badge on a feature with no AI in it.
5. Three or more `<Badge>` or `.badge` elements rendered in one small region.

Diagnostic regex (where applicable): a quoted label matching `\b(?:New|Beta|Pro|AI-powered|Hot|Coming soon)\b` inside a badge or chip element, flagged at three or more in one component.

Remediation: keep one badge that carries a real, current status, and delete the rest.
A badge should change when state changes. If a label never changes, it is decoration, not
status, and belongs in the copy or not at all.

Primary axis: Authenticity.

---

## oversized-single-word

Rule id: `oversized-single-word` (catalog-only)

A single word blown up to display size to fill a section that has no content to carry it.
"Build.", "Ship.", "Scale." at `text-8xl` with nothing beneath but air. Large type is a
strong tool for one real headline; the tell is a one-word slab standing in for a sentence
the writer did not write, sized for drama rather than meaning.

Instances:

1. A section whose only content is "Innovate." at `text-9xl`.
2. A stack of one-word slabs ("Fast." "Simple." "Powerful.") each filling a viewport.
3. A giant verb with no object, no supporting line, and 300px of padding around it.
4. Display-size text where the word count is one and the surrounding region is empty.

Diagnostic regex (where applicable): an element with `text-(?:7xl|8xl|9xl)` whose text node is a single word.

Remediation: write the sentence the word was standing in for, then size the headline to
serve reading. If a one-word moment is genuinely the design, give it a supporting line and
a reason to be that large. Density should fit the content, not inflate to fill space.

Primary axis: Density.

---

## motion-without-content-intent

Rule id: `motion-without-content-intent` (catalog-only)

Scroll-triggered fades, parallax layers, and entrance animations applied to every block
because motion reads as "modern". This is the storytelling cousin of the ambient-loop tell:
where `decorative-motion-without-intent` flags a forever-looping spinner, this flags motion
wired to scroll or load that carries no content reason. Every element fading up in sequence
delays the reader and signals motion chosen as decoration, not to direct attention.

Instances:

1. Every section wrapped in a `whileInView` fade-up with a staggered delay.
2. Parallax on three background layers that encode no depth meaning.
3. An entrance animation on body copy that the reader is waiting to read.
4. Scroll-jacking that overrides native scroll for a "cinematic" reveal.

Diagnostic regex (where applicable): `whileInView|data-aos|scroll-trigger|parallax` applied broadly across blocks without a reduced-motion guard in the same file.

Remediation: tie motion to a content reason. Animate the one element that should draw the
eye, let the rest render immediately, and respect `prefers-reduced-motion`. Reading content
should never wait on a decorative reveal. See the Motion Anti-Patterns section of
`reference/anti-patterns.md`.

Primary axis: Hierarchy.

---

## narrator-from-a-distance-UI

Rule id: `narrator-from-a-distance-UI` (catalog-only)

Copy that describes the product from the outside in a detached marketing voice instead of
speaking to the user doing a task. "Our platform empowers teams to achieve more" is a
narrator at a distance; "Invite your team and assign the first task" speaks to the person
in front of the screen. The tell is third-person product description where a second-person
instruction belongs, especially inside the product rather than on a landing page.

Instances:

1. A dashboard empty state reading "The platform helps you organize your work" instead of "Create your first board".
2. In-product copy in third person ("Users can export reports") rather than direct address.
3. A feature headline describing the feature to an investor, not to its user.
4. Onboarding steps narrated about the product instead of instructing the new user.

Diagnostic regex (where applicable): in-product strings matching `\b(?:our platform|the platform|users can|we help you|empowers)\b` outside marketing routes.

Remediation: write to the user in second person and name the next action. Inside the
product, copy should instruct and orient, not pitch. Reserve the outside-in description for
the marketing surface, and even there, lead with what the reader can do. See
`reference/copy-quality.md` for the per-surface voice contract.

Primary axis: Directness.

---

## Notes

This is a v2 catalog, growing commit by commit, not a ceiling. The hook regexes favor
precision over recall: they aim to fire only on the obvious cases so the WARN stays
trustworthy. The five v2 categories above are catalog-only until a regex earns a place in
the hook; they still give review a named tell and a primary axis to score against. A clean
pass here does not mean the design is good. It means the loudest default-AI tells are
absent. Real review still applies the full rubric in `reference/audit-scoring.md`, the verb
axes in `reference/anti-slop-rubric.md`, and the BAN / SLOP catalog in
`reference/anti-patterns.md`.
