# Brief Quality Rubric

The five anti-patterns `agents/brief-auditor.md` grades `.design/BRIEF.md` against. Each entry pairs a
definition with a good and bad example, the detection signal the auditor greps for, and a severity note.
This rubric is advisory: a flagged brief still proceeds to explore. The point is to surface vagueness
while the cost of fixing it is one sentence, not a redesign.

A brief is the contract every later stage checks against. A vague brief produces an unverifiable cycle,
because verify has nothing concrete to test. The auditor reads the brief once and writes findings to
`.design/BRIEF-AUDIT.md`; the brief skill then offers `/gdd:discuss brief` when any anti-pattern fires.

---

## AP-1: Vague verbs without a metric

**Definition:** The problem or goal uses a soft verb (improve, optimize, streamline, enhance, modernize,
refresh) with no number, threshold, or observable change attached. The verb hides the actual target.

- **Bad:** "Improve the checkout flow."
- **Good:** "Cut checkout abandonment from 38 percent to under 25 percent on mobile."

**Detection signal:** Match soft verbs (`improve`, `optimize`, `streamline`, `enhance`, `modernize`,
`refresh`) in the Problem or Success Metrics sections, then check the same sentence for a digit, a
percent sign, or a unit. A soft verb with no adjacent quantity is a hit.

**Severity:** Major. A goal with no metric cannot be verified, so the whole cycle inherits the ambiguity.

---

## AP-2: Missing audience

**Definition:** The brief never names who the design is for. No role, device, context, or skill level is
stated, so every later trade-off (density, reading level, input model) is a guess.

- **Bad:** "Build a dashboard for tracking orders."
- **Good:** "Build an order dashboard for warehouse leads on a shared floor tablet, glanceable at arm's length."

**Detection signal:** Read the Audience section. Flag when it is empty, a placeholder (`TBD`, `users`,
`everyone`, `all users`), or names no role plus context. A single generic noun with no qualifier is a hit.

**Severity:** Major. Audience drives density, tone, and accessibility floor; without it the design optimizes
for no one.

---

## AP-3: Immeasurable success criteria

**Definition:** Success is described in feelings rather than observables (looks modern, feels clean, is
intuitive, delights users). There is no event, count, or threshold a verifier could check.

- **Bad:** "Users should feel the app is fast and modern."
- **Good:** "First contentful paint under 1.5 seconds; task completion rate above 90 percent in five tests."

**Detection signal:** Scan Success Metrics for subjective adjectives (`modern`, `clean`, `intuitive`,
`delightful`, `nice`, `beautiful`) with no paired number or pass/fail condition. Subjective-only criteria
are a hit.

**Severity:** Major. Verify cannot grade a feeling; immeasurable criteria collapse the verify gate.

---

## AP-4: Scope creep

**Definition:** The Scope section lists more than the cycle can deliver, or mixes unrelated surfaces into
one brief, so the in-scope line stops constraining anything.

- **Bad:** "Redesign onboarding, billing, settings, the marketing site, and add dark mode."
- **Good:** "In scope: the three-step onboarding flow. Out of scope: billing, settings, marketing site."

**Detection signal:** Count distinct surfaces or top-level features named as in-scope. More than three
unrelated surfaces in one brief, or an in-scope list with no matching out-of-scope line, is a hit.

**Severity:** Minor. Wide scope is recoverable by splitting, but unsplit it inflates every later estimate.

---

## AP-5: Missing anti-goals

**Definition:** The brief states what to build but never what to avoid. With no anti-goals, explore widens
to fill the vacuum and the design picks up patterns the team never wanted.

- **Bad:** (Scope lists features only; no "we are deliberately not doing X" line anywhere.)
- **Good:** "Anti-goals: no new navigation paradigm, no carousel, do not touch the existing auth screens."

**Detection signal:** Look for an explicit non-goal, anti-goal, or out-of-scope statement framed as a
prohibition (`do not`, `avoid`, `no new`, `out of scope`). A brief with zero prohibition statements is a hit.

**Severity:** Minor. Anti-goals prevent drift; their absence is a warning, not a blocker.

---

## How findings are scored

The auditor reports a count of fired anti-patterns and lists each with its section and the matched text.
It does not compute a pass/fail gate and it does not block the brief to explore transition. Major findings
(AP-1, AP-2, AP-3) carry more weight in the summary line than Minor findings (AP-4, AP-5), so the user
knows which gaps most threaten a verifiable cycle. When any anti-pattern fires, the brief skill surfaces a
one-line pointer offering `/gdd:discuss brief` to refine before moving on.
