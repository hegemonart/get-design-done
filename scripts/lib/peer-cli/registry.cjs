// scripts/lib/peer-cli/registry.cjs
//
// Plan 27-05 — central peer-CLI dispatch + per-peer health probe.
//
// ============================================================================
// WHAT THIS DOES
// ============================================================================
//
// The registry is the single entry-point the session-runner (Plan 27-06) calls
// when an agent's frontmatter says `delegate_to: <peer-role-id>`. It answers
// three questions in order:
//
//   1. Which peer-CLI claims this `(role, tier)`?            (capability matrix)
//   2. Is that peer actually usable on this host right now?  (health probe)
//   3. Can we run the call against it?                       (dispatch)
//
// On any "no" along that chain, the registry returns `null` rather than
// throwing — the caller (session-runner) treats null as "fall back to local
// Anthropic SDK". This is the **transparent-fallback** contract from CONTEXT
// D-07: peers are an optimization, never a requirement, and a missing or
// broken peer must never break the cycle.
//
// ============================================================================
// CAPABILITY MATRIX (CONTEXT D-05, locked)
// ============================================================================
//
//   codex   → execute               (ASP)
//   gemini  → research, exploration (ACP)
//   cursor  → debug, plan           (ACP)
//   copilot → review, research      (ACP)
//   qwen    → write                 (ACP)
//
// When two peers claim the same role (e.g. `research` is claimed by both
// gemini and copilot), `findPeerFor` picks the FIRST in alphabetical peer-name
// order — deterministic so reflectors can attribute regressions to a specific
// peer. Users override the order via `.design/config.json#peer_cli.enabled_peers`
// (a peer not in the allowlist is treated as absent).
//
// ============================================================================
// OPT-IN GATING (CONTEXT D-11)
// ============================================================================
//
// Even if a peer's binary is on disk, the registry refuses to dispatch unless
// the peer ID appears in `.design/config.json#peer_cli.enabled_peers` (an
// allowlist array). Default config: `enabled_peers: []` — empty, opt-in
// required. The install-time nudge (Plan 27-11) populates this on user
// confirmation.
//
// This protects the trust contract: the user pays for their peer-CLI
// subscriptions; gdd auto-routing to them without consent would be a privacy
// + cost surprise.
//
// ============================================================================
// DEFENSIVE ADAPTER LOADING
// ============================================================================
//
// Per-peer adapters live at `scripts/lib/peer-cli/adapters/<peer>.cjs` and
// are landed by Plan 27-04 (parallel with this plan). We load them via
// `try { require(...) } catch { return null }` so the registry remains
// functional even if an adapter goes missing or hasn't shipped yet — the
// peer is simply treated as absent. The same defensive load makes it safe
// for users to remove an adapter file to force-disable a single peer
// without editing the registry.
//
// ============================================================================
// HEALTH PROBE CONTRACT
// ============================================================================
//
// `healthProbe(peer)` returns `{ available: bool, reason?: string }`.
// It checks, in order:
//
//   (a) Is `peer` in the `enabled_peers` allowlist? (D-11 opt-in)
//   (b) Does the adapter module load? (defensive require)
//   (c) Does the adapter expose a `peerBinary` resolver, and does that path
//       exist on the filesystem? (basic install check)
//
// We do NOT spawn the binary with `--version` here — that adds 100-500ms
// latency per dispatch and is brittle on cold-start (Codex' app-server takes
// >1s to print its version on macOS). The broker layer (Plan 27-03) handles
// liveness via the long-lived session itself; if a binary is corrupt the
// broker connect fails and that surfaces as a peer-error which `dispatch`
// converts to null. If a future plan needs a deeper probe, it goes here.
//
// ============================================================================
// FALLBACK SEMANTICS
// ============================================================================
//
// `dispatch(role, tier, text, opts)` returns one of:
//
//   - null            → no peer claims this role / opt-out / health-probe
//                       failed / adapter threw / peer returned an error.
//                       Caller falls back to local.
//   - {result, peer}  → peer succeeded; result is whatever the adapter
//                       returned (Plan 27-04 enforces the structured shape).
//
// The registry never throws on peer-side breakage. It DOES throw on
// programmer error (bad arg types) — those are bugs in the caller, not the
// peer ecosystem.
//
// Phase 22 event emission (`peer_call_started` / `peer_call_complete` /
// `peer_call_failed`) is Plan 27-08's job; v1.27.0 registry just returns
// null and lets 27-08 wrap dispatch with the event tags.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ── Capability matrix (D-05, locked) ────────────────────────────────────────

/**
 * Per-peer claimed roles. Frozen so consumers can't mutate at runtime.
 * Adding a new peer: extend this map AND drop a `adapters/<peer>.cjs`
 * (Plan 27-10's `peer-cli-add` skill walks users through both steps).
 *
 * Each entry also carries the protocol the peer speaks; the adapter layer
 * uses that to pick acp-client vs asp-client. The registry surfaces it for
 * `peer-cli-capabilities.md` rendering and the `/gdd:peers` command.
 *
 * @type {Readonly<Record<string, {roles: readonly string[], protocol: 'acp'|'asp'}>>}
 */
const CAPABILITY_MATRIX = Object.freeze({
  codex:   Object.freeze({ roles: Object.freeze(['execute']),               protocol: 'asp' }),
  copilot: Object.freeze({ roles: Object.freeze(['review', 'research']),    protocol: 'acp' }),
  cursor:  Object.freeze({ roles: Object.freeze(['debug', 'plan']),         protocol: 'acp' }),
  gemini:  Object.freeze({ roles: Object.freeze(['research', 'exploration']), protocol: 'acp' }),
  qwen:    Object.freeze({ roles: Object.freeze(['write']),                 protocol: 'acp' }),
});

/**
 * All known peer IDs in deterministic alphabetical order. When two peers
 * claim the same role, this order decides which one `findPeerFor` returns
 * — alphabetical because it's stable across releases and gives reflectors
 * an attribution anchor that doesn't shift if we add/remove peers.
 */
const KNOWN_PEERS = Object.freeze(Object.keys(CAPABILITY_MATRIX).sort());

// ── Config loading (D-11 opt-in gating) ─────────────────────────────────────

/**
 * Read `<cwd>/.design/config.json` and extract the
 * `peer_cli.enabled_peers` allowlist. Returns an empty array on any
 * failure path (file missing, unparsable, wrong shape) — opt-in by default
 * means "absence == empty allowlist", not "absence == error".
 *
 * Test injection: pass `cwd` so unit tests can point at a fixture dir
 * without `process.chdir`.
 *
 * @param {string} [cwd]  defaults to `process.cwd()`
 * @returns {string[]} allowlisted peer IDs (lowercased, deduped); empty by default
 */
function readEnabledPeers(cwd) {
  const root = typeof cwd === 'string' && cwd.length > 0 ? cwd : process.cwd();
  const cfgPath = path.join(root, '.design', 'config.json');
  let raw;
  try {
    raw = fs.readFileSync(cfgPath, 'utf8');
  } catch {
    return []; // no config → no peers enabled
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return []; // malformed config is a user-fixable error, but registry must not crash
  }
  const peerCli = parsed && typeof parsed === 'object' ? parsed.peer_cli : null;
  const list = peerCli && Array.isArray(peerCli.enabled_peers)
    ? peerCli.enabled_peers
    : [];
  // Lowercase + dedupe + filter to known peers; an unknown ID in the
  // allowlist is silently dropped (a user typo shouldn't crash dispatch).
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const norm = item.toLowerCase();
    if (seen.has(norm)) continue;
    if (!Object.prototype.hasOwnProperty.call(CAPABILITY_MATRIX, norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

// ── Defensive adapter loading ───────────────────────────────────────────────

/**
 * Try to require the per-peer adapter module. Returns null on any failure
 * (module missing / require threw / module shape unrecognized). Per the
 * coordination note in the plan brief: this lets the registry function
 * even when Plan 27-04 hasn't landed yet, and lets users force-disable a
 * peer by deleting its adapter file.
 *
 * Test injection: `loadAdapterFn` lets unit tests stub the require with a
 * mock-adapter factory keyed by peer ID. Real callers omit it.
 *
 * @param {string} peer
 * @param {(peer: string) => unknown} [loadAdapterFn]
 * @returns {object | null}
 */
function loadAdapter(peer, loadAdapterFn) {
  if (typeof loadAdapterFn === 'function') {
    try {
      const mod = loadAdapterFn(peer);
      return mod && typeof mod === 'object' ? mod : null;
    } catch {
      return null;
    }
  }
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = require(`./adapters/${peer}.cjs`);
    return mod && typeof mod === 'object' ? mod : null;
  } catch {
    return null;
  }
}

// ── Health probe ────────────────────────────────────────────────────────────

/**
 * Determine whether the given peer is usable on this host.
 *
 * Checks (in order, short-circuiting on the first failure):
 *   1. peer ID is in the capability matrix (rejects typos)
 *   2. peer ID appears in `enabled_peers` allowlist (D-11 opt-in)
 *   3. adapter module loads
 *   4. adapter exposes `peerBinary()` (a function) AND that path exists
 *      on the filesystem
 *
 * We deliberately skip a `--version`-style spawn probe here. Cost: ~100-500ms
 * per dispatch on cold-start, brittleness on slow file-systems / corrupt
 * binaries. The broker layer (Plan 27-03) catches a corrupt binary as a
 * connect failure and surfaces it as a peer-error — which `dispatch`
 * converts to null. Documented choice: less probing here = faster dispatch
 * on the happy path, with the broker as the actual liveness gate.
 *
 * Returns `{ available: false, reason: '...' }` on any negative; the reason
 * is plain English suitable for `/gdd:peers` rendering or test assertions.
 *
 * @param {string} peer
 * @param {object} [opts]
 * @param {string} [opts.cwd]  override `process.cwd()` for config + path resolution
 * @param {string[]} [opts.enabledPeers]  override the config-derived allowlist
 * @param {(peer: string) => unknown} [opts.loadAdapter]  test injection
 * @param {(p: string) => boolean} [opts.fileExists]  test injection (defaults to fs.existsSync)
 * @returns {{available: true} | {available: false, reason: string}}
 */
function healthProbe(peer, opts) {
  const o = opts || {};
  if (typeof peer !== 'string' || peer.length === 0) {
    return { available: false, reason: 'invalid peer id (must be non-empty string)' };
  }
  const norm = peer.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CAPABILITY_MATRIX, norm)) {
    return { available: false, reason: `unknown peer "${peer}" (not in capability matrix)` };
  }
  const enabled = Array.isArray(o.enabledPeers) ? o.enabledPeers : readEnabledPeers(o.cwd);
  if (!enabled.includes(norm)) {
    return { available: false, reason: `peer "${norm}" not in .design/config.json#peer_cli.enabled_peers (opt-in required)` };
  }
  const adapter = loadAdapter(norm, o.loadAdapter);
  if (!adapter) {
    return { available: false, reason: `adapter module scripts/lib/peer-cli/adapters/${norm}.cjs missing or failed to load` };
  }
  if (typeof adapter.peerBinary !== 'function') {
    // Adapter is loaded but doesn't expose the resolver we need to verify
    // installation. Treat as "available but un-probable" for v1.27 — the
    // dispatch path will still try; if the binary is missing the protocol
    // client errors out and dispatch returns null. We return available:true
    // here so the user's `/gdd:peers` command shows the peer as usable
    // pending a real call. (Once Plan 27-11 ships `peerBinary` on every
    // adapter via runtimes.cjs, this branch becomes dead code.)
    return { available: true };
  }
  let binPath;
  try {
    binPath = adapter.peerBinary();
  } catch (err) {
    return { available: false, reason: `adapter peerBinary() threw: ${err && err.message ? err.message : 'unknown error'}` };
  }
  if (typeof binPath !== 'string' || binPath.length === 0) {
    // Adapter chose not to resolve a binary (e.g. peer not installed) —
    // honor that without re-checking the filesystem.
    return { available: false, reason: `peer "${norm}" binary not resolved by adapter (peer not installed?)` };
  }
  const exists = typeof o.fileExists === 'function'
    ? o.fileExists(binPath)
    : fs.existsSync(binPath);
  if (!exists) {
    return { available: false, reason: `peer "${norm}" binary missing at ${binPath}` };
  }
  return { available: true };
}

// ── findPeerFor ─────────────────────────────────────────────────────────────

/**
 * Resolve the best peer for a `(role, tier)` request.
 *
 * Tier is currently advisory — the capability matrix doesn't gate on tier
 * because peer-CLI subscriptions don't expose tier-by-tier pricing the way
 * Anthropic does. We accept the parameter so callers can pass through the
 * tier for telemetry (Plan 27-08 logs it on `peer_call_*` events) and so
 * future work can teach the matrix to reject e.g. opus-tier on a peer
 * that only supports a sonnet-class model.
 *
 * Algorithm:
 *   1. Filter peers whose capability matrix includes `role`.
 *   2. Walk those in alphabetical peer-name order (KNOWN_PEERS is already
 *      sorted) — the first one whose health probe says "available" wins.
 *   3. Return `{ peer, adapter, protocol, roles }` or null.
 *
 * @param {string} role          e.g. 'research', 'execute'
 * @param {string|null} [tier]   advisory; passed through opts to adapters
 * @param {object} [opts]        same shape as healthProbe opts
 * @returns {{peer: string, adapter: object, protocol: 'acp'|'asp', roles: readonly string[]} | null}
 */
function findPeerFor(role, tier, opts) {
  if (typeof role !== 'string' || role.length === 0) {
    throw new TypeError('findPeerFor: role must be a non-empty string');
  }
  // tier is advisory; we tolerate undefined/null/string. Other types are
  // a programmer error and worth surfacing.
  if (tier !== undefined && tier !== null && typeof tier !== 'string') {
    throw new TypeError('findPeerFor: tier must be a string, null, or undefined');
  }
  const o = opts || {};
  // Pre-resolve the allowlist once for this call so we don't re-read
  // .design/config.json per peer.
  const enabledPeers = Array.isArray(o.enabledPeers)
    ? o.enabledPeers
    : readEnabledPeers(o.cwd);

  for (const peer of KNOWN_PEERS) {
    const cap = CAPABILITY_MATRIX[peer];
    if (!cap.roles.includes(role)) continue;
    const probe = healthProbe(peer, {
      cwd: o.cwd,
      enabledPeers,
      loadAdapter: o.loadAdapter,
      fileExists: o.fileExists,
    });
    if (!probe.available) continue;
    const adapter = loadAdapter(peer, o.loadAdapter);
    if (!adapter) continue; // race: adapter vanished between probe and load
    return {
      peer,
      adapter,
      protocol: cap.protocol,
      roles: cap.roles,
    };
  }
  return null;
}

// ── dispatch ────────────────────────────────────────────────────────────────

/**
 * Run a delegated call. Returns:
 *
 *   - null                     → no peer or peer-side failure (caller falls back)
 *   - { result, peer, protocol } → peer succeeded; result is the adapter's payload
 *
 * Adapter contract (Plan 27-04 enforces): each adapter exposes a `dispatch`
 * function with signature `(role, tier, text, opts) -> Promise<result>`.
 * The registry awaits that promise and converts thrown errors into the
 * null-fallback path. Adapter is responsible for protocol framing,
 * slash-command translation, and broker lifecycle — registry just routes.
 *
 * @param {string} role
 * @param {string|null} tier
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.cwd]
 * @param {string[]} [opts.enabledPeers]
 * @param {(peer: string) => unknown} [opts.loadAdapter]
 * @param {(p: string) => boolean} [opts.fileExists]
 * @returns {Promise<{result: unknown, peer: string, protocol: 'acp'|'asp'} | null>}
 */
async function dispatch(role, tier, text, opts) {
  if (typeof text !== 'string') {
    throw new TypeError('dispatch: text must be a string');
  }
  const found = findPeerFor(role, tier === undefined ? null : tier, opts);
  if (!found) return null;
  const { peer, adapter, protocol } = found;
  if (typeof adapter.dispatch !== 'function') {
    // Adapter shape mismatch — treat as peer-side failure so the caller
    // falls back. Phase 22 events (Plan 27-08) will tag this as
    // `peer_call_failed` with reason="adapter_shape".
    return null;
  }
  try {
    const result = await adapter.dispatch(role, tier === undefined ? null : tier, text, opts || {});
    return { result, peer, protocol };
  } catch {
    // Per D-07: peer-error is a transparent fallback. We swallow the
    // error here and return null. Plan 27-08 wraps this with event
    // emission so the reflector still sees the failure signal.
    return null;
  }
}

// ── Introspection helpers (used by /gdd:peers in Plan 27-09) ────────────────

/**
 * Return a snapshot of the capability matrix as a plain (non-frozen) object
 * suitable for JSON serialization. Useful for `/gdd:peers` rendering and
 * for tests that want to assert on the matrix without touching the frozen
 * exports directly.
 *
 * @returns {Record<string, {roles: string[], protocol: 'acp'|'asp'}>}
 */
function describeCapabilities() {
  const out = {};
  for (const peer of KNOWN_PEERS) {
    const cap = CAPABILITY_MATRIX[peer];
    out[peer] = { roles: [...cap.roles], protocol: cap.protocol };
  }
  return out;
}

module.exports = {
  CAPABILITY_MATRIX,
  KNOWN_PEERS,
  readEnabledPeers,
  loadAdapter,
  healthProbe,
  findPeerFor,
  dispatch,
  describeCapabilities,
};
