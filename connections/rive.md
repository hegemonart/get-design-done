# Rive — Connection Specification

This file is the connection specification for the Rive motion-export check within the hone pipeline. It lives in `connections/` alongside the other connection specs (the closest analog is [`connections/print-renderer.md`](print-renderer.md), the verify-stage RENDERED proof for the `print` project type, and its sibling `connections/lottie.md` covers the JSON-vector motion format). See the connection index for the full connection capability matrix (the Rive row is added at the 36.2 Wave-B wiring plan).

---

Rive is the **verify stage's motion check for Rive exports** — interactive animations Rive ships as **binary `.riv` files** that bundle **state machines** (states, transitions, inputs) rather than a linear timeline. Its pipeline role: after a design surface produces a `.riv` artifact, the verify stage uses this connection — **when the Rive runtime is available** — to enumerate the file's state machines and surface graph hazards the static floor cannot see (unreachable states, loops with no exit transition), and narrates the result in plain English. It is consumed at verify time by the `motion-verifier` agent.

**Key relationship to the static floor:** `.riv` is a **binary** format, so **pure JavaScript cannot parse the state-machine graph** without the Rive runtime. The static floor in `scripts/lib/motion/validate-motion.cjs` is therefore deliberately narrow — it provides [`riveHeader(headerBytes)`](../scripts/lib/motion/validate-motion.cjs) (a cheap magic-byte sanity check: every `.riv` file begins with the ASCII magic `RIVE`) and `motionBudget(bytes, budgetBytes)` (the shared KB-cap perf-budget check that also backs the Lottie path, rule `MO-BUDGET`). The **deep state-machine validation** the ROADMAP wants — no unreachable states, every loop has an exit transition — lives *above* that floor and needs the Rive runtime. This connection is the **runtime ceiling** on top of the deterministic header+budget floor; its absence is a quality reduction, not a blocking error (D-04).

---

## Setup

**Prerequisites:**

- **PRIMARY — the Rive runtime:** `@rive-app/canvas`, `@rive-app/react-canvas`, or the Rive CLI. When present, the runtime loads the `.riv` file, enumerates its state machines + inputs, and lets the agent walk the transition graph to check reachability and exit conditions. No bundled dependency is required to *probe*; the runtime is opt-in — prefer a built-in / no-external-package path where possible, and where the runtime IS needed it is maintainer-supplied (never installed by the pipeline).
- **ALTERNATIVE — header + budget floor only:** where no Rive runtime is available, `scripts/lib/motion/validate-motion.cjs` still runs `riveHeader` (magic-byte sanity) and `motionBudget` (the KB cap) on the raw bytes. This is the documented pure-JS path and needs no dependency at all.

Per **D-01** there is **NO bundled `@rive-app/*` (or `rive-react` / Rive CLI) dependency** and **no live state-machine walk in the default `npm test`** — the deep graph check is an optional, opt-in enhancement the maintainer wires up in the verify stage when the Rive runtime is present. The header+budget floor stays hermetic and dependency-free (D-06).

**Verification:**

```bash
node -e "require('@rive-app/canvas')" 2>/dev/null && echo "rive-runtime ok" || command -v rive 2>/dev/null
```

---

## Why Rive is useful

State-machine breakage is invisible to both code review and the binary header floor. A `.riv` file can pass `riveHeader` (correct magic), sit comfortably under the `motionBudget` KB cap, and still ship broken: a state nobody can transition into (an **unreachable state** — dead art that never plays), or a loop of transitions with **no exit condition** (the machine spins forever and the input that should release it was never wired). Neither hazard is a malformed file, so a magic-byte + size check cannot catch them — they are properties of the *transition graph*, and the graph is locked inside the binary.

The header floor checks that the bytes are a plausible `.riv` and fit the budget; it cannot read the graph. With the Rive runtime present, this connection loads the actual file, enumerates state machines and inputs, and walks transitions so unreachable states and exit-less loops surface as a verify-time warning rather than a frozen or never-firing animation in production.

---

## When to use Rive

**Verify stage:** After a design surface produces a `.riv` artifact, run this connection — when the Rive runtime is available — to enumerate state machines + inputs and check that every state is reachable and every loop has an exit transition. The verify stage narrates the delta and notes it in `DESIGN-VERIFICATION.md`.

This connection is **not** used at generation time. Producing or hand-editing a `.riv` needs no runtime from the pipeline, and the header+budget floor never gates generation — generation stays runtime-free (D-01/D-06). The deep graph walk is strictly a verify-time enhancement.

---

## Availability Probe

Rive is discovered by a **file-based** check (NOT ToolSearch): is there a `.riv` artifact to verify, and/or is the Rive runtime installed to verify it with?

**Step RV1 — Rive artifact / runtime presence:**

```bash
find . -name "*.riv" -not -path "*/node_modules/*" 2>/dev/null | head -1
grep -qE '"(@rive-app/[a-z-]+|rive-react)"' package.json 2>/dev/null && echo "rive-dep" || true
```

- A `.riv` file is found OR a `@rive-app/*` / `rive-react` dependency is declared → proceed to Step RV2
- Neither a `.riv` artifact nor a Rive dependency → `rive: not_configured` (skip all Rive steps)

**Step RV2 — runtime capability check:**

```bash
node -e "require('@rive-app/canvas')" 2>/dev/null && echo "runtime ok" || command -v rive 2>/dev/null
```

- The Rive runtime (`@rive-app/*`) or the Rive CLI loads and can enumerate state machines → `rive: available`
- A runtime is present but errors on load / cannot read the file (version mismatch, corrupt `.riv`, sandbox) → `rive: unavailable`
- A `.riv` exists but no runtime at all → `rive: available` for the **floor only** (header + budget run; the deep graph walk degrades to the manual-review advisory below)

**Write the Rive status to `.design/STATE.md` `<connections>` immediately after probing** — the three-value schema the other connections use (`available` / `unavailable` / `not_configured`).

---

## Fallback Behavior

When Rive is `not_configured`, or `unavailable`, or a `.riv` exists with no runtime, the verify stage degrades gracefully — no error is raised.

**verify stage (`motion-verifier` agent):**

- **No runtime (`.riv` present, runtime absent)** → skip the state-machine walk; **degrade** to the static floor in `scripts/lib/motion/validate-motion.cjs` — `riveHeader` (magic-byte sanity) + `motionBudget` (the KB cap) — then emit a documented **manual-review advisory**; note in `DESIGN-VERIFICATION.md`: "Rive state-machine check skipped — no Rive runtime; verified `.riv` header + size budget only. Manual review: open the file in the Rive editor / runtime and confirm every state is reachable and every loop has an exit transition."
- `rive: unavailable` (runtime present but errored) → same degrade to header + budget + the manual-review advisory; note: "Rive runtime present but failed to load the file — verified header + budget only; confirm reachability and loop-exit manually in the Rive editor."
- `rive: not_configured` (no `.riv`, no dependency) → skip the connection entirely; note: "No Rive artifacts — Rive motion check not applicable."

**Graceful degradation required:** the pipeline must continue when the Rive runtime is unavailable. Missing state-machine data is a **quality reduction, not a blocking error** (D-04 — the deep graph walk is an enhancement, never hard-required, mirroring the print-renderer / Lottie connections). The header+budget floor is always available and is the deterministic floor; the runtime walk is the ceiling on top of it. The verify stage does **not** append a `<blocker>` for a missing Rive runtime. If a `must_have` explicitly requires verified state-machine reachability, THEN append a blocker.

---

## STATE.md Integration

Every stage that probes Rive writes the result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
figma: available
preview: available
rive: not_configured
</connections>
```

**Status values:**

| Value | Meaning |
|---|---|
| `available` | A `.riv` artifact or the Rive runtime is found (runtime → deep walk; floor-only → header + budget) |
| `unavailable` | A Rive runtime is present but errored loading the file (version mismatch, corrupt `.riv`, sandbox) |
| `not_configured` | No `.riv` artifacts and no `@rive-app/*` / `rive-react` dependency — Rive is not set up |

The verify stage re-probes at stage entry (runtime availability and the presence of `.riv` artifacts can change between sessions). If STATE.md already carries a `rive:` status from a prior stage in the SAME session, that status can be trusted for the rest of that session.

---

## Caveats and Pitfalls

1. **The deep state-machine walk is an enhancement, not a requirement.** Its absence degrades to `riveHeader` + `motionBudget` + a manual-review advisory and never blocks the pipeline (D-04). Do not gate a Rive build on a verified transition graph.

2. **`.riv` is binary — pure JS cannot read the graph (D-04).** `riveHeader` confirms only the `RIVE` magic bytes; it says nothing about states, transitions, or inputs. Reachability and loop-exit checks are *graph* properties locked inside the binary and require the Rive runtime. Never imply the header check validated the state machine — be honest in `DESIGN-VERIFICATION.md` about which tier ran.

3. **WARN, never block (D-02).** Unreachable states, exit-less loops, and over-budget bundles are **warnings**, never a `<blocker>` — motion is creative, not contractually broken. The `motion-verifier` records them as advisories; only a `must_have` requiring verified reachability escalates one to a blocker.

4. **No bundled runtime.** Do NOT add `@rive-app/canvas`, `@rive-app/react-canvas`, `rive-react`, or the Rive CLI to `package.json` to make this connection work — the runtime is opt-in and the maintainer supplies it. The default `npm test` stays hermetic and runtime-free (D-01/D-06).

5. **Do NOT edit the connection index here.** Rive's Active-Connections row and Capability-Matrix entry are added by the 36.2 Wave-B wiring plan, not by this spec.
