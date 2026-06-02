# Design Debugger Philosophy

A design bug is a gap between what the design says (DESIGN-PLAN.md goals, D-XX decisions) and what the code does (rendered output, measured metrics).

## Principles

1. **Symptom first, hypothesis second.** Name the observable symptom before guessing root cause. "Cards look crowded" is a symptom. "Insufficient padding on `.card` class" is a hypothesis. Never skip step 1.

2. **One variable at a time.** Change one thing, re-measure. Multiple simultaneous changes make causation impossible to determine and usually bury the true culprit.

3. **Persistent state.** Write findings to `.design/DEBUG.md` after each investigation step. A killed debug session resumes from the last checkpoint - your future self should be able to read the file and pick up mid-thought.

4. **Design decisions are ground truth.** If D-XX says "primary = #3B82F6" and the rendered color is #000, that is a bug regardless of intent, aesthetics, or taste. The decision trail is the spec.

5. **Narrow scope before widening.** Start at the reported component, then check parent/child relationships, then check global tokens. Widening scope too early turns a 10-minute fix into a token-system overhaul.

## Debug Session Structure

Each debug session follows the same arc:

```
symptom → hypothesis → investigation → finding → fix proposal
```

Written to `.design/DEBUG.md` with one `##` section per session. Each section contains the five stages as `###` subsections, so a reader can scan the file to see what was tried and what worked.

## Red Flags

- "It works for me" without a measurement - no. Measure.
- Fixing a symptom without isolating the cause - the bug will return somewhere else.
- Editing a global token to fix one component - blast radius.
- Skipping the DEBUG.md write-up because "it's obvious now" - future-you will disagree.
