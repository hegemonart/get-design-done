# Xcode Simulator — Connection Specification

This file is the connection specification for the **Xcode iOS Simulator** within the get-design-done pipeline. Its role is to provide *rendered* evidence for native-iOS work: it lets the verify stage capture a SwiftUI snapshot from a booted simulator so a native screen can be audited against its design intent, the same way `connections/preview.md` provides browser screenshots for web. It is the iOS half of the native-verify connection pair (the Android half is `connections/android-emulator.md`).

**It is OPTIONAL.** Most users — and CI — have no Xcode installed. Per **D-03** this connection is **never hard-required**: when it is absent the verify stage degrades gracefully to code-only structural verification, and no blocker is raised unless a `must_have` explicitly demands rendered evidence. The `swift-executor` agent generates compilable SwiftUI **without** any simulator (D-04/D-10); the simulator only adds rendered confirmation when it happens to be available.

See `connections/preview.md` for the sibling browser-preview connection this spec mirrors. (The connection index + capability matrix is maintained separately as part of phase closeout, not by this doc.)

---

## Setup

**Prerequisites (all OPTIONAL — absence is the common, supported case):**

- **macOS** — the iOS Simulator runs only on macOS. On Linux/Windows this connection is permanently `not_configured`; that is expected and never an error.
- **Xcode** (full app, not just the Command Line Tools) — provides the Simulator runtimes.
- **`simctl`** — Apple's simulator-control CLI, available once Xcode is installed.

**Why it is optional:** GDD's default test suite and the typical design user have no Xcode. Hard-requiring a simulator would block native-iOS work for the majority of environments. The pipeline therefore treats rendered iOS evidence as an **enhancement, not a requirement** (mirroring `connections/preview.md`'s stance) — exactly the D-03 guarantee.

---

## Tools

This connection is driven by Apple's simulator CLI rather than an MCP server.

| Capability | Command (illustrative) | Returns | Pipeline use |
|------------|------------------------|---------|--------------|
| Availability check | list installed simulator devices | device list (may be empty) | **Lightweight probe** — see below |
| Boot a device | boot a named device by UDID | boot confirmation | Bring a simulator up before snapshot capture (verify stage only) |
| Capture a snapshot | screenshot the booted device | PNG image | Rendered evidence for the verify stage |
| Shut down | shut down the booted device | confirmation | Clean up after capture |

The **availability check** is preferred for probing because it does not boot a device — it only reports whether the toolchain and runtimes are present. Booting and capture happen **only** in the verify stage, **only** when a `must_have` calls for rendered evidence and the probe reported `available`.

> The default `npm test` suite **never** invokes these commands. Static validation of the native executors is hermetic (D-10) — frontmatter + reference checks only, no Xcode, no simulator, no spawn.

---

## Which Stages Use This Connection

| Stage | Skill/Agent | Purpose | Simulator required? |
|-------|------------|---------|---------------------|
| design | `agents/swift-executor.md` | Generate compilable SwiftUI views | **No** — code generation needs no simulator (D-04/D-10) |
| verify | `agents/design-verifier.md` (native-verify branch) | Rendered SwiftUI snapshot audit **when available**, else degrade | No — optional; degrades per Fallback below |

This connection feeds the **34.1-05 native-verify branch**: verify probes it at stage entry and either captures a rendered snapshot (if `available`) or follows the degrade path. The `swift-executor` (design stage) never touches it.

---

## Availability Probe

Probe **before** any boot/capture, and write the result to `.design/STATE.md` `<connections>` immediately.

```
Step P1 — toolchain check:
  detect whether Xcode + the simulator CLI are present on this machine
  → not macOS, or Xcode absent          → xcode-simulator: not_configured
  → present                             → proceed to Step P2

Step P2 — runtime/device check:
  list installed simulator devices (does NOT boot one)
  → list returns successfully (even empty)   → xcode-simulator: available
  → command errors / permission denied       → xcode-simulator: unavailable
```

**Three-value status schema** (mirrors `connections/preview.md`'s three-value model):

| Value | Meaning |
|-------|---------|
| `available` | Xcode + the simulator CLI are present and the device-list command succeeded (array, even empty). Rendered snapshots are possible. |
| `unavailable` | The toolchain is present but the device-list command errored (no runtimes installed, permission denied, internal error). Treat as no-simulator. |
| `not_configured` | Not macOS, or Xcode is not installed. The common, fully-supported case — never an error. |

Write the result to `.design/STATE.md`:

```xml
<connections>
preview: available
xcode-simulator: not_configured
</connections>
```

---

## Fallback Behavior

When `xcode-simulator` is `not_configured` or `unavailable`, the verify stage **degrades gracefully — no error is raised, no blocker is appended** (the D-03 guarantee: this connection **never hard-requires a simulator**). The degrade is a two-step ladder, exactly mirroring how `connections/preview.md` falls back when no browser is available:

1. **Snapshot-diff on a supplied screenshot** — if the brief/context provides a reference screenshot of the intended iOS screen, the verify stage diffs against that supplied image (using the Phase-23 visual primitives). No live simulator is needed.
2. **Code-only structural audit** — if no screenshot exists either, the verify stage falls back to a **code-only** audit of the generated SwiftUI: structural checks against `reference/platforms.md` (safe-area handling present, no left-edge gesture conflict, Dynamic Type styles used, no sub-11pt text) and token-bridge conformance, with **no rendered evidence**. The native screen is verified **without a simulator**.

Phase-4B-style rendered-evidence checks are marked `[SKIPPED — simulator not available]`; the verifier continues to gap analysis with partial scores. **No `<blocker>` is appended for a missing simulator** — rendered iOS evidence is an enhancement, not a requirement. The **only** exception: if a `must_have` *explicitly* requires simulator-rendered evidence, THEN (and only then) the verifier appends a blocker noting the simulator is unavailable.

---

## STATE.md Integration

Every stage that uses this connection writes its probe result to `.design/STATE.md` under `<connections>` (see schema above). The verify stage **re-probes at stage entry** rather than blindly trusting a prior status, because toolchain availability can change between sessions — however, a status already written earlier in the **same session** can be trusted for the rest of that session (mirroring `connections/preview.md`).

---

## Caveats and Pitfalls

1. **Absence is the default, not a failure.** On the vast majority of machines this connection is `not_configured`. That is the supported, expected state — the pipeline produces SwiftUI and verifies it code-only without ever touching a simulator (D-03/D-10). Never treat `not_configured` as an error or a reason to block.
2. **The probe must not boot a device.** Use the device-**list** command for probing; booting a simulator just to check availability is slow and unnecessary. Boot only in the verify stage, only when rendered evidence is actually required and the probe said `available`.
3. **Snapshots are screenshots — save by path.** A captured simulator snapshot is a full PNG. Save it to `.design/screenshots/<screen>.png` and reference it by path in markdown; do not embed base64 inline. `.design/` is gitignored, so snapshots are not committed.
4. **The default test suite never spawns a simulator.** All native-executor validation is structural and hermetic (D-10). A live simulator is exclusively the verify stage's opt-in, degraded-mode enhancement (D-03) — it is never part of `npm test`.
