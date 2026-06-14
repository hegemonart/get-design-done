# Notification Routing - the event→channel contract for `scripts/lib/notify/dispatch.cjs`

How GDD routes pipeline events to the Team-Surfaces notification channels (Slack + Discord), redacts every outbound body, and degrades to a noop when a channel is unconfigured or disabled. Consumed by `scripts/lib/notify/dispatch.cjs`; the channel specs are `connections/slack.md` + `connections/discord.md`.

---

## Default routing

Event type → channels (overridable via `.design/config.json#notifications.routing`):

| Event | Meaning | Default channels |
|---|---|---|
| `verify_fail` | a verify must-have failed | slack + discord (the "critical" surface) |
| `audit_pass` | an audit cleared the quality floor | slack + discord (the "digest" surface) |
| `ship` | a PR was created (`/hone:ship`) | slack + discord (digest - PR URL + top-line audit) |

A user narrows or splits this in `.design/config.json`:

```json
{
  "notifications": {
    "routing": { "verify_fail": ["slack"], "audit_pass": ["discord"], "ship": ["slack", "discord"] },
    "slack":   { "enabled": true },
    "discord": { "enabled": false }
  }
}
```

Unlisted event types route to nothing (no notification). Unknown channels are skipped.

## Redaction (mandatory - the single chokepoint)

`dispatch(event)` builds the outbound body as `redact(summary + "\n" + details)` using `scripts/lib/redact.cjs` (11 secret/token patterns, Phase 22 + 33.5) **before** any POST. There is exactly one egress chokepoint; no notify path constructs an un-redacted outbound body. The static test `test/suite/notify-privacy-guard.test.cjs` asserts every `scripts/lib/notify/*.cjs` references `redact`.

## Kill-switches (per channel)

A channel is a noop when **either**:

- env `GDD_DISABLE_SLACK=1` / `GDD_DISABLE_DISCORD=1`, or
- `.design/config.json` `notifications.<channel>.enabled === false`.

`gsd-health` surfaces each channel's enabled/disabled state (mirrors the Phase 30 + 35.1 kill-switch pattern).

## Outbound transport (no SDK, injectable, allowlisted)

`dispatch(event, { fetchImpl, config, env })` POSTs `{ <field>: body }` to the channel's webhook URL (Slack `text`, Discord `content`) via an **injectable `fetchImpl`** (defaults to global `fetch`) - **no `@slack/*` / `discord.js` dependency** (D-02). Tests inject a stub fetchImpl (no live network - D-08). The module is allowlisted under the Phase-33.5 outbound gate (`scripts/security/outbound-allowlist.json` → `scripts/lib/notify/**`) with a threat-model egress entry.

## Degrade-to-noop (never blocks the pipeline)

For each routed channel, a missing webhook URL → `skipped (not_configured)`; kill-switch on → `skipped (disabled)`; a POST failure → `error` (logged, not thrown). `dispatch` returns `Array<{ channel, status, reason? }>` and **never throws** - notification delivery is a best-effort side surface, never a pipeline gate (D-03).

## Out of scope (per Phase 35 split)

Linear/Jira ticket-sync (Phase 35.3); PR-inline (35.1); `pseudonymize.cjs` identity-masking (Phase 30 - wired when available; redact for secrets is the must here); Microsoft Teams; rich blocks/embeds (plain text in v1); scheduled digests (event-driven only).
