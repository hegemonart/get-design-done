// scripts/lib/peer-cli/adapters/copilot.cjs
//
// Plan 27-04 — Per-peer adapter for the GitHub Copilot CLI.
//
// Copilot speaks ACP (line-delimited JSON-RPC over stdio); see
// scripts/lib/peer-cli/acp-client.cjs.
//
// Capability matrix (CONTEXT.md D-05):
//   * Copilot claims the `review` and `research` roles.
//
// Note: `research` overlaps with Gemini. The registry (Plan 27-05)
// arbitrates by per-peer health + posterior win-rate; this adapter
// just declares membership in both role pools.
//
// Copilot exposes `/review` and `/research` as slash commands.

'use strict';

const { createAcpClient } = require('../acp-client.cjs');

/** Roles this peer claims. */
const ROLES_CLAIMED = Object.freeze(['review', 'research']);

/**
 * Per-role slash-command prefix. Copilot recognizes `/review` and
 * `/research` natively at the start of a prompt.
 */
const ROLE_PREFIX = Object.freeze({
  review: '/review ',
  research: '/research ',
});

function claims(role) {
  return ROLES_CLAIMED.includes(role);
}

/**
 * Drive one Copilot ACP `prompt` for the supplied role + text.
 *
 * @param {{command: string, args?: string[], cwd?: string, env?: object}} peer
 * @param {string} role
 * @param {string} text
 * @param {{onNotification?: (n: object) => void}} [opts]
 * @returns {Promise<object>}
 */
async function dispatch(peer, role, text, opts) {
  if (!claims(role)) {
    throw new Error(`copilot adapter does not claim role: ${role}`);
  }
  if (typeof text !== 'string') {
    throw new TypeError('copilot adapter: text must be a string');
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
  name: 'copilot',
  protocol: 'acp',
  ROLES_CLAIMED,
  ROLE_PREFIX,
  claims,
  dispatch,
};
