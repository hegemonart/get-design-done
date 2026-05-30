'use strict';
// Fixture: NEW pseudonymize.cjs. Two rules added relative to OLD, one removed.
//   - Kept    : /\/Users\/[a-z]+/gi  AND  new RegExp('@[a-z]+\\.com')
//   - Removed : /\/home\/[a-z]+/gi (the home-path heuristic)
//   - Added   : /\\\\Users\\\\[A-Za-z0-9]+/gi  (Windows path shape)
//   - Added   : new RegExp('hostname-[a-z0-9]+') (hostname heuristic)

const RULES = [
  /\/Users\/[a-z]+/gi,
  /\\\\Users\\\\[A-Za-z0-9]+/gi,
  new RegExp('@[a-z]+\\.com'),
  new RegExp('hostname-[a-z0-9]+'),
];

module.exports = { RULES };
