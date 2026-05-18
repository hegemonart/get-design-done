---
name: health-mcp-detection
type: heuristic
version: 1.0.0
phase: 28.5
tags: [health, mcp, detection, gdd-mcp, registration-nudge]
last_updated: 2026-05-18
---

# Health MCP-Registration Detection Procedure

Extracted from `skills/health/SKILL.md` per Phase 28.5 D-10 (extract-then-link, never delete content).
This file documents the canonical procedure for inspecting whether `gdd-mcp` (Phase 27.7+) is
registered with any installed harness and rendering a one-line status row after the health
table. The procedure is non-blocking by design: any failure path renders `unknown` rather
than crashing the skill.

## Dismissal check

1. Read `.design/config.json` (if present). Parse JSON inside a try/catch.
2. If `config.mcp_nudge === false`, SKIP this step entirely (render nothing).
3. On parse failure: default to `mcp_nudge=true` (show the row) — fail-safe per threat T-27.7-04-05.

## Detection

1. Read `.claude/settings.local.json` (or equivalent harness settings file) and inspect its `mcpServers` object — alternatively run `claude mcp list` / `codex mcp list` if a CLI is available (see fallback below).
2. Preferred invocation via the install-lib: call `detectMcpRegistration()` from `scripts/lib/install/mcp-register.cjs`. Returns `{harnesses: [{harness, present, registered}], summary}`.

## Row rendering

Based on the detection result, render exactly ONE of these row strings:

- When `claude` and `codex` both present + both registered:
  `MCP server: registered with claude+codex`
- When only one harness is present and registered:
  `MCP server: registered with claude` (or `MCP server: registered with codex`)
- When at least one harness is present but `gdd-mcp` is NOT in its registered list:
  `MCP server: not registered  (run: npx @hegemonart/get-design-done --register-mcp; dismiss: .design/config.json#mcp_nudge=false)`
- When neither harness CLI is found on PATH:
  `MCP server: unknown (claude/codex CLI not found)`

## Fallback (if `mcp-register.cjs` not yet shipped)

Skip this step silently with status `MCP server: unknown`. This step is non-blocking — failures here MUST NOT crash the SKILL.
