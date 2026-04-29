// scripts/lib/peer-cli/adapters/codex.cjs
//
// Plan 27-04 — Per-peer adapter for the Codex CLI.
//
// Codex is the only peer in our matrix that speaks ASP (App Server
// Protocol) rather than ACP. The ASP transport is thread-oriented:
// every turn lives inside a `threadId` that we obtain via `threadStart`
// before driving the conversation with `turn(threadId, text)`. See
// scripts/lib/peer-cli/asp-client.cjs for the protocol details.
//
// Capability matrix (CONTEXT.md D-05):
//   * Codex claims the `execute` role only.
//
// The slash-command translation layer is wafer-thin: when the registry
// dispatches role=`execute`, we prepend `/execute ` to the user's text
// so Codex routes the prompt through its execute pipeline. Roles the
// peer doesn't claim are rejected at `dispatch()` time — the registry
// (Plan 27-05) uses `claims(role)` to filter before reaching us, so
// hitting this branch indicates a registry bug or a misconfigured
// `delegate_to:` frontmatter.

'use strict';

const { createAspClient } = require('../asp-client.cjs');

/** Roles this peer claims. Roles outside this set are refused. */
const ROLES_CLAIMED = Object.freeze(['execute']);

/**
 * Per-role prompt prefix. Codex understands `/execute` natively, so the
 * prefix doubles as both a role marker and a Codex slash command.
 */
const ROLE_PREFIX = Object.freeze({
  execute: '/execute ',
});

/**
 * Cheap predicate the registry consults to decide whether to dispatch
 * a role to this peer. Pure / synchronous on purpose.
 */
function claims(role) {
  return ROLES_CLAIMED.includes(role);
}

/**
 * Drive a single Codex turn for the supplied role + text.
 *
 * @param {{command: string, args?: string[], cwd?: string, env?: object}} peer
 *   Spawn descriptor for the Codex binary. The registry resolves these
 *   from runtimes.cjs (Plan 27-11 ships `peerBinary`).
 * @param {string} role  Must satisfy `claims(role)`.
 * @param {string} text  User-supplied prompt; we prepend ROLE_PREFIX.
 * @param {{onNotification?: (n: object) => void, threadId?: string}} [opts]
 *   `onNotification` is forwarded to the ASP turn for streaming
 *   visibility. `threadId` lets the broker (Plan 27-03) resume a thread
 *   instead of starting a fresh one — v1.27.0 always passes undefined.
 * @returns {Promise<object>}  The ASP `turn()` result envelope —
 *   `{status, content, usage, threadId, turnId, notifications}` — passed
 *   through unchanged so the caller can branch on `status === 'error'`.
 */
async function dispatch(peer, role, text, opts) {
  if (!claims(role)) {
    throw new Error(`codex adapter does not claim role: ${role}`);
  }
  if (typeof text !== 'string') {
    throw new TypeError('codex adapter: text must be a string');
  }
  const onNotification = opts && typeof opts.onNotification === 'function'
    ? opts.onNotification
    : undefined;
  const explicitThreadId = opts && typeof opts.threadId === 'string' && opts.threadId.length > 0
    ? opts.threadId
    : null;

  const client = createAspClient({
    command: peer.command,
    args: peer.args,
    cwd: peer.cwd,
    env: peer.env,
  });
  try {
    let threadId = explicitThreadId;
    if (threadId === null) {
      const started = await client.threadStart({ service_name: 'gdd_peer_delegation' });
      threadId = started.threadId;
    }
    const prompt = ROLE_PREFIX[role] + text;
    return await client.turn(threadId, prompt, { onNotification });
  } finally {
    await client.close();
  }
}

module.exports = {
  name: 'codex',
  protocol: 'asp',
  ROLES_CLAIMED,
  ROLE_PREFIX,
  claims,
  dispatch,
};
