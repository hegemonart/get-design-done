// scripts/lib/peer-cli/adapters/cursor.cjs
//
// Plan 27-04 — Per-peer adapter for the Cursor CLI.
//
// Cursor speaks ACP (line-delimited JSON-RPC over stdio); see
// scripts/lib/peer-cli/acp-client.cjs.
//
// Capability matrix (CONTEXT.md D-05):
//   * Cursor claims the `debug` and `plan` roles.
//
// Cursor exposes first-class slash commands for both roles — `/debug`
// invokes its debugger-aware planner; `/plan` invokes its multi-step
// planning flow. Translation is therefore literal: prepend the slash
// command + space to the user's text.

'use strict';

const { createAcpClient } = require('../acp-client.cjs');

/** Roles this peer claims. */
const ROLES_CLAIMED = Object.freeze(['debug', 'plan']);

/**
 * Per-role slash-command prefix. Cursor parses `/debug` / `/plan` as
 * slash commands at the start of a prompt and routes accordingly.
 */
const ROLE_PREFIX = Object.freeze({
  debug: '/debug ',
  plan: '/plan ',
});

function claims(role) {
  return ROLES_CLAIMED.includes(role);
}

/**
 * Drive one Cursor ACP `prompt` for the supplied role + text.
 *
 * @param {{command: string, args?: string[], cwd?: string, env?: object}} peer
 * @param {string} role
 * @param {string} text
 * @param {{onNotification?: (n: object) => void}} [opts]
 * @returns {Promise<object>}
 */
async function dispatch(peer, role, text, opts) {
  if (!claims(role)) {
    throw new Error(`cursor adapter does not claim role: ${role}`);
  }
  if (typeof text !== 'string') {
    throw new TypeError('cursor adapter: text must be a string');
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
  name: 'cursor',
  protocol: 'acp',
  ROLES_CLAIMED,
  ROLE_PREFIX,
  claims,
  dispatch,
};
