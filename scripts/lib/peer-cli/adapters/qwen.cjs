// scripts/lib/peer-cli/adapters/qwen.cjs
//
// Plan 27-04 — Per-peer adapter for the Qwen CLI.
//
// Qwen speaks ACP (line-delimited JSON-RPC over stdio); see
// scripts/lib/peer-cli/acp-client.cjs.
//
// Capability matrix (CONTEXT.md D-05):
//   * Qwen claims the `write` role only.
//
// Qwen recognizes `/write` as a slash command for prose-generation
// flows; we use it as the role prefix.

'use strict';

const { createAcpClient } = require('../acp-client.cjs');

/** Roles this peer claims. */
const ROLES_CLAIMED = Object.freeze(['write']);

/** Per-role slash-command prefix. */
const ROLE_PREFIX = Object.freeze({
  write: '/write ',
});

function claims(role) {
  return ROLES_CLAIMED.includes(role);
}

/**
 * Drive one Qwen ACP `prompt` for the supplied role + text.
 *
 * @param {{command: string, args?: string[], cwd?: string, env?: object}} peer
 * @param {string} role
 * @param {string} text
 * @param {{onNotification?: (n: object) => void}} [opts]
 * @returns {Promise<object>}
 */
async function dispatch(peer, role, text, opts) {
  if (!claims(role)) {
    throw new Error(`qwen adapter does not claim role: ${role}`);
  }
  if (typeof text !== 'string') {
    throw new TypeError('qwen adapter: text must be a string');
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
  name: 'qwen',
  protocol: 'acp',
  ROLES_CLAIMED,
  ROLE_PREFIX,
  claims,
  dispatch,
};
