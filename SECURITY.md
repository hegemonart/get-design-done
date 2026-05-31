# Security Policy

get-design-done (GDD) is a development workflow toolkit with a runtime that runs
local hooks, spawns peer CLIs, exposes MCP servers, and can emit an event stream
over a WebSocket transport. A STRIDE threat model of that runtime lives at
[`reference/gdd-threat-model.md`](reference/gdd-threat-model.md); the static audit
that backs it is at [`reference/gdd-runtime-audit.md`](reference/gdd-runtime-audit.md).

## Supported versions

Security fixes land on the latest minor of the current major. The project ships on
a single active line; older majors are not back-patched.

| Version | Supported          |
| ------- | ------------------ |
| 1.33.x  | :white_check_mark: |
| < 1.33  | :x:                |

If you are on an older release, upgrade to the latest `1.33.x` to receive security
fixes.

## Reporting a vulnerability

**Report security vulnerabilities privately through GitHub security advisories — not
through a public issue.**

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability** (this opens a private GitHub Security Advisory,
   visible only to you and the maintainer).
3. Include: a description of the issue, the affected version, reproduction steps, and
   the impact you observed (for example, what a malicious peer CLI, MCP tool input, or
   WebSocket client could reach).

Please do **not**:

- Open a public GitHub issue for a vulnerability (it discloses the flaw before a fix
  exists).
- Send the report by email. This project does **not** publish a security contact email;
  the private GitHub advisory flow above is the only intended channel.

This is a solo-maintained, best-effort project. Expect an acknowledgement on a
best-effort basis once the advisory is seen; there is no commercial SLA. Coordinated
disclosure is appreciated — please give the maintainer a reasonable window to ship a
fix before any public write-up.

## What is in scope

The hardened runtime surfaces this policy covers (see the threat model for detail):

- The MCP servers under `sdk/mcp/` (notably the `gdd-state` mutating tools).
- The peer-CLI broker (`scripts/lib/peer-cli/`) that spawns third-party CLIs.
- The WebSocket event-stream transport (`scripts/lib/transports/ws.cjs`).
- The session hooks under `hooks/`.
- The issue-reporter outbound path (`scripts/lib/issue-reporter/`).

Out of scope: vulnerabilities in *user code that GDD audits* (that is the audited
project's responsibility), and issues in third-party dependencies that should be
reported upstream.

## Maintainer note — enable private vulnerability reporting

GitHub's **"Report a vulnerability"** button only appears once **private vulnerability
reporting** is turned on for the repository. That is a one-line repository **setting**,
not a file in this repo:

> **Settings → Code security → Private vulnerability reporting → Enable**

This `SECURITY.md` documents the policy, but the maintainer must flip that toggle once
for the private-advisory flow above to be available. (Tracked here so the setting is not
forgotten — it is intentionally not a code change.)
