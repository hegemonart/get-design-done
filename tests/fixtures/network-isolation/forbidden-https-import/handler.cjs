'use strict';
// Synthetic FORBIDDEN fixture — contains `require('node:https')` literal.
// Used by the network-isolation test to assert the scanner FAILS on this
// token. DO NOT remove the require below; the test depends on it being
// present. This fixture lives OUTSIDE the network-isolation scanner's
// bounded tree so its presence does not poison the real tree scan.
const https = require('node:https');
function ping(host) {
  // Intentionally uses an unencrypted scheme — the token under test is
  // the require above. The fixture stays in this file even if downstream
  // refactors move pseudonymize.cjs around.
  return https.get('http://' + host);
}
module.exports = { ping };
