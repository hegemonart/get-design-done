# Lottie — Connection Specification

This file is the connection specification for the Lottie motion-export check within the get-design-done pipeline. It lives in `connections/` alongside the other connection specs (the closest analog is `connections/print-renderer.md`, the verify-stage rendered-proof connection for the `print` project type). See the connection index for the full connection capability matrix (the Lottie row is added at the 36.2 Wave-B wiring plan).

---

Lottie is a JSON animation format (Bodymovin / lottie-web). This connection is the **verify stage's motion check for Lottie exports** — the animation analog of the print-render. Its pipeline role: after a design exports a Lottie `*.json` bundle, the verify stage runs the **pure static validator** to surface structural and perf problems the JSON carries (bad frame rate, zero-length duration, layer/asset bloat, oversized bundle), and — **when a live player is configured** — renders actual playback to catch what the JSON alone cannot show. It narrates the result in plain English in `DESIGN-VERIFICATION.md`. It is consumed at verify time by the `motion-verifier` agent.

**Key relationship to the static validator:** the live Lottie player is the *rendered* complement to the *static* validator `scripts/lib/motion/validate-motion.cjs`. The static validator deterministically parses the Lottie JSON (zero dependencies) and checks constraint **classes** via `validateLottie(json, {bytes, budgetBytes})` — returning `{ok, warnings:[{rule,detail}], info}` with rules `MO-PARSE` (not valid JSON / not a Lottie document) / `MO-FR` (frame rate outside the sane 1-120 range) / `MO-DUR` (non-positive duration, `op <= ip`) / `MO-LAYERS` (layer count high, runtime cost) / `MO-IMG` (embedded raster `data:` assets bloat the bundle) / `MO-BUDGET` (bundle exceeds the KB cap, shared with `motionBudget`). A live player checks the **rendered output** — what actually plays. The player is **optional** — its absence is a quality reduction, not a blocking error (D-02).

---

## Setup

**Prerequisites:**

- **STATIC FLOOR — the pure validator (always available):** `scripts/lib/motion/validate-motion.cjs` is pure and dependency-free (D-01) — zero `require`, no Lottie runtime, deterministic (hermetic tests). It needs **no player and no network**. It parses the Lottie JSON and emits the `MO-*` warnings. This is the floor and it is always present.
- **OPTIONAL — a live Lottie player (opt-in, maintainer-supplied):** to render *actual playback*, a player is needed — `lottie-web` driven in headless Chrome, or `@lottiefiles/lottie-player`. This is opt-in; like the print-render, prefer a no-external-package path where possible, and where a player IS needed it is supplied by the maintainer in the verify stage — never installed by the pipeline.

Per **D-01** there is **NO bundled `lottie-web` / `@lottiefiles/*` dependency** and **no live playback in the default `npm test`** — the pure validator carries the whole hermetic test surface. A live player is an optional, opt-in enhancement the maintainer wires up in the verify stage when one is present.

**Verification:**

```bash
node -e "require('./scripts/lib/motion/validate-motion.cjs').validateLottie" 2>/dev/null && echo "static validator OK"
```

---

## Why the Lottie check is useful

Motion breakage is largely invisible to code review, and rendered breakage is invisible to the static validator. A Lottie bundle can be well-formed JSON and still ship problems: a frame rate of `0` or `240` (the `MO-FR` band is 1-120), a zero-length or reversed timeline (`op <= ip`, `MO-DUR`), hundreds of layers that tank runtime on low-end devices (`MO-LAYERS`), or a 4MB bundle because a designer baked full-resolution PNGs into the JSON as inline `data:` URIs (`MO-IMG` + `MO-BUDGET`). The static validator catches all of these deterministically, from the JSON alone, with no player.

The static validator checks constraint **classes**; it cannot play the animation. A live player renders the **actual** timeline, so playback-only defects — an expression that throws at runtime, a mask that clips wrong, a marker that never fires — surface as observable output rather than a broken animation shipped to production.

---

## When to use the Lottie check

**Verify stage:** After a design exports a Lottie `*.json`, run the static validator `validateLottie(json, {bytes, budgetBytes})` — always — to surface the `MO-*` warnings, and run a live player **when available** to capture rendered playback. The verify stage narrates the delta and notes it in `DESIGN-VERIFICATION.md`.

The Lottie check is **not** used at generation time. Exporting or hand-authoring a Lottie JSON needs no player, no `lottie-web` runtime, and no network — the pure validator runs anywhere Node runs.

---

## Availability Probe

The Lottie connection is discovered by a **file-based** probe (NOT ToolSearch): look for Lottie export artifacts and/or a player dependency.

**Step LO1 — Lottie artifact / player presence:**

```bash
# (a) any JSON files at all?
find . -name "*.json" -not -path "*/node_modules/*" | head

# (b) does one carry the Lottie signature — top-level v, fr, and a layers[] array?
node -e 'const j=require(process.argv[1]); process.exit(j&&typeof j==="object"&&"v" in j&&"fr" in j&&Array.isArray(j.layers)?0:1)' ./path/to/export.json && echo "Lottie export found"

# (c) is a player declared as a dependency?
grep -E '"(lottie-web|@lottiefiles/[^"]+|lottie-react)"' package.json
```

- A Lottie export (signature match) OR a player dependency is found → proceed to Step LO2
- Neither a Lottie artifact nor a player → `lottie: not_configured` (skip all Lottie steps; nothing to verify)

**Step LO2 — player capability check:**

- A Lottie export is present (or a player is declared) and verification can proceed → `lottie: available` (the static validator alone is enough to be `available` — it is the floor)
- A player is declared but errors when invoked (missing headless Chrome, broken `@lottiefiles/*` install) → `lottie: unavailable` (fall back to the static validator)

**Write the Lottie status to `.design/STATE.md` `<connections>` immediately after probing** — the three-value schema the other connections use (`available` / `unavailable` / `not_configured`).

---

## Fallback Behavior

When the Lottie player is `not_configured` or `unavailable`, the verify stage degrades gracefully — no error is raised.

**verify stage (the `motion-verifier` agent):**

- `lottie: unavailable` → skip rendered playback; **degrade** to the pure validator `scripts/lib/motion/validate-motion.cjs` (the `MO-PARSE/FR/DUR/LAYERS/IMG/BUDGET` warnings), then a **code-only** review of the Lottie JSON structure; note in `DESIGN-VERIFICATION.md`: "Lottie playback skipped — no live player; verified via the static motion validator + a code-only review."
- `lottie: not_configured` → same as unavailable; note: "Lottie playback skipped — no player configured; verified via the static validator + a code-only review. (A live player — lottie-web in headless Chrome / @lottiefiles/lottie-player — is an opt-in enhancement.)"

**Graceful degradation required:** the pipeline must continue when the player is unavailable. Missing rendered-playback data is a **quality reduction, not a blocking error** (D-02 — motion is creative, not contractually broken; the player is an enhancement, never hard-required). The pure validator is always available and is the deterministic floor; the live player is the rendered ceiling on top of it.

**WARN, never block (D-02):** every motion finding — every `MO-*` warning and every playback observation — is recorded as a **warning** in `DESIGN-VERIFICATION.md`, **never** a `<blocker>`. The motion-verifier does NOT append a blocker for a missing Lottie connection or for any `MO-*` warning. The single exception: if a `must_have` explicitly requires motion verification, THEN — and only then — an unmet motion requirement may escalate to a blocker.

---

## STATE.md Integration

Every stage that probes the Lottie connection writes the result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
figma: available
preview: available
lottie: not_configured
</connections>
```

**Status values:**

| Value | Meaning |
|---|---|
| `available` | A Lottie export is present (or a player is declared) and verification can proceed — the static validator alone satisfies this |
| `unavailable` | A player is declared but the playback call errored (no headless Chrome, broken `@lottiefiles/*` install) — degrade to the static validator |
| `not_configured` | No Lottie artifacts and no player dependency — there is nothing to verify |

The verify stage re-probes at stage entry (exports and player availability can change between sessions). If STATE.md already carries a `lottie:` status from a prior stage in the SAME session, that status can be trusted for the rest of that session.

---

## Caveats and Pitfalls

1. **The live player is an enhancement, not a requirement.** Its absence degrades to the static validator + a code-only review and never blocks the pipeline (D-02). Do not gate a motion export on rendered playback.

2. **Every motion finding is a warning.** Motion is creative, not contractually broken (D-02). A `MO-FR` / `MO-LAYERS` / `MO-IMG` warning informs the designer; it does not fail the build. Only an explicit `must_have` for motion verification can escalate a finding to a blocker.

3. **The budget is a shared, configurable cap.** `MO-BUDGET` fires only when the caller passes `opts.bytes` (the on-disk size); the cap is `opts.budgetBytes` or the 200 KB `DEFAULT_BUDGET_BYTES` fallback (D-05, when config carries no `motion_budget_kb`). `motionBudget(bytes, budgetBytes)` is shared by the Lottie and Rive paths — keep the unit math (KB = bytes / 1024) consistent.

4. **The signature gate is strict.** `validateLottie` only proceeds when the JSON has top-level `v`, `fr`, AND a `layers[]` array; anything else returns a single `MO-PARSE` warning ("not a Lottie document"). The file probe must use the same three-key signature so the connection does not misfire on unrelated `*.json` files.

5. **No bundled player dependency.** Do NOT add `lottie-web` / `@lottiefiles/*` / `lottie-react` to `package.json` to make this connection work — the player is opt-in and the maintainer supplies it. The default `npm test` stays hermetic and runs only the pure validator (D-01).

6. **Do NOT edit the connection index here.** The Lottie connection's Active-Connections entry and Capability-Matrix row are added by the 36.2 Wave-B wiring plan, not by this spec (the disjointness pattern `print-renderer.md` uses).
