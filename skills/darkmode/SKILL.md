---
name: get-design-done:darkmode
description: "Audit a project's dark mode implementation — detects architecture (CSS custom props, Tailwind `dark:` prefix, or JS class toggle), runs architecture-specific contrast / token-override / anti-pattern / meta-property checks, and writes a prioritized fix list to `.design/DARKMODE-AUDIT.md`. Use when the user wants to verify dark mode quality without re-running the full design pipeline. Read-only — no score writeback to `DESIGN.md`."
argument-hint: ""
user-invocable: true
---

# get-design-done:darkmode — Dark Mode Audit

Standalone dark mode audit. Detects the project's dark mode architecture, runs architecture-specific checks across contrast, token completeness, anti-patterns, and meta properties, then writes a prioritized fix list to `.design/DARKMODE-AUDIT.md`.

For the full step-by-step methodology (architecture-detection greps, WCAG contrast formula, anti-pattern grep snippets, meta-property checks, screenshot capture, and `DARKMODE-AUDIT.md` template), see `./darkmode-audit-procedure.md`. For the perceptual-contrast layer (APCA / WCAG 3 draft) sitting on top of WCAG 2.1 ratios, see `../../reference/contrast-advanced.md`. For OKLCH-based dark token-pair generation, see `../../reference/color-theory.md` §OKLCH. For the cross-skill output discipline + connection-probe pattern, see `../../reference/shared-preamble.md#output-contract-reminders` and `../../reference/shared-preamble.md#connection-handshake-summary`.

---

## Scope

This command is a **standalone audit** — not a pipeline stage:

- Does NOT update `DESIGN.md` scores (V2-05 deferred — two-sources-of-truth risk).
- Does NOT invoke `design-auditor` (Pitfall 4 — darkmode runs its own inline audit, separate from the `DESIGN-AUDIT.md` pipeline).
- Does NOT write to `.design/STATE.md`, `DESIGN-CONTEXT.md`, `DESIGN-PLAN.md`, `DESIGN-SUMMARY.md`, or `DESIGN-VERIFICATION.md`.
- Writes exactly ONE artifact: `.design/DARKMODE-AUDIT.md`.
- Does NOT execute fixes — audit-only per V2-07 deferral (fixes belong in the design pipeline's color task).

Output artifact prefix `DARKMODE-AUDIT` is distinct from the pipeline namespace (`DESIGN-*.md`). No naming conflict.

---

## Pre-Flight

Confirm source root exists. Try in order: `src/` (preferred), `app/` (Next.js App Router), `lib/` (libraries), `pages/` (Next.js Pages Router). Set `SRC_ROOT` to the first that exists. If none exist, abort: `"No source directory detected. Run /get-design-done scan first."`

Confirm `.design/` exists (create if absent: `mkdir -p .design/`).

Probe `preview` connection per `../../reference/shared-preamble.md#connection-handshake-summary` (ToolSearch → `mcp__Claude_Preview__preview_list` → STATE.md write). Result drives Step 5B (visual dark mode rendering).

---

## Workflow

1. **Architecture Detection (DARK-02)** — run three greps (CSS custom props / Tailwind `dark:` / JS class toggle), classify primary architecture or `Hybrid` or `None`. If `None`, abort. Detail: `./darkmode-audit-procedure.md#step-1-architecture-detection-dark-02`.
2. **Contrast Audit (DARK-03)** — extract dark-context token pairs for the detected architecture, compute WCAG 2.1 ratios, flag failures at 4.5:1 (body) / 3:1 (large text + UI boundaries). Cross-check with APCA from `../../reference/contrast-advanced.md` for thin / large / colored text. Detail: `./darkmode-audit-procedure.md#step-2-contrast-audit-dark-03`.
3. **Token Override Completeness (DARK-04)** — every light-mode color token must have a dark-mode override. Flag missing overrides → P1. Detail: `./darkmode-audit-procedure.md#step-3-token-override-completeness-dark-04`.
4. **Dark-Specific Anti-Patterns (DARK-05)** — Images/SVGs without dark variant (P2), pure-black backgrounds in dark context = BAN-05 (P1), missing `@media (forced-colors)` (P2). Detail: `./darkmode-audit-procedure.md#step-4-dark-specific-anti-patterns-dark-05`.
5. **Meta Property Check (DARK-06)** — `color-scheme` property + `prefers-color-scheme` query. Each absent → P2. Detail: `./darkmode-audit-procedure.md#step-5-meta-property-check-dark-06`.
6. **Visual Rendering (preview: available only)** — capture light/dark screenshot pair to `.design/screenshots/darkmode/{light,dark}.png`. Detail: `./darkmode-audit-procedure.md#step-5b-dark-mode-rendering-screenshots-when-preview-available`.
7. **Write `.design/DARKMODE-AUDIT.md`** — group flagged issues by priority (P0 → P1 → P2 → P3). Full template at `./darkmode-audit-procedure.md#step-6-darkmode-auditmd-template`.

---

## Constraints

This command MUST NOT (per `../../reference/shared-preamble.md#output-contract-reminders`):

- Write to `DESIGN.md`, `DESIGN-SUMMARY.md`, `DESIGN-VERIFICATION.md`, `DESIGN-CONTEXT.md`, or `.design/STATE.md`.
- Invoke `design-auditor` (Pitfall 4 — this is a separate audit with its own inline checks).
- Execute any fixes — audit-only (V2-07 deferred).
- Write scores back to `DESIGN.md` (V2-05 deferred — two-sources-of-truth risk).
- Add rows to `DESIGN.md` or append to pipeline-owned artifacts.

MUST write exactly one output file: `.design/DARKMODE-AUDIT.md`.

---

## Completion

After writing the audit, print:

```
Dark mode audit complete. Architecture: <X>. Fixes: P0=<N>, P1=<M>, P2=<K>, P3=<J>. See .design/DARKMODE-AUDIT.md.
```

Do not summarize individual issues in the completion message — the file contains the full detail.

## DARKMODE AUDIT COMPLETE
