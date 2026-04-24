# Review Format — The Before/After Table

Adopted from `emil-design-eng` and enforced across `get-design-done`. **Every design review uses this format.** No exceptions.

## The format

```markdown
| Before | After | Why |
| --- | --- | --- |
| `transition: all 300ms` | `transition: transform 200ms ease-out` | Specify exact properties; avoid `all` (repaint cost + unpredictable) |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Nothing in the real world appears from nothing |
| `ease-in` on dropdown | `ease-out` with custom curve | `ease-in` feels sluggish; ease-out gives instant feedback |
| No `:active` on button | `transform: scale(0.97)` on `:active` | Buttons must feel responsive to press |
| `transform-origin: center` on popover | `transform-origin: var(--radix-popover-content-transform-origin)` | Popovers scale from their trigger (modals stay centered) |
```

**That's the whole format.** Three columns, one row per issue.

## Why this format and not prose

- **Scannable.** Reviewer can see the whole list at a glance.
- **Actionable.** Each row is a specific, applyable change.
- **Non-redundant.** No repeating "Before:" / "After:" labels every time.
- **The "Why" column is required.** It forces reasoning instead of taste-asserting. Future you also forgets why; the column documents the decision.

## Wrong format — never produce this

```
Before: transition: all 300ms
After: transition: transform 200ms ease-out

Before: scale(0)
After: scale(0.95)
```

This form is verbose, hard to scan, and separates the reasoning from the change. Don't do it.

Also wrong:
- Bullet lists of "change X to Y" without the Why column
- Narrative paragraphs explaining multiple changes at once
- Code blocks with full file rewrites instead of focused diffs

## When to use this format

- **Any review of existing code or design.** `design:design-critique`, `design:accessibility-review` — all produce outputs that can be rendered as this table.
- **Responding to "review this" / "what do you think of this."**
- **After `/gdd:fast` or `/gdd:design` applies a polish pass** — present the diff as a table.
- **Documenting design-system migrations** (old token → new token, with why).

## When NOT to use this format

- **Greenfield design.** No "Before" exists — that's a design proposal, not a review.
- **Strategic direction critiques.** ("Should we commit to dark mode?") — that's a decision, not a diff.
- **Presentation to stakeholders.** Use `anthropic-skills:design-storytelling`'s narrative spine instead.

## Variations by domain

### Typography review
```
| Before | After | Why |
| 3 font families (Inter + Playfair + JetBrains) | 2 (ABC Favorit + JetBrains) | More than 2 families dilutes hierarchy |
| 8 font sizes at 1.1 ratio | 5 sizes at 1.25 ratio | Fewer sizes, more contrast = clearer hierarchy |
```

### Color review
```
| Before | After | Why |
| `#888` secondary text on white | oklch(52% 0.01 [hue]) | #888 fails 4.5:1; oklch value passes |
| Pure black dark-mode bg | oklch(14% 0.01 [brand-hue]) | Pure black is harsh; tinted darkens feels premium |
```

### Motion review
```
| Before | After | Why |
| Same 300ms for open + close | 300ms open / 225ms close | Exits should be ~75% of enter duration |
| Sheet animates height | Sheet animates transform: translateY | height animation is main-thread; transform is GPU |
```

### UX copy review
```
| Before | After | Why |
| "OK" button | "Save changes" | Verbs describe the outcome; generic OK is lazy |
| "Error: invalid email" | "Enter a valid email like name@example.com" | Tell user how to fix, not just what's wrong |
| Empty state: "No items" | "No messages yet. Try [connecting your inbox]." | Empty state = onboarding opportunity |
```

## Scoring version (when comparing multiple artifacts)

When comparing two variations (A vs B) instead of reviewing one, switch to a scored table:

```
| Dimension          | Variant A | Variant B | Winner | Why |
| Visual hierarchy   | 6/10      | 8/10      | B      | B's size contrast more decisive |
| Touch targets      | 7/10      | 5/10      | A      | B has 32px buttons fail 44pt |
| Brand fit          | 9/10      | 5/10      | A      | A commits to editorial tone; B hedges |
| Accessibility      | 7/10      | 7/10      | tie    | Both miss focus rings |
```

Use the 10 priority-matrix categories (see `priority-matrix.md`) as the dimensions by default.

## Output header

Always precede the table with one sentence stating the scope:

> Reviewed: Settings page modal, `components/Settings.tsx`. 7 changes proposed — 2 P0 accessibility, 3 P1 motion, 2 P2 polish.

Then the table. Then nothing. The reader decides whether to apply.
