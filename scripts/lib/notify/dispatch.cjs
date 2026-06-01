'use strict';
/**
 * scripts/lib/notify/dispatch.cjs — Phase 35.2 notification backplane dispatcher.
 *
 * Routes a GDD pipeline event to Slack/Discord incoming webhooks. Every outbound body
 * is REDACTED (scripts/lib/redact.cjs) — the single egress chokepoint. Delivery is
 * degrade-to-noop: a missing webhook URL, a per-channel kill-switch, or a POST failure
 * skips that channel and NEVER throws into the pipeline (D-03/D-04).
 *
 * Outbound is via an INJECTABLE fetchImpl (defaults to global fetch) — no @slack/discord
 * SDK dependency (D-02); tests pass a stub fetchImpl (no live network — D-08). Allowlisted
 * under the Phase-33.5 outbound gate (scripts/security/outbound-allowlist.json).
 */

const { redact } = require('../redact.cjs');

// Default event → channel routing (overridable via .design/config.json#notifications.routing).
const DEFAULT_ROUTING = {
  verify_fail: ['slack', 'discord'], // critical
  audit_pass: ['slack', 'discord'], // digest
  ship: ['slack', 'discord'], // digest
};

const CHANNELS = {
  slack: { urlEnv: 'SLACK_WEBHOOK_URL', disableEnv: 'GDD_DISABLE_SLACK', field: 'text' },
  discord: { urlEnv: 'DISCORD_WEBHOOK_URL', disableEnv: 'GDD_DISABLE_DISCORD', field: 'content' },
};

function isDisabled(channel, config, env) {
  if (env[CHANNELS[channel].disableEnv] === '1') return true;
  const c = config && config.notifications && config.notifications[channel];
  return !!(c && c.enabled === false);
}

function channelsFor(eventType, config) {
  const routing = (config && config.notifications && config.notifications.routing) || DEFAULT_ROUTING;
  return routing[eventType] || [];
}

/**
 * dispatch(event, opts) → Promise<Array<{channel, status, reason?}>>
 *   event: { type: 'verify_fail'|'audit_pass'|'ship'|string, summary: string, details?: string }
 *   opts:  { fetchImpl?, config?, env? }   (all injectable for hermetic tests)
 * Never throws — every failure mode becomes a {status:'skipped'|'error'} entry.
 */
async function dispatch(event, opts = {}) {
  const env = opts.env || process.env;
  const config = opts.config || {};
  const fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const results = [];
  if (!event || !event.type) return results;

  // Single redaction chokepoint: the outbound body is always redacted.
  const raw = [event.summary, event.details].filter(Boolean).join('\n');
  const body = redact(String(raw));

  for (const channel of channelsFor(event.type, config)) {
    const meta = CHANNELS[channel];
    if (!meta) { results.push({ channel, status: 'skipped', reason: 'unknown-channel' }); continue; }
    if (isDisabled(channel, config, env)) { results.push({ channel, status: 'skipped', reason: 'disabled' }); continue; }
    const url = env[meta.urlEnv];
    if (!url) { results.push({ channel, status: 'skipped', reason: 'not_configured' }); continue; }
    if (!fetchImpl) { results.push({ channel, status: 'skipped', reason: 'no-fetch' }); continue; }
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [meta.field]: body }),
      });
      const ok = res && (res.ok === true || (typeof res.status === 'number' && res.status >= 200 && res.status < 300));
      results.push({ channel, status: ok ? 'sent' : 'error', reason: ok ? undefined : `http-${res && res.status}` });
    } catch (err) {
      // Degrade-to-noop: a delivery failure never propagates into the pipeline.
      results.push({ channel, status: 'error', reason: (err && err.message) || 'fetch-failed' });
    }
  }
  return results;
}

module.exports = { dispatch, DEFAULT_ROUTING, CHANNELS };
