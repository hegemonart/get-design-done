# RTL, CJK, and Cultural Localization — Reference Guide

> For engineering primitives (CSS logical properties, Intl.\* family, bidi isolation, ICU MessageFormat, text-expansion budgets, multi-script font stacks, Unicode hygiene), see [`./i18n.md`](./i18n.md). This file owns cultural context (greeting forms, color symbolism, CJK family-name conventions, imagery norms).

Designing for a global audience is not a matter of translating strings and calling the work done. Layout direction, typographic rendering, number formatting, color semantics, and imagery all carry culturally specific expectations that, when violated, signal to users that the product was not made for them. This reference consolidates the key technical and cultural considerations that the get-design-done framework requires designers and engineers to understand before shipping to any non-English or non-Western market.

---

## 1. RTL Layout Mirroring

Right-to-left scripts — Arabic, Hebrew, Persian (Farsi), Urdu, and others — do not merely reverse the direction of text. They reverse the entire spatial logic of the interface. In an LTR layout, the reading eye enters from the left, proceeds to the right, and interprets "start" as left and "end" as right. In an RTL layout, "start" is right and "end" is left, and every directional affordance must be reconsidered accordingly.

### Use CSS Logical Properties

The most consequential shift a codebase can make for RTL support is to replace physical CSS properties with logical ones. Physical properties (`margin-left`, `padding-right`, `border-left`, `left`, `right`) are hardcoded to absolute directions and do not respond to the document's writing direction. Logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `inset-inline-end`) are resolved relative to the text flow and automatically mirror when `dir="rtl"` is set.

The replacement mapping is straightforward:

| Physical (avoid) | Logical (prefer) |
|------------------|-----------------|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `border-left` | `border-inline-start` |
| `border-right` | `border-inline-end` |
| `left` (positioned) | `inset-inline-start` |
| `right` (positioned) | `inset-inline-end` |
| `text-align: left` | `text-align: start` |
| `text-align: right` | `text-align: end` |

Browser support for CSS logical properties is excellent across all modern browsers. There is no legitimate reason to use physical properties in new code targeting a product that will ever need RTL support.

### Set `dir="rtl"` at the Document Root

The `dir` attribute on `<html>` propagates directionality through the entire DOM. When a user's locale is an RTL language, set `<html dir="rtl" lang="ar">` (or the appropriate lang code). Never apply `dir="rtl"` on a per-element basis to work around missing logical properties — this creates brittle, partially mirrored layouts that fail in unpredictable ways as components are reused. The single root-level `dir` attribute, combined with logical CSS properties throughout, produces a fully mirrored layout with zero per-element overrides.

If a product serves both LTR and RTL users from the same codebase, control the direction via a class or data attribute on `<html>` that is set at runtime based on the user's locale: `<html class="rtl">` with a CSS rule `html.rtl { direction: rtl; }`.

### What to Mirror

The following elements must mirror their visual position and directional meaning in RTL layouts:

- **Navigation arrows and chevrons** — a "next" chevron that points right in LTR must point left in RTL, because the reading direction of "forward" is reversed. A back-navigation arrow that points left in LTR must point right in RTL.
- **Layout flow** — the primary content column in LTR occupies the left portion of a sidebar layout; in RTL it occupies the right. Sidebars swap sides.
- **Text alignment** — body copy, labels, and headings should be `text-align: start`, not hardcoded left.
- **Form label position** — labels that appear to the left of form inputs in LTR should appear to the right in RTL.
- **Breadcrumbs** — the separating chevrons between breadcrumb items point in the direction of reading progression. In LTR this is rightward; in RTL it is leftward.
- **Progress bars** — the fill of a progress bar represents progression from start to finish. In LTR the fill grows from left to right; in RTL it grows from right to left. Use `direction: rtl` or `transform: scaleX(-1)` on the fill container, not hardcoded positional values.
- **Sliders and range inputs** — same rationale as progress bars.
- **Ordered lists** — numbering should still render left-to-right within the numeral, but the list item content begins from the right margin.

### What NOT to Mirror

Not everything in an RTL layout should be physically reversed. The following elements retain their LTR or universal orientation regardless of document direction:

- **Numerals** — digits (0–9) are universally rendered left-to-right, even within Arabic text. A price of ١٢٣٤ is rendered with the most-significant digit on the left. Never reverse digit order.
- **Media player controls** — play, pause, rewind, and fast-forward icons on a video player represent time-based operations on a fixed universal timeline, not reading direction. A play button always points right; a rewind button always points left. These are not mirrored.
- **Phone numbers** — telephone numbers are always rendered in their conventional digit sequence, which is LTR. Wrapping a phone number in `<bdi>` ensures it is never accidentally reversed by the Unicode bidirectional algorithm.
- **Prices and currency** — numeric amounts are LTR. Currency symbol position relative to the number is locale-determined (see Section 6), but the number itself reads left-to-right.
- **Logos and wordmarks** — brand assets are not mirrored.
- **Non-directional icons** — a star, a heart, a close (×) icon, a settings gear, or a user avatar carries no inherent directional meaning and must never be flipped.
- **Maps and geographic imagery** — compass orientation is universal.
- **Mathematical and scientific notation** — equations, formulas, and scientific symbols always render LTR.

### Mirroring Icons with CSS

For genuinely directional icons (chevrons, arrows, back/forward buttons, send/receive icons that imply a direction of flow), the correct implementation uses `transform: scaleX(-1)` applied via a CSS utility class rather than maintaining separate RTL icon assets:

```css
[dir="rtl"] .icon-directional {
  transform: scaleX(-1);
}
```

This approach means a single SVG asset handles both directions. The `scaleX(-1)` flip is visually identical to a horizontally mirrored SVG at no additional asset cost. However, this transform must only be applied to icons that genuinely change meaning with direction. Applying it to non-directional icons (close, star, settings) produces incorrect results and signals a misunderstanding of the mirroring model.

### `writing-mode` for Vertical Text

CSS `writing-mode: vertical-rl` or `writing-mode: vertical-lr` enables vertical text layout, which is a feature of CJK typographic tradition — Chinese, Japanese, and Korean texts are often composed in vertical columns reading top-to-bottom, right-to-left. This property must never be applied to Arabic, Hebrew, or other RTL scripts. RTL scripts run horizontally; vertical RTL text is not a standard typographic form and will produce illegible results.

---

## 2. CJK Typography

Chinese, Japanese, and Korean scripts have typographic properties that differ substantially from Western Latin. Each glyph occupies a full square em, strokes are complex and numerous, and word boundaries do not exist in the same way as in Latin. These properties require deliberate configuration to render correctly and readably.

### Line Height

CJK body text requires a line height of 1.5–1.8 times the font size. This range is tighter than the commonly cited 1.4–1.6 recommendation for Western Latin text, but the reason is different: CJK glyphs occupy a larger proportion of the em square, and their visual density is higher. Without adequate line height, the visual "color" of a CJK text block becomes oppressively dark and the vertical rhythm collapses.

The practical implication is that a product which sets `line-height: 1.4` globally — a common default for English body copy — will produce overly tight CJK text that readers find fatiguing. Set the line height per locale or per language in the CSS, either using lang-based selectors or by applying a CSS class that is added to `<html>` alongside the lang attribute:

```css
:lang(zh), :lang(ja), :lang(ko) {
  line-height: 1.65;
}
```

### Text Justification

Never apply `text-align: justify` to CJK text without a CJK-aware justification engine. Standard CSS justification distributes whitespace between words. In Latin text, this adds space at word boundaries. In CJK text, there are no word boundaries in the typographic sense — each character is individually spaced — so browsers that lack CJK justification awareness either do nothing (most browsers) or distribute space in ways that create rivers of whitespace and uneven optical density. The correct CJK text alignment is `text-align: start` (which resolves to right-aligned in RTL contexts) or explicit `text-align: left` for horizontally presented CJK.

CSS Text Level 4 introduces `text-justify: inter-character`, which does handle CJK justification correctly, but browser support is still partial. Until it is universally available, avoid justified CJK text entirely.

### Font Fallback Stacks

System fonts for CJK scripts differ by platform and by script variant. A well-constructed font stack lists preferred fonts in priority order, falling back through platform-native options to a generic family. The stacks below cover the major platforms (macOS/iOS, Windows, and Android):

**Simplified Chinese (Mainland China, Singapore):**
```css
font-family: "PingFang SC", "Microsoft YaHei", "STHeiti", "WenQuanYi Micro Hei", sans-serif;
```

**Traditional Chinese (Taiwan, Hong Kong, Macau):**
```css
font-family: "PingFang TC", "Microsoft JhengHei", "STFangsong", "Apple LiGothic Medium", sans-serif;
```

**Japanese:**
```css
font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif;
```

**Korean:**
```css
font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
```

PingFang (SC and TC variants) ships on macOS and iOS. Microsoft YaHei and JhengHei ship on Windows. Noto Sans variants (JP, KR, SC, TC) are the reliable cross-platform fallback for Android and Linux. Including Noto Sans variants provides coverage on platforms where system CJK fonts may not be present.

### Font Size Floor

Never render CJK body text below 14px. CJK glyphs have a high stroke complexity — a single character may contain dozens of strokes at different angles. At sizes below 14px, strokes begin to merge or disappear on non-retina displays, turning legible characters into ambiguous blobs. This is a more severe legibility failure than occurs with Latin text at small sizes, because a misread Latin letter rarely causes complete meaning loss; a misread CJK character can change the meaning of an entire sentence.

The minimum of 14px applies specifically to body text. Labels, captions, and supplementary text in dense interfaces may go as low as 12px only on retina displays where sub-pixel rendering provides adequate stroke clarity. Never go below 12px regardless of display density.

### Word Breaking

Use `word-break: break-all` for CJK text. Because CJK scripts have no inter-word spaces, the browser has no natural break opportunities within a continuous run of characters. Without `word-break: break-all`, a long CJK string will overflow its container rather than wrapping. The `overflow-wrap: break-word` property alone is insufficient — it only breaks at word boundaries, which do not exist in CJK.

```css
:lang(zh), :lang(ja), :lang(ko) {
  word-break: break-all;
}
```

This setting does not harm Latin text embedded within CJK paragraphs because the browser still prefers natural Latin word boundaries when they exist; `break-all` only takes effect when no other break opportunity is available.

---

## 3. Arabic and Hebrew Typography

Arabic and Hebrew are both right-to-left scripts, but they have different typographic properties that require different handling.

### Arabic

Arabic is a connected script — letters in a word join to their neighbors, changing form based on their position (initial, medial, final, isolated). This means that inserting visual space between letters by manipulating `letter-spacing` does not merely change the tracking; it breaks the word by separating letterforms that are designed to connect. Never apply positive `letter-spacing` to Arabic text. The visual result is not "spaced Arabic" — it is unreadable fragments.

Within an RTL context established by `dir="rtl"`, Arabic text should be aligned with `text-align: right` (or the logical equivalent `text-align: start`). Arabic text never uses `text-align: justify` for the same reasons as CJK, with the additional complication that letter connection makes justification even less reliable.

Font selection for Arabic requires fonts that include the full range of Arabic letter forms, contextual alternates, and diacritical marks (harakat). System fonts (SF Arabic on Apple platforms, Segoe UI on Windows) handle this correctly. When using web fonts for Arabic, verify that the font includes all required Unicode blocks (U+0600–U+06FF for basic Arabic, U+FB50–U+FDFF for Arabic Presentation Forms-A).

### Hebrew

Hebrew is a right-to-left script with standalone glyphs — letters do not connect to their neighbors. This means `letter-spacing` is safe to use for Hebrew text and can be used for aesthetic and readability purposes in the same way as Latin. This is a meaningful practical difference from Arabic, where the same property causes rendering failures.

Hebrew text uses `text-align: right` (or `text-align: start`) within RTL context. Nikud (vowel diacritic marks) are used in some Hebrew contexts (children's books, prayer texts, poetry) but are absent in most digital UI text. Font stacks for Hebrew should include "David", "Arial Hebrew", or "Noto Sans Hebrew" as fallbacks.

### Bidirectional Text

Mixed RTL and LTR content — common when Arabic or Hebrew text includes embedded product names, URLs, user-entered numbers, or quoted Latin strings — is handled by the Unicode Bidirectional Algorithm (UBA). The UBA resolves most cases correctly, but several scenarios require explicit markup:

**Use `<bdi>` for user-generated text** embedded within a known-direction sentence. If an Arabic interface displays a username that may be Latin, Hebrew, or Arabic, wrapping the username in `<bdi>` (bidirectional isolation) tells the browser to determine the username's direction independently rather than inheriting the surrounding RTL context. Without `<bdi>`, a Latin username in the middle of an Arabic sentence can cause the surrounding text to reflow incorrectly.

```html
<!-- Arabic sentence with isolated user-generated name -->
<p dir="rtl">مرحباً <bdi>John_123</bdi>، كيف حالك؟</p>
```

**Use Unicode control characters as a last resort** — the LRE (U+202A), RLE (U+202B), LRO (U+202D), RLO (U+202E), and PDF (U+202C) marks can be embedded in plain-text strings where HTML markup is unavailable. However, these invisible characters can cause accessibility issues (screen readers may announce them) and complicate string manipulation. Prefer `<bdi>` and CSS `unicode-bidi` where markup is possible.

### Quotation Marks

Quotation conventions differ between Arabic and Hebrew:

- **Arabic:** Uses guillemets `«»` (French-style double angle brackets) or decorative quotation marks `❝❞`. The simple `""` ASCII quotation marks are understood but considered informal.
- **Hebrew:** Uses low-high marks `„"` — the opening mark is low (double low-9 quotation mark, U+201E) and the closing mark is high (right double quotation mark, U+201C). This convention mirrors German usage.

These distinctions matter for interfaces that generate quoted content programmatically, such as pull-quote components, testimonial blocks, or inline citation formatting.

---

## 4. Devanagari, Tamil, and Thai

Several non-CJK, non-RTL scripts present typographic challenges that are easily overlooked by teams whose design systems were built for Latin text. The common thread is that these scripts use stacked diacritical marks that extend above and below the baseline, requiring more vertical space than Latin letters of the same nominal font size.

### Devanagari (Hindi, Marathi, Sanskrit)

Devanagari glyphs are connected at the top by a horizontal head-stroke called the mātrā (शिरोरेखा). Vowel matras and consonant clusters create compound characters that extend both above and below the main body of the text. Line height must be at least 1.6 to prevent these extensions from overlapping with adjacent lines. More critically, never apply `overflow: hidden` to a container holding Devanagari text without verifying that the line height provides adequate clearance for ascending matras. A container that clips its contents will visually cut off the tops of many Devanagari characters, producing illegible fragments.

Font recommendations for Devanagari include "Noto Sans Devanagari", "Mangal" (Windows), and "Kohinoor Devanagari" (Apple platforms). When Devanagari text renders poorly, the first diagnostic step is to check whether the active font includes the Devanagari Unicode block (U+0900–U+097F).

### Tamil

Tamil is an abugida with complex conjunct characters and independent vowel signs. Compound characters can extend significantly above and below the typographic baseline, much like Devanagari. The same line-height minimum of 1.6 applies, and the same `overflow: hidden` caution holds. Tamil is used primarily in Tamil Nadu (India) and Sri Lanka, and its script is distinct from Hindi/Devanagari — they are not related visually or phonologically. Font support for Tamil requires fonts including the Tamil Unicode block (U+0B80–U+0BFF), such as "Noto Sans Tamil" or the system font "Tamil Sangam MN" on Apple platforms.

### Thai

Thai uses a complex system of tonal marks and vowel signs that stack both above and below consonants. A single syllable may be represented by a consonant with a vowel above it and a tonal mark above that — a three-layer vertical stack. This requires a minimum line height of 1.7 for Thai body text. Tighter line heights cause tonal marks from one line to overlap with the top of descenders from the line above, making the text visually inseparable.

Thai text must never be converted to uppercase. While the CSS property `text-transform: uppercase` is sometimes applied globally (for example, to all navigation labels or button labels), Thai has no uppercase/lowercase distinction. Applying `text-transform: uppercase` to Thai text has no visible effect in some browsers and produces garbled output in others. If uppercase is applied globally, suppress it for Thai with a lang selector:

```css
:lang(th) {
  text-transform: none;
}
```

Font recommendations for Thai include "Thonburi" (Apple platforms), "Tahoma" and "Leelawadee UI" (Windows), and "Noto Sans Thai" as a universal fallback.

---

## 5. Cultural Color Meanings

Color carries cultural meaning that varies substantially across regions and traditions. A color that signals celebration and good fortune in one culture may signal mourning or danger in another. Design decisions that use color to communicate meaning — success, warning, premium status, pricing — must account for these associations, particularly in contexts where the product is being localized rather than merely translated.

The table below documents the primary cultural associations for six key colors across major global markets. These are dominant conventional associations, not universal truths; individual variation always exists within any culture.

| Color | US / Western Europe | China / East Asia | Japan | Islamic World | India | Brazil |
|-------|--------------------|--------------------|-------|---------------|-------|--------|
| **Red** | Danger, stop, error; also passion and urgency | Luck, prosperity, celebration, festivity; red envelopes (hóngbāo) symbolize gift-giving and fortune | Danger, warning; also energy and passion; in traditional contexts, sacred | Danger, caution; not strongly positive or negative; some associations with sacrifice | Purity in some traditions; danger and warning in modern UI contexts | Passion, energy, also associated with Carnival; not primarily danger |
| **White** | Purity, cleanliness, minimalism, wedding color | Mourning, death, funerals; white flowers are funeral flowers; use caution in celebratory contexts | Death, mourning; white is the traditional funeral color in Japan | Purity, peace, cleanliness; positive associations; used in religious contexts | Mourning (widowhood) in traditional Hindu contexts; purity in some contexts | Peace, purity; wedding color; largely positive |
| **Green** | Positive, go, success, environmental; money (US) | Growth, health, environmental awareness; increasingly positive; no strong negative connotations | Nature, youth, freshness; positive | The color of Islam; sacred, paradisiacal; strongly positive across Islamic cultures | Auspicious, prosperity, new beginnings; associated with fertility and harvest | Nature, rainforest, ecology; strongly positive; national color association |
| **Blue** | Trust, security, technology, calm; dominant corporate color | Immortality, healing; less dominant than red or gold; associated with cold and sadness in some regional contexts | Calm, cleanliness, coolness; positive in modern contexts | Safety, heaven, protection; positive across many Islamic traditions; widely used in architecture | Trust, wisdom, divine (Krishna is depicted in blue); largely positive | Trust, loyalty, sadness; also associated with Iemanjá (water deity) in Afro-Brazilian traditions |
| **Yellow** | Caution (when paired with black), happiness, sunshine; gold = wealth | Imperial color historically; gold = wealth and good fortune; yellow is very positive | Joy, optimism, sunshine; associated with courage in traditional contexts | Joy, happiness; gold is a positive color associated with wealth and paradise | Auspicious (associated with turmeric and festivals like Basant Panchami); highly positive | Joy, optimism, sunshine; also associated with caution (traffic context) |
| **Black** | Sophistication, luxury, formality, death/mourning | Bad luck, evil, irregularity; less used in celebratory contexts; increasingly neutral in urban/modern contexts | Formality, sophistication, evil in some traditional narratives; increasingly neutral and elegant in design | Death, mourning; but also strength and authority; widely used in calligraphy and art | Evil, darkness, inauspicious; typically avoided in celebratory contexts | Mourning, death; also sophistication and elegance in urban fashion contexts |

### Practical Application

These associations have direct implications for product design decisions. A "success" state that uses green with white text works well in Western European markets but is potentially jarring in contexts where white signals mourning. A premium tier that uses gold/yellow resonates strongly in Chinese, Indian, and Islamic contexts. Red as a primary brand color is highly positive in China but primarily reads as warning or danger in Western UI conventions.

When localizing a design system, audit the semantic color tokens (success, warning, error, premium, notification) and verify that the chosen colors do not carry strongly negative associations in the target market. This does not always require changing the color — it may require pairing the color with additional typographic or iconographic signals that reinforce the intended meaning independently of the color.

---

## 6. Number, Date, and Currency Formatting

Number and date formatting is one of the most frequently implemented incorrectly. The temptation to format numbers manually — a `.toFixed(2)` here, a `.replace('.', ',')` there — produces fragile code that breaks for edge cases (negative numbers, very large numbers, non-standard locales) and requires constant maintenance as markets are added. The correct approach uses the browser's `Intl` API universally and unconditionally.

### Number Formatting with `Intl.NumberFormat`

The `Intl.NumberFormat` constructor accepts a locale string and an options object and handles all locale-specific separators, decimal marks, and digit systems:

```js
// US: "1,234,567.89"
new Intl.NumberFormat('en-US').format(1234567.89);

// Germany: "1.234.567,89"
new Intl.NumberFormat('de-DE').format(1234567.89);

// France: "1 234 567,89" (narrow non-breaking space)
new Intl.NumberFormat('fr-FR').format(1234567.89);

// Arabic (Eastern Arabic numerals): "١٢٣٤٥٦٧٫٨٩"
new Intl.NumberFormat('ar-EG').format(1234567.89);
```

Thousand separator conventions differ significantly across markets:

| Market | Thousand separator | Decimal separator |
|--------|--------------------|------------------|
| United States, United Kingdom | `,` (comma) | `.` (period) |
| Germany, Brazil, most of continental Europe | `.` (period) | `,` (comma) |
| France, Switzerland (French) | `\u202f` (narrow no-break space) | `,` (comma) |
| India | `,` but with South Asian grouping (2-2-3) | `.` (period) |
| Arabic locales | `٬` or `,` depending on region | `٫` or `.` |

Never manually implement these with string replacement. The combinations are too numerous and too locale-specific to maintain reliably by hand.

### Date Formatting with `Intl.DateTimeFormat`

Date format conventions vary not only in separator character and component order but also in calendar system. The Gregorian calendar is dominant in most markets, but the Islamic (Hijri) calendar is used in many Arabic-speaking countries, the Hebrew calendar is used in Israel, and the Japanese imperial calendar (gengō) is used in some Japanese government and business contexts.

```js
// US: "4/24/2026"
new Intl.DateTimeFormat('en-US').format(new Date('2026-04-24'));

// Germany: "24.4.2026"
new Intl.DateTimeFormat('de-DE').format(new Date('2026-04-24'));

// Japan (Gregorian): "2026/4/24"
new Intl.DateTimeFormat('ja-JP').format(new Date('2026-04-24'));

// Saudi Arabia (Islamic calendar): displays in Hijri
new Intl.DateTimeFormat('ar-SA', { calendar: 'islamic' }).format(new Date('2026-04-24'));
```

Never hardcode date strings in any format. A hardcoded string like "April 24, 2026" is not automatically localized, fails for screen readers in non-English locales, and requires code changes when date display requirements change.

### RTL Currency Formatting

In Arabic-locale contexts, the amount appears to the left of the currency symbol: `1,234 ﷼` rather than `﷼1,234`. This is the typographically correct convention for right-to-left currency display and is handled automatically by `Intl.NumberFormat` when the correct locale is used:

```js
// Produces the correct Arabic currency format automatically
new Intl.NumberFormat('ar-SA', {
  style: 'currency',
  currency: 'SAR'
}).format(1234.56);
```

Do not attempt to replicate this logic manually. The `Intl` API encodes the correct CLDR (Common Locale Data Repository) behavior for each locale, including symbol position, spacing, and digit system.

---

## 7. Inclusive Imagery

Visual imagery in products communicates assumptions about who the product is for. When all human figures in a product's illustration system share the same skin tone, body type, and cultural presentation, the implicit message is that other users are outside the intended audience. Inclusive imagery is not a cosmetic concern — it is a fundamental signal about who the product treats as a default person.

### Skin Tone Representation

The Fitzpatrick scale provides five skin tone modifiers (Types I–V, plus the neutral/default) that are universally implemented in Unicode emoji. When selecting or commissioning illustrations for product use, apply the same principle: deliberately distribute skin tones across the Fitzpatrick range rather than defaulting to a single tone.

In illustration systems where human characters appear consistently, define a set of three to five distinct skin tone values in the design system's color tokens (analogous to `--skin-tone-1` through `--skin-tone-5`) and apply them across the illustration library. This approach ensures that different use cases (success states, onboarding illustrations, error pages, empty states) collectively represent a range of human appearances rather than defaulting to a single idealized user.

When skin tone is rendered via SVG fills, the tokens can be overridden per use case or per user preference, allowing a product to display a skin tone that matches the logged-in user's explicit selection.

### Gender Representation

Avoid gendered role assignments in professional or technical imagery. Illustrations that consistently depict doctors as male and nurses as female, or that associate technical roles with men and care roles with women, reinforce stereotypes that make some users feel excluded from the product's imagined community.

The practical default for professional and technical illustrations is gender-neutral presentation: clothing, hairstyles, and body proportions that do not resolve definitively to a single gender presentation. Where specific gender presentation is relevant (for example, a product feature specifically for a particular community), use accurate and affirming representation. Where it is not relevant, default to ambiguity.

Avoid the common workaround of representing gender neutrality solely through an abstract avatar (silhouette, geometric shape, or headless torso). These representations avoid the problem rather than solving it. Users do not recognize themselves in abstractions; they recognize themselves in characters that are drawn with care and detail.

### Ability and Assistive Technology

People who use wheelchairs, prosthetic limbs, hearing aids, white canes, and other assistive devices are users, not exceptions. An illustration system that never depicts assistive technology is implicitly representing a world in which all users are non-disabled — an inaccurate and exclusionary representation.

Include assistive devices in diverse illustration sets at a proportion that reflects their real-world prevalence. This means that not every illustration must include a wheelchair user, but across the full illustration library, multiple instances should naturally appear. The presence of assistive technology in product imagery sends a clear signal to disabled users that the product has considered their existence. The absence sends the opposite signal.

When depicting wheelchair users, hearing aid users, or prosthetic users, represent them as doing the same things as other users in the illustration — completing tasks, experiencing success states, using the product in its intended context. Avoid representations that isolate disability as a subject of the illustration rather than incidental to the depicted activity.

### Cultural Dress and Representation

Technical and professional product imagery should default to contemporary clothing that reflects the actual dress of people who work in modern professional contexts, which is globally diverse. Reducing cultural representation to traditional or ceremonial dress — the turban as a shorthand for South Asian identity, the kimono as a shorthand for Japanese identity — reduces rich cultural identities to costume.

When contemporary clothing is depicted, it should reflect the actual diversity of how people dress globally: headscarves and hijabs worn by Muslim women are contemporary professional dress, not traditional costume. Saris worn in professional contexts are contemporary professional dress. The standard should be that each depicted person is dressed in a way that is accurate to how a person from their apparent background might actually dress in the context being depicted, not in a way that telegraphs their cultural identity as a distinguishing marker.

Skin tone, body size, age, and hair type should all be varied across the illustration library. An illustration system that depicts only young, thin, able-bodied people with a narrow range of hair types is making assumptions about who uses the product. Challenge each of these defaults when commissioning or curating illustration assets.

---

*This reference governs international layout, typography, formatting, and imagery decisions within the get-design-done framework. Deviations require explicit justification in `.design/DESIGN-CONTEXT.md` as a C-XX constraint.*
