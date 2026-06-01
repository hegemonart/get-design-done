'use strict';
// Phase 35.2 — notify dispatcher (Slack/Discord) behavior. Hermetic: an injected stub
// fetchImpl captures POSTs; NO live webhook / network (D-08). Asserts routing, the single
// redact chokepoint, per-channel kill-switch, and degrade-to-noop (never throws). `35.2-01:`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { dispatch, DEFAULT_ROUTING } = require(path.resolve(__dirname, '../../scripts/lib/notify/dispatch.cjs'));

function stub() {
  const calls = [];
  return { calls, fetchImpl: async (url, opts) => { calls.push({ url, body: opts.body }); return { ok: true, status: 200 }; } };
}
const SECRET = 'ghp_' + 'A'.repeat(36);

test('35.2-01: routes verify_fail to the configured channels', async () => {
  const { calls, fetchImpl } = stub();
  const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/x', DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/y' };
  const res = await dispatch({ type: 'verify_fail', summary: 'verify failed' }, { fetchImpl, env });
  assert.ok(res.find((r) => r.channel === 'slack' && r.status === 'sent'), 'slack sent');
  assert.ok(res.find((r) => r.channel === 'discord' && r.status === 'sent'), 'discord sent');
  assert.equal(calls.length, 2, 'two webhook POSTs');
  // payload field differs per channel
  assert.match(calls[0].body, /"text"/, 'slack payload uses text');
  assert.match(calls[1].body, /"content"/, 'discord payload uses content');
});

test('35.2-01: redacts every outbound body (the single chokepoint)', async () => {
  const { calls, fetchImpl } = stub();
  const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/x' };
  await dispatch({ type: 'ship', summary: 'shipped with leaked ' + SECRET, details: SECRET }, { fetchImpl, env });
  assert.ok(calls.length === 1, 'one POST (slack only)');
  assert.ok(!calls[0].body.includes(SECRET), 'the raw token must be redacted out of the POSTed body');
});

test('35.2-01: per-channel kill-switch (env + config) skips that channel', async () => {
  const { fetchImpl } = stub();
  const envKill = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/x', DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/y', GDD_DISABLE_SLACK: '1' };
  const r1 = await dispatch({ type: 'ship', summary: 's' }, { fetchImpl, env: envKill });
  assert.equal(r1.find((r) => r.channel === 'slack').status, 'skipped', 'env kill-switch skips slack');
  const cfgKill = await dispatch({ type: 'ship', summary: 's' }, { fetchImpl, env: { DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/y' }, config: { notifications: { discord: { enabled: false } } } });
  assert.equal(cfgKill.find((r) => r.channel === 'discord').status, 'skipped', 'config kill-switch skips discord');
});

test('35.2-01: degrade-to-noop — missing webhook URL, and a fetch failure never throws', async () => {
  const noUrl = await dispatch({ type: 'ship', summary: 's' }, { fetchImpl: stub().fetchImpl, env: {} });
  assert.ok(noUrl.every((r) => r.status === 'skipped'), 'no webhook URL → all skipped');
  // a throwing fetch must be caught and reported as error, not propagated
  const throwing = async () => { throw new Error('network down'); };
  const res = await dispatch({ type: 'verify_fail', summary: 's' }, { fetchImpl: throwing, env: { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/x' } });
  assert.equal(res.find((r) => r.channel === 'slack').status, 'error', 'fetch failure → error status (not thrown)');
});

test('35.2-01: unrouted event type sends nothing', async () => {
  const { calls, fetchImpl } = stub();
  const res = await dispatch({ type: 'totally_unknown', summary: 's' }, { fetchImpl, env: { SLACK_WEBHOOK_URL: 'x' } });
  assert.deepEqual(res, [], 'unknown event routes to nothing');
  assert.equal(calls.length, 0, 'no POST');
  assert.ok(DEFAULT_ROUTING.verify_fail && DEFAULT_ROUTING.audit_pass && DEFAULT_ROUTING.ship, 'default routing covers the 3 pipeline events');
});
