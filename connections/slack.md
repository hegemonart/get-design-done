# Slack — Connection Specification

This file is the connection specification for Slack within the get-design-done pipeline. It lives in `connections/` alongside other connection specs. See `connections/connections.md` for the full connection index and capability matrix (the slack row is added at the 35.2 closeout).

---

Slack is a **notification surface** for the Team Surfaces layer. GDD routes pipeline events (verify-fail, audit-pass, ship) to a Slack channel via an **Incoming Webhook**, so a non-GDD-running teammate gets alerted where they already watch. Outbound only; every message body is redacted; delivery degrades to a noop when unconfigured or disabled.

---

## Setup

**Prerequisites:** a Slack **Incoming Webhook** URL (Slack app → Incoming Webhooks → Add New Webhook to Workspace → pick a channel → copy the `https://hooks.slack.com/services/...` URL).

**Token (env, never committed):**

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/XXX/YYY/ZZZ"
```

The webhook URL is a credential (anyone with it can post to your channel) — never commit it (not in source, not in `.env`, not in config), never log it, rotate if exposed. GDD reads it from env only.

**Verification:**

```bash
test -n "${SLACK_WEBHOOK_URL}" && echo "slack webhook present" || echo "slack webhook absent"
```

---

## What GDD sends

The notify dispatcher (`scripts/lib/notify/dispatch.cjs`) posts a routed, **redacted** message for pipeline events. Default routing (`reference/notification-routing.md`, overridable in `.design/config.json#notifications`):

| Event | Default behavior |
|---|---|
| `verify_fail` | post to the critical channel (the configured Slack webhook) |
| `audit_pass` | post to the digest channel |
| `ship` | post to the digest channel (PR URL + top-line audit) |

Slack payload shape: `{ "text": "<redacted summary>" }`. No blocks/attachments in v1.

## Redaction (mandatory)

Every message body passes through `scripts/lib/redact.cjs` before the POST — secrets/API keys/tokens are stripped (11 patterns). The dispatcher is the single egress chokepoint; no notify path bypasses redact (asserted by `test/suite/notify-privacy-guard.test.cjs`).

## Kill-switch

Slack delivery is a noop when **either** `GDD_DISABLE_SLACK=1` (env) **or** `.design/config.json` has `"notifications": { "slack": { "enabled": false } }`. `gsd-health` surfaces the state (mirrors Phase 30 / 35.1).

## Availability probe (env-based, no MCP)

```bash
test -n "${SLACK_WEBHOOK_URL}"
```

- Non-empty AND not disabled → `slack: available`
- Empty → `slack: not_configured`
- Present but a POST errored at send time → `slack: unavailable`

Write `slack` status to `.design/STATE.md` `<connections>` after probing.

## Degrade-to-noop

Missing `SLACK_WEBHOOK_URL`, kill-switch on, or a POST failure → that channel is skipped (no error); the pipeline never blocks on notification delivery (D-03). The dispatcher returns `{ channel: "slack", status: "skipped"|"sent"|"error" }` and never throws.

## STATE.md integration

```xml
<connections>
slack: not_configured
</connections>
```

| Value | Meaning |
|---|---|
| `available` | `SLACK_WEBHOOK_URL` set AND not disabled |
| `unavailable` | URL present but a send errored |
| `not_configured` | no `SLACK_WEBHOOK_URL` |

## Outbound + dispatcher

The actual POST is `scripts/lib/notify/dispatch.cjs` (POSTs via an injectable `fetchImpl`, defaulting to global `fetch`; **no `@slack/*` dependency**). It is allowlisted under the Phase-33.5 outbound gate (`scripts/security/outbound-allowlist.json` → `scripts/lib/notify/**`). Discord is the parity surface (`connections/discord.md`); the contract is identical, only the payload field differs (`text` vs `content`).
