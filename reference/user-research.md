# User Research Methods & Practices

Use this during Discover (choosing the right method), Plan (sizing samples correctly), and Verify (interpreting results without over-claiming).

---

## Research Method Matrix

Every method sits in one of four quadrants defined by two axes: whether the goal is to **generate** new understanding or **evaluate** an existing solution, and whether the data is **qualitative** (words, observations, themes) or **quantitative** (numbers, rates, statistical comparisons).

| | **Qualitative** | **Quantitative** |
|---|---|---|
| **Generative** | Contextual interviews, diary studies, field shadowing, card sorting (open), JTBD discovery | Surveys with open-ended analysis, usage log mining, keyword frequency |
| **Evaluative** | Moderated usability testing, cognitive walkthrough, expert heuristic review | Tree testing, A/B testing, first-click test, 5-second test, unmoderated task completion rates |

**Generative research** answers "What problems exist and why?" It is appropriate early in a project cycle before solutions are defined. Outputs are themes, job stories, opportunity areas, and mental models.

**Evaluative research** answers "Does this solution work, and how well?" It is appropriate once a concept, prototype, or live product exists. Outputs are pass/fail rates, benchmarks, and ranked preference scores.

Mixing quadrants in the same study is usually a mistake - participants primed by evaluation tasks answer generative questions defensively. Plan separate sessions or separate phases.

---

## Method Catalog

### Contextual Interviews / User Interviews

A contextual interview is a structured or semi-structured conversation conducted in the environment where the work actually happens - at a desk, in a kitchen, on a shop floor. A plain user interview happens in a neutral setting (a conference room, a video call) and relies on self-report rather than observation. Contextual interviews surface discrepancies between what people say they do and what they actually do; plain interviews are faster to schedule and sufficient when behavior is verbal or cognitive.

**When to use:** Early discovery, when you need to understand goals, mental models, workarounds, and emotional context before any design artifact exists.

**Sample size:** 5–8 participants per distinct user segment for qualitative saturation. Add a segment (new 5–8) when the population differs meaningfully in goals, context, or technical ability.

**Key pitfalls:**
- Asking leading questions ("Do you find the checkout confusing?") primes the answer
- Asking hypothetical questions ("Would you use a feature that…?") produces aspirational fiction, not real behavior
- Failing to probe the last three minutes of a story - "tell me more about that" almost always yields the real insight
- Recording without consent, or failing to inform participants how data will be used

---

### Field Observation (Diary Studies, Shadowing)

Field observation captures behavior as it naturally unfolds, without a researcher present (diary study) or with a researcher silently present (shadowing). In a **diary study**, participants self-report via a structured log - a form, a voice note, or a photo - triggered by an event or a fixed schedule over days to weeks. In **shadowing**, the researcher follows a participant through a real work session and takes notes or records video.

**When to use:** When the behavior of interest is distributed across time (diary) or deeply embedded in a physical environment (shadowing); when recall in an interview would be too compressed or distorted.

**Sample size:** 8–15 participants for diary studies (attrition is high; plan for 30–40% dropout). Shadowing rarely exceeds 5–8 sessions before themes repeat.

**Key pitfalls:**
- Diary prompts that are too long or too frequent cause abandonment
- Shadowing creates an observer effect - participants perform "correct" behavior rather than habitual behavior; use this method alongside analytics to cross-check
- Diary data requires significant cleaning before synthesis; budget time accordingly

---

### Surveys

A survey collects self-reported data at scale through a fixed set of questions delivered asynchronously. Surveys are the only method that can reach hundreds or thousands of respondents simultaneously, making them suited for measuring prevalence ("What percentage of users have encountered this problem?") and tracking attitudes over time.

**When to use:** When you need to generalize a finding across a population, measure satisfaction (NPS, CSAT, CES), or validate that a qualitative theme observed in interviews appears at meaningful frequency.

**Sample size:** For a ±5% margin of error at 95% confidence in a large population, n = 385. For ±3%, n = 1067. Smaller populations require proportionally larger samples relative to population size.

**Key pitfalls:**
- Question order effects - put sensitive or demographic questions last
- Acquiescence bias - respondents agree with statements regardless of content; use balanced scales (Likert with both positive and negative anchors)
- Survivorship bias - survey respondents are not the same as non-respondents; a 10% response rate produces a self-selected sample
- Treating ordinal Likert data as interval data for arithmetic mean comparisons

---

### Card Sorting

Card sorting asks participants to organize a set of labeled cards (representing content, features, or navigation items) into groups that make sense to them. **Open card sorting** lets participants create their own group names - this reveals the mental model. **Closed card sorting** provides predefined categories - this tests whether an existing structure matches expectations. **Hybrid card sorting** asks participants to sort into predefined categories but allows them to create new ones when nothing fits.

**Output:** Group labels (open) surface vocabulary and categories that match user language. A **dendrogram** - a tree diagram produced by cluster analysis - shows which cards are grouped together most consistently across participants, revealing the underlying mental model numerically.

**When to use:** Before designing information architecture; after tree testing reveals a structure that is failing.

**Sample size:** 15–20 participants for open sorting; 30+ for closed sorting where you want statistical confidence in the clusters.

**Key pitfalls:**
- Cards that are ambiguous produce noise, not insight - pilot test card labels first
- Too many cards (>60) causes fatigue; split into focused subsets
- Dendrograms look authoritative but are sensitive to the distance algorithm chosen; report the algorithm and test alternative cuts

---

### Tree Testing

Tree testing evaluates an information architecture by asking participants to find content using only the text labels of a navigation tree - no visual design, no search, no breadcrumbs. Participants are given a task ("Find the return policy for a purchased item") and navigate the tree until they select a destination. The test isolates whether the structure and labeling work, independent of visual presentation.

**Output:**
- **Success rate** - percentage of participants who reached the correct destination. >75% = good; >60% = acceptable; below 60% = the path needs redesign.
- **Directness** - percentage of successful participants who reached the answer without backtracking. High directness means the path is intuitive; high success with low directness means participants found it eventually but the labels are misleading.
- **Time on task** - useful for comparing two versions of a tree; not meaningful in isolation.

**When to use:** Before building navigation; after card sorting to validate that an IA derived from participant groups actually works for task completion.

**Sample size:** 50 participants per tree variant for reliable rates; 30 is the practical minimum.

**Key pitfalls:**
- Tasks that hint at the answer ("Find the Privacy section in Settings") teach rather than test
- A tree that passes at 76% success for one task may still fail for a different task - test all high-traffic paths
- Do not test more than 10 tasks per session without randomization to prevent fatigue effects

---

### Preference Testing

Preference testing presents two or more design options and asks participants to choose the one they prefer, often with a follow-up asking why. It is a fast, low-cost way to break internal disagreements and gather directional signal, but it measures stated preference, not performance or usability.

**When to use:** When stakeholders are deadlocked between two visual directions; when you need to validate that a redesign is at least as well-received as the current design.

**Sample size:** 50–100 participants for a binary preference test to achieve statistically meaningful proportions.

**Key pitfalls:**
- Preference does not equal usability - participants consistently prefer interfaces they can use, but can prefer a beautiful interface they cannot use over an ugly one they can
- Options must be shown in randomized order to control for primacy and recency bias
- "Why did you choose this?" follow-ups suffer from post-hoc rationalization; treat qualitative reasons as directional, not causal

---

### First-Click Test

A first-click test measures where participants click first when presented with a task on a static image or live prototype. Research shows that users who make a correct first click complete tasks successfully about 87% of the time; users who make an incorrect first click complete tasks successfully only 46% of the time. The first click is therefore a strong predictor of task success.

**When to use:** To validate that call-to-action placement, labeling, and visual hierarchy direct users to the correct starting point before investing in a fully functional prototype.

**Sample size:** 20–40 participants provides sufficient data for heatmap patterns and task success rates.

**Key pitfalls:**
- A click in the right location for the wrong reason (the participant was guessing) is not a pass - follow up with "why did you click there?"
- First-click tests do not account for context built up from prior pages; test each page in context when the flow matters
- Heatmaps with small n look authoritative but individual outlier clicks distort the visualization

---

### 5-Second Test

A 5-second test exposes participants to a design for exactly five seconds, then hides it and asks what they remember, what the purpose of the page is, or what stood out. It measures first impressions and whether the primary message is communicated before any deliberate reading begins.

**When to use:** To test whether a landing page, hero section, or dashboard communicates its core value immediately; useful in early evaluation of competing concepts.

**Sample size:** 20–50 participants; the test is fast enough that larger samples are easy to recruit.

**Key pitfalls:**
- Questions asked immediately after exposure must be closed or very specific - open-ended questions produce memory artifacts, not design feedback
- The 5-second window captures attention and memory, not comprehension or usability; do not use this to predict task performance
- Results are highly sensitive to the specific question asked - "What is this page for?" and "What do you remember?" produce different data from the same exposure

---

## Sample-Size Heuristics

Getting sample size wrong is one of the most common research errors. Under-powering a quantitative study produces unreliable results; over-sizing a qualitative study wastes time without yielding more themes.

### Nielsen's "5 Users" Rule

Jakob Nielsen's finding that five users uncover approximately 85% of usability problems applies specifically to **moderated qualitative usability testing** with a homogeneous user population. It describes the point of diminishing returns for finding new themes, not for measuring rates or reaching statistical confidence.

The rule does **not** apply to:
- Quantitative usability studies where you need accurate task-completion rates (requires 20+ per condition)
- Surveys where you need generalizable proportions (requires hundreds)
- A/B tests where you need to detect a treatment effect (requires thousands)
- Tree tests where success-rate benchmarks must be reliable (requires 50+)
- Studies with heterogeneous populations - run 5 users per distinct segment

Misapplying the "5 users" rule to quantitative contexts is a common and costly error. A sample of five will tell you which problems exist, not how often they occur.

### A/B Testing Sample Size

The minimum sample size per variant is determined by three inputs: the **baseline conversion rate**, the **minimum detectable effect (MDE)** expressed as a relative lift, and the desired **statistical power**.

```
n ≈ (16 × σ²) / δ²
```

Where σ² is the variance of the metric and δ is the absolute MDE. For a binary conversion metric:

- Baseline = 10%, MDE = 5% relative lift (0.5pp absolute), 80% power → n ≈ 31,000 per variant
- Baseline = 10%, MDE = 20% relative lift (2pp absolute), 80% power → n ≈ 2,000 per variant

As a practical floor: **n ≥ 1,000 per variant** is required to reliably detect a ≥5% relative MDE at 80% power for typical conversion metrics. Below 1,000, the confidence interval is wide enough that most real effects will be declared non-significant.

### Survey Margin of Error

For a proportion in a large population (>10,000), the margin of error at 95% confidence is:

- ±5%: n = 385
- ±3%: n = 1,067
- ±1%: n = 9,604

For smaller populations, apply the finite population correction. These figures assume simple random sampling; convenience samples (self-selected respondents) do not produce these margins regardless of n.

---

## Synthesis Techniques

Raw research data - interview transcripts, survey responses, diary entries - does not become insight until it is actively interpreted and structured. Three frameworks cover most synthesis needs.

### Affinity Diagrams (KJ Method)

An affinity diagram (developed by Jiro Kawakita, hence KJ method) organizes qualitative observations into emergent themes through a bottom-up clustering process.

**Process:**
1. Write each distinct observation, quote, or behavior on a separate note (physical or digital)
2. Silently sort notes into groups based on natural similarity - team members work in parallel, moving notes without discussion
3. Once sorting slows, name each cluster with a header that captures the insight, not just the topic ("Users abandon checkout when shipping cost appears late" rather than "Shipping")
4. Merge or split clusters until the structure is stable

**When done:** Clustering is complete when new data no longer creates new groups - typically after three to four passes with a complete data set. If a new interview consistently produces notes that fit existing clusters without creating new ones, theoretical saturation has been reached.

### Jobs-to-be-Done

Jobs-to-be-Done (JTBD) frames user behavior around the progress a person is trying to make, not the product they are using. The canonical job story format is:

> **"When I [situation], I want to [motivation/goal], so I can [expected outcome]."**

JTBD distinguishes three job layers:
- **Functional job** - the practical task being accomplished ("When I'm running low on groceries, I want to reorder my usual items quickly, so I can avoid running out")
- **Social job** - how the person wants to be perceived while doing it ("so my family sees me as organized and dependable")
- **Emotional job** - how the person wants to feel ("so I don't feel the anxiety of an empty fridge")

Designs that serve only the functional job often feel transactional. Designs that also address emotional and social jobs create habitual use and preference. Surface all three layers during synthesis by asking "and why does that matter to you?" until the answer is about identity or feeling, not functionality.

### User Journey Mapping

A user journey map visualizes the sequence of steps a user takes to accomplish a goal, annotated with emotional valence, touchpoints, and observations at each step.

**Key components:**
- **Stages** - the high-level phases of the experience (Awareness, Onboarding, First Use, Routine Use, Problem Recovery)
- **Touchpoints** - every channel or interface the user contacts (email, app, support chat, physical receipt)
- **Emotional valence** - a curve showing frustration, confusion, delight, or confidence at each step, derived from research data, not assumed
- **Moments of truth** - the two or three steps where user trust is won or lost; these are the highest-impact design targets
- **Pain points and gains** - specific friction (long wait, confusing label, missing feedback) and specific delights (unexpected shortcut, empathetic error message)

A journey map built from assumed experience is a risk document, not a research artifact. Only map journeys from observed or reported user behavior; mark any step built on assumption explicitly so it can be validated.

---

## A/B Testing

A/B testing (controlled experiment) measures the causal effect of a design change by randomly assigning users to a control variant (A) and a treatment variant (B) and comparing a primary metric after sufficient observations have accumulated.

### Sample Size and Power

Pre-register the following before running any experiment:
- **Primary metric** - the single metric the test is designed to move (conversion rate, session length, activation)
- **MDE** - the smallest relative improvement worth shipping; smaller MDEs require larger samples
- **Baseline rate** - the current value of the primary metric, measured over a representative period
- **Power** - 80% (β = 0.20) is the standard minimum; 90% is appropriate when the cost of a missed effect is high
- **Significance threshold** - α = 0.05 (5% Type I error rate) is standard; use α = 0.01 for high-stakes decisions or multiple simultaneous tests

### Sequential vs Fixed-Horizon Testing

**Fixed-horizon testing** requires committing to a sample size before the experiment begins and not checking results until that sample is collected. Peeking at results and stopping early when significance is reached inflates the Type I error rate dramatically - running 20 checks at α = 0.05 raises the effective false-positive rate to ~64%.

**Sequential testing** (e.g., using always-valid confidence sequences or mSPRT methods) allows early stopping while controlling error rates. It is safer when experiments run on volatile traffic or when shipping quickly matters. Sequential tests typically require 20–30% more total sample on average but eliminate the false-positive inflation from peeking. Use sequential testing as the default when your tooling supports it.

### Primary Metric vs Guardrail Metrics

Before launching any test, define the **guardrail metrics** - the metrics that must not decline as a condition of shipping, regardless of the primary metric result.

- **Primary metric:** checkout completion rate
- **Guardrail metrics:** page load time (must not increase >50ms), return rate (must not increase >1pp), customer support contact rate (must not increase)

A treatment that improves checkout completion by 8% while increasing support contacts by 30% is not a win. Define guardrails before running; changing them after results are known is p-hacking by another name.

### Novelty Effect

New UI patterns, colors, or flows often see inflated positive effects in the first week because users engage with anything that is different. To avoid shipping a change that performs well only because it is new, run experiments for **at least two full business cycles** (typically two weeks for B2C products) before reading results. Monitor the treatment effect over time - a novelty lift decays; a genuine improvement holds flat or grows.

---

## Analytics-Informed Design

Quantitative analytics tells you what users are doing at scale, but it cannot tell you why. Use analytics to identify where to focus research attention, not to replace it.

### Funnel Analysis

A funnel analysis counts users at each step of a defined sequence (landing → sign-up → onboarding → first key action → activation) and reports the drop-off rate between steps. A large drop between two steps identifies a problem worth investigating; it does not explain the cause.

**Correct interpretation:** "60% of users who start sign-up do not complete it - this step warrants usability testing and exit surveys."

**Incorrect interpretation:** "The sign-up form is confusing - we should simplify it." Funnels explain what, not why. The drop may be caused by form friction, price discovery too late, technical errors on specific devices, or users deliberately deferring. Research the step before redesigning it.

### Cohort Retention Curves

A cohort retention curve shows what percentage of users acquired in a given period return to the product on each subsequent day (or week). The shape of the curve identifies which phase of the product relationship is failing:

- **Early drop (Day 1–3):** Users are not completing onboarding or are not reaching the first moment of value; the onboarding flow is the design target
- **Mid drop (Day 7–14):** Users completed onboarding but are not forming a usage habit; engagement features (reminders, progress, social hooks) and the core loop are the design targets
- **Late drop (Day 30+):** Users had a habit but lost it; this indicates habit failure, not acquisition or onboarding issues - investigate trigger frequency, competing alternatives, and changing life context

A flat retention curve (asymptoting above zero) is the signal that product-market fit exists for at least a subset of users.

### Heatmap Interpretation

Heatmaps aggregate mouse movement, scroll depth, and click positions across many sessions into a visual overlay. They communicate density of attention, with important caveats:

- **Scroll depth ≠ engagement.** A user who scrolled to the bottom of a page and immediately left read nothing. Cross-reference scroll depth with time on page.
- **Click heatmaps lie on dynamic content.** Carousels, tabs, and modal triggers change what is rendered at a coordinate; aggregated clicks on a static screenshot misrepresent where those clicks actually landed.
- **Move maps are proxies.** Eye-tracking research shows mouse position correlates with gaze only roughly (r ≈ 0.64); do not treat move heatmaps as attention maps.

Use heatmaps to generate hypotheses ("Almost nobody clicks the secondary CTA - maybe it is not visible enough at typical scroll depths") and confirm those hypotheses with usability testing or A/B tests.

### Session Recordings

Session recordings capture individual user interactions as video replays. They are the analytics tool closest to observational research and the most time-intensive to analyze at scale.

**Patterns that indicate design problems:**
- **Rage clicks** - repeated rapid clicks on an element, indicating the user believes something should be clickable and it is not (or it is broken)
- **Dead clicks** - clicks on non-interactive elements, indicating visual affordance is misleading
- **Scroll-and-return patterns** - the user scrolls past a point, returns, and re-reads it, indicating the content is ambiguous or the action they need is not where they expected it
- **U-turns on multi-step flows** - navigating forward then immediately back, indicating confusion or missing information at the forward step

Sampling strategy matters: watch recordings filtered by the segment of users you are trying to understand (new users on mobile, users who abandoned checkout) rather than random sessions. Random sessions produce anecdote, not insight.

---

## Research Ethics

Ethical research practice is not only a moral obligation - it also produces better data. Participants who feel respected and safe give more candid and accurate responses.

### Informed Consent

Every participant must be told, before the session begins: what they will be asked to do, how long it will take, whether the session will be recorded (audio, video, or screen), who will have access to recordings and data, and how data will be stored and eventually deleted. Consent must be explicit and voluntary - a participant who feels they cannot say no has not given meaningful consent.

For unmoderated remote studies (tree tests, surveys, unmoderated usability tests), informed consent is captured in a pre-task screen that participants must actively acknowledge before proceeding.

### Observer Effect

The presence of a researcher - or even the knowledge that behavior is being observed - changes that behavior. Participants tend to perform more carefully, ask more clarifying questions, and avoid the shortcuts and workarounds that characterize natural use. This is the Hawthorne effect applied to usability research.

**Mitigations:**
- Use diary studies and screen recordings to capture naturalistic behavior without researcher presence
- In moderated sessions, use indirect tasks ("Show me how you would accomplish X") rather than direct observation ("Try to do X while I watch")
- Cross-reference moderated findings with analytics - discrepancies between observed behavior and logged behavior indicate observer effect

### Data Minimization

Collect only the data you will actually analyze. If the research question does not require knowing a participant's age, do not ask for it. If screen recordings will not be reviewed, do not record them. At rest, research data should be:
- Stored in access-controlled systems, not personal drives or shared folders
- Anonymized or pseudonymized - names replaced with participant IDs, identifying details removed from quotes before sharing
- Deleted on a defined schedule once the synthesis is complete

Retaining raw recordings indefinitely is a liability, not a resource.

### Vulnerable Populations

Research involving **children under 13**, **users with cognitive or developmental disabilities**, or **users in crisis** (mental health platforms, bereavement services) requires heightened ethical review equivalent to IRB (Institutional Review Board) standards, even in commercial settings. Specific requirements:

- Parental or guardian consent for minors, in addition to the participant's own assent
- Simplified consent language and extended time for participants with cognitive disabilities
- Safeguarding protocols - a defined plan for what happens if a participant discloses distress during a session
- Avoiding incentive structures that exploit vulnerability (large cash payments to economically precarious participants create coercive pressure)

When in doubt about whether a population qualifies for heightened review, treat them as though they do. The cost of over-protecting participants is low; the cost of under-protecting them is not.
