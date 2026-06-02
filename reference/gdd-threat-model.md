# GDD Runtime Threat Model (STRIDE)

> Phase 33.5 · SEC-01 · STRIDE pass over GDD's **own** runtime attack surface.
> Generated against branch `phase/33-5-runtime-security`, HEAD `5374bed`.

## Scope

This document models the security posture of **GDD's own runtime** - the
multi-MCP-server, peer-CLI-spawning, WebSocket-emitting SDK that grew across
Phases 20–27 without a formalized security model. It does **NOT** model the
user code that GDD audits; the safety floor for *audited user code* is Phase
14.5's concern. This is the equivalent threat model for GDD's *own* moving
parts: the hooks that run on every session start, the two MCP servers that
read and mutate `STATE.md`, the broker that spawns peer CLIs, the WebSocket
transport that streams the event bus, and the issue-reporter that reaches the
network through `gh`.

**STRIDE** is the Microsoft threat taxonomy used throughout: **S**poofing
(pretending to be someone/something you are not), **T**ampering (unauthorized
modification of data or code), **R**epudiation (denying an action with no
audit trail), **I**nformation disclosure (leaking data to the wrong party),
**D**enial of service (exhausting a resource so legitimate use fails), and
**E**levation of privilege (gaining capabilities you were not granted).

Each of the five in-scope components below gets a fixed five-part treatment:
**Assets** (what an attacker wants), **Entry points** (the untrusted-input
boundary), **STRIDE threats** (which categories apply), **Current mitigations**
(citing **real shipped code** - file + line + behavior), and **Residual risks**
(threats current code does **not** fully cover, each routed to the Phase 33.5
plan that closes it). Out of scope per CONTEXT: rewriting the issue-reporter
network model - it is **documented** here as already-mitigated, not
re-engineered.

## Trust boundaries

The runtime crosses four trust boundaries. On the untrusted side of each sits
input that an attacker (or a compromised peer / config author / network host)
controls; the table names what crosses the line.

| Boundary | Untrusted side | What crosses |
| --- | --- | --- |
| WS event-stream server `←` client | A WebSocket client on the network (LAN/internet if bound wide) | The HTTP `Upgrade` request + `Authorization: Bearer` header |
| gdd-state MCP `←` environment / config / tool input | Whoever sets `GDD_STATE_PATH` or supplies a tool-call payload, or authors `.design/config.json` | The `GDD_STATE_PATH` env value + the JSON tool-input payloads |
| Peer-CLI broker `↔` spawned child | A spawned peer CLI (Codex / Gemini / Cursor / Copilot / Qwen) and its stdout stream | The child's stdout JSON frames + the parent env handed to the child |
| Outbound call sites `↔` external host | The remote HTTP host / GitHub / Figma the call reaches | The outbound request payload + whatever the remote returns |
| OpenRouter catalog fetch `→` openrouter.ai | The OpenRouter `/models` API host (and any MITM on the path) | The `Authorization: Bearer <OPENROUTER_API_KEY>` request header + the untrusted `/models` JSON the host returns |

The event payloads that traverse the bus (and therefore the WS transport and
any persisted JSONL) are scrubbed at serialize time - see Component 4's
`redact.cjs` mitigation, which is the cross-cutting information-disclosure
control for the whole bus.

---

## Component 1 - Hooks (SessionStart update-check + budget/context-monitor)

The hooks run automatically: `SessionStart` fires the update-check on every
session, and the budget / context-monitor hook runs on tool-use to enforce
spend and context ceilings. They execute with the user's full shell privileges
inside the user's repo, with no sandbox.

- **Assets:** The user's shell + filesystem (the hook runs as the user); the
  integrity of the budget/context accounting the monitor maintains; the
  network reachability of the update-check's outbound call.
- **Entry points:** The update-check's outbound HTTP fetch and whatever it
  parses from the response (a version string / changelog); the hook's read of
  `.design/config.json` (a malicious or malformed config is untrusted input);
  the tool-use payload the budget monitor inspects.
- **STRIDE threats:**
  - **Spoofing:** A spoofed update endpoint (DNS/MITM) could feed a forged
    "latest version" response to the update-check.
  - **Tampering:** A malformed `.design/config.json` could try to corrupt the
    budget/context accounting or flip the monitor's thresholds.
  - **Repudiation:** Hook actions are largely silent - limited audit trail of
    what a SessionStart hook did or why a budget veto fired.
  - **Information disclosure:** The update-check's User-Agent / outbound
    request reveals that GDD is in use; a verbose hook could echo env into logs.
  - **Denial of service:** A hung or slow update endpoint could stall session
    start if the fetch were unbounded.
  - **Elevation of privilege:** The hook already runs at full user privilege -
    the residual concern is a config-driven path or command injection lifting
    *attacker* input to that privilege level.
- **Current mitigations:** The update-check is **advisory** - it informs of a
  newer version and never auto-installs or executes downloaded code, so a
  spoofed version string cannot achieve code execution. The budget /
  context-monitor reads config defensively (missing file / malformed JSON /
  missing key are tolerated, mirroring the issue-reporter kill-switch's
  config-tolerance contract in `scripts/lib/issue-reporter/kill-switch.cjs`).
  Hooks emit through the event bus, which is redacted by `redact.cjs` at
  serialize time (see Component 4), so secrets in hook telemetry are scrubbed.
- **Residual risks:** The update-check's outbound egress is one of the
  cross-cutting call sites that currently has **no machine-readable allowlist
  and no CI gate** asserting it is the only network touch a hook makes →
  audited + allowlisted in **33.5-02** and gated in **33.5-04**. (The shell
  hook `hooks/update-check.sh` is `.sh`, outside the `.js`-family static
  scanner's scope, so it is **documented** in the **33.5-02** audit report
  rather than hard-gated.)

---

## Component 2 - MCP servers (gdd-state: 11 mutating tools / gdd-mcp: read)

Two MCP servers expose GDD state to an MCP client: **gdd-state**
(`sdk/mcp/gdd-state/`) with **11 mutating tools** - `add_blocker`,
`add_decision`, `add_must_have`, `checkpoint`, `frontmatter_update`, `get`,
`probe_connections`, `resolve_blocker`, `set_status`, `transition_stage`,
`update_progress` - and **gdd-mcp** (`sdk/mcp/gdd-mcp/`) with read tools. The
mutating server is the higher-value target because it writes `STATE.md`.

- **Assets:** The integrity of `STATE.md` (the project's source of truth for
  position, decisions, blockers, stage); the event stream the mutations emit;
  the filesystem region the server is allowed to write.
- **Entry points:** The `GDD_STATE_PATH` environment variable (which redirects
  *where the server reads/writes*); the JSON tool-input payloads for all 11
  mutating tools; the `.design/STATE.md` file content the server parses.
- **STRIDE threats:**
  - **Spoofing:** A tool caller could impersonate a legitimate pipeline stage
    and drive `transition_stage` / `set_status` without authorization.
  - **Tampering:** Crafted tool inputs could write hostile content into
    `STATE.md`, or `GDD_STATE_PATH` could redirect writes onto an unintended
    file (path traversal).
  - **Repudiation:** Without a complete mutation audit trail, a hostile or
    buggy mutation is hard to attribute - partly addressed by the event
    emissions below.
  - **Information disclosure:** A `get` against a traversed path could read a
    file outside the intended `.design/` boundary.
  - **Denial of service:** A JSON-bomb (deeply nested object / multi-megabyte
    string field) in a tool payload could exhaust memory/CPU during parse.
  - **Elevation of privilege:** Path traversal via `GDD_STATE_PATH` plus an
    absent boundary check effectively elevates a tool caller's reach to any
    file the process can write.
- **Current mitigations:** Every mutation emits a `state.mutation` /
  `state.transition` event through `emitStateMutation()` / `emitStateTransition()`
  (`sdk/mcp/gdd-state/tools/shared.ts` lines 91–140), giving a partial audit
  trail (anti-repudiation). Handlers **never throw to the harness** - every
  error funnels through `errorResponse()` → `toToolError()` into a structured
  `{success:false,error}` (shared.ts lines 28–31, 148–151), so a malformed
  input degrades to a clean error instead of a crash. Each of the 11 tools
  already ships a JSON input schema under `sdk/mcp/gdd-state/schemas/`. State
  events are redacted by `redact.cjs` at serialize time (Component 4).
- **Residual risks:** `resolveStatePath()` (`sdk/mcp/gdd-state/tools/shared.ts`
  lines 60–64) honors `GDD_STATE_PATH` with **no path-traversal guard** - it
  returns the override verbatim, so `..` escape / absolute-outside / symlink
  escape are unchecked. The tool schemas exist but carry **no payload-size cap**
  (no JSON-bomb guard) and are not uniformly tightened
  (`additionalProperties:false` + `maxLength`). Path traversal + JSON-bomb +
  un-tightened schemas are all closed by **33.5-03** (path-traversal guard +
  payload cap + all 11 schemas tightened).

---

## Component 3 - Peer-CLI broker (acp-client + asp-client child spawn)

The broker spawns peer CLIs over stdio: `scripts/lib/peer-cli/acp-client.cjs`
(ACP-protocol peers) and `scripts/lib/peer-cli/asp-client.cjs` (Codex
app-server protocol). Both fork a local child process and exchange
line-delimited JSON over its stdio. The child is **untrusted** - it is a
third-party CLI whose stdout the broker parses.

- **Assets:** GDD's process environment - specifically `ANTHROPIC_API_KEY`,
  `GH_TOKEN`, and any `GDD_*` / provider secret in `process.env`; the broker's
  memory/availability; the integrity of the JSON protocol exchange.
- **Entry points:** The child's **stdout** (untrusted JSON frames the broker
  must parse); the **environment handed to the child** at spawn time; the
  `opts.command` / `opts.args` the broker is asked to launch.
- **STRIDE threats:**
  - **Spoofing:** A misbehaving peer could emit forged protocol replies /
    request IDs to confuse the correlation map.
  - **Tampering:** A peer could stream malformed frames attempting to corrupt
    the broker's line-buffer / pending-request state.
  - **Repudiation:** Limited record of exactly what env a given child was
    handed at spawn.
  - **Information disclosure:** **The headline risk** - the child inherits
    GDD's full environment, so a hostile or compromised peer reads
    `ANTHROPIC_API_KEY` / `GH_TOKEN` straight out of `process.env`.
  - **Denial of service:** A peer that never emits a newline could force the
    broker to buffer unbounded stdout until memory exhaustion.
  - **Elevation of privilege:** Inherited secrets let a peer act *as GDD*
    against GDD's providers - using GDD's keys for the peer's own ends.
- **Current mitigations:** `acp-client.cjs` caps an un-terminated stdout line
  at **`MAX_LINE_BYTES = 16 * 1024 * 1024`** (16 MiB; defined line 62, enforced
  lines 166–176 - a peer that emits 16 MiB without a newline gets its active
  prompt rejected as a protocol violation). This is a real **DoS guard** on the
  untrusted stdout channel. The broker uses plain `spawn` with **no shell**
  (acp-client.cjs lines 106–113, `windowsHide: true`), avoiding shell-injection
  on the command path. Per-request correlation via a pending-id map bounds the
  protocol state machine.
- **Residual risks:** Both clients default the child's environment to the
  **full `process.env`** when `opts.env` is absent - `acp-client.cjs` line 102
  (`const env = opts.env && typeof opts.env === 'object' ? opts.env :
  process.env;`) and `asp-client.cjs` line 122 (when `opts.env` is absent no
  `spawnOptions.env` is set, so the child inherits the parent's `process.env` by
  Node default). This leaks GDD's `ANTHROPIC_API_KEY` / `GH_TOKEN` / `GDD_*` to
  every spawned peer. Closed by **33.5-04** (allowlist-forward, default-deny env
  sandbox via a shared `sanitize-env` helper applied to both clients; secrets
  are never forwarded unless explicitly allowlisted in `.design/config.json`).

---

## Component 4 - WebSocket event-stream transport (scripts/lib/transports/ws.cjs)

`scripts/lib/transports/ws.cjs` exposes the event-stream bus over WebSocket:
one JSON event per text frame, with optional replay of a tail file to each new
connection. It is an **optional dependency** (`ws`) - absent installs render an
install hint instead of starting. When running, it is a network listener.

- **Assets:** The **event stream itself** (every `state.mutation` /
  `state.transition` / pipeline event, which can carry payload detail); the
  listening socket; the Bearer token that authorizes a connection.
- **Entry points:** The HTTP **`Upgrade` request** from any client that can
  reach the bound socket, and specifically its `Authorization: Bearer <token>`
  header; the `tailFrom` replay file path.
- **STRIDE threats:**
  - **Spoofing:** A client without the token attempting to subscribe to the
    live event stream.
  - **Tampering:** N/A for inbound (the transport is push-only to clients) -
    the concern is read access, not write.
  - **Repudiation:** No per-connection identity beyond the shared token, so
    individual subscribers are not distinguishable in an audit.
  - **Information disclosure:** **The headline risk** - an unauthorized
    subscriber would receive the entire live event stream, including any
    sensitive payload detail, if it could reach the socket and pass auth.
  - **Denial of service:** Many connections / a slow consumer could pressure
    the server (mitigated in part by fire-and-forget, no-queue backpressure).
  - **Elevation of privilege:** A network-reachable listener turns a
    local-only observability feature into a remotely-reachable data source.
- **Current mitigations:** **Bearer-token auth is enforced on every upgrade**:
  `ws.cjs` lines 110–116 reject any upgrade whose header is missing or where
  the supplied token does not match the expected `Bearer` value, returning an `HTTP/1.1 401 Unauthorized` and a
  socket destroy. The token **must be ≥8 chars** - `startServer` throws a
  `TypeError` if `opts.token.length < 8` (line 74), preventing trivially weak
  tokens. Backpressure is **fire-and-forget with no queue** (lines 91–108):
  events for a non-OPEN socket are dropped, bounding memory under a slow
  consumer. Cross-cutting for the whole bus: **`redact.cjs`** deep-walks every
  event payload at serialize time (`scripts/lib/redact.cjs` - `redact()` lines
  95–116, `redactString()` lines 75–83) and scrubs **8 secret patterns** (pem,
  jwt, anthropic `sk-ant-`, stripe `sk_live_`, slack `xox[baprs]`, github_pat
  `ghp_`, aws `AKIA`, generic `sk-`), so secrets in event payloads are masked
  before they ever reach a WS subscriber or hit disk. This `redact.cjs` scrub is
  the runtime's primary information-disclosure control across **all** components
  that emit events.
- **Residual risks:**
  - The server binds to **all interfaces (`0.0.0.0`)** by default -
    `httpServer.listen(opts.port, ...)` (line 145) passes **no host argument**,
    so on a multi-homed / LAN host the token-protected stream is reachable
    off-box. The token compare uses `!==` (line 112), which is
    **timing-unsafe**. Both closed by **33.5-03** (default bind `127.0.0.1` +
    opt-in remote via `event_stream.bind_host` / `GDD_WS_BIND_HOST` + a CI gate
    that fails if the default config would bind `0.0.0.0`; upgrade the compare to
    `crypto.timingSafeEqual`).
  - `redact.cjs` is **missing three modern token formats**: Gemini / GCP
    `AIza…`, GitHub fine-grained `github_pat_…`, and GitHub server / oauth /
    user / refresh `gh[sour]_…`. A payload carrying one of these would leak
    through the scrub onto the stream and disk. Closed by **33.5-05** (add the
    three patterns + a synthetic-secret fuzz test asserting zero leak).

---

## Component 5 - Issue-reporter outbound (gh CLI only)

`scripts/lib/issue-reporter/` is the only first-party feature that intentionally
reaches the network. It assembles a bug report and submits it through the user's
**`gh` CLI**. **This network model is already mitigated and is DOCUMENTED here,
not re-engineered** (CONTEXT Out-of-scope: rewriting the issue-reporter network
model).

- **Assets:** The user's GitHub identity (via the local `gh` auth); the content
  of the submitted report (which must not carry the user's secrets or
  unintended PII); the integrity of the destination repo.
- **Entry points:** The user-invoked report flow (the body / title assembled
  from local state); the `.design/config.json` and the env that gate whether the
  reporter runs at all.
- **STRIDE threats:**
  - **Spoofing:** A forged destination could try to receive reports - mitigated
    by the frozen destination below.
  - **Tampering:** Attempting to redirect submissions to an attacker repo by
    injecting a destination override.
  - **Repudiation:** Submissions flow through `gh` under the user's identity,
    which is itself the attribution record.
  - **Information disclosure:** **The headline risk** - a report could exfiltrate
    secrets / PII embedded in local state if the payload were not scrubbed.
  - **Denial of service:** Not a meaningful vector - submission is a
    user-initiated, one-shot CLI call.
  - **Elevation of privilege:** Using the user's `gh` credentials beyond the
    single sanctioned submit.
- **Current mitigations (ALREADY shipped - documented, no change here):**
  - **Outbound is via the `gh` CLI ONLY.** `gh-submit.cjs` wraps
    `gh issue create --repo <DESTINATION_REPO> --title … --body-file …` and is
    explicit that "the user's gh CLI is the sole outbound primitive. No HTTP-S
    URL literals, no global fetch primitive, no plugin-side credentials" (D-05).
    There is no raw HTTP egress in this subtree.
  - **Frozen destination.** `destination.cjs` is an `Object.freeze`-d module -
    the single source of truth for the destination repo, with **no env-var
    lookup, no config override, no flag override**. A static CI gate asserts it
    is the only file under the report-issue tree that contains the destination
    literal, so a redirect attempt fails the build.
  - **Kill-switch (dual-surface).** `kill-switch.cjs` disables the reporter via
    **either** the env var `GDD_DISABLE_ISSUE_REPORTER === '1'` **or** the config
    `.design/config.json` `{ "issue_reporter": false }`; either surface alone is
    sufficient, and config is read tolerantly (missing file / malformed JSON /
    missing key are safe).
  - Payloads pass through privacy-diff / consent-prompt machinery before
    submission, and event telemetry is redacted by `redact.cjs` (Component 4).
- **Residual risks:** The issue-reporter's **own** network model has no residual
  this phase changes - it is intentionally documented as complete. The only
  cross-cutting residual touching it is the **lack of a machine-readable
  outbound allowlist + CI gate** that proves `gh-submit` is the sole egress in
  this subtree at a tree-wide level: closed by **33.5-02** (the canonical
  outbound-network allowlist data, which lists `scripts/lib/issue-reporter/**`
  as an allowed egress glob) and **33.5-04** (the `scan:outbound` CI gate that
  fails on any active-egress site not under an allowlisted glob).

---

## Component 6 - OpenRouter catalog fetcher (scripts/lib/openrouter/catalog-fetcher.cjs)

> Added in Phase 33.6 (OR-01, CONTEXT D-06). This is the runtime's **first
> plugin-side outbound REST client** - the issue-reporter (Component 5) reaches
> the network only through the user's `gh` CLI, and the WS transport (Component
> 4) is a *server*, not an outbound client. The catalog fetcher is the first
> first-party code to open an outbound HTTP request to a third-party host
> directly, which is why it lands only after the 33.5 audited baseline and the
> `scan:outbound` gate (33.5-04) are in place.

`scripts/lib/openrouter/catalog-fetcher.cjs` performs a read-only GET to the
OpenRouter model catalog (`https://openrouter.ai/api/v1/models`) through an
**injectable `fetchImpl`** (default global `fetch`), maps the response into the
`.design/cache/openrouter-models.json` cache shape, and writes it atomically.
The live fetch is opt-in - gated on `OPENROUTER_API_KEY` being present at
runtime; absent it, the fetcher returns cached-if-any-else-null and tier
resolution falls back to the native provider.

- **Assets:** The **`OPENROUTER_API_KEY`** (a billable provider credential) and
  the integrity of the cached catalog the tier-resolver later trusts.
- **Entry points:** The **`/models` JSON the OpenRouter host returns** (untrusted
  remote input the fetcher must parse), and the `OPENROUTER_BASE_URL` env (an
  operator-supplied endpoint override).
- **STRIDE threats:**
  - **Spoofing:** A spoofed `/models` endpoint (DNS/MITM, or a hostile
    `OPENROUTER_BASE_URL`) could feed a forged catalog.
  - **Tampering:** A malformed/oversized `/models` body could try to corrupt the
    cache the resolver reads, or smuggle unexpected fields downstream.
  - **Information disclosure:** **The headline risk** - leaking the
    `OPENROUTER_API_KEY` by persisting it to the cache, logging it, or sending it
    to an unintended host.
  - **Denial of service:** A hung or slow host could stall the fetch; a giant
    catalog could pressure memory.
  - **Elevation of privilege:** A forged catalog could steer tier resolution to
    an attacker-chosen model id.
- **Current mitigations:** The key is read from **`OPENROUTER_API_KEY` env only**,
  sent **solely** as an `Authorization: Bearer` request header, and is **never
  persisted to the cache nor written to any log seam** - the cache shape carries
  only `id`/`name`/`context_length`/`pricing`, and the mapper keeps **only** those
  fields, dropping everything else (the `/models` body is **mapped, never
  eval'd**). The cache write is **atomic** (per-pid temp + rename) into the
  **gitignored** `.design/cache/`, so a partial/corrupt fetch can't leave a
  half-written catalog and the cache never enters git history. The fetcher
  **never throws** (D-08): no key / fetch failure / parse failure all degrade to
  cached-if-any-else-null, bounding the DoS surface, and retries are **bounded**
  (max 3 attempts) on a jittered-backoff curve with `rate-guard` awareness.
  Egress is **allowlisted** via `scripts/lib/openrouter/**` in
  `scripts/security/outbound-allowlist.json` - the only sanctioned outbound site
  in that subtree - so the 33.5 `scan:outbound` gate proves no un-approved egress
  crept in. The **injectable `fetchImpl`** keeps the default `npm test` suite
  hermetic (D-07) - no live network - and there is **no new HTTP dependency**
  (global `fetch` + `sdk/primitives` only - D-10), avoiding both a new supply-chain
  surface and the gate's `axios`/`node-fetch`/`undici` package patterns.
- **Residual risks:** None this phase leaves open. The catalog is advisory data
  consumed by the tier-resolver heuristic (33.6-02), which already clamps to
  GDD's `opus`/`sonnet`/`haiku` vocabulary and supports user overrides, so a
  forged catalog cannot escalate beyond model-id selection within that bounded
  set; a future hardening could pin the OpenRouter TLS cert or sign the cache,
  but neither is required for the current trust model.

---

## Residual-risk → closing-plan map

Every residual risk identified above is routed to the Phase 33.5 plan (or
policy doc) that closes it. No residual is left unmapped. This table is the
spine the phase closeout (33.5-06) uses to prove completeness.

| Residual risk | Component | Closing plan |
| --- | --- | --- |
| WS binds `0.0.0.0` by default (`listen` line 145, no host) + timing-unsafe `!==` token compare (line 112) | WebSocket transport | **33.5-03** |
| `GDD_STATE_PATH` path traversal (no guard, shared.ts 60–64) + no payload-size cap + un-tightened tool schemas | gdd-state MCP | **33.5-03** |
| Full `process.env` (incl. `ANTHROPIC_API_KEY` / `GH_TOKEN`) leaks to spawned peers (acp 102 / asp 122) | Peer-CLI broker | **33.5-04** |
| Outbound egress sites have no machine-readable allowlist + no CI gate | cross-cutting (hooks update-check, figma-extract, issue-reporter, e2e) | **33.5-02** (allowlist) + **33.5-04** (scan gate) |
| Secret-scan misses Gemini `AIza…` / GitHub fine-grained `github_pat_…` / GitHub server `gh[sour]_…` tokens | redact.cjs | **33.5-05** |
| No published vulnerability-disclosure policy | project | **33.5-06** (SECURITY.md) |

### Already-mitigated (documented, NOT re-engineered)

| Already-mitigated surface | Component | Evidence |
| --- | --- | --- |
| Outbound via `gh` CLI only; frozen destination; dual-surface kill-switch | Issue-reporter | `gh-submit.cjs` (`gh issue create` only), `destination.cjs` (`Object.freeze`, no override), `kill-switch.cjs` (env + `.design/config.json`) |
| Bearer-token auth on every WS upgrade + ≥8-char token rule | WebSocket transport | `ws.cjs` 110–116 (401 on mismatch) + line 74 (`length < 8` → `TypeError`) |
| 16 MiB un-newlined-stdout DoS cap on untrusted peer output | Peer-CLI broker | `acp-client.cjs` `MAX_LINE_BYTES` line 62, enforced 166–176 |
| Deep-walk secret scrub of every event payload at serialize time | cross-cutting (event bus) | `redact.cjs` `redact()` 95–116 / `redactString()` 75–83, 8 patterns |
