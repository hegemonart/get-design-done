# Litmus — Connection Specification

This file is the connection specification for Litmus within the hone pipeline. It lives in `connections/` alongside other connection specs. See the connection index for the full connection capability matrix (the litmus row is added at the 34.2 closeout).

---

Litmus is the **verify stage's cross-client email render-test** for the `email` project type. It renders an email's HTML across the **top-20 email clients** (Outlook's Word engine, the various Gmail modes, Apple Mail, Yahoo/AOL, Proton, etc.) and returns per-client screenshots. Its pipeline role: after the `email-executor` generates an email (MJML source + derived HTML), the verify stage uses Litmus — **when available** — to surface per-client rendering breakage that the static validator cannot see, and narrates the result in plain English.

**Key relationship to the static validator:** Litmus is the *rendered* complement to the *static* checker `scripts/lib/email/validate-email-html.cjs`. The static validator deterministically checks constraint **classes** (table layout, inline styles, MSO comments, color-scheme — `EM-LAYOUT/STYLE/MSO/DARK`); Litmus checks **rendered pixels** across real clients. Litmus is **optional** — its absence is a quality reduction, not a blocking error (D-03).

---

## Setup

**Prerequisites:**

- A Litmus account at [litmus.com](https://www.litmus.com) — paid (a trial is available)
- API access enabled on the account (the Litmus Email Previews / Instant API), or the Litmus CLI

**Account and token:**

1. Create a Litmus account and enable API access in the account settings
2. Copy the API key / token from the account's API settings page
3. Set the environment variable — **NEVER commit the token to git or to a tracked `.env` file:**

```bash
export LITMUS_API_KEY=<your-token>
```

Add this to your shell profile or CI environment secrets. `LITMUS_API_KEY` grants access to your Litmus account (create previews, consume render quota) — treat it like a password: never commit it (not in source files, not in `.env`, not in configuration files), never log it in CI output, and rotate it if it is exposed.

**Verification:**

```bash
test -n "${LITMUS_API_KEY}" && echo "litmus token present" || echo "litmus token absent"
```

---

## Why Litmus is useful

Email rendering breakage is invisible to both code review and the static validator. An email's HTML can pass every static class-check (`validateEmailHtml` returns `ok: true`) and still render broken in a specific client: Outlook's Word engine collapses a layout that lacked a ghost table, Outlook.com inverts colors in dark mode and produces unreadable low-contrast text, the strict Gmail IMAP mode strips a `<style>` block the static heuristic tolerated, a retina image overflows on a mobile client.

The static validator checks constraint **classes**; it cannot render. Litmus renders the **actual** email across real clients and returns a screenshot per client, so per-client breakage surfaces as a visible image rather than a user report weeks later.

---

## When to use Litmus

**Verify stage:** After the `email-executor` generates the email, run Litmus — when available — to capture cross-client screenshots and check for per-client rendering breakage. The verify stage narrates the per-client delta and notes it in `DESIGN-VERIFICATION.md`.

Litmus is **not** used at generation time. The `email-executor` needs no Litmus account, no network, and no render service to produce the MJML + HTML — generation is gated by the static validator only (D-04/D-10).

---

## CLI / API Commands (Bash, not MCP tools)

Litmus is consumed via its HTTP API (or the Litmus CLI), not an MCP. All interactions are via Bash.

| Interaction | Auth | Returns | Pipeline use |
|---|---|---|---|
| Create an Email Preview (POST the HTML) | `LITMUS_API_KEY` | A preview id + per-client screenshot URLs | verify: cross-client render evidence |
| Poll the preview's client results | `LITMUS_API_KEY` | Per-client screenshot status (ready / processing) | verify: delta narration |

Write the rendered results to `.design/litmus-results.json` for the verify stage to narrate, mirroring the chromatic-results.json pattern. Exact endpoint shapes are documented at the Litmus API reference; this connection only requires the token-present probe + the degrade contract below.

---

## Availability Probe

Litmus is consumed via API/CLI — the probe is Bash-based, not ToolSearch-based.

**Step L1 — CLI/API presence:**

```bash
command -v litmus 2>/dev/null || test -n "${LITMUS_API_KEY}"
```

- A Litmus CLI is found, OR an API key is present → proceed to Step L2
- Neither → `litmus: not_configured` (skip all Litmus steps)

**Step L2 — Token check:**

```bash
test -n "${LITMUS_API_KEY}"
```

- Non-empty → `litmus: available`
- Empty → `litmus: unavailable` (no API key to authenticate render requests)

**Write litmus status to `.design/STATE.md` `<connections>` after probing.**

---

## Fallback Behavior

**verify stage:**

- `litmus: unavailable` → skip cross-client render-testing; **degrade** to the static validator `scripts/lib/email/validate-email-html.cjs` (the `EM-LAYOUT/STYLE/MSO/DARK` class-checks), then a **code-only** structural audit of the HTML; note in `DESIGN-VERIFICATION.md`: "Cross-client render-test skipped — LITMUS_API_KEY not set; verified via the static email-HTML validator + a code-only structural audit."
- `litmus: not_configured` → same as unavailable; note: "Cross-client render-test skipped — Litmus not configured; verified via the static validator + a code-only audit. (Alternative: Email-on-Acid.)"

**Graceful degradation required:** the pipeline must continue when Litmus is unavailable. Missing cross-client render data is a **quality reduction, not a blocking error** (D-03 — the email render-test is an enhancement, never hard-required, mirroring the 34.1 simulator connections). The static validator is always available and is the deterministic floor; Litmus is the rendered ceiling on top of it.

---

## STATE.md Integration

Every stage that probes Litmus writes the result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
figma: available
litmus: unavailable
</connections>
```

**Status values:**

| Value | Meaning |
|---|---|
| `available` | CLI/API reachable AND `LITMUS_API_KEY` is set |
| `unavailable` | CLI/API present but `LITMUS_API_KEY` is empty |
| `not_configured` | No Litmus CLI and no API key — Litmus not set up |

---

## Alternative render-test services

Litmus is **not** the only cross-client render-test. If you prefer a different provider, the connection's contract (probe → available/unavailable/not_configured; degrade to the static validator when absent) is identical — only the token name and endpoint change:

- **Email on Acid** — the documented primary alternative; comparable cross-client previews and an API. Swap `LITMUS_API_KEY` for the Email-on-Acid API key and keep the same degrade behavior.
- **Putsmail** / **Mailtrap** — lighter options for sending an email to your own inboxes for manual spot-checks (not full cross-client screenshot matrices, but useful when no render-test account exists).

In every case the **static validator remains the deterministic floor**; the render-test service is the optional rendered enhancement that degrades gracefully when absent.
