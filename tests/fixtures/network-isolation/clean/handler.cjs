'use strict';
// Synthetic clean fixture. No network primitives. Used by the network-isolation
// test (tests/issue-reporter-network-isolation.test.cjs) to assert the scanner
// passes a clean tree (zero violations).
function handleError(err) {
  return { ok: false, message: String(err && err.message) };
}
module.exports = { handleError };
