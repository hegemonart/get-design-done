---
name: darkmode-audit-procedure
type: meta-rules
version: 1.0.0
phase: 28.5
tags: [darkmode, dark-mode, contrast, audit, procedure, extracted]
last_updated: 2026-05-18
---

Source: extracted from `skills/darkmode/SKILL.md` (Phase 28.5 rework — D-10 extract-then-link).
The skill's load-bearing routing + decision tree stays in `../skills/darkmode/SKILL.md`; this
file holds the architecture-detection greps, contrast computation, anti-pattern grep
snippets, and the `DARKMODE-AUDIT.md` report template.

# Dark Mode Audit Procedure

Detailed procedure for the `get-design-done:darkmode` standalone audit — companion to
`../skills/darkmode/SKILL.md`. Read this file when executing a specific audit step
(architecture detection, contrast computation, anti-pattern grep, report layout). The
SKILL.md keeps the load-bearing pre-flight + step routing; this file holds the deep
methodology.

For the perceptual layer (APCA / WCAG 3 draft) sitting on top of the WCAG 2.1 ratios used
in Step 2, see `./contrast-advanced.md`. For modern OKLCH-based dark token-pair generation,
see `./color-theory.md` §OKLCH. For the cross-skill output discipline + connection-probe
pattern, see `./shared-preamble.md#output-contract-reminders` and
`./shared-preamble.md#connection-handshake-summary`.

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
grep -rEn "\.dark[[:space:]]*\{|prefers-color-scheme.*dark" "$SRC_ROOT" \
  --include="*.css" --include="*.scss" -A 30 2>/dev/null \
  | grep -E "^\s*--[a-z].*:\s*#[0-9a-fA-F]{3,8}|^\s*--[a-z].*:\s*rgb"
```

**Architecture 2 (Tailwind dark:):**
```bash
grep -rEhon "dark:(bg|text)-[a-z0-9-]+" "$SRC_ROOT" \
  --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null | sort -u
```

**Architecture 3 (JS class toggle):**
```bash
grep -rEn "\.dark[[:space:]]*\{" "$SRC_ROOT" \
  --include="*.css" --include="*.scss" -A 30 2>/dev/null \
  | grep -E "color|background"
```

**WCAG contrast computation:**

Use the linearized-sRGB formula from `agents/design-executor.md` Type: accessibility (pre-calibrated — do not re-derive):

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

For pairs that pass WCAG 2.1 but feel wrong perceptually (thin mid-gray text, large saturated text, saturated-on-saturated), cross-check with the APCA Lc thresholds in `./contrast-advanced.md` and annotate `[APCA-mismatch]` in the fix description.

---

## Step 3: Token Override Completeness (DARK-04)

Check that every light-mode color token has a corresponding dark-mode override.

**Enumerate light-mode tokens:**
```bash
grep -rEhon "var\(--color-[a-z0-9-]+\)" "$SRC_ROOT" \
  --include="*.css" --include="*.scss" --include="*.tsx" --include="*.jsx" 2>/dev/null \
  | grep -oE "\-\-color-[a-z0-9-]+" | sort -u

grep -rEhon "(bg|text|border|ring)-[a-z]+-[0-9]+" "$SRC_ROOT" \
  --include="*.tsx" --include="*.jsx" 2>/dev/null | sort -u
```

**Check dark overrides (architecture-specific):**
- Arch 1: Token appears in `.dark { --color-* }` block or `@media (prefers-color-scheme: dark) { --color-* }`
- Arch 2: A `dark:` prefixed variant of the Tailwind class exists in the same file or a shared layout
- Arch 3: Token appears in the dark CSS block activated by JS class toggle

**Flag:** Any light-mode color token with no dark override → P1 (major). For OKLCH-based pair generation guidance, see `./color-theory.md` §OKLCH.

---

## Step 4: Dark-Specific Anti-Patterns (DARK-05)

**Anti-pattern A: Images and SVGs without dark variant**

```bash
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
grep -rEn "#000000|#000\b|rgb\([[:space:]]*0[[:space:]]*,[[:space:]]*0[[:space:]]*,[[:space:]]*0[[:space:]]*\)|background[^:]*:[[:space:]]*black" \
  "$SRC_ROOT" --include="*.css" --include="*.scss" 2>/dev/null
```

Any match within a `.dark {}` block or `@media (prefers-color-scheme: dark)` context → P1 (major). Pure black (`#000000`) in dark mode causes visual harshness and fails accessibility in high-contrast conditions. Use near-black (`#0a0a0a` – `#1a1a1a`) instead.

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
If `cs_count` equals 0 → P2 (minor).

**prefers-color-scheme media query:**
```bash
pcs_count=$(grep -rEn "prefers-color-scheme" "$SRC_ROOT" public/ \
  --include="*.html" --include="*.tsx" --include="*.css" 2>/dev/null | wc -l)
```
If `pcs_count` equals 0 → P2 (minor). Absence means the site ignores the OS-level dark mode preference.

---

## Step 5B: Dark Mode Rendering Screenshots (when preview: available)

Check `preview` status from `.design/STATE.md <connections>` (per `./shared-preamble.md#connection-handshake-summary`).

**If `preview: available`:**

1. `preview_navigate` to the primary route (e.g., `http://localhost:3000/`).
2. Capture light-mode: `preview_screenshot` → `.design/screenshots/darkmode/light.png`.
3. Inject dark mode using the project's toggle mechanism (check `DESIGN-CONTEXT.md` D-XX decisions):
   - Tailwind dark: `preview_eval("document.documentElement.classList.add('dark')")`
   - data-theme: `preview_eval("document.documentElement.setAttribute('data-theme','dark')")`
   - Custom class: `preview_eval("document.documentElement.classList.add('theme-dark')")`
   - If mechanism is unknown: attempt Tailwind default first; note in `DARKMODE-AUDIT.md` which method was used.
4. `preview_screenshot` → `.design/screenshots/darkmode/dark.png`.
5. Record both paths (NOT base64) for embedding in `## Dark Mode Rendering` section.

**If `preview: unavailable` or `preview: not_configured`:** omit `## Dark Mode Rendering` section entirely. Emit `Visual dark mode check skipped — preview not configured.` in Notes.

---

## Step 6: DARKMODE-AUDIT.md Template

Output path: `.design/DARKMODE-AUDIT.md`.

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

## P1 Fixes (Major — large-text contrast / missing dark overrides / pure-black)
- [CONTRAST-LARGE] <token-pair>: ratio <X:1> — required 3:1. File: <path>
- [TOKEN-OVERRIDE] Missing dark override for <--token-name>. Light value: <hex>. File: <path>
- [BAN-05] Pure-black background detected in dark context. File: <path>:line

## P2 Fixes (Minor — missing SVG variants / forced-colors / meta props)
- [SVG-DARK] <image.svg> has no dark variant. File: <path>
- [FORCED-COLORS] No @media (forced-colors) block detected in any CSS file.
- [COLOR-SCHEME] No color-scheme property or meta tag detected.
- [PREFERS-COLOR-SCHEME] No prefers-color-scheme query detected.

## P3 Fixes (Cosmetic)
- <cosmetic issues, if any>

## Dark Mode Rendering
<Either side-by-side screenshot references, or "Visual dark mode check skipped — preview not configured.">

## Notes
This audit is read-only. It does NOT write scores back to DESIGN.md.
To apply fixes, run the design pipeline and include dark mode decisions in DESIGN-CONTEXT.md.
Score writeback (V2-05) is deferred.
```

If a priority bucket has no issues, omit that section or write "None."

---

*Imported by: `../skills/darkmode/SKILL.md`. Maintained as part of Phase 28.5 (Bucket 2 rework — D-10).*
