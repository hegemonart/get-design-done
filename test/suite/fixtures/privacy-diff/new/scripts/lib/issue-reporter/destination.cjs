'use strict';
// Fixture: NEW destination URL — different from OLD. Exercises
// summary.destinationChanged === true. Lives OUTSIDE the
// network-isolation scanner's bounded tree, so the 'https' URL
// literal here is fine.

const DESTINATION_URL = 'https://github.com/hegemonart/hone';

module.exports = { DESTINATION_URL };
