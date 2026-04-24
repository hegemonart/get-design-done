# Discussion: Aggregated Questions

## Theme: Onboarding and Activation

The onboarding flow surfaces multiple recovery-path concerns raised by
both the UX researcher and the accessibility specialist.

1. **[blocker]** How does a first-time user recover from the onboarding skip?
   Raised by: user-journey, accessibility.
2. **[major]** What happens on the empty-state of the library view?
   Raised by: user-journey.

## Theme: Motion and Contrast

The accessibility specialist surfaced WCAG-adjacent concerns about
animation controls and focus visibility.

1. **[major]** Can the hero animation be paused by users?
   Raised by: accessibility.
2. **[minor]** Does the focus outline meet 3:1 contrast against all backgrounds?
   Raised by: accessibility.

```json
{
  "themes": [
    { "name": "Onboarding and Activation", "summary": "Recovery paths for first-time users." },
    { "name": "Motion and Contrast", "summary": "WCAG-adjacent animation and focus concerns." }
  ],
  "questions": [
    { "key": "a1b2c3d4", "text": "How does a first-time user recover from the onboarding skip?", "severity": "blocker", "raised_by": ["user-journey", "accessibility"], "theme": "Onboarding and Activation", "rank": 0 },
    { "key": "e5f6a7b8", "text": "What happens on the empty-state of the library view?", "severity": "major", "raised_by": ["user-journey"], "theme": "Onboarding and Activation", "rank": 1 },
    { "key": "c9d0e1f2", "text": "Can the hero animation be paused by users?", "severity": "major", "raised_by": ["accessibility"], "theme": "Motion and Contrast", "rank": 2 },
    { "key": "deadbeef", "text": "Does the focus outline meet 3:1 contrast against all backgrounds?", "severity": "minor", "raised_by": ["accessibility"], "theme": "Motion and Contrast", "rank": 3 }
  ]
}
```
