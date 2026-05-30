'use strict';
// Synthetic WHITELISTED fixture mirroring scripts/lib/issue-reporter/destination.cjs.
// Used by the network-isolation test to assert the whitelist exemption works
// (https:// here is allowed because the test passes this path in the whitelist
// arg). The same scan with an EMPTY whitelist must surface this file as a
// violation — that proves the exemption mechanism is genuinely conditional.
const DESTINATION_URL = 'https://github.com/example/example';
module.exports = { DESTINATION_URL };
