// tests/fixtures/peer-cli/mock-adapter.cjs
//
// Reusable mock-adapter factory for Plan 27-05's registry tests. The real
// per-peer adapters land in Plan 27-04 (parallel); the registry test file
// stays decoupled from that landing by injecting these fakes through the
// registry's `loadAdapter` injection hook.
//
// Each call to `makeMockAdapter(spec)` produces a fresh object with:
//   - peerBinary()        → returns the configured (fake) binary path
//   - dispatch(role, ...) → returns the configured payload (or throws)
//   - calls               → array of every dispatch invocation, for assertions
//
// Tests build a dispatch table like
//   { gemini: makeMockAdapter({...}), codex: makeMockAdapter({...}) }
// and pass `loadAdapter: (peer) => table[peer]` to the registry helpers.

'use strict';

/**
 * Build a mock peer adapter for registry tests.
 *
 * @param {object} [spec]
 * @param {string} [spec.binPath]       value returned by peerBinary(); default `/fake/bin/peer`
 * @param {boolean} [spec.binaryThrows] if true, peerBinary() throws
 * @param {boolean} [spec.binaryNull]   if true, peerBinary() returns null
 * @param {boolean} [spec.omitBinary]   if true, omit peerBinary entirely
 * @param {boolean} [spec.omitDispatch] if true, omit dispatch entirely
 * @param {(role: string, tier: string|null, text: string, opts: object) => any} [spec.dispatch]
 *   custom dispatch implementation; default echoes inputs
 * @param {boolean} [spec.dispatchThrows] if true, dispatch throws an Error
 * @returns {object}
 */
function makeMockAdapter(spec) {
  const s = spec || {};
  const binPath = typeof s.binPath === 'string' ? s.binPath : '/fake/bin/peer';
  const calls = [];
  const adapter = { calls };
  if (!s.omitBinary) {
    adapter.peerBinary = () => {
      if (s.binaryThrows) throw new Error('mock peerBinary explosion');
      if (s.binaryNull) return null;
      return binPath;
    };
  }
  if (!s.omitDispatch) {
    adapter.dispatch = async (role, tier, text, opts) => {
      calls.push({ role, tier, text, opts });
      if (s.dispatchThrows) throw new Error('mock dispatch explosion');
      if (typeof s.dispatch === 'function') return s.dispatch(role, tier, text, opts);
      return { echoed: { role, tier, text } };
    };
  }
  return adapter;
}

module.exports = { makeMockAdapter };
