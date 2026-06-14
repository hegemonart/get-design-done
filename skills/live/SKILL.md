---
name: hone-live
description: "Live in-browser design mode. The user picks a DOM element on a running dev server (via the Claude Preview MCP), the agent generates N design variants in one batch, they hot-swap in place through HMR or preview_eval using a data-gdd-variant marker, the user accepts or discards, and the whole pick-generate-accept loop persists to .design/live-sessions so it survives a crash or resume. Use when the user wants to iterate on the look of a live component against a real running server, asks to try variants on a page, or runs the live command with a url; falls back to a screenshot-only degraded mode on harnesses without MCP support. Activates for requests involving in-browser design iteration, picking an element on a dev server, or generating variants with hot-swap."
argument-hint: "[--variants N] [--resume <session-id>] [url]"
tools: Read, Write, Edit, Bash, Glob, Grep, Task
user-invocable: true
---

# gdd-live - Live In-Browser Design Mode

Pick a DOM element on a running dev server, generate competing design variants, hot-swap them in place, and accept the winner as a real source edit. Every step persists to `.design/live-sessions/<id>.json` so the session survives a crash or a later resume.

The browser-side runtime, the harness-mode gate, the session store, the events feed, the post-check, the scope guard, and the bandit feed are all separate modules under `scripts/lib/live/`. This skill describes the loop and names the module that owns each step; it does not import them.

For the full surface (the Preview MCP tools, the six `live_*` events, the session file, the bandit feed, degraded mode, the scope guard), see `../../reference/live-mode-integration.md`. For the SKILL.md structural contract, see `../../reference/skill-authoring-contract.md`.

---

## Arguments

- `[url]` - the page to drive. Optional. When omitted, detect the dev server and use its root.
- `--variants N` - how many variants to generate per pick. Default 3.
- `--resume <session-id>` - reattach to an in-progress session in `.design/live-sessions/`.

---

## BOOT

1. Probe the Preview MCP per `../../connections/preview.md`: `ToolSearch({ query: "Claude_Preview" })`, then `mcp__Claude_Preview__preview_list`. Empty ToolSearch means the MCP is not loaded.
2. Resolve the harness live mode. The capability signal is `capability_matrix.mcp_support` in `scripts/lib/manifest/harnesses.json`, projected by `scripts/lib/live/harness-mode.cjs` (`liveModeFor(harnessId)`). A `puppeteer` result means full live mode; a `degraded` result means screenshot-only.
3. If `mcp_support` is false for this harness, or Preview is unavailable, enter DEGRADED mode and say so plainly: variants are generated and captured as static screenshots, with no in-page hot-swap. Skip the INJECT and PICK steps; generate against the file the user names instead.
4. Detect the dev server. Look for Vite, Next, Bun, or a static server (check `package.json` scripts plus a `preview_list` entry). Record the server descriptor on the session.
5. Open or create the session via `scripts/lib/live/session-store.cjs` (`.design/live-sessions/<id>.json`). On `--resume`, load the named session (see RESUME).

---

## INJECT

Inject the browser runtime once. Read `RUNTIME_JS` from `scripts/lib/live/runtime.cjs` and evaluate it in the page with `mcp__Claude_Preview__preview_eval`. The runtime is an idempotent IIFE bound to `window.__gddLive`, so a re-inject after navigation rebinds the same singleton rather than stacking listeners. It installs the pick handler and the variant-swap helpers, and stamps the live variant on the element via the `data-gdd-variant` attribute.

---

## PICK

1. Arm the picker (`window.__gddLive.pick()`), then guide the user to click the target element. Use `preview_click` and `preview_inspect` to confirm the element and read its computed styles and bounding box.
2. Read the pick report back. Its fields are documented in `pickReportShape` (selector, tagName, classList, boundingRect, computedStyle subset, current variant). The selector strategy prefers id, then a data-testid, then a tag plus class plus nth-of-type path.
3. Emit a `live_pick` event through `scripts/lib/live/events.cjs` and append a `pick` entry to the session.

---

## GENERATE (one batch)

1. Load the relevant Phase 45 canonical reference index FIRST, so variants are grounded in real guidance: the domain index that matches the picked element (for example `../../reference/spatial.md` for layout, `../../reference/interaction.md` for components and a11y, `../../reference/color.md` for color, `../../reference/typography.md` for type, `../../reference/motion.md` for animation).
2. Generate all N variants in ONE batch (default 3), each a distinct, hypothesis-tagged design direction for the picked element. Do not generate them one at a time.
3. For each variant: write the change atomically to the implicated source file, then make it live. With HMR running, the file write is enough; otherwise apply the variant in place with `window.__gddLive.swapVariant({ n, style, html })`, which sets `data-gdd-variant="n"` and applies the variant's style or markup.

---

## POST-CHECK

Run the post-check on each variant via `scripts/lib/live/postcheck.cjs`, which invokes `gdd-detect`. Show the findings inline next to each variant. A variant that trips a finding is flagged, NOT auto-rejected: the user still decides. Append a `live_postcheck` event per variant.

---

## ACCEPT / DISCARD

- ACCEPT one variant: apply the chosen variant as the canonical source edit, and revert the others in the page (`window.__gddLive.revert()` on each non-chosen element). Emit a `live_accept` event and feed the outcome to the design-variants bandit via `scripts/lib/live/bandit-feed.cjs` (a dev-time signal). Append an `accept` entry.
- DISCARD: revert every variant in the page back to its captured original and leave the source untouched. Emit a `live_discard` event and append a `discard` entry.

Either way, persist the result through `scripts/lib/live/session-store.cjs` before continuing.

---

## PERSIST

Every step (boot, pick, generate, post-check, accept, discard) is written to the session file through `scripts/lib/live/session-store.cjs` as it happens. The on-disk event log uses the `pick`, `generate`, `accept`, `discard` kinds; the telemetry stream uses the six `live_*` event types. Writes are atomic, so an interrupted step never leaves a half-written session.

---

## RESUME

With `--resume <session-id>`, load the named session from `.design/live-sessions/`. Only an `in_progress` session is resumable. Offer the user two choices: continue from the last recorded event (report what that was, for example "last pick was the primary button"), or start fresh (open a new session and leave the old one intact). Never silently replay completed events.

---

## SCOPE GUARD

Never write outside the source files implicated by the picked element. Run every proposed write through `scripts/lib/live/scope-guard.cjs`, which maps the picked selector to its owning source files and rejects edits that fall outside them. If a variant would need a change beyond that scope (a shared token, a parent layout, a new dependency), stop and surface it to the user rather than widening the blast radius.

## Constraints

- Do NOT edit files outside the picked element's implicated sources (enforced by the scope guard).
- Do NOT generate variants one at a time; generate the full batch, then swap.
- Do NOT auto-reject a variant on a post-check finding; flag it and let the user decide.
- In DEGRADED mode, state up front that hot-swap is unavailable and fall back to screenshots.
- Persist before every user-facing prompt so a crash never loses accepted work.

## LIVE COMPLETE
