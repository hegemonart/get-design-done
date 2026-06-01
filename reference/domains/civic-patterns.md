# Civic & Government Design Patterns

This pack collects the design patterns, legal floors, and review heuristics that apply when building public-sector interfaces — benefits portals, permit and licensing flows, tax filing, election information, and municipal services. GDD loads it automatically when it detects a government / public-sector / civic project (see Detection signals). The legal citations below assume a US context, but the underlying patterns — accessibility floors, plain language, multilingual access, and high-trust defaults — generalize to public services anywhere.

## Why civic is different

In the private sector, accessibility, plain language, and translation are often framed as "nice to have" optimizations weighed against conversion. In government, they are obligations. The audience is non-self-selecting: a citizen cannot choose a competitor when a benefits form is unusable. People arrive under stress, on old hardware, on metered or slow connections, across many languages and literacy levels, often with a disability. The patterns here treat the hardest case as the design center, not the edge.

## Accessibility legal floor

Section 508 of the Rehabilitation Act incorporates **WCAG 2.1 Level AA** as the binding technical standard for US federal ICT. The Americans with Disabilities Act (ADA) extends comparable obligations to state and local government (Title II) and many public accommodations. Treat **WCAG 2.1 AA as a hard floor** — not optional, not an AAA-aspirational stretch goal. You do not "prioritize" it against other work; you cannot ship below it.

Concretely, every civic UI must satisfy at least:

| Requirement | WCAG SC | What it means in practice |
|---|---|---|
| Keyboard operable | 2.1.1 | Every interactive element works without a mouse; no keyboard traps (2.1.2). |
| Visible focus | 2.4.7 | A clear, non-removed focus indicator on every focusable control. |
| Landmarks & headings | 1.3.1, 2.4.6 | Real `main`/`nav`/`header`/`footer` regions; a logical, non-skipping heading outline. |
| Error identification | 3.3.1 | Errors are described in text, programmatically associated with their field. |
| Labels & instructions | 3.3.2 | Every input has a persistent, programmatic label — placeholder is not a label. |
| Not color alone | 1.4.1 | Status, required fields, and errors never rely on color as the only cue. |
| Text contrast | 1.4.3 | 4.5:1 for body text, 3:1 for large text and meaningful UI/graphics (1.4.11). |
| Reflow | 1.4.10 | Usable at 400% zoom / 320 CSS px with no loss of content or horizontal scroll. |
| Captions & transcripts | 1.2.2, 1.2.4 | Captions for video; transcripts/audio descriptions for time-based media. |
| Name, role, value | 4.1.2 | Custom widgets expose correct accessible name, role, and state to assistive tech. |

WCAG 2.2 AA adds obligations worth meeting now: **Focus Not Obscured (2.4.11)**, **Target Size (Minimum) 2.5.8** (24×24 CSS px floor; aim for ~44×44 for primary touch targets), and **Accessible Authentication (3.3.8)** (no cognitive-function test like solving a puzzle or transcribing characters as the only way in). Authoritative references: https://www.section508.gov and https://www.w3.org/WAI/WCAG21/quickref/.

## Multi-language government forms

A practical US minimum is **English + Spanish + Simplified Chinese (`zh-Hans`)**; agencies under Executive Order 13166 / Title VI must provide meaningful access to limited-English-proficient (LEP) users, and the right language set is driven by the served population (Vietnamese, Tagalog, Korean, Haitian Creole, Arabic, and others are common).

Patterns:

- **Persistent language toggle** in a predictable location (top of every page), not buried in a footer or settings panel. Selection persists across the whole session and survives navigation.
- **Translate the content, not just the chrome.** Field labels, help text, **validation/error messages**, confirmation screens, emails, and PDFs must all be localized — a form that switches its buttons to Spanish but throws English errors has failed.
- Set `lang` on the document and on any in-page language switches so assistive tech pronounces content correctly.
- **Right-to-left readiness**: build layouts with logical properties / `dir="rtl"` support so Arabic, Farsi, Urdu, and Hebrew mirror correctly. Don't hard-code left/right.
- **Avoid machine-only translation for legal text.** Eligibility rules, consent, rights notices, and binding terms need human translation and review; raw MT can be a compliance and liability problem.
- Offer an **"I Speak" language-identification card** (a list of "I speak ___" statements in each language) so a user can self-identify their language and request an interpreter.

## Plain language

The **Plain Writing Act of 2010** requires US federal agencies to write public-facing material clearly. Target a **reading level of grade 6–8** (many benefits and health programs aim for grade 6 or lower).

- **Active voice and short sentences.** Prefer "We denied your application" over "Your application has been denied." Keep most sentences under ~20 words; one idea per sentence.
- **Define or avoid jargon and acronyms.** Spell out acronyms on first use; better, replace agency jargon with the everyday word ("proof of income," not "income documentation substantiation").
- **Question-style labels.** "What is your date of birth?" reads more clearly than "DOB" or "Birthdate field."
- **Clear next-step CTAs.** Buttons name the action and outcome ("Submit my application," "Check my status") rather than generic "OK"/"Continue" where ambiguous.
- **Front-load the point.** Lead with what the user must do or what happened, then the detail. Use headings, short paragraphs, and lists.
- Guidance: https://www.plainlanguage.gov. The **US Web Design System (USWDS)** encodes much of this in components and content guidance: https://designsystem.digital.gov.

## Trust & accessibility-first defaults

- **Generous session timeouts with warning + extend.** Per **WCAG 2.2.1 (Timing Adjustable)**, warn before a session expires and let the user extend or turn off the limit; never silently discard a half-finished benefits application. Pair with save-and-resume.
- **No dark patterns.** No pre-checked consent, no confirm-shaming, no buried opt-outs, no fake urgency. Government must not manipulate; defaults should favor the user.
- **Save-and-resume for long forms.** Let users leave and return without losing data — assume interruptions, shared/library computers, and multi-session completion.
- **Print-friendliness.** Provide clean print styles and downloadable/printable confirmations and records; many users keep paper copies or mail documents.
- **Low-bandwidth / older-device tolerance.** Server-render core content, keep payloads small, avoid blocking on heavy JS, and ensure the form is usable without the latest browser. Test on slow connections and old devices.
- **Clear `.gov` identity & PII handling.** Show the official agency identity (the USWDS gov banner pattern), a plain-language privacy notice, and explain what personal information is collected, why, and how it is protected. Minimize PII collected; never expose SSNs or case numbers in URLs.

## Forms at scale

- **One-thing-per-page** (GOV.UK Design System style): ask a single question (or one tight group) per screen. It lowers cognitive load, simplifies validation and error messaging, and is far easier to make accessible and translatable. See https://design-system.service.gov.uk.
- **Progressive disclosure.** Reveal follow-up questions only when relevant (conditional reveals), and keep the default path short for the common case.
- **Inline validation that doesn't punish.** Validate on blur / on submit, not on every keystroke; never block typing. Allow flexible input formats (phone, dates) and normalize server-side rather than rejecting.
- **Accessible error summary.** On a failed submit, render an error summary at the top of the form that lists each problem as a link jumping focus to the offending field, and move focus to the summary. Each field error is also shown inline and programmatically tied to its input (3.3.1).
- **Helpful, specific errors.** Say what's wrong and how to fix it ("Enter your ZIP code as 5 digits"), in plain language and in the user's chosen language.
- **Preserve user input on error.** Re-display everything the user entered; never make them re-key a long form because one field failed.

## Detection signals

GDD should auto-detect the civic/government domain from any combination of:

- **Content / naming keywords:** `gov`, `government`, `public`, `citizen`, `benefits`, `permit`, `license`, `tax`, `election`, `voter`, `municipal`, `county`, `agency`, `eligibility`, `enrollment`, `public service`.
- **`package.json` dependencies (strong signal):**
  - `@uswds/uswds`, `uswds` — US Web Design System
  - `@trussworks/react-uswds` — React USWDS components
  - `govuk-frontend` — GOV.UK Design System
  - `@18f/...` — 18F / TTS tooling and components
- **Domain / config signals:** a `.gov`, `.mil`, or `.gov.<cc>` domain in config or deploy targets; accessibility-first project config (axe-core, `pa11y`, `jest-axe`, `eslint-plugin-jsx-a11y`, Lighthouse a11y budgets) wired into CI.

Any one strong dependency match, or several keyword + domain matches together, should trigger loading this pack.

## Audit checklist

The auditor agent runs these against a civic UI. Each item is concrete and verifiable.

1. Every interactive control is fully keyboard-operable with a visible focus ring, and there are no keyboard traps (WCAG 2.1.1, 2.1.2, 2.4.7).
2. The page exposes correct landmarks and a logical, non-skipping heading outline; custom widgets expose correct name/role/value (WCAG 1.3.1, 2.4.6, 4.1.2).
3. Text contrast meets 4.5:1 (body) / 3:1 (large text and meaningful UI), and no information is conveyed by color alone (WCAG 1.4.1, 1.4.3, 1.4.11).
4. Content reflows and remains fully usable at 400% zoom / 320 CSS px with no horizontal scrolling or lost content (WCAG 1.4.10).
5. Interactive targets meet the 24×24 CSS px minimum (primary touch targets ~44×44), and focus is never obscured (WCAG 2.5.8, 2.4.11).
6. Every input has a persistent programmatic label (not placeholder-only); errors are described in text and tied to their field (WCAG 3.3.1, 3.3.2).
7. On submit failure, an error summary lists each problem, links to and moves focus to the field, and user input is preserved.
8. Reading level is grade 6–8: active voice, short sentences, no undefined jargon/acronyms, question-style labels (Plain Writing Act of 2010).
9. A persistent language toggle covers content, help text, and **errors** — not just UI chrome — for at least EN + ES + zh-Hans, with correct `lang` and RTL readiness; legal/eligibility text is human-translated, not machine-only.
10. Session timeout warns before expiry and offers an extend/disable option, and the form supports save-and-resume (WCAG 2.2.1).
11. No dark patterns: no pre-checked consent, confirm-shaming, or buried opt-outs; defaults favor the user.
12. Official `.gov` identity, a plain-language privacy/PII notice, print-friendly confirmations, and graceful behavior on low bandwidth / older devices are all present; no PII (SSN, case IDs) exposed in URLs.
