---
name: motion-mapper
description: "Maps motion and animation patterns — CSS transitions, framer-motion, GSAP, prefers-reduced-motion — to .design/map/motion.md."
tools: Read, Write, Bash, Grep, Glob
color: cyan
model: inherit
default-tier: sonnet
tier-rationale: "Inventories motion patterns; open-ended visual reasoning across files"
parallel-safe: auto
typical-duration-seconds: 30
reads-only: false
writes:
  - ".design/map/motion.md"
---

@reference/shared-preamble.md

# motion-mapper

## Role

You inventory motion and animation patterns. Zero session memory. You do not modify source code and do not spawn other agents.

## Required Reading

- `.design/STATE.md`
- `reference/motion.md` (if present)
- Any files supplied by the orchestrator

## Scan Strategy

### CSS transitions and keyframes

```bash
grep -rEn "transition\s*:|@keyframes\s|animation\s*:" src/ --include="*.css" --include="*.scss" | head -150
```

### Tailwind motion utilities

```bash
grep -rEn "animate-|duration-|ease-|transition-" src/ --include="*.tsx" --include="*.jsx" --include="*.html" | head -100
```

### JS libraries

```bash
grep -rEn "framer-motion|motion\.(div|span|button)|useAnimation|useSpring|useTransform" src/ --include="*.tsx" --include="*.jsx" | head -80
grep -rEn "\bgsap\b|TweenMax|gsap\.(to|from|timeline)" src/ | head -40
```

### Reduced-motion compliance

```bash
grep -rEn "prefers-reduced-motion" src/ | head -40
```

### Duration classification

From the collected values, bucket by:
- Fast: <200ms
- Normal: 200–400ms
- Slow: >400ms

## Output Format — `.design/map/motion.md`

```markdown
---
generated: [ISO 8601]
---

# Motion Map

## CSS transitions
| File | Property | Duration | Easing |
|------|----------|----------|--------|

## Library usage
| Library | Files | Notes |
|---------|-------|-------|

## Duration distribution
- Fast (<200ms): [N]
- Normal (200–400ms): [N]
- Slow (>400ms): [N]

## Easing functions
| Easing | Count |
|--------|-------|

## Reduced-motion compliance
- `prefers-reduced-motion` queries present: [N]
- Animated components lacking a reduced-motion branch: [list]

## Score
Reduced-motion compliance: [Full | Partial | None]
Motion consistency: [Consistent | Mixed | Chaotic]

## Micro-motion findings

After the standard motion inventory, emit a "Micro-motion findings" section with grep-driven hits:

### Patterns to scan for:

1. **transition:all violations**
   - Grep: `transition:\s*all|transition-property:\s*all`
   - Also Tailwind bare: `className="[^"]*\btransition\b[^-]` (transition class without modifier)
   - Report: file:line, the exact declaration, fix pointer → replace with specific properties

2. **will-change:all violations**
   - Grep: `will-change:\s*all`
   - Report: file:line, the declaration, fix pointer → `will-change: transform`

3. **Keyframe-driven interactive elements**
   - Grep: `animation:.*forwards|@keyframes.*\{` on elements that also have `:hover` or `:active` or `onClick`
   - Report: these should use CSS transitions, not keyframe animations

4. **Missing AnimatePresence initial={false}**
   - Grep: `<AnimatePresence(?![^>]*initial=\{false\})` — AnimatePresence without initial={false}
   - Report: file:line; check if the wrapped component is persistent UI (not route-level transitions)

5. **Icon cross-fade with wrong bounce**
   - Grep: `bounce:\s*[^0]` inside framer-motion spring config near icon-related components
   - Report: bounce must be 0 for icon animations; non-zero bounce creates invasive pop effect

6. **scale-on-press outside canonical range**
   - Grep: `scale.*0\.9[578]|scale.*0\.9[0-4]|whileTap.*scale.*0\.9[578]`
   - Report: file:line; canonical press scale is 0.96 — not 0.95, 0.97, 0.98

### Output format for this section:
```
## Micro-motion findings

| Finding | File | Line | Issue | Fix |
|---------|------|------|-------|-----|
| transition:all | src/components/Button.tsx | 23 | `transition: all 200ms` | Replace with `transition: background-color 200ms, color 200ms` |
| ... | ... | ... | ... | ... |

Total: N violations found. (0 = clean)
```

If no violations found, emit: `## Micro-motion findings — CLEAN (0 violations)`
```

## Constraints

No modifications outside `.design/map/`. No git. No agent spawning.

## MOTION MAP COMPLETE
