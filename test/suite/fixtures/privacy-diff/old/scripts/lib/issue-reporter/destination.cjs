'use strict';
// Fixture: OLD destination URL. Used by tests/privacy-diff.test.cjs.
// Lives OUTSIDE the network-isolation scanner's bounded tree, so the
// 'https' URL literal here is fine.

const DESTINATION_URL = 'https://github.com/old-owner/old-repo';

module.exports = { DESTINATION_URL };
