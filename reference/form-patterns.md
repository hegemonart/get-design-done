# Form Patterns

Forms are one of the highest-friction surfaces in any product. Every unnecessary click, ambiguous label, or poorly-timed error message is a conversion lost or a user abandoned mid-task. The patterns below are grounded in empirical research — primarily Luke Wroblewski's eye-tracking studies, WCAG 2.1 requirements, and NCSC/NIST guidance on authentication UX.

---

## 1. Label Position

Wroblewski's eye-tracking research measured the number of eye fixations required to move from label to field across the three common label placements. The findings are decisive: top-aligned labels are fastest because the eye travels in one direction — down — without a horizontal context switch.

**Top-aligned labels** are the default for most forms. Completion time is fastest because the label and input form a single vertical unit. They also accommodate longer translated strings without breaking layout, making them the correct default for internationalised products. Use top-aligned labels whenever form complexity is moderate to high or field types are mixed.

**See:** [`./i18n.md`](./i18n.md) §Locale Formatting for the full `Intl.*` family (`NumberFormat`, `DateTimeFormat`, `PluralRules`, `RelativeTimeFormat`, `ListFormat`) over hand-rolled string concatenation — never assemble locale-aware strings via template literals. §Text Expansion explains the +30–40% LTR budget that top-aligned labels accommodate.

**Left-aligned labels** create the slowest completion time because the eye must saccade horizontally from label to field on every row. They earn their place only when scannability of values matters more than speed — settings pages, data-entry tables, or read-heavy forms where users compare label and value together. In these contexts the horizontal alignment aids review, not input.

**Floating labels (Material 3 style)** are an acceptable middle ground when screen real estate is severely constrained. The label begins as visible hint text above the field and remains visible (shrunk, repositioned) after the user starts typing. This pattern is distinct from — and incompatible with — placeholder-as-label. Never use placeholder text as the sole label: when the field receives focus the placeholder disappears, leaving the user to recall what was asked. This is a WCAG 2.1 failure under criterion 1.3.5 (Identify Input Purpose) and a general usability failure on any form longer than three fields.

| Label position | Completion speed | Best use case |
|---|---|---|
| Top-aligned | Fastest | Most forms; mixed field types; long forms |
| Left-aligned | Slowest | Settings pages; data comparison; values matter |
| Floating (Material 3) | Medium | Space-constrained mobile forms |
| Placeholder-only | — | **Never** — WCAG 1.3.5 failure |

---

## 2. Inline Validation Timing

The timing of inline validation determines whether it helps or hinders. Validate too early and you penalise users for typing incomplete but valid input. Validate too late and users reach the submit button without knowing several fields are wrong.

**On-submit only** carries the lowest cognitive load during form completion and is appropriate for short forms (three fields or fewer). The cost is UX debt on long forms: when multiple fields fail at once, the user must scroll up to find errors, fix one, scroll back, and repeat. Provide an error summary at the top if using submit-only validation on long forms (see Section 3).

**On-blur (field exit)** is the recommended default for most forms. Validation fires after the user leaves the field, not while they are in it. This prevents the jarring experience of an error appearing mid-keystroke. The critical rule: never validate on first focus — only after the field has been blurred at least once. A pristine, untouched field should never show an error state.

**On-change (real-time)** is appropriate for two specific cases: password strength meters and character counters. It is not appropriate for format validation such as email addresses. Validating email format on every keystroke flags `hello@` as invalid before the user has finished typing the domain — a false negative that erodes trust in the form.

Never show a red error state before the user has had a realistic opportunity to complete the field. The error state is a signal that something is wrong; triggering it prematurely teaches users to ignore it.

| Timing | When to use | When to avoid |
|---|---|---|
| On-submit | Short forms (≤ 3 fields) | Long multi-section forms |
| On-blur | Default for most fields | — |
| On-change | Password strength, character count | Format validation (email, phone) |

---

## 3. Error Placement and Recovery Copy

Errors placed far from their source — in a top banner, a modal, or a footer — force the user to map the error message back to the problematic field. Errors belong immediately below the field they describe, appearing between the field and the next element in the flow.

**Visual treatment**: error messages must never rely on color alone. A red border communicates nothing to users with red-green color deficiency. Use an error icon alongside the message text. The field border color change is acceptable as a supplemental indicator, not the primary one.

**Copy quality matters enormously.** "Invalid input" is useless. The error message must name what went wrong and specify how to fix it. Write the copy in plain language from the user's perspective:

| Poor copy | Better copy |
|---|---|
| Invalid input | Email must include an @ symbol |
| Password error | Password must be at least 8 characters |
| Required field | Enter your first name to continue |
| Invalid date | Enter a date in DD/MM/YYYY format |

**Focus management on submit**: when a form submits with errors, move programmatic focus to the first error field or to an error summary element. Leaving focus on the submit button and expecting the user to visually scan for errors is a significant accessibility failure and a poor experience on any device.

**Error summary for long forms**: any form with more than five fields should include an error summary at the top of the form when the user attempts to submit. The summary lists each error with a jump-link that moves focus directly to the relevant field. The summary element should receive focus automatically on submit-with-errors. This pattern is required for WCAG 2.4.3 (Focus Order) on complex forms.

```html
<div role="alert" aria-labelledby="error-summary-title" tabindex="-1">
  <h2 id="error-summary-title">There are 3 errors in this form</h2>
  <ul>
    <li><a href="#email">Email must include an @ symbol</a></li>
    <li><a href="#phone">Enter a valid phone number</a></li>
    <li><a href="#dob">Date of birth must be in the past</a></li>
  </ul>
</div>
```

---

## 4. Required Field Conventions

Marking required fields unambiguously prevents submission errors and sets accurate expectations before the user invests time in a form.

The **asterisk (*) convention** is the web default. Mark every required field with `*` and place the legend "* Required" near the top of the form, before the first field. Users arriving mid-page may not see a legend placed at the bottom.

The **"(optional)" alternative** is better when most fields are required and only a few are not. Marking three optional fields "(optional)" is less visual noise than marking fifteen fields with `*`. Choose one convention per form — never mix both. A form that marks some fields `*` and labels others "(optional)" implies that unlabelled fields are neither required nor optional, which is simply confusing.

Regardless of which visual convention is used, every required field must carry `aria-required="true"` or the native `required` attribute. Screen readers announce the required state from these attributes, not from the visible asterisk.

```html
<!-- Native required attribute (preferred) -->
<input type="email" id="email" name="email" required>

<!-- Or explicit ARIA -->
<input type="text" id="name" name="name" aria-required="true">
```

---

## 5. Multi-Step Forms

Multi-step forms break long processes into manageable stages, but they introduce navigation complexity that must be managed explicitly. A user who does not know how many steps remain cannot calibrate effort and is more likely to abandon.

**Show total step count upfront** and maintain it throughout. "Step 2 of 4" gives the user a completion model. Never add steps mid-flow; if a conditional step becomes necessary, it must have been accounted for in the total from the beginning. Surprise steps feel like bait-and-switch.

**Preserve state between steps** unconditionally. Browser back must restore the previous step with all previously-entered values intact. Losing data on back-navigation is one of the most damaging patterns in multi-step forms — it destroys user trust and forces re-entry of work already done. Use session storage, URL state, or in-memory state managed at the form's root level.

**Allow non-linear completion where the domain permits.** If a user wants to skip to step 3 and complete step 2 later, let them. Stepped progress indicators (like a horizontal stepper component) should be interactive links, not decorative labels, unless there is a hard dependency that makes out-of-order completion genuinely impossible.

**Summary step before final submission.** Any multi-step form that results in a consequential action — purchase, account creation, booking — should include a review step that shows all entered values before the commit action. The CTA on the summary step should name the action ("Place order", "Create account") not just "Submit".

---

## 6. Autofill Hints — `autocomplete` Taxonomy

The `autocomplete` attribute tells the browser — and password managers, autofill services, and mobile OS keyboards — exactly what category of data a field expects. Proper use of `autocomplete` tokens reduces form completion time by 15–30% in controlled studies, primarily because browsers and password managers can populate multiple fields in a single tap. Always pair each token with the correct `input type`.

| Token | Meaning | Recommended `input type` |
|---|---|---|
| `name` | Full name | `text` |
| `email` | Email address | `email` |
| `tel` | Full telephone number | `tel` |
| `username` | Account username | `text` or `email` |
| `current-password` | Existing password (login) | `password` |
| `new-password` | New or changed password | `password` |
| `street-address` | Full street address (multi-line) | `text` or `textarea` |
| `postal-code` | Postal / zip code | `text` |
| `country` | Country code (ISO 3166-1 alpha-2) | `select` |
| `cc-number` | Credit/debit card number | `text` (`inputmode="numeric"`) |
| `cc-exp` | Card expiry (MM/YY) | `text` (`inputmode="numeric"`) |
| `cc-csc` | Card security code | `text` (`inputmode="numeric"`) |
| `bday` | Full date of birth | `date` |
| `sex` | Gender identity | `select` or `text` |
| `language` | Preferred language | `select` |
| `url` | Web address | `url` |

For address fields that are split across multiple inputs, use the sub-tokens (`address-line1`, `address-line2`, `address-level1` for state/province, `address-level2` for city) rather than the generic `street-address` token.

---

## 7. Input Mode and Enter Key Hints

On mobile devices, `inputmode` controls which virtual keyboard the OS presents, independently of the input's semantic type. `enterkeyhint` controls the label shown on the Enter/Go key. Both attributes are pure UX signals — they carry no validation meaning — and they cost nothing to add.

### `inputmode` values

| Value | Keyboard shown | Use for |
|---|---|---|
| `none` | No keyboard | Fields with custom picker UI (date pickers, custom selects) |
| `text` | Standard keyboard | Default; general text |
| `decimal` | Numeric with decimal separator | Prices, measurements, quantities with fractions |
| `numeric` | Numeric only (0–9) | Quantities, PIN codes, verification codes |
| `tel` | Phone dialpad | Phone numbers, even when `type="text"` |
| `email` | Keyboard with @ and . prominent | Email; `type="email"` sets this implicitly |
| `search` | Keyboard with Search action | Search fields |
| `url` | Keyboard with / and . prominent | URLs; `type="url"` sets this implicitly |

### `enterkeyhint` values

| Value | Key label shown | Use for |
|---|---|---|
| `enter` | Return / Enter | Multi-line text areas; default where no hint applies |
| `done` | Done | Last field in a form; closes keyboard |
| `go` | Go | Single-field forms that submit on Enter |
| `next` | Next | Fields where Enter moves to the next input |
| `previous` | Previous | Back-navigation within a multi-step form |
| `search` | Search | Search fields |
| `send` | Send | Message composition fields |

```html
<input
  type="text"
  inputmode="numeric"
  enterkeyhint="next"
  autocomplete="cc-number"
  placeholder="Card number"
>
```

---

## 8. Password UX

Password fields carry more UX debt than almost any other input type, largely due to outdated security theatre that made passwords harder to use without making them more secure.

**Show/hide toggle** is mandatory on any password field. The eye icon is the standard affordance. Both states must have accessible labels: `aria-label="Show password"` and `aria-label="Hide password"`. The toggle should be positioned as a button inside the trailing edge of the input, using `type="button"` to prevent accidental form submission.

**Never block paste** on password fields. The UK National Cyber Security Centre (NCSC) explicitly recommends against paste-blocking. The rationale is simple: blocking paste discourages the use of password managers, which in turn pushes users toward shorter, simpler, more memorable — and therefore weaker — passwords. Paste-blocking does not prevent any known attack vector on the server side. Remove any `onpaste="return false"` or equivalent.

**Password strength meters** belong on new-password creation flows only. Displaying a strength meter on a login form reveals information about the stored password and adds noise to a flow where speed matters. Use `zxcvbn` or an equivalent entropy-based library rather than simple length/character-class rules, which users learn to game (e.g., "Password1!" satisfies most naive rules but is trivially guessable).

**Show requirements before the user types**, not as errors after they fail. If a password must be at least 10 characters and contain a number, display those requirements beneath the field before the field receives focus. The moment requirements appear only as error messages after submission, the form has trained the user to fail before they can succeed.

```html
<div class="field">
  <label for="new-password">Create password</label>
  <div class="input-with-toggle">
    <input type="password" id="new-password" autocomplete="new-password" aria-describedby="pw-requirements">
    <button type="button" aria-label="Show password"><!-- eye icon --></button>
  </div>
  <ul id="pw-requirements" class="requirements">
    <li>At least 10 characters</li>
    <li>At least one number or symbol</li>
  </ul>
</div>
```

---

## 9. Consent, Confirmation, and Destructive-Confirmation

These three patterns all involve the user acknowledging an outcome, but they operate at different risk levels and require different interaction costs to match.

**Consent checkboxes** govern communication preferences and data use. For marketing communications, the checkbox must be unchecked by default — opt-in is required under GDPR and comparable legislation in most jurisdictions. Pre-checked opt-out is only permissible for certain transactional communications or in jurisdictions that explicitly permit it; assume opt-in required unless legal has confirmed otherwise. The checkbox label must be specific about what the user is consenting to — "I agree to receive marketing emails from Acme Ltd." rather than "I accept the terms."

**Confirmation dialogs** are appropriate for irreversible actions that affect data the user owns — deleting a file, cancelling a subscription, archiving a project. The confirmation dialog must state exactly what will happen. "Are you sure?" is not a confirmation. "Delete the project 'Website Redesign'? This cannot be undone." is a confirmation. The destructive action button should be visually distinct (typically red or a warning tone) and should not be the default focused element.

**Destructive-confirmation with typed phrase** applies to catastrophic, irreversible operations: deleting an account, purging all data, permanently revoking access. Require the user to type a specific phrase — the account name, the word "DELETE", the number of items being erased — before the action becomes available. This pattern exists not to prevent accidents but to ensure the user is making a conscious, deliberate decision. GitHub, Heroku, and most infrastructure tools use this pattern for account deletion. The required phrase should be shown plainly; do not require the user to guess it.

| Risk level | Pattern | Example |
|---|---|---|
| Low — reversible | None needed | Moving a file to trash |
| Medium — data loss possible | Confirmation dialog with specific text | Deleting a saved draft |
| High — irreversible | Dialog + destructive button style | Cancelling a paid subscription |
| Critical — catastrophic | Dialog + type-to-confirm phrase | Deleting an account and all its data |

---

## 10. CAPTCHA Ethics and Fallbacks

CAPTCHA presents a genuine tension: friction added to stop bots is friction experienced by every human user, disproportionately by users with cognitive and motor disabilities.

**Invisible CAPTCHA v3** (Google reCAPTCHA v3, Cloudflare Turnstile, hCaptcha Invisible) is the preferred approach. These services score user behaviour in the background and surface a challenge only when the risk score exceeds a threshold. Typical deployments have challenge rates under 1% for real users. There is no visible puzzle, no audio fallback needed for the happy path.

**When a visible challenge is unavoidable**, WCAG 1.1.1 requires a non-visual alternative. Every visual CAPTCHA must have an audio alternative that is solvable with a screen reader and no visual ability. Text-based CAPTCHAs distorted beyond normal variance effectively exclude users with dyslexia and cognitive disabilities — treat this as a legal and ethical risk, not just a UX inconvenience.

**Time-limited CAPTCHAs** — those that expire while a slow or motor-impaired user is completing them — are inaccessible by design and should never be used. If a CAPTCHA session can time out, the user must be able to request a refresh without losing their form data.

**Progressive trust** is the most human approach for authenticated flows. A logged-in user with a verified email and account history presents a negligible bot risk. Do not require CAPTCHA from authenticated users unless there is a specific elevated-risk action (e.g., a bulk API call or mass send). Reserve CAPTCHA friction for unauthenticated, rate-limited, or anomalous-behaviour scenarios.

| Approach | User friction | Accessibility | When to use |
|---|---|---|---|
| Invisible CAPTCHA v3 (Turnstile, reCAPTCHA v3) | None | Full | Default for public forms |
| Visible challenge with audio fallback | Medium | Conditional (audio required) | High-risk unauthenticated flows |
| Progressive trust (authenticated) | None | Full | Logged-in users with account history |
| Time-limited CAPTCHA | High | Inaccessible | **Never** |
| Inaccessible visual-only CAPTCHA | High | None | **Never** |
