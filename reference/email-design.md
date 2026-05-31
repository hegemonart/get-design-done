# Email Design — Constraint Catalogue

This reference is the **email-constraint catalogue**: the hard email-client rules an
email template MUST honor. Email is a *constrained* HTML/CSS surface — the modern
HTML/CSS the web executor emits (flexbox, grid, `<style>` sheets, `position`) is
dropped or mis-rendered by most email clients. This file is the **authority** that the
email-executor (Phase 34.2-02) generates against and the design-verifier's email branch
(34.2-03) audits against; neither re-derives these rules. The deterministic subset of
this catalogue is checked by [`scripts/lib/email/validate-email-html.cjs`](../scripts/lib/email/validate-email-html.cjs),
whose emitted `rule` ids are the constraint-ids defined below (the spec is the authority).

It is the sibling of [`reference/platforms.md`](./platforms.md). The two files have
distinct jobs and must not be confused:

| File | Job |
| --- | --- |
| `reference/platforms.md` (Phase 19) | Interaction **conventions** — navigation, safe areas, gestures, native typography, haptics. *Behavioral* knowledge for native/web screens. |
| `reference/email-design.md` (Phase 34.2, this file) | The email **constraint catalogue** — table-based layout, inline styles, MSO conditional comments, dark-mode `color-scheme`, ~600px max-width, image/alt rules, and top-20-client quirks. *Structural* knowledge an email template implements. |

Per **D-02** there is **no `mjml` runtime dependency**: MJML source is the agent's
canonical artifact and the HTML is derived by the agent, not a build step. Per **D-03**
email verify is this catalogue's *static* validator plus an *optional* Litmus /
Email-on-Acid render-test connection that degrades to the static validator when absent.
Per **D-10** the static checks are deterministic (same HTML string → same result), with
no network and no `mjml`, so the default `npm test` stays green on any machine.

Each constraint carries a **rule-id** (`EM-<CLASS>-NN`). Section 8 marks exactly which
ids the static validator asserts versus which are render-tested guidance only.

---

## 1. Purpose

Phase 19 shipped platform *references*; Phase 23 shipped the token engine; Phase 34.1
added native generators. Email is the remaining untouched product surface, and its
constraints are unlike both web and native: a fifteen-year-old rendering engine
(Outlook/Word), aggressive `<head>` stripping (Gmail), and a long tail of per-client
quirks. Instead of each email being authored from memory, the constraints live once
here (the catalogue) and once in the validator (the statically-checkable subset), and
the executor + verifier consume them. This file is the single SC#9-email authority.

The catalogue is **prose + tables**, not an implementation. Illustrative snippets are
kept to 2–3 lines. The implementation is `validate-email-html.cjs`.

---

## 2. Layout — tables, not flexbox/grid/position

Email layout uses nested `role="presentation"` **tables**, never the modern CSS box
primitives. `display:flex`, `display:grid`, and `position:absolute|fixed|sticky` are
dropped or mis-rendered by Outlook (Word engine), older Gmail, and many mobile clients,
collapsing a layout to a single column or off-screen elements.

| Rule-id | Constraint |
| --- | --- |
| **EM-LAYOUT-01** | Layout is built from `role="presentation"` tables. The forbidden modern primitives — `display:flex`, `display:grid`, `position:absolute`, `position:fixed` (and `position:sticky`) — MUST NOT appear in any `style`. *(Statically checkable: their presence is flagged.)* |
| EM-LAYOUT-02 | Body content sits in a fixed-/max-width container of ~**600px** (the safe width across the desktop preview pane and most mobile clients). Wider tables clip in Outlook and force horizontal scroll on mobile. |
| EM-LAYOUT-03 | Use `cellpadding="0" cellspacing="0" border="0"` on layout tables and prefer cell `padding` over margins (margins are inconsistently honored). |
| EM-LAYOUT-04 | Single primary column on mobile; multi-column desktop layouts degrade to stacked rows. Do not rely on `float` for columns (use side-by-side `<td>`s or `align`). |
| EM-LAYOUT-05 | Set explicit `width` on tables/cells; never assume an intrinsic content width. Outlook ignores CSS `max-width` on many elements — pair it with a `<!--[if mso]>` ghost table (see §4). |

```html
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
       style="max-width:600px;margin:0 auto;"><tr><td>…</td></tr></table>
```

---

## 3. Styling — inline, not a `<style>` block

Visual styling lives in **inline `style="…"` attributes** on each element, NOT in a
`<head><style>` sheet. Gmail (and several webmail clients) strip or heavily limit
`<head>` styles, so any rule that *must* apply is inlined. A `<style>` block is
**tolerated only** for progressive enhancement that degrades gracefully — chiefly
`@media` queries for responsive/dark-mode — never as the primary styling mechanism.

| Rule-id | Constraint |
| --- | --- |
| **EM-STYLE-01** | Core/visual styling is inline. A `<style>` block used as the PRIMARY styling mechanism (non-`@media` rules, or a large sheet) is forbidden because Gmail strips it. *(Statically checkable: a non-trivial `<style>` block carrying non-`@media` rules is flagged; a small `@media`-only block is tolerated.)* |
| EM-STYLE-02 | Avoid CSS shorthand that clients mangle (`background` shorthand, unitless line-heights in some clients); prefer longhand (`background-color`). |
| EM-STYLE-03 | No external stylesheets (`<link rel="stylesheet">`) and no `@import` — clients strip them. |
| EM-STYLE-04 | A small `@media`-only `<style>` for responsive breakpoints / dark-mode is the one accepted `<style>` use; it must enhance, not be required for, a readable layout. |

---

## 4. Outlook / MSO conditional comments

Outlook on Windows renders with Microsoft Word's HTML engine. It needs **MSO
conditional comments** to apply Outlook-specific fallbacks (ghost tables for centering
and width, VML for background images and bulletproof buttons) and to hide modern markup
it would mangle.

| Rule-id | Constraint |
| --- | --- |
| **EM-MSO-01** | A full email document MUST include at least one MSO conditional comment — `<!--[if mso]> … <![endif]-->` and/or `<!--[if !mso]><!--> … <!--<![endif]-->`. *(Statically checkable: absence in a full-email document is flagged.)* |
| EM-MSO-02 | Use `<!--[if mso]>` **ghost tables** to give Outlook an explicit fixed width and centering that it would otherwise drop from CSS `max-width`/`margin:auto`. |
| EM-MSO-03 | Use **VML** (`<v:roundrect>`, `<v:fill>`) inside `<!--[if mso]>` for rounded "bulletproof" buttons and background images, since Outlook ignores `border-radius` and CSS `background-image`. |
| EM-MSO-04 | Add the MSO DPI/namespace head fixes (`o:OfficeDocumentSettings`, `xmlns:v`/`xmlns:o`, `mso-line-height-rule:exactly`) to stabilize spacing and image scaling. |

```html
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
  <!-- modern markup here -->
<!--[if mso]></td></tr></table><![endif]-->
```

---

## 5. Dark mode

Clients invert or remap colors in dark mode inconsistently (Outlook.com fully inverts;
Apple Mail and Gmail partially; some not at all). Declare a **`color-scheme`** signal so
clients keep the intended palette, and use `prefers-color-scheme` for explicit dark
overrides.

| Rule-id | Constraint |
| --- | --- |
| **EM-DARK-01** | Declare a `color-scheme` signal: a `<meta name="color-scheme" content="light dark">` and/or a `color-scheme: light dark;` CSS declaration and/or a `@media (prefers-color-scheme: dark)` block. At least one MUST be present. *(Statically checkable: total absence of any color-scheme signal is flagged. A `<meta name="color-scheme">` alone satisfies it — decoupled from any `<style>` block.)* |
| EM-DARK-02 | Pair `color-scheme` with `supported-color-schemes` (meta) for Apple Mail / Outlook. |
| EM-DARK-03 | Beware forced color inversion: set explicit `background-color` AND `color` on text containers so an inverting client cannot produce unreadable low-contrast pairs. |
| EM-DARK-04 | Provide dark-mode-friendly logos (transparent PNG or a `prefers-color-scheme` image swap) so a dark background does not hide a dark logo. |

---

## 6. Images & accessibility

Images are often blocked by default and must degrade gracefully; accessibility rules
prevent broken layouts and unreadable content. *(Guidance — not all statically
asserted; see §8.)*

| Rule-id | Constraint |
| --- | --- |
| EM-IMG-01 | Every `<img>` carries explicit `width` and `height` attributes (Outlook needs them; prevents reflow when images load). |
| EM-IMG-02 | Every `<img>` carries meaningful `alt` text (shown when images are blocked) and `display:block` to avoid the baseline gap below images. |
| EM-IMG-03 | Serve retina images at 2× and constrain with `width`/`height` so they render crisp without breaking the layout. |
| EM-IMG-04 | Buttons are **bulletproof** (table/`<a>` with padding + VML fallback for Outlook), never an image-only CTA that vanishes when images are blocked. |
| EM-A11Y-01 | Set the document `lang`, a real `<title>`, and a logical heading/reading order; ensure WCAG-AA text contrast that survives dark-mode inversion. |

---

## 7. Top-20 client quirks

The top-20-by-market-share email clients and their headline quirks. *(Catalogue —
most are render-tested via the optional Litmus / Email-on-Acid connection (34.2-02),
NOT statically checkable; see §8.)*

| Rule-id | Client | Headline quirk |
| --- | --- | --- |
| EM-CLIENT-01 | Apple Mail (iOS) | Most standards-compliant; honors `<style>` + media queries; auto-scales text — set `meta viewport`. |
| EM-CLIENT-02 | Apple Mail (macOS) | WebKit-based, robust; respects `prefers-color-scheme`; watch auto-link of dates/addresses. |
| EM-CLIENT-03 | Gmail (web) | **Strips `<head>` styles** beyond a limited `<style>`; clips messages over ~102KB ("[Message clipped]"); requires inline styles. |
| EM-CLIENT-04 | Gmail (mobile app, default account) | Supports a `<style>` block + media queries; same ~102KB clip; no `:hover` reliability. |
| EM-CLIENT-05 | Gmail (mobile, non-default / IMAP "GANGA") | **Strips `<style>` entirely** — only inline styles survive; the strictest Gmail mode. |
| EM-CLIENT-06 | Outlook 2016–2021 (Windows) | **Word engine**: no flexbox/grid/`position`, ignores `max-width`/`border-radius`/CSS `background-image`; needs ghost tables + VML + `mso-line-height-rule:exactly`. |
| EM-CLIENT-07 | Outlook (Microsoft 365, Windows) | Word engine like 2016/2019; DPI scaling bugs — set explicit image `width`/`height`. |
| EM-CLIENT-08 | Outlook.com (web) | Different (better) engine than desktop; **aggressive dark-mode color inversion**; rewrites some colors. |
| EM-CLIENT-09 | Outlook (macOS) | WebKit-based (unlike Windows); far more capable; still test buttons/spacing. |
| EM-CLIENT-10 | Outlook (mobile, iOS/Android) | Largely fine; respects media queries; watch link color overrides. |
| EM-CLIENT-11 | Yahoo Mail | Supports media queries; strips/rewrites some `class`/`id`; avoid unsupported pseudo-classes. |
| EM-CLIENT-12 | AOL Mail | Shares Yahoo's engine; similar class/id handling. |
| EM-CLIENT-13 | Samsung Mail (Android) | Webview-based; media-query support varies by version; test stacking. |
| EM-CLIENT-14 | Android default / Gmail-for-non-Gmail | Inline-only safe mode; treat like the strict Gmail IMAP mode. |
| EM-CLIENT-15 | Thunderbird | Gecko-based, capable; honors most CSS; test dark theme. |
| EM-CLIENT-16 | Windows 10/11 Mail | EdgeHTML/Chromium-ish; generally capable; watch padding. |
| EM-CLIENT-17 | Proton Mail | Sanitizes aggressively; strips remote content until approved; inline-safe. |
| EM-CLIENT-18 | Fastmail | Standards-friendly; respects media queries and dark mode. |
| EM-CLIENT-19 | Zoho Mail | Reasonable CSS support; test buttons + dark mode. |
| EM-CLIENT-20 | GMX / Web.de | EU webmail; limited CSS; lean on inline styles + tables. |

---

## 8. Statically-checkable vs render-tested

This table is the **contract** the validator's `rule` ids map to. The four rule-ids
below are the deterministic subset that `scripts/lib/email/validate-email-html.cjs`
asserts via regex/string analysis of the supplied HTML string. Every other rule-id in
this catalogue is **render-tested guidance** — verified by the optional Litmus /
Email-on-Acid render-test connection (34.2-02), never asserted by the static validator.

| Rule-id | Check | Statically checked by the validator? | How verified otherwise |
| --- | --- | --- | --- |
| **EM-LAYOUT-01** | No `display:flex` / `display:grid` / `position:absolute\|fixed` in any `style` | **YES** — presence flagged | — |
| **EM-STYLE-01** | No `<style>` block as the PRIMARY styling mechanism (non-`@media` rules / large sheet); inline styling expected | **YES** — a non-trivial `<style>` block flagged; a small `@media`-only block tolerated | — |
| **EM-MSO-01** | An MSO conditional comment (`<!--[if mso]>` / `<!--[if !mso]>`) is present in a full-email document | **YES** — absence flagged | — |
| **EM-DARK-01** | A `color-scheme` signal is present (meta `color-scheme` and/or CSS `color-scheme` and/or `prefers-color-scheme`) | **YES** — total absence flagged (a `<meta name="color-scheme">` alone satisfies it) | — |
| EM-LAYOUT-02..05 | ~600px width, cellpadding, single-column, explicit widths | No | Render test (Litmus) |
| EM-STYLE-02..04 | Longhand props, no external CSS, tolerated `@media` | No | Render test |
| EM-MSO-02..04 | Ghost tables, VML, DPI/namespace head | No | Render test (Outlook) |
| EM-DARK-02..04 | `supported-color-schemes`, explicit bg+color, dark logos | No | Render test (dark mode) |
| EM-IMG-01..04, EM-A11Y-01 | width/height, alt, display:block, bulletproof buttons, lang/contrast | No | Render test + a11y review |
| EM-CLIENT-01..20 | Per-client headline quirks | No | Render test (cross-client screenshots) |

Notes on the four statically-checked rules:

- **EM-STYLE-01 heuristic (deterministic).** A `<style>…</style>` block is flagged as the
  primary styling mechanism when, after removing `@media { … }` groups and `@font-face`
  from the block, residual CSS rules remain **or** the block exceeds a generous size
  threshold. A small dark-mode/responsive `@media`-only block (per EM-STYLE-04) is
  therefore tolerated and does NOT trip the check.
- **EM-DARK-01 is decoupled from `<style>`.** A `<meta name="color-scheme" content="…">`
  in `<head>` satisfies EM-DARK-01 on its own, so a fully-inline email with only a
  color-scheme meta (and no `<style>` at all) passes both EM-STYLE-01 and EM-DARK-01.
- **EM-MSO-01 fires only on a full email.** A document is treated as a full email when it
  has `<html>`/`<body>` or a layout `<table>`; a bare fragment is not flagged for a
  missing MSO comment.

---

## 9. Cross-references

- [`reference/platforms.md`](./platforms.md) — the interaction-conventions sibling
  (navigation, safe areas, gestures). The email-executor reads **this** file for the
  email constraints, that file for general platform behavior.
- [`scripts/lib/email/validate-email-html.cjs`](../scripts/lib/email/validate-email-html.cjs)
  — the deterministic static validator that asserts the §8 subset; its `rule` ids are
  the constraint-ids defined here.
- [`reference/registry.json`](./registry.json) — this catalogue is registered as the
  `email-design` entry (type `heuristic`, phase `34.2`) so the registry round-trip test
  (`test/suite/reference-registry.test.cjs`) stays green (D-05, the 33.5-01 / 34.1-01
  lesson).
