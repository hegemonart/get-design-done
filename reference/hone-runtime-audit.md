# GDD Runtime Static Security Audit

**Phase:** 33.5 - GDD Runtime Security Hardening · **Plan:** 33.5-02 (Wave A) · **Date:** 2026-05-31
**Reference:** branch `phase/33-5-runtime-security`
**Scope:** the SHIPPED runtime surface - `hooks/`, `scripts/`, `sdk/`, `bin/`.
**Method:** static enumeration (read-only source inspection, no execution, no network).
**Companions:**

- `scripts/security/outbound-allowlist.json` - the machine-readable, CANONICAL active-egress
  allowlist that Phase 33.5-04's `scripts/scan-outbound-network.cjs` gate `JSON.parse`s (this
  report is its human-readable rationale).
- `reference/hone-threat-model.md` - the STRIDE threat model (Phase 33.5-01).

This audit freezes the egress / secret / external-input picture so any *future* surface that is
not pre-approved trips the 33.5-04 gate at CI time. It is grounded in the CONTEXT real-tree sweep
("no raw unexpected egress found"), re-verified against HEAD by reading each cited file.

---

## Outbound-network call sites

GDD's runtime makes outbound calls (or local IPC/server binds) from exactly the sites below. Each
maps to an `outbound-allowlist.json` directory glob (see the **Allowlisted** column). The 33.5-04
gate is **ACTIVE-egress-only** - it matches `require`/`import` of `node:http(s)`/`http(s)`/`ws`/
`node-fetch`/`axios`/`undici`, `fetch(`, `http(s).get/.request(`, `new WebSocket`/`new
WebSocketServer`/`WebSocketServer(`, and child-process `spawn`/`spawnSync`/`exec*` of
`gh|curl|wget|nc|ssh|scp` - so a bare URL string alone never trips it.

| File | What it calls | Transport | Legitimacy | Allowlisted by |
| --- | --- | --- | --- | --- |
| `scripts/lib/figma-extract/pull.cjs` | `fetch` → `https://api.figma.com/v1` (read-only) | REST (global `fetch`, injectable) | User-initiated Figma extract; token from `FIGMA_TOKEN`/`FIGMA_PERSONAL_ACCESS_TOKEN`, never persisted/logged | `scripts/lib/figma-extract/**` |
| `scripts/lib/figma-extract/styles-resolver.cjs` | Figma REST styles lookup (shares `pull.cjs` fetch path) | REST | Same extract flow; read-only | `scripts/lib/figma-extract/**` |
| `scripts/lib/figma-extract/receiver.cjs` | `require('node:http')` → `http.createServer` + `server.listen(RECEIVER_PORT, RECEIVER_HOST)` | local HTTP server | **EPHEMERAL** handshake server on `127.0.0.1`; lives for one extract run then exits (timeout-armed) | `scripts/lib/figma-extract/**` |
| `scripts/lib/transports/ws.cjs` | `require('node:http')` + `new WebSocketServer({ noServer })` + `httpServer.listen(opts.port)` | WebSocket over HTTP upgrade | Event-stream transport; **hardened in 33.5-03** (127.0.0.1 default bind, Bearer token ≥8 chars → timing-safe compare) | `scripts/lib/transports/ws.cjs` |
| `scripts/lib/issue-reporter/gh-submit.cjs` | `spawn('gh', …)` / `spawnSync` | `gh` CLI spawn | Rides `gh`'s own logged-in auth; **no raw HTTP**; frozen destination + kill-switch | `scripts/lib/issue-reporter/**` |
| `scripts/lib/issue-reporter/dedup.cjs` | `spawn('gh', …)` (3 call sites) | `gh` CLI spawn | Duplicate-issue lookup before submit; same frozen destination | `scripts/lib/issue-reporter/**` |
| `scripts/lib/issue-reporter/gh-absent-fallback.cjs` | `spawnSync('gh', ['gh'], {stdio:'ignore'})` (presence probe) | `gh` CLI spawn | Detects whether `gh` is installed; no payload | `scripts/lib/issue-reporter/**` |
| `scripts/lib/peer-cli/acp-client.cjs` | `spawn(command, args, …)` (no shell) | child-process / stdio IPC | Spawns a LOCAL peer binary over stdio (JSON-RPC); **IPC, not network**; env sandboxed (33.5-04) | `scripts/lib/peer-cli/**` |
| `scripts/lib/peer-cli/asp-client.cjs` | `spawn(...)` (no shell) | child-process / stdio IPC | Local peer over stdio; same env-allowlist sandbox | `scripts/lib/peer-cli/**` |
| `scripts/e2e/run-headless.ts` | live Anthropic API run | REST (key-gated) | Test infrastructure only; gated on `ANTHROPIC_API_KEY` + main-branch; never in default `npm test` | `scripts/e2e/**` |
| `scripts/lib/authority-watcher/index.cjs` | authority-feed classification of already-fetched records | (delegated) | The live article fetch is delegated to `agents/design-authority-watcher.md`; `index.cjs` is the pure-CommonJS classifier. Allowlisted so any direct feed fetch added here stays pre-approved | `scripts/lib/authority-watcher/**` |

**Documented but NOT hard-gated** (the scanner scope is `.js`-family + active-egress only -
these cannot exfiltrate on their own and are covered by gitleaks + the threat model):

| File / surface | What it is | Why not gated |
| --- | --- | --- |
| `scripts/lib/easings.cjs` (line 6) | React-Native `Easing.js` spec link in a comment | bare URL string, no call |
| `scripts/lib/spring.cjs` (line 6) | React-Native `SpringConfig.js` spec link in a comment | bare URL string, no call |
| `scripts/lib/install/merge.cjs` (line 85) | "Plugin repository: https://github.com/hegemonart/get-design-done" printed string | bare URL string, no call |
| `scripts/lib/issue-reporter/destination.cjs` (lines 29–30) | frozen `DESTINATION_URL` / `ISSUE_TEMPLATE_URL` constants | constants consumed only via the `gh` spawn above |
| `scripts/lint-agentskills-spec.cjs` (line 76) | spec-example URL in a comment | bare URL string, no call |
| `hooks/update-check.sh` | shell update-check egress | shell script - outside the `.{js,cjs,mjs,ts}` scanner scope |
| `scripts/bootstrap.sh` | shell bootstrap egress | shell script - outside the `.{js,cjs,mjs,ts}` scanner scope |

---

## Secret-handling sites

Where a token/key/credential is read, forwarded, or scrubbed across the shipped runtime.

| File | Secret touched | Action | Risk note |
| --- | --- | --- | --- |
| `scripts/lib/redact.cjs` | PEM, JWT, Anthropic `sk-ant-`, Stripe `sk_live_`, Slack `xox*`, GitHub `ghp_`, AWS `AKIA`, generic `sk-` (8 patterns) | **scrub** | Deep-walks event-stream payloads at serialize time so everything that hits disk / a bus subscriber is `[REDACTED:<type>]`. **D-07 extends** with Gemini `AIza…`, GitHub fine-grained `github_pat_`, and GitHub `ghs_/gho_/ghu_/ghr_` (currently uncovered). |
| `scripts/lib/peer-cli/acp-client.cjs` (line 102) | full `process.env` | **forward** (default) | `const env = opts.env … : process.env` → GDD's `ANTHROPIC_API_KEY`/`GH_TOKEN`/`GDD_*` leak to a spawned peer when `opts.env` is absent. **Fixed by 33.5-04** (allowlist-forward, default-deny, shared `sanitize-env`). |
| `scripts/lib/peer-cli/asp-client.cjs` (line 122) | full `process.env` | **forward** (default) | Same default-inherit gap; same 33.5-04 fix. |
| `scripts/lib/figma-extract/pull.cjs` | `FIGMA_TOKEN` / `FIGMA_PERSONAL_ACCESS_TOKEN` | **read** | Lives only inside caller-provided `headers`; NEVER written to disk, NEVER logged (diagnostics read a short body prefix, never the token - D-10 of the figma sub-plan). |
| `scripts/lib/issue-reporter/gh-submit.cjs` / `dedup.cjs` | none held by GDD | **delegate** | Authentication is `gh`'s own logged-in credential store; GDD never reads or forwards a GitHub token for these spawns. |

---

## External-input surfaces

Where untrusted data crosses a trust boundary into GDD's runtime.

| Surface | Untrusted source | Boundary | Risk note |
| --- | --- | --- | --- |
| WebSocket upgrade request | a remote client connecting to the event-stream WS | `scripts/lib/transports/ws.cjs` HTTP `upgrade` handler | Bearer-token gate (≥8 chars) already ships; **33.5-03** adds 127.0.0.1-default bind + timing-safe compare so the default config does not expose `0.0.0.0`. |
| gdd-state MCP tool inputs | the MCP client / model | `sdk/mcp/gdd-state/tools/*.ts` (11 tools) + `tools/shared.ts` | Each tool has a JSON schema under `sdk/mcp/gdd-state/schemas/`; **33.5-08** tightens them (`additionalProperties:false` + `maxLength`) and adds a payload-size cap (JSON-bomb guard). |
| `GDD_STATE_PATH` env override | the launching environment | `sdk/mcp/gdd-state/tools/shared.ts:resolveStatePath()` (line 60–61) | `process.env['GDD_STATE_PATH'] ?? .design/STATE.md` with **no path-traversal guard** today - `..`/absolute-outside escape is unchecked. **Closed by 33.5-08** (resolve + assert within project root / `.design/`). |
| `.design/config.json` | a repo-local config file (potentially attacker-influenced in a malicious clone) | 14 modules incl. `scripts/lib/peer-cli/registry.cjs` (line 154) | Drives `peer_cli.enabled_peers` / (33.5) `peer_cli.env_allowlist`, the WS `event_stream.bind_host`, and the issue-reporter kill-switch. Parsed defensively; opt-in by design (a peer must be explicitly enabled). |
| peer child `stdout` | a spawned LOCAL peer CLI | `scripts/lib/peer-cli/acp-client.cjs` (JSON-RPC frame parser) | A malicious/buggy peer could flood stdout - **already capped at 16 MiB un-newlined** (DoS guard). JSON-RPC frames are parsed, not `eval`'d. |

---

## Finding

The legitimate active-egress set is fully enumerated above and **no raw unexpected egress was
found** - every outbound call, server bind, or child spawn maps to one of six trusted modules,
each frozen into `scripts/security/outbound-allowlist.json` with a justification. The allowlist
uses **directory globs** so a new helper in an already-trusted module (e.g. another
`figma-extract` file) does not silently trip the gate, and every glob is asserted by
`test/suite/phase-33-5-audit.test.cjs` to resolve to ≥1 real file - so the 33.5-04 gate cannot be
defeated by a stale entry that matches nothing.

The residual gaps surfaced here are **closed by the remaining Phase 33.5 plans**:

- **33.5-03** - WebSocket bind hardening: 127.0.0.1 default bind (no more `0.0.0.0`), opt-in remote
  via `event_stream.bind_host`, and a timing-safe (`crypto.timingSafeEqual`) token compare. Closes
  the WS-upgrade external-input row.
- **33.5-04** - Outbound-network static CI gate: `scripts/scan-outbound-network.cjs` +
  `npm run scan:outbound`, consuming THIS plan's `outbound-allowlist.json`. Also lands the
  peer-CLI env-allowlist sandbox (shared `sanitize-env`) that closes the `acp-client.cjs` /
  `asp-client.cjs` full-`process.env` forward rows.
- **33.5-05** (and 33.5-07/08) - secret-scan extension (Gemini + GitHub fine-grained/server
  tokens) with a synthetic-secret fuzz, the gdd-state path-traversal guard + payload cap +
  tightened schemas, `SECURITY.md`, and the regression baseline.

This report + the canonical allowlist satisfy **SEC-02** and unblock ROADMAP **SC#5** (the
outbound-network gate), as amended by **D-05** (corrected paths `reference/` + `test/suite/`) and
**D-06** (the gate mirrors the injection-scanner: a data file + a scanner that loads it).
