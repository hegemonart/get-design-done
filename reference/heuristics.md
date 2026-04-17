# Design Heuristics & Principles

Use this during Discover (identifying real problems), Plan (determining what to fix), and Verify (scoring the result).

---

## Nielsen Norman Group — 10 Usability Heuristics

The baseline evaluation framework. Score each 0–4 (0=violation, 4=excellent). Include in audit output.

### H-01: Visibility of System Status
The system should always keep users informed about what's going on, through appropriate feedback within a reasonable time.
- Loading states must show progress (spinner, skeleton, progress bar)
- Success/error must be communicated within 100ms of action
- Background processes must have status indicators
- **Fail cases**: No loading state, success/fail same appearance, silent errors

### H-02: Match Between System and the Real World
The system should speak the users' language, using words, phrases, and concepts familiar to them rather than system-oriented terms.
- Labels use domain language, not technical names
- Dates in human format ("June 12" not "2024-06-12" for consumer apps)
- Destructive actions use plain language ("Delete" not "Terminate instance")
- Icons match mental models (floppy disk = save is OK if users know it)
- **Fail cases**: Backend error codes shown to users, jargon, mismatched metaphors

### H-03: User Control and Freedom
Users often choose system functions by mistake and will need a clearly marked "emergency exit."
- Undo/redo for all reversible actions
- Cancel available in every multi-step flow
- Browser back button works predictably
- Destructive confirmation before permanent actions
- **Fail cases**: No undo, modal with no escape, back button resets form data

### H-04: Consistency and Standards
Users should not have to wonder whether different words, situations, or actions mean the same thing.
- Same action → same component → same placement across all screens
- Platform conventions followed (iOS: bottom nav, Android: material navigation)
- Color semantic is consistent (red = danger ALWAYS, green = success ALWAYS)
- Interaction patterns identical across similar elements
- **Fail cases**: Primary button varies in color, icons change meaning, inconsistent terminology

### H-05: Error Prevention
Even better than good error messages is a careful design which prevents a problem from occurring in the first place.
- Destructive actions require confirmation
- Invalid inputs blocked or warned before submission
- Irreversible operations clearly marked as such
- Sensible defaults reduce user error
- **Fail cases**: Delete with no confirmation, form submits invalid data, no type="email" on email fields

### H-06: Recognition Rather Than Recall
Minimize the user's memory load by making objects, actions, and options visible.
- Navigation options always visible, not hidden in help menus
- Recently used items surfaced
- Search results show what was searched
- Form state preserved on navigation
- **Fail cases**: Users must remember previous step's data, keyboard shortcuts only without visual hints

### H-07: Flexibility and Efficiency of Use
Accelerators — unseen by the novice user — allow experts to speed up interaction.
- Keyboard shortcuts for power users
- Bulk actions for lists
- Saved searches/filters
- Command palettes for complex apps (cmd+K)
- **Fail cases**: Every action requires 5 clicks for all user types, no quick-repeat mechanism

### H-08: Aesthetic and Minimalist Design
Dialogs should not contain irrelevant or rarely needed information. Every unit of information competes with every other.
- Every element on screen earns its place
- One primary action per screen/section
- Secondary information accessible, not upfront
- Visual hierarchy guides attention automatically
- **Fail cases**: 4 CTAs with equal weight, information density makes scanning impossible, decorative elements dominate

### H-09: Help Users Recognize, Diagnose, and Recover from Errors
Error messages should be expressed in plain language (no codes), precisely indicate the problem, and constructively suggest a solution.
- Error message = what happened + why + how to fix
- Errors appear near the field/action that caused them
- Error color (red) has sufficient contrast (4.5:1)
- Recovery action is a button, not just text
- **Fail cases**: "Error 422", "Something went wrong", error at top of page for field-level problem

### H-10: Help and Documentation
Even though it is better if the system can be used without documentation, it may be necessary to provide help.
- Inline help text for complex fields
- Tooltips for icon-only buttons
- Progressive disclosure for advanced features
- Search in documentation
- **Fail cases**: No explanation for non-obvious fields, icon-only toolbar with no labels or tooltips

---

## Gestalt Principles

Use during layout and visual hierarchy decisions.

**Proximity** — Elements close together are perceived as related. Use: group related controls (8–16px between group members, 32–64px between groups).

**Similarity** — Elements looking alike are perceived as the same type. Use: consistent styling for all links, all CTAs, all destructive actions.

**Continuity** — The eye follows lines and curves. Use: align elements to create reading flow (left-to-right, top-to-bottom).

**Closure** — The mind fills in incomplete shapes. Use: card borders can be implied by spacing and background difference alone.

**Figure/Ground** — Foreground vs background differentiation. Use: modals and overlays need clear depth separation (shadow, blur, dimming).

**Common Fate** — Elements moving together are perceived as a group. Use: animation groups related elements together — stagger within groups, not across.

**Prägnanz (Simplicity)** — The mind perceives the simplest possible interpretation. Use: reduce visual complexity. If 2 elements can do the job of 5, use 2.

---

## Fitts's Law

**T = a + b × log₂(D/W + 1)**

Time to click = function of distance / target size. Implications:
- Minimum touch target: **44×44pt** (iOS), **48×48dp** (Android). Never smaller.
- Destructive actions (Delete, Cancel) must be **physically far** from primary actions OR significantly smaller — not adjacent at the same size.
- Screen edges and corners are fast (infinite size in that direction) — use for primary navigation (iOS bottom bar, macOS menu bar).
- Dense interfaces that require clicking small targets = high error rate + user frustration.

---

## Hick's Law

**T = b × log₂(n + 1)**

Decision time increases with number of choices. Implications:
- Navigation menus: max **7 top-level items** (ideally 5).
- Forms: group related fields, reveal complexity progressively.
- Feature lists on marketing pages: 3–4 items per section, not 12.
- Product pricing: 3 plans perform better than 2 or 5.

---

## Miller's Law (7 ± 2)

Working memory holds approximately **5–9 items**. Implications:
- Navigation: ≤7 items without grouping.
- Onboarding steps: ≤5 visible at once.
- Dropdown options: >7 → add search.
- Dashboard widgets: >9 on one view → consider filtering or tabs.

---

## Serial Position Effect

Users remember the **first** and **last** items in a list best (primacy and recency). Implications:
- Put most important actions first and last in navigation.
- In long forms, critical fields go near the top or after a clear section break.
- CTAs at the bottom of long pages work (recency) — but add one above the fold too (primacy).

---

## Von Restorff Effect (Isolation Effect)

The item that **differs** from its group is most memorable. Implications:
- One primary CTA per screen (contrast makes it memorable).
- Don't use "primary" styling on 3 different buttons — only one stands out.
- Highlight key data points in tables (bold, color accent) — but only the truly key ones.
- Overuse of emphasis = no emphasis. Use it for 1–2 items per view maximum.

---

## Jakob's Law

Users spend most of their time on **other sites**. They expect yours to work the same way. Implications:
- Login at top-right. Cart icon at top-right. Logo at top-left.
- Don't innovate on navigation placement without very strong reason.
- Form inputs look like inputs. Buttons look like buttons.
- "Creative" UI patterns require user re-learning = friction.

---

## Zeigarnik Effect

People **remember incomplete tasks** better than completed ones. Implications:
- Progress bars keep users motivated in onboarding flows.
- "Complete your profile" patterns work because they activate this effect.
- Show completion percentage, not just what's left.

---

## How to Score During Verification

For each NNG heuristic (H-01 through H-10), rate 0–4:

| Score | Meaning |
|---|---|
| 4 | Excellent — actively exemplifies the heuristic |
| 3 | Passes — meets the heuristic requirement |
| 2 | Minor violation — notable issue but not blocking |
| 1 | Major violation — users will notice and be impacted |
| 0 | Critical violation — breaks the interface |

**Overall Heuristic Score** = (sum / 40) × 100

- 90–100: Excellent UX quality
- 75–89: Good, minor issues
- 60–74: Acceptable, improvement needed
- <60: Significant UX problems, redesign required
