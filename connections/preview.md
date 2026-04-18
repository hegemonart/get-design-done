# Claude Preview / Playwright MCP — Connection Specification

This file is the connection specification for the Claude Preview (Playwright-backed) MCP within the get-design-done pipeline. Its primary role is to provide live browser screenshots for the verify stage — replacing `? VISUAL` flags with real rendered evidence. It also powers dark-mode screenshot capture in the darkmode stage and before/after screenshot delta in the compare stage. See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

**Prerequisites:**

- None. The Preview MCP is built into the Claude Code environment — no install required, no external package dependency.

**Verification:**

After session start, run:

```
ToolSearch({ query: "Claude_Preview", max_results: 5 })
```

Expect non-empty results listing `mcp__Claude_Preview__*` tools. If results are empty, the Preview MCP is not loaded in this session — all Preview steps will be skipped and visual checks will remain as `? VISUAL` static analysis only.

**Warning — naming confusion:**

This spec targets ONLY the built-in Claude Preview MCP. It uses the `mcp__Claude_Preview__` prefix (capital C, capital P). Do NOT confuse with any external Playwright npm packages (`@playwright/test`, `playwright-chromium`, etc.) or with `mcp__computer-use__*` screenshot tools. This spec covers ONLY `mcp__Claude_Preview__*` tools. Other Playwright-related packages cannot be invoked via the MCP protocol.

---

## Tools

All tools use the `mcp__Claude_Preview__` prefix.

| Tool shortname | Full name | Returns | Pipeline use |
|---------------|-----------|---------|--------------|
| `preview_list` | `mcp__Claude_Preview__preview_list` | Array of running preview sessions (may be empty) | **Lightweight probe** — used as the availability check; does not start a browser |
| `preview_start` | `mcp__Claude_Preview__preview_start` | Preview session object with URL | Start a new preview server; used in compare stage interaction mode |
| `preview_stop` | `mcp__Claude_Preview__preview_stop` | Confirmation of stop | Stop a preview server; used at end of compare stage |
| `preview_navigate` | `mcp__Claude_Preview__preview_navigate` | Navigation confirmation | Navigate to a route URL before screenshot; used in verify, compare, darkmode |
| `preview_screenshot` | `mcp__Claude_Preview__preview_screenshot` | Base64-encoded PNG image | **Primary verify workhorse** — captures rendered page screenshot; save to `.design/screenshots/<route>.png` by path, do NOT embed base64 inline |
| `preview_eval` | `mcp__Claude_Preview__preview_eval` | JS return value | **Dark mode injection tool** — inject `document.documentElement.classList.add('dark')` or project-specific toggle; also used for focus-visible checks |
| `preview_snapshot` | `mcp__Claude_Preview__preview_snapshot` | Accessibility tree (Aria roles, labels, focus state) | Used in Phase 4B for focus-visible heuristic check |
| `preview_inspect` | `mcp__Claude_Preview__preview_inspect` | Computed styles, bounding box for an element | Used in Phase 4B for visual rhythm / spacing verification |
| `preview_click` | `mcp__Claude_Preview__preview_click` | Click confirmation | Interaction mode: trigger UI state before screenshot |
| `preview_fill` | `mcp__Claude_Preview__preview_fill` | Fill confirmation | Interaction mode: populate form fields before screenshot |
| `preview_console_logs` | `mcp__Claude_Preview__preview_console_logs` | Array of console log entries | Diagnostic — capture JS errors during screenshot capture |
| `preview_logs` | `mcp__Claude_Preview__preview_logs` | Server-side log entries | Diagnostic — server logs during dev server operation |
| `preview_network` | `mcp__Claude_Preview__preview_network` | Network request/response log | Diagnostic — identify failed asset loads affecting screenshot |
| `preview_resize` | `mcp__Claude_Preview__preview_resize` | Resize confirmation | Set viewport dimensions (e.g., mobile 375px, desktop 1280px) |

`preview_list` is preferred for probing because it returns the current session list without starting a new browser context. `preview_screenshot` is the primary workhorse for the verify and compare stages. `preview_eval` is the dedicated dark-mode injection tool.

---

## Which Stages Use This Connection

| Stage | Skill/Agent | Tools used | Purpose |
|-------|------------|------------|---------|
| verify | `skills/verify/SKILL.md` + `agents/design-verifier.md` | `preview_navigate`, `preview_screenshot`, `preview_eval`, `preview_snapshot`, `preview_inspect` | Per-route screenshots for `? VISUAL` heuristics (H-02, H-06, H-07); dark mode parity via `preview_eval`; focus-visible via `preview_snapshot` |
| compare | `skills/compare/SKILL.md` | `preview_start`, `preview_navigate`, `preview_screenshot`, `preview_stop` | Before/after screenshot delta in COMPARE-REPORT.md |
| darkmode | `skills/darkmode/SKILL.md` | `preview_navigate`, `preview_eval`, `preview_screenshot` | Forced dark-mode screenshots for DARKMODE-AUDIT.md `## Dark Mode Rendering` section |

---

## Availability Probe

**Call ToolSearch first — always.** In Claude Code sessions with many MCP servers, `mcp__Claude_Preview__*` tools may be in the deferred tool set (not loaded into context at session start). Calling a deferred tool directly fails silently or errors. ToolSearch loads the tools into context and confirms their presence in a single call.

**Preview probe sequence:**

```
Step P1 — ToolSearch check:
  ToolSearch({ query: "Claude_Preview", max_results: 5 })
  → Empty result      → preview: not_configured  (skip all Preview steps)
  → Non-empty result  → proceed to Step P2

Step P2 — Live tool call:
  call mcp__Claude_Preview__preview_list
  → Success (returns array, even empty)  → preview: available
  → Error                                → preview: unavailable
```

Write the result to `.design/STATE.md <connections>` immediately after probing.

**Two operating modes:**

**Screenshot mode** (primary — used in verify and darkmode):
1. `preview_navigate` to route URL (e.g., `http://localhost:3000/dashboard`)
2. `preview_screenshot` → returns base64 PNG
3. Save to `.design/screenshots/<route>.png` — reference by path in markdown
4. Repeat per route

**Interaction mode** (used in compare):
1. `preview_start` → returns session URL (if no server already running)
2. `preview_navigate` to route URL
3. `preview_click` / `preview_fill` to reach desired UI state
4. `preview_screenshot` → save to path
5. `preview_stop` when done

---

## Fallback Behavior

When preview is `not_configured` or `unavailable`, stages degrade gracefully — no error is raised.

**verify stage (`skills/verify/SKILL.md` + `agents/design-verifier.md`):**

- Skip Phase 4B screenshot evidence loop entirely
- Keep existing `? VISUAL` static analysis path for H-02, H-06, H-07 heuristics
- Mark all Phase 4B checks: `[SKIPPED — browser not available]`
- Design-verifier continues to Phase 5 gap analysis with partial scores

**compare stage (`skills/compare/SKILL.md`):**

- Omit `## Screenshot Delta` section from COMPARE-REPORT.md
- Emit exactly: `Screenshot delta skipped — preview not configured.` in the Notes section
- All text-based delta sections (Score Delta, Anti-Pattern Delta, Must-Have Status, Design Drift) are unaffected

**darkmode stage (`skills/darkmode/SKILL.md`):**

- Omit `## Dark Mode Rendering` section from DARKMODE-AUDIT.md
- Emit: `Visual dark mode check skipped — preview not configured.` in the Notes section
- All static architecture detection, contrast audit, and token override checks are unaffected

Neither stage appends a `<blocker>` for a missing Preview connection — Preview is an enhancement, not a requirement. If a `must_have` explicitly requires browser-rendered evidence, THEN append a blocker.

---

## STATE.md Integration

Every stage writes its probe result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
figma: available
refero: not_configured
preview: available
</connections>
```

**Status values:**

| Value | Meaning |
|-------|---------|
| `available` | `preview_list` returned a successful response (array, even empty) |
| `unavailable` | Tool is in the session but errored (no running server, tool timeout, internal error) |
| `not_configured` | ToolSearch returned empty for `Claude_Preview` — MCP not registered in this session |

**Which stages probe vs. read:**

- **scan** — probes at pipeline entry; writes initial status to STATE.md `<connections>`
- **verify** — probes at stage entry (re-confirm; tool availability can change between sessions)
- **compare** — probes at stage entry
- **darkmode** — probes at stage entry

Downstream stages (verify, compare, darkmode) re-probe rather than blindly reading STATE.md because MCP availability can change between sessions. However, if STATE.md already contains a `preview:` status from a prior stage in the SAME session, that status can be trusted for the rest of that session.

---

## Caveats and Pitfalls

1. **`preview_screenshot` returns base64 — save by path.** The tool returns a full base64-encoded PNG. Embedding multiple screenshots inline in DESIGN-VERIFICATION.md or COMPARE-REPORT.md creates 500KB+ files that are unreadable and slow. **Always save to `.design/screenshots/<route>.png` and reference via file path in markdown. Only embed base64 for one critical single-image check at most.**

2. **`preview_list` is the correct probe tool.** It returns the list of current preview sessions without starting a new browser context. Using `preview_start` as a probe would spin up a browser unnecessarily. Use `preview_list` always for probing.

3. **Dark mode injection — check the project's actual toggle mechanism.** The default injection `document.documentElement.classList.add('dark')` works for Tailwind dark mode and most class-based toggles. However, some projects use `setAttribute('data-theme', 'dark')`, `classList.add('theme-dark')`, or CSS `prefers-color-scheme` media queries only (where JS injection has no effect). **Before injecting, check DESIGN-CONTEXT.md D-XX decisions to confirm the project's dark mode mechanism.** Alternatives:
   - Tailwind: `document.documentElement.classList.add('dark')`
   - data-theme: `document.documentElement.setAttribute('data-theme', 'dark')`
   - Custom class: `document.documentElement.classList.add('theme-dark')`
   - Media query only: `preview_eval` cannot force this; use `preview_resize` or check if a system media override is available

4. **`preview_start` may require a running dev server.** If the project has no dev server running, `preview_list` may return an empty array — that is `preview: available` (not unavailable). The empty array means the MCP is functional but no sessions are running. The verify stage should attempt `preview_navigate` to `http://localhost:3000` (or project-configured port) and handle 404 / connection-refused gracefully — if navigation fails, update STATE.md to `preview: unavailable` for this session and fall back to static analysis.

5. **`.design/screenshots/` should be gitignored.** Screenshots may contain rendered UI with sensitive data (user info, internal tools). The `.design/` directory is already gitignored in get-design-done projects (see Phase 1). Confirm `.gitignore` includes `.design/` before saving screenshots.
