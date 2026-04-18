---
name: get-design-done:darkmode
description: "Audit dark mode implementation. Detects architecture (CSS custom props, Tailwind dark:, JS class toggle), checks contrast, semantic token overrides, dark-specific anti-patterns, and color-scheme meta property. Writes .design/DARKMODE-AUDIT.md (read-only — no score writeback to DESIGN.md)."
argument-hint: ""
user-invocable: true
---

# get-design-done:darkmode — Dark Mode Audit

Standalone dark mode audit command. It detects the project's dark mode architecture, runs architecture-specific checks across contrast, token completeness, anti-patterns, and meta properties, then writes a prioritized fix list to `.design/DARKMODE-AUDIT.md`.

---

## Scope

This command is a **standalone audit** — not a pipeline stage:

- It does NOT update DESIGN.md scores (V2-05 deferred — two-sources-of-truth risk).
- It does NOT invoke design-auditor (Pitfall 4 — darkmode runs its own inline audit, separate from the DESIGN-AUDIT.md pipeline).
- It does NOT write to `.design/STATE.md`, `DESIGN-CONTEXT.md`, `DESIGN-PLAN.md`, `DESIGN-SUMMARY.md`, or `DESIGN-VERIFICATION.md`.
- It writes exactly ONE artifact: `.design/DARKMODE-AUDIT.md`.
- It does NOT execute fixes — audit-only per V2-07 deferral (fixes belong in the design skill's color task).

Output artifact prefix is `DARKMODE-AUDIT` — distinct from the pipeline namespace (`DESIGN-*.md`). No naming conflict.

---

## Pre-Flight

Confirm source root exists before scanning. Try each candidate in order:

1. `src/` — preferred (most React/Vue/Svelte projects)
2. `app/` — Next.js App Router
3. `lib/` — library projects
4. `pages/` — Next.js Pages Router

Set `SRC_ROOT` to the first directory that exists. If none exist, abort:

> "No source directory detected. Run /get-design-done scan first."

Confirm `.design/` exists (create it if absent — `mkdir -p .design/`).

### Probe Preview connection

Run at stage entry, after pre-flight checks:

```
Step P1 — ToolSearch check:
  ToolSearch({ query: "Claude_Preview", max_results: 5 })
  → Empty result      → preview: not_configured  (skip Dark Mode Rendering section)
  → Non-empty result  → proceed to Step P2

Step P2 — Live tool call:
  call mcp__Claude_Preview__preview_list
  → Success           → preview: available
  → Error             → preview: unavailable

Write preview status to .design/STATE.md <connections>.
```

---

## Step 1: Architecture Detection (DARK-02)

Run all three architecture greps against `$SRC_ROOT`. Use `2>/dev/null` on each to suppress missing-directory errors.

```bash
# Architecture 1: CSS custom properties with dark media query
arch1_count=$(grep -rEn "prefers-color-scheme.*dark|\.dark[[:space:]]*\{" "$SRC_ROOT" \
  --include="*.css" --include="*.scss" 2>/dev/null | wc -l)

# Architecture 2: Tailwind dark: prefix
arch2_count=$(grep -rEn "dark:[a-z]" "$SRC_ROOT" \
  --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null | wc -l)

# Architecture 3: JS class toggle on <html> / <body>
arch3_count=$(grep -rEn "classList.*dark|setAttribute.*dark|document\.documentElement" "$SRC_ROOT" \
  --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null | wc -l)
```

**Classification rules:**

| Condition | Classification |
|-----------|---------------|
| All three counts < 3 | No dark mode — abort: "No dark mode implementation detected — nothing to audit." |
| Exactly one count ≥ 3 | Primary architecture = that one |
| Two or more counts ≥ 5 | Hybrid (list all detected architectures) |
| One count ≥ 3, others < 5 | Primary = highest count |

Record `ARCH_DETECTED` as one of: `Architecture 1 (CSS custom props)`, `Architecture 2 (Tailwind dark:)`, `Architecture 3 (JS class toggle)`, or `Hybrid`.

---

## Step 2: Contrast Audit (DARK-03)

For the detected architecture, enumerate color token + background token pairs used in dark context, then compute WCAG contrast ratios.

**Token extraction by architecture:**

**Architecture 1 (CSS custom props):**
```bash
# Extract dark-context token definitions from .dark { } blocks and @media (prefers-color-scheme: dark) blocks
grep -rEn "\.dark[[:space:]]*\{|prefers-color-scheme.*dark" "$SRC_ROOT" \
  --include="*.css" --include="*.scss" -A 30 2>/dev/null \
  | grep -E "^\s*--[a-z].*:\s*#[0-9a-fA-F]{3,8}|^\s*--[a-z].*:\s*rgb"
```

**Architecture 2 (Tailwind dark:):**
```bash
# Extract dark:bg-* and dark:text-* class combinations
grep -rEhon "dark:(bg|text)-[a-z0-9-]+" "$SRC_ROOT" \
  --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null | sort -u
```

**Architecture 3 (JS class toggle):**
```bash
# Read dark CSS rules (same as Architecture 1 — the JS toggle sets .dark on <html>)
grep -rEn "\.dark[[:space:]]*\{" "$SRC_ROOT" \
  --include="*.css" --include="*.scss" -A 30 2>/dev/null \
  | grep -E "color|background"
```

**WCAG contrast computation:**

Use the linearized-sRGB formula from `agents/design-executor.md` Type: accessibility (pre-calibrated — do not re-derive). For each text/background pair:

1. Convert each hex channel to linear light: `c_lin = (c/255 ≤ 0.04045) ? c/255/12.92 : ((c/255 + 0.055)/1.055)^2.4`
2. Relative luminance: `L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin`
3. Contrast ratio: `(L_lighter + 0.05) / (L_darker + 0.05)`

**Thresholds:**

| Text type | Min ratio | Fail severity |
|-----------|-----------|---------------|
| Body text (< 18pt or < 14pt bold) | 4.5:1 | P0 (critical) |
| Large text (≥ 18pt or ≥ 14pt bold) | 3:1 | P1 (major) |
| UI component boundaries | 3:1 | P1 (major) |

Flag every pair that fails its threshold. Include token names, hex values, computed ratio, and required ratio in the fix description.

---

## Step 3: Token Override Completeness (DARK-04)

Check that every light-mode color token has a corresponding dark-mode override.

**Enumerate light-mode tokens:**
```bash
# CSS custom props approach
grep -rEhon "var\(--color-[a-z0-9-]+\)" "$SRC_ROOT" \
  --include="*.css" --include="*.scss" --include="*.tsx" --include="*.jsx" 2>/dev/null \
  | grep -oE "\-\-color-[a-z0-9-]+" | sort -u

# Tailwind semantic classes (if Arch 2)
grep -rEhon "(bg|text|border|ring)-[a-z]+-[0-9]+" "$SRC_ROOT" \
  --include="*.tsx" --include="*.jsx" 2>/dev/null | sort -u
```

**Check dark overrides (architecture-specific):**
- Arch 1: Token appears in `.dark { --color-* }` block or `@media (prefers-color-scheme: dark) { --color-* }`
- Arch 2: A `dark:` prefixed variant of the Tailwind class exists in the same file or a shared layout
- Arch 3: Token appears in the dark CSS block activated by JS class toggle

**Flag:** Any light-mode color token with no dark override → P1 (major). Include token name and file location.

---

## Step 4: Dark-Specific Anti-Patterns (DARK-05)

**Anti-pattern A: Images and SVGs without dark variant**

```bash
# Find all <img> and <svg> references
grep -rEn "<img[^>]+src=|<svg" "$SRC_ROOT" \
  --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" 2>/dev/null \
  | grep -v "dark\."
```

For each image/SVG found, check whether any of the following exist:
- A sibling file with pattern `[name]-dark.{png,svg,webp}`
- A `dark:hidden` / `dark:block` swap class pairing in the same component
- A `<picture>` element with a `prefers-color-scheme: dark` source

Flag images/SVGs with none of the above → P2 (minor).

**Anti-pattern B: Pure-black backgrounds (BAN-05)**

```bash
# Grep for pure-black in dark-context CSS
grep -rEn "#000000|#000\b|rgb\([[:space:]]*0[[:space:]]*,[[:space:]]*0[[:space:]]*,[[:space:]]*0[[:space:]]*\)|background[^:]*:[[:space:]]*black" \
  "$SRC_ROOT" --include="*.css" --include="*.scss" 2>/dev/null
```

Any match within a `.dark {}` block or `@media (prefers-color-scheme: dark)` context → P1 (major). Pure black (`#000000`) in dark mode causes visual harshness and fails accessibility in high-contrast conditions. Use near-black (`#0a0a0a`–`#1a1a1a`) instead.

**Anti-pattern C: Missing forced-colors media query**

```bash
forced_count=$(grep -rEn "@media.*forced-colors" "$SRC_ROOT" \
  --include="*.css" --include="*.scss" 2>/dev/null | wc -l)
```

If `forced_count` equals 0 → P2 (minor). The `forced-colors` media query ensures the design respects Windows High Contrast mode and similar OS accessibility overrides.

---

## Step 5: Meta Property Check (DARK-06)

**color-scheme property:**
```bash
cs_count=$(grep -rEn "color-scheme" "$SRC_ROOT" public/ \
  --include="*.html" --include="*.tsx" --include="*.css" 2>/dev/null | wc -l)
```
If `cs_count` equals 0 → P2 (minor). The `color-scheme` CSS property / meta tag tells the browser to render scrollbars, form inputs, and system UI in the correct dark/light variant.

**prefers-color-scheme media query:**
```bash
pcs_count=$(grep -rEn "prefers-color-scheme" "$SRC_ROOT" public/ \
  --include="*.html" --include="*.tsx" --include="*.css" 2>/dev/null | wc -l)
```
If `pcs_count` equals 0 → P2 (minor). Absence means the site ignores the OS-level dark mode preference — the user's system setting has no effect.

---

## Step 5B: Dark Mode Rendering Screenshots (when preview: available)

Check `preview` status from STATE.md `<connections>` (written by the probe at stage entry).

**If `preview: available`:**

1. `preview_navigate` to the primary route (e.g., `http://localhost:3000/`).
2. Capture light-mode screenshot: `preview_screenshot` → save to `.design/screenshots/darkmode/light.png`.
3. Inject dark mode using the project's toggle mechanism (check `DESIGN-CONTEXT.md` D-XX decisions):
   - Tailwind dark: `preview_eval("document.documentElement.classList.add('dark')")`
   - data-theme: `preview_eval("document.documentElement.setAttribute('data-theme','dark')")`
   - Custom class: `preview_eval("document.documentElement.classList.add('theme-dark')")`
   - If mechanism is unknown: attempt Tailwind default first; note in DARKMODE-AUDIT.md which method was used
4. `preview_screenshot` → save to `.design/screenshots/darkmode/dark.png`.
5. Record both paths (NOT base64) for embedding in `## Dark Mode Rendering` section of DARKMODE-AUDIT.md.

**If `preview: unavailable` or `preview: not_configured`:**

Omit `## Dark Mode Rendering` section entirely. Emit: `Visual dark mode check skipped — preview not configured.` in the Notes section.

---

## Step 6: Write DARKMODE-AUDIT.md (DARK-07)

Output path: `.design/DARKMODE-AUDIT.md`

Collect all flagged issues from Steps 2–5, group by priority (P0 → P1 → P2 → P3), and write:

```markdown
# Dark Mode Audit

**Generated:** <ISO date>
**Architecture detected:** <Architecture 1 (CSS custom props) | Architecture 2 (Tailwind dark:) | Architecture 3 (JS class toggle) | Hybrid | None>
**Source scanned:** <SRC_ROOT>

## Summary

| Category | Status | Issues |
|----------|--------|--------|
| Contrast (DARK-03) | <pass / fail> | <count> |
| Token Overrides (DARK-04) | <pass / fail> | <count> |
| Anti-Patterns (DARK-05) | <pass / fail> | <count> |
| Meta Properties (DARK-06) | <pass / fail> | <count> |

## P0 Fixes (Critical — contrast failure on body text)

- [CONTRAST] <token-pair>: ratio <X:1> — required 4.5:1. File: <path>

## P1 Fixes (Major — contrast failure on large text / missing dark overrides / pure-black)

- [CONTRAST-LARGE] <token-pair>: ratio <X:1> — required 3:1. File: <path>
- [TOKEN-OVERRIDE] Missing dark override for <--token-name>. Light value: <hex>. File: <path>
- [BAN-05] Pure-black background detected in dark context. File: <path>:line

## P2 Fixes (Minor — missing SVG variants / forced-colors / meta props)

- [SVG-DARK] <image.svg> has no dark variant (no -dark.svg sibling, no dark: swap class). File: <path>
- [FORCED-COLORS] No @media (forced-colors) block detected in any CSS file.
- [COLOR-SCHEME] No color-scheme property or meta tag detected.
- [PREFERS-COLOR-SCHEME] No prefers-color-scheme query detected (OS preference ignored).

## P3 Fixes (Cosmetic)

- <cosmetic issues, if any>

## Dark Mode Rendering

<One of the following:>
- When preview: available: side-by-side screenshot evidence
  - Light: .design/screenshots/darkmode/light.png
  - Dark: .design/screenshots/darkmode/dark.png
  - Injection method used: <classList.add('dark') | setAttribute('data-theme','dark') | other>
- "Visual dark mode check skipped — preview not configured."

## Notes

This audit is read-only. It does NOT write scores back to DESIGN.md.
To apply fixes, run the design pipeline and include dark mode decisions in DESIGN-CONTEXT.md.
Score writeback (V2-05) is deferred to a future version.
```

If a priority bucket has no issues, omit that section or write "None."

---

## Constraints

This command MUST NOT:

- MUST NOT write to `DESIGN.md`, `DESIGN-SUMMARY.md`, `DESIGN-VERIFICATION.md`, `DESIGN-CONTEXT.md`, or `.design/STATE.md`
- MUST NOT invoke `design-auditor` (Pitfall 4 — this is a separate audit with its own inline checks, not an extension of the DESIGN-AUDIT.md pipeline)
- MUST NOT execute any fixes — audit-only per V2-07 deferral (fixes belong in the design skill's color task)
- MUST NOT write scores back to DESIGN.md (V2-05 deferred — two-sources-of-truth risk)
- MUST write exactly one output file: `.design/DARKMODE-AUDIT.md`
- MUST NOT add rows to DESIGN.md or append to pipeline-owned artifacts

---

## Completion

After writing `.design/DARKMODE-AUDIT.md`, print:

```
Dark mode audit complete. Architecture: <X>. Fixes: P0=<N>, P1=<M>, P2=<K>, P3=<J>. See .design/DARKMODE-AUDIT.md.
```

Do not summarize individual issues in the completion message — the file contains the full detail.
