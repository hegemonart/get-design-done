# Design Audit Scoring Framework

Use during Discover (establishing baseline) and Verify (measuring improvement).

---

## Severity Classification

| Level | Code | Impact | Action |
|---|---|---|---|
| Blocker | **P0** | Breaks functionality or violates a hard requirement | Fix before shipping — no exceptions |
| Major | **P1** | Significantly degrades UX or fails accessibility standard | Fix in this design pass |
| Minor | **P2** | Noticeable issue but doesn't break flows | Fix if time allows |
| Cosmetic | **P3** | Polish item only, subjective quality issue | Deferred to polish pass |

---

## Audit Categories and Scoring Rubric

Score each category 0–10. Overall score = weighted average.

### 1. Accessibility (Weight: 25%)

| Score | Criteria |
|---|---|
| 10 | All WCAG 2.1 AA criteria pass. Keyboard nav works end-to-end. Focus rings visible. No color-only meaning. |
| 8–9 | Minor issues — 1–2 non-critical violations, no contrast failures on primary text |
| 5–7 | Several violations — contrast issues on secondary text, some missing labels |
| 3–4 | Multiple failures — some interactive elements inaccessible, missing alt text |
| 0–2 | Critical failures — primary text fails contrast, keyboard nav broken, missing form labels |

Auto-checkable:
- Body text contrast ≥ 4.5:1
- Large text contrast ≥ 3:1
- Touch targets ≥ 44×44px
- Focus rings present (`:focus-visible` defined)
- Form labels associated
- Images have alt text
- No `<div onClick>` for interactive elements

### 2. Visual Hierarchy (Weight: 20%)

| Score | Criteria |
|---|---|
| 10 | Clear primary action per view. Reading order is instantly obvious. Headlines scannable without reading body. |
| 8–9 | Mostly clear hierarchy, 1–2 competing priorities |
| 5–7 | Multiple elements compete for primary attention, visual noise |
| 3–4 | Hard to identify primary action, everything is same weight |
| 0–2 | No discernible hierarchy, flat design with equal visual weight throughout |

Check for:
- One primary CTA per section/screen
- Heading vs body text visually distinguishable by weight/family (not just size)
- Spacing used to group related elements (8–16px within groups, 32–64px between groups)

### 3. Typography (Weight: 15%)

| Score | Criteria |
|---|---|
| 10 | Systematic type scale, harmonious pairing, correct line-height/length, consistent weights |
| 8–9 | Scale mostly consistent, minor deviations |
| 5–7 | Ad-hoc sizes, inconsistent weights, or poor pairing |
| 3–4 | No system evident, mixing too many families, poor readability |
| 0–2 | Body text below 16px, light weights on small text, unreadable |

Check for:
- Font sizes from a defined scale (not arbitrary px values)
- Line height 1.5–1.75 on body
- Max 2 font families (code font is a 3rd exception)
- No default-Inter-without-decision
- Weight hierarchy: bold headings, regular body, medium labels

### 4. Color System (Weight: 15%)

| Score | Criteria |
|---|---|
| 10 | Cohesive palette with clear roles (primary, secondary, semantic tokens), dark mode quality, no accidental palette |
| 8–9 | Mostly consistent, minor token inconsistencies |
| 5–7 | Ad-hoc color usage, some semantic inconsistency |
| 3–4 | Multiple shades of same hue used without logic, no clear semantic roles |
| 0–2 | AI default palette, pure black dark mode, decorative gradient overuse |

Check for:
- Color semantic consistency (red = danger, ONLY danger)
- No AI-slop palette (#6366f1 + #8b5cf6 + #06b6d4)
- Dark mode: desaturated variant colors, not pure black
- Single primary accent used consistently

### 5. Layout & Spacing (Weight: 10%)

| Score | Criteria |
|---|---|
| 10 | Consistent 8pt grid, intentional white space, clear content zones, responsive breakpoints |
| 8–9 | Mostly grid-aligned, minor inconsistencies |
| 5–7 | Mixed spacing values, some alignment issues |
| 3–4 | No evident system, arbitrary spacing |
| 0–2 | Cramped or chaotic layout, broken mobile layout |

Check for:
- Spacing values from 4/8/12/16/24/32/48/64 series
- Content max-width enforced (prose: 65ch, layout: 1200–1440px)
- Mobile breakpoint respected (no horizontal scroll)

### 6. Anti-Pattern Compliance (Weight: 10%)

Score = 10 − (number of hard-ban violations × 3) − (number of AI-slop tells × 1), minimum 0.

Auto-detect (grep):
- Side-stripe borders > 1px → BAN violation
- Gradient text → BAN violation
- `backdrop-filter: blur` without purpose context → slop signal
- AI palette colors → slop signal
- Bounce easing → BAN violation

### 7. Interaction & Motion (Weight: 5%)

| Score | Criteria |
|---|---|
| 10 | `prefers-reduced-motion` implemented, motion purposeful, correct easing, no bounce, exit < enter |
| 8–9 | Minor motion issues, no accessibility violations |
| 5–7 | Some unnecessary motion or poor easing |
| 3–4 | Bounce easing, missing reduced-motion, blocking animations |
| 0–2 | Animates keyboard actions, no reduced-motion, excessive animation |

---

## Weighted Score Calculation

```
Score = (Accessibility × 0.25)
      + (Visual Hierarchy × 0.20)
      + (Typography × 0.15)
      + (Color × 0.15)
      + (Layout × 0.10)
      + (Anti-Patterns × 0.10)
      + (Motion × 0.05)
```

| Grade | Score | Meaning |
|---|---|---|
| A | 90–100 | Excellent — production ready |
| B | 75–89 | Good — minor polish needed |
| C | 60–74 | Acceptable — notable issues to address |
| D | 45–59 | Poor — significant redesign needed |
| F | 0–44 | Failing — fundamental problems |

---

## Audit Output Format

```markdown
## Design Audit — [Project Name]
Date: [ISO 8601]
Baseline score: [N/100]

### Category Scores
| Category | Score | Weight | Weighted |
|---|---|---|---|
| Accessibility | /10 | 25% | |
| Visual Hierarchy | /10 | 20% | |
| Typography | /10 | 15% | |
| Color | /10 | 15% | |
| Layout | /10 | 10% | |
| Anti-Patterns | /10 | 10% | |
| Motion | /10 | 5% | |
| **Total** | | | **/100** |

### Findings
| ID | Severity | Category | Description | Fix |
|---|---|---|---|---|
| A-01 | P0 | Accessibility | Body text contrast 3.2:1 (needs 4.5:1) | Change #9CA3AF → #6B7280 |
| A-02 | P1 | Anti-Pattern | Gradient text on hero heading | Use solid #111827 |
| A-03 | P2 | Typography | Body line-height 1.3 (needs 1.5+) | Change to 1.6 |

### NNG Heuristic Scores
| Heuristic | Score /4 | Notes |
|---|---|---|
| H-01 Visibility of status | /4 | |
| H-02 Real world match | /4 | |
| ... | | |
| **Total** | /40 | **= NNG Score:** /100 |
```
