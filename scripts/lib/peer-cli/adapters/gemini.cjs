// scripts/lib/peer-cli/adapters/gemini.cjs
//
// Plan 27-04 — Per-peer adapter for the Gemini CLI.
//
// Gemini speaks ACP (line-delimited JSON-RPC over stdio); see
// scripts/lib/peer-cli/acp-client.cjs.
//
// Capability matrix (CONTEXT.md D-05):
//   * Gemini claims the `research` and `exploration` roles.
//
// Gemini's CLI does not expose first-class slash commands like
// `/research`; instead it adjusts behavior based on phrasing in the
// prompt. We surface that as a prose prefix per role — "deep research
// mode" + "exploratory mode" — so Gemini's planner picks the right
// posture without us reaching into Gemini-specific configuration.

'use strict';

const { createAcpClient } = require('../acp-client.cjs');

/** Roles this peer claims. */
const ROLES_CLAIMED = Object.freeze(['research', 'exploration']);

/**
 * Per-role prompt prefix. Prose-style prefixes (no slash) — Gemini
 * doesn't ship `/research` or `/exploration` slash commands as of the
 * `2025-06-18` ACP version we negotiate with.
 */
const ROLE_PREFIX = Object.freeze({
  research: 'Deep research mode. Investigate the following thoroughly: ',
  exploration: 'Exploratory mode. Survey options and trade-offs for: ',
});

function claims(role) {
  return ROLES_CLAIMED.includes(role);
}

/**
 * Drive one Gemini ACP `prompt` for the supplied role + text.
 *
 * @param {{command: string, args?: string[], cwd?: string, env?: object}} peer
 * @param {string} role  Must satisfy `claims(role)`.
 * @param {string} text
 * @param {{onNotification?: (n: object) => void}} [opts]
 * @returns {Promise<object>}  The ACP `prompt` result payload, returned
 *   unchanged from acp-client.
 */
async function dispatch(peer, role, text, opts) {
  if (!claims(role)) {
    throw new Error(`gemini adapter does not claim role: ${role}`);
  }
  if (typeof text !== 'string') {
    throw new TypeError('gemini adapter: text must be a string');
  }
  const onNotification = opts && typeof opts.onNotification === 'function'
    ? opts.onNotification
    : undefined;

  const client = createAcpClient({
    command: peer.command,
    args: peer.args,
    cwd: peer.cwd,
    env: peer.env,
  });
  try {
    await client.initialize({ protocolVersion: '2025-06-18' });
    const prompt = ROLE_PREFIX[role] + text;
    return await client.prompt(prompt, { onNotification });
  } finally {
    await client.close();
  }
}

module.exports = {
  name: 'gemini',
  protocol: 'acp',
  ROLES_CLAIMED,
  ROLE_PREFIX,
  claims,
  dispatch,
};
