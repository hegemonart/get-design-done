# Onboarding & Progressive Disclosure

New-user experience is the highest-impact surface in any product. A user who does not reach the aha moment in the first session almost never returns. These guidelines encode the research and failure patterns accumulated across thousands of product launches into concrete, actionable rules.

---

## 1. First-Run Pattern Matrix

Four dominant patterns exist for first-run experiences. Choosing the wrong one for your product type is one of the most common causes of early churn.

| Pattern | When to use | Cognitive load | Completion rate signal | Best for product type |
|---|---|---|---|---|
| **Empty-state onboarding** | Product value is only visible once data exists; blank canvas is the default state | Low - user acts on their own terms | First meaningful action taken (e.g. first item created) | Creation tools, CRMs, project trackers |
| **Product tour** | Interface is dense or non-obvious; terminology requires context | Medium - user is passive during tour | Tour completion rate (misleading - see note) | Feature-rich SaaS dashboards, admin tools |
| **Checklist-style** | Value comes from setup completion; multiple required steps exist | Medium-high - visible task debt | Checklist completion %, items checked per session | Configuration-heavy tools, integrations |
| **Progressive disclosure** | Product has many features but a clear primary use case; depth should follow intent | Low at entry, scales with engagement | Feature adoption breadth over time | Consumer apps, platforms with power users |

**Empty-state onboarding** works because the blank state communicates what belongs there. A well-designed empty state - with a clear headline, one CTA, and an illustrative hint - removes the need for any separate tutorial. The first action the user takes is the onboarding. The empty state must not look like an error; it should look like an invitation. Use an illustration or icon that visually previews the populated state, so users understand what they are working toward.

**Product tours** have notoriously misleading completion metrics. A user who clicks through all seven steps of a tour has not learned the product; they have dismissed it. Tours are most defensible when they label unfamiliar terminology (e.g. "This is your Workspace - all your projects live here") rather than demonstrating features the user should simply use. If you do run a tour, keep it to five steps maximum, make every step skippable, and allow re-entry from a persistent help menu.

**Checklist-style onboarding** creates explicit visible progress. The risk is that users who skip to step 4 feel the overhead of incomplete items above them. Keep checklists short (five items maximum) and mark steps as skippable where appropriate. Celebrate completion with a visual reward. Progress bars within checklists should start at roughly 20% complete before the user takes any action - starting at zero signals a daunting amount of work ahead.

**Progressive disclosure** is the correct default for most modern products. Surface only what is needed at each stage of the user's journey and reveal depth as intent emerges. The cost of this approach is instrumentation: you must know what your users are actually doing in order to know what to surface next. Without event tracking and funnel analysis, progressive disclosure devolves into guesswork about which features to promote and when.

---

## 2. Feature Discovery Patterns

### Tooltip Hints

Tooltips surface contextual information at the moment of relevance without blocking interaction. Follow these placement rules strictly:

- Position tooltips above the target element by default; fall back to right, left, then below only when viewport space requires it.
- Never place a tooltip over the element it describes - it should annotate without obscuring.
- A dismiss button (×) is required on any tooltip that is not triggered by hover alone. Users must always have a clear, explicit path to close.
- Cap tooltip hints at **three per session**. A fourth tooltip in the same session means the user has seen enough hints that the interface should simply be better, not that more hints are needed.
- Do not re-show a dismissed tooltip within the same session. Respecting the dismissal is the contract.

### Spotlight / Coach Marks

Spotlight overlays draw attention to a specific UI element by dimming the surrounding interface. Use them only for genuinely non-obvious interaction points - elements whose purpose or location a reasonable user would not discover through normal exploration.

Never use coach marks for:

- Buttons with clear labels and standard placements (Save, Submit, Add)
- Navigation items that follow a platform convention (hamburger menu, tab bar, breadcrumb)
- Anything that should be self-evident from the design itself

If a feature requires a spotlight to be understood, the spotlight is a symptom. The root cause is an affordance problem in the design that should be fixed first.

### Pulsing Nudges

Animation draws the eye. That is precisely why animation budgets must be strictly managed:

- **Only one pulsing element may be active on screen at any time.** Two simultaneous pulses cancel each other's signal and create anxiety rather than direction.
- Stop showing the pulse after the user has seen it across **three separate sessions** without interacting. After three exposures without action, the user has seen the nudge and chosen not to act. Continuing to pulse is nagging, not guidance.
- Use a subtle scale pulse (1.0 → 1.08 → 1.0, ease-in-out, 1.2s, 2-second delay between cycles) rather than color flashing, which creates accessibility issues for users with photosensitive conditions.
- Store the "seen count" in persistent state (user record or localStorage as a fallback) so the counter survives page reloads.

### Contextual Help

Help icons, drawers, and inline `?` affordances provide depth on demand without occupying primary UI real estate:

- Place `?` icons immediately to the right of the label they annotate, at the same vertical center.
- Use a help drawer (slide-in panel) when the content exceeds three sentences. Modals are inappropriate for help content because they block the interface the user is trying to understand.
- Distinguish between hover-triggered tooltips (quick factual answers, ≤ 20 words) and click-triggered drawers (procedural explanations, examples, links to documentation).
- Help icons should use a consistent icon throughout the product - do not mix `?`, `ℹ`, and `…` as help affordances in the same interface.

---

## 3. Tutorial Sequencing

### Before Value, Not Before Use

The most common tutorial design mistake is gating access to the product behind tutorial completion. This inverts the relationship between value and instruction. The correct principle is: **teach before the moment of value, not before the moment of entry.**

A user who has already experienced value will sit through a brief explanation of how to get more value. A user who has not yet experienced anything will resent being forced through a walkthrough of a product they are not yet convinced is worth their time.

Concretely: let the user reach their first meaningful outcome, then surface the "here's how to go further" guidance immediately after.

### Activation Metric vs. Habituation Metric

These two metrics measure different things and should never be conflated:

**Activation metric** - the event that indicates a user has experienced the product's core value for the first time. It is a binary event measured once. Examples: first project created, first file synced, first message sent.

**Habituation metric** - the behavioral pattern that indicates a user has formed a habit around the product. It is a frequency measure over a time window. Examples: 3 sessions per week for 4 consecutive weeks, 5 actions per session on 7 of the last 10 days.

Activation predicts retention at day 7. Habituation predicts retention at day 30 and beyond. Optimizing only for activation produces users who try the product once and never return. Optimizing for habituation without a clear activation path means most users never get far enough to form the habit.

### Tutorial Abandonment and Step Budget

Research across SaaS products consistently shows that **mean drop-off occurs at step 3** in multi-step onboarding flows. Users who reach step 4 are disproportionately engaged; steps beyond 4 reach a small fraction of users.

The implication is direct: **keep required onboarding to three steps or fewer.** Optional depth can exist beyond step 3, but nothing essential to basic product use should require more than three steps to reach.

If your product genuinely requires more than three setup steps before value is deliverable, that is a product architecture problem, not an onboarding problem.

### Deferred Tutorial

Users who land in a product for the first time are in a state of orienting, not learning. They are trying to understand whether the product is relevant to them, not how to become experts.

Surface a "Start guided tour" CTA on the **second session**, not the first. By the second session, the user has self-selected - they came back, which means something in the first session was interesting enough to return to. They are now in a learning state, not an evaluation state, and will benefit from structured guidance.

First-session tutorials should be limited to a single contextual hint or a dismissible welcome banner - not a step-by-step walkthrough.

---

## 4. The 5-Second Rule

Within five seconds of landing on a product for the first time, users form judgments on three dimensions that are extremely difficult to revise:

1. **Value proposition clarity** - Do I understand what this product does and who it is for?
2. **Trust signals** - Does this look credible, maintained, and professional?
3. **Visual confidence** - Does the design itself inspire confidence in the product's quality?

These are not conscious evaluations. They are fast, affective responses to visual and linguistic signals. A product that fails the 5-second test loses users before any feature or flow is ever reached.

**How to test:** Show the homepage or first screen to a user for exactly five seconds (a timer-based first-click test works well). Then hide the screen and ask: "What does this product do? Who is it for? Would you trust it with your data?" Correct answers on all three indicate the screen passes.

**What passing looks like:**
- The headline names the outcome, not the mechanism ("Ship faster without context switching" rather than "A collaborative project management platform")
- At least one social proof or trust signal is visible above the fold (customer count, recognizable logo, security badge)
- The visual design is internally consistent - font pairing, spacing, and color are coherent enough that the product feels intentional

A screen that takes longer than five seconds to parse is not being evaluated - it is being abandoned.

**Common failures:**

| Signal | Why it fails the test |
|---|---|
| Headline is the product's name only | Communicates nothing about value or audience |
| Hero image is abstract or decorative | Wastes the most valuable visual real estate |
| No price or pricing signal | Triggers "is this for me?" uncertainty |
| Social proof is below the fold | Trust is not established before the judgment is made |
| CTA is "Learn more" | Does not indicate what action the user should take |

Run the 5-second test on every major entry point: homepage, onboarding email landing, in-app feature announcements, and pricing page. Each is a first impression for a different user segment.

---

## 5. Aha-Moment Mapping

### Defining the Aha Moment

The aha moment is the first time a user experiences the core value the product was built to deliver. It is not a feature adoption event and not an engagement metric - it is the specific moment when the product's promise becomes real and personal to the user.

Without a defined aha moment, onboarding cannot be optimized because there is no agreed destination to optimize toward.

### Reference Examples

The most cited aha moments in product history illustrate what the concept means in practice:

- **Twitter**: Users who followed at least 10 accounts within their first 48 hours retained at a dramatically higher rate than those who did not. The aha moment was not "post a tweet" - it was "see a feed of people you actually care about."
- **Slack**: Teams that exchanged at least 2,000 messages retained at over 90%. The aha moment emerged from the accumulated experience of communication flow, not from any single interaction.
- **Dropbox**: Users who synced at least one file experienced the aha moment. The product's promise - "your files everywhere" - only became real once the first file was genuinely accessible on a second device.

In all three cases, the aha moment is an outcome state, not a feature interaction. This distinction matters for instrumentation.

### Instrumentation and Cohort Analysis

To find your product's aha moment, run the following analysis:

1. **Define candidate activation events** - identify 5–10 behavioral events that plausibly represent first value (first export, first share, first search with results, first item added, etc.).
2. **Build retention cohorts by activation event** - for each candidate event, create two cohorts: users who performed the event in their first session vs. users who did not. Measure day-7 and day-30 retention for each cohort.
3. **Identify the event with the largest retention delta** - the event whose presence most strongly predicts that users will still be active 30 days later is your aha moment proxy.
4. **Validate with qualitative research** - confirm with user interviews that users who performed the event actually experienced a moment of genuine value, not just navigated through a flow.
5. **Reduce the time-to-aha** - once the event is identified, redesign onboarding to move the user toward that event as quickly as possible, removing every unnecessary step in between.

The aha moment is a hypothesis that must be re-evaluated as the product evolves. A feature change or new user segment can shift the activation event.

---

## 6. Anti-Patterns

### Forced Tours

A forced tour blocks access to the product until the user completes a tutorial sequence. This pattern consistently destroys retention because it starts the relationship with a power imbalance: the product demands the user's time before delivering any value in return.

Users who complete forced tours do so under duress, not interest. Their completion rate looks healthy in analytics, but their recall of tour content is near zero. More critically, the forced-tour experience establishes a negative first emotional association with the product that carries forward into subsequent sessions.

**Never gate the product behind tutorial completion.** The skip button is not a concession - it is a requirement.

### Blocking Modal Overlays

Modal overlays that cover the interface to display instructional content are problematic on two grounds. First, they prevent the user from interacting with the very interface they are being instructed about - learning by doing is impossible when the interface is obscured. Second, full-screen modal overlays frequently fail WCAG 2.1 Success Criterion 1.3.4 (Orientation) and 2.1.2 (No Keyboard Trap) when implemented without proper focus management, making them inaccessible to keyboard and screen reader users.

Use inline empty states, contextual tooltips, or side drawers for instructional content. Reserve modals for actions that require a decision before proceeding, not for passive information delivery.

### Tooltip Spam

Displaying more than three tooltips simultaneously creates cognitive overload. The user cannot process multiple concurrent annotations - they will either dismiss all of them without reading or abandon the session. Three concurrent tooltips is already at the upper threshold of what users will tolerate; two is better; one is the correct default.

If your interface requires more than three tooltips to be usable, the interface needs redesign, not more tooltips.

### Feature Announcements on Every Login

Surfaces that display feature announcement banners, modals, or toasts on every login train users to dismiss without reading. After two or three sessions of seeing a banner, dismissal becomes an automatic motor behavior, not a reading behavior. This renders the announcement channel useless for future communications that actually matter.

Feature announcements should be shown once per feature, in context (near the new feature), and only to users for whom the feature is relevant. A user who has never used the reporting module should not see an announcement about reporting improvements.

### Onboarding for Features They Did Not Request

Proactively onboarding users to features they have not expressed interest in violates their intent. A user who opened the product to complete a specific task and is instead walked through an unrelated feature experiences the tutorial as an interruption, not a benefit.

Progressive disclosure exists precisely to prevent this: surface depth in response to observed intent, not on a broadcast schedule. If a user navigates to a feature for the first time, that is the correct moment to offer brief guidance. If they have never navigated to it, it is not the correct moment to introduce it.

---

## 7. Measuring Onboarding Health

Onboarding is only improvable if it is measured. The following metrics form the minimum instrumentation layer for any product with an intentional onboarding strategy.

**Time-to-activation** measures how long it takes a new user to reach the defined activation event from their first login. Expressed as a median and p75 (the slowest 25% of activating users). A rising time-to-activation without a corresponding increase in activation rate indicates that the activation path has grown longer or more confusing.

**Activation rate** is the percentage of new users who reach the activation event within a defined window (typically 7 days). Baseline activation rates vary widely by product category, but any activation rate below 40% warrants investigation. An activation rate above 70% is a strong signal.

**Onboarding funnel drop-off** tracks step-by-step completion rates through any sequential onboarding flow. Every step should be instrumented individually. Drop-off above 30% at any single step is a red flag requiring immediate qualitative investigation - user interviews, session recordings, or both.

**Feature discovery breadth** measures how many distinct features or feature areas a user touches in their first 14 days. Low breadth in early sessions is not necessarily a problem - focused users often have the highest retention - but anomalously low breadth combined with low retention indicates that users are not finding the product's range of value.

| Metric | Healthy range | Warning threshold |
|---|---|---|
| Time-to-activation (median) | < 5 minutes | > 20 minutes |
| Activation rate (7-day) | > 50% | < 30% |
| Step drop-off (any single step) | < 20% | > 35% |
| Day-7 retention | > 40% | < 20% |
| Day-30 retention | > 20% | < 10% |

These thresholds are reference points drawn from cross-industry SaaS benchmarks. They will vary by product category, pricing model, and acquisition channel. Calibrate against your own historical baseline before treating any single number as universal.

---

## Quick-Reference Decision Rules

The rules below consolidate the most common judgment calls into explicit thresholds. Apply them as defaults; deviate only with data.

| Question | Rule |
|---|---|
| How many tooltip hints per session? | Maximum 3 |
| How many pulsing elements on screen? | Maximum 1 |
| How many steps in required onboarding? | Maximum 3 |
| When to surface guided tour CTA? | Second session, not first |
| When to stop showing a pulsing nudge? | After 3 sessions seen without interaction |
| Can a tutorial block product access? | Never |
| How many concurrent tooltips? | Maximum 1 (hard ceiling 3) |
| How often to repeat a feature announcement? | Once per feature, in context |
| What determines the aha moment? | Largest day-30 retention delta across cohorts |
| What does passing the 5-second test require? | Correct answers on value, audience, and trust |
