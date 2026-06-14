# Android Emulator — Connection Specification

This file is the connection specification for the **Android emulator** within the hone pipeline. Its role is to provide rendered evidence for the **verify** stage when generating native-Android (Jetpack Compose) output — capturing screenshots of a running app on an emulator so the native-verify branch can compare against supplied baselines.

It is the Android sibling of `connections/xcode-simulator.md` (iOS). Both mirror the `connections/preview.md` template (Setup / Tools / Probe / three-value status / Fallback). Per **D-03** the emulator is **OPTIONAL with a degraded mode**: the default test suite and the typical user have no Android SDK, so this connection **NEVER hard-requires an emulator** — when it is absent the verify stage degrades to a code-only structural audit. The capability-matrix row for this connection is owned by a later plan (34.1-06); this file is the standalone spec.

---

## Setup

**Prerequisites (ALL OPTIONAL — most users and CI have none):**

- The **Android SDK** (`ANDROID_HOME` / `ANDROID_SDK_ROOT` set), which provides:
  - `adb` (Android Debug Bridge) on `PATH` — talks to a running device/emulator.
  - `emulator` on `PATH` — launches an Android Virtual Device (AVD).
- At least one configured **AVD** (created via `avdmanager` / Android Studio).

**There is no install step performed by the pipeline.** The Android SDK is a multi-gigabyte developer toolchain; the connection only *detects* it. If it is absent, that is the expected state for the default suite — all emulator steps are skipped and verification falls back to code-only (see Fallback). Never auto-install the SDK and never edit shell-rc files to add it.

---

## Tools

This connection is **CLI-based** (not an MCP). Detection and capture use the Android SDK command-line tools:

| Tool | Use |
|------|-----|
| `adb devices` | **Lightweight probe** — lists attached devices/emulators; the availability check (does NOT launch anything) |
| `adb -s <serial> exec-out screencap -p` | **Capture workhorse** — grabs a PNG screenshot of the running emulator; save to `.design/screenshots/<route>.png` by path, do NOT embed base64 inline |
| `emulator -list-avds` | Enumerate configured AVDs (used to decide whether an emulator *could* be started) |
| `emulator -avd <name>` | Start an AVD (interaction mode only — never required for code generation) |

`adb devices` is preferred for probing because it returns the current device list without starting an emulator. `screencap` is the capture workhorse for the verify stage.

---

## Availability Probe

The probe is a lightweight, read-only check — it must NOT launch an emulator. Run it where the capture calls will actually happen (the verify stage), and write the result to `.design/STATE.md <connections>` immediately.

```
Step P1 — toolchain check:
  is `adb` resolvable on PATH (and ANDROID_HOME / ANDROID_SDK_ROOT set)?
  → No   → android-emulator: not_configured   (no Android SDK — the default/typical state; skip all emulator steps)
  → Yes  → proceed to Step P2

Step P2 — device check (lightweight, no launch):
  run `adb devices` and parse the device list
  → at least one `emulator-*` / device line in state `device`  → android-emulator: available
  → adb present but the list is empty (no emulator running)     → android-emulator: unavailable
  → adb errors (server won't start, timeout)                    → android-emulator: unavailable
```

**Three-value status schema** (mirrors `connections/preview.md`):

| Value | Meaning |
|-------|---------|
| `available` | `adb devices` lists at least one running emulator/device — rendered capture is possible |
| `unavailable` | The Android SDK / `adb` is present but no emulator is currently running (or `adb` errored) — degrade for this session |
| `not_configured` | No Android SDK detected (`adb` not on PATH) — the default state for most users + CI; degrade |

---

## Fallback Behavior (THE D-03 GUARANTEE)

When `android-emulator` is `unavailable` or `not_configured`, the verify stage **degrades gracefully — no error is raised, no blocker is appended**. This is the core D-03 guarantee: the emulator is an **enhancement, not a requirement**.

The degrade ladder (most → least evidence), mirroring the native-verify branch:

1. **Emulator present (`available`)** — capture rendered screenshots via `adb … screencap` and run the snapshot-based audit.
2. **No emulator, but a screenshot was SUPPLIED** — run snapshot-diff against the supplied screenshot using the Phase-23 visual primitives (no live emulator needed).
3. **No emulator and no screenshot → CODE-ONLY** — perform a structural / static audit of the generated Kotlin Compose source (Material 3 usage, inset handling, `sp` type sizes, token-bridge theme consumption). This is the default path on a machine **without an emulator**.

The verify stage marks the skipped rendered checks `[SKIPPED — emulator not available]` and continues with partial scores. It does **NOT** append a `<blocker>` for a missing emulator. **Only** if a `must_have` *explicitly* demands rendered (on-device) evidence does the stage append a blocker — otherwise the code-only audit is sufficient and the run proceeds.

---

## Which Stages Use This Connection

| Stage | Skill/Agent | Purpose |
|-------|------------|---------|
| design | `agents/compose-executor.md` | **Code generation — emulator NOT required.** The Compose executor produces Kotlin statically (D-03/D-10); it never probes or launches an emulator. |
| verify | `agents/design-verifier.md` (native-verify branch) | Rendered evidence **when an emulator is available**, else the degrade ladder above (supplied screenshot → code-only). This connection feeds the 34.1-05 native-verify adaptation. |

---

## STATE.md Integration

Every probing stage writes its result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
preview: available
android-emulator: not_configured
</connections>
```

The verify stage re-probes at stage entry (emulator availability can change between sessions); if a prior stage in the SAME session already wrote an `android-emulator:` status, that value can be trusted for the rest of that session.

---

## Caveats and Pitfalls

1. **`screencap` returns a PNG — save by path.** Save captures to `.design/screenshots/<route>.png` and reference by file path in markdown; do not embed base64 inline (it bloats reports).
2. **`.design/screenshots/` is gitignored.** The `.design/` directory is already gitignored in hone projects; confirm before saving captures.
3. **The probe must never launch an emulator.** Use `adb devices` (and at most `emulator -list-avds`) for detection. Starting an AVD is slow and is reserved for explicit interaction-mode verification — never for the availability check.
4. **`not_configured` is the normal default, not an error.** No Android SDK simply means code-only verification (D-03). Treat it as expected, not as a failure.
