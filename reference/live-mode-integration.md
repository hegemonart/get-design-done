---
name: live-mode-integration
type: meta-rules
version: 1.0.0
phase: 47
tags: [live, preview-mcp, hot-swap, session, bandit, scope-guard, degraded-mode]
last_updated: 2026-06-03
---

# Live Mode Integration

This file is the meta-rules companion to the `gdd-live` skill (`scripts/skill-templates/live/SKILL.md`). It describes how `/gdd:live` turns a running dev server into a live design surface: the user picks a DOM element, the agent generates N variants in one batch, the variants hot-swap in place, the user accepts or discards, and the whole session persists. For the SKILL.md structural contract (line cap, description budget, frontmatter), see `./skill-authoring-contract.md`. The variants themselves are grounded in the Phase 45 domain indexes (`./spatial.md`, `./interaction.md`, `./color.md`, `./typography.md`, `./motion.md`).

There is NO bundled browser automation. The skill drives the Claude Preview MCP at runtime; the modules under `scripts/lib/live/` are pure and dependency-free.

## The live loop

The loop is seven stages, each owned by one module under `scripts/lib/live/`:

1. BOOT. Probe the Preview MCP (see below), resolve the harness live mode, and detect the dev server (Vite, Next, Bun, or static). Open or create the session.
2. INJECT. Read `RUNTIME_JS` from `scripts/lib/live/runtime.cjs` and evaluate it in the page via `preview_eval`. The runtime is an idempotent IIFE on `window.__gddLive`; re-injecting after a navigation rebinds the same singleton.
3. PICK. The runtime arms a one-shot click handler. The clicked element is reported back as `{selector, tagName, classList, boundingRect, computedStyle subset, variant}` (the `pickReportShape` contract). The selector strategy prefers id, then a data-testid, then a tag plus class plus nth-of-type path.
4. GENERATE. Load the matching domain index first, then generate all N variants (default 3) in ONE batch. Each variant is written atomically to its source file and made live, either through HMR or through the runtime swap helper.
5. POST-CHECK. Each variant runs through `scripts/lib/live/postcheck.cjs`, which invokes `gdd-detect`. Findings show inline. A finding flags a variant; it never auto-rejects it.
6. ACCEPT or DISCARD. Accept applies the chosen variant as the canonical source edit, reverts the others, and feeds the bandit. Discard reverts everything and leaves the source untouched.
7. PERSIST. Every stage is written to the session file as it happens.

## The Preview MCP surface

Live mode drives the built-in Claude Preview MCP, the same connection documented in `../connections/preview.md`. The tools it uses:

- `preview_list` and `ToolSearch` for the availability probe.
- `preview_eval` to inject `RUNTIME_JS` and to read the pick report back.
- `preview_inspect` and `preview_click` to confirm the picked element and read its computed styles.
- `preview_navigate` to move between routes (the runtime re-inject is idempotent across navigations).
- `preview_screenshot` for evidence, and as the only output in degraded mode.

The `data-gdd-variant` attribute is the hot-swap marker. The runtime stamps `data-gdd-variant="N"` on the picked element when it applies variant N, and reads it back to know which variant is live.

## The six live events

Live mode emits six telemetry event types through `scripts/lib/live/events.cjs` onto the standard `.design/telemetry/events.jsonl` stream:

| Event | Emitted when |
|---|---|
| `live_boot` | A session opens (BOOT completes). |
| `live_pick` | The user picks an element. |
| `live_generate` | A batch of N variants is generated. |
| `live_postcheck` | A variant clears or trips its post-check. |
| `live_accept` | The user accepts a variant. |
| `live_discard` | The user discards the batch. |

These telemetry events are distinct from the on-disk session log. The session file records the four lifecycle kinds (`pick`, `generate`, `accept`, `discard`); the telemetry stream carries the six `live_*` types above.

## The session file

`scripts/lib/live/session-store.cjs` owns one JSON document per session at `.design/live-sessions/<session-id>.json`, conforming to `./schemas/live-session.schema.json`. It carries `{schema_version, session_id, status, started_at, ended_at, url, dev_server, events[]}`. `status` is one of `in_progress`, `completed`, or `abandoned`; only an `in_progress` session is resumable. Writes are atomic (write to a temp file, then rename), so an interrupted step never leaves a half-written session.

On `--resume <session-id>`, the skill loads the named session and offers two choices: continue from the last recorded event, or start fresh. It never silently replays completed events.

## The bandit dev-time feed

When the user accepts a variant, `scripts/lib/live/bandit-feed.cjs` feeds that outcome to the design-variants bandit described in `./design-variants.md`. This is a dev-time signal: it records which design pattern the developer chose during live iteration. It is advisory and separate from the user-outcome A/B loop and from the routing bandit. The user always wins; the bandit only learns.

## Degraded mode

Live mode is gated on `capability_matrix.mcp_support` in `scripts/lib/manifest/harnesses.json`. `scripts/lib/live/harness-mode.cjs` projects each harness onto a mode: `liveModeFor(harnessId)` returns `puppeteer` (full live mode) when `mcp_support` is true, and `degraded` otherwise. `degradedHarnesses()` lists every screenshot-only harness.

In degraded mode there is no Preview MCP, so there is no runtime injection and no hot-swap. The skill states this up front, then generates variants against the file the user names and captures static screenshots for comparison. Degraded mode never errors; it is a documented fallback.

## Scope guard

`scripts/lib/live/scope-guard.cjs` maps the picked selector to its owning source files and rejects any write that falls outside them. A variant that would need a change beyond that scope (a shared token, a parent layout, a new dependency) stops the loop and surfaces the decision to the user, rather than silently widening the blast radius. The guard is the hard boundary on what live mode may edit.

## See also

- `./skill-authoring-contract.md` for the SKILL.md authoring rules.
- `./design-variants.md` for the bandit the accept step feeds.
- `../connections/preview.md` for the full Preview MCP connection spec.
- The Phase 45 domain indexes (`./spatial.md`, `./interaction.md`, `./color.md`, `./typography.md`, `./motion.md`) the generate step loads.
