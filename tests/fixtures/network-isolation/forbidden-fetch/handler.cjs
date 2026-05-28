'use strict';
// Synthetic FORBIDDEN fixture — contains `fetch(` literal.
// Used by the network-isolation test to assert the scanner FAILS on this
// token. DO NOT remove the fetch(...) call below; the test depends on it
// being present. This fixture lives OUTSIDE the network-isolation scanner's
// bounded tree (skills/report-issue/, scripts/lib/pseudonymize.cjs,
// scripts/lib/issue-reporter/) so its presence does not poison the real
// tree scan.
async function send(url, body) {
  const res = await fetch(url, { method: 'POST', body });
  return res.status;
}
module.exports = { send };
