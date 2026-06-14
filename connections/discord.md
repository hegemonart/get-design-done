# Discord — Connection Specification

This file is the connection specification for Discord within the hone pipeline. It lives in `connections/` alongside other connection specs. See `connections/connections.md` for the full connection index and capability matrix (the discord row is added at the 35.2 closeout).

---

Discord is a **notification surface** for the Team Surfaces layer — the parity of `connections/slack.md`. GDD routes pipeline events (verify-fail, audit-pass, ship) to a Discord channel via a **channel Webhook**. Outbound only; every body is redacted; delivery degrades to a noop when unconfigured or disabled. The contract is identical to Slack — only the webhook host and the payload field (`content` vs Slack's `text`) differ.

---

## Setup

**Prerequisites:** a Discord **channel Webhook** URL (Channel → Edit → Integrations → Webhooks → New Webhook → Copy Webhook URL → `https://discord.com/api/webhooks/...`).

**Token (env, never committed):**

```bash
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/XXX/YYY"
```

The webhook URL is a credential — never commit it, never log it, rotate if exposed. GDD reads it from env only.

**Verification:**

```bash
test -n "${DISCORD_WEBHOOK_URL}" && echo "discord webhook present" || echo "discord webhook absent"
```

---

## What GDD sends

The notify dispatcher (`scripts/lib/notify/dispatch.cjs`) posts a routed, **redacted** message for pipeline events, using the same routing as Slack (`reference/notification-routing.md`, overridable in `.design/config.json#notifications`): `verify_fail` → critical, `audit_pass`/`ship` → digest.

Discord payload shape: `{ "content": "<redacted summary>" }` (Discord's field is `content`, not Slack's `text`). No embeds in v1.

## Redaction (mandatory)

Every body passes through `scripts/lib/redact.cjs` before the POST (the single egress chokepoint; asserted by `test/suite/notify-privacy-guard.test.cjs`).

## Kill-switch

Noop when **either** `GDD_DISABLE_DISCORD=1` (env) **or** `.design/config.json` `"notifications": { "discord": { "enabled": false } }`. `gsd-health` surfaces it.

## Availability probe (env-based, no MCP)

```bash
test -n "${DISCORD_WEBHOOK_URL}"
```

- Non-empty AND not disabled → `discord: available`
- Empty → `discord: not_configured`
- Present but a POST errored → `discord: unavailable`

Write `discord` status to `.design/STATE.md` `<connections>`.

## Degrade-to-noop

Missing `DISCORD_WEBHOOK_URL`, kill-switch on, or a POST failure → skipped (no error); the pipeline never blocks (D-03). The dispatcher returns `{ channel: "discord", status: "skipped"|"sent"|"error" }` and never throws.

## STATE.md integration

```xml
<connections>
discord: not_configured
</connections>
```

| Value | Meaning |
|---|---|
| `available` | `DISCORD_WEBHOOK_URL` set AND not disabled |
| `unavailable` | URL present but a send errored |
| `not_configured` | no `DISCORD_WEBHOOK_URL` |

## Outbound + dispatcher

The POST is `scripts/lib/notify/dispatch.cjs` (injectable `fetchImpl` default global `fetch`; **no `discord.js` dependency**), allowlisted under the Phase-33.5 outbound gate (`scripts/lib/notify/**`). Slack is the sibling surface (`connections/slack.md`) with the identical contract.
