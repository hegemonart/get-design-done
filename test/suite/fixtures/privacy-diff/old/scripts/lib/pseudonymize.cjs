'use strict';
// Fixture: OLD pseudonymize.cjs. Used by tests/privacy-diff.test.cjs.
// The privacy-diff scanner extracts rules via heuristic regex (top-level
// regex literals + `new RegExp(...)` lines). These three rules are unique
// to the OLD version; the NEW version differs.

const RULES = [
  /\/Users\/[a-z]+/gi,
  /\/home\/[a-z]+/gi,
  new RegExp('@[a-z]+\\.com'),
];

module.exports = { RULES };
